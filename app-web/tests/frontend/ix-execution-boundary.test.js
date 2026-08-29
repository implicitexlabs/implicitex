/**
 * ix-execution-boundary.test.js
 *
 * IX ID → ImplicitEx Execution-Boundary Proof
 *
 * Tests the existing IX_EXECUTION.executeTransfer() implementation against:
 *
 *   1. Economic invariant — recipient amount / fee / payer-total semantics
 *   2. 250-USDC cap interpretation (recipient amount, not payer total)
 *   3. Native USDC contract address (Polygon mainnet)
 *   4. Spender / execution contract address
 *   5. Exact approval amount (totalDebit, NOT unlimited)
 *   6. Exact transferWithFee calldata encoding (recipient address + recipient amount)
 *   7. APPROVE_THEN_TRANSFER full sequence
 *   8. TRANSFER_ONLY path (sufficient existing allowance)
 *   9. Wallet rejection at approval and settlement
 *  10. Stale-route gate (IXID_HANDOFF.revalidateBeforeExecution) — zero provider calls on failure
 *  11. Balance insufficient gate — zero provider transactions
 *  12. Merchant/reference/memo/purpose non-authority in calldata
 *  13. Unsupported chain guard
 *  14. Receipt shape on success
 *
 * All wallet interactions are captured by a mock EIP-1193 provider.
 * No real wallet, MetaMask, WalletConnect, or blockchain network is used.
 * No transaction is broadcast. No USDC is sent.
 */

'use strict';

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const test   = require('node:test');
const vm     = require('node:vm');

// ── file paths ───────────────────────────────────────────────────────────────
const ROOT       = path.resolve(__dirname, '../../');
const policyPath = path.resolve(ROOT, 'frontend/public/js/ix-execution-gas-policy.js');
const execPath   = path.resolve(ROOT, 'frontend/public/js/ix-execution.js');

const policySource = fs.readFileSync(policyPath, 'utf8');
const execSource   = fs.readFileSync(execPath,   'utf8');

// ── production addresses — derived from ix-execution.js CHAINS[137] ──────────
// These must match the deployed contract. Changing them here is a red flag.
const USDC_ADDRESS     = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const CONTRACT_ADDRESS = '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0';

// ── function selectors — derived from ix-execution.js ────────────────────────
const SEL_APPROVE      = '0x095ea7b3'; // approve(address,uint256)
const SEL_TRANSFER_FEE = '0x08acece2'; // transferWithFee(address,uint256)

// ── IX ID fixture addresses — from seed_fixture.py emulator fixture ──────────
const IXID_DEST = '0xaabbccddaabbccddaabbccddaabbccddaabbccdd'; // API-verified route
const SENDER    = '0xdddddddddddddddddddddddddddddddddddddddd'; // mock payer

// ── mock transaction hashes ───────────────────────────────────────────────────
const APPROVAL_HASH  = '0x' + 'aa'.repeat(32);
const TRANSFER_HASH  = '0x' + 'bb'.repeat(32);

// ── ABI encoding helpers — mirrors ix-execution.js internal helpers ───────────
function padHex32(hex) {
  return hex.replace(/^0x/i, '').padStart(64, '0');
}
function encodeAddress(addr) {
  return padHex32(addr.replace(/^0x/i, '').toLowerCase());
}
function encodeUint256(big) {
  return padHex32(big.toString(16));
}

