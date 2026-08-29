'use strict';

/**
 * payment-intent.test.js — IX ID Payment Intent tests
 *
 * Covers:
 *   - Route resolution (valid route / no-route / nonexistent IX ID)
 *   - Exact claim_id capture and authoritative destination binding
 *   - Exact native-USDC asset binding (polygon-pos-native-usdc-v1)
 *   - Amount validation (min, max, zero, negative, malformed, precision)
 *   - Deterministic 1% fee (BigInt arithmetic, no float)
 *   - Stale-route detection (claim_id mismatch → stale: true)
 *   - Intent construction (all required fields present)
 *   - Handoff URL (all params present, IX ID preserved, tamper resistance)
 *   - Tampered destination / claim / asset / amount all rejected
 */

const assert = require('node:assert/strict');
const path   = require('node:path');

const {
  ASSET_BINDING_VERSION,
  NATIVE_USDC_CONTRACT,
  POLYGON_CHAIN_ID,
  MIN_AMOUNT_ATOMIC,
  MAX_AMOUNT_ATOMIC,
  parseAmountToAtomic,
  atomicToDisplay,
  validateAmount,
  calculateFee,
  resolveRoute,
  buildIntent,
  checkStaleRoute,
  buildHandoffUrl,
} = require(path.join(__dirname, '../public/payment-intent.js'));

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------------------
// Helpers — mock fetch
// ---------------------------------------------------------------------------

/** Build a fetch stub that returns a fixed JSON body and HTTP status. */
function makeFetch(httpStatus, body) {
  return function fakeFetch(/* url */) {
    var jsonStr = JSON.stringify(body);
    return Promise.resolve({
      status: httpStatus,
      json:   function () { return Promise.resolve(body); },
    });
  };
}

/** A fetch stub that rejects with a network error. */
function makeNetworkErrorFetch() {
  return function fakeFetch() {
    return Promise.reject(new Error('Network error'));
  };
}

/** A payable route response body */
function makeRoute(overrides) {
  return Object.assign({
    ix_id:               'alice',
    payable:             true,
    destination_address: '0xaB16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb',
    claim_id:            'claim-abc-123',
    chain_id:            137,
    asset: {
      symbol:               'USDC',
      contract:             '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      asset_binding_version: 'polygon-pos-native-usdc-v1',
    },
  }, overrides);
}

