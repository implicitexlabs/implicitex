/* coin-card-geometry-browser.test.js
 *
 * Puppeteer browser tests asserting Coin Card canonical exterior dimensions.
 *
 * Canonical geometry (coin-card.tokens.json v1, COIN_CARD_INVARIANT_CONTRACT):
 *   Expanded card exterior:          460 × 286  (border-box)
 *   Collapsed acceptance mark:       216 × 44   (border-box)
 *
 * Invariants asserted:
 *   D1  Desktop (1280×800): expanded card exterior = 460 × 286 in CONFIGURE state
 *   D2  Desktop (1280×800): expanded card exterior = 460 × 286 in REVIEW state
 *   D3  Desktop (1280×800): height is identical between CONFIGURE and REVIEW (no drift)
 *   D4  Desktop (1280×800): collapsed acceptance mark = 216 × 44 in COLLAPSED state
 *   D5  Review content does not escape card bounds
 *   D6  Primary action chip (#ccChip) and Edit Payment button do not overlap
 *   D7  QR panel does not overlap card controls in active states
 *   M1  Mobile (390×844): no page-level horizontal overflow (scrollWidth ≤ 390)
 *   M2  Mobile (390×844): card remains within viewport bounds
 *   M3  Mobile (390×844): Review content and Edit Payment action reachable (visible)
 *
 * Measurement uses getBoundingClientRect() (border-box) with ±2 px tolerance
 * for sub-pixel rendering variance across DPI configurations.
 *
 * Architecture: a local HTTP server serves frontend/public/. Request interception
 * injects a test trusted-keys.js and signed manifest (same pattern as the QR test).
 * Data-state is forced via page.evaluate() for state-transition tests; the card
 * surfaces remain structurally correct — only the CSS visibility rules change.
 *
 * Standalone: node app-web/tests/browser/coin-card-geometry-browser.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, describe, before, after } = require('node:test');
const puppeteer = require('puppeteer');

/* ----------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------- */
const appRoot   = path.resolve(__dirname, '../..');
const publicDir = path.join(appRoot, 'frontend/public');

/* ----------------------------------------------------------------
 * Geometry constants (mirrors coin-card.tokens.json v1)
 * ---------------------------------------------------------------- */
const GEO = {
  expanded: { width: 460, height: 286 },
  collapsed: { width: 216, height: 44 },
  tolerance: 2,   /* ±2 px for sub-pixel rendering */
};

/* ----------------------------------------------------------------
 * Protected asset paths (same list as QR test)
 * ---------------------------------------------------------------- */
const PROTECTED_ASSET_PATHS = [
  'js/ix-execution.js',
  'js/vendor/qrcode.min.js',
  'card/coin-card-trusted-keys.js',
  'card/coin-card-trusted-key-resolution.js',
  'card/coin-card-canonical-json-v1.js',
  'card/coin-card-lifecycle-registry.js',
  'card/coin-card-lifecycle-record-verification.js',
  'card/coin-card-lifecycle-bundle-verification.js',
  'card/coin-card-lifecycle-record-selection.js',
  'card/coin-card-lifecycle-resolution.js',
  'card/coin-card-lifecycle-presentation.js',
  'card/coin-card-execution-authorization.js',
  'card/coin-card-review-projection-contract.js',
  'card/coin-card-verification.js',
  'card/card.js',
  'card/card.css',
  'card/index.html',
];

function sha256Hex(buf) {
  return 'sha256:' + createHash('sha256').update(buf).digest('hex');
}

/* ----------------------------------------------------------------
 * Canonical payload canonicalization (mirrors coin-card-verification.js)
 * ---------------------------------------------------------------- */
function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!value || typeof value !== 'object') return value;
  const canonical = {};
  Object.keys(value).sort().forEach((k) => { canonical[k] = canonicalizeValue(value[k]); });
  return canonical;
}

function canonicalizeManifestPayload(manifest) {
  const payload = {};
  Object.keys(manifest).sort().forEach((key) => {
    if (key === 'signature' || key === 'manifestHash') return;
    payload[key] = canonicalizeValue(manifest[key]);
  });
  return JSON.stringify(payload);
}