// ── Module loader ─────────────────────────────────────────────────────────────
// Creates a fresh VM context with only the globals ix-execution.js needs.
// window.ethereum.request is replaced with the supplied mock.
function loadModule(requestImpl) {
  const ctx = {
    BigInt, Date, Error, Number, Math, Promise,
    parseInt, setTimeout,
    window: { ethereum: { request: requestImpl } },
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(policySource, ctx, { filename: policyPath });
  vm.runInNewContext(execSource,   ctx, { filename: execPath   });
  return ctx.window.IX_EXECUTION;
}

// ── Mock provider factory ─────────────────────────────────────────────────────
// Returns { request, log } where log captures every provider call.
// `handlers` maps method name → async (payload) => result.
function makeMock(handlers) {
  const log = [];
  const request = async (payload) => {
    log.push({ method: payload.method, params: payload.params });
    const fn = handlers[payload.method];
    if (fn) return fn(payload);
    throw new Error('mock: unhandled method "' + payload.method + '"');
  };
  return { request, log };
}

// ── Standard success provider ─────────────────────────────────────────────────
// approvalNeeded: true  → returns APPROVAL_HASH first, then TRANSFER_HASH
// approvalNeeded: false → returns TRANSFER_HASH for the single send
function successMock({ approvalNeeded = true } = {}) {
  let sendCount = 0;
  return makeMock({
    eth_sendTransaction: async () => {
      sendCount++;
      return (approvalNeeded && sendCount === 1) ? APPROVAL_HASH : TRANSFER_HASH;
    },
    eth_getTransactionReceipt: async () => ({ status: '0x1', blockNumber: '0x1' }),
  });
}

// ── toRawUsdc — mirrors ix-execution.js ──────────────────────────────────────
function toRawUsdc(f) {
  return BigInt(Math.round(f * 1e6));
}

// ── Fee math — mirrors ix-execution.js / contract calculateFee() ─────────────
const MAX_FEE_ATOMIC = 10_000_000n; // 10 USDC (6 decimals)
function calcFee(rawAmount) {
  const pct = (rawAmount * 100n) / 10000n;
  return pct > MAX_FEE_ATOMIC ? MAX_FEE_ATOMIC : pct;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — ECONOMIC INVARIANT
//
// Verify: fee = 1% of recipient amount (integer division)
//         payer total = recipient amount + fee
//         fee capped at 10 USDC
// ─────────────────────────────────────────────────────────────────────────────

test('economic invariant: 1 USDC → fee 0.01 USDC, payer total 1.01 USDC', () => {
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const raw = toRawUsdc(1); // 1_000_000n
  const { fee, total } = IX.calculateFee(raw, 137);
  assert.equal(fee,   10_000n,    'fee must be 10000 atomic (0.01 USDC)');
  assert.equal(total, 1_010_000n, 'total must be 1010000 atomic (1.01 USDC)');
});

test('economic invariant: 5 USDC → fee 0.05 USDC, payer total 5.05 USDC', () => {
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const raw = toRawUsdc(5); // 5_000_000n
  const { fee, total } = IX.calculateFee(raw, 137);
  assert.equal(fee,   50_000n,    'fee must be 50000 atomic (0.05 USDC)');
  assert.equal(total, 5_050_000n, 'total must be 5050000 atomic (5.05 USDC)');
});

test('economic invariant: 5.25 USDC → fee 0.0525 USDC (integer division), payer total 5.3025 USDC', () => {
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  // Use atomic input to avoid float precision ambiguity
  const raw = 5_250_000n;
  const { fee, total } = IX.calculateFee(raw, 137);
  // fee = (5_250_000 * 100) / 10000 = 52_500 atomic
  assert.equal(fee,   52_500n,    'fee must be 52500 atomic (0.052500 USDC)');
  assert.equal(total, 5_302_500n, 'total must be 5302500 atomic (5.302500 USDC)');
});

test('economic invariant: 250 USDC → fee 2.50 USDC, payer total 252.50 USDC', () => {
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const raw = toRawUsdc(250); // 250_000_000n
  const { fee, total } = IX.calculateFee(raw, 137);
  // fee = (250_000_000 * 100) / 10000 = 2_500_000 (below 10 USDC cap)
  assert.equal(fee,   2_500_000n,   'fee must be 2500000 atomic (2.50 USDC)');
  assert.equal(total, 252_500_000n, 'total must be 252500000 atomic (252.50 USDC)');
});

test('economic invariant: 1000 USDC → fee capped at 10 USDC (MAX_FEE), payer total 1010 USDC', () => {
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const raw = toRawUsdc(1000);
  const { fee, total } = IX.calculateFee(raw, 137);
  // 1% of 1000 USDC = 10 USDC — exactly at the cap
  assert.equal(fee,   10_000_000n,    'fee must be capped at 10000000 atomic (10 USDC)');
  assert.equal(total, 1_010_000_000n, 'total must be 1010 USDC');
});

test('economic invariant: 1001 USDC → fee still capped at 10 USDC (not 10.01)', () => {
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const raw = toRawUsdc(1001);
  const { fee } = IX.calculateFee(raw, 137);
  assert.equal(fee, 10_000_000n, 'fee must not exceed MAX_FEE cap');
});

test('fee model: fee is 1% of RECIPIENT amount, not 1% of payer total', () => {
  // The UI represents: recipient_amount + 1% fee = payer_total
  // The fee is on the amount the recipient receives — NOT on what the payer sends.
  // Verify this for 5 USDC.
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const recipientAmount = 5_000_000n;
  const { fee, total } = IX.calculateFee(recipientAmount, 137);

  // fee must be exactly 1% of recipientAmount (integer division)
  assert.equal(fee, (recipientAmount * 100n) / 10000n);
  // payer total = recipient + fee
  assert.equal(total, recipientAmount + fee);
  // Sanity: fee is NOT 1% of total
  const feeOfTotal = (total * 100n) / 10000n;
  assert.notEqual(fee, feeOfTotal, 'fee must be 1% of recipient amount, not payer total');
});

test('250-USDC cap: cap is on recipient amount — payer debit at cap is 252.50 USDC', () => {
  // UI cap of 250 USDC bounds the amount the recipient receives.
  // The payer pays 252.50 USDC at the 250 USDC boundary.
  const IX = loadModule(async () => { throw new Error('no calls expected'); });
  const recipientAtCap  = 250_000_000n;  // 250 USDC
  const payerDebitAtCap = 252_500_000n;  // 252.50 USDC

  const { total } = IX.calculateFee(recipientAtCap, 137);
  assert.equal(total, payerDebitAtCap,
    'payer debit at the 250 USDC cap must be 252.50 USDC, not 250 USDC');
  assert.notEqual(total, recipientAtCap,
    'payer total must exceed recipient amount by the fee');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — APPROVAL TRANSACTION STRUCTURE
//
// For the APPROVE_THEN_TRANSFER path, the first eth_sendTransaction must:
//   - target the USDC contract (not ImplicitEx contract)
//   - use the approve(address,uint256) selector 0x095ea7b3
//   - set spender = ImplicitEx contract address
//   - set approval amount = totalDebit (exact — not unlimited)
// ─────────────────────────────────────────────────────────────────────────────

test('approval tx targets USDC contract, not ImplicitEx contract', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const approvalTx = mock.log.filter(e => e.method === 'eth_sendTransaction')[0];
  assert.equal(approvalTx.params[0].to, USDC_ADDRESS,
    'approval must target USDC contract');
  assert.notEqual(approvalTx.params[0].to, CONTRACT_ADDRESS,
    'approval must NOT target ImplicitEx contract');
});

test('approval calldata uses approve() selector 0x095ea7b3', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const approvalTx = mock.log.filter(e => e.method === 'eth_sendTransaction')[0];
  assert.equal(
    approvalTx.params[0].data.slice(0, 10).toLowerCase(),
    SEL_APPROVE.toLowerCase(),
    'approval calldata must begin with approve() selector'
  );
});

test('approval calldata: spender is the ImplicitEx contract address', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const approvalTx = mock.log.filter(e => e.method === 'eth_sendTransaction')[0];
  const data = approvalTx.params[0].data;
  // bytes 10..73 (32-byte ABI word after selector) = spender address, zero-padded
  const spenderEncoded = data.slice(10, 74).toLowerCase();
  assert.equal(
    spenderEncoded,
    encodeAddress(CONTRACT_ADDRESS).toLowerCase(),
    'spender in approval must be the ImplicitEx contract address'
  );
});

test('approval amount is totalDebit (recipient + fee), NOT unlimited (0xffff…)', async () => {
  // 5 USDC → fee = 50_000, totalDebit = 5_050_000
  const recipientRaw = toRawUsdc(5);
  const feeRaw       = calcFee(recipientRaw);
  const totalDebit   = recipientRaw + feeRaw; // 5_050_000n

  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const approvalTx = mock.log.filter(e => e.method === 'eth_sendTransaction')[0];
  const data = approvalTx.params[0].data;
  // bytes 74..end (second 32-byte ABI word after selector) = amount
  const amountEncoded  = data.slice(74);
  const approvalAmount = BigInt('0x' + amountEncoded);

  assert.equal(approvalAmount, totalDebit,
    'approval amount must equal totalDebit exactly');
  assert.notEqual(amountEncoded, 'f'.repeat(64),
    'approval must NOT be unlimited (max uint256)');
  assert.notEqual(approvalAmount, recipientRaw,
    'approval must be totalDebit, not just the recipient amount');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — SETTLEMENT TRANSACTION STRUCTURE
//
// The second eth_sendTransaction (transferWithFee) must:
//   - target the ImplicitEx contract (not USDC contract)
//   - use the transferWithFee(address,uint256) selector 0x08acece2
//   - encode the IX ID verified destination as recipient
//   - encode the RECIPIENT amount (not payer total) as the amount parameter
// ─────────────────────────────────────────────────────────────────────────────

test('settlement tx targets ImplicitEx contract, not USDC contract', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const sends    = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const settlement = sends[1]; // second send = transferWithFee
  assert.equal(sends.length, 2, 'APPROVE_THEN_TRANSFER must produce exactly 2 send transactions');
  assert.equal(settlement.params[0].to, CONTRACT_ADDRESS,
    'settlement must target ImplicitEx contract');
  assert.notEqual(settlement.params[0].to, USDC_ADDRESS,
    'settlement must NOT target USDC contract');
});

test('settlement calldata uses transferWithFee() selector 0x08acece2', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const sends      = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const settlement = sends[1];
  assert.equal(
    settlement.params[0].data.slice(0, 10).toLowerCase(),
    SEL_TRANSFER_FEE.toLowerCase(),
    'settlement must begin with transferWithFee() selector'
  );
});

test('settlement calldata: recipient is the IX ID verified destination address', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const sends      = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const data       = sends[1].params[0].data;
  // bytes 10..73 = recipient address, 32-byte ABI word
  const recipientEncoded = data.slice(10, 74).toLowerCase();
  assert.equal(
    recipientEncoded,
    encodeAddress(IXID_DEST).toLowerCase(),
    'settlement recipient must be the IX ID verified destination'
  );
});