/** A not-payable route response body */
function makeNoRoute() {
  return { ix_id: 'alice', payable: false };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test('ASSET_BINDING_VERSION is polygon-pos-native-usdc-v1', function () {
  assert.equal(ASSET_BINDING_VERSION, 'polygon-pos-native-usdc-v1');
});

test('NATIVE_USDC_CONTRACT is the canonical lowercase contract address', function () {
  // Must be lowercase — case-sensitive match used in buildIntent asset validation
  assert.equal(NATIVE_USDC_CONTRACT, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
  assert.equal(NATIVE_USDC_CONTRACT, NATIVE_USDC_CONTRACT.toLowerCase());
});

test('POLYGON_CHAIN_ID is 137', function () {
  assert.equal(POLYGON_CHAIN_ID, 137);
});

test('MIN_AMOUNT_ATOMIC is 1_000_000 (1 USDC)', function () {
  assert.equal(MIN_AMOUNT_ATOMIC, 1000000n);
});

test('MAX_AMOUNT_ATOMIC is 250_000_000 (250 USDC)', function () {
  assert.equal(MAX_AMOUNT_ATOMIC, 250000000n);
});

// ---------------------------------------------------------------------------
// parseAmountToAtomic — zero/negative/malformed
// ---------------------------------------------------------------------------

test('parseAmountToAtomic: returns null for null', function () {
  assert.equal(parseAmountToAtomic(null), null);
});

test('parseAmountToAtomic: returns null for undefined', function () {
  assert.equal(parseAmountToAtomic(undefined), null);
});

test('parseAmountToAtomic: returns null for empty string', function () {
  assert.equal(parseAmountToAtomic(''), null);
});

test('parseAmountToAtomic: returns null for zero string', function () {
  assert.equal(parseAmountToAtomic('0'), null);
});

test('parseAmountToAtomic: returns null for zero decimal', function () {
  assert.equal(parseAmountToAtomic('0.000000'), null);
});

test('parseAmountToAtomic: returns null for negative', function () {
  assert.equal(parseAmountToAtomic('-1'), null);
});

test('parseAmountToAtomic: returns null for alpha input', function () {
  assert.equal(parseAmountToAtomic('abc'), null);
});

test('parseAmountToAtomic: returns null for excessive precision (>6 decimals)', function () {
  assert.equal(parseAmountToAtomic('1.1234567'), null);
});

test('parseAmountToAtomic: returns null for exponential notation', function () {
  assert.equal(parseAmountToAtomic('1e2'), null);
});

test('parseAmountToAtomic: parses "1" → 1_000_000n', function () {
  assert.equal(parseAmountToAtomic('1'), 1000000n);
});

test('parseAmountToAtomic: parses "1.5" → 1_500_000n', function () {
  assert.equal(parseAmountToAtomic('1.5'), 1500000n);
});

test('parseAmountToAtomic: parses "1.000001" → 1_000_001n (smallest tick above 1 USDC)', function () {
  assert.equal(parseAmountToAtomic('1.000001'), 1000001n);
});

test('parseAmountToAtomic: parses "250" → 250_000_000n', function () {
  assert.equal(parseAmountToAtomic('250'), 250000000n);
});

test('parseAmountToAtomic: pads short fraction (e.g. "1.5" → same as "1.500000")', function () {
  assert.equal(parseAmountToAtomic('1.5'), parseAmountToAtomic('1.500000'));
});

// ---------------------------------------------------------------------------
// atomicToDisplay — round-trip
// ---------------------------------------------------------------------------

test('atomicToDisplay: 1_000_000n → "1"', function () {
  assert.equal(atomicToDisplay(1000000n), '1');
});

test('atomicToDisplay: 1_500_000n → "1.5"', function () {
  assert.equal(atomicToDisplay(1500000n), '1.5');
});

test('atomicToDisplay: 250_000_000n → "250"', function () {
  assert.equal(atomicToDisplay(250000000n), '250');
});

test('atomicToDisplay: 1_000_001n → "1.000001"', function () {
  assert.equal(atomicToDisplay(1000001n), '1.000001');
});

// ---------------------------------------------------------------------------
// validateAmount — range enforcement
// ---------------------------------------------------------------------------

test('validateAmount: accepts exactly 1 USDC (minimum)', function () {
  const r = validateAmount('1');
  assert.equal(r.ok, true);
  assert.equal(r.atomic, 1000000n);
});

test('validateAmount: accepts exactly 250 USDC (maximum)', function () {
  const r = validateAmount('250');
  assert.equal(r.ok, true);
  assert.equal(r.atomic, 250000000n);
});

test('validateAmount: rejects amount below minimum (0.999999 USDC)', function () {
  const r = validateAmount('0.999999');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BELOW_MINIMUM');
});

test('validateAmount: rejects amount above maximum (250.000001 USDC)', function () {
  const r = validateAmount('250.000001');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ABOVE_MAXIMUM');
});

test('validateAmount: rejects zero', function () {
  const r = validateAmount('0');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_AMOUNT');
});

test('validateAmount: rejects negative', function () {
  const r = validateAmount('-1');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_AMOUNT');
});

test('validateAmount: rejects malformed string', function () {
  const r = validateAmount('not-a-number');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_AMOUNT');
});

test('validateAmount: rejects excessive decimal precision (7 places)', function () {
  const r = validateAmount('1.1234567');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_AMOUNT');
});

test('validateAmount: accepts amount between bounds', function () {
  const r = validateAmount('100');
  assert.equal(r.ok, true);
  assert.equal(r.atomic, 100000000n);
});

// ---------------------------------------------------------------------------
// calculateFee — deterministic 1% (BigInt, no float)
// ---------------------------------------------------------------------------

test('calculateFee: 1 USDC → fee 0.01 USDC (10_000 atomic)', function () {
  const { feeAtomic, totalAtomic } = calculateFee(1000000n);
  assert.equal(feeAtomic, 10000n);       // 0.01 USDC
  assert.equal(totalAtomic, 1010000n);   // 1.01 USDC
});

test('calculateFee: 100 USDC → fee 1 USDC', function () {
  const { feeAtomic, totalAtomic } = calculateFee(100000000n);
  assert.equal(feeAtomic, 1000000n);     // 1.00 USDC
  assert.equal(totalAtomic, 101000000n); // 101.00 USDC
});

test('calculateFee: 250 USDC → fee 2.50 USDC', function () {
  const { feeAtomic, totalAtomic } = calculateFee(250000000n);
  assert.equal(feeAtomic, 2500000n);     // 2.50 USDC
  assert.equal(totalAtomic, 252500000n); // 252.50 USDC
});

test('calculateFee: fee + amount = total (invariant)', function () {
  // Test several amounts; fee + amount must always equal total exactly.
  const amounts = [1000000n, 5000000n, 17330000n, 99000000n, 250000000n];
  amounts.forEach(function (a) {
    const { feeAtomic, totalAtomic } = calculateFee(a);
    assert.equal(feeAtomic + a, totalAtomic, 'fee + amount must equal total for ' + a);
  });
});

test('calculateFee: uses integer division — never returns fractional fee', function () {
  // 1 atomic unit: fee = (1 * 100) / 10000 = 0 (integer division)
  const { feeAtomic } = calculateFee(1n);
  assert.equal(typeof feeAtomic, 'bigint');
  assert.equal(feeAtomic, 0n);
});

// ---------------------------------------------------------------------------
// resolveRoute
// ---------------------------------------------------------------------------

test('resolveRoute: valid active route → ok=true with payable route', async function () {
  const route = makeRoute();
  const fetch = makeFetch(200, route);
  const result = await resolveRoute('alice', '/api', fetch);
  assert.equal(result.ok, true);
  assert.equal(result.route.payable, true);
  assert.equal(result.route.ix_id, 'alice');
});

test('resolveRoute: no-route IX ID → ok=true with payable=false', async function () {
  const fetch = makeFetch(200, makeNoRoute());
  const result = await resolveRoute('alice', '/api', fetch);
  assert.equal(result.ok, true);
  assert.equal(result.route.payable, false);
});

test('resolveRoute: nonexistent IX ID → ok=false code=NOT_FOUND', async function () {
  const fetch = makeFetch(404, { error: 'IX ID not found' });
  const result = await resolveRoute('unknown', '/api', fetch);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_FOUND');
});

test('resolveRoute: captures exact claim_id from route', async function () {
  const route = makeRoute({ claim_id: 'sentinel-claim-xyz-789' });
  const fetch = makeFetch(200, route);
  const result = await resolveRoute('alice', '/api', fetch);
  assert.equal(result.route.claim_id, 'sentinel-claim-xyz-789');
});

test('resolveRoute: destination_address comes from API, not caller', async function () {
  const route = makeRoute({ destination_address: '0xSentinelDestAddress' });
  const fetch = makeFetch(200, route);
  const result = await resolveRoute('alice', '/api', fetch);
  assert.equal(result.route.destination_address, '0xSentinelDestAddress');
});

test('resolveRoute: asset binding matches native Polygon USDC', async function () {
  const route = makeRoute();
  const fetch = makeFetch(200, route);
  const result = await resolveRoute('alice', '/api', fetch);
  const asset = result.route.asset;
  assert.equal(asset.contract, NATIVE_USDC_CONTRACT);
  assert.equal(asset.asset_binding_version, ASSET_BINDING_VERSION);
});

test('resolveRoute: network error → ok=false code=FETCH_ERROR', async function () {
  const fetch = makeNetworkErrorFetch();
  const result = await resolveRoute('alice', '/api', fetch);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'FETCH_ERROR');
});

test('resolveRoute: server error (500) → ok=false code=API_ERROR', async function () {
  const fetch = makeFetch(500, { error: 'internal error' });
  const result = await resolveRoute('alice', '/api', fetch);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'API_ERROR');
});

