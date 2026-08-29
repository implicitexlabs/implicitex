/* ixid-handoff.test.js
 *
 * Focused tests for the IX ID → ImplicitEx Transfer Portal intake module.
 * Uses the CommonJS _createHandoffContext factory — no browser, no VM, no DOM.
 *
 * Coverage:
 *   validateParams — structural checks before any network call
 *   processHandoff — full validation + prefill flow (success + all failure paths)
 *   revalidateBeforeExecution — TOCTOU gate before IX_EXECUTION.executeTransfer
 *   cancel / no-execution guarantee — static source assertions
 */

'use strict';

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const test   = require('node:test');

const handoffPath = path.resolve(__dirname, '../../frontend/public/js/ixid-handoff.js');
const { _createHandoffContext } = require(handoffPath);
const source = fs.readFileSync(handoffPath, 'utf8');

/* ----------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------- */

const VALID_DEST  = '0xaabbccddEEFF0011223344556677889900aabbcc';
const VALID_CLAIM = 'claim-abc-123';
const VALID_IXID  = 'alice';
const VALID_CHAIN = '137';
const VALID_ASSET = 'polygon-pos-native-usdc-v1';

function validParams(overrides) {
  return Object.assign({
    src:    'ixid',
    ixid:   VALID_IXID,
    to:     VALID_DEST,
    claim:  VALID_CLAIM,
    amount: '5.00',
    chain:  VALID_CHAIN,
    asset:  VALID_ASSET,
  }, overrides);
}

function activeRoute(overrides) {
  return Object.assign({
    ix_id:               VALID_IXID,
    payable:             true,
    destination_address: VALID_DEST.toLowerCase(),
    claim_id:            VALID_CLAIM,
    chain_id:            137,
    asset: {
      symbol:                'USDC',
      contract:              '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      asset_binding_version: VALID_ASSET,
    },
  }, overrides);
}

function stubFetch(body, status) {
  const s = status || 200;
  return async () => ({ ok: s >= 200 && s < 300, status: s, json: async () => body });
}

function stubFetch404() {
  return async () => ({ ok: false, status: 404, json: async () => ({ error: 'not found' }) });
}

function stubFetchError(msg) {
  return async () => { throw new Error(msg || 'network error'); };
}

function makeEl() {
  return {
    value: '', readOnly: false, hidden: true, textContent: '', dataset: {},
    classList: { add() {} },
    removeAttribute(a) { if (a === 'hidden') this.hidden = false; },
    setAttribute(a, v) { this[a] = v; },
    dispatchEvent() {},
  };
}

function makeDeps(fetchImpl, overrideEls) {
  const els = Object.assign({
    txRecipient:          makeEl(),
    txAmount:             makeEl(),
    txReference:          makeEl(),
    txPurposeTag:         makeEl(),
    txMemo:               makeEl(),
    ixidIntake:           makeEl(),
    ixidIntakeStatus:     makeEl(),
    ixidIntakeLabel:      makeEl(),
    ixidRecipientHandle:  makeEl(),
    ixidRecipientMeta:    makeEl(),
    ixidRecipientContext: makeEl(),
  }, overrideEls || {});

  const portalCalls = [];
  return {
    fetch: fetchImpl,
    getElementById: (id) => els[id] || null,
    openPortal: () => portalCalls.push(1),
    _els: els,
    _portalCalls: portalCalls,
  };
}

/* ================================================================
 * validateParams
 * ================================================================ */

test('validateParams — valid params returns null', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), null);
});