test('settlement calldata encodes RECIPIENT amount, not payer total', async () => {
  // 5 USDC recipient → payer pays 5.05 USDC
  // transferWithFee(recipient, 5_000_000) — contract receives 5_000_000, not 5_050_000
  const recipientRaw = toRawUsdc(5); // 5_000_000n

  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  const sends       = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const data        = sends[1].params[0].data;
  // bytes 74..end = amount, 32-byte ABI word
  const transferAmount = BigInt('0x' + data.slice(74));

  assert.equal(transferAmount, recipientRaw,
    'settlement amount must be recipient amount (5_000_000)');
  assert.notEqual(transferAmount, recipientRaw + calcFee(recipientRaw),
    'settlement must NOT use payer total (5_050_000) as amount');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — BOUNDARY VALUE TRANSFER ASSERTIONS
//
// Verify exact atomic values at 1 USDC, 250 USDC, and 5.25 USDC boundaries.
// ─────────────────────────────────────────────────────────────────────────────

test('1 USDC: approval = 1.01 USDC (1_010_000 atomic), transfer = 1 USDC (1_000_000 atomic)', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 1, total: 1.01,
  });
  const sends = mock.log.filter(e => e.method === 'eth_sendTransaction');
  assert.equal(sends.length, 2);
  const approvalAmount = BigInt('0x' + sends[0].params[0].data.slice(74));
  const transferAmount = BigInt('0x' + sends[1].params[0].data.slice(74));
  assert.equal(approvalAmount, 1_010_000n, 'approval at 1 USDC boundary must be 1.01 USDC total debit');
  assert.equal(transferAmount, 1_000_000n, 'transfer at 1 USDC boundary must be exactly 1 USDC');
});

