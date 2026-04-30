/**
 * local_predeploy_check.js
 *
 * Local-only predeploy check. Runs against the default Hardhat in-memory
 * network — no RPC URL, no real private key, no Amoy connection.
 *
 * Purpose: prove the deploy script mechanics work end-to-end before a real
 * network, real USDC address, or real deployer key is ever used.
 *
 * Run:
 *   cd app-web
 *   npx hardhat run scripts/local_predeploy_check.js
 *
 * This script is NOT the production deploy script. For the real deploy, see:
 *   app-web/scripts/deploy_implicitex_transfer.js
 *   docs/architecture/testnet-deploy-artifact-flow-2026-04-30.md
 */

"use strict";

const { ethers } = require("hardhat");

// Synthetic local values — not real addresses, not production values.
const SYNTHETIC_FEE_BPS         = 250;   // 2.5%
const SYNTHETIC_MIN_TRANSFER    = 1_000_000; // 1 USDC (6 decimals)
const SYNTHETIC_PRECISION       = 1_000_000; // 1 USDC granularity

async function main() {
  console.log("=== ImplicitEx local predeploy check ===");
  console.log("Network: Hardhat in-memory (local only)\n");

  const [deployer, treasury] = await ethers.getSigners();
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Treasury:  ${treasury.address}`);

  // 1. Deploy MockERC20 as stand-in for USDC
  console.log("\n[1/3] Deploying MockERC20 (local USDC stand-in)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUsdc = await MockERC20.deploy("Mock USDC", "USDC", 6);
  await mockUsdc.waitForDeployment();
  const mockUsdcAddress = await mockUsdc.getAddress();
  console.log(`      MockERC20 deployed at: ${mockUsdcAddress}`);

  // 2. Deploy ImplicitExTransfer with synthetic constructor values
  console.log("\n[2/3] Deploying ImplicitExTransfer...");
  const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
  const contract = await ImplicitExTransfer.deploy(
    mockUsdcAddress,
    treasury.address,
    SYNTHETIC_FEE_BPS,
    SYNTHETIC_MIN_TRANSFER,
    SYNTHETIC_PRECISION
  );
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`      ImplicitExTransfer deployed at: ${contractAddress}`);

  // 3. Verify on-chain state matches constructor arguments
  console.log("\n[3/3] Verifying on-chain state...");
  const [
    onChainOwner,
    onChainFeeBps,
    onChainMinTransfer,
    onChainPrecision,
    onChainTreasury,
    paused
  ] = await Promise.all([
    contract.owner(),
    contract.feeBasisPoints(),
    contract.minTransferAmount(),
    contract.transferPrecision(),
    contract.treasury(),
    contract.paused()
  ]);

  const checks = [
    ["owner == deployer",         onChainOwner.toLowerCase()       === deployer.address.toLowerCase()],
    ["feeBps == 250",             Number(onChainFeeBps)            === SYNTHETIC_FEE_BPS],
    ["minTransfer == 1000000",    Number(onChainMinTransfer)       === SYNTHETIC_MIN_TRANSFER],
    ["precision == 1000000",      Number(onChainPrecision)         === SYNTHETIC_PRECISION],
    ["treasury == treasury signer", onChainTreasury.toLowerCase() === treasury.address.toLowerCase()],
    ["not paused",                paused                           === false],
  ];

  let allPass = true;
  for (const [label, pass] of checks) {
    console.log(`      ${pass ? "PASS" : "FAIL"} ${label}`);
    if (!pass) allPass = false;
  }

  if (!allPass) {
    throw new Error("One or more predeploy checks failed.");
  }

  console.log("\n=== Predeploy check passed ===");
  console.log("Local deploy mechanics are confirmed working.");
  console.log("No config/chains.js was updated — this is a local check only.");
  console.log("\nRemaining before Amoy deploy:");
  console.log("  - Fund testnet deployer wallet with MATIC");
  console.log("  - Set IMPLICITEX_DEPLOYER_KEY, IMPLICITEX_RPC_URL_AMOY in .env");
  console.log("  - Set all five deploy-param env vars");
  console.log("  - Run: npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon-amoy");
}

main().catch((err) => {
  console.error("\nPredeploy check failed:", err.message || err);
  process.exit(1);
});
