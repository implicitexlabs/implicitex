'use strict';

const assert = require('node:assert/strict');
const path   = require('node:path');

// ── harness ──────────────────────────────────────────────────────────────────

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        () => console.log(`ok - ${name}`),
        err => { console.error(`not ok - ${name}`); throw err; }
      );
    }
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

// ── loader ────────────────────────────────────────────────────────────────────
// gas-service.js is a browser IIFE that writes to global.ImplicitExGas.
// We reset module cache and mock global.fetch between test groups.

function loadService({ fetchImpl } = {}) {
  const servicePath = path.resolve(
    __dirname, '../../frontend/public/js/gas-service.js'
  );
  delete require.cache[servicePath];

  global.window = {};
  global.fetch  = fetchImpl || (() => Promise.reject(new Error('fetch not mocked')));

  require(servicePath);
  return global.window.ImplicitExGas;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body, status = 200) {
  return Promise.resolve({
    ok:   status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

// Typical Polygon Gas Station v2 response shape
const TYPICAL_RESPONSE = {
  safeLow:          { maxFee: 30.5,  maxPriorityFee: 30 },
  standard:         { maxFee: 35.2,  maxPriorityFee: 35 },
  fast:             { maxFee: 50.0,  maxPriorityFee: 49 },
  estimatedBaseFee: 1.2,
  blockTime:        2,
  blockNumber:      68921000,
};

// ── Module shape ──────────────────────────────────────────────────────────────

test('ImplicitExGas exposes fetchGasPrice, formatGwei, startPolling', () => {
  const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  assert.equal(typeof svc.fetchGasPrice,  'function');
  assert.equal(typeof svc.formatGwei,     'function');
  assert.equal(typeof svc.startPolling,   'function');
});

// ── formatGwei ────────────────────────────────────────────────────────────────

test('formatGwei: rounds ≥100 to integer', () => {
  const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  assert.equal(formatGwei(123.7), '124');
  assert.equal(formatGwei(100),   '100');
});

test('formatGwei: one decimal place for 10–99', () => {
  const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  assert.equal(formatGwei(50),    '50.0');
  assert.equal(formatGwei(35.25), '35.3');
  assert.equal(formatGwei(10),    '10.0');
});

test('formatGwei: two decimal places for <10', () => {
  const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  assert.equal(formatGwei(1.5),   '1.50');
  assert.equal(formatGwei(9.99),  '9.99');
  assert.equal(formatGwei(0),     '0.00');
});

test('formatGwei: returns em-dash for non-finite input', () => {
  const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  assert.equal(formatGwei(NaN),       '—');
  assert.equal(formatGwei(Infinity),  '—');
  assert.equal(formatGwei(-Infinity), '—');
  assert.equal(formatGwei(undefined), '—');
  // null coerces to 0 via Number(), which is finite → '0.00' (valid sentinel, gas is never 0)
  assert.equal(formatGwei('hello'),   '—');
});

// ── fetchGasPrice — valid response ────────────────────────────────────────────

test('fetchGasPrice: resolves standard and fast from maxFee', async () => {
  const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  const tiers = await svc.fetchGasPrice();
  assert.equal(tiers.standard, 35.2);
  assert.equal(tiers.fast,     50.0);
});

test('fetchGasPrice: computes rapid = fast + max(1, spread * 0.5)', async () => {
  const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  const tiers = await svc.fetchGasPrice();
  // spread = max(1, 50 - 35.2) = 14.8; rapid = 50 + max(1, 14.8 * 0.5) = 50 + 7.4 = 57.4
  const spread   = Math.max(1, tiers.fast - tiers.standard);
  const expected = tiers.fast + Math.max(1, spread * 0.5);
  assert.ok(Math.abs(tiers.rapid - expected) < 0.0001,
    `rapid ${tiers.rapid} !== expected ${expected}`);
});

test('fetchGasPrice: rapid minimum spread = 1 when fast ≈ standard', async () => {
  const flatResponse = {
    ...TYPICAL_RESPONSE,
    standard: { maxFee: 30.0, maxPriorityFee: 29 },
    fast:     { maxFee: 30.5, maxPriorityFee: 29 },
  };
  const svc = loadService({ fetchImpl: () => makeResponse(flatResponse) });
  const tiers = await svc.fetchGasPrice();
  // spread = max(1, 30.5 - 30) = max(1, 0.5) = 1; rapid = 30.5 + max(1, 0.5) = 31.5
  assert.ok(tiers.rapid >= tiers.fast + 0.9,
    `rapid ${tiers.rapid} should be at least fast + 0.9 (min-spread 1)`);
});

test('fetchGasPrice: returns blockNumber and blockTime', async () => {
  const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  const tiers = await svc.fetchGasPrice();
  assert.equal(tiers.blockNumber, 68921000);
  assert.equal(tiers.blockTime,   2);
});

test('fetchGasPrice: falls back to maxPriorityFee when maxFee absent', async () => {
  const priorityOnlyResponse = {
    standard: { maxPriorityFee: 28 },
    fast:     { maxPriorityFee: 45 },
    blockTime: 2,
    blockNumber: 100,
  };
  const svc = loadService({ fetchImpl: () => makeResponse(priorityOnlyResponse) });
  const tiers = await svc.fetchGasPrice();
  assert.equal(tiers.standard, 28);
  assert.equal(tiers.fast,     45);
});

// ── fetchGasPrice — malformed responses ───────────────────────────────────────

test('fetchGasPrice: rejects on HTTP error status', async () => {
  const svc = loadService({ fetchImpl: () => makeResponse({}, 503) });
  await assert.rejects(
    () => svc.fetchGasPrice(),
    err => {
      assert.ok(err.message.includes('503'), `message: ${err.message}`);
      return true;
    }
  );
});

test('fetchGasPrice: returns NaN rapid when fast missing', async () => {
  const noFastResponse = {
    standard:   { maxFee: 35 },
    blockTime:  2,
    blockNumber: 100,
  };
  const svc = loadService({ fetchImpl: () => makeResponse(noFastResponse) });
  const tiers = await svc.fetchGasPrice();
  assert.ok(!Number.isFinite(tiers.rapid),
    `rapid should be NaN/non-finite when fast is missing, got ${tiers.rapid}`);
});

test('fetchGasPrice: null tier entries coerce to 0 (Number(null) === 0)', async () => {
  // readGasTier: entry=null → Number(null && ...) = Number(null) = 0
  // This is a JS coercion artifact; callers should treat 0 as a sentinel.
  const nullTierResponse = {
    standard:   null,
    fast:       null,
    blockTime:  2,
    blockNumber: 100,
  };
  const svc = loadService({ fetchImpl: () => makeResponse(nullTierResponse) });
  const tiers = await svc.fetchGasPrice();
  assert.equal(tiers.standard, 0);
  assert.equal(tiers.fast,     0);
});

test('fetchGasPrice: rejects on network failure (fetch throws)', async () => {
  const networkErr = new Error('network timeout');
  const svc = loadService({ fetchImpl: () => Promise.reject(networkErr) });
  await assert.rejects(() => svc.fetchGasPrice(), err => {
    assert.equal(err.message, 'network timeout');
    return true;
  });
});

// ── startPolling ──────────────────────────────────────────────────────────────

test('startPolling: calls callback immediately on first tick (success)', async () => {
  const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  const results = [];
  const id = svc.startPolling((err, tiers) => {
    results.push({ err, tiers });
  }, 60000);
  // tick() is async — wait one microtask cycle
  await new Promise(r => setImmediate(r));
  clearInterval(id);
  assert.equal(results.length, 1);
  assert.equal(results[0].err, null);
  assert.ok(Number.isFinite(results[0].tiers.standard));
});

test('startPolling: calls callback with error on fetch failure', async () => {
  const svc = loadService({
    fetchImpl: () => Promise.reject(new Error('DNS failure')),
  });
  const results = [];
  const id = svc.startPolling((err, tiers) => {
    results.push({ err, tiers });
  }, 60000);
  await new Promise(r => setImmediate(r));
  clearInterval(id);
  assert.equal(results.length, 1);
  assert.ok(results[0].err instanceof Error);
  assert.equal(results[0].tiers, null);
});

test('startPolling: returns a clearable interval ID', async () => {
  const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  let callCount = 0;
  const id = svc.startPolling(() => callCount++, 50);
  await new Promise(r => setImmediate(r));   // first tick
  clearInterval(id);
  const countAfterClear = callCount;
  await new Promise(r => setTimeout(r, 120)); // would have fired 2× more if not cleared
  assert.equal(callCount, countAfterClear, 'interval should be cleared after clearInterval');
});

// ── No duplicate globals ──────────────────────────────────────────────────────

test('loading gas-service.js does not leak extra globals', () => {
  const before = new Set(Object.keys(global));
  const svc    = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
  const after  = new Set(Object.keys(global));
  const added  = [...after].filter(k => !before.has(k) && k !== 'window' && k !== 'fetch');
  assert.deepEqual(added, [], `unexpected globals added: ${added.join(', ')}`);
  void svc;
});
