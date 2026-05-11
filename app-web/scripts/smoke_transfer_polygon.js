/**
 * smoke_transfer_polygon.js
 *
 * Controlled mainnet smoke for the currently deployed ImplicitExTransfer
 * contract recorded in deployments/polygon.json.
 *
 * Sends exactly 1.000000 USDC by default. Requires an explicit recipient:
 *
 *   SMOKE_RECIPIENT=0x... npx hardhat run scripts/smoke_transfer_polygon.js --network polygon
 *
 * Optional:
 *   SMOKE_AMOUNT_USDC=1.000000
 *
 * The script approves only the exact total debit, calls transferWithFee, checks
 * the TransferExecuted event, and verifies sender/recipient/treasury/contract
 * USDC balance deltas.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const TRANSFER_ABI = [
  "function feeBasisPoints() view returns (uint16)",
  "function minTransferAmount() view returns (uint256)",
  "function transferPrecision() view returns (uint256)",
  "function transferWithFee(address recipient, uint256 amount)",
  "event TransferExecuted(address indexed sender,address indexed recipient,uint256 amountSent,uint256 feeAmount,uint256 totalDebited)",
];

function requireAddress(name, value) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be set to a valid EVM address.`);
  }
  return ethers.getAddress(value);
}

function parseUsdcAmount(value) {
  const raw = String(value || "1.000000").trim();
  if (!/^(?:\d+|\d+\.\d{1,6}|\.\d{1,6})$/.test(raw)) {
    throw new Error("SMOKE_AMOUNT_USDC must be a positive decimal with at most 6 places.");
  }
  const parsed = ethers.parseUnits(raw, 6);
  if (parsed <= 0n) throw new Error("SMOKE_AMOUNT_USDC must be greater than zero.");
  return parsed;
}

function readManifest() {
  const manifestPath = path.resolve(__dirname, "../deployments/polygon.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function assertDelta(label, beforeValue, afterValue, expectedDelta) {
  const actualDelta = afterValue - beforeValue;
  const pass = actualDelta === expectedDelta;
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: expected delta ${expectedDelta}, actual delta ${actualDelta}`);
  if (!pass) {
    throw new Error(`${label} balance delta mismatch.`);
  }
}

async function main() {
  if (network.name !== "polygon") {
    throw new Error(`This smoke is mainnet-only. Expected --network polygon, got ${network.name}.`);
  }

  const manifest = readManifest();
  const contractAddress = requireAddress("deployments/polygon.json address", manifest.address);
  const usdcAddress = requireAddress("deployments/polygon.json usdc", manifest.usdc);
  const treasuryAddress = requireAddress("deployments/polygon.json treasury", manifest.treasury);
  const recipient = requireAddress("SMOKE_RECIPIENT", process.env.SMOKE_RECIPIENT);
  const amount = parseUsdcAmount(process.env.SMOKE_AMOUNT_USDC || "1.000000");

  const [sender] = await ethers.getSigners();
  const senderAddress = await sender.getAddress();

  if (recipient.toLowerCase() === senderAddress.toLowerCase()) {
    throw new Error("SMOKE_RECIPIENT must not be the sender.");
  }
  if (recipient.toLowerCase() === contractAddress.toLowerCase()) {
    throw new Error("SMOKE_RECIPIENT must not be the transfer contract.");
  }
  if (recipient.toLowerCase() === usdcAddress.toLowerCase()) {
    throw new Error("SMOKE_RECIPIENT must not be the USDC token contract.");
  }
  if (recipient.toLowerCase() === treasuryAddress.toLowerCase()) {
    throw new Error("SMOKE_RECIPIENT must not be the treasury for this smoke.");
  }

  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, sender);
  const transfer = new ethers.Contract(contractAddress, TRANSFER_ABI, sender);

  const [feeBps, minTransfer, precision] = await Promise.all([
    transfer.feeBasisPoints(),
    transfer.minTransferAmount(),
    transfer.transferPrecision(),
  ]);

  if (amount < minTransfer) {
    throw new Error(`Smoke amount below contract minimum: ${amount} < ${minTransfer}.`);
  }
  if (amount % precision !== 0n) {
    throw new Error(`Smoke amount does not satisfy contract precision: ${amount} % ${precision}.`);
  }

  const fee = (amount * BigInt(feeBps)) / 10000n;
  const totalDebit = amount + fee;

  console.log("=== ImplicitEx Polygon Smoke Transfer ===");
  console.log(`Network:   ${network.name}`);
  console.log(`Sender:    ${senderAddress}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Contract:  ${contractAddress}`);
  console.log(`USDC:      ${usdcAddress}`);
  console.log(`Treasury:  ${treasuryAddress}`);
  console.log(`Amount:    ${ethers.formatUnits(amount, 6)} USDC`);
  console.log(`Fee:       ${ethers.formatUnits(fee, 6)} USDC`);
  console.log(`Debit:     ${ethers.formatUnits(totalDebit, 6)} USDC`);

  const [senderBefore, recipientBefore, treasuryBefore, contractBefore] = await Promise.all([
    usdc.balanceOf(senderAddress),
    usdc.balanceOf(recipient),
    usdc.balanceOf(treasuryAddress),
    usdc.balanceOf(contractAddress),
  ]);

  if (senderBefore < totalDebit) {
    throw new Error(
      `Insufficient sender USDC. Have ${ethers.formatUnits(senderBefore, 6)}, need ${ethers.formatUnits(totalDebit, 6)}.`
    );
  }

  const allowanceBefore = await usdc.allowance(senderAddress, contractAddress);
  if (allowanceBefore !== 0n) {
    console.log(`Existing allowance: ${ethers.formatUnits(allowanceBefore, 6)} USDC`);
  }

  console.log("Approving exact total debit...");
  const approveTx = await usdc.approve(contractAddress, totalDebit);
  console.log(`Approve tx: ${approveTx.hash}`);
  await approveTx.wait();

  console.log("Calling transferWithFee...");
  const transferTx = await transfer.transferWithFee(recipient, amount);
  console.log(`Transfer tx: ${transferTx.hash}`);
  const receipt = await transferTx.wait();

  const eventTopic = transfer.interface.getEvent("TransferExecuted").topicHash;
  const eventLog = receipt.logs.find(
    (log) => log.address.toLowerCase() === contractAddress.toLowerCase() && log.topics[0] === eventTopic
  );
  if (!eventLog) {
    throw new Error("TransferExecuted event not found in receipt.");
  }

  const parsed = transfer.interface.parseLog(eventLog);
  const passEvent =
    parsed.args.sender.toLowerCase() === senderAddress.toLowerCase() &&
    parsed.args.recipient.toLowerCase() === recipient.toLowerCase() &&
    parsed.args.amountSent === amount &&
    parsed.args.feeAmount === fee &&
    parsed.args.totalDebited === totalDebit;

  console.log(`${passEvent ? "PASS" : "FAIL"} TransferExecuted event args`);
  if (!passEvent) {
    throw new Error("TransferExecuted event args mismatch.");
  }

  const [senderAfter, recipientAfter, treasuryAfter, contractAfter] = await Promise.all([
    usdc.balanceOf(senderAddress),
    usdc.balanceOf(recipient),
    usdc.balanceOf(treasuryAddress),
    usdc.balanceOf(contractAddress),
  ]);

  assertDelta("sender USDC", senderBefore, senderAfter, -totalDebit);
  assertDelta("recipient USDC", recipientBefore, recipientAfter, amount);
  assertDelta("treasury USDC", treasuryBefore, treasuryAfter, fee);
  assertDelta("contract USDC", contractBefore, contractAfter, 0n);

  console.log("=== SMOKE PASS ===");
  console.log(`Explorer: https://polygonscan.com/tx/${transferTx.hash}`);
}

main().catch((err) => {
  console.error("\nSMOKE FAIL:", err.message || err);
  process.exit(1);
});
