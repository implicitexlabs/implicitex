/**
 * walletconnect-provider.js — WalletConnect / Reown provider module
 *
 * Exposes window.IX_WC, the bridge between wallet.js and the WalletConnect
 * SDK. wallet.js calls IX_WC.init(options) when the user chooses the
 * WalletConnect path. init() returns an EIP-1193 compatible provider that
 * wallet.js passes to setActiveProvider(provider, 'walletconnect').
 *
 * Load order:
 *   1. @walletconnect/ethereum-provider UMD  →  exposes window.EthereumProvider
 *   2. this file                             →  exposes window.IX_WC
 *   3. wallet.js                             →  consumes window.IX_WC
 *
 * The WalletConnect SDK script tag is not present yet. When added, it must
 * appear before this file in index.html.
 *
 * Session identity rule:
 *   Any async operation started through a WalletConnect provider must capture
 *   provider/account/chain identity at the start and verify those values still
 *   match before mutating UI, telemetry, receipts, or transfer state. Relay
 *   latency and background mobile-app switching can deliver events out of order
 *   after the session the operation was started on has changed or expired.
 */

window.IX_WC = (function () {
  'use strict';

  let _provider = null;

  // Returns the WalletConnect project ID from IX_CONFIG, or null if unset.
  function getProjectId() {
    return (window.IX_CONFIG && window.IX_CONFIG.walletConnectProjectId) || null;
  }

  // Returns true when the WalletConnect SDK UMD bundle is loaded and the
  // project ID is configured. wallet.js can use this to decide whether to
  // offer WalletConnect as a connection option.
  function isAvailable() {
    return typeof window.EthereumProvider !== 'undefined' && !!getProjectId();
  }

  /**
   * Initialize the WalletConnect provider and return it. The caller must
   * pass the returned provider to setActiveProvider(provider, 'walletconnect').
   *
   * options:
   *   chainId  — required. Chain ID to connect to (e.g. 137 for Polygon).
   *
   * Throws if the SDK is not loaded or the project ID is not configured.
   */
  async function init(options) {
    const projectId = getProjectId();
    if (!projectId) {
      throw new Error(
        '[IX_WC] walletConnectProjectId is not set in IX_CONFIG. ' +
        'Register a project at cloud.walletconnect.com and set the ID before connecting.'
      );
    }

    if (typeof window.EthereumProvider === 'undefined') {
      throw new Error(
        '[IX_WC] @walletconnect/ethereum-provider is not loaded. ' +
        'Add the SDK script tag before walletconnect-provider.js in index.html.'
      );
    }

    const chainId = (options && options.chainId) || 137;

    _provider = await window.EthereumProvider.init({
      projectId,
      chains: [chainId],
      showQrModal: true,
      metadata: {
        name: 'ImplicitEx',
        description: 'Wallet-to-wallet USDC transfers on Polygon.',
        url: 'https://implicitex.com',
        icons: ['https://implicitex.com/brand/icon-512.png'],
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
   * disconnect — clearing local wallet state alone is not sufficient for
   * WalletConnect. The relay session must be explicitly terminated.
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
    isAvailable,
    init,
    getProvider,
    disconnect,
  };

}());
