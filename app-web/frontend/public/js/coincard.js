/* coincard.js — Coin Card verification panel
 *
 * Reads Coin Card claims from URL query params and populates
 * the 03 — Verification panel in the Transfer Portal.
 *
 * TRUST MODEL:
 *   URL params are transport.
 *   Registry manifest is evidence.
 *   Wallet confirmation is execution.
 *   Chain event is final settlement proof.
 *
 * URL params produce claims (sourceType: 'url-claim').
 * A registry fetch produces verified state (sourceType: 'registry').
 * This module handles only the url-claim layer.
 *
 * Expected params:
 *   cc    — Card ID (e.g. cc_8F2K)
 *   to    — recipient wallet address (UNVERIFIED CLAIM until registry confirms)
 *   chain — chain ID (e.g. 137)
 *   token — token symbol (e.g. usdc)
 *   name  — display name (optional, future use)
 *   src   — source domain (optional)
 *
 * verificationStatus values:
 *   'none'       — no cc param present
 *   'unverified' — cc param present, registry not checked
 *   'verified'   — registry confirmed all claims (future)
 *   'failed'     — registry found but claims mismatch (future)
 *   'revoked'    — registry confirmed card is revoked (future)
 */

(function () {
  'use strict';

  var CHAIN_NAMES = {
    '137':   'Polygon',
    '80002': 'Polygon Amoy',
    '1':     'Ethereum',
  };

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

  function truncateAddress(addr) {
    if (!addr || addr.length < 12) return addr;
    return addr.slice(0, 6) + '\u2026' + addr.slice(-4);
  }

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

  function populatePanel(card) {
    var statusEl = el('cardStatus');
    if (!statusEl) return;

    if (!card.cardId) {
      statusEl.textContent = 'No card';
      statusEl.className = 'data-v';
      return;
    }

    // Card claims present from URL — registry not yet checked
    statusEl.textContent = 'Card detected — not verified';
    statusEl.className = 'data-v card-status--unverified';

    showRow('cardIdRow', 'cardIdDisplay', card.cardId);

    if (card.recipient) {
      showRow('cardRecipientRow', 'cardRecipientDisplay',
        truncateAddress(card.recipient), card.recipient);
    }

    if (card.chain) {
      showRow('cardChainRow', 'cardChainDisplay',
        CHAIN_NAMES[card.chain] || 'Chain ' + card.chain);
    }

    if (card.token) {
      showRow('cardTokenRow', 'cardTokenDisplay', card.token.toUpperCase());
    }

    if (card.source) {
      showRow('cardDomainRow', 'cardDomainDisplay', card.source);
    }

    showRow('cardRegistryRow', 'cardRegistryDisplay', 'Registry unavailable');

    var footer = el('cardVerifyFooter');
    if (footer) {
      footer.hidden = false;
      var link = el('cardVerifyLink');
      if (link) {
        link.href = '/verify.html?cc=' + encodeURIComponent(card.cardId);
      }
    }
  }

  function prefillTransferField(card) {
    if (!card.recipient) return;
    var recipientField = el('txRecipient');
    if (recipientField && !recipientField.value) {
      recipientField.value = card.recipient;
      // Notify wallet.js validation listeners
      recipientField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function init() {
    var card = parseCoinCardParams();

    // Attach explicit trust-layer metadata before exposing on window.IX
    card.verificationStatus = card.cardId ? 'unverified' : 'none';
    card.sourceType         = card.cardId ? 'url-claim'  : 'none';

    populatePanel(card);
    prefillTransferField(card);

    // Expose on window.IX so other modules can read card state and trust level
    window.IX = window.IX || {};
    window.IX.coincard = card;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
