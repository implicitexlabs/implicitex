'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '../../..');
const holderRoot = path.join(repoRoot, 'app-web/holder-management');
const holderPage = '/app-web/holder-management/public/index.html';

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
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
    try {
      if (!fs.statSync(resolved).isFile()) throw new Error('not a file');
    } catch {
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
    server.listen(0, '127.0.0.1', () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

async function waitForWorkflow(page, expected) {
  await page.waitForFunction(
    (value) => document.getElementById('holderApp').dataset.workflow === value,
    { timeout: 10000 }, expected,
  );
}

async function clickAction(page, name) {
  await page.evaluate((value) => {
    const button = document.querySelector(`[data-action="${value}"]`);
    if (!button || button.disabled) throw new Error(`action unavailable: ${value}`);
    button.click();
  }, name);
}

async function openSection(page, name) {
  await page.click(`[data-section-target="${name}"]`);
}

async function observedState(page) {
  return page.evaluate(() => {
    const holder = window.__COIN_CARD_HOLDER_TEST;
    const state = holder.getState();
    return {
      workflow: state.workflowState,
      lifecycle: state.lifecycleState,
      canonicalUsername: state.canonicalUsername,
      canonicalUrl: state.canonicalUrl,
      cardId: state.account.cardId || state.draft.cardId,
      routeRevision: state.authoritative.routeRevision,
      walletControl: state.walletControlState,
      entitlement: state.entitlementState,
      writeDisposition: state.writeDisposition,
      preview: state.authoritative.preview,
      executionEligible: state.executionEligible,
      paymentControlEnabled: state.paymentControlEnabled,
      publicationAdvanced: state.authoritativePublicationAdvanced,
      stateFrozen: Object.isFrozen(state),
      stateBranded: window.IX_COIN_CARD_HOLDER_MODEL.isHolderState(state),
      root: { ...document.getElementById('holderApp').dataset },
      previewState: document.getElementById('publicPreview').dataset.previewState,
      error: document.getElementById('errorBanner').hidden
        ? null : document.getElementById('errorBanner').textContent,
      executionAuthorityPresent: Boolean(
        window.IX_EXECUTION
        || window.IX_EXECUTION_GAS_POLICY
        || window.IX_COIN_CARD_EXECUTION_AUTHORIZATION
      ),
      enabledPaymentControls: Array.from(document.querySelectorAll(
        '[data-payment-action], [data-coin-card-payment-action]'
      )).filter((element) => !element.disabled && !element.hidden).length,
      fixtureTrustBoundary: holder.fixtureTrustBoundary,
    };
  });
}

test('holder fixture stays outside Firebase deployable roots and exposes no execution capability', () => {
  const firebase = JSON.parse(fs.readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
  const hosting = Array.isArray(firebase.hosting) ? firebase.hosting : [firebase.hosting];
  const deployableRoots = hosting.filter(Boolean).map((entry) => path.resolve(repoRoot, entry.public));
  const sources = [
    path.join(holderRoot, 'coin-card-holder-model.js'),
    path.join(holderRoot, 'non-production/holder-runtime.js'),
    path.join(holderRoot, 'public/index.html'),
    path.join(holderRoot, 'public/app.js'),
  ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');

  assert.equal(deployableRoots.some((root) => holderRoot === root || holderRoot.startsWith(`${root}${path.sep}`)), false);
  assert.match(sources, /NON_PRODUCTION_TEST_FIXTURE/);
  assert.doesNotMatch(sources, /\bIX_EXECUTION\b/);
  assert.doesNotMatch(sources, /MoonPay/i);
  assert.doesNotMatch(sources, /BEGIN (?:EC |RSA )?PRIVATE KEY/);
  assert.doesNotMatch(sources, /"d"\s*:\s*"[A-Za-z0-9_-]+"/);
  assert.doesNotMatch(sources, /shared parent-domain session/i);
});

test('new holder completes a production-shaped local flow through ACTIVATION_READY', async () => {
  const server = await startStaticServer(repoRoot);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(String(error)));

  try {
    await page.goto(`${server.baseUrl}${holderPage}?scenario=new`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('holderApp').dataset.ready === 'true');
    await waitForWorkflow(page, 'ACCOUNT_READY');

    await clickAction(page, 'select-username');
    await waitForWorkflow(page, 'USERNAME_SELECTED');
    await clickAction(page, 'reserve-username');
    await waitForWorkflow(page, 'USERNAME_RESERVED');
    await clickAction(page, 'allocate-card');
    await waitForWorkflow(page, 'PRESENTATION_REQUIRED');

    await openSection(page, 'presentation');
    await clickAction(page, 'save-presentation');
    await waitForWorkflow(page, 'ROUTING_REQUIRED');

    await openSection(page, 'routing');
    await clickAction(page, 'save-route');
    await waitForWorkflow(page, 'WALLET_EVIDENCE_REQUIRED');
    await clickAction(page, 'request-challenge');
    await page.waitForFunction(() => window.__COIN_CARD_HOLDER_TEST.getState().walletControlState === 'CHALLENGE_REQUIRED');
    await clickAction(page, 'verify-wallet');
    await page.waitForFunction(() => window.__COIN_CARD_HOLDER_TEST.getState().walletControlState === 'WALLET_CONTROL_VERIFIED');

    await openSection(page, 'coin-card');
    await clickAction(page, 'assess-entitlement');
    await waitForWorkflow(page, 'REVIEW_REQUIRED');
    await clickAction(page, 'review-activation');
    await waitForWorkflow(page, 'ACTIVATION_READY');
    await clickAction(page, 'refresh-preview');
    await page.waitForFunction(() => document.getElementById('publicPreview').dataset.previewState === 'UNKNOWN');

    const observed = await observedState(page);
    assert.deepEqual(browserErrors, []);
    assert.equal(observed.error, null);
    assert.equal(observed.workflow, 'ACTIVATION_READY');
    assert.equal(observed.lifecycle, 'UNKNOWN');
    assert.equal(observed.canonicalUsername, 'antoinedennison');
    assert.equal(observed.canonicalUrl, 'https://antoinedennison.coincard.click/');
    assert.match(observed.cardId, /^cc_/);
    assert.equal(observed.walletControl, 'WALLET_CONTROL_VERIFIED');
    assert.equal(observed.entitlement, 'NON_PRODUCTION_ELIGIBLE');
    assert.equal(observed.writeDisposition, 'AUTHORITATIVE_READ_ONLY_WITH_LOCAL_DRAFTS');
    assert.equal(observed.executionEligible, false);
    assert.equal(observed.paymentControlEnabled, false);
    assert.equal(observed.publicationAdvanced, false);
    assert.equal(observed.stateFrozen, true);
    assert.equal(observed.stateBranded, true);
    assert.equal(observed.root.executionEligible, 'false');
    assert.equal(observed.executionAuthorityPresent, false);
    assert.equal(observed.enabledPaymentControls, 0);
    assert.equal(observed.fixtureTrustBoundary, 'NON_PRODUCTION_TEST_FIXTURE');
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});

test('existing ACTIVE holder preview agrees with the public read adapter', async () => {
  const server = await startStaticServer(repoRoot);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(`${server.baseUrl}${holderPage}?scenario=active`, { waitUntil: 'networkidle0' });
    await waitForWorkflow(page, 'ACTIVE_MANAGEMENT');
    const observed = await observedState(page);
    assert.equal(observed.lifecycle, 'ACTIVE');
    assert.equal(observed.preview.viewState, 'ACTIVE');
    assert.equal(observed.preview.canonicalUsername, observed.canonicalUsername);
    assert.equal(observed.preview.canonicalUrl, observed.canonicalUrl);
    assert.equal(observed.preview.cardId, observed.cardId);
    assert.equal(observed.preview.routeRevision, '7');
    assert.equal(observed.routeRevision, '7');
    assert.equal(observed.previewState, 'ACTIVE');
    assert.equal(observed.executionEligible, false);
    assert.equal(observed.preview.executionEligible, false);
    assert.equal(observed.executionAuthorityPresent, false);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});

test('invalid and unavailable public authority outcomes fail closed in holder management', async () => {
  const server = await startStaticServer(repoRoot);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    for (const [scenario, expectedWorkflow, expectedLifecycle] of [
      ['invalid', 'AUTHORITY_INVALID', 'INVALID'],
      ['authority-unavailable', 'AUTHORITY_UNAVAILABLE', 'AUTHORITY_UNAVAILABLE'],
      ['revoked', 'LIFECYCLE_REVOKED', 'REVOKED'],
      ['tombstoned', 'LIFECYCLE_TOMBSTONED', 'TOMBSTONED'],
    ]) {
      const page = await browser.newPage();
      await page.goto(`${server.baseUrl}${holderPage}?scenario=${scenario}`, { waitUntil: 'networkidle0' });
      await waitForWorkflow(page, expectedWorkflow);
      const observed = await observedState(page);
      assert.equal(observed.lifecycle, expectedLifecycle, scenario);
      assert.equal(observed.executionEligible, false, scenario);
      assert.equal(observed.paymentControlEnabled, false, scenario);
      assert.equal(observed.publicationAdvanced, false, scenario);
      assert.equal(observed.executionAuthorityPresent, false, scenario);
      assert.equal(observed.enabledPaymentControls, 0, scenario);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

test('holder shell remains usable without horizontal overflow at a phone viewport', async () => {
  const server = await startStaticServer(repoRoot);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
    await page.goto(`${server.baseUrl}${holderPage}?scenario=active`, { waitUntil: 'networkidle0' });
    await waitForWorkflow(page, 'ACTIVE_MANAGEMENT');
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      headerVisible: document.querySelector('.app-header').getBoundingClientRect().height > 0,
      navVisible: document.querySelector('.side-nav').getBoundingClientRect().height > 0,
    }));
    assert.equal(dimensions.document, dimensions.viewport);
    assert.equal(dimensions.headerVisible, true);
    assert.equal(dimensions.navVisible, true);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});
