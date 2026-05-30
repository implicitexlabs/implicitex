/**
 * walletconnect-provider.js — WalletConnect / Reown provider module
 *
 * Exposes window.IX_WC, the bridge between wallet.js and the WalletConnect
 * SDK. wallet.js calls IX_WC.init(options) when the user chooses the
 * WalletConnect path. init() returns an EIP-1193 compatible provider that
 * wallet.js passes to setActiveProvider(provider, 'walletconnect').
 *
 * SDK loading:
 *   The @walletconnect/ethereum-provider UMD bundle (~1.8 MB) is self-hosted
 *   at js/vendor/ and is NOT loaded on page load. IX_WC.init() triggers a
 *   single dynamic script injection on first use. MetaMask/injected-provider
 *   users never pay the load cost.
 *
 *   The UMD bundle registers the module under window["@walletconnect/ethereum-provider"].
 *   EthereumProvider is a named export on that object (bracket notation required).
 *
 *   Vendored: @walletconnect/ethereum-provider@2.23.9
 *   Source:   https://registry.npmjs.org/@walletconnect/ethereum-provider/-/ethereum-provider-2.23.9.tgz
 *   File:     dist/index.umd.js (unmodified, same-origin — no SRI required)
 *   To update: npm pack @walletconnect/ethereum-provider@<version>, extract
 *              dist/index.umd.js, rename with version, update SDK_URL below.
 *
 * Load order:
 *   chains.js (IX_CONFIG.walletConnectProjectId) → walletconnect-provider.js (IX_WC)
 *   → wallet.js (calls IX_WC.init() on WalletConnect path)
 *
 * Session identity rule:
 *   Any async operation started through a WalletConnect provider must capture
 *   provider/account/chain identity at start and verify those values still
 *   match before mutating UI, telemetry, receipts, or transfer state. Relay
 *   latency and mobile-app backgrounding can deliver events out of order after
 *   the session has changed or expired.
 */

window.IX_WC = (function () {
  'use strict';

  // Self-hosted, same-origin. To update: npm pack the new version, extract
  // dist/index.umd.js, rename with version suffix, update this path.
  var SDK_URL = 'js/vendor/walletconnect-ethereum-provider@2.23.9.umd.js';

  var _provider = null;
  var _sdkPromise = null; // dedup guard — concurrent init() calls share one load

  // Returns the WalletConnect project ID from IX_CONFIG, or null if unset.
  function getProjectId() {
    return (window.IX_CONFIG && window.IX_CONFIG.walletConnectProjectId) || null;
  }

  // Returns the EthereumProvider class from the already-loaded UMD bundle,
  // or null if the SDK has not been loaded yet.
  function getSDKClass() {
    var mod = window['@walletconnect/ethereum-provider'];
    return (mod && mod.EthereumProvider) || null;
  }

  // Injects the WalletConnect SDK UMD bundle as a script tag and waits for it.
  // Returns a Promise that resolves with the EthereumProvider class.
  // Subsequent calls return the same in-flight promise — no duplicate loads.
  function loadSDK() {
    var cls = getSDKClass();
    if (cls) return Promise.resolve(cls);
    if (_sdkPromise) return _sdkPromise;

    _sdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = SDK_URL;
      script.onload = function () {
        var loaded = getSDKClass();
        if (loaded) {
          resolve(loaded);
        } else {
          reject(new Error(
            '[IX_WC] SDK script loaded but EthereumProvider was not found on ' +
            'window[\'@walletconnect/ethereum-provider\']. ' +
            'The bundle shape may have changed.'
          ));
        }
      };
      script.onerror = function () {
        _sdkPromise = null; // allow retry on next call
        reject(new Error('[IX_WC] Failed to load WalletConnect SDK from ' + SDK_URL));
      };
      document.head.appendChild(script);
    });

    return _sdkPromise;
  }

  // Returns true when a project ID is configured.
  // SDK load happens on demand inside init(); isAvailable() does not require
  // the SDK to be present — only the project ID.
  function isAvailable() {
    return !!getProjectId();
  }

  /**
   * Initialize the WalletConnect provider and return it. Lazy-loads the SDK
   * if it has not been loaded yet. The caller must pass the returned provider
   * to setActiveProvider(provider, 'walletconnect').
   *
   * options:
   *   chainId — required. Chain ID to connect to (e.g. 137 for Polygon).
   *
   * Throws if the project ID is not configured or the SDK fails to load.
   */
  async function init(options) {
    var projectId = getProjectId();
    if (!projectId) {
      throw new Error(
        '[IX_WC] walletConnectProjectId is not set in IX_CONFIG. ' +
        'Register a project at cloud.walletconnect.com and add the ID before connecting.'
      );
    }

    var EthereumProvider = await loadSDK();
    var chainId = (options && options.chainId) || 137;

    // metadata.url must match the actual page origin.
    // Using window.location.origin works for both localhost dev and production.
    var origin = window.location.origin;

    _provider = await EthereumProvider.init({
      projectId: projectId,
      // optionalChains is recommended over required chains for wallet compatibility.
      // ImplicitEx handles wrong-network state in wallet.js after connection.
      optionalChains: [chainId],
      showQrModal: true,
      metadata: {
        name: 'ImplicitEx',
        description: 'Wallet-to-wallet USDC transfers on Polygon.',
        url: origin,
        icons: [origin + '/brand/icon-512.png'],
      },
    });

    return _provider;
  }

  // Returns the initialized WalletConnect provider, or null if not yet init'd.
  function getProvider() {
    return _provider;
  }

  /**
   * Disconnect the active WalletConnect session. Must be called on user
   * disconnect — clearing local wallet state alone is not sufficient.
   * The relay session must be explicitly terminated on the WalletConnect side.
   */
  async function disconnect() {
    if (_provider && typeof _provider.disconnect === 'function') {
      try {
        await _provider.disconnect();
      } catch (_) {
        // Session may already be closed on the relay side.
      }
    }
    _provider = null;
  }

  return {
    isAvailable: isAvailable,
    init: init,
    getProvider: getProvider,
    disconnect: disconnect,
  };

}());