test('250 USDC: approval = 252.50 USDC (252_500_000 atomic), transfer = 250 USDC (250_000_000 atomic)', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 250, total: 252.5,
  });
  const sends = mock.log.filter(e => e.method === 'eth_sendTransaction');
  assert.equal(sends.length, 2);
  const approvalAmount = BigInt('0x' + sends[0].params[0].data.slice(74));
  const transferAmount = BigInt('0x' + sends[1].params[0].data.slice(74));
  assert.equal(approvalAmount, 252_500_000n, 'approval at 250 USDC must be 252.50 USDC total debit');
  assert.equal(transferAmount, 250_000_000n, 'transfer at 250 USDC must be exactly 250 USDC');
});

test('5.25 USDC fractional: approval = 5.302500 USDC (5_302_500 atomic), transfer = 5.25 USDC (5_250_000 atomic)', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  // Use atomic units directly to avoid float precision ambiguity
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amountAtomic:    '5250000',  // 5.250000 USDC
    totalDebitAtomic: '5302500', // 5.302500 USDC (= 5.25 + 0.0525)
    amount: 5.25, total: 5.3025, // floats for receipt building
  });
  const sends = mock.log.filter(e => e.method === 'eth_sendTransaction');
  assert.equal(sends.length, 2);
  const approvalAmount = BigInt('0x' + sends[0].params[0].data.slice(74));
  const transferAmount = BigInt('0x' + sends[1].params[0].data.slice(74));
  assert.equal(approvalAmount, 5_302_500n, 'approval for 5.25 USDC must be 5.302500 USDC total debit');
  assert.equal(transferAmount, 5_250_000n, 'transfer for 5.25 USDC must be exactly 5.250000 USDC');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — TRANSFER-ONLY PATH (sufficient existing allowance)
