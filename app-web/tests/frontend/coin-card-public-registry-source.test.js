'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const cardRoot = path.join(repoRoot, 'app-web/frontend/public/card');
const coinCardPublicRoot = path.join(repoRoot, 'coincard/public');
const firebasePath = path.join(repoRoot, 'firebase.json');
const headSourcePath = path.join(
  cardRoot,
  'coin-card-public-username-registry-head-source.js',
);
const snapshotSourcePath = path.join(
  cardRoot,
  'coin-card-public-username-registry-snapshot-source.js',
);
const headSource = fs.readFileSync(headSourcePath, 'utf8');
const snapshotSource = fs.readFileSync(snapshotSourcePath, 'utf8');

const HEAD_URL =
  'https://coincard.click/.well-known/coin-card-public-username-registry-head.v1.json';
const SNAPSHOT_BASE_URL =
  'https://coincard.click/.well-known/coin-card-public-username-registry-snapshots/sha256/';
const SNAPSHOT_HASH = `sha256:${'a'.repeat(64)}`;
const SNAPSHOT_URL = `${SNAPSHOT_BASE_URL}${'a'.repeat(64)}.json`;

function makeContext(fetchImpl) {
  const context = {
    Promise,
    URL,
    window: { fetch: fetchImpl },
  };
  context.globalThis = context;
  context.window.window = context.window;
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  return context;
}

function runSource(context, source, filename) {
  vm.runInContext(source, context, { filename, timeout: 3000 });
}

function makeHeaders(values) {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    get(name) { return normalized[String(name).toLowerCase()] ?? null; },
  };
}

function responseFor(url, overrides = {}) {
  return {
    ok: true,
    status: 200,
    redirected: false,
    type: 'cors',
    url,
    headers: makeHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    }),
    async json() { return { untrusted: true }; },
    ...overrides,
  };
}

function headerMap(rule) {
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

function listRuntimeFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listRuntimeFiles(absolute));
    if (entry.isFile() && /\.(?:html|js)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

test('Current Head loader enforces one fixed cross-origin no-store request', async () => {
  const calls = [];
  const context = makeContext(async (url, options) => {
    calls.push({ url, options });
    return responseFor(url);
  });
  runSource(context, headSource, headSourcePath);
  const api = context.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE;

  assert.deepEqual(await api.loadCurrentHead(), { untrusted: true });
  assert.equal(api.CURRENT_HEAD_URL, HEAD_URL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, HEAD_URL);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
  assert.equal(Object.isFrozen(api), true);
});

test('Current Head loader rejects non-200, redirect, endpoint, MIME, and cache-policy drift', async () => {
  const context = makeContext(async () => responseFor(HEAD_URL));
  runSource(context, headSource, headSourcePath);
  const api = context.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE;
  const vectors = [
    [responseFor(HEAD_URL, { ok: false, status: 503 }), /response-unavailable/],
    [responseFor(HEAD_URL, { redirected: true }), /response-identity-invalid/],
    [responseFor('https://cdn.example/head.json'), /response-identity-invalid/],
    [responseFor(HEAD_URL, { type: 'opaque' }), /response-identity-invalid/],
    [responseFor(HEAD_URL, {
      headers: makeHeaders({
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      }),
    }), /content-type-invalid/],
    [responseFor(HEAD_URL, {
      headers: makeHeaders({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900',
      }),
    }), /cache-policy-invalid/],
  ];

  for (const [response, expected] of vectors) {
    context.window.fetch = async () => response;
    await assert.rejects(api.loadCurrentHead(), expected);
  }
});

test('snapshot loader derives one immutable URL from the exact authenticated hash identity', async () => {
  const calls = [];
  const context = makeContext(async (url, options) => {
    calls.push({ url, options });
    return responseFor(url, {
      headers: makeHeaders({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      }),
    });
  });
  runSource(context, snapshotSource, snapshotSourcePath);
  const api = context.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE;

  assert.equal(api.snapshotUrlForHash(SNAPSHOT_HASH), SNAPSHOT_URL);
  assert.deepEqual(await api.loadSnapshotByHash(SNAPSHOT_HASH), { untrusted: true });
  assert.equal(api.SNAPSHOT_BASE_URL, SNAPSHOT_BASE_URL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SNAPSHOT_URL);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.cache, 'force-cache');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
});

test('snapshot loader rejects path injection and mutable-response semantics', async () => {
  let fetchCount = 0;
  const context = makeContext(async () => {
    fetchCount += 1;
    return responseFor(SNAPSHOT_URL, {
      headers: makeHeaders({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000, immutable',
      }),
    });
  });
  runSource(context, snapshotSource, snapshotSourcePath);
  const api = context.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE;

  for (const invalidHash of [
    `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}`,
    `sha256:${'a'.repeat(63)}/../head`,
    `sha512:${'a'.repeat(64)}`,
    null,
  ]) {
    await assert.rejects(api.loadSnapshotByHash(invalidHash), /artifact-identity-invalid/);
  }
  assert.equal(fetchCount, 0);

  const vectors = [
    [responseFor(SNAPSHOT_URL, { redirected: true }), /response-identity-invalid/],
    [responseFor(`${SNAPSHOT_BASE_URL}${'b'.repeat(64)}.json`), /response-identity-invalid/],
    [responseFor(SNAPSHOT_URL, {
      headers: makeHeaders({
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=31536000, immutable',
      }),
    }), /content-type-invalid/],
    [responseFor(SNAPSHOT_URL, {
      headers: makeHeaders({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      }),
    }), /cache-policy-invalid/],
  ];
  for (const [response, expected] of vectors) {
    context.window.fetch = async () => response;
    await assert.rejects(api.loadSnapshotByHash(SNAPSHOT_HASH), expected);
  }
});

