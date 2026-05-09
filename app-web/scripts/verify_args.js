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
 * Fill each value below from the deploy output / deploy artifact record.
 * Do not commit real addresses until after deployment. The placeholders
 * below will cause verification to fail, which is intentional — do not
 * run verify until you have replaced them.
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

  // treasuryAddress — fill from deploy parameters; must not be zero or deployer
  "FILL_TREASURY_ADDRESS",

  // initialFeeBps — 100 = 1.00% (max 1000 = 10%)
  100,

  // initialMinTransfer — in USDC atomic units (6 decimals)
  // e.g. 1000000 = 1.00 USDC
  "FILL_MIN_TRANSFER_AMOUNT",

  // initialPrecision — in USDC atomic units
  // e.g. 1000000 = transfers must be whole-USDC amounts
  "FILL_TRANSFER_PRECISION",
];