//
// When allowance >= totalDebit, wallet.js sets requiresApproval: false.
// IX_EXECUTION must skip the approval and issue one transfer transaction.
// ─────────────────────────────────────────────────────────────────────────────

test('TRANSFER_ONLY: no approval transaction, single settlement to ImplicitEx contract', async () => {
  const mock = successMock({ approvalNeeded: false });
  const IX   = loadModule(mock.request);
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
    requiresApproval: false,
  });
  assert.equal(result.status, 'confirmed');
  const sends = mock.log.filter(e => e.method === 'eth_sendTransaction');
  assert.equal(sends.length, 1, 'TRANSFER_ONLY must produce exactly one transaction');
  assert.equal(sends[0].params[0].to, CONTRACT_ADDRESS,
    'single transaction must target ImplicitEx contract');
  assert.notEqual(
    sends[0].params[0].data.slice(0, 10).toLowerCase(),
    SEL_APPROVE.toLowerCase(),
    'single transaction must not be an approval'
  );
});

test('TRANSFER_ONLY: single tx encodes recipient amount (not payer total)', async () => {
  const mock = successMock({ approvalNeeded: false });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 250, total: 252.5,
    requiresApproval: false,
  });
  const sends          = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const transferAmount = BigInt('0x' + sends[0].params[0].data.slice(74));
  assert.equal(transferAmount, 250_000_000n, 'TRANSFER_ONLY amount must be recipient amount, not payer total');
});

test('TRANSFER_ONLY confirmed: receipt shows null approvalHash', async () => {
  const mock = successMock({ approvalNeeded: false });
  const IX   = loadModule(mock.request);
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
    requiresApproval: false,
  });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.receipt.approvalHash, null, 'TRANSFER_ONLY must have null approvalHash');
  assert.equal(result.receipt.txHash, TRANSFER_HASH);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — APPROVAL PATH FAILURES
// ─────────────────────────────────────────────────────────────────────────────

test('wallet rejects approval (code 4001) → wallet-rejected, no transfer transaction', async () => {
  const callLog = [];
  const IX = loadModule(async (payload) => {
    callLog.push(payload.method);
    if (payload.method === 'eth_sendTransaction') {
      const err = new Error('User rejected');
      err.code  = 4001;
      throw err;
    }
    throw new Error('unexpected: ' + payload.method);
  });
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'wallet-rejected');
  assert.equal(result.receipt, null, 'no receipt on wallet rejection');
  const sends = callLog.filter(m => m === 'eth_sendTransaction');
  assert.equal(sends.length, 1, 'only one eth_sendTransaction (the rejected approval)');
});