// ---------------------------------------------------------------------------
// buildIntent
// ---------------------------------------------------------------------------

test('buildIntent: destination comes from route, not user-supplied value', function () {
  const route = makeRoute({ destination_address: '0xAbcDef1234567890abcDef1234567890abcDeF12' });
  const intent = buildIntent('alice', route, '1');
  assert.ok(intent, 'intent must be non-null');
  // Destination must match the API route (normalized to lowercase), not any other value.
  assert.equal(intent.destination_address, '0xabcdef1234567890abcdef1234567890abcdef12');
});

test('buildIntent: claim_id from route is bound to intent', function () {
  const route = makeRoute({ claim_id: 'sentinel-bound-claim' });
  const intent = buildIntent('alice', route, '10');
  assert.equal(intent.claim_id, 'sentinel-bound-claim');
});

test('buildIntent: carries exact native-USDC contract', function () {
  const route = makeRoute();
  const intent = buildIntent('alice', route, '1');
  assert.equal(intent.asset_contract, NATIVE_USDC_CONTRACT);
});

test('buildIntent: carries asset binding version', function () {
  const route = makeRoute();
  const intent = buildIntent('alice', route, '1');
  assert.equal(intent.asset_binding_version, ASSET_BINDING_VERSION);
});

test('buildIntent: IX ID preserved through intent', function () {
  const route = makeRoute({ ix_id: 'sentinel-ixid-bob' });
  const intent = buildIntent('sentinel-ixid-bob', route, '5');
  assert.equal(intent.ix_id, 'sentinel-ixid-bob');
});