test('validateParams — wrong chain ID → WRONG_CHAIN', () => {
  const ctx = _createHandoffContext(validParams({ chain: '1' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'WRONG_CHAIN');
});

test('validateParams — empty chain → WRONG_CHAIN', () => {
  const ctx = _createHandoffContext(validParams({ chain: '' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'WRONG_CHAIN');
});

test('validateParams — wrong asset binding → WRONG_ASSET', () => {
  const ctx = _createHandoffContext(validParams({ asset: 'mainnet-eth-v1' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'WRONG_ASSET');
});

test('validateParams — empty asset → WRONG_ASSET', () => {
  const ctx = _createHandoffContext(validParams({ asset: '' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'WRONG_ASSET');
});

test('validateParams — invalid destination (no 0x) → INVALID_DESTINATION', () => {
  const ctx = _createHandoffContext(validParams({ to: 'notanaddress' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_DESTINATION');
});

test('validateParams — invalid destination (too short) → INVALID_DESTINATION', () => {
  const ctx = _createHandoffContext(validParams({ to: '0xaabb' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_DESTINATION');
});

test('validateParams — invalid destination (non-hex chars) → INVALID_DESTINATION', () => {
  const ctx = _createHandoffContext(validParams({ to: '0x' + 'g'.repeat(40) }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_DESTINATION');
});

test('validateParams — malformed IX ID (too short, 2 chars) → INVALID_HANDLE', () => {
  const ctx = _createHandoffContext(validParams({ ixid: 'ab' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_HANDLE');
});

test('validateParams — malformed IX ID (uppercase) → INVALID_HANDLE', () => {
  const ctx = _createHandoffContext(validParams({ ixid: 'Alice' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_HANDLE');
});

test('validateParams — malformed IX ID (leading hyphen) → INVALID_HANDLE', () => {
  const ctx = _createHandoffContext(validParams({ ixid: '-alice' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_HANDLE');
});

test('validateParams — empty IX ID → INVALID_HANDLE', () => {
  const ctx = _createHandoffContext(validParams({ ixid: '' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_HANDLE');
});

test('validateParams — missing claim → MISSING_CLAIM', () => {
  const ctx = _createHandoffContext(validParams({ claim: '' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'MISSING_CLAIM');
});

test('validateParams — malformed amount (non-numeric) → INVALID_AMOUNT', () => {
  const ctx = _createHandoffContext(validParams({ amount: 'abc' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_AMOUNT');
});

test('validateParams — malformed amount (empty) → INVALID_AMOUNT', () => {
  const ctx = _createHandoffContext(validParams({ amount: '' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_AMOUNT');
});

test('validateParams — excess-precision amount (7 decimal places) → INVALID_AMOUNT', () => {
  const ctx = _createHandoffContext(validParams({ amount: '1.0000001' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'INVALID_AMOUNT');
});

test('validateParams — amount below minimum (0.5 USDC) → AMOUNT_BELOW_MINIMUM', () => {
  const ctx = _createHandoffContext(validParams({ amount: '0.5' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'AMOUNT_BELOW_MINIMUM');
});

test('validateParams — amount exactly 1 USDC is valid', () => {
  const ctx = _createHandoffContext(validParams({ amount: '1' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), null);
});

test('validateParams — amount above maximum (250.000001) → AMOUNT_ABOVE_MAXIMUM', () => {
  const ctx = _createHandoffContext(validParams({ amount: '250.000001' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'AMOUNT_ABOVE_MAXIMUM');
});

test('validateParams — amount exactly 250 USDC is valid', () => {
  const ctx = _createHandoffContext(validParams({ amount: '250' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), null);
});

test('validateParams — amount 251 → AMOUNT_ABOVE_MAXIMUM', () => {
  const ctx = _createHandoffContext(validParams({ amount: '251' }), makeDeps(null));
  assert.strictEqual(ctx.validateParams(), 'AMOUNT_ABOVE_MAXIMUM');
});

/* ================================================================
 * processHandoff — successful path
 * ================================================================ */

test('processHandoff — valid handoff returns ok:true', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(r.ok, `expected ok:true, got ${JSON.stringify(r)}`);
});

test('processHandoff — valid handoff stores verifiedRoute', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  const route = ctx.getVerifiedRoute();
  assert.ok(route, 'verifiedRoute must be set after successful handoff');
  assert.strictEqual(route.claim_id, VALID_CLAIM);
});

test('processHandoff — prefill uses API destination, never the URL to param', async () => {
  /* URL 'to' has mixed case; API returns lowercase; prefill MUST use the API value */
  const apiDest = VALID_DEST.toLowerCase();
  const deps    = makeDeps(stubFetch(activeRoute({ destination_address: apiDest })));
  const ctx     = _createHandoffContext(validParams({ to: VALID_DEST }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txRecipient.value, apiDest);
});

test('processHandoff — txRecipient is set read-only after validation', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.ok(deps._els.txRecipient.readOnly, 'txRecipient must be readOnly after handoff');
});

test('processHandoff — txAmount is prefilled with correct display string', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams({ amount: '5' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txAmount.value, '5');
});

test('processHandoff — txReference is populated with IX ID context string', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txReference.value, 'IX ID: @alice');
});

test('processHandoff — openPortal is called after all checks pass', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._portalCalls.length, 1, 'openPortal must be called exactly once on success');
});

/* ================================================================
 * processHandoff — failure paths
 * ================================================================ */

test('processHandoff — stale claim → STALE_CLAIM', async () => {
  const deps = makeDeps(stubFetch(activeRoute({ claim_id: 'different-claim' })));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'STALE_CLAIM');
});

test('processHandoff — tampered destination → DESTINATION_MISMATCH', async () => {
  /* API says 0x1111…; URL says VALID_DEST — must reject */
  const deps = makeDeps(stubFetch(activeRoute({ destination_address: '0x1111111111111111111111111111111111111111' })));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'DESTINATION_MISMATCH');
});

test('processHandoff — tampered asset binding → ASSET_MISMATCH', async () => {
  const deps = makeDeps(stubFetch(activeRoute({
    asset: { symbol: 'USDC', contract: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', asset_binding_version: 'mainnet-eth-v1' },
  })));
  const ctx = _createHandoffContext(validParams(), deps);
  const r   = await ctx.processHandoff();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'ASSET_MISMATCH');
});

test('processHandoff — no-route identity (payable:false) → NOT_PAYABLE', async () => {
  const deps = makeDeps(stubFetch({ ix_id: VALID_IXID, payable: false }));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'NOT_PAYABLE');
});

test('processHandoff — nonexistent identity (404) → NOT_FOUND', async () => {
  const deps = makeDeps(stubFetch404());
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'NOT_FOUND');
});

test('processHandoff — route API failure → API_UNAVAILABLE', async () => {
  const deps = makeDeps(stubFetchError('ECONNREFUSED'));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'API_UNAVAILABLE');
});

test('processHandoff — struct failure → openPortal NOT called', async () => {
  const deps = makeDeps(null);
  const ctx  = _createHandoffContext(validParams({ chain: '1' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._portalCalls.length, 0, 'openPortal must not be called on struct failure');
});

test('processHandoff — stale claim → openPortal NOT called', async () => {
  const deps = makeDeps(stubFetch(activeRoute({ claim_id: 'wrong' })));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._portalCalls.length, 0, 'openPortal must not be called when claim is stale');
});

test('processHandoff — recipient NOT prefilled when validation fails', async () => {
  const deps = makeDeps(stubFetch(activeRoute({ claim_id: 'wrong' })));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txRecipient.value, '', 'recipient must not be prefilled on failure');
  assert.ok(!deps._els.txRecipient.readOnly, 'recipient must not be locked on failure');
});

test('processHandoff — API failure → openPortal NOT called', async () => {
  const deps = makeDeps(stubFetchError('ECONNREFUSED'));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._portalCalls.length, 0);
});

/* ================================================================
 * revalidateBeforeExecution — TOCTOU gate
 * ================================================================ */

test('revalidateBeforeExecution — before processHandoff → HANDOFF_NOT_VERIFIED', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'HANDOFF_NOT_VERIFIED');
});

test('revalidateBeforeExecution — same route after valid handoff → ok:true', async () => {
  /* _fetch is captured at factory-creation time; use an indirection wrapper so
   * subsequent revalidation calls see a different response. */
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch(activeRoute());   // same route at revalidation
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(r.ok, `expected ok:true, got ${JSON.stringify(r)}`);
});

test('revalidateBeforeExecution — claim_id changed → ROUTE_REVISION_MISMATCH', async () => {
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch(activeRoute({ claim_id: 'new-claim-after-route-change' }));
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'ROUTE_REVISION_MISMATCH');
});

test('revalidateBeforeExecution — destination changed → DESTINATION_MISMATCH', async () => {
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch(activeRoute({ destination_address: '0x9999999999999999999999999999999999999999' }));
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'DESTINATION_MISMATCH');
});

test('revalidateBeforeExecution — does NOT adopt refreshed destination', async () => {
  /* Even with same claim_id, a changed destination must be rejected */
  let nextResponse = stubFetch(activeRoute());
  const deps  = makeDeps((...args) => nextResponse(...args));
  const ctx   = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch(activeRoute({ destination_address: '0x9999999999999999999999999999999999999999' }));
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok, 'must reject changed destination even with same claim_id');
  assert.strictEqual(r.code, 'DESTINATION_MISMATCH');
});

test('revalidateBeforeExecution — asset binding changed → ASSET_BINDING_MISMATCH', async () => {
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch(activeRoute({
    asset: { symbol: 'USDC', contract: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', asset_binding_version: 'mainnet-eth-v1' },
  }));
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'ASSET_BINDING_MISMATCH');
});

test('revalidateBeforeExecution — route becomes inactive → ROUTE_INACTIVE', async () => {
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch({ ix_id: VALID_IXID, payable: false });
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'ROUTE_INACTIVE');
});

test('revalidateBeforeExecution — route 404 at revalidation → ROUTE_INACTIVE', async () => {
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetch404();
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'ROUTE_INACTIVE');
});

test('revalidateBeforeExecution — API down at revalidation → ROUTE_API_UNAVAILABLE', async () => {
  let nextResponse = stubFetch(activeRoute());
  const deps = makeDeps((...args) => nextResponse(...args));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  nextResponse = stubFetchError('ECONNREFUSED at revalidation');
  const r = await ctx.revalidateBeforeExecution();
  assert.ok(!r.ok);
  assert.strictEqual(r.code, 'ROUTE_API_UNAVAILABLE');
});

/* ================================================================
 * Cancel / no-execution guarantee — static source assertions
 * ================================================================ */

test('source — no executable call to executeTransfer (no bypass of execution boundary)', () => {
  /* executeTransfer appears in documentation comments only. Check that no
   * non-comment source line references it. A "non-comment line" is any line
   * whose trimmed content does not start with * (block comment body) or // */
  const execLines = source.split('\n').filter(line => {
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return false;
    return t.includes('executeTransfer');
  });
  assert.strictEqual(execLines.length, 0,
    'ixid-handoff.js must not call executeTransfer in executable code:\n' + execLines.join('\n'));
});

test('source — does not reference IX_WALLET (no direct wallet state mutation)', () => {
  assert.ok(!source.includes('IX_WALLET'),
    'ixid-handoff.js must not reference IX_WALLET');
});

test('source — contains all required fail-closed validation boundaries', () => {
  const required = [
    'REQUIRED_CHAIN', 'REQUIRED_ASSET', 'parseAmountToAtomic', 'EVM_ADDRESS_RE',
    'route.claim_id', 'route.destination_address', 'route.payable',
    'ROUTE_API_UNAVAILABLE', 'revalidateBeforeExecution',
    'IX ID payment route changed',
    'prefillPortal(route, amountAtomic)',
  ];
  for (const text of required) {
    assert.ok(source.includes(text), `missing implementation guard: "${text}"`);
  }
});

test('source — revalidation compares claim_id and destination without adopting new values', () => {
  assert.match(source, /route\.claim_id\s*!==\s*verifiedRoute\.claim_id/,
    'must compare claim_id at revalidation');
  assert.match(source,
    /route\.destination_address\.toLowerCase\(\)\s*!==\s*verifiedRoute\.destination_address\.toLowerCase\(\)/,
    'must compare destination at revalidation');
});

/* ================================================================
 * Route API URL construction
 * ================================================================ */

test('_routeApiUrl — correct URL for simple handle', () => {
  const ctx = _createHandoffContext(validParams({ ixid: 'alice' }), makeDeps(null));
  assert.strictEqual(ctx._routeApiUrl(), 'https://alice.ixid.me/api/public/route/alice');
});

test('_routeApiUrl — handle with hyphen in subdomain and path', () => {
  const ctx = _createHandoffContext(validParams({ ixid: 'my-wallet' }), makeDeps(null));
  const url = ctx._routeApiUrl();
  assert.ok(url.startsWith('https://my-wallet.ixid.me'), `prefix wrong: ${url}`);
  assert.ok(url.endsWith('/api/public/route/my-wallet'), `suffix wrong: ${url}`);
});

/* ================================================================
 * Internal helpers — _parseAmountToAtomic, _atomicToDisplay
 * ================================================================ */

test('_parseAmountToAtomic — whole number → correct atomic', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._parseAmountToAtomic('5'), 5000000n);
});

test('_parseAmountToAtomic — decimal → correct atomic', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._parseAmountToAtomic('1.5'), 1500000n);
});

test('_parseAmountToAtomic — full 6-decimal precision', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._parseAmountToAtomic('1.000001'), 1000001n);
});

test('_parseAmountToAtomic — zero → null', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._parseAmountToAtomic('0'), null);
});

test('_parseAmountToAtomic — negative → null', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._parseAmountToAtomic('-1'), null);
});

test('_atomicToDisplay — whole number round-trip', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._atomicToDisplay(5000000n), '5');
});

test('_atomicToDisplay — decimal round-trip', () => {
  const ctx = _createHandoffContext(validParams(), makeDeps(null));
  assert.strictEqual(ctx._atomicToDisplay(1500000n), '1.5');
});

/* ================================================================
 * Merchant/order context — intake propagation
 * ================================================================ */

test('context — merchant reference survives handoff → txReference', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams({ ref: 'ORD-001' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txReference.value, 'ORD-001');
});

test('context — absent reference falls back to IX ID identity in txReference', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txReference.value, 'IX ID: @alice');
});

test('context — merchant reference takes precedence over IX ID identity', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams({ ref: 'ORD-MERCHANT' }), deps);
  await ctx.processHandoff();
  /* Must be the merchant ref, NOT 'IX ID: @alice' */
  assert.strictEqual(deps._els.txReference.value, 'ORD-MERCHANT');
  assert.notStrictEqual(deps._els.txReference.value, 'IX ID: @alice');
});

test('context — memo survives handoff → txMemo', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams({ memo: 'Thank you for your order' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txMemo.value, 'Thank you for your order');
});

test('context — valid purpose tag survives handoff → txPurposeTag', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams({ ptag: 'purchase' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txPurposeTag.value, 'purchase');
});

test('context — invalid purpose tag is not written to txPurposeTag', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams({ ptag: 'bribe' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txPurposeTag.value, '', 'invalid ptag must not be written to element');
});

test('context — absent context remains a valid handoff', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(validParams(), deps);
  const r    = await ctx.processHandoff();
  assert.ok(r.ok, 'handoff without context must succeed');
});

test('context — over-length reference is truncated to 80 chars', async () => {
  const longRef = 'x'.repeat(100);
  const deps    = makeDeps(stubFetch(activeRoute()));
  const ctx     = _createHandoffContext(validParams({ ref: longRef }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txReference.value.length, 80,
    'txReference must be truncated to 80 chars');
});

test('context — over-length memo is truncated to 140 chars', async () => {
  const longMemo = 'y'.repeat(200);
  const deps     = makeDeps(stubFetch(activeRoute()));
  const ctx      = _createHandoffContext(validParams({ memo: longMemo }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txMemo.value.length, 140,
    'txMemo must be truncated to 140 chars');
});

test('context — tampered metadata cannot alter destination', async () => {
  /* A manipulated ref/memo/ptag must not change where txRecipient points */
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(
    validParams({ ref: '0xmalicious', memo: 'override dest', ptag: 'invoice' }), deps);
  await ctx.processHandoff();
  /* Destination comes only from API route, never from metadata params */
  assert.strictEqual(deps._els.txRecipient.value, VALID_DEST.toLowerCase());
});

test('context — tampered metadata cannot alter amount', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(
    validParams({ amount: '5', ref: '999', memo: '250 USDC override' }), deps);
  await ctx.processHandoff();
  assert.strictEqual(deps._els.txAmount.value, '5');
});

test('context — tampered metadata cannot alter route revision (claim_id unchanged)', async () => {
  const deps = makeDeps(stubFetch(activeRoute()));
  const ctx  = _createHandoffContext(
    validParams({ ref: 'new-claim-id-attempt' }), deps);
  await ctx.processHandoff();
  const route = ctx.getVerifiedRoute();
  assert.strictEqual(route.claim_id, VALID_CLAIM, 'claim_id must not be affected by metadata');
});

test('context — metadata fields are written only to display elements (source assertion)', () => {
  /* The display/receipt metadata elements must be referenced in source. */
  for (const field of ['txPurposeTag', 'txReference', 'txMemo']) {
    assert.ok(source.includes(field), `source must reference display field: ${field}`);
  }
  /* ptag, memo, and the sanitised merchant ref must never appear on the same
   * source line as txRecipient.value assignment — the behavioural tests
   * (tampered metadata cannot alter destination) provide the runtime guarantee. */
  const dangerLines = source.split('\n').filter(l =>
    l.includes('txRecipient') && l.includes('.value') &&
    (l.includes('ptag') || l.includes('txMemo') || l.includes('txPurposeTag'))
  );
  assert.strictEqual(dangerLines.length, 0,
    'context variables must not be written into txRecipient.value:\n' + dangerLines.join('\n'));
});