/* ----------------------------------------------------------------
 * Test trusted-keys.js builder
 * ---------------------------------------------------------------- */
function buildTestTrustedKeysJs(publicKeyJwk) {
  return [
    '(function () {',
    "  'use strict';",
    '',
    '  var publicKey = Object.freeze({',
    `    crv: ${JSON.stringify(publicKeyJwk.crv)},`,
    `    ext: ${JSON.stringify(publicKeyJwk.ext)},`,
    `    key_ops: Object.freeze(${JSON.stringify(publicKeyJwk.key_ops)}),`,
    `    kty: ${JSON.stringify(publicKeyJwk.kty)},`,
    `    x: ${JSON.stringify(publicKeyJwk.x)},`,
    `    y: ${JSON.stringify(publicKeyJwk.y)},`,
    '  });',
    '',
    '  var record = Object.freeze({',
    "    algorithm: 'ECDSA_P256_SHA256',",
    "    environment: 'production',",
    "    issuerId: 'implicitex',",
    "    keyId: 'cc-geo-test-key',",
    '    publicKey: publicKey,',
    '    revocationPolicy: null,',
    '    revocationReason: null,',
    '    revokedAt: null,',
    "    schemaVersion: 'coin-card-trusted-key-record.v1',",
    "    status: 'ACTIVE',",
    '    successorKeyId: null,',
    "    usage: Object.freeze(['coin-card-manifest-signing']),",
    "    validFrom: '2026-01-01T00:00:00.000Z',",
    '    validUntil: null,',
    '  });',
    '',
    '  var trustedPublicKeys = Object.create(null);',
    "  Object.defineProperty(trustedPublicKeys, 'cc-geo-test-key', {",
    '    value: record,',
    '    writable: false,',
    '    enumerable: true,',
    '    configurable: false,',
    '  });',
    '  Object.freeze(trustedPublicKeys);',
    '',
    "  Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', {",
    '    value: trustedPublicKeys,',
    '    writable: false,',
    '    enumerable: true,',
    '    configurable: false,',
    '  });',
    '})();',
    '',
  ].join('\n');
}

async function buildSignedManifest(privateKey, testTrustedKeysContent) {
  const assetsSorted = [...PROTECTED_ASSET_PATHS].sort();
  const assets = assetsSorted.map((assetPath) => {
    let buf;
    if (assetPath === 'card/coin-card-trusted-keys.js') {
      buf = Buffer.from(testTrustedKeysContent, 'utf8');
    } else {
      buf = readFileSync(path.join(publicDir, assetPath));
    }
    return { bytes: buf.length, path: assetPath, sha256: sha256Hex(buf) };
  });

  const manifest = {
    assets,
    buildVersion: 'geo-browser-test',
    coinCardVersion: 'coin-card.v1',
    environment: 'production',
    issuerId: 'implicitex',
    keyId: 'cc-geo-test-key',
    layoutVersion: 'coin-card-layout.v1',
    manifestHash: 'sha256:placeholder',
    schemaVersion: 'coin-card-manifest.v1',
    scope: 'coin-card-runtime-package',
    signedAt: '2026-07-01T00:00:00.000Z',
    signature: { algorithm: 'ECDSA', keyId: 'cc-geo-test-key', mode: 'signed-p256-v1', value: '' },
  };

  const payload = canonicalizeManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(payload);
  const sigBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    payloadBytes,
  );
  manifest.signature.value = Buffer.from(sigBytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  manifest.manifestHash = sha256Hex(Buffer.from(JSON.stringify(manifest)));
  return manifest;
}

/* ----------------------------------------------------------------
 * HTTP server
 * ---------------------------------------------------------------- */
function startHttpServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      let urlPath = req.url.split('?')[0];
      const tryPaths = [urlPath];
      if (urlPath.startsWith('/card/js/') || urlPath.startsWith('/card/card/')) {
        tryPaths.push(urlPath.slice('/card'.length));
      }

      for (const tryPath of tryPaths) {
        const filePath = path.join(publicDir, tryPath);
        try {
          const content = readFileSync(filePath);
          const ext = path.extname(tryPath);
          const contentTypes = {
            '.html': 'text/html', '.js': 'application/javascript',
            '.css': 'text/css', '.json': 'application/json',
            '.svg': 'image/svg+xml', '.png': 'image/png',
          };
          res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
          res.end(content);
          return;
        } catch (_) { /* try next */ }
      }

      if (urlPath.startsWith('/card/') || urlPath === '/card') {
        try {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(readFileSync(path.join(publicDir, 'card/index.html')));
          return;
        } catch (_) { /* fall through */ }
      }

      res.writeHead(404); res.end('Not found');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

/* ----------------------------------------------------------------
 * Test state
 * ---------------------------------------------------------------- */
let browser;
let serverPort;
let serverUrl;
let httpServer;
let signedManifest;
let testTrustedKeysJs;

/* ----------------------------------------------------------------
 * Registry record for geometry test card
 * ---------------------------------------------------------------- */
const GEO_REGISTRY_RECORD = {
  schema: 'implicitex.coincard.v1',
  cardId: 'geo-test',
  recipient: '0x0000000000000000000000000000000000000001',
  chainId: '80002',
  chainName: 'Polygon Amoy',
  token: 'USDC',
  feeBps: 100,
  status: 'active',
  displayName: 'Geometry Test Card',
  amountMode: 'sender_input',
  allowedParentOrigins: ['*'],
  lockedAmount: null,
  owner: null,
};

/* ----------------------------------------------------------------
 * Page setup helper: inject manifest + trusted keys, navigate to CONFIGURE.
 * ---------------------------------------------------------------- */
async function openCardPage(page, cardId) {
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = request.url();
    const urlPath = new URL(url).pathname;

    if (urlPath === '/card/coin-card-trusted-keys.js' ||
        urlPath === '/card/card/coin-card-trusted-keys.js') {
      request.respond({
        status: 200,
        headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' },
        body: testTrustedKeysJs,
      });
      return;
    }

    if (urlPath === '/card/coin-card-manifest.json') {
      request.respond({
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(signedManifest),
      });
      return;
    }

    if (urlPath === `/registry/coincards/${cardId}.json`) {
      request.respond({
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ...GEO_REGISTRY_RECORD, cardId }),
      });
      return;
    }

    request.continue();
  });

  await page.goto(`${serverUrl}/card/${cardId}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });
  return page;
}

/* ----------------------------------------------------------------
 * Force data-state and wait for CSS repaint
 * ---------------------------------------------------------------- */
async function forceState(page, state) {
  await page.evaluate((s) => {
    document.getElementById('ccFrame').dataset.state = s;
  }, state);
  /* Allow one rAF cycle for CSS repaints. */
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/* ----------------------------------------------------------------
 * Measure expanded card exterior (border-box)
 * ---------------------------------------------------------------- */
function measureCard(page) {
  return page.evaluate(() => {
    const card = document.getElementById('ccCard');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { width: Math.round(r.width), height: Math.round(r.height) };
  });
}

/* ----------------------------------------------------------------
 * Measure collapsed acceptance mark exterior (border-box)
 * ---------------------------------------------------------------- */
function measureCollapsedMark(page) {
  return page.evaluate(() => {
    const mark = document.getElementById('ccCollapsedMark');
    if (!mark) return null;
    const s = window.getComputedStyle(mark);
    if (s.display === 'none') return { visible: false };
    const r = mark.getBoundingClientRect();
    return { visible: true, width: Math.round(r.width), height: Math.round(r.height) };
  });
}

/* ----------------------------------------------------------------
 * Assertion helper with ±tolerance
 * ---------------------------------------------------------------- */
function assertDim(label, actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance} px, got ${actual} px`,
  );
}

/* ================================================================
 * Test suite
 * ================================================================ */