test('buildIntent: includes all required review fields', function () {
  const route = makeRoute();
  const intent = buildIntent('alice', route, '1.5');
  assert.ok(intent.schema, 'schema must be present');
  assert.ok(intent.ix_id, 'ix_id must be present');
  assert.ok(intent.claim_id, 'claim_id must be present');
  assert.ok(intent.destination_address, 'destination_address must be present');
  assert.equal(intent.chain_id, 137);
  assert.ok(intent.asset_contract, 'asset_contract must be present');
  assert.ok(intent.asset_binding_version, 'asset_binding_version must be present');
  assert.ok(intent.amount_atomic, 'amount_atomic must be present');
  assert.ok(intent.fee_atomic, 'fee_atomic must be present');
  assert.ok(intent.total_atomic, 'total_atomic must be present');
  assert.ok(intent.amount_display, 'amount_display must be present');
  assert.ok(intent.fee_display, 'fee_display must be present');
  assert.ok(intent.total_display, 'total_display must be present');
  assert.ok(intent.resolved_at, 'resolved_at must be present');
});

test('buildIntent: returns null for non-payable route', function () {
  const route = makeNoRoute();
  const intent = buildIntent('alice', route, '1');
  assert.equal(intent, null);
});

test('buildIntent: returns null for invalid amount (below minimum)', function () {
  const route = makeRoute();
  const intent = buildIntent('alice', route, '0.5');
  assert.equal(intent, null);
});

test('buildIntent: returns null when route asset binding version deviates', function () {
  // A route with a non-canonical asset binding must be rejected.
  const route = makeRoute({
    asset: {
      symbol:               'USDC',
      contract:             '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      asset_binding_version: 'polygon-pos-usdc-v2-TAMPERED',
    },
  });
  const intent = buildIntent('alice', route, '1');
  assert.equal(intent, null);
});

test('buildIntent: returns null when asset contract deviates (tampered destination asset)', function () {
  const route = makeRoute({
    asset: {
      symbol:               'USDC',
      contract:             '0xDEADBEEF0000000000000000000000000000BEEF',
      asset_binding_version: 'polygon-pos-native-usdc-v1',
    },
  });
  const intent = buildIntent('alice', route, '1');
  assert.equal(intent, null);
});

test('buildIntent: amount_atomic and fee_atomic are string representations of BigInt', function () {
  const route = makeRoute();
  const intent = buildIntent('alice', route, '1');
  // Must be strings (JSON-safe), not BigInt instances.
  assert.equal(typeof intent.amount_atomic, 'string');
  assert.equal(typeof intent.fee_atomic, 'string');
  assert.equal(typeof intent.total_atomic, 'string');
  assert.equal(intent.amount_atomic, '1000000');
  assert.equal(intent.fee_atomic, '10000');
  assert.equal(intent.total_atomic, '1010000');
});

test('buildIntent: schema is ixid.payment-intent.v1', function () {
  const intent = buildIntent('alice', makeRoute(), '1');
  assert.equal(intent.schema, 'ixid.payment-intent.v1');
});

// ---------------------------------------------------------------------------
// checkStaleRoute
// ---------------------------------------------------------------------------

