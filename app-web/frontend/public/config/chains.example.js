// Example shape — copy to chains.js after testnet deploy and populate real addresses.
// Do NOT commit real addresses in this file.
// chains.js is gitignored once real addresses are present; this file documents the shape only.
//
// Required fields per chain entry:
//   name            — display name shown in UI
//   usdcAddress     — USDC token contract address on this network
//   implicitExAddress — deployed ImplicitEx contract address on this network
//   explorerUrl     — block explorer base URL (used to build receipt links)
//
// Set transfersEnabled: true only after testnet signoff criteria in
// docs/architecture/testnet-readiness-plan-2026-04-30.md are satisfied.

const ImplicitExChains = {
  transfersEnabled: false, // Gate: set true only after testnet signoff
  supportedChains: {
    "0x13882": { // Polygon Amoy testnet (chainId 80002)
      name: "Polygon Amoy",
      usdcAddress: "0x<TESTNET_USDC_CONTRACT_ADDRESS>",
      implicitExAddress: "0x<IMPLICITEX_CONTRACT_ADDRESS>",
      explorerUrl: "https://amoy.polygonscan.com"
    },
    "0x89": { // Polygon Mainnet (chainId 137) — reserved, not active
      name: "Polygon",
      usdcAddress: "0x<USDC_CONTRACT_ADDRESS>",
      implicitExAddress: "0x<IMPLICITEX_CONTRACT_ADDRESS>",
      explorerUrl: "https://polygonscan.com"
    }
  }
};