describe('Coin Card geometry — browser acceptance tests', async () => {

  before(async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
    );
    const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    testTrustedKeysJs = buildTestTrustedKeysJs(publicKeyJwk);
    signedManifest = await buildSignedManifest(keyPair.privateKey, testTrustedKeysJs);

    httpServer = await startHttpServer();
    serverPort = httpServer.address().port;
    serverUrl  = `http://127.0.0.1:${serverPort}`;

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (httpServer) httpServer.close();
  });

  /* ----------------------------------------------------------------
   * D1: Desktop — CONFIGURE state exterior is 460 × 286
   * ---------------------------------------------------------------- */
  test('D1 — desktop CONFIGURE state: expanded card exterior is 460 × 286', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');

      const dims = await measureCard(page);
      assert.ok(dims, 'card element must be present');
      assertDim('card width (CONFIGURE)', dims.width, GEO.expanded.width, GEO.tolerance);
      assertDim('card height (CONFIGURE)', dims.height, GEO.expanded.height, GEO.tolerance);
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * D2: Desktop — REVIEW state exterior is 460 × 286
   * ---------------------------------------------------------------- */
  test('D2 — desktop REVIEW state: expanded card exterior is 460 × 286', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');
      await forceState(page, 'REVIEW');

      const dims = await measureCard(page);
      assert.ok(dims, 'card element must be present');
      assertDim('card width (REVIEW)', dims.width, GEO.expanded.width, GEO.tolerance);
      assertDim('card height (REVIEW)', dims.height, GEO.expanded.height, GEO.tolerance);
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * D3: No height drift between CONFIGURE and REVIEW
   * ---------------------------------------------------------------- */
  test('D3 — height is identical between CONFIGURE and REVIEW states (no drift)', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');

      const configureH = (await measureCard(page)).height;
      await forceState(page, 'REVIEW');
      const reviewH = (await measureCard(page)).height;

      assert.equal(
        Math.abs(configureH - reviewH),
        0,
        `Card height must not change between CONFIGURE (${configureH} px) and REVIEW (${reviewH} px)`,
      );
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * D4: Collapsed acceptance mark is 216 × 44
   * ---------------------------------------------------------------- */
  test('D4 — desktop COLLAPSED state: acceptance mark exterior is 216 × 44', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');
      await forceState(page, 'COLLAPSED');

      const mark = await measureCollapsedMark(page);
      assert.ok(mark, '#ccCollapsedMark element must be present in DOM');
      assert.ok(mark.visible, '#ccCollapsedMark must be visible in COLLAPSED state');
      assertDim('collapsed mark width', mark.width, GEO.collapsed.width, GEO.tolerance);
      assertDim('collapsed mark height', mark.height, GEO.collapsed.height, GEO.tolerance);
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * D5: Review content does not escape card bounds
   * ---------------------------------------------------------------- */
  test('D5 — REVIEW content does not escape card exterior bounds', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');
      await forceState(page, 'REVIEW');

      const result = await page.evaluate(() => {
        const card = document.getElementById('ccCard');
        const cardR = card.getBoundingClientRect();
        const body = document.getElementById('ccBodyReview');
        if (!body) return { ok: true };

        /* Check all visible child elements of the review body are contained. */
        const children = Array.from(body.querySelectorAll('*'));
        const overflows = [];
        for (const child of children) {
          const s = window.getComputedStyle(child);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          const r = child.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          /* Allow a 2px rounding tolerance. */
          if (r.bottom > cardR.bottom + 2 || r.right > cardR.right + 2) {
            overflows.push({
              id: child.id || child.className,
              bottom: r.bottom, cardBottom: cardR.bottom,
              right: r.right, cardRight: cardR.right,
            });
          }
        }
        return { ok: overflows.length === 0, overflows };
      });

      assert.ok(
        result.ok,
        `REVIEW content must not escape card bounds; overflows: ${JSON.stringify(result.overflows)}`,
      );
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * D6: Primary chip and Edit Payment do not overlap
   * ---------------------------------------------------------------- */
  test('D6 — primary chip (#ccChip) and Edit Payment button do not overlap in REVIEW', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');
      await forceState(page, 'REVIEW');

      const overlap = await page.evaluate(() => {
        function rectsOverlap(a, b) {
          return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        }
        const chip = document.getElementById('ccChip');
        const editBtn = document.getElementById('ccEditPayment');
        if (!chip || !editBtn) return false; /* one is absent — no overlap possible */
        const chipR = chip.getBoundingClientRect();
        const editR = editBtn.getBoundingClientRect();
        /* Only check overlap if both are visible. */
        if (chipR.width === 0 || editR.width === 0) return false;
        return rectsOverlap(chipR, editR);
      });

      assert.ok(!overlap, '#ccChip and #ccEditPayment must not overlap in REVIEW state');
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * D7: QR panel does not overlap card controls
   * ---------------------------------------------------------------- */
  test('D7 — QR panel does not overlap card controls when active', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await openCardPage(page, 'geo-test');

      /* Wait for QR library injection then open the QR panel. */
      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      const overlap = await page.evaluate(() => {
        /* When QR is active, the card is hidden (display:none). No overlap is possible. */
        const card = document.getElementById('ccCard');
        const qrPanel = document.getElementById('ccQrPanel');
        if (!card || !qrPanel) return false;
        const cardStyle = window.getComputedStyle(card);
        /* If card is hidden, QR panel cannot overlap it. */
        if (cardStyle.display === 'none') return false;
        function rectsOverlap(a, b) {
          return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        }
        const cardR = card.getBoundingClientRect();
        const qrR = qrPanel.getBoundingClientRect();
        return rectsOverlap(cardR, qrR);
      });

      assert.ok(!overlap, 'QR panel must not overlap card controls when active');
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * M1: Mobile — no horizontal overflow at 390 px
   * ---------------------------------------------------------------- */
  test('M1 — mobile (390×844): no page-level horizontal overflow', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      await openCardPage(page, 'geo-test');

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(
        scrollWidth <= 390,
        `scrollWidth must be ≤ 390 px at 390 px viewport; got ${scrollWidth} px`,
      );
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * M2: Mobile — card remains within viewport bounds
   * ---------------------------------------------------------------- */
  test('M2 — mobile (390×844): card remains within viewport bounds', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      await openCardPage(page, 'geo-test');

      const result = await page.evaluate(() => {
        const card = document.getElementById('ccCard');
        if (!card) return { present: false };
        const r = card.getBoundingClientRect();
        /* Card should not extend beyond the viewport width.
         * Allow for frame centering — just check right edge. */
        return {
          present: true,
          right: r.right,
          viewportWidth: window.innerWidth,
          overflows: r.right > window.innerWidth + 2,
        };
      });

      assert.ok(result.present, '#ccCard must be present on mobile');
      assert.ok(
        !result.overflows,
        `Card right edge (${result.right} px) must not exceed viewport width (${result.viewportWidth} px)`,
      );
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * M3: Mobile — Review content and Edit Payment reachable
   * ---------------------------------------------------------------- */
  test('M3 — mobile (390×844): Review content and Edit Payment action reachable', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      await openCardPage(page, 'geo-test');
      await forceState(page, 'REVIEW');

      const result = await page.evaluate(() => {
        const editBtn = document.getElementById('ccEditPayment');
        const reviewAmount = document.getElementById('ccReviewAmount');
        if (!editBtn || !reviewAmount) return { editPresent: false, amountPresent: false };

        const editR = editBtn.getBoundingClientRect();
        const amountR = reviewAmount.getBoundingClientRect();
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;

        return {
          editPresent: true,
          amountPresent: true,
          /* "reachable" = within the scrollable page — can be scrolled into view.
           * In this context (fixed card), both elements should be within the card
           * which must fit in viewport. */
          editReachable: editR.width > 0 && editR.height > 0 && editR.right <= viewW + 2,
          amountReachable: amountR.width > 0 && amountR.height > 0 && amountR.right <= viewW + 2,
        };
      });

      assert.ok(result.editPresent, '#ccEditPayment must be present');
      assert.ok(result.amountPresent, '#ccReviewAmount must be present');
      assert.ok(result.editReachable, 'Edit Payment must be reachable within viewport on mobile');
      assert.ok(result.amountReachable, 'Review amount must be reachable within viewport on mobile');
    } finally {
      await page.close();
    }
  });

});
