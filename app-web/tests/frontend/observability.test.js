const assert = require('node:assert/strict');
const path = require('node:path');

const status = require(path.resolve(__dirname, '../../frontend/public/js/transfer-status.js'));
const classifier = require(path.resolve(__dirname, '../../frontend/public/js/error-classifier.js'));
const schema = require(path.resolve(__dirname, '../../frontend/public/js/receipt-schema.js'));
const integrity = require(path.resolve(__dirname, '../../frontend/public/js/receipt-integrity.js'));
const proof = require(path.resolve(__dirname, '../../frontend/public/js/proof-packet.js'));

const S = status.IX_TRANSFER_STATES;
const O = schema.OBSERVATION_SOURCES;

function loadReceiptStore() {
  const receiptStorePath = path.resolve(__dirname, '../../frontend/public/js/receipt-store.js');
  delete require.cache[receiptStorePath];

  const store = new Map();
  global.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };
  global.window = {
    IX: {
      transferStatus: status,
      receiptSchema: schema,
      receiptIntegrity: integrity,
    },
    dispatchEvent() {},
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, value);
      },
      removeItem(key) {
        store.delete(key);
      },
    },
  };
  global.localStorage = global.window.localStorage;
  require(receiptStorePath);
  return global.window.IX.receipts;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('status vocabulary has no duplicate values', () => {
  const values = Object.values(S);
  assert.equal(new Set(values).size, values.length);
});

test('invalid receipt transitions are rejected', () => {
  assert.equal(status.canTransition(S.READY, S.CONFIRMED), false);
  assert.equal(status.canTransition(S.SUBMITTED, S.CONFIRMED), true);
});

test('confirmed receipts cannot regress', () => {
  const current = { id: 'r1', state: S.CONFIRMED, fundsMoved: true };
  const result = integrity.applyIntegrityUpdate(current, {
    state: S.OUTCOME_UNKNOWN,
    fundsMoved: null,
    lastKnownMessage: 'RPC failed later.',
  });
  assert.equal(result.ok, false);
});

test('duplicate tx hashes merge safely', () => {
  const receipts = loadReceiptStore();
  const first = receipts.create({
    state: S.SUBMITTED,
    transferHash: '0xabc',
    hash: '0xabc',
    fundsMoved: null,
    amount: '1.000000',
  });
  const second = receipts.create({
    state: S.SUBMITTED,
    transferHash: '0xabc',
    hash: '0xabc',
    fundsMoved: null,
    amount: '1.000000',
  });

  assert.equal(first.id, second.id);
  assert.equal(receipts.listAll().length, 1);
});

test('metadata-only receipt updates do not reset state', () => {
  const updated = integrity.applyIntegrityUpdate(
    { state: S.SUBMITTED, transferHash: '0xabc', fundsMoved: null },
    { lastKnownMessage: 'Still checking.' }
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.receipt.state, S.SUBMITTED);
});

test('legacy migrated receipt gets observationSource migration', () => {
  const migrated = schema.migrateReceipt({ id: 'legacy' });
  assert.equal(migrated.observationSource, O.MIGRATION);
});

test('new receipt gets observationSource local', () => {
  const receipts = loadReceiptStore();
  const stored = receipts.create({ id: 'new-local' });
  assert.equal(stored.observationSource, O.LOCAL);
  assert.ok(stored.lastObservedAt);
});

test('wallet update stamps wallet source', () => {
  const receipts = loadReceiptStore();
  const stored = receipts.create({ id: 'wallet-source', state: S.READY });
  receipts.update(stored.id, {
    state: S.AUTHORIZING,
    observationSource: O.WALLET,
  });
  const active = receipts.getActive();
  assert.equal(active.observationSource, O.WALLET);
  assert.ok(active.lastObservedAt);
});

test('rpc confirmation stamps rpc source', () => {
  const updated = integrity.applyIntegrityUpdate(
    { state: S.SUBMITTED, transferHash: '0xabc', fundsMoved: null },
    { state: S.CONFIRMED, fundsMoved: true, observationSource: O.RPC }
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.receipt.observationSource, O.RPC);
});

test('rehydration enrichment stamps rehydration source', () => {
  const updated = integrity.applyIntegrityUpdate(
    { state: S.OUTCOME_UNKNOWN, transferHash: '0xabc', fundsMoved: null },
    { state: S.CONFIRMED, fundsMoved: true, observationSource: O.REHYDRATION }
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.receipt.observationSource, O.REHYDRATION);
});

