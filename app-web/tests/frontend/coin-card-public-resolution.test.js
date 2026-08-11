'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const cardRoot = path.join(repoRoot, 'app-web/frontend/public/card');

const runtimeFiles = [
  'coin-card-trusted-keys.js',
  'coin-card-trusted-key-resolution.js',
  'coin-card-lifecycle-bundle.js',
  'coin-card-canonical-json-v1.js',
  'coin-card-lifecycle-registry.js',
  'coin-card-lifecycle-record-verification.js',
  'coin-card-lifecycle-bundle-verification.js',
  'coin-card-lifecycle-record-selection.js',
  'coin-card-lifecycle-resolution.js',
  'coin-card-lifecycle-presentation.js',
];

const publicResolutionPath = path.join(cardRoot, 'coin-card-public-resolution.js');
const publicResolutionSource = fs.readFileSync(publicResolutionPath, 'utf8');
const OPAQUE_ACCOUNT_ID = 'acct_01JFXTST0000000000000000AA';
const OPAQUE_CARD_ID = 'cc_01JFXTST0000000000000000AB';
const OTHER_OPAQUE_CARD_ID = 'cc_01JFXTST0000000000000000CD';
const PERSONAL_RECIPIENT = '0x2489587C9da6EaB970a5479BA70273BA37961221';
const TREASURY_RECIPIENT = '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919';

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  return class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [isoString])); }
    static now() { return RealDate.parse(isoString); }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
}

function nodeAtob(value) { return Buffer.from(value, 'base64').toString('binary'); }
function nodeBtoa(value) { return Buffer.from(value, 'binary').toString('base64'); }

function makeHandleRegistry(records = {}) {
  const authoritative = new WeakSet();
  const notFound = new WeakSet();

  const stored = Object.create(null);
  for (const [handle, record] of Object.entries(records)) {
    const frozen = Object.freeze({
      username: handle,
      status: record.status,
      accountId: record.accountId == null
        ? (record.status === 'ACTIVE' ? OPAQUE_ACCOUNT_ID : null)
        : record.accountId,
      cardId: record.cardId == null ? null : record.cardId,
      authenticated: true,
      current: true,
      currentHeadAuthenticated: true,
      rollbackProtected: true,
      executionEligible: false,
    });
    authoritative.add(frozen);
    stored[handle] = frozen;
  }

  return Object.freeze({
    async lookupHandle(handle) {
      if (stored[handle]) return stored[handle];
      const result = Object.freeze({ outcome: 'HANDLE_NOT_FOUND', handle });
      notFound.add(result);
      return result;
    },
    isAuthoritativeHandleResult(value) { return authoritative.has(value); },
    isHandleNotFoundResult(value) { return notFound.has(value); },
    isAuthorityUnavailableResult() { return false; },
  });
}

