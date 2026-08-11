'use strict';

const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const cardRoot = path.join(repoRoot, 'app-web/frontend/public/card');
const canonicalUsernamePath = path.join(cardRoot, 'coin-card-canonical-username.js');
const canonicalJsonPath = path.join(cardRoot, 'coin-card-canonical-json-v1.js');
const trustedKeyResolutionPath = path.join(cardRoot, 'coin-card-trusted-key-resolution.js');
const currentHeadSourcePath = path.join(
  cardRoot,
  'coin-card-public-username-registry-head-source.js',
);
const currentHeadVerificationPath = path.join(
  cardRoot,
  'coin-card-public-username-registry-head-verification.js',
);
const snapshotSourcePath = path.join(
  cardRoot,
  'coin-card-public-username-registry-snapshot-source.js',
);
const usernameRegistryPath = path.join(cardRoot, 'coin-card-public-username-registry.js');
const publicResolutionPath = path.join(cardRoot, 'coin-card-public-resolution.js');
const canonicalUsernameSource = fs.readFileSync(canonicalUsernamePath, 'utf8');
const canonicalJsonSource = fs.readFileSync(canonicalJsonPath, 'utf8');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const currentHeadSourceSource = fs.readFileSync(currentHeadSourcePath, 'utf8');
const currentHeadVerificationSource = fs.readFileSync(currentHeadVerificationPath, 'utf8');
const snapshotSourceSource = fs.readFileSync(snapshotSourcePath, 'utf8');
const usernameRegistrySource = fs.readFileSync(usernameRegistryPath, 'utf8');
const publicResolutionSource = fs.readFileSync(publicResolutionPath, 'utf8');
const canonicalJson = require(canonicalJsonPath);
const sharedUsernamePath = path.join(repoRoot, 'app-web/shared/coin-card-canonical-username.js');
const functionsUsernamePath = path.join(
  repoRoot,
  'app-web/backend/functions/src/shared/coin-card-canonical-username.js',
);

const FIXED_NOW = '2026-08-09T12:00:00.000Z';
const ACCOUNT_ID = 'acct_01JFXTST0000000000000000AA';
const OTHER_ACCOUNT_ID = 'acct_01JFXTST0000000000000000BB';
const CARD_ID = 'cc_01JFXTST0000000000000000AB';
const OTHER_CARD_ID = 'cc_01JFXTST0000000000000000CD';
const KEY_ID = 'username-registry-test-key';
const SCHEMA_V1 = 'coin-card-public-username-registry.v1';
const SCHEMA_V2 = 'coin-card-public-username-registry.v2';

