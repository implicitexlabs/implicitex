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
  transfersEnabled: false,
};

window.IX_CHAINS = {
  // Polygon Mainnet (chain ID 137)
  // Populate only after production readiness and mainnet deploy signoff.
  137: {
    name:              'Polygon',
    rpcUrl:            null,
    explorerUrl:       'https://polygonscan.com',
    usdcAddress:       null,   // Set after deploy
    contractAddress:   null,   // Set after deploy
    feeBasisPoints:    100,    // 1%
    minTransferUsdc:   1,      // $1 USDC minimum
    maxTransferUsdc:   250,    // $250 cap during soft launch
    transfersEnabled:  false,
  },

  // Polygon Amoy Testnet (chain ID 80002)
  // Populate after testnet deploy using runbook
  80002: {
    name:              'Polygon Amoy (Testnet)',
    rpcUrl:            null,
    explorerUrl:       'https://amoy.polygonscan.com',
    usdcAddress:       null,   // Set after testnet deploy
    contractAddress:   null,   // Set after testnet deploy
    feeBasisPoints:    100,
    minTransferUsdc:   1,
    maxTransferUsdc:   250,
    transfersEnabled:  false,
  },
};
