'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

// ── loader ────────────────────────────────────────────────────────────────────
// gas-service.js is a browser IIFE that writes window.ImplicitExGas.
// Each test loads a fresh module instance with its own fetch mock so tests
// cannot share state through global.window or global.fetch.

function loadService({ fetchImpl } = {}) {
  const servicePath = path.resolve(
    __dirname, '../../frontend/public/js/gas-service.js'
  );
  delete require.cache[servicePath];

  // Reset globals so each test gets a clean environment.
  global.window = {};
  global.fetch  = fetchImpl || (() => Promise.reject(new Error('fetch not mocked')));
  // AbortController is available natively in Node 15+.

  require(servicePath);
  return global.window.ImplicitExGas;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body, status = 200) {
  return Promise.resolve({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  });
}

// slow fetch — settles after `delayMs`, respects AbortSignal
function makeSlowResponse(body, delayMs) {
  return (url, opts) => new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve({
      ok: true, status: 200, json: () => Promise.resolve(body),
    }), delayMs);
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        clearTimeout(id);
        const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
        reject(err);
      });
    }
  });
}

// fetch that never settles (only aborts)
function makeHungResponse() {
  return (url, opts) => new Promise((_, reject) => {
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
        reject(err);
      });
    }
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

describe('module shape', () => {
  test('ImplicitExGas exposes fetchGasPrice, formatGwei, startPolling', () => {
    const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    assert.equal(typeof svc.fetchGasPrice, 'function');
    assert.equal(typeof svc.formatGwei,    'function');
    assert.equal(typeof svc.startPolling,  'function');
  });

  test('loading gas-service.js does not leak extra globals', () => {
    const before = new Set(Object.keys(global));
    loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    const after  = new Set(Object.keys(global));
    const added  = [...after].filter(
      k => !before.has(k) && k !== 'window' && k !== 'fetch'
    );
    assert.deepEqual(added, [], `unexpected globals: ${added.join(', ')}`);
  });
});

// ── formatGwei ────────────────────────────────────────────────────────────────

describe('formatGwei', () => {
  test('rounds ≥100 to integer', () => {
    const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    assert.equal(formatGwei(123.7), '124');
    assert.equal(formatGwei(100),   '100');
  });

  test('one decimal place for 10–99', () => {
    const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    assert.equal(formatGwei(50),    '50.0');
    assert.equal(formatGwei(35.25), '35.3');
    assert.equal(formatGwei(10),    '10.0');
  });

  test('two decimal places for values in 0–9 range', () => {
    const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    assert.equal(formatGwei(1.5),  '1.50');
    assert.equal(formatGwei(9.99), '9.99');
  });

  test('returns em-dash for NaN, ±Infinity, null, undefined, string', () => {
    const { formatGwei } = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    assert.equal(formatGwei(NaN),       '—');
    assert.equal(formatGwei(Infinity),  '—');
    assert.equal(formatGwei(-Infinity), '—');
    assert.equal(formatGwei(null),      '—');
    assert.equal(formatGwei(undefined), '—');
    assert.equal(formatGwei('hello'),   '—');
  });
});

// ── fetchGasPrice — valid responses ───────────────────────────────────────────

