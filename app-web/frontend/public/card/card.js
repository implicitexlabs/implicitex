/* card.js — Coin Card iframe state machine + in-card execution
 *
 * States:
 *   BOOT                  → initializing, reading card ID from URL path
 *   MANIFEST_LOADING      → fetching /registry/coincards/<id>.json
 *   VERIFIED              → manifest valid; trust rows populated; gift section shown
 *   AMOUNT_READY          → valid amount entered; fee calculated
 *   TRANSFER_INTENT_READY → intent constructed; "Connect Wallet" button active
 *   CONNECTING            → eth_requestAccounts in flight
 *   WRONG_NETWORK         → wallet connected; wrong chain; offer switch
 *   SWITCHING_NETWORK     → wallet_switchEthereumChain in flight
 *   READY_TO_SEND         → connected, correct chain; confirm panel shown
 *   APPROVE_PENDING       → USDC approve() tx submitted; awaiting confirmation
 *   EXECUTE_PENDING       → transferWithFee() tx submitted; awaiting confirmation
 *   CONFIRMED             → transfer confirmed on-chain; explorer link shown
 *   REVOKED               → manifest status === 'revoked'; transfer blocked
 *   ERROR                 → any unrecoverable failure
 *
 * Execution model:
 *   The card is the complete transaction surface. No redirect to the Transfer
 *   Portal. Execution uses the manifest recipient locked from the registry —
 *   never from user input. Two-step flow: approve USDC spend, then
 *   transferWithFee on the ImplicitEx contract.
 *
 * Trust model:
 *   Registry manifest is evidence. URL path is transport. The card never
 *   becomes a payment surface until the destination is verified from the registry.
 *
 * PostMessage bridge (iframe → parent):
 *   { source:'implicitex-coincard', type:'CC_READY',          cardId, payload:{ recipient, chainId, token, owner } }
 *   { source:'implicitex-coincard', type:'CC_AMOUNT_CHANGED',  cardId, payload:{ amount, fee, total } }
 *   { source:'implicitex-coincard', type:'CC_INTENT_READY',    cardId, payload:{ intent } }
 *   { source:'implicitex-coincard', type:'CC_READY_TO_SEND',   cardId, payload:{ sender, intent } }
 *   { source:'implicitex-coincard', type:'CC_CONFIRMED',       cardId, payload:{ txHash, sender, intent } }
 *   { source:'implicitex-coincard', type:'CC_ERROR',           cardId, payload:{ message } }
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

  /* Execution config — inline, mirroring config/chains.js.
   * Card is isolated from the host page so cannot read window.IX_CHAINS. */
  var CHAIN_EXEC = {
    137: {
      name:            'Polygon',
      chainHex:        '0x89',
      usdcAddress:     '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      contractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
      explorerUrl:     'https://polygonscan.com',
      rpcUrls:         ['https://polygon-bor-rpc.publicnode.com'],
    },
  };

  /* ----------------------------------------------------------------
   * ABI encoding — vanilla JS, no ethers.js dependency.
   * Selectors computed from keccak256 of canonical function signatures.
   * ---------------------------------------------------------------- */
  var APPROVE_SELECTOR      = '095ea7b3'; /* approve(address,uint256)          */
  var TRANSFER_FEE_SELECTOR = '08acece2'; /* transferWithFee(address,uint256)  */

  function padHex32(hex) {
    return hex.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  }

  function encodeApprove(spender, amountBigInt) {
    return '0x'
      + APPROVE_SELECTOR
      + padHex32(spender)
      + amountBigInt.toString(16).padStart(64, '0');
  }

  function encodeTransferWithFee(recipient, amountBigInt) {
    return '0x'
      + TRANSFER_FEE_SELECTOR
      + padHex32(recipient)
      + amountBigInt.toString(16).padStart(64, '0');
  }

  /* Convert float USDC amount to raw uint256 (6 decimals).
   * Uses string math to avoid float precision issues. */
  function toRawUsdc(floatVal) {
    var s      = floatVal.toFixed(6);
    var parts  = s.split('.');
    var whole  = BigInt(parts[0] || '0');
    var frac   = BigInt((parts[1] || '000000').padEnd(6, '0').slice(0, 6));
    return whole * 1000000n + frac;
  }

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
    sender:              null,   /* connected wallet address */
  };

  var frame = document.getElementById('ccFrame');

  function transition(next) {
    state.current = next;
    frame.dataset.state = next;
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

    var allowed      = (state.manifest && state.manifest.allowedParentOrigins) || [];
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

      var giftText = el('ccGiftText');
      if (giftText) {
        giftText.textContent = 'This Coin Card was created so support can reach '
          + manifest.displayName + ' directly.';
      }

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
    if (dot) dot.className = 'cc-status-dot cc-status-dot--verified';
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
      el('ccAmountInputRow').style.display = 'none';
      var lockedRow = el('ccLockedAmountRow');
      lockedRow.style.display = 'flex';
      setText('ccLockedAmount', manifest.lockedAmount.toFixed(2) + ' ' + token);
      applyAmount(manifest.lockedAmount, chainId);
    } else {
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
    var bps   = (state.manifest && state.manifest.feeBps != null)
                  ? state.manifest.feeBps
                  : (CHAIN_FEE_BPS[chainId] || 100);
    var fee   = parseFloat((amount * bps / 10000).toFixed(6));
    var total = parseFloat((amount + fee).toFixed(6));
    var min   = CHAIN_MIN_USDC[chainId] || 1;
    var max   = CHAIN_MAX_USDC[chainId] || 250;

    if (amount < min || amount > max) {
      clearFee();
      transition('VERIFIED');
      return;
    }

    state.amount = amount;
    state.fee    = fee;
    state.total  = total;

    setText('ccFeeValue',   fee.toFixed(6) + ' ' + (state.manifest.token || 'USDC').toUpperCase());
    setText('ccTotalValue', total.toFixed(6) + ' ' + (state.manifest.token || 'USDC').toUpperCase());

    transition('AMOUNT_READY');
    buildIntent();
    emit('CC_AMOUNT_CHANGED', { amount: amount, fee: fee, total: total });
  }

  function clearFee() {
    state.amount = null;
    state.fee    = null;
    state.total  = null;
    state.intent = null;
    state.sender = null;
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
    btn.disabled    = !!disabled;
  }

  /* ----------------------------------------------------------------
   * Wallet connection flow
   * ---------------------------------------------------------------- */
  function connectWallet() {
    if (!window.ethereum) {
      renderError('No wallet detected', 'Install MetaMask to send USDC on this card.');
      return;
    }

    transition('CONNECTING');
    setSendBtnLabel('Connecting\u2026', true);

    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(function (accounts) {
        if (!accounts || !accounts[0]) {
          transition('TRANSFER_INTENT_READY');
          setSendBtnLabel('Connect Wallet \u2192', false);
          return;
        }

        state.sender = accounts[0];

        /* Self-send guard — warn if sender is also the card holder */
        if (state.manifest) {
          var isSelfSend = state.sender.toLowerCase() === state.manifest.recipient.toLowerCase();
          var warn = el('ccSelfSendWarn');
          if (warn) warn.classList.toggle('is-active', isSelfSend);
        }

        return window.ethereum.request({ method: 'eth_chainId' });
      })
      .then(function (chainIdHex) {
        if (chainIdHex == null) return; /* accounts guard above failed — already handled */

        var detectedChainId  = parseInt(chainIdHex, 16);
        var manifestChainId  = state.manifest && state.manifest.chainId;
        var cfg              = CHAIN_EXEC[manifestChainId];

        if (detectedChainId !== manifestChainId) {
          transition('WRONG_NETWORK');
          var targetName = cfg ? cfg.name : ('chain ' + manifestChainId);
          setSendBtnLabel('Switch to ' + targetName + ' \u2192', false);
          return;
        }

        showConfirmPanel();
      })
      .catch(function (err) {
        if (err && err.code === 4001) {
          /* User declined the connection prompt */
          transition('TRANSFER_INTENT_READY');
          setSendBtnLabel('Connect Wallet \u2192', false);
          return;
        }
        renderError('Wallet error', err && err.message);
      });
  }

  function switchToManifestChain() {
    var manifestChainId = state.manifest && state.manifest.chainId;
    var cfg             = CHAIN_EXEC[manifestChainId];

    if (!cfg) {
      renderError('Unsupported network', 'chainId ' + manifestChainId);
      return;
    }

    transition('SWITCHING_NETWORK');
    setSendBtnLabel('Switching\u2026', true);

    window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: cfg.chainHex }],
    })
    .then(function () {
      showConfirmPanel();
    })
    .catch(function (err) {
      if (err && err.code === 4902) {
        /* Chain not added to wallet — add it, then continue */
        return window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:             cfg.chainHex,
            chainName:           cfg.name,
            nativeCurrency:      { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls:             cfg.rpcUrls,
            blockExplorerUrls:   [cfg.explorerUrl],
          }],
        }).then(showConfirmPanel);
      }
      /* User declined the switch */
      transition('WRONG_NETWORK');
      setSendBtnLabel('Switch to ' + cfg.name + ' \u2192', false);
    });
  }

  function showConfirmPanel() {
    if (!state.intent || !state.sender || !state.manifest) {
      transition('TRANSFER_INTENT_READY');
      setSendBtnLabel('Connect Wallet \u2192', false);
      return;
    }

    var intent = state.intent;
    var token  = (state.manifest.token || 'USDC').toUpperCase();
    var bps    = state.manifest.feeBps != null ? state.manifest.feeBps : 100;

    var senderShort = state.sender.slice(0, 6) + '\u2026' + state.sender.slice(-4);
    var recipShort  = intent.recipient.slice(0, 6) + '\u2026' + intent.recipient.slice(-4);

    setText('ccConfirmSender',    senderShort);
    setText('ccConfirmRecipient', recipShort);
    setText('ccConfirmAmount',    intent.amount.toFixed(6) + ' ' + token);
    setText('ccConfirmFee',       intent.fee.toFixed(6) + ' ' + token);
    setText('ccConfirmTotal',     intent.total.toFixed(6) + ' ' + token);

    var senderEl = el('ccConfirmSender');
    if (senderEl) senderEl.title = state.sender;
    var recipEl = el('ccConfirmRecipient');
    if (recipEl) recipEl.title = intent.recipient;

    /* Fee label: show percentage */
    var feeLabel = el('ccConfirmFeeLabel');
    if (feeLabel) feeLabel.textContent = 'FEE (' + (bps / 100) + '%)';

    transition('READY_TO_SEND');
    setSendBtnLabel('Confirm Send \u2192', false);

    emit('CC_READY_TO_SEND', { sender: state.sender, intent: intent });
  }

  /* ----------------------------------------------------------------
   * Execution: approve + transferWithFee
   * ---------------------------------------------------------------- */
  function startExecution() {
    if (!state.intent || !state.sender || !state.manifest) return;

    var intent         = state.intent;
    var manifestChainId = state.manifest.chainId;
    var cfg            = CHAIN_EXEC[manifestChainId];

    if (!cfg) {
      renderError('Unsupported network', 'chainId ' + manifestChainId);
      return;
    }

    var amountRaw = toRawUsdc(intent.amount);
    var totalRaw  = toRawUsdc(intent.total);

    /* Step 1 — approve USDC spend (totalDebit = amount + fee) */
    transition('APPROVE_PENDING');
    setSendBtnLabel('Approving\u2026', true);
    setText('ccExecText', 'Confirm USDC approval in your wallet\u2026');

    window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: state.sender,
        to:   cfg.usdcAddress,
        data: encodeApprove(cfg.contractAddress, totalRaw),
      }],
    })
    .then(function (approveTxHash) {
      setText('ccExecText', 'USDC approval submitted. Waiting for confirmation\u2026');
      return waitForTx(approveTxHash);
    })
    .then(function (approveReceipt) {
      if (parseInt(approveReceipt.status, 16) !== 1) {
        throw new Error('approve-failed');
      }

      /* Step 2 — transferWithFee(recipient, amount) */
      transition('EXECUTE_PENDING');
      setSendBtnLabel('Sending\u2026', true);
      setText('ccExecText', 'Confirm transfer in your wallet\u2026');

      return window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: state.sender,
          to:   cfg.contractAddress,
          data: encodeTransferWithFee(intent.recipient, amountRaw),
        }],
      });
    })
    .then(function (transferTxHash) {
      setText('ccExecText', 'Transfer submitted. Waiting for on-chain confirmation\u2026');
      return waitForTx(transferTxHash)
        .then(function (receipt) { return { receipt: receipt, hash: transferTxHash }; });
    })
    .then(function (result) {
      if (parseInt(result.receipt.status, 16) !== 1) {
        throw new Error('transfer-failed');
      }

      /* Confirmed */
      var txLink = el('ccTxLink');
      if (txLink) {
        txLink.href = cfg.explorerUrl.replace(/\/$/, '') + '/tx/' + result.hash;
        txLink.textContent = 'View on ' + cfg.name.split(' ')[0] + 'scan \u2192';
      }
      transition('CONFIRMED');

      emit('CC_CONFIRMED', {
        txHash: result.hash,
        sender: state.sender,
        intent: intent,
      });
    })
    .catch(function (err) {
      if (err && err.code === 4001) {
        /* User declined wallet prompt — return to READY_TO_SEND */
        transition('READY_TO_SEND');
        setSendBtnLabel('Confirm Send \u2192', false);
        setText('ccExecText', '\u2014');
        return;
      }
      var msg = err && err.message || 'Transfer failed';
      renderError(msg.length > 60 ? msg.slice(0, 60) + '\u2026' : msg);
    });
  }

  /* Poll MetaMask for transaction receipt until confirmed or timeout. */
  function waitForTx(hash) {
    return new Promise(function (resolve, reject) {
      var attempts = 0;
      var timer = setInterval(function () {
        window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [hash],
        })
        .then(function (receipt) {
          if (receipt) {
            clearInterval(timer);
            resolve(receipt);
            return;
          }
          if (++attempts >= 90) { /* 3 min at 2s intervals */
            clearInterval(timer);
            reject(new Error('tx-timeout'));
          }
        })
        .catch(function () {
          if (++attempts >= 90) {
            clearInterval(timer);
            reject(new Error('tx-timeout'));
          }
        });
      }, 2000);
    });
  }

  /* ----------------------------------------------------------------
   * Send button — state-driven dispatcher
   * ---------------------------------------------------------------- */
  function handleSendClick() {
    switch (state.current) {
      case 'TRANSFER_INTENT_READY': connectWallet();         break;
      case 'WRONG_NETWORK':         switchToManifestChain(); break;
      case 'READY_TO_SEND':         startExecution();        break;
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
   *   URL: https://implicitex.com/card/antoine
   *   pathname.split('/') → ['', 'card', 'antoine']
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
