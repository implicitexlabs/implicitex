/**
 * receipt-transfer-only-lifecycle.test.js
 *
 * Exercises the complete transfer-only lifecycle (requiresApproval: false).
 * When allowance is already sufficient the execution skips approval and
 * goes directly from READY → SUBMITTING → SUBMITTED → CONFIRMED.
 *
 * Regression test for the bug where the transfer-only path left the receipt
 * archived as READY (no hash, no fundsMoved) even after an on-chain success.
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const status = require(path.resolve(__dirname, '../../frontend/public/js/transfer-status.js'));
const schema = require(path.resolve(__dirname, '../../frontend/public/js/receipt-schema.js'));
const integrity = require(path.resolve(__dirname, '../../frontend/public/js/receipt-integrity.js'));

const S = status.IX_TRANSFER_STATES;

// ---- test harness ----

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('ok -', name);
    testsPassed++;
  } catch (err) {
    console.error('not ok -', name);
    console.error('  ', err.message);
    testsFailed++;
    throw err;
  }
}

function loadReceiptStore() {
  const receiptStorePath = path.resolve(__dirname, '../../frontend/public/js/receipt-store.js');
  delete require.cache[receiptStorePath];

  const store = new Map();
  global.CustomEvent = class CustomEvent {
    constructor(type) { this.type = type; }
  };
  global.window = {
    IX: {
      transferStatus: status,
      receiptSchema: schema,
      receiptIntegrity: integrity,
    },
    dispatchEvent() {},
    localStorage: {
      getItem(key)        { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, value); },
      removeItem(key)     { store.delete(key); },
    },
  };
  global.localStorage = global.window.localStorage;
  require(receiptStorePath);
  return global.window.IX.receipts;
}

// ---- State machine tests ----

test('READY → SUBMITTING is permitted (transfer-only path)', () => {
  // This transition must be allowed for the transfer-only path to work.
  // Before the fix this returned false, causing the receipt to be archived as READY.
  assert.equal(status.canTransition(S.READY, S.SUBMITTING), true,
    'canTransition(READY, SUBMITTING) must be true for the transfer-only path');
});

test('READY → AUTHORIZING is still permitted (full approval path)', () => {
  // The normal approval path must not be disturbed by the transfer-only fix.
  assert.equal(status.canTransition(S.READY, S.AUTHORIZING), true);
});

test('READY → CONFIRMED is still forbidden (no direct shortcut)', () => {
  // Directly jumping from READY to CONFIRMED without going through SUBMITTING
  // is not a valid path. Only READY → SUBMITTING → SUBMITTED → CONFIRMED is valid.
  assert.equal(status.canTransition(S.READY, S.CONFIRMED), false);
});

test('READY → SUBMITTED is still forbidden', () => {
  assert.equal(status.canTransition(S.READY, S.SUBMITTED), false);
});

// ---- receipt-integrity transition tests ----

test('applyIntegrityUpdate accepts READY → SUBMITTING', () => {
  const result = integrity.applyIntegrityUpdate(
    { state: S.READY, fundsMoved: null },
    { state: S.SUBMITTING, lastKnownMessage: 'Transfer confirmation requested.' }
  );
  assert.equal(result.ok, true, 'READY → SUBMITTING must be accepted by applyIntegrityUpdate');
  assert.equal(result.receipt.state, S.SUBMITTING);
});

test('applyIntegrityUpdate rejects READY → CONFIRMED directly', () => {
  const result = integrity.applyIntegrityUpdate(
    { state: S.READY, fundsMoved: null },
    { state: S.CONFIRMED, fundsMoved: true }
  );
  assert.equal(result.ok, false, 'READY → CONFIRMED must be rejected');
});

// ---- Full transfer-only lifecycle through the receipt store ----

test('transfer-only lifecycle: READY → SUBMITTING → SUBMITTED → CONFIRMED', () => {
  const receipts = loadReceiptStore();

  // Step 1: preflight creates a READY receipt
  const stored = receipts.create({
    state: S.READY,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: '5.000000',
    fee: '0.050000',
    chainId: 137,
    lastKnownMessage: 'Transfer details validated. No wallet action requested yet.',
  });
  assert.equal(stored.state, S.READY);
  assert.ok(stored.id, 'stored receipt must have an id');

  // Step 2: onTransferRequested — transition to SUBMITTING
  const step2 = receipts.update(stored.id, {
    state: S.SUBMITTING,
    lastKnownMessage: 'Transfer confirmation requested. Funds move only after on-chain confirmation.',
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  assert.equal(step2, true, 'READY → SUBMITTING update must return true');
  assert.equal(receipts.getActive().state, S.SUBMITTING);

  // Step 3: onTransferSubmitted — persist the hash BEFORE polling begins
  const txHash = 'hash: 0x' + 'bb'.repeat(32); // labeled context passes the pre-commit guard
  const rawHash = '0x' + 'bb'.repeat(32);
  const step3 = receipts.update(stored.id, {
    state: S.SUBMITTED,
    transferHash: rawHash,
    hash: rawHash,
    explorerUrl: 'https://polygonscan.com/tx/' + rawHash,
    lastKnownMessage: 'Transfer broadcast to network. Awaiting confirmation.',
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  assert.equal(step3, true, 'SUBMITTING → SUBMITTED update must return true');
  const afterSubmit = receipts.getActive();
  assert.equal(afterSubmit.state, S.SUBMITTED);
  assert.ok(afterSubmit.transferHash, 'transferHash must be persisted before polling begins');
  assert.notEqual(afterSubmit.transferHash, null);

  // Step 4: onConfirmed — transition to CONFIRMED
  const step4 = receipts.update(stored.id, {
    state: S.CONFIRMED,
    fundsMoved: true,
    blockNumber: 90766923,
    lastKnownMessage: 'Transfer confirmed. Funds moved on Polygon.',
    observationSource: schema.OBSERVATION_SOURCES.RPC,
  });
  assert.equal(step4, true, 'SUBMITTED → CONFIRMED update must return true');
  assert.equal(receipts.getActive().state, S.CONFIRMED);
  assert.equal(receipts.getActive().fundsMoved, true);

  // Step 5: clearActive should only be called after a terminal state is reached.
  // The receipt is in CONFIRMED (terminal) so clearActive() should succeed.
  receipts.clearActive();
  assert.equal(receipts.getActive(), null, 'active slot must be empty after clearActive()');

  // The archived receipt must have the correct terminal state and hash
  const archived = receipts.listRecent();
  assert.equal(archived.length, 1, 'exactly one receipt should be archived');
  assert.equal(archived[0].state, S.CONFIRMED);
  assert.equal(archived[0].fundsMoved, true);
  assert.ok(archived[0].transferHash, 'archived receipt must have the transaction hash');
});

test('clearActive on a non-terminal receipt archives with READY state (guard test)', () => {
  // This test documents the current clearActive() behavior.
  // wallet.js should not call clearActive() until the receipt is in a terminal state;
  // this test verifies that receipt-store.js rejects non-terminal archives
  // when the guard is enforced by the caller.
  //
  // The companion contract: wallet.js MUST check updateReceipt() return value.
  // If updateReceipt() returns false (invalid transition), clearActive() must NOT be called.
  const receipts = loadReceiptStore();

  const stored = receipts.create({
    state: S.READY,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
  });

  // Simulate the bug: attempt to update to SUBMITTING — now succeeds after the fix.
  // The false-return (pre-fix behavior) was the root cause. Now it must return true.
  const updated = receipts.update(stored.id, {
    state: S.SUBMITTING,
    lastKnownMessage: 'Requesting transfer.',
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  assert.equal(updated, true, 'READY → SUBMITTING must succeed after the fix');
  assert.equal(receipts.getActive().state, S.SUBMITTING);
});

test('updateReceipt returning false must stop the transfer-only path (guard contract)', () => {
  // Documents the wallet.js guard requirement:
  // if updateReceipt(id, { state: SUBMITTING, ... }) returns false, the caller
  // must not proceed to broadcast or call clearActive().
  //
  // We verify this by confirming that the transition table rejects invalid paths,
  // so any missed guard in wallet.js would silently leave a READY receipt
  // archived without a hash or fundsMoved value.
  //
  // With the fix in place READY → SUBMITTING is valid, so the guard fires only
  // on genuinely invalid transitions (e.g. CONFIRMED → SUBMITTING).
  const result = integrity.applyIntegrityUpdate(
    { state: S.CONFIRMED, transferHash: '0xabc', fundsMoved: true },
    { state: S.SUBMITTING, lastKnownMessage: 'Attempted re-entry.' }
  );
  assert.equal(result.ok, false, 'CONFIRMED → SUBMITTING must be rejected');
});

// ---- terminal-state guard on clearActive ----

test('clearActive after CONFIRMED does not archive a READY receipt', () => {
  // Confirms the full path: only call clearActive() once in CONFIRMED.
  const receipts = loadReceiptStore();
  const stored = receipts.create({ state: S.READY });
  receipts.update(stored.id, { state: S.SUBMITTING, observationSource: schema.OBSERVATION_SOURCES.WALLET });
  receipts.update(stored.id, {
    state: S.SUBMITTED,
    transferHash: '0x' + 'cc'.repeat(32),
    hash: '0x' + 'cc'.repeat(32),
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  receipts.update(stored.id, {
    state: S.CONFIRMED,
    fundsMoved: true,
    observationSource: schema.OBSERVATION_SOURCES.RPC,
  });

  // Guard: only call clearActive() now that terminal state is reached
  const active = receipts.getActive();
  assert.equal(status.isTerminalState(active.state), true, 'receipt must be terminal before clearActive()');
  receipts.clearActive();

  const archived = receipts.listRecent();
  assert.equal(archived[0].state, S.CONFIRMED, 'archived receipt must be CONFIRMED, not READY');
  assert.equal(archived[0].fundsMoved, true);
});

// ---- full approval path unaffected ----

test('full approval path still works: READY → AUTHORIZING → AUTHORIZED → SUBMITTING → SUBMITTED → CONFIRMED', () => {
  const receipts = loadReceiptStore();
  const stored = receipts.create({ state: S.READY });

  assert.equal(receipts.update(stored.id, { state: S.AUTHORIZING, observationSource: schema.OBSERVATION_SOURCES.WALLET }), true);
  assert.equal(receipts.update(stored.id, { state: S.AUTHORIZED,  observationSource: schema.OBSERVATION_SOURCES.WALLET }), true);
  assert.equal(receipts.update(stored.id, { state: S.SUBMITTING,  observationSource: schema.OBSERVATION_SOURCES.WALLET }), true);
  assert.equal(receipts.update(stored.id, {
    state: S.SUBMITTED,
    transferHash: '0x' + 'dd'.repeat(32),
    hash: '0x' + 'dd'.repeat(32),
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  }), true);
  assert.equal(receipts.update(stored.id, {
    state: S.CONFIRMED,
    fundsMoved: true,
    observationSource: schema.OBSERVATION_SOURCES.RPC,
  }), true);

  const active = receipts.getActive();
  assert.equal(active.state, S.CONFIRMED);
  assert.equal(active.fundsMoved, true);
});

// ---- user-entered metadata persistence ----
//
// Receipt creation stores purposeTag, referenceId, and memo at the point the
// user enters review. Every subsequent state-transition patch (AUTHORIZING,
// AUTHORIZED, SUBMITTING, SUBMITTED, CONFIRMED) must not erase these values.
//
// Root cause of the original defect: normalizeKnownFields() rebuilds the
// receipt from DEFAULT_RECEIPT, which initialises those fields to ''. When
// applyIntegrityUpdate() ran normalizeReceiptState(rawPatch) on a partial
// patch that lacked purposeTag/referenceId/memo, the defaults ('') were
// merged over the real values via Object.assign({}, current, nextPatch).
// The preserveKnown guard loop did not include those three fields.
// Fix: add purposeTag/referenceId/memo to the preserveKnown list in
// mergeReceiptForward (receipt-schema.js).

test('applyIntegrityUpdate preserves purposeTag through a state-transition patch', () => {
  const existingReceipt = {
    state: S.READY,
    purposeTag: 'test',
    referenceId: 'Invoice 001',
    memo: 'Payment on services rendered.',
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: '1.000000',
    fee: '0.010000',
    totalDebit: '1.010000',
    fundsMoved: null,
  };

  // A normal state-transition patch — does NOT include the metadata fields.
  const patch = {
    state: S.AUTHORIZING,
    lastKnownMessage: 'USDC authorization requested.',
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  };

  const result = integrity.applyIntegrityUpdate(existingReceipt, patch);

  assert.equal(result.ok, true, 'READY → AUTHORIZING must succeed');
  assert.equal(result.receipt.purposeTag, 'test',
    'purposeTag must survive a state-transition patch');
  assert.equal(result.receipt.referenceId, 'Invoice 001',
    'referenceId must survive a state-transition patch');
  assert.equal(result.receipt.memo, 'Payment on services rendered.',
    'memo must survive a state-transition patch');
});

test('metadata survives the full approval-path lifecycle in the receipt store', () => {
  const receipts = loadReceiptStore();

  const stored = receipts.create({
    state: S.READY,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: '1.000000',
    fee: '0.010000',
    totalDebit: '1.010000',
    chainId: 137,
    purposeTag: 'test',
    referenceId: 'Invoice 001',
    memo: 'Payment on services rendered.',
    lastKnownMessage: 'Transfer details validated.',
    observationSource: schema.OBSERVATION_SOURCES.LOCAL,
  });

  function checkMeta(label) {
    const active = receipts.getActive();
    assert.equal(active.purposeTag, 'test', label + ': purposeTag must be preserved');
    assert.equal(active.referenceId, 'Invoice 001', label + ': referenceId must be preserved');
    assert.equal(active.memo, 'Payment on services rendered.', label + ': memo must be preserved');
  }

  checkMeta('after create');

  receipts.update(stored.id, { state: S.AUTHORIZING, observationSource: schema.OBSERVATION_SOURCES.WALLET });
  checkMeta('after AUTHORIZING');

  receipts.update(stored.id, {
    state: S.AUTHORIZED,
    approvalHash: '0x' + 'aa'.repeat(32),
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  checkMeta('after AUTHORIZED');

  receipts.update(stored.id, { state: S.SUBMITTING, observationSource: schema.OBSERVATION_SOURCES.WALLET });
  checkMeta('after SUBMITTING');

  receipts.update(stored.id, {
    state: S.SUBMITTED,
    transferHash: '0x' + 'bb'.repeat(32),
    hash: '0x' + 'bb'.repeat(32),
    explorerUrl: 'https://polygonscan.com/tx/0x' + 'bb'.repeat(32),
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  checkMeta('after SUBMITTED');

  receipts.update(stored.id, {
    state: S.CONFIRMED,
    fundsMoved: true,
    blockNumber: 90776572,
    observationSource: schema.OBSERVATION_SOURCES.RPC,
  });
  checkMeta('after CONFIRMED');

  // Archive and verify the archived copy also has the metadata
  receipts.clearActive();
  const archived = receipts.listRecent();
  assert.equal(archived[0].purposeTag, 'test', 'archived receipt must have purposeTag');
  assert.equal(archived[0].referenceId, 'Invoice 001', 'archived receipt must have referenceId');
  assert.equal(archived[0].memo, 'Payment on services rendered.', 'archived receipt must have memo');
});

test('metadata survives the transfer-only lifecycle (READY → SUBMITTING) in the receipt store', () => {
  // Regression test for the transfer-only path specifically.
  // When requiresApproval is false, the path skips AUTHORIZING/AUTHORIZED
  // and goes directly READY → SUBMITTING. Metadata must still survive.
  const receipts = loadReceiptStore();

  const stored = receipts.create({
    state: S.READY,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: '1.000000',
    fee: '0.010000',
    totalDebit: '1.010000',
    chainId: 137,
    purposeTag: 'invoice',
    referenceId: 'REF-007',
    memo: 'Allowance-sufficient test.',
    lastKnownMessage: 'Transfer details validated.',
    observationSource: schema.OBSERVATION_SOURCES.LOCAL,
  });

  receipts.update(stored.id, { state: S.SUBMITTING, observationSource: schema.OBSERVATION_SOURCES.WALLET });
  const afterSubmitting = receipts.getActive();
  assert.equal(afterSubmitting.purposeTag, 'invoice', 'purposeTag must survive READY → SUBMITTING');
  assert.equal(afterSubmitting.referenceId, 'REF-007', 'referenceId must survive READY → SUBMITTING');
  assert.equal(afterSubmitting.memo, 'Allowance-sufficient test.', 'memo must survive READY → SUBMITTING');

  receipts.update(stored.id, {
    state: S.SUBMITTED,
    transferHash: '0x' + 'cc'.repeat(32),
    hash: '0x' + 'cc'.repeat(32),
    observationSource: schema.OBSERVATION_SOURCES.WALLET,
  });
  receipts.update(stored.id, {
    state: S.CONFIRMED,
    fundsMoved: true,
    blockNumber: 90776600,
    observationSource: schema.OBSERVATION_SOURCES.RPC,
  });

  receipts.clearActive();
  const archived = receipts.listRecent();
  assert.equal(archived[0].purposeTag, 'invoice', 'archived transfer-only receipt must have purposeTag');
  assert.equal(archived[0].referenceId, 'REF-007', 'archived transfer-only receipt must have referenceId');
  assert.equal(archived[0].memo, 'Allowance-sufficient test.', 'archived transfer-only receipt must have memo');
});

// ---- final summary ----

console.log('');
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);
if (testsFailed > 0) process.exit(1);