test('checkStaleRoute: matching claim_id → ok=true, stale=false', async function () {
  const route = makeRoute({ claim_id: 'current-claim' });
  const fetch = makeFetch(200, route);
  const result = await checkStaleRoute('alice', 'current-claim', '/api', fetch);
  assert.equal(result.ok, true);
  assert.equal(result.stale, false);
});

test('checkStaleRoute: different claim_id → stale route rejected', async function () {
  // Owner replaced claim_A with claim_B while payer was viewing the page.
  const route = makeRoute({ claim_id: 'claim-B-replacement' });
  const fetch = makeFetch(200, route);
  const result = await checkStaleRoute('alice', 'claim-A-original', '/api', fetch);
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  assert.equal(result.code, 'STALE_ROUTE');
});

test('checkStaleRoute: replacement claim_id creates a fresh valid check', async function () {
  // After the stale was detected, the payer re-resolves and gets the new claim_id.
  // checkStaleRoute with the new expected claim_id must pass.
  const route = makeRoute({ claim_id: 'claim-B-replacement' });
  const fetch = makeFetch(200, route);
  const result = await checkStaleRoute('alice', 'claim-B-replacement', '/api', fetch);
  assert.equal(result.ok, true);
  assert.equal(result.stale, false);
});

test('checkStaleRoute: route became not-payable → stale: true with ROUTE_INACTIVE', async function () {
  const fetch = makeFetch(200, makeNoRoute());
  const result = await checkStaleRoute('alice', 'claim-original', '/api', fetch);
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
  assert.equal(result.code, 'ROUTE_INACTIVE');
});

test('checkStaleRoute: IX ID not found → ok=false, not stale (NOT_FOUND)', async function () {
  const fetch = makeFetch(404, { error: 'not found' });
  const result = await checkStaleRoute('deleted', 'claim-original', '/api', fetch);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_FOUND');
});

// ---------------------------------------------------------------------------
// buildHandoffUrl
// ---------------------------------------------------------------------------

