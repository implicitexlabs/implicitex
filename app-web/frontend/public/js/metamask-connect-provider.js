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
 *
 * connect() return contract:
 *   On success: returns an EIP-1193 provider (EIP1193Provider from the SDK).
 *   The provider does NOT set isMetaMask: true — the portal click handler sets
 *   window.ethereum = mmProvider before calling IX.connect(), which uses the
 *   standard hasInjectedProvider() check (window.ethereum + .request present).
 *
 * connect() resolution:
 *   _client.connect({ chainIds }) resolves to { accounts, chainId } once the
 *   user approves in MetaMask. If the relay stalls, a 90 s timeout converts the
 *   silent hang into an explicit rejection that the click handler can surface.
 */

window.IX_MM_CONNECT = (function () {
  'use strict';

  // Same-origin self-hosted bundle. To update: npm run build:metamask-connect.
  var VENDOR_URL = 'js/vendor/metamask-connect-evm.browser.js';

  // 90 seconds: long enough for the MetaMask mobile deeplink round-trip across
  // slow connections, short enough to surface a relay failure rather than hang.
  var CONNECT_TIMEOUT_MS = 90000;

  var _bundlePromise = null; // dedup guard — concurrent connect() calls share one load
  var _client       = null; // createEVMClient() instance (one per session)
  var _provider     = null; // EIP-1193 provider returned by _client.getProvider()
  var _connecting   = false; // in-flight guard

  // Build the supportedNetworks map required by createEVMClient from IX_CHAINS.
  // IX_CHAINS is keyed by numeric chainId; MetaMask Connect wants hex keys.
  // Always includes Polygon Mainnet so connect() has a known-good network even
  // when IX_CHAINS is not yet loaded or contains only testnet entries.
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
    // Ensure Polygon Mainnet is present — required for production transfers.
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
   *
   * Resolution path:
   *   1. Load IIFE bundle → MetaMaskConnectEVM on window
   *   2. createEVMClient({ dapp, api }) → _client (once per session)
   *   3. _client.connect({ chainIds }) → { accounts, chainId } on approval
   *   4. _client.getProvider() → EIP-1193 provider
   *   5. Return provider — caller sets window.ethereum, then calls IX.connect()
   *
   * The 90 s timeout races against step 3. If the MetaMask relay does not
   * complete the handshake within 90 s the promise rejects with a named error
   * instead of hanging until the page is closed.
   */
  async function connect() {
    if (_connecting) {
      console.warn('[IX:MMC] already connecting');
      throw new Error('[IX_MM_CONNECT] Connection already in progress');
    }
    _connecting = true;
    console.warn('[IX:MMC] bundle-loading');

    try {
      var MMConnect = await loadBundle();
      console.warn('[IX:MMC] bundle-loaded', Object.keys(MMConnect));

      var networks = buildSupportedNetworks();
      var chainIds = getSupportedChainIds(networks);
      console.warn('[IX:MMC] networks', JSON.stringify(networks));

      // Create client once per session.
      if (!_client) {
        console.warn('[IX:MMC] client-initializing');
        _client = await MMConnect.createEVMClient({
          dapp: {
            name: 'ImplicitEx',
            url:  window.location.origin,
          },
          api: {
            supportedNetworks: networks,
          },
        });
        console.warn('[IX:MMC] client-initialized status:', _client.status);
      } else {
        console.warn('[IX:MMC] client-reused status:', _client.status);
      }

      // _client.connect({ chainIds }) resolves to { accounts, chainId } once the
      // user approves the connection inside MetaMask. A 90 s timeout converts a
      // relay stall (silent hang) into an explicit rejection.
      console.warn('[IX:MMC] connect-requested chainIds:', chainIds);
      var connectResult = await Promise.race([
        _client.connect({ chainIds: chainIds }).then(function (r) {
          console.warn('[IX:MMC] connect-resolved', JSON.stringify(r));
          return r;
        }),
        new Promise(function (_, reject) {
          setTimeout(function () {
            console.warn('[IX:MMC] connect-timeout after', CONNECT_TIMEOUT_MS, 'ms');
            reject(new Error('[IX_MM_CONNECT] MetaMask Connect timeout — relay did not complete'));
          }, CONNECT_TIMEOUT_MS);
        }),
      ]);

      // getProvider() returns the EIP-1193 provider that wraps the SDK session.
      // The provider has .request() and emits EIP-1193 events but does NOT set
      // isMetaMask: true. The caller sets window.ethereum = mmProvider before
      // calling IX.connect() so wallet.js's hasInjectedProvider() returns true.
      console.warn('[IX:MMC] provider-installing');
      _provider = _client.getProvider();
      console.warn('[IX:MMC] provider-installed',
        'typeof:', typeof _provider,
        'isMetaMask:', _provider && _provider.isMetaMask,
        'request:', typeof (_provider && _provider.request),
        'accounts:', connectResult && connectResult.accounts,
        'chainId:', connectResult && connectResult.chainId
      );

      _connecting = false;
      console.warn('[IX:MMC] connected');
      return _provider;

    } catch (e) {
      console.warn('[IX:MMC] connect-error', e && e.message, e && e.code);
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
        console.warn('[IX:MMC] user-rejected — client preserved');
      } else {
        // Hard failure (including timeout): discard client and allow full
        // re-init on retry so the SDK session is not left in a broken state.
        console.warn('[IX:MMC] hard-failure — client discarded');
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
        console.warn('[IX:MMC] disconnected');
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
