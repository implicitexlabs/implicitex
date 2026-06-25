/* verify.js — Coin Card independent verification (verify.html)
 *
 * Reads ?cc= param, fetches /registry/coincards/<cardId>.json,
 * and renders the verification result without requiring the Transfer Portal.
 *
 * Trust model:
 *   Registry manifest is evidence.
 *   Verification confirms the published recipient record.
 *   It does not execute a transfer or prove settlement.
 *
 * Card ID safety: /^[a-zA-Z0-9_-]{3,80}$/ before any fetch.
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

  function showFact(factId, valueId, text) {
    var fact = el(factId);
    var val  = el(valueId);
    if (!fact || !val) return;
    fact.hidden = false;
    val.textContent = text;
  }

  function setStatus(text, modifier) {
    var span = el('ccvStatus');
    if (!span) return;
    span.textContent = text;
    span.className = modifier ? 'ccv-status ccv-status--' + modifier : 'ccv-status';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
    } catch (e) {
      return iso;
    }
  }

  function showResult() {
    var lookup = el('coincardLookup');
    var result = el('coincardResult');
    if (lookup) lookup.hidden = true;
    if (result) result.hidden = false;
  }

  function renderVerified(manifest) {
    showResult();
    setStatus('Verified', 'verified');
    showFact('ccvCardIdFact', 'ccvCardId', manifest.cardId);
    if (manifest.displayName) {
      showFact('ccvNameFact', 'ccvName', manifest.displayName);
    }
    showFact('ccvRecipientFact', 'ccvRecipient', manifest.recipient);
    var chainLabel = manifest.chainName
      || CHAIN_NAMES[String(manifest.chainId)]
      || 'Chain ' + manifest.chainId;
    showFact('ccvChainFact', 'ccvChain', chainLabel);
    showFact('ccvTokenFact', 'ccvToken', (manifest.token || '').toUpperCase());
    if (manifest.sourceDomain) {
      showFact('ccvDomainFact', 'ccvDomain', manifest.sourceDomain);
    }
    showFact('ccvRegistryFact', 'ccvRegistry', 'Active');
    if (manifest.updatedAt) {
      showFact('ccvUpdatedFact', 'ccvUpdated', formatDate(manifest.updatedAt));
    }
    var note = el('coincardTrustNote');
    if (note) note.hidden = false;
    var portalWrap = el('coincardPortalLink');
    var portalHref = el('coincardPortalHref');
    if (portalWrap && portalHref) {
      portalHref.href = '/?cc=' + encodeURIComponent(manifest.cardId);
      portalWrap.hidden = false;
    }
  }

  function renderRevoked(manifest) {
    showResult();
    setStatus('Revoked', 'failed');
    showFact('ccvCardIdFact', 'ccvCardId', manifest.cardId);
    showFact('ccvRegistryFact', 'ccvRegistry', 'Revoked');
  }

  function renderFailed(cardId, registryText) {
    showResult();
    setStatus('Not verified', 'unverified');
    if (cardId) showFact('ccvCardIdFact', 'ccvCardId', cardId);
    showFact('ccvRegistryFact', 'ccvRegistry', registryText || 'Unavailable');
  }

  function renderInvalid(cardId) {
    showResult();
    setStatus('Invalid card', 'failed');
    showFact('ccvCardIdFact', 'ccvCardId', cardId || '(malformed)');
    showFact('ccvRegistryFact', 'ccvRegistry', 'Rejected — invalid ID');
  }

  function lookup(cardId) {
    if (!CARD_ID_RE.test(cardId)) {
      renderInvalid(cardId);
      return;
    }

    showResult();
    setStatus('Checking registry\u2026', '');
    showFact('ccvCardIdFact', 'ccvCardId', cardId);

    var url = '/registry/coincards/' + encodeURIComponent(cardId) + '.json';

    fetch(url)
      .then(function (response) {
        if (response.status === 404) return { _notFound: true };
        if (!response.ok) throw new Error('fetch-error-' + response.status);
        return response.json();
      })
      .then(function (manifest) {
        if (manifest._notFound) {
          renderFailed(cardId, 'Record not found');
          return;
        }
        if (manifest.cardId !== cardId) {
          renderFailed(cardId, 'Mismatch');
          return;
        }
        if (manifest.status === 'revoked') {
          renderRevoked(manifest);
          return;
        }
        if (manifest.schema !== 'implicitex.coincard.v1'
            || !manifest.recipient || !manifest.chainId || !manifest.token) {
          renderFailed(cardId, 'Invalid manifest');
          return;
        }
        if (manifest.status !== 'active') {
          renderFailed(cardId, 'Not active');
          return;
        }
        renderVerified(manifest);
      })
      .catch(function () {
        renderFailed(cardId, 'Unavailable');
      });
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var cardId = (params.get('cc') || '').trim();

    if (cardId) {
      lookup(cardId);
    }
    // Form submits natively via GET — no JS handler needed for navigation
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
