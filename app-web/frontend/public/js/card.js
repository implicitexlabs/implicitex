/* card.js — Coin Card visual surface (card.html)
 *
 * Reads ?cc= param, fetches /registry/coincards/<cardId>.json,
 * and renders a high-contrast verified recipient card.
 *
 * Trust model:
 *   Registry manifest is evidence.
 *   Verification confirms the published recipient record.
 *   It does not execute a transfer or prove settlement.
 *
 * Card ID safety: /^[a-zA-Z0-9_-]{3,80}$/ before any fetch.
 * No wallet connection. No transfer execution. Display only.
 */

(function () {
  'use strict';

  var CARD_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;

  var CHAIN_NAMES = {
    '137':   'Polygon',
    '80002': 'Polygon Amoy',
    '1':     'Ethereum',
  };

  function el(id) { return document.getElementById(id); }

  function show(id) {
    var e = el(id);
    if (e) e.hidden = false;
  }

  function hide(id) {
    var e = el(id);
    if (e) e.hidden = true;
  }

  function setText(id, text) {
    var e = el(id);
    if (e) e.textContent = text;
  }

  function setStatus(labelText, modifier) {
    setText('ccCardStatusLabel', labelText);
    var dot  = el('ccCardStatusDot');
    var wrap = el('ccCardStatus');
    if (dot) dot.className = 'cc-card-status-dot' + (modifier ? ' cc-card-status-dot--' + modifier : '');
    if (wrap) wrap.className = 'cc-card-status' + (modifier ? ' cc-card-status--' + modifier : '');
  }

  /* ---- Credential string helpers ---- */

  function truncateAddress(addr) {
    if (!addr || addr.length < 12) return addr;
    return addr.slice(0, 6) + '\u2026' + addr.slice(-4);
  }

  /* Fallback: derive a display credential from the raw card ID.
   * Preferred source is manifest.displayCredential. */
  function deriveDisplayCredential(cardId) {
    return (cardId || '').toUpperCase().replace(/_/g, ' ');
  }

  /* ---- State renderers ---- */

  function renderNoCard() {
    setStatus('No card', '');
    show('ccCardNoCard');
  }

  function renderLoading() {
    setStatus('Checking\u2026', '');
    show('ccCardLoading');
  }

  function renderVerified(manifest) {
    hide('ccCardLoading');
    setStatus('Verified', 'verified');

    var cred = manifest.displayCredential || deriveDisplayCredential(manifest.cardId);
    setText('ccCardCred', cred);
    setText('ccCardName', manifest.displayName || manifest.cardId);

    var recipEl = el('ccCardRecipientField');
    if (recipEl) {
      recipEl.textContent = truncateAddress(manifest.recipient);
      recipEl.title = manifest.recipient;
      recipEl.hidden = false;
    }

    var chainLabel = manifest.chainName
      || CHAIN_NAMES[String(manifest.chainId)]
      || 'Chain ' + manifest.chainId;
    var networkEl = el('ccCardNetwork');
    if (networkEl) {
      networkEl.textContent = chainLabel + ' \u00b7 ' + (manifest.token || '').trim().toUpperCase();
    }

    var portalBtn = el('ccCardPortalBtn');
    if (portalBtn) portalBtn.href = '/?cc=' + encodeURIComponent(manifest.cardId);

    var verifyLink = el('ccCardVerifyLink');
    if (verifyLink) verifyLink.href = '/verify.html?cc=' + encodeURIComponent(manifest.cardId);

    show('ccCardBody');
    show('ccCardFooter');
  }

  function renderRevoked(manifest) {
    hide('ccCardLoading');
    setStatus('Revoked', 'revoked');

    var cred = manifest.displayCredential || deriveDisplayCredential(manifest.cardId);
    setText('ccCardCred', cred);
    setText('ccCardName', manifest.displayName || manifest.cardId);
    hide('ccCardRecipientField');
    show('ccCardRevokedNote');

    var verifyLink = el('ccCardVerifyLink');
    if (verifyLink) verifyLink.href = '/verify.html?cc=' + encodeURIComponent(manifest.cardId);

    hide('ccCardPortalWrap');
    show('ccCardBody');
    show('ccCardFooter');
  }

  /* modifier: 'error' (red) or 'caution' (amber) */
  function renderError(cardId, message, modifier) {
    hide('ccCardLoading');
    setStatus(message, modifier || 'error');
    setText('ccCardErrorText', message);
    if (cardId) {
      setText('ccCardErrorId', cardId);
      show('ccCardErrorIdRow');
    }
    show('ccCardError');
  }

  /* ---- Registry fetch ---- */

  function lookup(cardId) {
    if (!CARD_ID_RE.test(cardId)) {
      renderError(cardId, 'Invalid card ID');
      return;
    }

    renderLoading();

    var url = '/registry/coincards/' + encodeURIComponent(cardId) + '.json';

    fetch(url)
      .then(function (response) {
        if (response.status === 404) return { _notFound: true };
        if (!response.ok) throw new Error('fetch-error-' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        if (manifest._notFound) {
          renderError(cardId, 'No record found');
          return;
        }
        if (manifest.cardId !== cardId) {
          renderError(cardId, 'Registry mismatch');
          return;
        }
        if (manifest.status === 'revoked') {
          renderRevoked(manifest);
          return;
        }
        if (manifest.schema !== 'implicitex.coincard.v1'
            || !manifest.recipient || !manifest.chainId || !manifest.token) {
          renderError(cardId, 'Invalid manifest');
          return;
        }
        if (manifest.status !== 'active') {
          renderError(cardId, 'Not active', 'caution');
          return;
        }
        renderVerified(manifest);
      })
      .catch(function () {
        renderError(cardId, 'Registry unavailable', 'caution');
      });
  }

  /* ---- Logo failure hardening ---- */

  function initCardLogoFallback() {
    document.querySelectorAll('.cc-card-logo').forEach(function (img) {
      var markFailed = function () { img.setAttribute('data-failed', '1'); };
      img.addEventListener('error', markFailed, { once: true });
      if (img.complete && img.naturalWidth === 0) {
        markFailed();
      }
    });
  }

  /* ---- Init ---- */

  function init() {
    initCardLogoFallback();
    var params = new URLSearchParams(window.location.search);
    var cardId = (params.get('cc') || '').trim();
    if (cardId) {
      lookup(cardId);
    } else {
      renderNoCard();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
