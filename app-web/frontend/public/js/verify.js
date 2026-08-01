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

  function getPrimaryContractConfig() {
    var root = document.querySelector('[data-contract-evidence]');
    var chainId = root && root.getAttribute('data-chain-id');
    var chains = window.IX_CHAINS || {};
    var config = chainId ? chains[chainId] : null;

    if (!chainId || !config || !config.contractAddress || !config.explorerUrl) return null;
    return {
      chainId: chainId,
      name: config.name || ('Chain ' + chainId),
      explorerUrl: config.explorerUrl.replace(/\/$/, ''),
      contractAddress: config.contractAddress,
      usdcAddress: config.usdcAddress || '',
      feeBasisPoints: config.feeBasisPoints,
    };
  }

  function setText(selector, text) {
    var nodes = document.querySelectorAll(selector);
    nodes.forEach(function (node) { node.textContent = text; });
  }

  function setHref(selector, href) {
    var nodes = document.querySelectorAll(selector);
    nodes.forEach(function (node) { node.href = href; });
  }

  function setLinkDisabled(selector, disabled) {
    var nodes = document.querySelectorAll(selector);
    nodes.forEach(function (node) {
      if (disabled) {
        node.removeAttribute('href');
        node.setAttribute('aria-disabled', 'true');
      } else {
        node.removeAttribute('aria-disabled');
      }
    });
  }

  function displayNetworkName(config) {
    if (String(config.chainId) === '137' && config.name === 'Polygon') {
      return 'Polygon Mainnet';
    }
    return config.name;
  }

  function displayFee(config) {
    if (typeof config.feeBasisPoints !== 'number') return 'Fee configured';
    var percent = config.feeBasisPoints / 100;
    var formatted = percent.toFixed(4).replace(/\.?0+$/, '');
    return formatted + '% additive fee, max 10 USDC';
  }

  function populateContractEvidence() {
    var config = getPrimaryContractConfig();
    var copyBtn = document.querySelector('[data-copy-contract]');
    var explorerLink = document.querySelector('[data-contract-explorer-link]');
    if (!config) {
      setText('[data-contract-network]', 'Network unavailable');
      setText('[data-contract-chain]', 'Chain unavailable');
      setText('[data-contract-asset]', 'Asset unavailable');
      setText('[data-contract-fee]', 'Fee unavailable');
      setText('[data-contract-status]', 'Configuration unavailable');
      setText('[data-contract-address-value]', 'Contract configuration unavailable.');
      setText('[data-contract-address-link]', 'Contract address unavailable');
      setText('[data-contract-source-link]', 'Source link unavailable');
      setText('[data-usdc-address-link]', 'USDC address unavailable');
      setLinkDisabled('[data-contract-address-link]', true);
      setLinkDisabled('[data-contract-source-link]', true);
      setLinkDisabled('[data-usdc-address-link]', true);
      if (copyBtn) {
        copyBtn.disabled = true;
        copyBtn.removeAttribute('data-copy-value');
      }
      if (explorerLink) {
        explorerLink.hidden = true;
        explorerLink.removeAttribute('href');
        explorerLink.setAttribute('aria-disabled', 'true');
      }
      return;
    }

    var networkName = displayNetworkName(config);
    var addressUrl = config.explorerUrl + '/address/' + config.contractAddress + '#code';
    var usdcUrl = config.usdcAddress
      ? config.explorerUrl + '/address/' + config.usdcAddress
      : config.explorerUrl;

    setText('[data-contract-network]', networkName);
    setText('[data-contract-chain]', 'Chain ID ' + config.chainId);
    setText('[data-contract-asset]', config.usdcAddress ? 'USDC' : 'Asset configured');
    setText('[data-contract-fee]', displayFee(config));
    setText('[data-contract-status]', 'Canonical Contract');
    setText('[data-contract-address-value]', config.contractAddress);
    setText('[data-contract-address-link]', config.contractAddress);
    setText('[data-contract-source-link]', 'View source on Polygonscan');
    if (config.usdcAddress) {
      setText('[data-usdc-address-link]', config.usdcAddress);
    } else {
      setText('[data-usdc-address-link]', 'USDC address unavailable');
    }
    setHref('[data-contract-explorer-link]', addressUrl);
    setHref('[data-contract-address-link]', addressUrl);
    setHref('[data-contract-source-link]', addressUrl);
    setLinkDisabled('[data-contract-address-link]', false);
    setLinkDisabled('[data-contract-source-link]', false);
    if (config.usdcAddress) {
      setHref('[data-usdc-address-link]', usdcUrl);
      setLinkDisabled('[data-usdc-address-link]', false);
    } else {
      setLinkDisabled('[data-usdc-address-link]', true);
    }

    if (copyBtn) {
      copyBtn.disabled = false;
      copyBtn.setAttribute('data-copy-value', config.contractAddress);
    }
    if (explorerLink) {
      explorerLink.hidden = false;
      explorerLink.removeAttribute('aria-disabled');
    }
  }

  function initContractCopy() {
    var btn = document.querySelector('[data-copy-contract]');
    var status = el('contractCopyStatus');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy-value') || '';
      var original = btn.textContent;

      function copied() {
        btn.textContent = 'Copied';
        if (status) status.textContent = 'Address copied.';
        setTimeout(function () {
          btn.textContent = original;
          if (status) status.textContent = '';
        }, 2200);
      }

      function failed() {
        if (status) status.textContent = 'Copy unavailable. Select the address manually.';
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(copied).catch(failed);
      } else {
        failed();
      }
    });
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var cardId = (params.get('cc') || '').trim();

    populateContractEvidence();
    initContractCopy();

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