describe('fetchGasPrice — valid responses', () => {
  test('resolves standard and fast from maxFee', async () => {
    const svc   = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    const tiers = await svc.fetchGasPrice();
    assert.equal(tiers.standard, 35.2);
    assert.equal(tiers.fast,     50.0);
  });

  test('computes rapid = fast + max(1, spread * 0.5)', async () => {
    const svc   = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    const tiers = await svc.fetchGasPrice();
    // spread = max(1, 50 - 35.2) = 14.8; rapid = 50 + max(1, 7.4) = 57.4
    const spread   = Math.max(1, tiers.fast - tiers.standard);
    const expected = tiers.fast + Math.max(1, spread * 0.5);
    assert.ok(Math.abs(tiers.rapid - expected) < 0.0001,
      `rapid ${tiers.rapid} !== expected ${expected}`);
  });

  test('minimum spread of 1 when fast ≈ standard', async () => {
    const flatResponse = {
      ...TYPICAL_RESPONSE,
      standard: { maxFee: 30.0, maxPriorityFee: 29 },
      fast:     { maxFee: 30.5, maxPriorityFee: 29 },
    };
    const svc   = loadService({ fetchImpl: () => makeResponse(flatResponse) });
    const tiers = await svc.fetchGasPrice();
    // spread = max(1, 0.5) = 1; rapid = 30.5 + 1 = 31.5
    assert.ok(tiers.rapid >= tiers.fast + 0.9,
      `rapid ${tiers.rapid} should be at least fast+0.9 (min-spread 1)`);
  });

  test('returns blockNumber and blockTime', async () => {
    const svc   = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    const tiers = await svc.fetchGasPrice();
    assert.equal(tiers.blockNumber, 68921000);
    assert.equal(tiers.blockTime,   2);
  });

  test('falls back to maxPriorityFee when maxFee is absent', async () => {
    const priorityOnlyResponse = {
      standard:    { maxPriorityFee: 28 },
      fast:        { maxPriorityFee: 45 },
      blockTime:   2,
      blockNumber: 100,
    };
    const svc   = loadService({ fetchImpl: () => makeResponse(priorityOnlyResponse) });
    const tiers = await svc.fetchGasPrice();
    assert.equal(tiers.standard, 28);
    assert.equal(tiers.fast,     45);
  });
});

// ── fetchGasPrice — malformed / invalid responses ─────────────────────────────

describe('fetchGasPrice — malformed / invalid responses', () => {
  test('rejects on HTTP error status', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({}, 503) });
    await assert.rejects(
      () => svc.fetchGasPrice(),
      err => { assert.ok(err.message.includes('503')); return true; }
    );
  });

  test('rejects on network failure (fetch throws)', async () => {
    const svc = loadService({
      fetchImpl: () => Promise.reject(new Error('DNS failure')),
    });
    await assert.rejects(
      () => svc.fetchGasPrice(),
      err => { assert.equal(err.message, 'DNS failure'); return true; }
    );
  });

  test('rejects when standard tier is null', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({
      ...TYPICAL_RESPONSE, standard: null,
    })});
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when fast tier is null', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({
      ...TYPICAL_RESPONSE, fast: null,
    })});
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when standard tier is missing from response', async () => {
    const { standard: _dropped, ...noStandard } = TYPICAL_RESPONSE;
    const svc = loadService({ fetchImpl: () => makeResponse(noStandard) });
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when fast tier is missing from response', async () => {
    const { fast: _dropped, ...noFast } = TYPICAL_RESPONSE;
    const svc = loadService({ fetchImpl: () => makeResponse(noFast) });
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when tier maxFee is zero', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({
      ...TYPICAL_RESPONSE, standard: { maxFee: 0 },
    })});
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when tier maxFee is negative', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({
      ...TYPICAL_RESPONSE, fast: { maxFee: -10 },
    })});
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when tier maxFee is a non-numeric string', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({
      ...TYPICAL_RESPONSE, standard: { maxFee: 'N/A' },
    })});
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when tier entry is a non-object primitive', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse({
      ...TYPICAL_RESPONSE, fast: 42,
    })});
    // Number 42 is not an object — readGasTier must treat it as invalid
    await assert.rejects(
      () => svc.fetchGasPrice(),
      { message: /required tier/ }
    );
  });

  test('rejects when request exceeds configured timeout', async () => {
    const svc = loadService({ fetchImpl: makeHungResponse() });
    await assert.rejects(
      () => svc.fetchGasPrice(50),   // 50ms timeout — will abort before settling
      err => {
        const msg = (err.message || '').toLowerCase();
        const name = (err.name  || '').toLowerCase();
        assert.ok(
          msg.includes('abort') || name.includes('abort'),
          `expected AbortError, got: ${err.name}: ${err.message}`
        );
        return true;
      }
    );
  });
});