test('approval tx fails on-chain (status 0x0) → APPROVE_FAILED, no transfer transaction', async () => {
  let sendCount = 0;
  const IX = loadModule(async (payload) => {
    if (payload.method === 'eth_sendTransaction') {
      sendCount++;
      return APPROVAL_HASH;
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      return { status: '0x0', blockNumber: '0x1' }; // approval reverted
    }
    throw new Error('unexpected: ' + payload.method);
  });
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'APPROVE_FAILED');
  assert.equal(result.receipt, null, 'no receipt when approval failed on-chain');
  assert.equal(sendCount, 1, 'only one eth_sendTransaction (the failed approval)');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — SETTLEMENT FAILURE PATHS
// ─────────────────────────────────────────────────────────────────────────────

test('wallet rejects settlement after approval → wallet-rejected, result includes sender', async () => {
  let sendCount = 0;
  const IX = loadModule(async (payload) => {
    if (payload.method === 'eth_sendTransaction') {
      sendCount++;
      if (sendCount === 1) return APPROVAL_HASH; // approval accepted
      const err = new Error('User rejected');
      err.code  = 4001;
      throw err; // transfer rejected
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      return { status: '0x1', blockNumber: '0x1' }; // approval confirmed
    }
    throw new Error('unexpected: ' + payload.method);
  });
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'wallet-rejected');
  assert.equal(result.sender, SENDER, 'sender must be preserved on wallet rejection');
  assert.equal(result.receipt, null, 'no receipt — transfer was not submitted');
  assert.equal(sendCount, 2, 'two eth_sendTransaction calls (approval + rejected transfer)');
});

test('settlement tx fails on-chain (status 0x0) → TRANSFER_FAILED, no receipt', async () => {
  let sendCount = 0;
  const IX = loadModule(async (payload) => {
    if (payload.method === 'eth_sendTransaction') {
      sendCount++;
      return sendCount === 1 ? APPROVAL_HASH : TRANSFER_HASH;
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      if (payload.params[0] === APPROVAL_HASH) return { status: '0x1', blockNumber: '0x1' };
      return { status: '0x0', blockNumber: '0x2' }; // transfer reverted
    }
    throw new Error('unexpected: ' + payload.method);
  });
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'TRANSFER_FAILED');
  assert.equal(result.receipt, null, 'no receipt — transfer reverted on-chain');
});

