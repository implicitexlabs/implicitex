/**
 * config/chains.js — ImplicitEx chain configuration
 *
 * Hardened pre-public contract smoke-verified 2026-05-11.
 * All four balance deltas confirmed on-chain before this gate was opened.
 */

window.IX_CONFIG = {
  transfersEnabled: false,

  // WalletConnect / Reown Project ID from cloud.walletconnect.com.
  // Public client identifier — safe to commit. Not a secret.
  walletConnectProjectId: '0538feccd78aacaf3bda61038db1f65a',
};

window.IX_CHAINS = {
  // Polygon Mainnet (chain ID 137)
  137: {
    name:              'Polygon',
    rpcUrl:            'https://polygon-rpc.com',   // public, no key required
    explorerUrl:       'https://polygonscan.com',
    usdcAddress:       '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Circle native USDC on Polygon PoS
    contractAddress:   '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
    feeBasisPoints:    100,    // 1%
    minTransferUsdc:   1,      // $1 USDC minimum
    maxTransferUsdc:   250,    // $250 cap during soft launch
    transfersEnabled:  false,
  },

  // Polygon Amoy Testnet (chain ID 80002)
  // Populate after testnet deploy using runbook
  80002: {
    name:              'Polygon Amoy (Testnet)',
    rpcUrl:            'https://rpc-amoy.polygon.technology', // public, no key required
    explorerUrl:       'https://amoy.polygonscan.com',
    usdcAddress:       '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Circle official testnet USDC
    contractAddress:   null,   // Set after testnet deploy
    feeBasisPoints:    100,
    minTransferUsdc:   1,
    maxTransferUsdc:   250,
    transfersEnabled:  false,
  },
};
