'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '../../..');
const adapterPath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-readonly-browser.js',
);
const fixtureHtmlPath = path.join(
  repoRoot,
  'app-web/tests/browser/fixtures/coin-card-readonly-vertical-slice.html',
);
const fixtureScriptPath = path.join(
  repoRoot,
  'app-web/tests/browser/fixtures/coin-card-readonly-non-production-fixtures.js',
);

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function startStaticServer(root) {
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch {
      response.writeHead(400).end('bad request');
      return;
    }
    const resolved = path.resolve(root, `.${pathname}`);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    let stat;
    try { stat = fs.statSync(resolved); } catch {
      response.writeHead(404).end('not found');
      return;
    }
    if (!stat.isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypeFor(resolved),
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(resolved).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('adapter is read-only and the harness stays outside the deployable public shell', () => {
  const adapter = fs.readFileSync(adapterPath, 'utf8');
  const html = fs.readFileSync(fixtureHtmlPath, 'utf8');
  const fixture = fs.readFileSync(fixtureScriptPath, 'utf8');

  assert.doesNotMatch(adapter, /IX_EXECUTION/);
  assert.doesNotMatch(adapter, /\/registry\/coincards\//);
  assert.doesNotMatch(adapter, /fetch\s*\(/);
  assert.match(adapter, /IX_COIN_CARD_PUBLIC_RESOLUTION/);
  assert.match(adapter, /IX_COIN_CARD_READONLY_ROUTE_AUTHORITY/);
  assert.match(adapter, /executionEligible:\s*false/);
  assert.match(adapter, /paymentControlEnabled:\s*false/);

  assert.match(html, /frontend\/public\/card\/card\.css/);
  assert.match(html, /cc-card cc-card--dark/);
  assert.doesNotMatch(html, /ix-execution/i);
  assert.doesNotMatch(html, /card\.js/);
  assert.match(fixture, /NON_PRODUCTION_TEST_FIXTURE/);
  assert.match(fixture, /productionAuthorityClaimed:\s*false/);
  assert.match(fixtureScriptPath, /tests\/browser\/fixtures/);
});

test('browser fixture exercises canonical resolution, signed current state, lifecycle, and fail-closed rendering', async () => {
  const server = await startStaticServer(repoRoot);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const vectors = [
    ['active', 'ACTIVE'],
    ['active-alias', 'ACTIVE'],
    ['expired', 'EXPIRED'],
    ['revoked', 'REVOKED'],
    ['tombstoned', 'TOMBSTONED'],
    ['unknown', 'UNKNOWN'],
    ['exact-match-legacy-handle', 'UNKNOWN'],
    ['malformed-head', 'INVALID'],
    ['invalid-head-signature', 'INVALID'],
    ['stale-current-revision', 'INVALID'],
    ['malformed-snapshot', 'INVALID'],
    ['snapshot-signature-failure', 'INVALID'],
    ['snapshot-hash-failure', 'INVALID'],
    ['authority-unavailable', 'AUTHORITY_UNAVAILABLE'],
    ['route-authority-unavailable', 'AUTHORITY_UNAVAILABLE'],
    ['route-signature-failure', 'INVALID'],
    ['route-current-revision-mismatch', 'INVALID'],
    ['route-current-hash-mismatch', 'INVALID'],
  ];
  let activeIdentity = null;

  try {
    for (const [scenario, expectedState] of vectors) {
      const page = await browser.newPage();
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(String(error)));
      const url = `${server.baseUrl}/app-web/tests/browser/fixtures/coin-card-readonly-vertical-slice.html?scenario=${encodeURIComponent(scenario)}`;
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__COIN_CARD_TEST_READY === true, { timeout: 10000 });

      const observed = await page.evaluate(() => ({
        error: window.__COIN_CARD_TEST_ERROR || null,
        result: window.__COIN_CARD_TEST_RESULT || null,
        resultFrozen: Object.isFrozen(window.__COIN_CARD_TEST_RESULT),
        resultBranded: window.IX_COIN_CARD_READONLY_BROWSER
          .isReadOnlyViewResult(window.__COIN_CARD_TEST_RESULT),
        metadata: window.__COIN_CARD_FIXTURE_METADATA || null,
        dom: {
          state: document.getElementById('coinCardReadonly').dataset.state,
          executionEligible: document.getElementById('coinCardReadonly').dataset.executionEligible,
          paymentControlEnabled: document.getElementById('coinCardReadonly').dataset.paymentControlEnabled,
          title: document.getElementById('coinCardTitle').textContent,
          canonical: document.getElementById('coinCardCanonical').textContent,
          route: document.getElementById('coinCardRoute').textContent,
          payment: document.getElementById('coinCardPayment').textContent,
        },
        enabledPaymentActions: Array.from(
          document.querySelectorAll('[data-coin-card-payment-action]'),
        ).filter((element) => !element.disabled && !element.hidden).length,
        executionAuthorityPresent: Boolean(
          window.IX_EXECUTION
          || window.IX_EXECUTION_GAS_POLICY
          || window.IX_COIN_CARD_EXECUTION_AUTHORIZATION
        ),
      }));

      assert.equal(observed.error, null, `${scenario}: fixture boot error`);
      assert.deepEqual(browserErrors, [], `${scenario}: browser errors`);
      assert.equal(observed.result.viewState, expectedState, scenario);
      assert.equal(observed.dom.state, expectedState, scenario);
      assert.equal(observed.resultFrozen, true, scenario);
      assert.equal(observed.resultBranded, true, scenario);
      assert.equal(observed.result.executionEligible, false, scenario);
      assert.equal(observed.result.paymentControlEnabled, false, scenario);
      assert.equal(observed.dom.executionEligible, 'false', scenario);
      assert.equal(observed.dom.paymentControlEnabled, 'false', scenario);
      assert.equal(observed.enabledPaymentActions, 0, scenario);
      assert.equal(observed.executionAuthorityPresent, false, scenario);
      assert.match(observed.dom.payment, /execution unavailable/i, scenario);
      assert.equal(observed.metadata.fixtureTrustBoundary, 'NON_PRODUCTION_TEST_FIXTURE', scenario);
      assert.equal(observed.metadata.wireEnvironment, 'production', scenario);
      assert.equal(observed.metadata.productionKeyTrusted, false, scenario);
      assert.equal(observed.metadata.productionAuthorityClaimed, false, scenario);

      if (expectedState === 'ACTIVE') {
        assert.equal(observed.result.canonicalUsername, 'antoinedennison', scenario);
        assert.equal(observed.result.cardId, 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE', scenario);
        assert.equal(observed.result.lifecycleOutcome, 'LIFECYCLE_ACTIVE', scenario);
        assert.equal(observed.result.fixtureTrustBoundary, 'NON_PRODUCTION_TEST_FIXTURE', scenario);
        assert.equal(observed.result.routeRevision, '1', scenario);
        assert.match(observed.result.routeRecordHash, /^sha256:[0-9a-f]{64}$/, scenario);
        assert.match(observed.dom.route, /Current route revision 1/, scenario);
        const identity = {
          canonicalUsername: observed.result.canonicalUsername,
          cardId: observed.result.cardId,
          routeRecordHash: observed.result.routeRecordHash,
        };
        if (activeIdentity === null) activeIdentity = identity;
        else assert.deepEqual(identity, activeIdentity, 'path alias must resolve the canonical identity');
      } else {
        assert.equal(observed.result.presentationEligible, false, scenario);
      }

      if (scenario === 'active') {
        assert.equal(observed.result.canonicalUrl, 'https://antoinedennison.coincard.click/');
        assert.equal(observed.result.redirectUrl, null);
      }
      if (scenario === 'active-alias') {
        assert.equal(observed.result.canonicalUrl, 'https://antoinedennison.coincard.click/');
        assert.equal(observed.result.redirectUrl, 'https://antoinedennison.coincard.click/');
      }
      if (scenario === 'exact-match-legacy-handle') {
        assert.equal(observed.result.canonicalUsername, 'antoine');
        assert.equal(observed.result.canonicalUrl, 'https://antoine.coincard.click/');
        assert.equal(observed.result.cardId, null);
      }
      if (scenario === 'expired') {
        assert.equal(observed.result.lifecycleOutcome, 'LIFECYCLE_EXPIRED');
      }
      if (scenario === 'revoked') {
        assert.equal(observed.result.lifecycleOutcome, 'LIFECYCLE_CARD_REVOKED');
      }
      if ([
        'malformed-head',
        'invalid-head-signature',
        'stale-current-revision',
        'malformed-snapshot',
        'snapshot-signature-failure',
        'snapshot-hash-failure',
      ].includes(scenario)) {
        assert.equal(observed.result.publicResolutionOutcome, 'PUBLIC_RESOLUTION_VERIFICATION_FAILED');
      }
      if ([
        'route-signature-failure',
        'route-current-revision-mismatch',
        'route-current-hash-mismatch',
      ].includes(scenario)) {
        assert.equal(observed.result.publicResolutionOutcome, 'PUBLIC_RESOLUTION_ACTIVE');
        assert.equal(observed.result.routeRecordHash, null);
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
});
