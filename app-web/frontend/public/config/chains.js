/**
 * config/chains.js — ImplicitEx chain configuration
 *
 * Hardened pre-public contract smoke-verified 2026-05-11.
 * All four balance deltas confirmed on-chain before this gate was opened.
 *
 * ── FEE CAP GATE ─────────────────────────────────────────────────────────────
 * Platform fee policy: 1%, maximum 10 USDC (activates at 1,000 USDC transfers).
 *
 * The deployed contract (0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0) does NOT
 * yet enforce the 10 USDC cap. The frontend mirrors the approved policy, but the
 * contract remains the authority at execution time.
 *
 * DO NOT raise maxTransferUsdc above 1,000 on any chain until:
 *   1. The independently reviewed fee-cap contract revision is deployed.
 *   2. contractAddress below is updated to the new contract address.
 *   3. The fee cap review brief has been completed (docs/product/fee-constitution.md).
 *
 * At the current 250 USDC ceiling, the cap cannot activate (max fee = 2.50 USDC).
 * A ceiling above 1,000 USDC with the old contract would allow the contract to
 * charge more than the portal previews — a violation of the evidence architecture.
 * ─────────────────────────────────────────────────────────────────────────────
 */

window.IX_CONFIG = {
  transfersEnabled: true,

  // WalletConnect / Reown Project ID from cloud.walletconnect.com.
  // Public client identifier — safe to commit. Not a secret.
  walletConnectProjectId: '0538feccd78aacaf3bda61038db1f65a',
};

window.IX_CHAINS = {
  // Polygon Mainnet (chain ID 137)
  137: {
    name:              'Polygon',
    rpcUrl:            'https://polygon-bor-rpc.publicnode.com',  // public, no key required; polygon-rpc.com disabled unauthenticated access 2026-06
    explorerUrl:       'https://polygonscan.com',
    usdcAddress:       '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Circle native USDC on Polygon PoS
    contractAddress:   '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
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
