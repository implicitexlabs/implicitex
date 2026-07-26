/**
 * metamask-connect-provider.js — MetaMask Connect EVM adapter
 *
 * Exposes window.IX_MM_CONNECT, the bridge between portal-index.html and the
 * MetaMask Connect EVM SDK. The vendor bundle (~718 KB) is lazy-loaded on first
 * call to IX_MM_CONNECT.connect(). MetaMask-extension users on desktop never
 * pay the load cost — wallet.js detects window.ethereum and handles them via
 * the injected path before this module is invoked.
 *
 * API:
 *   IX_MM_CONNECT.connect()      → Promise<EIP-1193 provider>
 *   IX_MM_CONNECT.disconnect()   → Promise<void>
 *   IX_MM_CONNECT.getProvider()  → EIP-1193 provider | null
 *   IX_MM_CONNECT.isConnecting() → boolean
 *   IX_MM_CONNECT.isMobile()     → boolean
 *
 * SDK loading:
 *   The IIFE bundle registers itself under window.MetaMaskConnectEVM.
 *   createEVMClient is the factory function — it is async and requires
 *   api.supportedNetworks (hex chainId → RPC URL map).
 *
 *   Vendored: @metamask/connect-evm@2.1.1
 *   Built:    esbuild --format=iife --global-name=MetaMaskConnectEVM
 *   File:     js/vendor/metamask-connect-evm.browser.js (same-origin)
 *   To rebuild: npm run build:metamask-connect
 *
 * Load order:
 *   config/chains.js (IX_CHAINS, IX_CONFIG)
 *   → walletconnect-provider.js (IX_WC)
 *   → metamask-connect-provider.js (IX_MM_CONNECT)
 *   → wallet.js
 *
 * Session identity rule:
 *   Any async operation started through the MetaMask Connect provider must
 *   capture account and chain identity at start and verify those values still
 *   match before mutating UI, receipts, or transfer state.
 */

window.IX_MM_CONNECT = (function () {
  'use strict';

  // Same-origin self-hosted bundle. To update: npm run build:metamask-connect.
  var VENDOR_URL = 'js/vendor/metamask-connect-evm.browser.js';

  var _bundlePromise = null; // dedup guard — concurrent connect() calls share one load
  var _client       = null; // createEVMClient() instance (one per session)
  var _provider     = null; // EIP-1193 provider returned by _client.getProvider()
  var _connecting   = false; // in-flight guard

  // Build the supportedNetworks map required by createEVMClient from IX_CHAINS.
  // IX_CHAINS is keyed by numeric chainId; MetaMask Connect wants hex keys.
  function buildSupportedNetworks() {
    var networks = {};
    if (window.IX_CHAINS) {
      Object.keys(window.IX_CHAINS).forEach(function (numericId) {
        var chain = window.IX_CHAINS[numericId];
        if (chain && chain.rpcUrl) {
          var hexId = '0x' + Number(numericId).toString(16);
          networks[hexId] = chain.rpcUrl;
        }
      });
    }
    // Ensure at least Polygon Mainnet is present as a fallback.
    if (!networks['0x89']) {
      networks['0x89'] = 'https://polygon-bor-rpc.publicnode.com';
    }
    return networks;
  }

  // Returns hex chainIds for the connect() call — the keys of supportedNetworks.
  function getSupportedChainIds(networks) {
    return Object.keys(networks);
  }

  // Injects the vendor bundle as a script tag and waits for window.MetaMaskConnectEVM.
  // Subsequent calls return the same in-flight promise — no duplicate loads.
  function loadBundle() {
    if (_bundlePromise) return _bundlePromise;

    _bundlePromise = new Promise(function (resolve, reject) {
      if (window.MetaMaskConnectEVM) {
        resolve(window.MetaMaskConnectEVM);
        return;
      }
      var script = document.createElement('script');
      script.src = VENDOR_URL;
      script.onload = function () {
        if (window.MetaMaskConnectEVM) {
          resolve(window.MetaMaskConnectEVM);
        } else {
          reject(new Error(
            '[IX_MM_CONNECT] Bundle loaded but MetaMaskConnectEVM not found on window. ' +
            'The bundle shape may have changed.'
          ));
        }
      };
      script.onerror = function () {
        _bundlePromise = null; // allow retry on next call
        reject(new Error('[IX_MM_CONNECT] Failed to load vendor bundle from ' + VENDOR_URL));
      };
      document.head.appendChild(script);
    });

    return _bundlePromise;
  }

  /**
   * Load the vendor bundle, create the MetaMask Connect client, connect to
   * MetaMask, and return an EIP-1193 provider. Reuses the client across calls
   * within the same session. Throws on user rejection or hard failure.
   */
  async function connect() {
    if (_connecting) throw new Error('[IX_MM_CONNECT] Connection already in progress');
    _connecting = true;

    try {
      var MMConnect = await loadBundle();
      var networks  = buildSupportedNetworks();
      var chainIds  = getSupportedChainIds(networks);

      // Create client once per session.
      if (!_client) {
        _client = await MMConnect.createEVMClient({
          dapp: {
            name: 'ImplicitEx',
            url:  window.location.origin,
          },
          api: {
            supportedNetworks: networks,
          },
        });
      }

      // connect() establishes the MetaMask session and returns accounts + chainId.
      // On desktop with the extension installed, the provider is already present
      // in window.ethereum and the caller should not reach this path — wallet.js
      // handles the injected path. On mobile, this opens MetaMask via deeplink.
      await _client.connect({ chainIds: chainIds });

      _provider = _client.getProvider();
      _connecting = false;
      return _provider;

    } catch (e) {
      _connecting = false;

      var msg = (e && e.message) ? e.message.toLowerCase() : '';
      var isUserRejection = (e && e.code === 4001) ||
        msg.includes('user rejected') ||
        msg.includes('user cancelled') ||
        msg.includes('user closed') ||
        msg.includes('connection request reset');

      if (isUserRejection) {
        // Clean cancel: keep the client alive so MetaMask does not need to
        // re-establish the SDK session on the next attempt.
      } else {
        // Hard failure: discard client and allow full re-init on retry.
        _client        = null;
        _provider      = null;
        _bundlePromise = null;
      }

      throw e;
    }
  }

  /**
   * Disconnect the active MetaMask Connect session. Must be called on user
   * disconnect — clearing local wallet state alone is not sufficient.
   */
  async function disconnect() {
    if (_client && typeof _client.disconnect === 'function') {
      try {
        await _client.disconnect();
      } catch (_) {
        // Session may already be closed.
      }
    }
    _client    = null;
    _provider  = null;
    _connecting = false;
    // Keep _bundlePromise — vendor bundle stays cached in the browser.
  }

  // Returns the active EIP-1193 provider, or null if not yet connected.
  function getProvider() {
    return _provider;
  }

  // Returns true while a connect() call is in flight.
  function isConnecting() {
    return _connecting;
  }

  // Returns true on mobile browsers where the injected MetaMask extension
  // is not available and the Connect SDK deeplink path is needed.
  function isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  return {
    connect:      connect,
    disconnect:   disconnect,
    getProvider:  getProvider,
    isConnecting: isConnecting,
    isMobile:     isMobile,
  };

}());
