/**
 * deploy_implicitex_transfer.js
 *
 * Hardhat deploy script for ImplicitExTransfer.
 *
 * NOT RUN AUTOMATICALLY. Must be invoked explicitly:
 *   cd app-web
 *   npx hardhat run scripts/deploy_implicitex_transfer.js --network <network>
 *
 * Required environment variables (set locally; never commit to repo):
 *   IMPLICITEX_USDC_ADDRESS          — USDC token contract address on target network
 *   IMPLICITEX_TREASURY_ADDRESS      — address that receives fee payments
 *   IMPLICITEX_INITIAL_FEE_BPS       — fee in basis points (e.g. 250 = 2.5%; max 1000 = 10%)
 *   IMPLICITEX_MIN_TRANSFER_AMOUNT   — minimum transfer amount in USDC atomic units (6 decimals)
 *   IMPLICITEX_TRANSFER_PRECISION    — transfer precision divisor in atomic units
 *
 * After a successful deploy:
 * 1. Record the deployed contract address.
 * 2. Verify the contract on the block explorer.
 * 3. Review the deployment summary printed below before updating
 *    frontend/public/config/chains.js — do not update config from an
 *    unreviewed or unverified deployment.
 *
 * See docs/architecture/testnet-deploy-artifact-flow-2026-04-30.md for the
 * full deployment flow and post-deploy checklist.
 */

"use strict";

const { ethers } = require("hardhat");

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Required environment variable not set: ${name}`);
  }
  return value.trim();
}

function requireAddress(name) {
  const value = requireEnv(name);
  if (!ethers.isAddress(value)) {
    throw new Error(
      `Environment variable ${name} is not a valid EVM address: "${value}"`
    );
  }
  return value;
}

function requirePositiveInt(name) {
  const raw = requireEnv(name);
  const value = parseInt(raw, 10);
  if (isNaN(value) || value <= 0 || String(value) !== raw.trim()) {
    throw new Error(
      `Environment variable ${name} must be a positive integer, got: "${raw}"`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== ImplicitExTransfer deploy script ===");
  console.log("Reading required environment variables...");

  const usdcAddress = requireAddress("IMPLICITEX_USDC_ADDRESS");
  const treasuryAddress = requireAddress("IMPLICITEX_TREASURY_ADDRESS");
  const initialFeeBps = requirePositiveInt("IMPLICITEX_INITIAL_FEE_BPS");
  const initialMinTransfer = requirePositiveInt(
    "IMPLICITEX_MIN_TRANSFER_AMOUNT"
  );
  const initialPrecision = requirePositiveInt("IMPLICITEX_TRANSFER_PRECISION");

  // Fee cap guard (mirrors MAX_FEE_BPS = 1000 in contract)
  if (initialFeeBps > 1000) {
    throw new Error(
      `IMPLICITEX_INITIAL_FEE_BPS exceeds contract maximum of 1000 (10%), got: ${initialFeeBps}`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`\nDeployer: ${deployer.address}`);
  console.log(
    `USDC address:    ${usdcAddress.slice(0, 6)}...${usdcAddress.slice(-4)}`
  );
  console.log(
    `Treasury address: ${treasuryAddress.slice(0, 6)}...${treasuryAddress.slice(-4)}`
  );
  console.log(`Initial fee bps:  ${initialFeeBps}`);
  console.log(`Min transfer:     ${initialMinTransfer}`);
  console.log(`Precision:        ${initialPrecision}`);

  console.log("\nDeploying ImplicitExTransfer...");
  const factory = await ethers.getContractFactory("ImplicitExTransfer");
  const contract = await factory.deploy(
    usdcAddress,
    treasuryAddress,
    initialFeeBps,
    initialMinTransfer,
    initialPrecision
  );

  await contract.waitForDeployment();
  const deployedAddress = await contract.getAddress();

  console.log("\n=== Deployment complete ===");
  console.log(`Contract address: ${deployedAddress}`);
  console.log(
    `\nNext steps (see testnet-deploy-artifact-flow-2026-04-30.md):`
  );
  console.log(`  1. Verify contract on block explorer`);
  console.log(`  2. Record address in config/chains.js under supportedChains`);
  console.log(`  3. Run testnet signoff checklist before setting transfersEnabled: true`);
}

main().catch((err) => {
  console.error("\nDeploy failed:", err.message || err);
  process.exit(1);
});
