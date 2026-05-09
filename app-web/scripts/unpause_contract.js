/**
 * unpause_contract.js
 *
 * Calls unpause() on a deployed ImplicitExTransfer contract.
 * Owner wallet only — tx will revert if caller is not the owner.
 *
 * Usage:
 *   cd app-web
 *   npx hardhat run scripts/unpause_contract.js --network polygon-amoy
 *
 * Required environment variables (set locally; never commit):
 *   IMPLICITEX_DEPLOYER_KEY   — private key of the contract owner
 *   IMPLICITEX_RPC_URL_AMOY   — RPC endpoint for the target network
 *
 * Required: CONTRACT_ADDRESS env var OR set it inline below.
 *   CONTRACT_ADDRESS=0x... npx hardhat run scripts/unpause_contract.js --network polygon-amoy
 */

"use strict";

const { ethers } = require("hardhat");

const PAUSE_ABI = ["function unpause() external", "function paused() view returns (bool)"];

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error(
      "CONTRACT_ADDRESS env var must be set to a valid EVM address.\n" +
        "  CONTRACT_ADDRESS=0x... npx hardhat run scripts/unpause_contract.js --network polygon-amoy"
    );
  }

  const [owner] = await ethers.getSigners();
  console.log(`Caller:   ${owner.address}`);
  console.log(`Contract: ${contractAddress}`);

  const contract = new ethers.Contract(contractAddress, PAUSE_ABI, owner);

  const currentlyPaused = await contract.paused();
  if (!currentlyPaused) {
    console.log("Contract is not paused. No action taken.");
    return;
  }

  console.log("Calling unpause()...");
  const tx = await contract.unpause();
  console.log(`Tx submitted: ${tx.hash}`);
  await tx.wait();
  console.log("unpause() confirmed.");

  const nowPaused = await contract.paused();
  if (nowPaused) {
    throw new Error("unpause() confirmed but paused() still returns true — unexpected state.");
  }
  console.log("Contract is now unpaused.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message || err);
  process.exit(1);
});
