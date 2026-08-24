(function exposeWalletConnector(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IXIDWalletConnector = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildWalletConnector() {
  'use strict';

  // Polygon mainnet chain ID (decimal 137 = hex 0x89).
  var POLYGON_MAINNET_CHAIN_ID = 137;

  // Returns the injected EIP-1193 provider, or null if absent.
  function getDefaultProvider() {
    return (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null;
  }

  // EVM address: 0x followed by exactly 40 hex characters.
  function isHexAddress(addr) {
    return typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr);
  }

  // Normalise to lowercase (EIP-55 checksum accepted but not required in this slice).
  function normalizeAddress(addr) {
    return isHexAddress(addr) ? addr.toLowerCase() : null;
  }

  // Accept decimal or 0x-prefixed hex chain ID representations.
  function parseChainId(raw) {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      if (raw.startsWith('0x') || raw.startsWith('0X')) return parseInt(raw, 16);
      var n = parseInt(raw, 10);
      return isNaN(n) ? null : n;
    }
    return null;
  }

  // Factory. Returns a frozen connector configured for the declared chain.
  //
  // options.chainId      — expected chain ID integer (default: 137, Polygon mainnet)
  // options.providerGetter — zero-arg fn returning an EIP-1193 provider or null
  //                         (default: () => window.ethereum)
  function createWalletConnector(options) {
    var opts = options || {};
    var expectedChainId = typeof opts.chainId === 'number'
      ? opts.chainId
      : POLYGON_MAINNET_CHAIN_ID;
    var providerGetter = typeof opts.providerGetter === 'function'
      ? opts.providerGetter
      : getDefaultProvider;

    return Object.freeze({

      // True if an EIP-1193 provider is present in the environment.
      isAvailable: function isAvailable() {
        return providerGetter() != null;
      },

      // True if addr is a syntactically valid EVM hex address.
      validateAddress: function validateAddress(addr) {
        return isHexAddress(addr);
      },

      // True if chainId (decimal integer or 0x hex string) equals expectedChainId.
      validateChainId: function validateChainId(chainId) {
        return parseChainId(chainId) === expectedChainId;
      },

      // Request wallet connection via the injected EIP-1193 provider.
      //
      // Resolves with one of:
      //   { rejected: false, address: string, chainId: number }   — success
      //   { rejected: true,  reason: string, ... }                — any failure
      //
      // Never rejects — all failure paths return a resolved value so callers
      // do not need a catch block for ordinary rejection cases.
      connect: function connect() {
        var provider = providerGetter();
        if (!provider) {
          return Promise.resolve({ rejected: true, reason: 'no_provider' });
        }

        return provider.request({ method: 'eth_requestAccounts' }).then(
          function onAccounts(accounts) {
            if (!Array.isArray(accounts) || accounts.length === 0) {
              return { rejected: true, reason: 'no_accounts' };
            }
            var raw = accounts[0];
            var address = normalizeAddress(raw);
            if (!address) {
              return { rejected: true, reason: 'invalid_address' };
            }
            return provider.request({ method: 'eth_chainId' }).then(
              function onChainId(rawChainId) {
                var chainId = parseChainId(rawChainId);
                if (chainId !== expectedChainId) {
                  return {
                    rejected: true,
                    reason: 'wrong_chain',
                    chainId: chainId,
                    expected: expectedChainId,
                  };
                }
                return { rejected: false, address: address, chainId: chainId };
              },
              function onChainError() {
                return { rejected: true, reason: 'chain_read_failed' };
              }
            );
          },
          function onRequestError(err) {
            // EIP-1193 user-rejection: error code 4001.
            return { rejected: true, reason: 'user_rejected', code: err && err.code };
          }
        );
      },
    });
  }

  return Object.freeze({
    POLYGON_MAINNET_CHAIN_ID: POLYGON_MAINNET_CHAIN_ID,
    createWalletConnector: createWalletConnector,
  });
}));