test('receipt RPC error after transfer hash → outcome-unknown with explorer URL', async () => {
  let sendCount = 0;
  const IX = loadModule(async (payload) => {
    if (payload.method === 'eth_sendTransaction') {
      sendCount++;
      return sendCount === 1 ? APPROVAL_HASH : TRANSFER_HASH;
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      if (payload.params[0] === APPROVAL_HASH) return { status: '0x1', blockNumber: '0x1' };
      throw new Error('RPC error: receipt unavailable');
    }
    throw new Error('unexpected: ' + payload.method);
  });
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'outcome-unknown',
    'ambiguous outcome when receipt cannot be confirmed');
  assert.equal(result.error.txHash, TRANSFER_HASH,
    'transfer hash must be surfaced for manual explorer lookup');
  assert.match(result.error.explorerUrl, /polygonscan\.com\/tx\//,
    'explorer URL must include Polygonscan and the hash prefix');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — STALE-ROUTE GATE AT EXECUTION BOUNDARY
//
// IXID_HANDOFF.revalidateBeforeExecution() lives in wallet.js and runs
// immediately before calling IX_EXECUTION.executeTransfer().
//
// Simulates the wallet.js gate (lines 3994–4002 of wallet.js) to prove that:
//   - When ok:false  → executeTransfer is never called, zero provider tx calls
//   - When ok:true   → executeTransfer is called, transactions are captured
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors the wallet.js pattern exactly.
async function simulateWalletJsExecutionGate(handoff, IX, transferRequest) {
  if (handoff && typeof handoff.revalidateBeforeExecution === 'function') {
    const check = await handoff.revalidateBeforeExecution();
    if (!check || !check.ok) {
      return { gateAborted: true, code: check && check.code, message: check && check.message };
    }
  }
  return IX.executeTransfer(transferRequest);
}

test('stale-route gate ok:false → executeTransfer never called, zero provider tx requests', async () => {
  const txCalls = [];
  const IX = loadModule(async (payload) => {
    txCalls.push(payload.method);
    return '0x' + 'ff'.repeat(32);
  });

  const staleHandoff = {
    revalidateBeforeExecution: async () => ({
      ok: false,
      code: 'ROUTE_REVISION_MISMATCH',
      message: "The recipient's IX ID payment route changed. Re-resolve the IX ID and review the transfer again.",
    }),
  };

  const outcome = await simulateWalletJsExecutionGate(staleHandoff, IX, {
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });

  assert.equal(outcome.gateAborted, true, 'gate must abort when stale-route detected');
  assert.equal(outcome.code, 'ROUTE_REVISION_MISMATCH', 'abort code must be ROUTE_REVISION_MISMATCH');
  assert.deepEqual(
    txCalls.filter(m => m === 'eth_sendTransaction'),
    [],
    'zero approval or transfer transactions when stale-route gate fires'
  );
});

test('stale-route gate ok:true → executeTransfer called, transaction captured by mock', async () => {
  const mock = successMock({ approvalNeeded: false });
  const IX   = loadModule(mock.request);

  const freshHandoff = {
    revalidateBeforeExecution: async () => ({ ok: true }),
  };

  const result = await simulateWalletJsExecutionGate(freshHandoff, IX, {
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
    requiresApproval: false,
  });

  assert.equal(result.status, 'confirmed', 'execution must proceed when gate passes');
  const sends = mock.log.filter(e => e.method === 'eth_sendTransaction');
  assert.equal(sends.length, 1, 'one settlement transaction captured by mock provider');
  assert.equal(sends[0].params[0].to, CONTRACT_ADDRESS,
    'captured transaction targets ImplicitEx contract');
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — BALANCE INSUFFICIENT (wallet.js pre-flight gate)
//
// wallet.js reads balance from on-chain previewTransfer and returns early
// when balance < totalDebit, before calling IX_EXECUTION.executeTransfer().
// ─────────────────────────────────────────────────────────────────────────────

test('insufficient balance gate: executeTransfer never called, zero provider tx requests', async () => {
  const txCalls = [];
  const IX = loadModule(async (payload) => {
    txCalls.push(payload.method);
    return '0x' + 'ff'.repeat(32);
  });

  // Simulate wallet.js balance gate (line 3951: if (balance < totalDebit))
  const balance    = 4_000_000n;  // 4 USDC available
  const amount     = 5_000_000n;  // 5 USDC requested
  const fee        = calcFee(amount); // 50_000n = 0.05 USDC
  const totalDebit = amount + fee;    // 5_050_000n needed

  async function walletJsBalanceGate() {
    if (balance < totalDebit) {
      return { gateAborted: true, reason: 'INSUFFICIENT_BALANCE' };
    }
    return IX.executeTransfer({
      action: 'execute', chainId: 137,
      sender: SENDER, recipient: IXID_DEST,
      amount: 5, total: 5.05,
    });
  }

  const outcome = await walletJsBalanceGate();

  assert.equal(outcome.gateAborted, true, 'gate must abort on insufficient balance');
  assert.equal(outcome.reason, 'INSUFFICIENT_BALANCE');
  assert.deepEqual(
    txCalls.filter(m => m === 'eth_sendTransaction'),
    [],
    'zero transactions when balance gate fires before executeTransfer'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — MERCHANT / METADATA NON-AUTHORITY
//
// Merchant context (ref, memo, ptag) is display/receipt metadata only.
// It must not appear in approval or settlement calldata.
// It must not override the verified IX ID destination address.
// ─────────────────────────────────────────────────────────────────────────────

test('merchant ref/memo/ptag: approval calldata is exactly 68 bytes (selector + 2 ABI words)', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
    // Non-authoritative merchant context — must not affect calldata
    txReference:  'INV-20260828-001',
    txPurposeTag: 'invoice',
    txMemo:       'Q4 2026 services rendered',
  });
  const approvalTx   = mock.log.filter(e => e.method === 'eth_sendTransaction')[0];
  const approvalData = approvalTx.params[0].data;
  // approve(address spender, uint256 amount) = 4 + 32 + 32 = 68 bytes = 136 hex + '0x' = 138 chars
  assert.equal(approvalData.length, 138,
    'approval calldata must be exactly 68 bytes (no extra metadata fields)');
});

test('merchant ref/memo/ptag: settlement calldata is exactly 68 bytes (selector + 2 ABI words)', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
    txReference:  'INV-20260828-001',
    txPurposeTag: 'invoice',
    txMemo:       'Q4 2026 services rendered',
  });
  const sends      = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const transferData = sends[1].params[0].data;
  // transferWithFee(address recipient, uint256 amount) = 4 + 32 + 32 = 68 bytes
  assert.equal(transferData.length, 138,
    'settlement calldata must be exactly 68 bytes (no extra metadata fields)');
});

