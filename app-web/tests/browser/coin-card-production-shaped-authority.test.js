'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { webcrypto } = require('node:crypto');
const puppeteer = require('puppeteer');

const canonicalJsonApi = require('../../frontend/public/card/coin-card-canonical-json-v1.js');
const { KMS_ALGORITHM, createKmsCompatibleP256Signer } = require('../../scripts/coin-card-authority/kms-compatible-signer');
const { DOMAINS, createAuthorityArtifactFactory, hashArtifact } = require('../../scripts/coin-card-authority/authority-artifacts');
const { createLocalAtomicArtifactStore } = require('../../scripts/coin-card-authority/local-atomic-artifact-store');
const { createAuthorityPublisher } = require('../../scripts/coin-card-authority/authority-publisher');
const { ROLES, createRoleBoundSigner } = require('../../scripts/coin-card-authority/authority-roles');

const repoRoot = path.resolve(__dirname, '../../..');
const fixturePath = '/app-web/tests/browser/fixtures/coin-card-production-shaped-authority.html';
const KEY_ID = 'non-production-production-shaped-authority-key';
const CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';
const ACCOUNT_ID = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8';

function p1363ToDer(value) {
  function integer(input) {
    const bytes = Buffer.from(input);
    let offset = 0;
    while (offset < bytes.length - 1 && bytes[offset] === 0) offset += 1;
    let magnitude = bytes.subarray(offset);
    if (magnitude[0] & 0x80) magnitude = Buffer.concat([Buffer.from([0]), magnitude]);
    return Buffer.concat([Buffer.from([0x02, magnitude.length]), magnitude]);
  }
  const bytes = Buffer.from(value);
  const body = Buffer.concat([integer(bytes.subarray(0, 32)), integer(bytes.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

async function buildAuthorityData() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  let pendingMessage = null;
  const kmsSigner = createKmsCompatibleP256Signer({
    keyId: KEY_ID,
    keyVersionName: 'projects/non-production/locations/global/keyRings/test/cryptoKeys/test/cryptoKeyVersions/1',
    kmsAlgorithm: KMS_ALGORITHM,
    asymmetricSign: async () => ({
      algorithm: KMS_ALGORITHM,
      signature: p1363ToDer(await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, pendingMessage
      )),
    }),
  });
  const signer = Object.freeze({
    keyId: kmsSigner.keyId,
    keyVersionName: kmsSigner.keyVersionName,
    async signMessage(message) {
      pendingMessage = Buffer.from(message);
      return kmsSigner.signMessage(message);
    },
    async signCanonicalPayload(domain, canonical) {
      pendingMessage = Buffer.concat([
        Buffer.from(domain, 'utf8'), Buffer.from([0]), Buffer.from(canonical, 'utf8'),
      ]);
      return kmsSigner.signCanonicalPayload(domain, canonical);
    },
  });
  const artifacts = createAuthorityArtifactFactory({
    registryPublicationSigner: createRoleBoundSigner({ role: ROLES.REGISTRY_PUBLICATION, signer }),
    executableCurrentHeadSigner: createRoleBoundSigner({ role: ROLES.EXECUTABLE_CURRENT_HEAD, signer }),
  });
  async function signatureValid(value, domain) {
    const payload = JSON.parse(JSON.stringify(value));
    const signature = Buffer.from(payload.signature.value, 'base64url');
    delete payload.signature.value;
    const message = Buffer.concat([
      Buffer.from(domain, 'utf8'), Buffer.from([0]),
      Buffer.from(canonicalJsonApi.canonicalizeJson(payload), 'utf8'),
    ]);
    return webcrypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.publicKey, signature, message
    );
  }
  const verify = {
    usernameSnapshot: async (value, hash) => (await signatureValid(value, DOMAINS.usernameSnapshotSignature))
      && artifacts.hashUsernameSnapshot(value) === hash,
    usernameHead: async (value, hash) => (await signatureValid(value, DOMAINS.usernameHeadSignature))
      && artifacts.hashUsernameHead(value) === hash,
    lifecycleRecord: async (value, hash) => (await signatureValid(value, DOMAINS.lifecycleRecordSignature))
      && artifacts.hashLifecycleRecord(value) === hash,
    lifecycleBundle: async (value, records) => value.entries.length === records.length,
    hashLifecycleBundle: (value) => hashArtifact('ImplicitEx.CoinCard.LifecycleRegistryBundleArtifact.v1', value),
    executableRecord: async (value, hash) => value.registrySchemaVersion === 'coin-card-registry-record.v2'
      && (!hash || artifacts.hashExecutableRecord(value) === hash),
    executableHead: async (value, hash) => (await signatureValid(value, DOMAINS.executableHeadSignature))
      && artifacts.hashExecutableHead(value) === hash,
  };
  const publisher = createAuthorityPublisher({
    artifacts, store: createLocalAtomicArtifactStore(), verify,
  });
  const username = await publisher.publishUsernameAuthority({
    snapshotFields: {
      registrySchemaVersion: 'coin-card-public-username-registry.v1',
      registryId: 'implicitex-public-usernames', environment: 'production', registryRevision: 1,
      issuedAt: '2026-08-11T11:50:00.000Z', expiresAt: '2026-08-12T11:49:00.000Z',
      authorityId: 'implicitex-registry',
      entries: [{ username: 'antoinedennison', accountId: ACCOUNT_ID, cardId: CARD_ID, status: 'ACTIVE' }],
    },
    headFields: {
      headSchemaVersion: 'coin-card-public-username-registry-head.v1',
      registryId: 'implicitex-public-usernames', environment: 'production',
      issuedAt: '2026-08-11T11:58:00.000Z', expiresAt: '2026-08-11T12:10:00.000Z',
      authorityId: 'implicitex-registry',
    },
  });
  const lifecycle = await publisher.publishLifecycleBundle({
    recordFields: [{
      registryId: 'implicitex-production', registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
      environment: 'production', registryVersion: 1, recordId: 'antoine-lifecycle-r1',
      publishedAt: '2026-08-11T11:55:00.000Z', cardId: CARD_ID,
      manifestId: 'coincard-production-v1', revision: 1, previousManifestId: null,
      cardStatus: 'CARD_ACTIVE', manifestStatus: 'MANIFEST_CURRENT',
      effectiveFrom: '2026-08-11T11:00:00.000Z', effectiveUntil: null,
      supersededByManifestId: null, reasonCode: null,
      authorityId: 'implicitex-registry', administrationEvidenceHash: null,
    }],
    bundleFields: {
      registrySchemaVersion: 'coin-card-lifecycle-registry-bundle.v1',
      registryId: 'implicitex-production', environment: 'production', registryVersion: 1,
      generatedAt: '2026-08-11T11:56:00.000Z',
    },
  });
  const executableRecord = {
    registrySchemaVersion: 'coin-card-registry-record.v2',
    registryId: 'implicitex-executable-production', environment: 'production',
    recordId: 'ccr2-antoine-r1', revision: '1', cardId: CARD_ID,
    recipientAddress: '0x1111111111111111111111111111111111111111', chainId: '137',
    tokenContractAddress: '0x2222222222222222222222222222222222222222',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    executionContractInterfaceId: 'implicitex-executor-v1',
    executionInterfaceDescriptorHash: `sha256:${'4'.repeat(64)}`,
    feePolicy: {
      policyVersion: 'fee-policy-v1', feeBasisPoints: '100', feeCapAtomic: null,
      minimumTransferAtomic: '1', maximumTransferAtomic: '1000000', transferPrecisionAtomic: '1',
      roundingRule: 'FLOOR_BPS_THEN_CAP',
      feeRecipientAddress: '0x5555555555555555555555555555555555555555',
    },
  };
  const executable = await publisher.publishExecutableAuthority({
    record: executableRecord,
    headFields: {
      headSchemaVersion: 'executable-registry-head.v1', headSequence: '1',
      lifecycleRecordHash: lifecycle.records[0].hash,
      transactionEvidenceAuthorityHash: `sha256:${'6'.repeat(64)}`,
      issuedAt: '2026-08-11T11:58:00.000Z', expiresAt: '2026-08-12T11:58:00.000Z',
      authorityId: 'implicitex-executable-registry',
    },
  });
  return {
    verificationTime: '2026-08-11T12:00:00.000Z', cardId: CARD_ID,
    publicKey: { keyId: KEY_ID, jwk: publicJwk },
    usernameSnapshot: username.snapshot.artifact, usernameSnapshotHash: username.snapshot.hash,
    usernameHead: username.head.artifact,
    lifecycleBundle: lifecycle.bundle.artifact,
    executableRecord: executable.record.artifact,
    executableHead: executable.head.artifact, executableHeadHash: executable.head.hash,
  };
}

function startServer(authorityData) {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/__coin_card_authority.json') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(authorityData));
      return;
    }
    const file = path.resolve(repoRoot, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found'); return;
    }
    response.writeHead(200, {
      'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8'
        : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

test('production-shaped publishers replace fixture sources without changing resolver, renderer, or browser adapter', async () => {
  const authorityData = await buildAuthorityData();
  const server = await startServer(authorityData);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const identities = [];
  try {
    for (const alias of [false, true]) {
      const page = await browser.newPage();
      await page.goto(`${server.baseUrl}${fixturePath}${alias ? '?alias=1' : ''}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__COIN_CARD_AUTHORITY_READY === true, { timeout: 10000 });
      const observed = await page.evaluate(() => ({
        error: window.__COIN_CARD_AUTHORITY_ERROR || null,
        data: window.__COIN_CARD_AUTHORITY_TEST,
        executionPresent: Boolean(window.IX_EXECUTION),
        paymentActions: Array.from(document.querySelectorAll('[data-coin-card-payment-action]'))
          .filter((item) => !item.disabled && !item.hidden).length,
      }));
      assert.equal(observed.error, null);
      assert.equal(observed.data.view.viewState, 'ACTIVE');
      assert.equal(observed.data.view.executionEligible, false);
      assert.equal(observed.data.route.authenticated, true);
      assert.equal(observed.data.route.current, true);
      assert.equal(observed.data.route.rollbackProtected, true);
      assert.equal(observed.data.route.executionEligible, false);
      assert.equal(observed.data.route.sourceMechanism, 'nonce-bound-test-authority-interface');
      assert.equal(observed.executionPresent, false);
      assert.equal(observed.paymentActions, 0);
      identities.push({
        username: observed.data.view.canonicalUsername,
        cardId: observed.data.view.cardId,
        routeHash: observed.data.view.routeRecordHash,
      });
      if (alias) assert.equal(observed.data.view.redirectUrl, 'https://antoinedennison.coincard.click/');
      await page.close();
    }
    assert.deepEqual(identities[0], identities[1]);

    for (const [scenario, expected] of [
      ['unbranded-source', 'INVALID'],
      ['head-wrong-algorithm', 'INVALID'],
      ['head-tampered-signature', 'INVALID'],
      ['record-hash-mismatch', 'INVALID'],
      ['source-outage', 'AUTHORITY_UNAVAILABLE'],
    ]) {
      const page = await browser.newPage();
      await page.goto(`${server.baseUrl}${fixturePath}?scenario=${scenario}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__COIN_CARD_AUTHORITY_READY === true, { timeout: 10000 });
      const observed = await page.evaluate(() => ({
        error: window.__COIN_CARD_AUTHORITY_ERROR || null,
        view: window.__COIN_CARD_AUTHORITY_TEST.view,
        route: window.__COIN_CARD_AUTHORITY_TEST.route,
        executionPresent: Boolean(window.IX_EXECUTION),
      }));
      assert.equal(observed.error, null, scenario);
      assert.equal(observed.view.viewState, expected, scenario);
      assert.equal(observed.view.executionEligible, false, scenario);
      assert.equal(observed.route.executionEligible, false, scenario);
      assert.equal(observed.executionPresent, false, scenario);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

test('replacement harness stays outside deployable roots and leaves core browser modules untouched', () => {
  const fixture = fs.readFileSync(path.join(repoRoot, fixturePath), 'utf8');
  const bootstrap = fs.readFileSync(path.join(
    repoRoot, 'app-web/tests/browser/fixtures/coin-card-production-shaped-authority.js'
  ), 'utf8');
  assert.match(path.join(repoRoot, fixturePath), /tests\/browser\/fixtures/);
  assert.match(fixture, /NON_PRODUCTION_TEST_FIXTURE/);
  assert.match(bootstrap, /NON_PRODUCTION_TEST_FIXTURE/);
  assert.doesNotMatch(bootstrap, /IX_EXECUTION/);
  assert.doesNotMatch(bootstrap, /IX_COIN_CARD_PUBLIC_RESOLUTION\s*[,=]/);
  assert.doesNotMatch(bootstrap, /IX_COIN_CARD_READONLY_BROWSER\s*[,=]/);
  assert.doesNotMatch(bootstrap, /IX_COIN_CARD_LIFECYCLE_PRESENTATION\s*[,=]/);
});
