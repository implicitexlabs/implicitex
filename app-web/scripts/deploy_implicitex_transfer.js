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
 *   IMPLICITEX_OWNER_ADDRESS         — target admin owner, preferably a Safe/multisig
 *   IMPLICITEX_INITIAL_FEE_BPS       — fee in basis points (e.g. 100 = 1%; max 100 = 1%)
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

const fs   = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

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

function box(lines) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const bar   = "═".repeat(width - 2);
  const pad   = (s) => `║ ${s.padEnd(width - 4)} ║`;
  return [
    `╔${bar}╗`,
    ...lines.map(pad),
    `╚${bar}╝`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n=== ImplicitExTransfer deploy script ===");
  console.log("Reading required environment variables...\n");

  const usdcAddress      = requireAddress("IMPLICITEX_USDC_ADDRESS");
  const treasuryAddress  = requireAddress("IMPLICITEX_TREASURY_ADDRESS");
  const ownerAddress     = requireAddress("IMPLICITEX_OWNER_ADDRESS");
  const initialFeeBps    = requirePositiveInt("IMPLICITEX_INITIAL_FEE_BPS");
  const initialMinTransfer = requirePositiveInt("IMPLICITEX_MIN_TRANSFER_AMOUNT");
  const initialPrecision = requirePositiveInt("IMPLICITEX_TRANSFER_PRECISION");

  // Fee cap guard (mirrors MAX_FEE_BPS = 100 in contract)
  if (initialFeeBps > 100) {
    throw new Error(
      `IMPLICITEX_INITIAL_FEE_BPS exceeds contract maximum of 100 (1%), got: ${initialFeeBps}`
    );
  }

  const [deployer]  = await ethers.getSigners();
  const chainId     = Number((await ethers.provider.getNetwork()).chainId);
  const networkName = network.name;
  const timestamp   = new Date().toISOString();
  const feePercent  = (initialFeeBps / 100).toFixed(2) + "%";
  const ownerIsDeployer = ownerAddress.toLowerCase() === deployer.address.toLowerCase();

  if (ownerAddress.toLowerCase() === treasuryAddress.toLowerCase()) {
    throw new Error("IMPLICITEX_OWNER_ADDRESS must be distinct from IMPLICITEX_TREASURY_ADDRESS.");
  }

  if (networkName === "polygon" && ownerIsDeployer) {
    throw new Error(
      "Polygon mainnet deploys must set IMPLICITEX_OWNER_ADDRESS to a Safe/multisig, not the deployer EOA."
    );
  }

  console.log(`Network:   ${networkName} (${chainId})`);
  console.log(`Timestamp: ${timestamp}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Owner:     ${ownerAddress}${ownerIsDeployer ? " (deployer)" : " (pending transfer)"}`);
  console.log(`Treasury:  ${treasuryAddress}`);
  console.log(`USDC:      ${usdcAddress}`);
  console.log(`Fee:       ${initialFeeBps} bps (${feePercent})`);
  console.log(`Min transfer: ${initialMinTransfer}`);
  console.log(`Precision:    ${initialPrecision}`);

  console.log("\nDeploying ImplicitExTransfer...");
  const factory  = await ethers.getContractFactory("ImplicitExTransfer");
  const contract = await factory.deploy(
    usdcAddress,
    treasuryAddress,
    initialFeeBps,
    initialMinTransfer,
    initialPrecision
  );

  await contract.waitForDeployment();
  const deployedAddress = await contract.getAddress();
  const deployTx        = contract.deploymentTransaction();
  let ownershipTransferTx = null;

  if (!ownerIsDeployer) {
    console.log(`\nInitiating two-step ownership transfer to ${ownerAddress}...`);
    ownershipTransferTx = await contract.transferOwnership(ownerAddress);
    await ownershipTransferTx.wait();
    console.log("Ownership transfer initiated. Target owner must acceptOwnership().");
  }

  // ---------------------------------------------------------------------------
  // Success output
  // ---------------------------------------------------------------------------
  console.log("\n" + box([
    "DEPLOYMENT COMPLETE",
    "",
    `Network:   ${networkName} (${chainId})`,
    `Timestamp: ${timestamp}`,
    "",
    `Deployer:  ${deployer.address}`,
    `Owner:     ${ownerAddress}`,
    `Treasury:  ${treasuryAddress}`,
    `USDC:      ${usdcAddress}`,
    `Fee:       ${feePercent}`,
    "",
    `CONTRACT ADDRESS:`,
    `${deployedAddress}`,
  ]));

  console.log(`
Next steps:
  1. Verify on block explorer
       npx hardhat verify --network ${networkName} ${deployedAddress} \\
         ${usdcAddress} ${treasuryAddress} ${initialFeeBps} ${initialMinTransfer} ${initialPrecision}
  2. Update frontend/public/config/chains.js contractAddress for chainId ${chainId}
  3. If Owner is pending, have ${ownerAddress} call acceptOwnership()
  4. Run signoff checklist before setting transfersEnabled: true
  5. Save deployments/${networkName}.json (written automatically — see below)
`);

  // ---------------------------------------------------------------------------
  // Write deployment manifest
  // ---------------------------------------------------------------------------
  const manifest = {
    network:    networkName,
    chainId,
    contract:   "ImplicitExTransfer",
    address:    deployedAddress,
    deployer:   deployer.address,
    owner:      ownerIsDeployer ? deployer.address : null,
    pendingOwner: ownerIsDeployer ? null : ownerAddress,
    usdc:       usdcAddress,
    treasury:   treasuryAddress,
    feeBps:     initialFeeBps,
    minTransfer: initialMinTransfer,
    precision:  initialPrecision,
    timestamp,
    txHash:     deployTx ? deployTx.hash : null,
    ownershipTransferTxHash: ownershipTransferTx ? ownershipTransferTx.hash : null,
  };

  const manifestDir  = path.resolve(__dirname, "../deployments");
  const manifestPath = path.join(manifestDir, `${networkName}.json`);

  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Manifest written → deployments/${networkName}.json`);
}

main().catch((err) => {
  console.error("\nDeploy failed:", err.message || err);
  process.exit(1);
});
