/**
 * config/chains.js — ImplicitEx chain configuration
 *
 * transfersEnabled: false until testnet smoke passes.
 * Do not set to true on mainnet until:
 *   - Amoy testnet smoke complete
 *   - approve + transferWithFee verified
 *   - fee routing to treasury confirmed
 *   - receipt display confirmed
 */

window.IX_CONFIG = {
  transfersEnabled: true,
};

window.IX_CHAINS = {
  // Polygon Mainnet (chain ID 137)
  // Populate only after production readiness and mainnet deploy signoff.
  137: {
    name:              'Polygon',
    rpcUrl:            'https://polygon-rpc.com',   // public, no key required
    explorerUrl:       'https://polygonscan.com',
    usdcAddress:       '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Circle native USDC on Polygon PoS
    contractAddress:   '0x2e4256F0cf732d081994d6ddF6188Ca0aB805930', // deployed 2026-05-11
    feeBasisPoints:    100,    // 1%
    minTransferUsdc:   1,      // $1 USDC minimum
    maxTransferUsdc:   250,    // $250 cap during soft launch
    transfersEnabled:  true,
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
