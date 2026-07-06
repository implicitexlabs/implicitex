/* card.js — Coin Card iframe state machine
 *
 * States:
 *   BOOT                  → initializing, reading card ID from URL path
 *   MANIFEST_LOADING      → fetching /registry/coincards/<id>.json
 *   VERIFIED              → manifest valid and active; trust rows populated
 *   AMOUNT_READY          → valid amount entered; fee calculated
 *   TRANSFER_INTENT_READY → intent object constructed; send button active
 *   REVOKED               → manifest status === 'revoked'; transfer blocked
 *   CONNECTING            → wallet connect in progress (eth_requestAccounts)
 *   WRONG_NETWORK         → wallet connected but on wrong chain
 *   SWITCHING_NETWORK     → chain switch in progress
 *   READY_TO_SEND         → confirm panel shown; awaiting user confirmation
 *   APPROVE_PENDING       → USDC approval submitted, waiting for receipt
 *   EXECUTE_PENDING       → transferWithFee submitted, waiting for receipt
 *   CONFIRMED             → transfer on-chain confirmed; explorer link shown
 *   ERROR                 → any unrecoverable failure
 *
 * Note: HANDOFF state removed. The card now executes the transfer in-card
 * via window.IX_EXECUTE (js/ix-execute.js). The Transfer Portal is surfaced
 * as an "Advanced verification →" link in the CONFIRMED state only.
 *
 * Trust model:
 *   Registry manifest is evidence. URL path is transport. The card never
 *   becomes a payment surface until the destination is verified from the registry.
 *
 * PostMessage bridge (iframe → parent):
 *   { source:'implicitex-coincard', type:'CC_READY',         cardId, payload:{ recipient, chainId, token, owner } }
 *   { source:'implicitex-coincard', type:'CC_AMOUNT_CHANGED', cardId, payload:{ amount, fee, total } }
 *   { source:'implicitex-coincard', type:'CC_INTENT_READY',   cardId, payload:{ intent } }
 *   { source:'implicitex-coincard', type:'CC_READY_TO_SEND',  cardId, payload:{ sender, intent } }
 *   { source:'implicitex-coincard', type:'CC_CONFIRMED',      cardId, payload:{ txHash, sender, intent } }
 *   { source:'implicitex-coincard', type:'CC_ERROR',          cardId, payload:{ message } }
 *
 * PostMessage bridge (parent → iframe):
 *   { source:'coincard-host', type:'CC_THEME', payload:{ theme:'dark'|'light' } }
 *
 * Origin security:
 *   Inbound: messages dropped before manifest loads; validated against
 *            manifest.allowedParentOrigins after load.
 *   Outbound: targeted to state.trustedParentOrigin once established.
 *             Falls back to '*' only when allowedParentOrigins includes '*'.
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

  /* Fee config inline — not imported from chains.js (isolated iframe).
   * manifest.feeBps overrides chain default when present. */
  var CHAIN_FEE_BPS  = { 137: 100, 80002: 100, 1: 30 };
  var CHAIN_MIN_USDC = { 137: 1,   80002: 1,   1: 1  };
  var CHAIN_MAX_USDC = { 137: 250, 80002: 250, 1: 250 };

  /* ----------------------------------------------------------------
   * State machine
   * ---------------------------------------------------------------- */
  var state = {
    current:             'BOOT',
    cardId:              null,
    manifest:            null,
    trustedParentOrigin: null,   /* set after first valid host message */
    amount:              null,
    fee:                 null,
    total:               null,
    intent:              null,
    sender:              null,
  };

  var frame = document.getElementById('ccFrame');

  /* States where the card shell is active (visible).
   * BOOT, MANIFEST_LOADING, and ERROR do not show the shell.
   * Adding/removing 'is-active' on the frame is the single
   * mechanism that controls shell visibility — no CSS state
   * rules are needed for the shell or its structural children. */
  var SHELL_ACTIVE_STATES = {
    VERIFIED: true, AMOUNT_READY: true, TRANSFER_INTENT_READY: true,
    REVOKED: true, CONNECTING: true, WRONG_NETWORK: true,
    SWITCHING_NETWORK: true, READY_TO_SEND: true,
    APPROVE_PENDING: true, EXECUTE_PENDING: true, CONFIRMED: true,
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
  function setAttr(id, attr, val) { var e = el(id); if (e) e[attr] = val; }

  /* ----------------------------------------------------------------
   * PostMessage bridge
   * ---------------------------------------------------------------- */

  function isAllowedParentOrigin(origin) {
    var allowed = (state.manifest && state.manifest.allowedParentOrigins) || [];
    return allowed.includes('*') || allowed.includes(origin);
  }

  function emit(type, payload) {
    if (!window.parent || window.parent === window) return;

    /* Target origin selection:
     *   1. trustedParentOrigin — set once a valid host message arrives.
     *   2. '*' — only when manifest.allowedParentOrigins includes '*'.
     * Initial CC_READY fires before any host message; for open-distribution
     * cards ('*') it uses '*'. For locked-origin cards the first emit goes
     * to '*' and subsequent ones use trustedParentOrigin once established. */
    var allowed      = (state.manifest && state.manifest.allowedParentOrigins) || [];
    var targetOrigin = state.trustedParentOrigin
      || (allowed.includes('*') ? '*' : '*');   /* tighten to trustedParentOrigin after handshake */

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

    /* Drop inbound messages before manifest is loaded —
     * no allowedParentOrigins to validate against. */
    if (!state.manifest) return;

    if (!isAllowedParentOrigin(event.origin)) return;

    /* Record the first validated origin for outbound targeting. */
    if (!state.trustedParentOrigin) {
      state.trustedParentOrigin = event.origin;
    }

    /* Reserved for host → iframe messages (theme, context, etc.) */
  });

  /* ----------------------------------------------------------------
   * Trust row rendering
   * ---------------------------------------------------------------- */
  function renderTrust(manifest) {
    /* Owner */
    var ownerText = manifest.owner && manifest.owner.name
      ? (manifest.owner.domain
          ? manifest.owner.name + ' \u00b7 ' + manifest.owner.domain
          : manifest.owner.name)
      : '\u2014';
    setText('ccOwner', ownerText);

    /* Card holder — display name, if present */
    if (manifest.displayName) {
      setText('ccCardHolder', manifest.displayName);
      var holderRow = el('ccCardHolderRow');
      if (holderRow) holderRow.classList.add('is-populated');

      var firstName = manifest.displayName.split(' ')[0];

      /* Personalize gift text */
      var giftText = el('ccGiftText');
      if (giftText) {
        giftText.textContent = 'This Coin Card was created so support can reach '
          + manifest.displayName + ' directly.';
      }

      /* Personalize reveal button */
      var revealBtn = el('ccRevealBtn');
      if (revealBtn) {
        revealBtn.textContent = 'Send USDC to ' + firstName + ' \u2192';
      }
    }

    /* Recipient — truncated with full address in title */
    var addr = manifest.recipient || '';
    var recipEl = el('ccRecipient');
    if (recipEl) {
      recipEl.textContent = addr.length >= 12
        ? addr.slice(0, 6) + '\u2026' + addr.slice(-4)
        : addr;
      recipEl.title = addr;
    }

    /* Network · Token */
    var chainId  = String(manifest.chainId || '');
    var network  = manifest.chainName || CHAIN_NAMES[chainId] || ('Chain ' + chainId);
    var token    = (manifest.token || '').toUpperCase();
    setText('ccNetwork', network + (token ? ' \u00b7 ' + token : ''));

    /* Credential (subdued) */
    if (manifest.displayCredential) {
      setText('ccCredential', manifest.displayCredential);
    }

    /* Status dot + label */
    var dot = el('ccStatusDot');
    if (dot) {
      dot.className = 'cc-status-dot cc-status-dot--verified';
    }
    setText('ccStatusLabel', 'Verified');
  }

  function renderRevoked(manifest) {
    var dot = el('ccStatusDot');
    if (dot) dot.className = 'cc-status-dot cc-status-dot--revoked';
    setText('ccStatusLabel', 'Revoked');
    if (manifest.displayCredential) setText('ccCredential', manifest.displayCredential);
  }

  /* ----------------------------------------------------------------
   * Amount mode setup
   * ---------------------------------------------------------------- */
  function initAmountSurface(manifest) {
    var mode    = manifest.amountMode || 'sender_input';
    var chainId = manifest.chainId;
    var token   = (manifest.token || 'USDC').toUpperCase();

    setText('ccAmountToken', token);

    if (mode === 'locked' && manifest.lockedAmount != null) {
      /* locked: fixed amount — hide input, show read-only value, auto-apply */
      el('ccAmountInputRow').style.display = 'none';
      var lockedRow = el('ccLockedAmountRow');
      lockedRow.style.display = 'flex';
      setText('ccLockedAmount', manifest.lockedAmount.toFixed(2) + ' ' + token);
      applyAmount(manifest.lockedAmount, chainId);
    } else {
      /* sender_input / suggested: sender enters or adjusts the amount.
       * 'suggested' V1 behaviour is identical to 'sender_input'; a future
       * manifest field (e.g. suggestedAmount) will pre-fill the input. */
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

  function applyAmount(amount, chainId) {
    /* manifest.feeBps takes precedence over chain default */
    var bps    = (state.manifest && state.manifest.feeBps != null)
                   ? state.manifest.feeBps
                   : (CHAIN_FEE_BPS[chainId] || 100);
    var fee    = parseFloat((amount * bps / 10000).toFixed(6));
    var total  = parseFloat((amount + fee).toFixed(6));
    var min    = CHAIN_MIN_USDC[chainId] || 1;
    var max    = CHAIN_MAX_USDC[chainId] || 250;

    if (amount < min || amount > max) {
      clearFee();
      transition('VERIFIED');
      return;
    }

    state.amount = amount;
    state.fee    = fee;
    state.total  = total;

    setText('ccFeeValue',   fee.toFixed(2) + ' ' + (state.manifest.token || 'USDC').toUpperCase());
    setText('ccTotalValue', total.toFixed(2) + ' ' + (state.manifest.token || 'USDC').toUpperCase());

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
    setSendBtnLabel('Connect Wallet \u2192', true);
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
    setAttr('ccSendBtn', 'disabled', false);
    setSendBtnLabel('Connect Wallet \u2192', false);
    emit('CC_INTENT_READY', { intent: state.intent });
  }

  /* ----------------------------------------------------------------
   * Send button label helper
   * ---------------------------------------------------------------- */
  function setSendBtnLabel(text, disabled) {
    var btn = el('ccSendBtn');
    if (!btn) return;
    btn.textContent = text;
    btn.disabled = !!disabled;
  }

  /* ----------------------------------------------------------------
   * In-card execution — calls window.IX_EXECUTE
   * ---------------------------------------------------------------- */

  function connectWallet() {
    if (!window.IX_EXECUTE) { renderError('Execution module unavailable'); return; }
    if (!window.ethereum) { renderError('No wallet detected', 'Install MetaMask to send USDC.'); return; }
    transition('CONNECTING');
    setSendBtnLabel('Connecting\u2026', true);
    window.IX_EXECUTE.connectWallet()
      .then(function(address) {
        state.sender = address;
        var warn = el('ccSelfSendWarn');
        if (warn && state.manifest) {
          warn.classList.toggle('is-active', address.toLowerCase() === state.manifest.recipient.toLowerCase());
        }
        return window.IX_EXECUTE.getChainId();
      })
      .then(function(chainId) {
        var manifestChainId = state.manifest && state.manifest.chainId;
        var cfg = window.IX_EXECUTE.chainConfig(manifestChainId);
        if (chainId !== manifestChainId) {
          transition('WRONG_NETWORK');
          setSendBtnLabel('Switch to ' + (cfg ? cfg.name : 'correct network') + ' \u2192', false);
          return;
        }
        showConfirmPanel();
      })
      .catch(function(err) {
        if (err && err.code === 4001) {
          transition('TRANSFER_INTENT_READY');
          setSendBtnLabel('Connect Wallet \u2192', false);
          return;
        }
        renderError('Wallet error', err && err.message);
      });
  }

  function switchNetwork() {
    if (!window.IX_EXECUTE) return;
    var manifestChainId = state.manifest && state.manifest.chainId;
    transition('SWITCHING_NETWORK');
    setSendBtnLabel('Switching\u2026', true);
    window.IX_EXECUTE.switchChain(manifestChainId)
      .then(showConfirmPanel)
      .catch(function(err) {
        if (err && err.code === 4001) {
          var cfg = window.IX_EXECUTE.chainConfig(manifestChainId);
          transition('WRONG_NETWORK');
          setSendBtnLabel('Switch to ' + (cfg ? cfg.name : 'correct network') + ' \u2192', false);
          return;
        }
        renderError('Network switch failed', err && err.message);
      });
  }

  function showConfirmPanel() {
    if (!state.intent || !state.sender || !state.manifest) {
      transition('TRANSFER_INTENT_READY');
      setSendBtnLabel('Connect Wallet \u2192', false);
      return;
    }
    var intent = state.intent;
    var token = (state.manifest.token || 'USDC').toUpperCase();
    var bps = state.manifest.feeBps != null ? state.manifest.feeBps : 100;
    setText('ccConfirmSender', state.sender.slice(0,6) + '\u2026' + state.sender.slice(-4));
    setText('ccConfirmRecipient', intent.recipient.slice(0,6) + '\u2026' + intent.recipient.slice(-4));
    setText('ccConfirmAmount', intent.amount.toFixed(6) + ' ' + token);
    setText('ccConfirmFee', intent.fee.toFixed(6) + ' ' + token);
    setText('ccConfirmTotal', intent.total.toFixed(6) + ' ' + token);
    var sEl = el('ccConfirmSender'); if (sEl) sEl.title = state.sender;
    var rEl = el('ccConfirmRecipient'); if (rEl) rEl.title = intent.recipient;
    var fEl = el('ccConfirmFeeLabel'); if (fEl) fEl.textContent = 'FEE (' + (bps/100) + '%)';
    transition('READY_TO_SEND');
    setSendBtnLabel('Confirm Send \u2192', false);
    emit('CC_READY_TO_SEND', { sender: state.sender, intent: intent });
  }

  function startExecution() {
    if (!state.intent || !state.sender || !state.manifest || !window.IX_EXECUTE) return;
    var intent = state.intent;
    var chainId = state.manifest.chainId;
    var cfg = window.IX_EXECUTE.chainConfig(chainId);
    if (!cfg) { renderError('Unsupported network', 'chainId ' + chainId); return; }
    var amountRaw = window.IX_EXECUTE.toRawUsdc(intent.amount);
    var totalRaw  = window.IX_EXECUTE.toRawUsdc(intent.total);
    transition('APPROVE_PENDING');
    setSendBtnLabel('Approving\u2026', true);
    setText('ccExecText', 'Confirm USDC approval in your wallet\u2026');
    window.IX_EXECUTE.approve(chainId, state.sender, totalRaw)
      .then(function(hash) {
        setText('ccExecText', 'Approval submitted. Waiting for confirmation\u2026');
        return window.IX_EXECUTE.waitForReceipt(hash);
      })
      .then(function(receipt) {
        if (parseInt(receipt.status, 16) !== 1) throw new Error('APPROVE_FAILED');
        transition('EXECUTE_PENDING');
        setSendBtnLabel('Sending\u2026', true);
        setText('ccExecText', 'Confirm transfer in your wallet\u2026');
        return window.IX_EXECUTE.transferWithFee(chainId, state.sender, intent.recipient, amountRaw);
      })
      .then(function(hash) {
        setText('ccExecText', 'Transfer submitted. Waiting for on-chain confirmation\u2026');
        return window.IX_EXECUTE.waitForReceipt(hash).then(function(r) { return { receipt: r, hash: hash }; });
      })
      .then(function(result) {
        if (parseInt(result.receipt.status, 16) !== 1) throw new Error('TRANSFER_FAILED');
        var txLink = el('ccTxLink');
        if (txLink) txLink.href = cfg.explorerUrl + '/tx/' + result.hash;
        var portalLink = el('ccPortalLink');
        if (portalLink) portalLink.href = 'https://implicitex.com/?cc=' + state.cardId + '&src=coincard';
        transition('CONFIRMED');
        emit('CC_CONFIRMED', { txHash: result.hash, sender: state.sender, intent: intent });
      })
      .catch(function(err) {
        if (err && err.code === 4001) {
          transition('READY_TO_SEND');
          setSendBtnLabel('Confirm Send \u2192', false);
          setText('ccExecText', '\u2014');
          return;
        }
        var msg = err && err.message || 'Transfer failed';
        renderError(msg.length > 60 ? msg.slice(0,60) + '\u2026' : msg);
      });
  }

  /* ----------------------------------------------------------------
   * Send button dispatcher
   * ---------------------------------------------------------------- */
  function handleSendClick() {
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
   * Error state
   * ---------------------------------------------------------------- */
  function renderError(message, sub) {
    setText('ccErrorMessage', message || 'Registry error');
    setText('ccErrorSub', sub || '');
    var dot = el('ccStatusDot');
    if (dot) dot.className = 'cc-status-dot cc-status-dot--error';
    transition('ERROR');
    emit('CC_ERROR', { message: message });
  }

  /* ----------------------------------------------------------------
   * Manifest fetch
   * ---------------------------------------------------------------- */
  function loadManifest(cardId) {
    transition('MANIFEST_LOADING');

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
          renderRevoked(manifest);
          renderTrust(manifest);
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
        renderTrust(manifest);
        initAmountSurface(manifest);
        transition('VERIFIED');

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
   * Reveal button — transitions gift view → sender view
   * ---------------------------------------------------------------- */
  function initRevealButton() {
    var btn = el('ccRevealBtn');
    if (btn) btn.addEventListener('click', function () {
      frame.dataset.mode = 'sender';
      var input = el('ccAmountInput');
      if (input) input.focus();
    });
  }

  /* ----------------------------------------------------------------
   * Send button
   * ---------------------------------------------------------------- */
  function initSendButton() {
    var btn = el('ccSendBtn');
    if (btn) btn.addEventListener('click', handleSendClick);
  }

  /* ----------------------------------------------------------------
   * Init — read card ID from URL path
   *   URL: https://implicitex.com/card/cc_demo_implicitex
   *   pathname.split('/') → ['', 'card', 'cc_demo_implicitex']
   * ---------------------------------------------------------------- */
  function init() {
    initRevealButton();
    initSendButton();

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
