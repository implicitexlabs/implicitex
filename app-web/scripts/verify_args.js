/**
 * verify_args.js
 *
 * Constructor arguments file for hardhat-verify.
 *
 * Usage (after deploy — fill values before running):
 *   cd app-web
 *   CONTRACT_ADDRESS=0x... npx hardhat verify \
 *     --network polygon-amoy \
 *     --constructor-args scripts/verify_args.js \
 *     $CONTRACT_ADDRESS
 *
 * Constructor args are finalized for Amoy deployment. All values are
 * public deploy parameters — no secrets. Run verification only after
 * the contract is deployed and the address is known.
 *
 * Argument order must match the ImplicitExTransfer constructor exactly:
 *   constructor(address usdcAddress, address treasuryAddress,
 *               uint16 initialFeeBps, uint256 initialMinTransfer,
 *               uint256 initialPrecision)
 *
 * Token atomic units (6 decimals for USDC):
 *   1 USDC  = 1_000_000
 *   5 USDC  = 5_000_000
 *   10 USDC = 10_000_000
 */

module.exports = [
  // usdcAddress — Circle testnet USDC on Polygon Amoy
  "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",

  // treasuryAddress — ImplicitEx platform fee recipient (not deployer)
  "0xEC9F1E0074CFeC89684C19703A6A95D4ca436b28",

  // initialFeeBps — 100 = 1.00% (max 1000 = 10%)
  100,

  // initialMinTransfer — 1000000 = 1.00 USDC (6 decimals)
  1000000,

  // initialPrecision — 1000000 = transfers must be whole-USDC amounts
  1000000,
];