// ── startPolling — lifecycle ──────────────────────────────────────────────────

describe('startPolling — lifecycle', () => {
  test('calls callback immediately on first tick (success)', async () => {
    const svc     = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    const results = [];
    const id      = svc.startPolling((err, tiers) => results.push({ err, tiers }), 60000);
    await new Promise(r => setImmediate(r));
    clearInterval(id);
    assert.equal(results.length, 1);
    assert.equal(results[0].err, null);
    assert.ok(Number.isFinite(results[0].tiers.standard));
  });

  test('calls callback with error on fetch failure', async () => {
    const svc     = loadService({
      fetchImpl: () => Promise.reject(new Error('DNS failure')),
    });
    const results = [];
    const id      = svc.startPolling((err, tiers) => results.push({ err, tiers }), 60000);
    await new Promise(r => setImmediate(r));
    clearInterval(id);
    assert.equal(results.length, 1);
    assert.ok(results[0].err instanceof Error);
    assert.equal(results[0].tiers, null);
  });

  test('returns a clearable interval ID — no calls after clearInterval', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    let callCount = 0;
    const id = svc.startPolling(() => callCount++, 30);
    await new Promise(r => setImmediate(r));    // first tick
    clearInterval(id);
    const countAfterClear = callCount;
    await new Promise(r => setTimeout(r, 100)); // would fire 3× if not cleared
    assert.equal(callCount, countAfterClear);
  });

  test('in-flight guard prevents overlapping requests', async () => {
    let activeRequests    = 0;
    let maxActiveRequests = 0;
    let completedRequests = 0;

    // Instrumented slow fetch: tracks active-request count around each call.
    const instrumentedFetch = (url, opts) => {
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      return makeSlowResponse(TYPICAL_RESPONSE, 80)(url, opts).finally(() => {
        activeRequests--;
        completedRequests++;
      });
    };

    const svc = loadService({ fetchImpl: instrumentedFetch });

    // Interval of 20ms << fetch duration of 80ms → 4–5 intervals fire per fetch.
    // Without the in-flight guard, several requests would be active simultaneously.
    const results = [];
    const id = svc.startPolling(
      (err, tiers) => results.push({ err, tiers }),
      20,
      5000
    );

    await new Promise(r => setTimeout(r, 210)); // span ~10 intervals, ~2 fetch completions
    clearInterval(id);
    await new Promise(r => setTimeout(r, 10));  // let any in-progress tick drain

    assert.equal(maxActiveRequests, 1,
      `max concurrent requests must be 1, got ${maxActiveRequests}`);
    assert.ok(completedRequests >= 2,
      `expected ≥2 completed requests over 210ms window, got ${completedRequests}`);
    assert.ok(results.length >= 1,
      'expected at least one successful callback');
    assert.ok(results.every(r => r.err === null),
      'all callbacks must report success');
  });

  test('stop old loop, start new loop — only new loop fires after restart', async () => {
    const svc = loadService({ fetchImpl: () => makeResponse(TYPICAL_RESPONSE) });
    let callCount = 0;

    const id1 = svc.startPolling(() => callCount++, 30);
    await new Promise(r => setTimeout(r, 50));
    clearInterval(id1);
    const countAfterFirst = callCount;

    const id2 = svc.startPolling(() => callCount++, 30);
    await new Promise(r => setImmediate(r));
    clearInterval(id2);
    const countAfterSecond = callCount;

    // After stopping both, call count must be frozen
    await new Promise(r => setTimeout(r, 80));
    assert.equal(callCount, countAfterSecond,
      'no additional calls after both loops are cleared');
    // Verify that the second loop did fire (first tick)
    assert.ok(countAfterSecond > countAfterFirst,
      'second loop must fire at least one tick');
  });
});
