const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const freeManifest = require(path.resolve(__dirname, '../../frontend/public/js/coincard-free-manifest.js'));
const schema = require(path.resolve(__dirname, '../../frontend/public/js/receipt-schema.js'));
const proof = require(path.resolve(__dirname, '../../frontend/public/js/proof-packet.js'));

const ADDRESS_A = '0x1111111111111111111111111111111111111111';
const ADDRESS_B = '0x2222222222222222222222222222222222222222';

function manifest(overrides) {
  return Object.assign({
    schema: 'implicitex.coincard.free.v1',
    version: 1,
    created: '2026-07-04T18:00:00Z',
    updated: '2026-07-04T18:00:00Z',
    name: 'Aden Media Group',
    recipientAddress: ADDRESS_A,
    network: 'polygon',
    token: 'USDC',
    status: 'active',
  }, overrides || {});
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('validateCoinCardManifest accepts V1 free route manifest', () => {
  const result = freeManifest.validateCoinCardManifest(manifest());
  assert.equal(result.ok, true);
  assert.equal(result.routeValidation, 'valid');
  assert.equal(result.recipientSource, 'host-manifest');
  assert.equal(result.route.network.chainId, 137);
  assert.equal(result.route.token.symbol, 'USDC');
});

test('validateCoinCardManifest rejects recipient identity and presentation creep', () => {
  assert.throws(
    () => freeManifest.validateCoinCardManifest(Object.assign(manifest(), {
      purpose: 'donation',
    })),
    /purpose is not permitted/
  );
  assert.throws(
    () => freeManifest.validateCoinCardManifest(Object.assign(manifest(), {
      name: '<strong>Aden Media Group</strong>',
    })),
    /presentation content/
  );
});

test('canonicalizeManifest is stable across key order', () => {
  const left = manifest();
  const right = {
    status: 'active',
    token: 'USDC',
    network: 'polygon',
    recipientAddress: ADDRESS_A,
    name: 'Aden Media Group',
    updated: '2026-07-04T18:00:00Z',
    created: '2026-07-04T18:00:00Z',
    version: 1,
    schema: 'implicitex.coincard.free.v1',
  };
  assert.equal(
    freeManifest.canonicalizeManifest(left),
    freeManifest.canonicalizeManifest(right)
  );
});

test('hashManifest changes when host changes recipient address', async () => {
  const hashA = await freeManifest.hashManifest(manifest({ recipientAddress: ADDRESS_A }));
  const hashB = await freeManifest.hashManifest(manifest({
    recipientAddress: ADDRESS_B,
    updated: '2026-07-04T19:00:00Z',
  }));
  assert.notEqual(hashA.hash, hashB.hash);
});

test('receipt preserves transaction-time Coin Card evidence after host manifest changes', async () => {
  const contextA = await freeManifest.buildReceiptCoinCardContext({
    manifestUrl: 'https://example.com/coin-card.json',
    manifest: manifest({ recipientAddress: ADDRESS_A }),
  });
  const contextB = await freeManifest.buildReceiptCoinCardContext({
    manifestUrl: 'https://example.com/coin-card.json',
    manifest: manifest({
      recipientAddress: ADDRESS_B,
      updated: '2026-07-04T19:00:00Z',
    }),
  });

  const historical = schema.migrateReceipt({
    state: 'confirmed',
    fundsMoved: true,
    sender: '0x3333333333333333333333333333333333333333',
    recipient: ADDRESS_A,
    amount: '10.000000',
    fee: '0.100000',
    totalDebit: '10.100000',
    chainId: 137,
    network: 'Polygon',
    contractAddress: '0x4444444444444444444444444444444444444444',
    transferHash: '0xabc',
    blockNumber: 12345678,
    coinCard: contextA,
  });

  const merged = schema.mergeReceiptForward(historical, {
    recipient: ADDRESS_B,
    coinCard: contextB,
    lastKnownMessage: 'Later host manifest observation.',
  });

  assert.equal(merged.recipient, ADDRESS_A);
  assert.equal(merged.coinCard.manifestHash, contextA.manifestHash);
  assert.notEqual(merged.coinCard.manifestHash, contextB.manifestHash);
});

test('proof packet renders V1 evidence sections', async () => {
  const coinCard = await freeManifest.buildReceiptCoinCardContext({
    manifestUrl: 'https://example.com/coin-card.json',
    manifest: manifest({ recipientAddress: ADDRESS_A }),
  });
  const packet = proof.buildProofPacket({
    state: 'confirmed',
    fundsMoved: true,
    sender: '0x3333333333333333333333333333333333333333',
    recipient: ADDRESS_A,
    amount: '10.000000',
    fee: '0.100000',
    totalDebit: '10.100000',
    chainId: 137,
    network: 'Polygon',
    contractAddress: '0x4444444444444444444444444444444444444444',
    transferHash: '0xabc',
    blockNumber: 12345678,
    coinCard,
  });

  assert.deepEqual(
    packet.evidenceSections.map((section) => section.title),
    [
      'Settlement Truth',
      'Recorded Coin Card Evidence',
      'Host-Published Manifest Data',
    ]
  );
  assert.equal(packet.evidenceSections[0].facts.recipient, ADDRESS_A);
  assert.equal(packet.evidenceSections[1].facts.manifestHash, coinCard.manifestHash);
  assert.equal(packet.evidenceSections[2].facts.recipientAddress, ADDRESS_A);
});

test('evidence demo path loads, simulates, mutates, and preserves authority', async () => {
  const original = manifest({ recipientAddress: ADDRESS_A });
  const originalContext = await freeManifest.buildReceiptCoinCardContext({
    manifestUrl: 'https://implicitex.com/coincard/coin-card.sample.json',
    manifest: original,
  });
  const receipt = schema.migrateReceipt({
    id: 'demo-receipt-001',
    state: 'confirmed',
    fundsMoved: true,
    sender: '0x3333333333333333333333333333333333333333',
    recipient: original.recipientAddress,
    amount: '10.000000',
    fee: '0.100000',
    totalDebit: '10.100000',
    chainId: 137,
    network: 'Polygon',
    contractAddress: '0x4444444444444444444444444444444444444444',
    transferHash: '0xabc',
    hash: '0xabc',
    blockNumber: 12345678,
    coinCard: originalContext,
  });

  const changed = manifest({
    recipientAddress: ADDRESS_B,
    updated: '2026-07-04T19:00:00Z',
  });
  const changedContext = await freeManifest.buildReceiptCoinCardContext({
    manifestUrl: 'https://implicitex.com/coincard/coin-card.sample.json',
    manifest: changed,
  });

  const merged = schema.mergeReceiptForward(receipt, {
    recipient: changed.recipientAddress,
    coinCard: changedContext,
  });
  const packet = proof.buildProofPacket(merged);

  assert.equal(packet.recipient, ADDRESS_A);
  assert.equal(packet.coinCard.manifestHash, originalContext.manifestHash);
  assert.equal(packet.evidenceSections[0].facts.recipient, ADDRESS_A);
  assert.equal(packet.evidenceSections[1].facts.manifestHash, originalContext.manifestHash);
  assert.equal(packet.evidenceSections[2].facts.recipientAddress, ADDRESS_A);
});

test('evidence demo asks the four skeptical-human questions', () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../frontend/public/coincard/evidence-demo.html'),
    'utf8'
  );
  assert.match(html, /What was published\?/);
  assert.match(html, /What did ImplicitEx observe\?/);
  assert.match(html, /What actually happened\?/);
  assert.match(html, /What changed later\?/);
});

(async () => {
  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`ok - ${entry.name}`);
    } catch (err) {
      console.error(`not ok - ${entry.name}`);
      throw err;
    }
  }
})();