test('source diagnostics privately distinguish unavailability from contract violation', async () => {
  const headContext = makeContext(async () => responseFor(HEAD_URL, {
    headers: makeHeaders({
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    }),
  }));
  runSource(headContext, headSource, headSourcePath);
  const headApi = headContext.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE;
  let contractError;
  try { await headApi.loadCurrentHead(); } catch (error) { contractError = error; }
  const contractDiagnostic = headApi.classifyTransportFailure(contractError);
  assert.equal(contractDiagnostic.failureClass, 'TRANSPORT_CONTRACT_VIOLATED');
  assert.equal(contractDiagnostic.code, 'username-registry-current-head-content-type-invalid');
  assert.equal(headApi.classifyTransportFailure(new Error(contractError.message)), null);

  headContext.window.fetch = async () => responseFor(HEAD_URL, { ok: false, status: 503 });
  let unavailableError;
  try { await headApi.loadCurrentHead(); } catch (error) { unavailableError = error; }
  const unavailableDiagnostic = headApi.classifyTransportFailure(unavailableError);
  assert.equal(unavailableDiagnostic.failureClass, 'TRANSPORT_UNAVAILABLE');
  assert.equal(unavailableDiagnostic.code, 'username-registry-current-head-response-unavailable');

  const snapshotContext = makeContext(async () => responseFor(SNAPSHOT_URL));
  runSource(snapshotContext, snapshotSource, snapshotSourcePath);
  const snapshotApi = snapshotContext.window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE;
  let identityError;
  try { await snapshotApi.loadSnapshotByHash(`sha512:${'a'.repeat(64)}`); } catch (error) { identityError = error; }
  const identityDiagnostic = snapshotApi.classifyTransportFailure(identityError);
  assert.equal(identityDiagnostic.failureClass, 'TRANSPORT_CONTRACT_VIOLATED');
  assert.equal(identityDiagnostic.code, 'username-registry-snapshot-artifact-identity-invalid');
});

test('Coin Card hosting freezes cross-origin head and snapshot delivery policy', () => {
  const firebase = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
  const hosting = firebase.hosting.find(({ target }) => target === 'coincard');
  assert.ok(hosting);

  const headRule = hosting.headers.find(({ source }) =>
    source === '/.well-known/coin-card-public-username-registry-head.v1.json');
  const snapshotRule = hosting.headers.find(({ source }) =>
    source === '/.well-known/coin-card-public-username-registry-snapshots/sha256/**');
  assert.ok(headRule);
  assert.ok(snapshotRule);

  const headHeaders = headerMap(headRule);
  assert.match(headHeaders['content-type'], /^application\/json(?:;|$)/);
  assert.equal(headHeaders['access-control-allow-origin'], '*');
  assert.equal(headHeaders['cross-origin-resource-policy'], 'cross-origin');
  assert.match(headHeaders['cache-control'], /(?:^|,)\s*no-store(?:,|$)/);
  assert.equal(headHeaders['cdn-cache-control'], 'no-store');
  assert.equal(headHeaders['surrogate-control'], 'no-store');

  const snapshotHeaders = headerMap(snapshotRule);
  assert.match(snapshotHeaders['content-type'], /^application\/json(?:;|$)/);
  assert.equal(snapshotHeaders['access-control-allow-origin'], '*');
  assert.equal(snapshotHeaders['cross-origin-resource-policy'], 'cross-origin');
  assert.match(snapshotHeaders['cache-control'], /(?:^|,)\s*public(?:,|$)/);
  assert.match(snapshotHeaders['cache-control'], /(?:^|,)\s*immutable(?:,|$)/);
  assert.match(snapshotHeaders['cache-control'], /max-age=31536000/);
  assert.match(snapshotHeaders['cdn-cache-control'], /immutable/);

  const globalRule = hosting.headers.find(({ source }) => source === '**');
  const csp = headerMap(globalRule)['content-security-policy'];
  assert.match(csp, /connect-src [^;]*https:\/\/coincard\.click(?:\s|;)/);
  assert.doesNotMatch(csp, /connect-src [^;]*https:\/\/\*\.coincard\.click/);
});

test('Coin Card V1 has no service worker capable of caching the Current Head', () => {
  const serviceWorkerFiles = listRuntimeFiles(coinCardPublicRoot)
    .filter((file) => /(?:^|\/)(?:sw|service-worker|serviceworker)(?:[-.]|$)/i.test(file));
  assert.deepEqual(serviceWorkerFiles, []);

  for (const file of listRuntimeFiles(coinCardPublicRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /navigator\.serviceWorker|serviceWorker\.register|caches\.(?:open|match|put)/, file);
  }
});

test('delivery policy does not publish a Current Head, snapshot, identity, or signature', () => {
  assert.equal(
    fs.existsSync(path.join(
      coinCardPublicRoot,
      '.well-known/coin-card-public-username-registry-head.v1.json',
    )),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(
      coinCardPublicRoot,
      '.well-known/coin-card-public-username-registry-snapshots',
    )),
    false,
  );
  assert.doesNotMatch(headSource + snapshotSource, /acct_[0-9A-HJKMNP-TV-Z]{26}|cc_[0-9A-HJKMNP-TV-Z]{26}/);
});
