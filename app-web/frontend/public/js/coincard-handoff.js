/* coincard-handoff.js — Coin Card → Transfer Portal intake
 *
 * Fires when the Transfer Portal is opened via a Coin Card handoff URL:
 *   implicitex.com/?cc=<cardId>&amount=<hint>&src=coincard
 *
 * Trust model:
 *   cc     → registry lookup key. Fetches /registry/coincards/<cc>.json.
 *            Recipient, token, and network come ONLY from the registry manifest.
 *   amount → sender intent hint. Prefills the amount field. Sender reviews.
 *   src    → provenance marker. Used to show the intake banner only.
 *
 * This module does NOT execute transfers. It prefills and opens the
 * existing Transfer Portal. Wallet connection and transfer action require
 * explicit user confirmation via the existing portal flow.
 */

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var cc     = params.get('cc')     || '';
  var amount = params.get('amount') || '';
  var src    = params.get('src')    || '';

  /* Only run if this looks like a Coin Card handoff */
  if (!cc || src !== 'coincard') return;

  var CARD_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;
  if (!CARD_ID_RE.test(cc)) return;

  /* ---- DOM references ---- */
  function el(id) { return document.getElementById(id); }

  function setVerifyState(state, text) {
    var badge = el('ccIntakeStatus');
    if (!badge) return;
    badge.dataset.verifyState = state;
    badge.textContent = text;
  }

  function setLabel(text) {
    var label = el('ccIntakeLabel');
    if (label) label.textContent = text;
  }

  function showBanner() {
    var banner = el('ccIntake');
    if (banner) banner.removeAttribute('hidden');
  }

  /* ---- Prefill Transfer Portal fields from manifest ---- */
  /* TRUST RULE: manifest.recipient is the destination address — the wallet
   * that will RECEIVE funds. It must NEVER populate any sender field,
   * connected-wallet display, or wallet-context input. Only txRecipient
   * (the locked SENDING TO address) may receive this value. */
  function prefillPortal(manifest) {
    /* Recipient — from registry only, never from URL */
    var recipientEl = el('txRecipient');
    if (recipientEl && manifest.recipient) {
      recipientEl.value = manifest.recipient;
      recipientEl.dispatchEvent(new Event('input', { bubbles: true }));

      /* Lock the field — recipient is fixed from the registry, not user input */
      recipientEl.readOnly = true;
      recipientEl.classList.add('tx-field--locked');
      recipientEl.setAttribute('aria-label',
        'Recipient wallet address — locked from Coin Card registry');

      /* Show "SENDING TO" label */
      var labelEl = el('txRecipientLabel');
      if (labelEl) labelEl.removeAttribute('hidden');

      /* Populate card holder context below the locked field */
      var nameEl = el('ccRecipientName');
      var metaEl = el('ccRecipientMeta');
      var ctxEl  = el('ccRecipientContext');

      if (nameEl) {
        nameEl.textContent = manifest.displayName
          || (manifest.owner && manifest.owner.name)
          || cc;
      }
      if (metaEl) {
        var parts = [];
        if (manifest.displayCredential) parts.push(manifest.displayCredential);
        parts.push('Registry verified');
        metaEl.textContent = parts.join(' \u00b7 ');
      }
      if (ctxEl) ctxEl.removeAttribute('hidden');
    }

    /* Amount — sender intent hint from URL, not from manifest */
    if (amount) {
      var amountEl = el('txAmount');
      if (amountEl) {
        amountEl.value = amount;
        amountEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  /* ---- Open and focus the existing Transfer Portal ---- */
  function openPortal() {
    if (window.IX && typeof window.IX.openTransferPortal === 'function') {
      window.IX.openTransferPortal();
    } else {
      /* Fallback: remove hidden directly if IX not ready yet */
      var modules = el('modules');
      if (modules) {
        modules.removeAttribute('hidden');
        document.body.classList.add('portal-active');
      }
    }
  }

  /* ---- Fetch and process manifest ---- */
  function loadManifest(cardId) {
    setLabel(cardId);
    setVerifyState('pending', 'CHECKING REGISTRY');
    showBanner();

    fetch('/registry/coincards/' + encodeURIComponent(cardId) + '.json')
      .then(function (res) {
        if (res.status === 404) return { _notFound: true };
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (manifest) {
        if (manifest._notFound) {
          setVerifyState('warn', 'UNVERIFIED — CARD NOT FOUND');
          return;
        }

        if (manifest.status === 'revoked') {
          setVerifyState('mismatch', 'CARD REVOKED — TRANSFER BLOCKED');
          setLabel(cardId);
          /* Leave portal closed — revoked card cannot initiate a transfer */
          return;
        }

        if (manifest.schema !== 'implicitex.coincard.v1') {
          setVerifyState('warn', 'UNVERIFIED — SCHEMA MISMATCH');
          return;
        }

        if (!manifest.recipient || !manifest.chainId || !manifest.token) {
          setVerifyState('warn', 'UNVERIFIED — INCOMPLETE MANIFEST');
          return;
        }

        /* Registry verified — build label from manifest */
        var ownerName = manifest.owner && manifest.owner.name
          ? manifest.owner.name
          : (manifest.displayName || cardId);
        var ownerDomain = manifest.owner && manifest.owner.domain
          ? ' \u00b7 ' + manifest.owner.domain
          : '';
        setLabel(ownerName + ownerDomain);
        setVerifyState('verified', 'REGISTRY VERIFIED');

        prefillPortal(manifest);
        openPortal();
      })
      .catch(function (err) {
        setVerifyState('warn', 'UNVERIFIED — REGISTRY UNAVAILABLE');
        setLabel(cardId + ' (unverified)');
        /* Open the portal anyway — user can still enter details manually */
        openPortal();
      });
  }

  /* ---- Init — defer until IX is ready ---- */
  function init() {
    /* IX.openTransferPortal may not exist until wallet.js finishes init.
     * Listen for the custom event wallet.js fires on ready, or fall back
     * to a short defer. */
    if (window.IX && typeof window.IX.openTransferPortal === 'function') {
      loadManifest(cc);
    } else {
      /* wallet.js fires 'ix:ready' when the public API is available */
      window.addEventListener('ix:ready', function () {
        loadManifest(cc);
      }, { once: true });

      /* Safety timeout: if ix:ready never fires, run anyway after 2s */
      setTimeout(function () {
        if (!el('ccIntake') || el('ccIntake').hasAttribute('hidden')) {
          loadManifest(cc);
        }
      }, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
