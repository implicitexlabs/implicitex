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
 *   { source:'implicitex-coincard', type:'CC_READY',         cardId, payload:{ recipient, chainId, token, owner } }
 *   { source:'implicitex-coincard', type:'CC_AMOUNT_CHANGED', cardId, payload:{ amount, fee, total } }
 *   { source:'implicitex-coincard', type:'CC_INTENT_READY',   cardId, payload:{ intent } }
 *   { source:'implicitex-coincard', type:'CC_HANDOFF',        cardId, payload:{ intent, url } }
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
   * Handoff — V1: route sender to the existing ImplicitEx Transfer Portal.
   *
   * URL contract:
   *   cc     = registry key (canonical). Portal fetches the manifest to
   *            resolve recipient — never trusts a to= param from the URL.
   *   amount = sender intent (prefill hint only; sender reviews before sending).
   *   src    = provenance marker so the portal knows this came from a Coin Card.
   *
   * The portal resolves all other fields (recipient, token, chain) from the
   * registry manifest keyed by cc. Nothing critical travels in the URL.
   * ---------------------------------------------------------------- */
  function doHandoff() {
    if (!state.intent) return;
    var intent = state.intent;

    var params = new URLSearchParams({ cc: intent.cardId, src: 'coincard' });
    if (intent.amount != null) params.set('amount', String(intent.amount));

    var url = 'https://implicitex.com/?' + params.toString() + '#transfer';

    transition('HANDOFF');
    emit('CC_HANDOFF', { intent: intent, url: url });

    /* If parent does not intercept CC_HANDOFF, open the portal */
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
    if (btn) btn.addEventListener('click', doHandoff);
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
