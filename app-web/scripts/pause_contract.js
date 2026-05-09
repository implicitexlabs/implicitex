/**
 * pause_contract.js
 *
 * Calls pause() on a deployed ImplicitExTransfer contract.
 * Owner wallet only — tx will revert if caller is not the owner.
 *
 * Usage:
 *   cd app-web
 *   npx hardhat run scripts/pause_contract.js --network polygon-amoy
 *
 * Required environment variables (set locally; never commit):
 *   IMPLICITEX_DEPLOYER_KEY   — private key of the contract owner
 *   IMPLICITEX_RPC_URL_AMOY   — RPC endpoint for the target network
 *
 * Required: CONTRACT_ADDRESS env var OR set it inline below.
 *   CONTRACT_ADDRESS=0x... npx hardhat run scripts/pause_contract.js --network polygon-amoy
 */

"use strict";

const { ethers } = require("hardhat");

const PAUSE_ABI = ["function pause() external", "function paused() view returns (bool)"];

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error(
      "CONTRACT_ADDRESS env var must be set to a valid EVM address.\n" +
        "  CONTRACT_ADDRESS=0x... npx hardhat run scripts/pause_contract.js --network polygon-amoy"
    );
  }

  const [owner] = await ethers.getSigners();
  console.log(`Caller:   ${owner.address}`);
  console.log(`Contract: ${contractAddress}`);

  const contract = new ethers.Contract(contractAddress, PAUSE_ABI, owner);

  const alreadyPaused = await contract.paused();
  if (alreadyPaused) {
    console.log("Contract is already paused. No action taken.");
    return;
  }

  console.log("Calling pause()...");
  const tx = await contract.pause();
  console.log(`Tx submitted: ${tx.hash}`);
  await tx.wait();
  console.log("pause() confirmed.");

  const nowPaused = await contract.paused();
  if (!nowPaused) {
    throw new Error("pause() confirmed but paused() returned false — unexpected state.");
  }
  console.log("Contract is now paused.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message || err);
  process.exit(1);
});
