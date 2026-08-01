/* coincard.js — Coin Card verification panel
 *
 * Verifies Coin Card links against static registry manifests at:
 *   /registry/coincards/<cardId>.json
 *
 * TRUST MODEL:
 *   URL params are transport (claims).
 *   Registry manifest is evidence.
 *   Wallet confirmation is execution.
 *   Chain event is final settlement proof.
 *
 * The registry manifest wins. URL claims are compared against it,
 * not treated as verified by themselves.
 *
 * Expected URL params:
 *   cc    — Card ID (e.g. cc_demo_implicitex) — required for verification
 *   to    — recipient address (claim — compared against manifest)
 *   chain — chain ID (claim — compared against manifest)
 *   token — token symbol (claim — compared against manifest)
 *   name  — display name (optional, informational only)
 *   src   — source domain (optional, informational only)
 *
 * verificationStatus values:
 *   'none'       — no cc param present
 *   'unverified' — cc param present but manifest unavailable
 *   'verified'   — manifest confirmed all required fields; URL claims match if provided
 *   'failed'     — manifest exists but URL claims mismatch, or manifest invalid
 *   'revoked'    — manifest.status === "revoked"
 *
 * sourceType values:
 *   'none'       — no card
 *   'url-claim'  — recipient/data came from URL only (not registry-confirmed)
 *   'registry'   — recipient/data sourced from verified registry manifest
 *
 * window.IX.coincard shape:
 *   cardId, recipient, chain, token, name, source,
 *   manifest, verificationStatus, sourceType, failureReason
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Card ID safety guard
   * Allows letters, digits, underscores, hyphens. 3–80 chars.
   * This is the path-safety layer — prevents directory traversal or
   * injection before any fetch is attempted.
   * ---------------------------------------------------------------- */
  var CARD_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;

  var CHAIN_NAMES = {
    '137':   'Polygon',
    '80002': 'Polygon Amoy',
    '1':     'Ethereum',
  };

  /* ----------------------------------------------------------------
   * Normalization helpers
   * ---------------------------------------------------------------- */
  function normalizeAddress(value) {
    return (value || '').trim().toLowerCase();
  }

  function normalizeToken(value) {
    return (value || '').trim().toUpperCase();
  }

  function normalizeChain(value) {
    return String((value || '')).trim();
  }

  function truncateAddress(addr) {
    if (!addr || addr.length < 12) return addr;
    return addr.slice(0, 6) + '\u2026' + addr.slice(-4);
  }

  /* ----------------------------------------------------------------
   * DOM helpers
   * ---------------------------------------------------------------- */
  function el(id) {
    return document.getElementById(id);
  }

  function showRow(rowId, valueId, text, title) {
    var row = el(rowId);
    var val = el(valueId);
    if (!row || !val) return;
    row.hidden = false;
    val.textContent = text;
    if (title) val.title = title;
  }

  function hideRow(rowId) {
    var row = el(rowId);
    if (row) row.hidden = true;
  }

  /* ----------------------------------------------------------------
   * URL param parsing
   * ---------------------------------------------------------------- */
  function parseCoinCardParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      cardId:    params.get('cc')    || '',
      recipient: params.get('to')    || '',
      chain:     params.get('chain') || '',
      token:     params.get('token') || '',
      name:      params.get('name')  || '',
      source:    params.get('src')   || '',
    };
  }

  /* ----------------------------------------------------------------
   * Panel rendering
   * ---------------------------------------------------------------- */
  function setStatus(text, modifier) {
    var statusEl = el('cardStatus');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'data-v' + (modifier ? ' card-status--' + modifier : '');
  }

  function renderNoCard() {
    setStatus('No card', '');
    ['cardIdRow','cardOwnerRow','cardRecipientRow','cardChainRow',
     'cardTokenRow','cardDomainRow','cardRegistryRow'].forEach(hideRow);
    var footer = el('cardVerifyFooter');
    if (footer) footer.hidden = true;
  }

  function renderInvalidCard(cardId) {
    setStatus('Invalid card', 'failed');
    showRow('cardIdRow', 'cardIdDisplay', cardId || '(malformed)');
    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Rejected — invalid ID');
    ['cardOwnerRow','cardRecipientRow','cardChainRow','cardTokenRow','cardDomainRow'].forEach(hideRow);
    var footer = el('cardVerifyFooter');
    if (footer) footer.hidden = true;
  }

  function renderUnverified(card) {
    setStatus('Card detected — not verified', 'unverified');
    showRow('cardIdRow', 'cardIdDisplay', card.cardId);
    hideRow('cardOwnerRow');
    if (card.recipient) {
      showRow('cardRecipientRow', 'cardRecipientDisplay',
        truncateAddress(card.recipient), card.recipient);
    } else {
      hideRow('cardRecipientRow');
    }
    if (card.chain) {
      showRow('cardChainRow', 'cardChainDisplay',
        CHAIN_NAMES[card.chain] || 'Chain ' + card.chain);
    } else {
      hideRow('cardChainRow');
    }
    if (card.token) {
      showRow('cardTokenRow', 'cardTokenDisplay', normalizeToken(card.token));
    } else {
      hideRow('cardTokenRow');
    }
    if (card.source) {
      showRow('cardDomainRow', 'cardDomainDisplay', card.source);
    } else {
      hideRow('cardDomainRow');
    }
    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Unavailable');
    renderVerifyFooter(card.cardId);
  }

  function renderNotFound(card) {
    setStatus('Card detected — not verified', 'unverified');
    showRow('cardIdRow', 'cardIdDisplay', card.cardId);
    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Record not found');
    ['cardOwnerRow','cardRecipientRow','cardChainRow','cardTokenRow','cardDomainRow'].forEach(hideRow);
    renderVerifyFooter(card.cardId);
  }

  function renderVerified(card, manifest) {
    setStatus('Verified', 'verified');
    showRow('cardIdRow', 'cardIdDisplay', manifest.cardId);
    var owner = manifest.owner;
    if (owner && owner.name) {
      var ownerLabel = owner.domain
        ? owner.name + ' (' + owner.domain + ')'
        : owner.name;
      showRow('cardOwnerRow', 'cardOwnerDisplay', ownerLabel);
    } else {
      hideRow('cardOwnerRow');
    }
    var addr = manifest.recipient;
    showRow('cardRecipientRow', 'cardRecipientDisplay',
      truncateAddress(addr), addr);
    var chainLabel = manifest.chainName
      || CHAIN_NAMES[normalizeChain(manifest.chainId)]
      || 'Chain ' + manifest.chainId;
    showRow('cardChainRow', 'cardChainDisplay', chainLabel);
    showRow('cardTokenRow', 'cardTokenDisplay', normalizeToken(manifest.token));
    var domain = manifest.sourceDomain || card.source;
    if (domain) {
      showRow('cardDomainRow', 'cardDomainDisplay', domain);
    } else {
      hideRow('cardDomainRow');
    }
    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Active');
    renderVerifyFooter(manifest.cardId);
  }

  function renderRevoked(manifest) {
    setStatus('Revoked', 'failed');
    showRow('cardIdRow', 'cardIdDisplay', manifest.cardId);
    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Revoked');
    ['cardOwnerRow','cardRecipientRow','cardChainRow','cardTokenRow','cardDomainRow'].forEach(hideRow);
    renderVerifyFooter(manifest.cardId);
  }

  function renderMismatch(card, manifest) {
    setStatus('Verification failed', 'failed');
    showRow('cardIdRow', 'cardIdDisplay', card.cardId);
    hideRow('cardOwnerRow');
    // Show claimed recipient so the sender knows what was in the link
    if (card.recipient) {
      showRow('cardRecipientRow', 'cardRecipientDisplay',
        truncateAddress(card.recipient), card.recipient);
    } else {
      hideRow('cardRecipientRow');
    }
    if (card.chain) {
      showRow('cardChainRow', 'cardChainDisplay',
        CHAIN_NAMES[card.chain] || 'Chain ' + card.chain);
    } else {
      hideRow('cardChainRow');
    }
    if (card.token) {
      showRow('cardTokenRow', 'cardTokenDisplay', normalizeToken(card.token));
    } else {
      hideRow('cardTokenRow');
    }
    hideRow('cardDomainRow');
    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Mismatch');
    renderVerifyFooter(card.cardId);
  }

  function renderVerifyFooter(cardId) {
    var footer = el('cardVerifyFooter');
    if (!footer) return;
    footer.hidden = false;
    var link = el('cardVerifyLink');
    if (link && cardId) {
      link.href = '/verify.html?cc=' + encodeURIComponent(cardId);
    }
  }

  /* ----------------------------------------------------------------
   * Recipient prefill — only from verified registry source
   * ---------------------------------------------------------------- */
  function prefillFromManifest(manifest) {
    if (!manifest || !manifest.recipient) return;
    var recipientField = el('txRecipient');
    if (recipientField && !recipientField.value) {
      recipientField.value = manifest.recipient;
      recipientField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ----------------------------------------------------------------
   * Manifest verification
   * Returns { ok, reason } — reason is for failureReason field only,
   * not surfaced to the UI directly.
   * ---------------------------------------------------------------- */
  function checkManifestFields(manifest) {
    if (manifest.schema !== 'implicitex.coincard.v1') {
      return { ok: false, reason: 'schema-mismatch' };
    }
    if (!manifest.cardId || !manifest.recipient || !manifest.chainId || !manifest.token) {
      return { ok: false, reason: 'missing-required-fields' };
    }
    // owner is optional but must be a valid object if present
    if (manifest.owner !== undefined && manifest.owner !== null) {
      if (typeof manifest.owner !== 'object' || !manifest.owner.name) {
        return { ok: false, reason: 'owner-malformed' };
      }
    }
    return { ok: true };
  }

  function checkUrlClaims(card, manifest) {
    if (card.recipient && normalizeAddress(card.recipient) !== normalizeAddress(manifest.recipient)) {
      return { ok: false, reason: 'recipient-mismatch' };
    }
    if (card.chain && normalizeChain(card.chain) !== normalizeChain(manifest.chainId)) {
      return { ok: false, reason: 'chain-mismatch' };
    }
    if (card.token && normalizeToken(card.token) !== normalizeToken(manifest.token)) {
      return { ok: false, reason: 'token-mismatch' };
    }
    return { ok: true };
  }

  /* ----------------------------------------------------------------
   * Main fetch-and-verify flow
   * ---------------------------------------------------------------- */
  function verifyCoinCard(card) {
    var url = '/registry/coincards/' + encodeURIComponent(card.cardId) + '.json';

    return fetch(url)
      .then(function (response) {
        if (response.status === 404) {
          return { _notFound: true };
        }
        if (!response.ok) {
          throw new Error('fetch-error-' + response.status);
        }
        return response.json();
      })
      .then(function (manifest) {
        if (manifest._notFound) {
          renderNotFound(card);
          return buildState(card, null, 'unverified', 'url-claim', 'record-not-found');
        }

        // Validate card ID matches manifest (prevents cross-manifest confusion)
        if (manifest.cardId !== card.cardId) {
          renderMismatch(card, manifest);
          return buildState(card, manifest, 'failed', 'url-claim', 'card-id-mismatch');
        }

        // Revoked — do not show recipient, do not prefill
        if (manifest.status === 'revoked') {
          renderRevoked(manifest);
          return buildState(card, manifest, 'revoked', 'registry', null);
        }

        // Validate required manifest fields
        var fieldsCheck = checkManifestFields(manifest);
        if (!fieldsCheck.ok) {
          renderUnverified(card);
          return buildState(card, manifest, 'unverified', 'url-claim', fieldsCheck.reason);
        }

        // Validate status === active
        if (manifest.status !== 'active') {
          renderUnverified(card);
          return buildState(card, manifest, 'unverified', 'url-claim', 'status-not-active');
        }

        // Compare URL claims against manifest (only if provided)
        var claimsCheck = checkUrlClaims(card, manifest);
        if (!claimsCheck.ok) {
          renderMismatch(card, manifest);
          return buildState(card, manifest, 'failed', 'url-claim', claimsCheck.reason);
        }

        // All checks pass — verified
        renderVerified(card, manifest);
        prefillFromManifest(manifest);
        return buildState(card, manifest, 'verified', 'registry', null);
      })
      .catch(function (err) {
        renderUnverified(card);
        return buildState(card, null, 'unverified', 'url-claim', err.message || 'fetch-failed');
      });
  }

  function buildState(card, manifest, verificationStatus, sourceType, failureReason) {
    return {
      cardId:             card.cardId,
      recipient:          card.recipient,
      chain:              card.chain,
      token:              card.token,
      name:               card.name,
      source:             card.source,
      owner:              (manifest && manifest.owner) || null,
      manifest:           manifest || null,
      verificationStatus: verificationStatus,
      sourceType:         sourceType,
      failureReason:      failureReason || null,
    };
  }

  /* ----------------------------------------------------------------
   * Entry point
   * ---------------------------------------------------------------- */
  function init() {
    var card = parseCoinCardParams();

    window.IX = window.IX || {};

    if (!card.cardId) {
      renderNoCard();
      window.IX.coincard = buildState(card, null, 'none', 'none', null);
      return;
    }

    if (!CARD_ID_RE.test(card.cardId)) {
      renderInvalidCard(card.cardId);
      window.IX.coincard = buildState(card, null, 'failed', 'url-claim', 'invalid-card-id');
      return;
    }

    // Show unverified state immediately while fetch is in flight
    renderUnverified(card);
    window.IX.coincard = buildState(card, null, 'unverified', 'url-claim', null);

    verifyCoinCard(card).then(function (state) {
      window.IX.coincard = state;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
