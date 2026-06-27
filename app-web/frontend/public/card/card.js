/* card.js — Coin Card iframe state machine
 *
 * States:
 *   BOOT                  → initializing, reading card ID from URL path
 *   MANIFEST_LOADING      → fetching /registry/coincards/<id>.json
 *   VERIFIED              → manifest valid and active; trust rows populated
 *   AMOUNT_READY          → valid amount entered; fee calculated
 *   TRANSFER_INTENT_READY → intent object constructed; send button active
 *   REVOKED               → manifest status === 'revoked'; transfer blocked
 *   HANDOFF               → sender confirmed; posting intent to parent / redirecting
 *   ERROR                 → any unrecoverable failure
 *
 * Trust model:
 *   Registry manifest is evidence. URL path is transport. The card never
 *   becomes a payment surface until the destination is verified from the registry.
 *
 * PostMessage bridge (iframe → parent):
 *   { source:'coincard', type:'CC_READY',        cardId, data:{ recipient, chainId, token, owner } }
 *   { source:'coincard', type:'CC_AMOUNT_CHANGED',cardId, data:{ amount, fee, total } }
 *   { source:'coincard', type:'CC_INTENT_READY',  cardId, data:{ intent } }
 *   { source:'coincard', type:'CC_HANDOFF',       cardId, data:{ intent, url } }
 *   { source:'coincard', type:'CC_ERROR',         cardId, data:{ message } }
 *
 * PostMessage bridge (parent → iframe):
 *   { source:'coincard-host', type:'CC_THEME', data:{ theme:'dark'|'light' } }
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

  /* Fee config inline — not imported from chains.js (isolated iframe) */
  var CHAIN_FEE_BPS  = { 137: 100, 80002: 100, 1: 30 };
  var CHAIN_MIN_USDC = { 137: 1,   80002: 1,   1: 1  };
  var CHAIN_MAX_USDC = { 137: 250, 80002: 250, 1: 250 };

  /* ----------------------------------------------------------------
   * State machine
   * ---------------------------------------------------------------- */
  var state = {
    current:  'BOOT',
    cardId:   null,
    manifest: null,
    amount:   null,
    fee:      null,
    total:    null,
    intent:   null,
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
  function emit(type, data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'coincard',
        type:   type,
        cardId: state.cardId || null,
        data:   data || {},
      }, '*');
    }
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.source !== 'coincard-host') return;
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
    var mode    = manifest.amountMode || 'user-input';
    var chainId = manifest.chainId;
    var token   = (manifest.token || 'USDC').toUpperCase();

    setText('ccAmountToken', token);

    if (mode === 'locked' && manifest.lockedAmount != null) {
      /* Show locked amount, hide input */
      el('ccAmountInputRow').style.display = 'none';
      var lockedRow = el('ccLockedAmountRow');
      lockedRow.style.display = 'flex';
      setText('ccLockedAmount', manifest.lockedAmount.toFixed(2) + ' ' + token);
      applyAmount(manifest.lockedAmount, chainId);
    } else {
      /* user-input mode: wire up amount input */
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
    var bps    = CHAIN_FEE_BPS[chainId] || 100;
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
    setAttr('ccSendBtn', 'disabled', true);
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
    emit('CC_INTENT_READY', { intent: state.intent });
  }

  /* ----------------------------------------------------------------
   * Handoff — V1: navigate parent to ImplicitEx transfer portal
   * ---------------------------------------------------------------- */
  function doHandoff() {
    if (!state.intent) return;
    var intent = state.intent;
    var params = new URLSearchParams({
      cc:    intent.cardId,
      to:    intent.recipient,
      chain: String(intent.chainId),
      token: intent.token,
    });
    var url = 'https://implicitex.com/?' + params.toString();

    transition('HANDOFF');
    emit('CC_HANDOFF', { intent: intent, url: url });

    /* If parent does not intercept CC_HANDOFF, open transfer portal */
    setTimeout(function () {
      window.open(url, '_blank', 'noopener');
    }, 120);
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
   * Send button
   * ---------------------------------------------------------------- */
  function initSendButton() {
    var btn = el('ccSendBtn');
    if (btn) btn.addEventListener('click', doHandoff);
  }

  /* ----------------------------------------------------------------
   * Init — read card ID from URL path
   *   URL: https://implicitex.com/card/cc_demo_implicitex
   *   pathname.split('/') → ['', 'card', 'cc_demo_implicitex']
   * ---------------------------------------------------------------- */
  function init() {
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