function usernameDomains(schemaVersion) {
  if (schemaVersion === SCHEMA_V1) {
    return {
      signature: 'ImplicitEx.CoinCard.PublicUsernameRegistry.v1',
      artifact: 'ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v1',
    };
  }
  if (schemaVersion === SCHEMA_V2) {
    return {
      signature: 'ImplicitEx.CoinCard.PublicUsernameRegistry.v2',
      artifact: 'ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v2',
    };
  }
  throw new TypeError(`unsupported username registry schema: ${schemaVersion}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  return class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [isoString])); }
    static now() { return RealDate.parse(isoString); }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
}

function defaultEntry(overrides = {}) {
  return {
    username: 'antoinedennison',
    accountId: ACCOUNT_ID,
    cardId: CARD_ID,
    status: 'ACTIVE',
    ...overrides,
  };
}

function unsignedSnapshot(overrides = {}) {
  const snapshot = {
    registrySchemaVersion: SCHEMA_V2,
    registryId: 'implicitex-public-usernames',
    environment: 'production',
    registryRevision: 1,
    issuedAt: '2026-08-09T11:55:00.000Z',
    expiresAt: '2026-08-10T11:55:00.000Z',
    authorityId: 'implicitex-registry',
    entries: [defaultEntry()],
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: KEY_ID,
      keyUsage: 'coin-card-registry-publication',
      authorityId: 'implicitex-registry',
      signedAt: '2026-08-09T11:55:00.000Z',
      value: '',
    },
    ...overrides,
  };
  snapshot.signature = {
    mode: 'signed-p256-v1',
    algorithm: 'ECDSA_P256_SHA256',
    signatureEncoding: 'ieee-p1363',
    signatureLengthBytes: 64,
    signatureValueEncoding: 'base64url-unpadded',
    keyId: KEY_ID,
    keyUsage: 'coin-card-registry-publication',
    authorityId: snapshot.authorityId,
    signedAt: snapshot.issuedAt,
    value: '',
    ...(overrides.signature || {}),
  };
  return snapshot;
}

function signaturePayload(snapshot) {
  const payload = clone(snapshot);
  delete payload.signature.value;
  return payload;
}

async function signSnapshot(keyPair, overrides = {}) {
  const snapshot = unsignedSnapshot(overrides);
  const canonical = canonicalJson.canonicalizeJson(signaturePayload(snapshot));
  assert.equal(typeof canonical, 'string');
  const domains = usernameDomains(snapshot.registrySchemaVersion);
  const bytes = Buffer.concat([
    Buffer.from(domains.signature, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    bytes,
  );
  assert.equal(signature.byteLength, 64);
  snapshot.signature.value = toBase64Url(signature);
  return snapshot;
}

function snapshotArtifactHash(snapshot) {
  const canonical = canonicalJson.canonicalizeJson(snapshot);
  assert.equal(typeof canonical, 'string');
  const domains = usernameDomains(snapshot.registrySchemaVersion);
  return 'sha256:' + createHash('sha256')
    .update(domains.artifact, 'utf8')
    .update(Buffer.from([0]))
    .update(canonical, 'utf8')
    .digest('hex');
}

function unsignedHead(snapshot, overrides = {}) {
  const head = {
    headSchemaVersion: 'coin-card-public-username-registry-head.v1',
    registryId: 'implicitex-public-usernames',
    environment: 'production',
    currentRevision: snapshot.registryRevision,
    currentSnapshotHash: snapshotArtifactHash(snapshot),
    issuedAt: '2026-08-09T11:58:00.000Z',
    expiresAt: '2026-08-09T12:10:00.000Z',
    authorityId: 'implicitex-registry',
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: KEY_ID,
      keyUsage: 'coin-card-registry-publication',
      authorityId: 'implicitex-registry',
      signedAt: '2026-08-09T11:58:00.000Z',
      value: '',
    },
    ...overrides,
  };
  head.signature = {
    mode: 'signed-p256-v1',
    algorithm: 'ECDSA_P256_SHA256',
    signatureEncoding: 'ieee-p1363',
    signatureLengthBytes: 64,
    signatureValueEncoding: 'base64url-unpadded',
    keyId: KEY_ID,
    keyUsage: 'coin-card-registry-publication',
    authorityId: head.authorityId,
    signedAt: head.issuedAt,
    value: '',
    ...(overrides.signature || {}),
  };
  return head;
}

async function signHead(keyPair, snapshot, overrides = {}) {
  const head = unsignedHead(snapshot, overrides);
  const canonical = canonicalJson.canonicalizeJson(signaturePayload(head));
  assert.equal(typeof canonical, 'string');
  const bytes = Buffer.concat([
    Buffer.from('ImplicitEx.CoinCard.PublicUsernameRegistryHead.v1', 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    bytes,
  );
  assert.equal(signature.byteLength, 64);
  head.signature.value = toBase64Url(signature);
  return head;
}

function trustedKeyRecord(publicKey, overrides = {}) {
  return {
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId: KEY_ID,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey,
    issuerId: 'implicitex-registry',
    usage: ['coin-card-registry-publication'],
    status: 'ACTIVE',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    revokedAt: null,
    revocationReason: null,
    revocationPolicy: null,
    successorKeyId: null,
    environment: 'production',
    ...overrides,
  };
}

function baseContext() {
  const FixedDate = makeFixedDateClass(FIXED_NOW);
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
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  return context;
}

function installJsonValue(context, globalName, value, frozen = true) {
  context.__installJson = JSON.stringify(value);
  vm.runInContext(`(() => {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
      return Object.freeze(value);
    }
    const value = JSON.parse(__installJson);
    window[${JSON.stringify(globalName)}] = ${frozen ? 'deepFreeze(value)' : 'value'};
  })()`, context);
  delete context.__installJson;
}

function installHeadSource(context, head, frozen = true) {
  context.__headSourceJson = JSON.stringify(head);
  vm.runInContext(`(() => {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
      return Object.freeze(value);
    }
    const head = JSON.parse(__headSourceJson);
    const stored = ${frozen ? 'deepFreeze(head)' : 'head'};
    window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE = Object.freeze({
      async loadCurrentHead() { return stored; },
    });
  })()`, context);
  delete context.__headSourceJson;
}

function installSnapshotSource(context, snapshot, frozen = true) {
  context.__snapshotSourceJson = JSON.stringify(snapshot);
  vm.runInContext(`(() => {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
      return Object.freeze(value);
    }
    const snapshot = JSON.parse(__snapshotSourceJson);
    const stored = ${frozen ? 'deepFreeze(snapshot)' : 'snapshot'};
    window.__snapshotSourceFixture = stored;
    window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE = Object.freeze({
      async loadSnapshotByHash(snapshotHash) {
        window.__requestedSnapshotHash = snapshotHash;
        return stored;
      },
    });
  })()`, context);
  delete context.__snapshotSourceJson;
}

function installTransportFailureSource(context, globalName, methodName, failure) {
  context.__transportFailure = JSON.stringify(failure);
  vm.runInContext(`(() => {
    const failure = JSON.parse(__transportFailure);
    const failures = new WeakMap();
    window[${JSON.stringify(globalName)}] = Object.freeze({
      async [${JSON.stringify(methodName)}]() {
        const error = new Error(failure.code);
        failures.set(error, Object.freeze({
          code: failure.code,
          failureClass: failure.failureClass,
        }));
        throw error;
      },
      classifyTransportFailure(error) { return failures.get(error) || null; },
    });
  })()`, context);
  delete context.__transportFailure;
}

function runSource(context, source, filename) {
  vm.runInContext(source, context, { filename, timeout: 3000 });
}

function loadRuntime(options) {
  const context = baseContext();
  if (!options.omitCrypto) context.window.crypto = options.crypto || webcrypto;
  if (!options.omitSource && !options.omitSnapshotSource) {
    if (options.snapshotTransportFailure) {
      installTransportFailureSource(
        context,
        'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE',
        'loadSnapshotByHash',
        options.snapshotTransportFailure,
      );
    } else {
      installSnapshotSource(context, options.snapshot, options.freezeSource !== false);
    }
  }
  if (!options.omitSource && !options.omitHeadSource) {
    if (options.headTransportFailure) {
      installTransportFailureSource(
        context,
        'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE',
        'loadCurrentHead',
        options.headTransportFailure,
      );
    } else {
      installHeadSource(context, options.head, options.freezeSource !== false);
    }
  }
  if (!options.omitTrustedKeyAuthority) {
    installJsonValue(context, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', options.trustedPublicKeys);
    runSource(context, trustedKeyResolutionSource, trustedKeyResolutionPath);
  }
  if (!options.omitUsernamePolicy) {
    runSource(context, canonicalUsernameSource, canonicalUsernamePath);
  }
  if (!options.omitCanonicalizer) runSource(context, canonicalJsonSource, canonicalJsonPath);
  if (!options.omitHeadAuthority) {
    runSource(context, currentHeadVerificationSource, currentHeadVerificationPath);
  }
  runSource(context, usernameRegistrySource, usernameRegistryPath);
  return {
    api: context.window.IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY,
    context,
  };
}

async function makeFixture(options = {}) {
  const keyPair = options.keyPair || await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const snapshot = options.snapshot || await signSnapshot(keyPair, options.snapshotOverrides);
  const head = options.head || await signHead(keyPair, snapshot, options.headOverrides);
  const keyRecord = trustedKeyRecord(publicKey, options.keyOverrides);
  return {
    keyPair,
    publicKey,
    snapshot,
    head,
    trustedPublicKeys: deepFreeze({ [KEY_ID]: deepFreeze(keyRecord) }),
  };
}

function setSource(context, snapshot, frozen = true) {
  installSnapshotSource(context, snapshot, frozen);
}

function setHeadSource(context, head, frozen = true) {
  installHeadSource(context, head, frozen);
}

async function fixtureForSnapshot(fixture, snapshot, headOverrides = {}) {
  return {
    ...fixture,
    snapshot,
    head: await signHead(fixture.keyPair, snapshot, headOverrides),
  };
}

function installLifecyclePresentationStubs(context) {
  const authenticatedProofs = new WeakSet();
  const proof = Object.freeze({ outcome: 'AUTHENTICATED' });
  authenticatedProofs.add(proof);
  const resolvedResults = new WeakSet();
  const resolved = Object.freeze({ fact: 'RESOLVED', outcome: 'LIFECYCLE_ACTIVE' });
  resolvedResults.add(resolved);
  const promotedResults = new WeakSet();
  const promoted = Object.freeze({
    outcome: 'PRESENTATION_PROMOTED',
    presentationEligible: true,
    executionEligible: false,
  });
  promotedResults.add(promoted);

  context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE = Object.freeze({ marker: 'fixture' });
  context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION = Object.freeze({
    async authenticateLifecycleRegistryBundle() { return proof; },
    isAuthenticatedBundleResult(value) { return authenticatedProofs.has(value); },
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
}

test('signed snapshot authenticates one exact username to opaque account and card IDs', async () => {
  const fixture = await makeFixture();
  const { api, context } = loadRuntime(fixture);
  const result = await api.lookupHandle('antoinedennison');

  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.OUTCOMES), true);
  assert.equal(result.outcome, 'USERNAME_REGISTRY_RECORD_AUTHENTICATED');
  assert.equal(result.username, 'antoinedennison');
  assert.equal(result.accountId, ACCOUNT_ID);
  assert.equal(result.cardId, CARD_ID);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.registrySchemaVersion, SCHEMA_V2);
  assert.equal(api.REGISTRY_SCHEMA_VERSION, SCHEMA_V2);
  assert.equal(result.registryRevision, 1);
  assert.match(result.snapshotHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.authenticated, true);
  assert.equal(result.current, true);
  assert.equal(result.rollbackProtected, true);
  assert.equal(result.currentHeadAuthenticated, true);
  assert.match(result.currentHeadHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(context.window.__requestedSnapshotHash, fixture.head.currentSnapshotHash);
  assert.equal(result.executionEligible, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(api.isAuthoritativeHandleResult(result), true);
  assert.equal(api.isAuthoritativeHandleResult({ ...result }), false);
});

test('all packaged username validators remain generated from the canonical source', () => {
  const generatedHeader = '/* GENERATED from app-web/shared/coin-card-canonical-username.js. Do not edit this copy. */\n';
  const expected = generatedHeader + fs.readFileSync(sharedUsernamePath, 'utf8');
  for (const runtimePath of [canonicalUsernamePath, functionsUsernamePath]) {
    assert.equal(fs.readFileSync(runtimePath, 'utf8'), expected, runtimePath);
  }
});

test('v2 snapshot verification enforces the current 4–32 username grammar', async () => {
  const fixture = await makeFixture();
  for (const username of ['abcd', 'a'.repeat(30), 'a'.repeat(31), 'a'.repeat(32), 'a--b']) {
    const snapshot = await signSnapshot(fixture.keyPair, {
      entries: [defaultEntry({ username })],
    });
    const matching = await fixtureForSnapshot(fixture, snapshot);
    const result = await loadRuntime(matching).api.lookupHandle(username);
    assert.equal(result.outcome, 'USERNAME_REGISTRY_RECORD_AUTHENTICATED', username);
    assert.equal(result.registrySchemaVersion, SCHEMA_V2, username);
  }

  for (const username of [
    'abc',
    'a'.repeat(33),
    'Alice',
    'alice_name',
    '-alice',
    'alice-',
    'alïce',
    'alice name',
  ]) {
    const snapshot = await signSnapshot(fixture.keyPair, {
      entries: [defaultEntry({ username })],
    });
    const matching = await fixtureForSnapshot(fixture, snapshot);
    const result = await loadRuntime(matching).api.lookupHandle(username);
    assert.equal(result.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED', username);
    assert.equal(result.reason, 'snapshot-entry-invalid', username);
  }
});

test('historical v1 username signatures remain interpretable but do not define current route eligibility', async () => {
  const fixture = await makeFixture();
  const snapshot = await signSnapshot(fixture.keyPair, {
    registrySchemaVersion: SCHEMA_V1,
    entries: [defaultEntry({ username: 'abc' })],
  });
  const matching = await fixtureForSnapshot(fixture, snapshot);
  const runtime = loadRuntime(matching);
  const historical = await runtime.api.lookupHandle('abc');
  assert.equal(historical.outcome, 'USERNAME_REGISTRY_RECORD_AUTHENTICATED');
  assert.equal(historical.registrySchemaVersion, SCHEMA_V1);

  installLifecyclePresentationStubs(runtime.context);
  runSource(runtime.context, publicResolutionSource, publicResolutionPath);
  const publicResult = await runtime.context.window.IX_COIN_CARD_PUBLIC_RESOLUTION
    .resolvePublicCard('https://coincard.click/abc');
  assert.equal(publicResult.outcome, 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND');
  assert.equal(publicResult.executionEligible, false);
});

test('antoine and mixed-case inputs are exact not-found results, never aliases', async () => {
  const fixture = await makeFixture();
  const { api } = loadRuntime(fixture);

  for (const username of ['antoine', 'AntoineDennison', 'antoinedenniso']) {
    const result = await api.lookupHandle(username);
    assert.equal(result.outcome, 'USERNAME_REGISTRY_USERNAME_NOT_FOUND', username);
    assert.equal(result.username, username, username);
    assert.equal(result.cardId, null, username);
    assert.equal(result.executionEligible, false, username);
    assert.equal(api.isHandleNotFoundResult(result), true, username);
    assert.equal(api.isAuthoritativeHandleResult(result), false, username);
  }
});

test('Public Resolution consumes genuine username authority for both URL forms', async () => {
  const fixture = await makeFixture();
  const runtime = loadRuntime(fixture);
  installLifecyclePresentationStubs(runtime.context);
  runSource(runtime.context, publicResolutionSource, publicResolutionPath);
  const resolver = runtime.context.window.IX_COIN_CARD_PUBLIC_RESOLUTION;

  for (const url of [
    'https://antoinedennison.coincard.click/',
    'https://coincard.click/antoinedennison',
  ]) {
    const result = await resolver.resolvePublicCard(url);
    assert.equal(result.outcome, 'PUBLIC_RESOLUTION_ACTIVE', url);
    assert.equal(result.canonicalUsername, 'antoinedennison', url);
    assert.equal(result.cardId, CARD_ID, url);
    assert.equal(result.presentationEligible, true, url);
    assert.equal(result.executionEligible, false, url);
  }

  const notFound = await resolver.resolvePublicCard('https://coincard.click/antoine');
  assert.equal(notFound.outcome, 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND');
  assert.equal(notFound.cardId, null);
  assert.equal(notFound.executionEligible, false);
});

test('Public Resolution maps registry verification and availability failures closed', async () => {
  const fixture = await makeFixture();
  const tampered = clone(fixture.snapshot);
  tampered.entries[0].cardId = OTHER_CARD_ID;
  const invalidRuntime = loadRuntime({ ...fixture, snapshot: tampered });
  installLifecyclePresentationStubs(invalidRuntime.context);
  runSource(invalidRuntime.context, publicResolutionSource, publicResolutionPath);
  const invalid = await invalidRuntime.context.window.IX_COIN_CARD_PUBLIC_RESOLUTION
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(invalid.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');
  assert.equal(invalid.presentationEligible, false);
  assert.equal(invalid.executionEligible, false);

  const tamperedHead = clone(fixture.head);
  tamperedHead.currentSnapshotHash = `sha256:${'0'.repeat(64)}`;
  const invalidHeadRuntime = loadRuntime({ ...fixture, head: tamperedHead });
  installLifecyclePresentationStubs(invalidHeadRuntime.context);
  runSource(invalidHeadRuntime.context, publicResolutionSource, publicResolutionPath);
  const invalidHead = await invalidHeadRuntime.context.window.IX_COIN_CARD_PUBLIC_RESOLUTION
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(invalidHead.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');
  assert.equal(invalidHead.presentationEligible, false);
  assert.equal(invalidHead.executionEligible, false);

  const unavailableRuntime = loadRuntime({ ...fixture, omitSource: true });
  installLifecyclePresentationStubs(unavailableRuntime.context);
  runSource(unavailableRuntime.context, publicResolutionSource, publicResolutionPath);
  const unavailable = await unavailableRuntime.context.window.IX_COIN_CARD_PUBLIC_RESOLUTION
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(unavailable.outcome, 'PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE');
  assert.equal(unavailable.presentationEligible, false);
  assert.equal(unavailable.executionEligible, false);
});

test('Current Head authenticates only revision and snapshot-hash currentness facts', async () => {
  const fixture = await makeFixture();
  const runtime = loadRuntime(fixture);
  const headApi = runtime.context.window
    .IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_VERIFICATION;
  const result = await headApi.authenticateCurrentHead();

  assert.equal(result.outcome, 'USERNAME_REGISTRY_CURRENT_HEAD_AUTHENTICATED');
  assert.equal(result.currentRevision, 1);
  assert.equal(result.currentSnapshotHash, snapshotArtifactHash(fixture.snapshot));
  assert.equal(result.authenticated, true);
  assert.equal(result.current, true);
  assert.equal(result.rollbackProtected, true);
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
  assert.equal(Object.hasOwn(result, 'username'), false);
  assert.equal(Object.hasOwn(result, 'accountId'), false);
  assert.equal(Object.hasOwn(result, 'cardId'), false);
  assert.equal(headApi.isAuthenticatedCurrentHeadResult(result), true);
  assert.equal(headApi.isAuthenticatedCurrentHeadResult({ ...result }), false);
});

test('Current Head source uses one fixed HTTPS no-store endpoint', async () => {
  const context = baseContext();
  const calls = [];
  context.window.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      redirected: false,
      type: 'cors',
      url,
      headers: {
        get(name) {
          if (name.toLowerCase() === 'content-type') return 'application/json; charset=utf-8';
          if (name.toLowerCase() === 'cache-control') return 'no-store, max-age=0';
          return null;
        },
      },
      async json() { return { untrusted: 'head-data' }; },
    };
  };
  runSource(context, currentHeadSourceSource, currentHeadSourcePath);
  const source = context.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE;
  const result = await source.loadCurrentHead();

  assert.deepEqual(result, { untrusted: 'head-data' });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://coincard.click/.well-known/coin-card-public-username-registry-head.v1.json',
  );
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(source.CURRENT_HEAD_URL.includes('antoinedennison'), false);
});

test('tampered, expired, and unavailable Current Head states fail closed', async () => {
  const fixture = await makeFixture();

  const tamperedHead = clone(fixture.head);
  tamperedHead.currentRevision = 2;
  const tamperedRuntime = loadRuntime({ ...fixture, head: tamperedHead });
  const tamperedApi = tamperedRuntime.context.window
    .IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_VERIFICATION;
  const tampered = await tamperedApi.authenticateCurrentHead();
  assert.equal(tampered.outcome, 'USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED');
  assert.equal(tampered.reason, 'current-head-signature-invalid');

  const expiredHead = await signHead(fixture.keyPair, fixture.snapshot, {
    issuedAt: '2026-08-09T11:40:00.000Z',
    expiresAt: '2026-08-09T11:50:00.000Z',
  });
  const expiredRuntime = loadRuntime({ ...fixture, head: expiredHead });
  const expiredApi = expiredRuntime.context.window
    .IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_VERIFICATION;
  const expired = await expiredApi.authenticateCurrentHead();
  assert.equal(expired.outcome, 'USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED');
  assert.equal(expired.reason, 'current-head-expired');

  const unavailableRuntime = loadRuntime({ ...fixture, omitHeadSource: true });
  const unavailableApi = unavailableRuntime.context.window
    .IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_VERIFICATION;
  const unavailable = await unavailableApi.authenticateCurrentHead();
  assert.equal(unavailable.outcome, 'USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE');
  assert.equal(unavailableApi.isAuthorityUnavailableResult(unavailable), true);
});

test('authentic historical snapshots fail against a newer Current Head in a fresh realm', async () => {
  const fixture = await makeFixture({ snapshotOverrides: { registryRevision: 41 } });
  const currentSnapshot = await signSnapshot(fixture.keyPair, {
    registryRevision: 42,
    entries: [defaultEntry({ cardId: OTHER_CARD_ID })],
  });
  const currentHead = await signHead(fixture.keyPair, currentSnapshot);

  const staleRuntime = loadRuntime({
    ...fixture,
    snapshot: fixture.snapshot,
    head: currentHead,
  });
  const stale = await staleRuntime.api.lookupHandle('antoinedennison');
  assert.equal(stale.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
  assert.equal(stale.reason, 'current-head-revision-mismatch');
  assert.equal(stale.executionEligible, false);

  installLifecyclePresentationStubs(staleRuntime.context);
  runSource(staleRuntime.context, publicResolutionSource, publicResolutionPath);
  const stalePublic = await staleRuntime.context.window.IX_COIN_CARD_PUBLIC_RESOLUTION
    .resolvePublicCard('https://antoinedennison.coincard.click/');
  assert.equal(stalePublic.outcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');
  assert.equal(stalePublic.presentationEligible, false);
  assert.equal(stalePublic.executionEligible, false);

  const sameRevisionReplacement = await signSnapshot(fixture.keyPair, {
    registryRevision: 41,
    entries: [defaultEntry({ cardId: OTHER_CARD_ID })],
  });
  const replacementHead = await signHead(fixture.keyPair, sameRevisionReplacement);
  const hashMismatchRuntime = loadRuntime({
    ...fixture,
    snapshot: fixture.snapshot,
    head: replacementHead,
  });
  const hashMismatch = await hashMismatchRuntime.api.lookupHandle('antoinedennison');
  assert.equal(hashMismatch.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
  assert.equal(hashMismatch.reason, 'current-head-snapshot-hash-mismatch');
  assert.equal(hashMismatch.executionEligible, false);
});

test('signature tampering fails closed and cannot manufacture a branded result', async () => {
  const fixture = await makeFixture();
  const tampered = clone(fixture.snapshot);
  tampered.entries[0].cardId = OTHER_CARD_ID;
  const { api } = loadRuntime({ ...fixture, snapshot: tampered });
  const result = await api.lookupHandle('antoinedennison');

  assert.equal(result.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
  assert.equal(result.reason, 'username-registry-signature-invalid');
  assert.equal(result.executionEligible, false);
  assert.equal(api.isAuthoritativeHandleResult(result), false);
  assert.equal(api.isHandleNotFoundResult(result), false);
});

test('readable card IDs and alias-shaped extra fields are rejected even when signed', async () => {
  const fixture = await makeFixture();
  const vectors = [
    [defaultEntry({ cardId: 'antoine' })],
    [{ ...defaultEntry(), alias: 'antoine' }],
  ];

  for (const entries of vectors) {
    const snapshot = await signSnapshot(fixture.keyPair, { entries });
    const { api } = loadRuntime({ ...fixture, snapshot });
    const result = await api.lookupHandle('antoinedennison');
    assert.equal(result.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
    assert.match(result.reason, /^snapshot-entry-/);
    assert.equal(api.isAuthoritativeHandleResult(result), false);
  }
});

test('a valid signature cannot substitute another registry namespace, environment, or authority', async () => {
  const fixture = await makeFixture();
  const vectors = [
    { registryId: 'other-public-usernames' },
    { environment: 'staging' },
    { authorityId: 'other-registry' },
  ];

  for (const overrides of vectors) {
    const snapshot = await signSnapshot(fixture.keyPair, overrides);
    const { api } = loadRuntime({ ...fixture, snapshot });
    const result = await api.lookupHandle('antoinedennison');
    assert.equal(result.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
    assert.match(result.reason, /^snapshot-(registry-id|environment|authority)-invalid$/);
  }
});

test('one account and one card cannot be bound to multiple usernames', async () => {
  const fixture = await makeFixture();
  const vectors = [
    [
      defaultEntry({ username: 'antoine', cardId: OTHER_CARD_ID }),
      defaultEntry(),
    ],
    [
      defaultEntry({ username: 'antoine', accountId: OTHER_ACCOUNT_ID }),
      defaultEntry(),
    ],
  ];

  for (const entries of vectors) {
    const snapshot = await signSnapshot(fixture.keyPair, { entries });
    const { api } = loadRuntime({ ...fixture, snapshot });
    const result = await api.lookupHandle('antoinedennison');
    assert.equal(result.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
    assert.match(result.reason, /^snapshot-(account|card)-username-conflict$/);
  }
});

test('reserved/system usernames carry no account or card identity', async () => {
  const fixture = await makeFixture();
  const entries = [
    defaultEntry(),
    defaultEntry({
      username: 'systemtest',
      accountId: null,
      cardId: null,
      status: 'SYSTEM',
    }),
  ];
  const snapshot = await signSnapshot(fixture.keyPair, { entries });
  const matchingFixture = await fixtureForSnapshot(fixture, snapshot);
  const { api } = loadRuntime(matchingFixture);
  const system = await api.lookupHandle('systemtest');
  assert.equal(system.outcome, 'USERNAME_REGISTRY_RECORD_AUTHENTICATED');
  assert.equal(system.status, 'SYSTEM');
  assert.equal(system.accountId, null);
  assert.equal(system.cardId, null);

  const invalidSnapshot = await signSnapshot(fixture.keyPair, {
    entries: [defaultEntry({ status: 'RESERVED' })],
  });
  const invalid = loadRuntime({ ...fixture, snapshot: invalidSnapshot });
  assert.equal(
    (await invalid.api.lookupHandle('antoinedennison')).outcome,
    'USERNAME_REGISTRY_VERIFICATION_FAILED',
  );
});

test('expired, future-issued, and overlong snapshots fail currentness checks', async () => {
  const fixture = await makeFixture();
  const vectors = [
    {
      issuedAt: '2026-08-08T11:00:00.000Z',
      expiresAt: '2026-08-09T11:00:00.000Z',
    },
    {
      issuedAt: '2026-08-09T12:06:00.000Z',
      expiresAt: '2026-08-10T12:06:00.000Z',
    },
    {
      issuedAt: '2026-08-09T11:55:00.000Z',
      expiresAt: '2026-08-10T11:55:00.001Z',
    },
  ];

  for (const overrides of vectors) {
    const snapshot = await signSnapshot(fixture.keyPair, overrides);
    const { api } = loadRuntime({ ...fixture, snapshot });
    const result = await api.lookupHandle('antoinedennison');
    assert.equal(result.outcome, 'USERNAME_REGISTRY_VERIFICATION_FAILED');
    assert.equal(result.executionEligible, false);
  }
});

test('unknown or usage-incompatible signing keys fail verification', async () => {
  const fixture = await makeFixture();

  const usageDenied = loadRuntime({
    ...fixture,
    trustedPublicKeys: deepFreeze({
      [KEY_ID]: deepFreeze(trustedKeyRecord(fixture.publicKey, {
        usage: ['coin-card-manifest-signing'],
      })),
    }),
  });
  assert.equal(
    (await usageDenied.api.lookupHandle('antoinedennison')).outcome,
    'USERNAME_REGISTRY_VERIFICATION_FAILED',
  );

  const unknown = clone(fixture.snapshot);
  unknown.signature.keyId = 'unknown-username-key';
  const resignedUnknown = await signSnapshot(fixture.keyPair, {
    signature: { keyId: 'unknown-username-key' },
  });
  const unknownRuntime = loadRuntime({ ...fixture, snapshot: resignedUnknown });
  assert.equal(
    (await unknownRuntime.api.lookupHandle('antoinedennison')).outcome,
    'USERNAME_REGISTRY_VERIFICATION_FAILED',
  );
});

test('missing source, trust primitives, or crypto return branded authority-unavailable results', async () => {
  const fixture = await makeFixture();
  const vectors = [
    { ...fixture, omitSource: true },
    { ...fixture, omitHeadSource: true },
    { ...fixture, omitSnapshotSource: true },
    { ...fixture, omitHeadAuthority: true },
    { ...fixture, omitCanonicalizer: true },
    { ...fixture, omitTrustedKeyAuthority: true },
    { ...fixture, omitCrypto: true },
  ];

  for (const options of vectors) {
    const { api } = loadRuntime(options);
    const result = await api.lookupHandle('antoinedennison');
    assert.equal(result.outcome, 'USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE');
    assert.equal(api.isAuthorityUnavailableResult(result), true);
    assert.equal(api.isAuthoritativeHandleResult(result), false);
    assert.equal(result.executionEligible, false);
  }
});

test('transport unavailability and transport-contract violations remain operationally distinct', async () => {
  const fixture = await makeFixture();
  const vectors = [
    {
      options: {
        ...fixture,
        headTransportFailure: {
          failureClass: 'TRANSPORT_UNAVAILABLE',
          code: 'username-registry-current-head-fetch-failed',
        },
      },
      outcome: 'USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE',
      reason: 'current-head-transport-unavailable',
    },
    {
      options: {
        ...fixture,
        headTransportFailure: {
          failureClass: 'TRANSPORT_CONTRACT_VIOLATED',
          code: 'username-registry-current-head-content-type-invalid',
        },
      },
      outcome: 'USERNAME_REGISTRY_VERIFICATION_FAILED',
      reason: 'current-head-transport-contract-violated',
    },
    {
      options: {
        ...fixture,
        snapshotTransportFailure: {
          failureClass: 'TRANSPORT_UNAVAILABLE',
          code: 'username-registry-snapshot-response-unavailable',
        },
      },
      outcome: 'USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE',
      reason: 'username-registry-snapshot-transport-unavailable',
    },
    {
      options: {
        ...fixture,
        snapshotTransportFailure: {
          failureClass: 'TRANSPORT_CONTRACT_VIOLATED',
          code: 'username-registry-snapshot-cache-policy-invalid',
        },
      },
      outcome: 'USERNAME_REGISTRY_VERIFICATION_FAILED',
      reason: 'username-registry-snapshot-transport-contract-violated',
    },
  ];

  for (const vector of vectors) {
    const { api } = loadRuntime(vector.options);
    const result = await api.lookupHandle('antoinedennison');
    const failure = vector.options.headTransportFailure || vector.options.snapshotTransportFailure;
    assert.equal(result.outcome, vector.outcome);
    assert.equal(result.reason, vector.reason);
    assert.equal(result.transportFailureClass, failure.failureClass);
    assert.equal(result.transportFailureCode, failure.code);
    assert.equal(result.executionEligible, false);
  }
});

test('lower revisions and conflicting same-revision snapshots fail in one runtime realm', async () => {
  const fixture = await makeFixture({ snapshotOverrides: { registryRevision: 2 } });
  const runtime = loadRuntime(fixture);
  assert.equal(
    (await runtime.api.lookupHandle('antoinedennison')).outcome,
    'USERNAME_REGISTRY_RECORD_AUTHENTICATED',
  );

  const rollback = await signSnapshot(fixture.keyPair, { registryRevision: 1 });
  const rollbackHead = await signHead(fixture.keyPair, rollback);
  setSource(runtime.context, rollback);
  setHeadSource(runtime.context, rollbackHead);
  const rollbackResult = await runtime.api.lookupHandle('antoinedennison');
  assert.equal(rollbackResult.reason, 'current-head-rollback-detected');

  const conflict = await signSnapshot(fixture.keyPair, {
    registryRevision: 2,
    entries: [defaultEntry({ cardId: OTHER_CARD_ID })],
  });
  const conflictHead = await signHead(fixture.keyPair, conflict);
  setSource(runtime.context, conflict);
  setHeadSource(runtime.context, conflictHead);
  const conflictResult = await runtime.api.lookupHandle('antoinedennison');
  assert.equal(conflictResult.reason, 'current-head-revision-conflict');

  const successor = await signSnapshot(fixture.keyPair, {
    registryRevision: 3,
    entries: [defaultEntry({ cardId: OTHER_CARD_ID })],
  });
  const successorHead = await signHead(fixture.keyPair, successor);
  setSource(runtime.context, successor);
  setHeadSource(runtime.context, successorHead);
  const successorResult = await runtime.api.lookupHandle('antoinedennison');
  assert.equal(successorResult.outcome, 'USERNAME_REGISTRY_RECORD_AUTHENTICATED');
  assert.equal(successorResult.registryRevision, 3);
  assert.equal(successorResult.cardId, OTHER_CARD_ID);
});

test('accepted source is snapshotted before caller mutation', async () => {
  const fixture = await makeFixture();
  const runtime = loadRuntime({ ...fixture, freezeSource: false });
  const first = await runtime.api.lookupHandle('antoinedennison');
  assert.equal(first.cardId, CARD_ID);

  vm.runInContext(
    `window.__snapshotSourceFixture.entries[0].cardId = ${JSON.stringify(OTHER_CARD_ID)}`,
    runtime.context,
  );
  const second = await runtime.api.lookupHandle('antoinedennison');
  assert.equal(second.cardId, CARD_ID);
  assert.equal(second.snapshotHash, first.snapshotHash);
});

test('registry and Current Head sources omit execution and presentation authority dependencies', () => {
  for (const source of [
    usernameRegistrySource,
    currentHeadVerificationSource,
    currentHeadSourceSource,
    snapshotSourceSource,
  ]) {
    for (const forbidden of [
      'IX_EXECUTION',
      'IX_COIN_CARD_LIFECYCLE_RESOLUTION',
      'IX_COIN_CARD_LIFECYCLE_PRESENTATION',
      'recipientAddress',
      'tokenContractAddress',
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  }
});