function baseContext(handleRegistry) {
  const FixedDate = makeFixedDateClass('2026-08-01T18:42:19.556Z');
  const context = {
    Buffer,
    Date: FixedDate,
    Promise,
    String,
    TextEncoder,
    Uint8Array,
    URL,
    atob: nodeAtob,
    btoa: nodeBtoa,
    window: {},
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.window.Date = FixedDate;
  context.window.TextEncoder = TextEncoder;
  context.window.URL = URL;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = webcrypto;
  if (handleRegistry) context.window.IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY = handleRegistry;
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  return context;
}

function runFile(context, filename, sourceOverride) {
  const filePath = path.join(cardRoot, filename);
  const source = sourceOverride == null ? fs.readFileSync(filePath, 'utf8') : sourceOverride;
  vm.runInContext(source, context, { filename: filePath, timeout: 2000 });
}

function loadRealRuntime(options = {}) {
  const registry = options.handleRegistry || makeHandleRegistry({
    antoinedennison: { status: 'ACTIVE', cardId: OPAQUE_CARD_ID },
  });
  const context = baseContext(registry);
  for (const filename of runtimeFiles) {
    const override = filename === 'coin-card-lifecycle-bundle.js'
      ? options.lifecycleBundleSource
      : undefined;
    runFile(context, filename, override);
  }
  vm.runInContext(publicResolutionSource, context, {
    filename: publicResolutionPath,
    timeout: 2000,
  });
  return context;
}

function loadStubRuntime(options = {}) {
  const handleRegistry = options.handleRegistry || makeHandleRegistry({
    antoinedennison: { status: 'ACTIVE', cardId: OPAQUE_CARD_ID },
  });
  const context = baseContext(handleRegistry);

  const authenticatedProofs = new WeakSet();
  const proof = Object.freeze({ outcome: 'AUTHENTICATED' });
  authenticatedProofs.add(proof);

  const resolvedResults = new WeakSet();
  const resolved = Object.freeze({
    fact: options.lifecycleFact || 'RESOLVED',
    outcome: options.lifecycleOutcome || 'LIFECYCLE_ACTIVE',
  });
  resolvedResults.add(resolved);

  const promotedResults = new WeakSet();
  const shouldPromote = options.genuinePromotion !== false
    && resolved.outcome === 'LIFECYCLE_ACTIVE';
  const promoted = Object.freeze({
    outcome: shouldPromote ? 'PRESENTATION_PROMOTED' : 'PRESENTATION_BLOCKED_TERMINAL',
    presentationEligible: shouldPromote,
    executionEligible: false,
  });
  if (shouldPromote) promotedResults.add(promoted);

  context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE = Object.freeze({ marker: 'bundle' });
  context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION = Object.freeze({
    async authenticateLifecycleRegistryBundle() { return proof; },
    isAuthenticatedBundleResult(value) {
      return options.authenticatedBundle !== false && authenticatedProofs.has(value);
    },
  });
  context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION = Object.freeze({
    selectLifecycleEvidence() { return Object.freeze({ outcome: 'SELECTED' }); },
  });
  context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION = Object.freeze({
    resolveLifecycle() { return resolved; },
    isResolvedLifecycleResult(value) { return resolvedResults.has(value); },
  });
  context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION = Object.freeze({
    promotePresentation() { return promoted; },
    isPromotedPresentationResult(value) { return promotedResults.has(value); },
  });

  vm.runInContext(publicResolutionSource, context, {
    filename: publicResolutionPath,
    timeout: 2000,
  });
  return context;
}

function apiFrom(context) {
  return context.window.IX_COIN_CARD_PUBLIC_RESOLUTION;
}

test('API and outcome vocabulary are frozen; CARD_EXPIRED preserves handle/card separation', () => {
  const api = apiFrom(loadStubRuntime());
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.OUTCOMES), true);
  assert.equal(Object.isFrozen(api.HANDLE_STATUSES), true);
  assert.equal(api.OUTCOMES.PUBLIC_RESOLUTION_CARD_EXPIRED, 'PUBLIC_RESOLUTION_CARD_EXPIRED');
});

test('canonical subdomain is stable and mixed-case/legacy forms redirect', () => {
  const api = apiFrom(loadStubRuntime());

  const canonical = api.canonicalizePublicUrl('https://antoinedennison.coincard.click/');
  assert.equal(canonical.ok, true);
  assert.equal(canonical.username, 'antoinedennison');
  assert.equal(canonical.canonicalUrl, 'https://antoinedennison.coincard.click/');
  assert.equal(canonical.redirectUrl, null);

  for (const input of [
    'https://AntoineDennison.CoinCard.Click/',
    'http://antoinedennison.coincard.click/',
    'https://coincard.click/AntoineDennison',
    'https://www.coincard.click/antoinedennison/',
    'https://antoinedennison.coincard.click/index.html',
  ]) {
    const result = api.canonicalizePublicUrl(input);
    assert.equal(result.ok, true, input);
    assert.equal(result.username, 'antoinedennison', input);
    assert.equal(result.redirectUrl, 'https://antoinedennison.coincard.click/', input);
  }
});