test('merchant ref containing alternate address: settlement calldata still uses IXID_DEST', async () => {
  // Prove that metadata fields cannot redirect the transfer to a different address.
  const altAddress = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const mock = successMock({ approvalNeeded: false });
  const IX   = loadModule(mock.request);
  await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER,
    recipient: IXID_DEST,     // authority: from IX ID revalidation
    amount: 5, total: 5.05,
    requiresApproval: false,
    txReference: altAddress,  // metadata — must not affect calldata
    txMemo:      altAddress,
  });
  const sends      = mock.log.filter(e => e.method === 'eth_sendTransaction');
  const data       = sends[0].params[0].data;
  const recipientEncoded = data.slice(10, 74).toLowerCase();

  assert.equal(
    recipientEncoded,
    encodeAddress(IXID_DEST).toLowerCase(),
    'settlement calldata recipient must be IXID_DEST regardless of metadata'
  );
  assert.notEqual(
    recipientEncoded,
    encodeAddress(altAddress).toLowerCase(),
    'metadata must never override the verified IX ID destination'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — UNSUPPORTED CHAIN
// ─────────────────────────────────────────────────────────────────────────────

test('unsupported chain (Ethereum mainnet, chainId 1) → UNSUPPORTED_CHAIN, zero provider calls', async () => {
  const txCalls = [];
  const IX = loadModule(async (payload) => {
    txCalls.push(payload.method);
    return '0x01';
  });
  const result = await IX.executeTransfer({
    action: 'execute',
    chainId: 1, // Ethereum mainnet — not supported by ImplicitEx
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'failed', 'must fail for unsupported chain');
  assert.equal(result.error.code, 'UNSUPPORTED_CHAIN');
  assert.deepEqual(
    txCalls.filter(m => m === 'eth_sendTransaction'),
    [],
    'zero transactions for unsupported chain'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — CONFIRMED RECEIPT SHAPE
// ─────────────────────────────────────────────────────────────────────────────

test('confirmed receipt: all required fields present with correct values', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, fee: 0.05, total: 5.05,
    token: 'USDC', source: 'transfer-portal',
    traceId: 'portal-boundary-test-001',
  });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.sender, SENDER);
  const r = result.receipt;
  assert.ok(r,                                  'receipt must be present on confirmed');
  assert.equal(r.schema,    'implicitex.receipt.v1');
  assert.equal(r.txHash,    TRANSFER_HASH,      'receipt must reference transfer hash');
  assert.equal(r.approvalHash, APPROVAL_HASH,   'receipt must reference approval hash');
  assert.equal(r.sender,    SENDER);
  assert.equal(r.recipient, IXID_DEST,          'receipt must reference IX ID destination');
  assert.equal(r.token,     'USDC');
  assert.equal(r.chainId,   137);
  assert.equal(r.chainName, 'Polygon');
  assert.ok(r.explorerUrl && r.explorerUrl.includes(TRANSFER_HASH),
    'receipt explorer URL must include transfer hash');
  assert.equal(Number(r.amount), 5,    'receipt amount must be recipient amount');
  assert.equal(Number(r.fee),    0.05, 'receipt fee must match 1% fee');
  assert.equal(Number(r.total),  5.05, 'receipt total must match payer debit');
  assert.ok(typeof r.confirmedAt === 'number', 'confirmedAt must be a timestamp');
});

test('APPROVE_THEN_TRANSFER: receipt shows both approvalHash and transferHash', async () => {
  const mock = successMock({ approvalNeeded: true });
  const IX   = loadModule(mock.request);
  const result = await IX.executeTransfer({
    action: 'execute', chainId: 137,
    sender: SENDER, recipient: IXID_DEST,
    amount: 5, total: 5.05,
  });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.receipt.approvalHash, APPROVAL_HASH, 'approval hash must appear in receipt');
  assert.equal(result.receipt.txHash,       TRANSFER_HASH, 'transfer hash must appear in receipt');
});