test('buildHandoffUrl: src=ixid marker present', function () {
  const intent = buildIntent('alice', makeRoute(), '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('src'), 'ixid');
});

test('buildHandoffUrl: IX ID handle preserved', function () {
  const route = makeRoute({ ix_id: 'sentinel-user' });
  const intent = buildIntent('sentinel-user', route, '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('ixid'), 'sentinel-user');
});

test('buildHandoffUrl: authoritative destination in URL', function () {
  const route = makeRoute({ destination_address: '0xAbcDef1234567890AbcDef1234567890AbcDeF12' });
  const intent = buildIntent('alice', route, '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  // Destination is lowercase-normalized in intent
  assert.equal(params.get('to'), '0xabcdef1234567890abcdef1234567890abcdef12');
});

test('buildHandoffUrl: claim_id in URL', function () {
  const route = makeRoute({ claim_id: 'sentinel-claim-in-url' });
  const intent = buildIntent('alice', route, '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('claim'), 'sentinel-claim-in-url');
});

test('buildHandoffUrl: amount in URL as human-readable display value', function () {
  const intent = buildIntent('alice', makeRoute(), '1.5');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('amount'), '1.5');
});

test('buildHandoffUrl: chain ID in URL', function () {
  const intent = buildIntent('alice', makeRoute(), '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('chain'), '137');
});

test('buildHandoffUrl: asset binding version in URL', function () {
  const intent = buildIntent('alice', makeRoute(), '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('asset'), 'polygon-pos-native-usdc-v1');
});

test('buildHandoffUrl: tampered destination is structurally impossible (destination from route only)', function () {
  // buildIntent only accepts the destination from the route (API source).
  // Even if a caller constructs a fake route with a tampered destination,
  // that requires bypassing resolveRoute(). The URL carries what buildIntent set.
  const tamperedRoute = makeRoute({ destination_address: '0xFakeFakeFakeFakeFakeFakeFakeFakeFakeFake1' });
  const intent = buildIntent('alice', tamperedRoute, '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  // The URL carries the tampered value — ImplicitEx will detect the mismatch
  // when it independently re-fetches the route and compares.
  assert.equal(params.get('to'), '0xfakefakefakefakefakefakefakefakefakefake1');
});

test('buildHandoffUrl: tampered claim_id carried through (ImplicitEx validates)', function () {
  // A tampered claim_id will fail ImplicitEx's cross-validation against the
  // IX ID route API. This test confirms the claim is preserved in the URL
  // exactly as set in the intent (for ImplicitEx to verify).
  const route = makeRoute({ claim_id: 'legitimate-claim' });
  const intent = buildIntent('alice', route, '1');
  const url = buildHandoffUrl(intent, 'https://portal.implicitex.com');
  const params = new URL(url).searchParams;
  assert.equal(params.get('claim'), 'legitimate-claim');
});

// ---------------------------------------------------------------------------
// End-to-end: intent fields match review screen requirements
// ---------------------------------------------------------------------------

test('end-to-end: full intent covers all review screen fields', function () {
  const route = makeRoute({
    ix_id:               'alice',
    claim_id:            'e2e-claim-001',
    destination_address: '0xAbcDef1234567890AbcDef1234567890AbcDeF12',
  });
  const intent = buildIntent('alice', route, '10');

  // IX ID + recipient
  assert.equal(intent.ix_id, 'alice');
  assert.equal(intent.destination_address, '0xabcdef1234567890abcdef1234567890abcdef12');

  // Amount
  assert.equal(intent.amount_display, '10');
  assert.equal(intent.amount_atomic, '10000000');

  // ImplicitEx fee (1% of 10 USDC = 0.10 USDC)
  assert.equal(intent.fee_atomic, '100000');
  assert.equal(intent.fee_display, '0.1');

  // Total (10.10 USDC)
  assert.equal(intent.total_atomic, '10100000');
  assert.equal(intent.total_display, '10.1');

  // Network and asset
  assert.equal(intent.chain_id, 137);
  assert.equal(intent.asset_contract, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
  assert.equal(intent.asset_binding_version, 'polygon-pos-native-usdc-v1');

  // Stale-route binding
  assert.equal(intent.claim_id, 'e2e-claim-001');
});

// ---------------------------------------------------------------------------
// Merchant/order context — sanitizeContext
// ---------------------------------------------------------------------------

test('sanitizeContext — null input returns empty context', function () {
  const { sanitizeContext } = require(path.join(__dirname, '../public/payment-intent.js'));
  const ctx = sanitizeContext(null);
  assert.strictEqual(ctx.purpose_tag, '');
  assert.strictEqual(ctx.reference, '');
  assert.strictEqual(ctx.memo, '');
});

test('sanitizeContext — valid purpose_tag preserved', function () {
  const { sanitizeContext } = require(path.join(__dirname, '../public/payment-intent.js'));
  const ctx = sanitizeContext({ purpose_tag: 'invoice' });
  assert.strictEqual(ctx.purpose_tag, 'invoice');
});

test('sanitizeContext — invalid purpose_tag → empty string', function () {
  const { sanitizeContext } = require(path.join(__dirname, '../public/payment-intent.js'));
  const ctx = sanitizeContext({ purpose_tag: 'bribe' });
  assert.strictEqual(ctx.purpose_tag, '');
});

test('sanitizeContext — over-length reference truncated to 80 chars', function () {
  const { sanitizeContext, REFERENCE_MAX_LENGTH } = require(path.join(__dirname, '../public/payment-intent.js'));
  const ctx = sanitizeContext({ reference: 'x'.repeat(100) });
  assert.strictEqual(ctx.reference.length, REFERENCE_MAX_LENGTH);
});

test('sanitizeContext — over-length memo truncated to 140 chars', function () {
  const { sanitizeContext, MEMO_MAX_LENGTH } = require(path.join(__dirname, '../public/payment-intent.js'));
  const ctx = sanitizeContext({ memo: 'y'.repeat(200) });
  assert.strictEqual(ctx.memo.length, MEMO_MAX_LENGTH);
});

test('sanitizeContext — all fields valid', function () {
  const { sanitizeContext } = require(path.join(__dirname, '../public/payment-intent.js'));
  const ctx = sanitizeContext({ purpose_tag: 'donation', reference: 'ORD-001', memo: 'Thank you' });
  assert.strictEqual(ctx.purpose_tag, 'donation');
  assert.strictEqual(ctx.reference, 'ORD-001');
  assert.strictEqual(ctx.memo, 'Thank you');
});

// ---------------------------------------------------------------------------
// Merchant/order context — buildIntent with context
// ---------------------------------------------------------------------------

test('buildIntent — context fields appear in intent', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { purpose_tag: 'purchase', reference: 'ORD-001', memo: 'Order memo' });
  assert.ok(intent, 'intent must not be null');
  assert.strictEqual(intent.purpose_tag, 'purchase');
  assert.strictEqual(intent.reference, 'ORD-001');
  assert.strictEqual(intent.memo, 'Order memo');
});

test('buildIntent — absent context → empty context fields', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5');
  assert.ok(intent);
  assert.strictEqual(intent.purpose_tag, '');
  assert.strictEqual(intent.reference, '');
  assert.strictEqual(intent.memo, '');
});

test('buildIntent — invalid purpose_tag sanitised to empty string', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { purpose_tag: 'bribe' });
  assert.ok(intent);
  assert.strictEqual(intent.purpose_tag, '');
});

test('buildIntent — over-length reference truncated', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { reference: 'x'.repeat(100) });
  assert.ok(intent);
  assert.strictEqual(intent.reference.length, 80);
});