test('malformed handles are controlled not-found; foreign and nested routes are unsupported', async () => {
  const api = apiFrom(loadStubRuntime());
  const malformed = await api.resolvePublicCard('https://coincard.click/_bad');
  assert.equal(malformed.outcome, 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND');
  assert.equal(malformed.executionEligible, false);

  for (const input of [
    'https://example.com/antoinedennison',
    'https://foo.bar.coincard.click/',
    'https://antoinedennison.coincard.click/pay',
    'https://antoinedennison.coincard.click:8443/',
  ]) {
    const result = await api.resolvePublicCard(input);
    assert.equal(result.outcome, 'PUBLIC_RESOLUTION_ROUTE_UNSUPPORTED', input);
    assert.equal(result.executionEligible, false, input);
  }
});

test('both direct URL forms exact-match one username and one opaque card identity', async () => {
  const context = loadStubRuntime();
  const api = apiFrom(context);
  const vectors = [
    ['https://antoinedennison.coincard.click/', null],
    ['https://coincard.click/antoinedennison', 'https://antoinedennison.coincard.click/'],
  ];

  for (const [url, redirectUrl] of vectors) {
    const result = await api.resolvePublicCard(url);
    assert.equal(result.outcome, 'PUBLIC_RESOLUTION_ACTIVE', url);
    assert.equal(result.canonicalUsername, 'antoinedennison', url);
    assert.equal(result.cardId, OPAQUE_CARD_ID, url);
    assert.equal(result.canonicalUrl, 'https://antoinedennison.coincard.click/', url);
    assert.equal(result.redirectUrl, redirectUrl, url);
    assert.equal(result.handleStatus, 'ACTIVE', url);
    assert.equal(result.lifecycleOutcome, 'LIFECYCLE_ACTIVE', url);
    assert.equal(result.presentationOutcome, 'PRESENTATION_PROMOTED', url);
    assert.equal(result.presentationEligible, true, url);
    assert.equal(result.executionEligible, false, url);
    assert.equal(api.isActivePublicResolution(result), true, url);
    assert.equal(Object.isFrozen(result), true, url);
  }
});

test('/antoine is an exact username lookup and never aliases or fuzzily redirects', async () => {
  const api = apiFrom(loadStubRuntime());
  const result = await api.resolvePublicCard('https://coincard.click/antoine');

  assert.equal(result.outcome, 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND');
  assert.equal(result.canonicalUsername, 'antoine');
  assert.equal(result.canonicalUrl, 'https://antoine.coincard.click/');
  assert.equal(result.redirectUrl, 'https://antoine.coincard.click/');
  assert.equal(result.cardId, null);
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
});

test('legacy readable card IDs are rejected and the signed legacy bundle remains migration debt', async () => {
  const legacyMapping = makeHandleRegistry({
    antoinedennison: { status: 'ACTIVE', cardId: 'antoine' },
  });
  const legacyResult = await apiFrom(loadStubRuntime({ handleRegistry: legacyMapping }))
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(legacyResult.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');
  assert.equal(legacyResult.cardId, null);

  const opaqueMappingAgainstLegacyBundle = await apiFrom(loadRealRuntime())
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(opaqueMappingAgainstLegacyBundle.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');

  for (const result of [legacyResult, opaqueMappingAgainstLegacyBundle]) {
    assert.equal(result.presentationEligible, false);
    assert.equal(result.executionEligible, false);
  }
});

test('browser query, fragment, storage, and postMessage-shaped values cannot override identity', async () => {
  const context = loadStubRuntime();
  context.window.localStorage = Object.freeze({
    recipient: TREASURY_RECIPIENT,
    cardId: 'cc_demo_implicitex',
  });
  context.window.__lastPostMessage = Object.freeze({
    data: Object.freeze({ recipient: TREASURY_RECIPIENT, cardId: 'cc_demo_implicitex' }),
  });

  const result = await apiFrom(context).resolvePublicCard(
    'https://antoinedennison.coincard.click/?recipient=' + TREASURY_RECIPIENT
      + '&cardId=cc_demo_implicitex#recipient=' + PERSONAL_RECIPIENT,
  );

  assert.equal(result.outcome, 'PUBLIC_RESOLUTION_ACTIVE');
  assert.equal(result.canonicalUsername, 'antoinedennison');
  assert.equal(result.cardId, OPAQUE_CARD_ID);
  assert.equal(result.canonicalUrl, 'https://antoinedennison.coincard.click/');
  assert.equal(result.redirectUrl, 'https://antoinedennison.coincard.click/');
  assert.equal(result.executionEligible, false);
});

test('unknown, available, reserved, expired, and tombstoned handles stop before lifecycle', async () => {
  const registry = makeHandleRegistry({
    availabletest: { status: 'AVAILABLE' },
    reservedtest: { status: 'RESERVED' },
    expiredtest: { status: 'EXPIRED', cardId: OPAQUE_CARD_ID },
    tombstonedtest: { status: 'TOMBSTONED', cardId: OPAQUE_CARD_ID },
  });
  const api = apiFrom(loadStubRuntime({ handleRegistry: registry }));

  const vectors = [
    ['unknowntest', 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND'],
    ['availabletest', 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND'],
    ['reservedtest', 'PUBLIC_RESOLUTION_HANDLE_UNAVAILABLE'],
    ['expiredtest', 'PUBLIC_RESOLUTION_HANDLE_EXPIRED'],
    ['tombstonedtest', 'PUBLIC_RESOLUTION_HANDLE_TOMBSTONED'],
  ];
  for (const [handle, outcome] of vectors) {
    const result = await api.resolvePublicCard(`https://${handle}.coincard.click/`);
    assert.equal(result.outcome, outcome, handle);
    assert.equal(result.presentationEligible, false, handle);
    assert.equal(result.executionEligible, false, handle);
    assert.equal(api.isActivePublicResolution(result), false, handle);
  }
});

test('card lifecycle conditions remain distinct public outcomes and never authorize execution', async () => {
  const vectors = [
    ['LIFECYCLE_CARD_SUSPENDED', 'RESOLVED', 'PUBLIC_RESOLUTION_CARD_SUSPENDED'],
    ['LIFECYCLE_CARD_REVOKED', 'TERMINAL', 'PUBLIC_RESOLUTION_CARD_REVOKED'],
    ['LIFECYCLE_MANIFEST_REVOKED', 'TERMINAL', 'PUBLIC_RESOLUTION_CARD_REVOKED'],
    ['LIFECYCLE_MANIFEST_SUPERSEDED', 'TERMINAL', 'PUBLIC_RESOLUTION_CARD_SUPERSEDED'],
    ['LIFECYCLE_EXPIRED', 'TERMINAL', 'PUBLIC_RESOLUTION_CARD_EXPIRED'],
  ];

  for (const [lifecycleOutcome, lifecycleFact, expected] of vectors) {
    const api = apiFrom(loadStubRuntime({ lifecycleOutcome, lifecycleFact }));
    const result = await api.resolvePublicCard('https://antoinedennison.coincard.click/');
    assert.equal(result.outcome, expected, lifecycleOutcome);
    assert.equal(result.presentationEligible, false, lifecycleOutcome);
    assert.equal(result.executionEligible, false, lifecycleOutcome);
  }
});

test('missing registry authority and registry outage fail closed', async () => {
  const noRegistry = loadStubRuntime();
  delete noRegistry.window.IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY;
  // Reload in a fresh realm because the public API captures authorities per call.
  const missingContext = baseContext(null);
  vm.runInContext(publicResolutionSource, missingContext, {
    filename: publicResolutionPath,
    timeout: 2000,
  });
  const missing = await apiFrom(missingContext)
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(missing.outcome, 'PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE');
  assert.equal(missing.executionEligible, false);

  const outageRegistry = Object.freeze({
    async lookupHandle() { throw new Error('registry unavailable'); },
    isAuthoritativeHandleResult() { return false; },
    isHandleNotFoundResult() { return false; },
    isAuthorityUnavailableResult() { return false; },
  });
  const outage = await apiFrom(loadStubRuntime({ handleRegistry: outageRegistry }))
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(outage.outcome, 'PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE');
  assert.equal(outage.executionEligible, false);
});

test('unbranded mapping, unauthenticated bundle, and stale opaque card mapping fail closed', async () => {
  const unbrandedRegistry = Object.freeze({
    async lookupHandle() {
      return Object.freeze({
        username: 'antoinedennison',
        status: 'ACTIVE',
        cardId: OPAQUE_CARD_ID,
      });
    },
    isAuthoritativeHandleResult() { return false; },
    isHandleNotFoundResult() { return false; },
    isAuthorityUnavailableResult() { return false; },
  });
  const unbranded = await apiFrom(loadStubRuntime({ handleRegistry: unbrandedRegistry }))
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(unbranded.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');

  const unauthenticated = await apiFrom(loadStubRuntime({ authenticatedBundle: false }))
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(unauthenticated.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');

  const staleRegistry = makeHandleRegistry({
    antoinedennison: { status: 'ACTIVE', cardId: OTHER_OPAQUE_CARD_ID },
  });
  const stale = await apiFrom(loadRealRuntime({ handleRegistry: staleRegistry }))
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(stale.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');

  for (const result of [unbranded, unauthenticated, stale]) {
    assert.equal(result.presentationEligible, false);
    assert.equal(result.executionEligible, false);
  }
});

test('an ACTIVE lifecycle cannot promote through an unbranded presentation result', async () => {
  const api = apiFrom(loadStubRuntime({ genuinePromotion: false }));
  const result = await api.resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(result.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
  assert.equal(api.isActivePublicResolution(result), false);
});