test('classifier never exposes raw stack traces', () => {
  const explained = classifier.classifyError(new Error('insufficient funds\n    at Secret (/tmp/private.js:1:1)'));
  assert.equal(explained.code, 'INSUFFICIENT_BALANCE');
  assert.doesNotMatch(explained.message, /\/tmp|at Secret|private\.js/);
  assert.doesNotMatch(explained.retryGuidance, /\/tmp|at Secret|private\.js/);
});

test('classifier does not mark fundsMoved false when broadcast is unknown', () => {
  const explained = classifier.classifyError(new Error('provider wait failed'), {
    broadcastKnown: true,
  });
  assert.equal(explained.state, S.OUTCOME_UNKNOWN);
  assert.equal(explained.fundsMoved, null);
});

test('proof packet includes schemaVersion', () => {
  const packet = proof.buildProofPacket({
    state: S.CONFIRMED,
    transferHash: '0xabc',
    amount: '1.000000',
  });
  assert.equal(packet.schemaVersion, proof.PROOF_PACKET_SCHEMA_VERSION);
});

test('legacy uppercase state migrates to lowercase', () => {
  const migrated = schema.migrateReceipt({ state: 'OUTCOME_UNKNOWN' });
  assert.equal(migrated.state, S.OUTCOME_UNKNOWN);
});

test('missing receipt schemaVersion is added', () => {
  const migrated = schema.migrateReceipt({ id: 'legacy' });
  assert.equal(migrated.schemaVersion, schema.RECEIPT_SCHEMA_VERSION);
});

test('missing metadata fields are added', () => {
  const migrated = schema.migrateReceipt({ id: 'legacy' });
  assert.equal(migrated.purposeTag, '');
  assert.equal(migrated.referenceId, '');
  assert.equal(migrated.memo, '');
});

test('hash and transferHash are reconciled', () => {
  const hashOnly = schema.migrateReceipt({ hash: '0xabc' });
  assert.equal(hashOnly.transferHash, '0xabc');

  const transferHashOnly = schema.migrateReceipt({ transferHash: '0xdef' });
  assert.equal(transferHashOnly.hash, '0xdef');
});

test('fundsMoved true cannot be weakened', () => {
  const merged = schema.mergeReceiptForward(
    { state: S.CONFIRMED, fundsMoved: true, transferHash: '0xabc' },
    { state: S.OUTCOME_UNKNOWN, fundsMoved: null }
  );
  assert.equal(merged.state, S.CONFIRMED);
  assert.equal(merged.fundsMoved, true);
});

test('provenance-only update cannot weaken confirmed receipt', () => {
  const updated = integrity.applyIntegrityUpdate(
    { state: S.CONFIRMED, transferHash: '0xabc', fundsMoved: true, observationSource: O.RPC },
    { observationSource: O.WALLET }
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.receipt.state, S.CONFIRMED);
  assert.equal(updated.receipt.fundsMoved, true);
  assert.equal(updated.receipt.observationSource, O.WALLET);
});

test('lastObservedAt is added when source is stamped', () => {
  const receipts = loadReceiptStore();
  const stored = receipts.create({ id: 'observed-at' });
  receipts.update(stored.id, { observationSource: O.WALLET, lastKnownMessage: 'Wallet update.' });
  assert.ok(receipts.getActive().lastObservedAt);
});

test('unknown observationSource falls back during normalization', () => {
  const migrated = schema.migrateReceipt({ observationSource: 'surprise' });
  assert.equal(migrated.observationSource, O.LOCAL);
});

test('archive receipts are preserved during migration', () => {
  const receipts = loadReceiptStore();
  receipts.create({ id: 'active', state: S.SUBMITTED, transferHash: '0xaaa' });
  receipts.create({ id: 'next', state: S.READY });
  const archived = receipts.listRecent();
  assert.equal(archived.length, 1);
  assert.equal(archived[0].transferHash, '0xaaa');
  assert.equal(archived[0].schemaVersion, schema.RECEIPT_SCHEMA_VERSION);
});

test('malformed receipt does not crash store', () => {
  const receipts = loadReceiptStore();
  const stored = receipts.create(null);
  assert.equal(stored.schemaVersion, schema.RECEIPT_SCHEMA_VERSION);
  assert.equal(stored.state, S.READY);
});

