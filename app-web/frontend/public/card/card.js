/* card.js — Coin Card live surface state machine
 *
 * States:
 *   BOOT                  → initializing; reading card ID from URL
 *   MANIFEST_LOADING      → fetching /registry/coincards/<id>.json
 *   VERIFIED              → manifest valid; input panel shown
 *   AMOUNT_READY          → valid amount entered; fee calculated
 *   TRANSFER_INTENT_READY → intent ready; chip --ready
 *   REVOKED               → manifest revoked; transfer blocked
 *   CONNECTING            → wallet connect in progress
 *   WRONG_NETWORK         → connected but on wrong chain
 *   SWITCHING_NETWORK     → chain switch in progress
 *   READY_TO_SEND         → review panel shown; awaiting chip tap
 *   APPROVE_PENDING       → USDC approval submitted
 *   EXECUTE_PENDING       → transferWithFee submitted
 *   CONFIRMED             → transfer confirmed on-chain
 *   TX_FAILED             → execution error (card visible; error panel shown)
 *   ERROR                 → manifest-level error (card hidden; frame error shown)
 *
 * Body panels (CSS data-state rules control visibility):
 *   #ccBodyInput     — amount entry
 *   #ccBodyReview    — confirm review
 *   #ccBodyExec      — execution in-progress
 *   #ccBodyConfirmed — settled
 *   #ccBodyError     — TX_FAILED / REVOKED
 *
 * Chip states (class on #ccChip):
 *   cc-card-chip--waiting  → not actionable; slow pulse
 *   cc-card-chip--ready    → actionable; solid border
 *   cc-card-chip--active   → wallet prompt open / on-chain
 *   cc-card-chip--done     → terminal
 *
 * Execution:
 *   All fund-moving writes route through window.IX_EXECUTION (js/ix-execution.js).
 *   No direct eth_sendTransaction outside IX_EXECUTION.
 *
 * PostMessage bridge (iframe → parent):
 *   { source:'implicitex-coincard', type:'CC_READY',          cardId, payload:{ recipient, chainId, token, owner } }
 *   { source:'implicitex-coincard', type:'CC_AMOUNT_CHANGED',  cardId, payload:{ amount, fee, total } }
 *   { source:'implicitex-coincard', type:'CC_INTENT_READY',    cardId, payload:{ intent } }
 *   { source:'implicitex-coincard', type:'CC_READY_TO_SEND',   cardId, payload:{ sender, intent } }
 *   { source:'implicitex-coincard', type:'CC_CONFIRMED',       cardId, payload:{ txHash, sender, intent, receipt } }
 *   { source:'implicitex-coincard', type:'CC_ERROR',           cardId, payload:{ message } }
 *
 * PostMessage bridge (parent → iframe):
 *   { source:'coincard-host', type:'CC_THEME', payload:{ theme:'dark'|'light' } }
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Constants
   * ---------------------------------------------------------------- */
  var CARD_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;

  var CHAIN_NAMES = {
    '137':   'Polygon',
    '80002': 'Polygon Amoy',
    '1':     'Ethereum',
  };

  /* Fee calculation delegated to window.IX_EXECUTION.calculateFee() */
  var CHAIN_MIN_USDC = { 137: 1,   80002: 1,   1: 1   };
  var CHAIN_MAX_USDC = { 137: 250, 80002: 250, 1: 250  };

  /* ----------------------------------------------------------------
   * State machine
   * ---------------------------------------------------------------- */
  var state = {
    current:             'BOOT',
    cardId:              null,
    manifest:            null,
    trustedParentOrigin: null,
    amount:              null,
    fee:                 null,
    total:               null,
    intent:              null,
    sender:              null,
    manifestVerificationState: 'VERIFICATION_UNAVAILABLE',
  };

  var frame = document.getElementById('ccFrame');
  var verification = window.IX_COIN_CARD_VERIFICATION || null;

  var SHELL_ACTIVE_STATES = {
    VERIFIED: true, AMOUNT_READY: true, TRANSFER_INTENT_READY: true,
    REVOKED: true, CONNECTING: true, WRONG_NETWORK: true,
    SWITCHING_NETWORK: true, READY_TO_SEND: true,
    APPROVE_PENDING: true, EXECUTE_PENDING: true,
    CONFIRMED: true, TX_FAILED: true,
  };

  function transition(next) {
    state.current = next;
    frame.dataset.state = next;
    frame.classList.toggle('is-active', !!SHELL_ACTIVE_STATES[next]);
  }

  /* ----------------------------------------------------------------
   * DOM helpers
   * ---------------------------------------------------------------- */
  function el(id) { return document.getElementById(id); }
  function setText(id, text) { var e = el(id); if (e) e.textContent = text; }

  /* ----------------------------------------------------------------
   * PostMessage bridge
   * ---------------------------------------------------------------- */
  function isAllowedParentOrigin(origin) {
    var allowed = (state.manifest && state.manifest.allowedParentOrigins) || [];
    return allowed.includes('*') || allowed.includes(origin);
  }

  function emit(type, payload) {
    if (!window.parent || window.parent === window) return;
    var allowed = (state.manifest && state.manifest.allowedParentOrigins) || [];
    var targetOrigin = state.trustedParentOrigin
      || (allowed.includes('*') ? '*' : '*');
    window.parent.postMessage({
      source:  'implicitex-coincard',
      type:    type,
      cardId:  state.cardId || null,
      payload: payload || {},
    }, targetOrigin);
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.source !== 'coincard-host') return;
    if (!state.manifest) return;
    if (!isAllowedParentOrigin(event.origin)) return;
    if (!state.trustedParentOrigin) state.trustedParentOrigin = event.origin;
  });

  /* ----------------------------------------------------------------
   * generateTraceId — opaque per-execution correlation identifier
   * ---------------------------------------------------------------- */
  function generateTraceId() {
    return 'cc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* ----------------------------------------------------------------
   * Chip — in-card execution trigger
   * ---------------------------------------------------------------- */
  function setChipState(modifier, disabled, ariaLabel) {
    var chip = el('ccChip');
    if (!chip) return;
    chip.className = 'cc-card-chip ' + modifier;
    chip.disabled  = !!disabled;
    if (ariaLabel != null) chip.setAttribute('aria-label', ariaLabel);
  }

  /* ----------------------------------------------------------------
   * Status pill
   * ---------------------------------------------------------------- */
  function setStatus(type, label) {
    var dot  = el('ccStatusDot');
    var pill = el('ccCardStatus');
    if (dot)  dot.className  = 'cc-card-status-dot cc-card-status-dot--' + type;
    if (pill) pill.className = 'cc-card-status cc-card-status--' + type;
    setText('ccStatusLabel', label);
  }

  /* ----------------------------------------------------------------
   * Trust population — runs once on manifest load.
   * Populates recipient identity across all body panels so each panel
   * shows the correct data when it becomes visible.
   * ---------------------------------------------------------------- */
  function populateRecipientFields(addr, name) {
    var truncAddr = addr.length >= 12
      ? addr.slice(0, 6) + '\u2026' + addr.slice(-4)
      : addr;

    var nameIds  = ['ccCardName', 'ccReviewName', 'ccExecName', 'ccConfirmedName', 'ccErrorName'];
    var recipIds = ['ccCardRecipient', 'ccReviewRecipient', 'ccExecRecipient', 'ccConfirmedRecipient', 'ccErrorRecipient'];

    for (var i = 0; i < nameIds.length; i++) setText(nameIds[i], name || '');
    for (var j = 0; j < recipIds.length; j++) {
      var e = el(recipIds[j]);
      if (e) { e.textContent = truncAddr; e.title = addr; }
    }
  }

  function renderTrust(manifest) {
    var addr    = manifest.recipient || '';
    var name    = manifest.displayName || '';
    var token   = (manifest.token || 'USDC').toUpperCase();
    var chainId = String(manifest.chainId || '');
    var network = manifest.chainName || CHAIN_NAMES[chainId] || ('Chain ' + chainId);
    var bps     = manifest.feeBps != null ? manifest.feeBps : 100;
    var pctStr  = 'Fee ' + (bps / 100).toFixed(1) + '%';

    populateRecipientFields(addr, name);
    setText('ccCardNetwork', network + ' \u00b7 ' + token);
    setText('ccAmountToken', token);
    setText('ccFeePctLabel', pctStr);
    setText('ccReviewFeePct', pctStr);
    setStatus('verified', 'Verified');
  }

  function renderRevoked(manifest) {
    var addr = manifest.recipient || '';
    var name = manifest.displayName || '';
    populateRecipientFields(addr, name);
    setText('ccErrorStateLabel', 'Revoked');
    setText('ccCardError', 'This Coin Card has been revoked. Do not use it to initiate a transfer.');
    setStatus('revoked', 'Revoked');
  }

  /* ----------------------------------------------------------------
   * Amount handling
   * ---------------------------------------------------------------- */
  function applyAmount(amount, chainId) {
    var feeBps    = (state.manifest && state.manifest.feeBps != null)
                     ? state.manifest.feeBps : null;
    var rawAmount = window.IX_EXECUTION.toRawUsdc(amount);
    var feeResult = window.IX_EXECUTION.calculateFee(rawAmount, chainId, feeBps);
    var fee       = Number(feeResult.fee)   / 1e6;
    var total     = Number(feeResult.total) / 1e6;
    var min       = CHAIN_MIN_USDC[chainId] || 1;
    var max       = CHAIN_MAX_USDC[chainId] || 250;

    if (amount < min || amount > max) {
      clearFee();
      transition('VERIFIED');
      return;
    }

    state.amount = amount;
    state.fee    = fee;
    state.total  = total;

    var token = (state.manifest && state.manifest.token || 'USDC').toUpperCase();
    setText('ccFeeValue',   fee.toFixed(2)   + ' ' + token);
    setText('ccTotalValue', total.toFixed(2) + ' ' + token);

    transition('AMOUNT_READY');
    buildIntent();
    emit('CC_AMOUNT_CHANGED', { amount: amount, fee: fee, total: total });
  }

  function clearFee() {
    state.amount = null;
    state.fee    = null;
    state.total  = null;
    state.intent = null;
    setText('ccFeeValue',   '\u2014');
    setText('ccTotalValue', '\u2014');
    setChipState('cc-card-chip--waiting', true, 'Enter amount to continue');
  }

  /* ----------------------------------------------------------------
   * Intent construction
   * ---------------------------------------------------------------- */
  function buildIntent() {
    if (!state.manifest || state.amount == null) return;
    var m = state.manifest;
    state.intent = {
      cardId:    m.cardId,
      recipient: m.recipient,
      amount:    state.amount,
      fee:       state.fee,
      total:     state.total,
      chainId:   m.chainId,
      token:     m.token,
      owner:     m.owner || null,
    };
    transition('TRANSFER_INTENT_READY');
    setChipState('cc-card-chip--ready', false, 'Connect wallet to send USDC');
    emit('CC_INTENT_READY', { intent: state.intent });
  }

  /* ----------------------------------------------------------------
   * Amount surface setup
   * ---------------------------------------------------------------- */
  function initAmountSurface(manifest) {
    var mode    = manifest.amountMode || 'sender_input';
    var chainId = manifest.chainId;
    var token   = (manifest.token || 'USDC').toUpperCase();
    setText('ccAmountToken', token);

    if (mode === 'locked' && manifest.lockedAmount != null) {
      /* locked: auto-apply; hide the input field */
      var field = el('ccAmountField');
      if (field) field.style.display = 'none';
      applyAmount(manifest.lockedAmount, chainId);
    } else {
      /* sender_input / suggested: user enters amount */
      var input = el('ccAmountInput');
      if (input) {
        input.addEventListener('input', function () {
          var raw = parseFloat(input.value);
          if (!isFinite(raw) || raw <= 0) {
            clearFee();
            transition('VERIFIED');
            return;
          }
          applyAmount(raw, chainId);
        });
      }
    }
  }

  /* ----------------------------------------------------------------
   * Wallet connect + network switch
   * ---------------------------------------------------------------- */
  function connectWallet() {
    if (!window.IX_EXECUTION) { renderError('Execution module unavailable'); return; }
    if (!verification || !verification.canExecuteTransfer(state.manifestVerificationState)) {
      renderTxError('Coin Card verification unavailable. Transfer disabled.');
      return;
    }

    transition('CONNECTING');
    setText('ccExecLabel', 'Connecting wallet\u2026');
    if (state.intent) setText('ccExecAmount', state.intent.amount.toFixed(2));
    setChipState('cc-card-chip--active', true, 'Connecting wallet\u2026');
    setStatus('pending', 'Connecting');

    window.IX_EXECUTION.executeTransfer({
      action: 'prepare',
      chainId: state.manifest && state.manifest.chainId,
    })
      .then(function (result) {
        if (result.status === 'wallet-missing') {
          renderError('No wallet detected', 'Install MetaMask to send USDC.');
          return;
        }
        if (result.status === 'wallet-rejected') {
          transition('TRANSFER_INTENT_READY');
          setText('ccTxLabel', 'Send USDC');
          setStatus('verified', 'Verified');
          setChipState('cc-card-chip--ready', false, 'Connect wallet to send USDC');
          return;
        }
        if (result.status === 'failed') {
          renderError('Wallet error', result.error && result.error.message);
          return;
        }

        if (result.sender) {
          state.sender = result.sender;
          /* Self-send detection */
          var warn = el('ccSelfSendWarn');
          if (warn && state.manifest) {
            warn.classList.toggle('is-active',
              result.sender.toLowerCase() === state.manifest.recipient.toLowerCase());
          }
        }

        if (result.status === 'wrong-network') {
          transition('WRONG_NETWORK');
          setText('ccTxLabel', 'Wrong Network');
          setStatus('pending', 'Wrong Network');
          setChipState('cc-card-chip--ready', false,
            'Switch to ' + (result.chain ? result.chain.name : 'correct network'));
          return;
        }
        if (result.status === 'ready-to-send') {
          showConfirmPanel();
          return;
        }
        renderError('Wallet connection failed');
      })
      .catch(function (err) {
        renderError('Wallet error', err && err.message);
      });
  }

  function switchNetwork() {
    if (!window.IX_EXECUTION) return;
    if (!verification || !verification.canExecuteTransfer(state.manifestVerificationState)) {
      renderTxError('Coin Card verification unavailable. Transfer disabled.');
      return;
    }
    var manifestChainId = state.manifest && state.manifest.chainId;

    transition('SWITCHING_NETWORK');
    setText('ccExecLabel', 'Switching network\u2026');
    if (state.intent) setText('ccExecAmount', state.intent.amount.toFixed(2));
    setChipState('cc-card-chip--active', true, 'Switching network\u2026');
    setStatus('pending', 'Switching');

    window.IX_EXECUTION.executeTransfer({
      action: 'switch-network',
      chainId: manifestChainId,
    })
      .then(function (result) {
        if (result.status === 'ready-to-send') {
          showConfirmPanel();
          return;
        }
        if (result.status === 'wrong-network') {
          transition('WRONG_NETWORK');
          setText('ccTxLabel', 'Wrong Network');
          setStatus('pending', 'Wrong Network');
          setChipState('cc-card-chip--ready', false,
            'Switch to ' + (result.chain ? result.chain.name : 'correct network'));
          return;
        }
        if (result.status === 'failed') {
          renderError('Network switch failed', result.error && result.error.message);
          return;
        }
        renderError('Network switch failed');
      })
      .catch(function (err) {
        renderError('Network switch failed', err && err.message);
      });
  }

  /* ----------------------------------------------------------------
   * Review panel
   * ---------------------------------------------------------------- */
  function showConfirmPanel() {
    if (!state.intent || !state.sender || !state.manifest) {
      transition('TRANSFER_INTENT_READY');
      setText('ccTxLabel', 'Send USDC');
      setStatus('verified', 'Verified');
      setChipState('cc-card-chip--ready', false, 'Connect wallet to send USDC');
      return;
    }
    var intent = state.intent;
    var token  = (state.manifest.token || 'USDC').toUpperCase();
    var bps    = state.manifest.feeBps != null ? state.manifest.feeBps : 100;

    setText('ccReviewAmount',  intent.amount.toFixed(2));
    setText('ccReviewFee',     intent.fee.toFixed(2)   + ' ' + token);
    setText('ccReviewTotal',   intent.total.toFixed(2) + ' ' + token);
    setText('ccReviewFeePct',  'Fee ' + (bps / 100).toFixed(1) + '%');

    setStatus('verified', 'Verified');
    transition('READY_TO_SEND');
    setChipState('cc-card-chip--ready', false, 'Confirm transfer in wallet');
    emit('CC_READY_TO_SEND', { sender: state.sender, intent: intent });
  }

  /* ----------------------------------------------------------------
   * Execution — all writes through window.IX_EXECUTION
   * ---------------------------------------------------------------- */
  function startExecution() {
    if (!state.intent || !state.sender || !state.manifest || !window.IX_EXECUTION) return;
    if (!verification || !verification.canExecuteTransfer(state.manifestVerificationState)) {
      renderTxError('Coin Card verification unavailable. Transfer disabled.');
      return;
    }
    var intent  = state.intent;
    var chainId = state.manifest.chainId;
    var token     = (state.manifest.token || 'USDC').toUpperCase();

    /* Prime exec panel with amount (name+recipient already populated by renderTrust) */
    setText('ccExecAmount', intent.amount.toFixed(2));

    transition('APPROVE_PENDING');
    setChipState('cc-card-chip--active', true, 'Confirm USDC approval in wallet\u2026');
    setText('ccExecLabel', 'Confirm USDC approval in wallet\u2026');
    setStatus('pending', 'Pending');

    window.IX_EXECUTION.executeTransfer({
      action:    'execute',
      chainId:   chainId,
      sender:    state.sender,
      recipient: intent.recipient,
      amount:    intent.amount,
      fee:       intent.fee,
      total:     intent.total,
      token:     token,
      source:    'coincard',
      traceId:   generateTraceId(),
    }, {
      onApprovalSubmitted: function () {
        setText('ccExecLabel', 'Approval submitted. Awaiting confirmation\u2026');
      },
      onTransferRequested: function () {
        transition('EXECUTE_PENDING');
        setChipState('cc-card-chip--active', true, 'Confirm transfer in wallet\u2026');
        setText('ccExecLabel', 'Confirm transfer in wallet\u2026');
      },
      onTransferSubmitted: function () {
        setText('ccExecLabel', 'Transfer submitted. Awaiting on-chain confirmation\u2026');
        setStatus('submitted', 'Confirming');
      },
    })
      .then(function (result) {
        if (result.status === 'confirmed') {
          /* Populate confirmed panel from normalized receipt */
          var receipt = result.receipt;
          setText('ccConfirmedAmount', intent.amount.toFixed(2));
          var txHashEl = el('ccTxHash');
          if (txHashEl && receipt) {
            txHashEl.href        = receipt.explorerUrl || '#';
            txHashEl.textContent = receipt.txHash.slice(0, 10) + '\u2026' + receipt.txHash.slice(-6);
            txHashEl.title       = receipt.txHash;
          }
          setStatus('confirmed', 'Confirmed');
          transition('CONFIRMED');
          setChipState('cc-card-chip--done', true, 'Transfer confirmed');
          emit('CC_CONFIRMED', { txHash: receipt && receipt.txHash, sender: state.sender, intent: intent, receipt: receipt });
          return;
        }
        if (result.status === 'wallet-rejected') {
          /* User declined — return to review panel to retry */
          transition('READY_TO_SEND');
          setStatus('verified', 'Verified');
          setChipState('cc-card-chip--ready', false, 'Confirm transfer in wallet');
          return;
        }
        if (result.status === 'wallet-busy') {
          /* Wallet has a pending request — not a failure; return to review */
          transition('READY_TO_SEND');
          setStatus('verified', 'Verified');
          setChipState('cc-card-chip--ready', false, 'Wallet busy — retry when ready');
          return;
        }
        if (result.status === 'outcome-unknown') {
          /* Transfer may have been broadcast — do not claim failure */
          var explorerUrl = result.error && result.error.explorerUrl;
          var unknownMsg  = explorerUrl
            ? 'Transfer submitted. Check the explorer to confirm.'
            : 'Transfer status unknown. Check the explorer before retrying.';
          var txHashLink = el('ccTxHash');
          if (txHashLink && explorerUrl) {
            txHashLink.href        = explorerUrl;
            txHashLink.textContent = 'View on explorer';
            txHashLink.title       = result.error && result.error.txHash || '';
          }
          renderTxError(unknownMsg);
          return;
        }
        if (result.status === 'failed') {
          var msg = result.error && result.error.message || 'Transfer failed';
          renderTxError(msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg);
          return;
        }
        renderTxError('Unexpected execution result');
      })
      .catch(function (err) {
        var msg = err && err.message || 'Transfer failed';
        renderTxError(msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg);
      });
  }

  /* ----------------------------------------------------------------
   * Chip click dispatcher
   * ---------------------------------------------------------------- */
  function handleChipClick() {
    switch (state.current) {
      case 'TRANSFER_INTENT_READY': connectWallet();   break;
      case 'WRONG_NETWORK':         switchNetwork();   break;
      case 'READY_TO_SEND':         startExecution();  break;
      default: break;
    }
  }

  /* ----------------------------------------------------------------
   * Manifest validation
   * ---------------------------------------------------------------- */
  function validateManifest(manifest, cardId) {
    if (manifest.schema !== 'implicitex.coincard.v1') return 'schema-mismatch';
    if (manifest.cardId !== cardId)                   return 'card-id-mismatch';
    if (!manifest.recipient || !manifest.chainId || !manifest.token) return 'missing-required-fields';
    if (manifest.owner && (typeof manifest.owner !== 'object' || !manifest.owner.name)) return 'owner-malformed';
    return null;
  }

  /* ----------------------------------------------------------------
   * Error rendering
   * ---------------------------------------------------------------- */

  /* Manifest-level error — card hidden; frame error surface shown */
  function renderError(message, sub) {
    setText('ccErrorMessage', message || 'Registry error');
    setText('ccErrorSub', sub || '');
    transition('ERROR');
    emit('CC_ERROR', { message: message });
  }

  /* Execution error — card remains visible; error body panel shown */
  function renderTxError(message) {
    setText('ccErrorStateLabel', 'Transfer Failed');
    setText('ccCardError', message || 'Transfer failed');
    setStatus('failed', 'Failed');
    transition('TX_FAILED');
    emit('CC_ERROR', { message: message });
  }

  /* ----------------------------------------------------------------
   * Manifest fetch
   * ---------------------------------------------------------------- */
  function loadManifest(cardId) {
    transition('MANIFEST_LOADING');
    var pointer = verification && verification.readManifestPointer(frame);
    if (!pointer || pointer.state === 'VERIFICATION_UNAVAILABLE') {
      state.manifestVerificationState = 'VERIFICATION_UNAVAILABLE';
      renderError('Verification unavailable', pointer && pointer.error);
      return;
    }
    var url = '/registry/coincards/' + encodeURIComponent(cardId) + '.json';

    fetch(url)
      .then(function (response) {
        if (response.status === 404) return { _notFound: true };
        if (!response.ok) throw new Error('fetch-error-' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        if (manifest._notFound) {
          renderError('No record found', cardId);
          return;
        }

        if (manifest.status === 'revoked') {
          state.manifest = manifest;
          state.manifestVerificationState = 'CARD_REVOKED';
          renderRevoked(manifest);
          transition('REVOKED');
          emit('CC_ERROR', { message: 'revoked' });
          return;
        }

        var err = validateManifest(manifest, cardId);
        if (err) {
          renderError('Invalid manifest', err);
          return;
        }

        if (manifest.status !== 'active') {
          renderError('Card not active', manifest.status);
          return;
        }

        state.manifest = manifest;
        state.manifestVerificationState = 'VERIFIED';
        renderTrust(manifest);
        initAmountSurface(manifest);
        transition('VERIFIED');
        setChipState('cc-card-chip--waiting', true, 'Enter amount to continue');

        emit('CC_READY', {
          recipient: manifest.recipient,
          chainId:   manifest.chainId,
          token:     manifest.token,
          owner:     manifest.owner || null,
        });
      })
      .catch(function (err) {
        renderError('Registry unavailable', err && err.message);
      });
  }

  /* ----------------------------------------------------------------
   * Init — read card ID from URL path
   *   URL: https://implicitex.com/card/antoine
   *   pathname.split('/') → ['', 'card', 'antoine']
   * ---------------------------------------------------------------- */
  function init() {
    var chip = el('ccChip');
    if (chip) chip.addEventListener('click', handleChipClick);

    var parts  = window.location.pathname.split('/').filter(Boolean);
    var cardId = (parts[1] || '').trim();

    state.cardId = cardId;

    if (!cardId) {
      renderError('No card specified');
      return;
    }

    if (!CARD_ID_RE.test(cardId)) {
      renderError('Invalid card ID', cardId);
      return;
    }

    loadManifest(cardId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