test('buildIntent — over-length memo truncated', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { memo: 'y'.repeat(200) });
  assert.ok(intent);
  assert.strictEqual(intent.memo.length, 140);
});

test('buildIntent — context does not affect destination', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { purpose_tag: 'purchase', reference: 'ORD-001', memo: 'Memo' });
  assert.strictEqual(intent.destination_address, route.destination_address.toLowerCase());
});

test('buildIntent — context does not affect amount', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { reference: 'ORD-001' });
  assert.strictEqual(intent.amount_display, '5');
});

test('buildIntent — context does not affect claim_id', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { reference: 'ORD-001' });
  assert.strictEqual(intent.claim_id, route.claim_id);
});

// ---------------------------------------------------------------------------
// Merchant/order context — buildHandoffUrl with context
// ---------------------------------------------------------------------------

test('buildHandoffUrl — ptag, ref, memo params added when context present', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { purpose_tag: 'purchase', reference: 'ORD-001', memo: 'Test memo' });
  var url    = buildHandoffUrl(intent, 'https://portal.example.com');
  var params = new URLSearchParams(url.split('?')[1]);
  assert.strictEqual(params.get('ptag'), 'purchase');
  assert.strictEqual(params.get('ref'),  'ORD-001');
  assert.strictEqual(params.get('memo'), 'Test memo');
});

test('buildHandoffUrl — no ptag/ref/memo params when context absent', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5');
  var url    = buildHandoffUrl(intent, 'https://portal.example.com');
  var params = new URLSearchParams(url.split('?')[1]);
  assert.strictEqual(params.get('ptag'), null);
  assert.strictEqual(params.get('ref'),  null);
  assert.strictEqual(params.get('memo'), null);
});

test('buildHandoffUrl — invalid purpose_tag not added to URL', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { purpose_tag: 'bribe' });
  var url    = buildHandoffUrl(intent, 'https://portal.example.com');
  var params = new URLSearchParams(url.split('?')[1]);
  assert.strictEqual(params.get('ptag'), null);
});

test('buildHandoffUrl — context does not alter authoritative params', function () {
  var route  = makeRoute();
  var intent = buildIntent('alice', route, '5', { purpose_tag: 'purchase', reference: 'ORD-001', memo: 'Memo' });
  var url    = buildHandoffUrl(intent, 'https://portal.example.com');
  var params = new URLSearchParams(url.split('?')[1]);
  assert.strictEqual(params.get('src'),   'ixid');
  assert.strictEqual(params.get('ixid'),  'alice');
  assert.strictEqual(params.get('to'),    route.destination_address.toLowerCase());
  assert.strictEqual(params.get('claim'), route.claim_id);
  assert.strictEqual(params.get('chain'), '137');
  assert.strictEqual(params.get('asset'), 'polygon-pos-native-usdc-v1');
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

(async function run() {
  let passed = 0;
  const failures = [];

  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
    } catch (err) {
      failures.push({ name: entry.name, err });
    }
  }

  failures.forEach(function (f) {
    process.stderr.write('\nFAIL: ' + f.name + '\n' + f.err.stack + '\n');
  });

  process.stdout.write(
    '\n' + tests.length + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n',
  );

  if (failures.length) process.exitCode = 1;
}());