test('rehydration can enrich outcome_unknown to confirmed', () => {
  const enriched = integrity.applyIntegrityUpdate(
    { state: S.OUTCOME_UNKNOWN, transferHash: '0xabc', fundsMoved: null },
    { state: S.CONFIRMED, blockNumber: 123, fundsMoved: true }
  );
  assert.equal(enriched.ok, true);
  assert.equal(enriched.receipt.state, S.CONFIRMED);
  assert.equal(enriched.receipt.fundsMoved, true);
  assert.equal(enriched.receipt.blockNumber, 123);
});

test('rehydration does not overwrite confirmed with unclear', () => {
  const regressed = integrity.applyIntegrityUpdate(
    { state: S.CONFIRMED, transferHash: '0xabc', blockNumber: 123, fundsMoved: true },
    { state: S.UNCLEAR, fundsMoved: null }
  );
  assert.equal(regressed.ok, false);
});

test('proof packet can export migrated receipts', () => {
  const packet = proof.buildProofPacket({ state: 'CONFIRMED', hash: '0xabc' });
  assert.equal(packet.status, S.CONFIRMED);
  assert.equal(packet.transactionHash, '0xabc');
  assert.equal(packet.schemaVersion, proof.PROOF_PACKET_SCHEMA_VERSION);
});

test('rehydration-style enrichment does not overwrite stronger facts', () => {
  const current = {
    id: 'r1',
    state: S.OUTCOME_UNKNOWN,
    transferHash: '0xabc',
    fundsMoved: null,
  };
  const enriched = integrity.applyIntegrityUpdate(current, {
    state: S.CONFIRMED,
    blockNumber: 123,
    fundsMoved: true,
  });
  assert.equal(enriched.ok, true);
  assert.equal(enriched.receipt.state, S.CONFIRMED);
  assert.equal(enriched.receipt.blockNumber, 123);

  const regressed = integrity.applyIntegrityUpdate(enriched.receipt, {
    state: S.OUTCOME_UNKNOWN,
    fundsMoved: null,
  });
  assert.equal(regressed.ok, false);
});

// ---- Failure Path 3: wallet-busy (-32002) ----

test('classifier -32002 returns INTERRUPTED with fundsMoved false', () => {
  const err = Object.assign(new Error('MetaMask already has a pending request.'), { code: -32002 });
  const explained = classifier.classifyError(err, { phase: 'authorization' });
  assert.equal(explained.code, 'WALLET_REQUEST_PENDING');
  assert.equal(explained.state, S.INTERRUPTED);
  assert.equal(explained.fundsMoved, false);
  assert.equal(explained.broadcastKnown, false);
});

test('classifier -32002 at transfer phase also returns INTERRUPTED', () => {
  const err = Object.assign(new Error('MetaMask already has a pending request.'), { code: -32002 });
  const explained = classifier.classifyError(err, { phase: 'transfer' });
  assert.equal(explained.state, S.INTERRUPTED);
  assert.equal(explained.fundsMoved, false);
});

test('interrupted receipt preserves transfer attempt fields on state resolve', () => {
  const merged = schema.mergeReceiptForward(
    {
      state: S.AUTHORIZING,
      fundsMoved: false,
      sender: '0xSENDER',
      recipient: '0xRECIPIENT',
      amount: '1.0',
      fee: '0.01',
      totalDebit: '1.01',
      chainId: 137,
    },
    {
      state: S.INTERRUPTED,
      fundsMoved: false,
      lastKnownMessage: 'Wallet request already pending. No authorization occurred. No funds moved.',
    }
  );
  assert.equal(merged.state, S.INTERRUPTED);
  assert.equal(merged.fundsMoved, false);
  assert.equal(merged.sender, '0xSENDER');
  assert.equal(merged.recipient, '0xRECIPIENT');
  assert.equal(merged.amount, '1.0');
  assert.equal(merged.chainId, 137);
});

test('interrupted receipt cannot transition directly to confirmed', () => {
  assert.equal(status.canTransition(S.INTERRUPTED, S.CONFIRMED), false);
  assert.equal(status.canTransition(S.INTERRUPTED, S.REJECTED), false);
  assert.equal(status.canTransition(S.INTERRUPTED, S.OUTCOME_UNKNOWN), true);
});
