/* coin-card-qr-browser.test.js
 *
 * Puppeteer browser tests for the Coin Card QR handoff V1 feature.
 * These tests exercise behaviors that can only be verified in a real browser:
 *
 *   - qrcode.min.js is NOT present as a static script on initial page load
 *   - After successful manifest verification (CONFIGURE state), qrcode.min.js
 *     is dynamically injected with the correct SRI integrity attribute
 *   - The QR panel opens and shows the canonical card URL
 *   - The QR canvas has rendered pixels after the library executes
 *   - The close button and Escape key both close the QR panel
 *   - Repeated open/close cycles do not create multiple script tags
 *   - A revoked card does not show the PRESENT CARD button
 *   - The UI renders without horizontal overflow at 375 px mobile width
 *
 * Architecture: a local HTTP server serves frontend/public/. Puppeteer
 * request interception injects:
 *   (a) A test coin-card-trusted-keys.js that registers a test P-256 key.
 *   (b) A signed test manifest whose asset hashes match the real files,
 *       except card/coin-card-trusted-keys.js whose hash reflects (a).
 *   (c) Test registry records for /registry/coincards/qr-test.json and
 *       /registry/coincards/qr-revoked.json.
 */

'use strict';

const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, describe, before, after } = require('node:test');
const puppeteer = require('puppeteer');
const jsQR = require('jsqr');

/* ----------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------- */
const appRoot   = path.resolve(__dirname, '../..');
const publicDir = path.join(appRoot, 'frontend/public');

/* ----------------------------------------------------------------
 * Protected asset paths and their real SHA-256 values (from actual files).
 * The trusted-keys hash is replaced dynamically with the test-key hash.
 * ---------------------------------------------------------------- */
const PROTECTED_ASSET_PATHS = [
  'js/ix-execution.js',
  'js/vendor/qrcode.min.js',
  'card/coin-card-trusted-keys.js',          // hash replaced in test manifest
  'card/coin-card-trusted-key-resolution.js',
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

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '/')
    .replace(/=+$/g, '');
}

/* ----------------------------------------------------------------
 * Canonical payload for signing (mirrors coin-card-verification.js)
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
 * Test state (shared across all tests in this file)
 * ---------------------------------------------------------------- */
let browser;
let serverPort;
let serverUrl;
let httpServer;
let signedManifest;
let testTrustedKeysJs;
let qrcodeMinJsSri;   // expected SRI attribute value on the injected script tag

/* ----------------------------------------------------------------
 * Setup helpers
 * ---------------------------------------------------------------- */

/* Compute SHA-256 of the test trusted-keys.js we will serve. */
function buildTestTrustedKeysJs(publicKeyJwk) {
  /* The publicKey JWK is deep-frozen inline. Arrays in the JWK (like x, y)
   * come from the extracted key and are plain values; they must appear
   * deeply frozen in the source. */
  const jwkStr = JSON.stringify(publicKeyJwk, null, 2)
    .replace(/"([^"]+)":/g, '$1:')           // remove quotes from keys (not valid JS but for readability; actually keep them for correctness)
    .split('\n').join('\n      ');

  /* Build a complete IIFE that mirrors the production coin-card-trusted-keys.js
   * structure: deeply frozen Object.create(null) dictionary. */
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
    "    keyId: 'cc-browser-test-key',",
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
    "  Object.defineProperty(trustedPublicKeys, 'cc-browser-test-key', {",
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
  /* Compute hashes of all protected assets. The trusted-keys.js hash reflects
   * the test content we will serve, not the production file.
   *
   * The manifest is package-scoped: it covers JS/CSS assets only.
   * Card identity (recipient, network, status) comes from the registry record. */
  const assetsSorted = [...PROTECTED_ASSET_PATHS].sort();
  const assets = assetsSorted.map((assetPath) => {
    let buf;
    if (assetPath === 'card/coin-card-trusted-keys.js') {
      buf = Buffer.from(testTrustedKeysContent, 'utf8');
    } else {
      buf = readFileSync(path.join(publicDir, assetPath));
    }
    return {
      bytes: buf.length,
      path: assetPath,
      sha256: sha256Hex(buf),
    };
  });

  /* Top-level fields read by buildTrustedKeyResolutionContext():
   * keyId, issuerId, environment, signedAt must appear at manifest top level
   * (not only inside signature) or the verifier returns VERIFICATION_UNAVAILABLE. */
  const manifest = {
    assets,
    buildVersion: 'browser-test',
    coinCardVersion: 'coin-card.v1',
    environment: 'production',
    issuerId: 'implicitex',
    keyId: 'cc-browser-test-key',
    layoutVersion: 'coin-card-layout.v1',
    manifestHash: 'sha256:placeholder',
    schemaVersion: 'coin-card-manifest.v1',
    scope: 'coin-card-runtime-package',
    signedAt: '2026-07-01T00:00:00.000Z',
    signature: {
      algorithm: 'ECDSA',
      keyId: 'cc-browser-test-key',
      mode: 'signed-p256-v1',
      value: '',
    },
  };

  /* Sign: canonical payload excludes signature and manifestHash. */
  const payload = canonicalizeManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(payload);
  const sigBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    payloadBytes,
  );
  manifest.signature.value = Buffer.from(sigBytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

  /* Update manifestHash after signing. */
  manifest.manifestHash = sha256Hex(Buffer.from(JSON.stringify(manifest)));

  return manifest;
}

function startHttpServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      /* CORS headers for SRI / cross-origin script loading from same origin.
       * Chromium requires CORS response headers even for same-origin requests
       * when the script element has crossorigin="anonymous". */
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let urlPath = req.url.split('?')[0];

      /* Registry endpoint for active test card. */
      if (urlPath === '/registry/coincards/qr-test.json') {
        const record = {
          schema: 'implicitex.coincard.v1',
          cardId: 'qr-test',
          recipient: '0x0000000000000000000000000000000000000001',
          chainId: '137',
          chainName: 'Polygon',
          token: 'USDC',
          feeBps: 100,
          status: 'active',
          displayName: 'QR Test Card',
          amountMode: 'sender_input',
          allowedParentOrigins: ['*'],
          lockedAmount: null,
          owner: null,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(record));
        return;
      }

      /* Registry endpoint for revoked test card. */
      if (urlPath === '/registry/coincards/qr-revoked.json') {
        const record = {
          schema: 'implicitex.coincard.v1',
          cardId: 'qr-revoked',
          recipient: '0x0000000000000000000000000000000000000002',
          chainId: '137',
          chainName: 'Polygon',
          token: 'USDC',
          feeBps: 100,
          status: 'revoked',
          displayName: 'QR Revoked Card',
          amountMode: 'sender_input',
          allowedParentOrigins: ['*'],
          lockedAmount: null,
          owner: null,
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(record));
        return;
      }

      /* Serve static files from frontend/public/.
       * Path remapping: the verifier fetches assets relative to the page URL
       * /card/qr-test, so e.g. fetch('js/ix-execution.js') resolves to
       * /card/js/ix-execution.js. We strip /card/ from such paths and retry. */
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
            '.html': 'text/html',
            '.js':   'application/javascript',
            '.css':  'text/css',
            '.json': 'application/json',
            '.svg':  'image/svg+xml',
            '.png':  'image/png',
          };
          res.writeHead(200, {
            'Content-Type': contentTypes[ext] || 'application/octet-stream',
          });
          res.end(content);
          return;
        } catch (_) {
          /* continue to next tryPath */
        }
      }

      /* For /card/** paths not found as static files, serve card/index.html
       * (Firebase rewrite behaviour). */
      if (urlPath.startsWith('/card/') || urlPath === '/card') {
        try {
          const indexContent = readFileSync(path.join(publicDir, 'card/index.html'));
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexContent);
          return;
        } catch (_) {
          /* fall through to 404 */
        }
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
    server.on('error', reject);
  });
}

/* ----------------------------------------------------------------
 * Per-page test helper: sets up request interception and navigates.
 * Returns the page, already at CONFIGURE state (or the specified data-state).
 * ---------------------------------------------------------------- */
async function openCardPage(page, cardId, targetState) {
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = request.url();
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname;

    /* (a) Inject test trusted-keys.js for script tag load AND
     *     for the asset-verification fetch that resolves to /card/card/... */
    if (urlPath === '/card/coin-card-trusted-keys.js' ||
        urlPath === '/card/card/coin-card-trusted-keys.js') {
      request.respond({
        status: 200,
        headers: {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
        },
        body: testTrustedKeysJs,
      });
      return;
    }

    /* (b) Inject the signed test manifest.
     * The package manifest is route-independent: the same manifest serves all card routes.
     * Card identity (recipient, status) comes from the registry record, not the manifest. */
    if (urlPath === '/card/coin-card-manifest.json') {
      request.respond({
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(signedManifest),
      });
      return;
    }

    /* All other requests pass through to the local HTTP server. */
    request.continue();
  });

  const target = targetState || (cardId === 'qr-revoked' ? 'REVOKED' : 'CONFIGURE');
  await page.goto(`${serverUrl}/card/${cardId}`, { waitUntil: 'networkidle0', timeout: 30000 });

  /* Wait for the frame to reach the expected state. */
  await page.waitForSelector(`#ccFrame[data-state="${target}"]`, { timeout: 15000 });
  return page;
}

/* ----------------------------------------------------------------
 * Test suite
 * ---------------------------------------------------------------- */
describe('Coin Card QR handoff — browser tests', async () => {

  /* ---- Setup ---- */
  before(async () => {
    /* Generate a P-256 test key pair. */
    const keyPair = await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const publicKeyJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);

    /* Build the test trusted-keys.js content. */
    testTrustedKeysJs = buildTestTrustedKeysJs(publicKeyJwk);

    /* Build the single package-scoped signed manifest (shared by all card routes). */
    signedManifest = await buildSignedManifest(keyPair.privateKey, testTrustedKeysJs);

    /* Compute the expected SRI value for the qrcode.min.js script tag.
     * card.js: attestation.sha256 → hex → bytes → base64 → 'sha256-' + b64 */
    const qrcodeHex = signedManifest.assets.find(
      (a) => a.path === 'js/vendor/qrcode.min.js',
    ).sha256.slice('sha256:'.length);
    qrcodeMinJsSri = 'sha256-' + Buffer.from(qrcodeHex, 'hex').toString('base64');

    /* Start the static HTTP server. */
    httpServer = await startHttpServer();
    serverPort = httpServer.address().port;
    serverUrl  = `http://127.0.0.1:${serverPort}`;

    /* Launch Puppeteer browser. */
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (httpServer) httpServer.close();
  });

  /* ---- Tests ---- */

  test('qrcode.min.js injection is ordered after CONFIGURE — deterministic gate proof', async () => {
    /* Prove ordering deterministically by holding the manifest response until
     * DOMContentLoaded fires. At that point, verification has not yet completed
     * (the response is still held), so no qrcode <script> element can exist.
     * After releasing the manifest, CONFIGURE is reached and injection occurs. */
    const page = await browser.newPage();
    try {
      let releaseManifest;
      const manifestGate = new Promise((resolve) => { releaseManifest = resolve; });
      let manifestHeld = true;

      await page.setRequestInterception(true);

      page.on('request', async (request) => {
        const urlPath = new URL(request.url()).pathname;
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
          /* Hold until explicitly released — pauses verification pipeline. */
          if (manifestHeld) await manifestGate;
          request.respond({
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(signedManifest),
          });
          return;
        }
        request.continue();
      });

      /* Navigate and stop at DOMContentLoaded — manifest response is still held. */
      await page.goto(`${serverUrl}/card/qr-test`, { waitUntil: 'domcontentloaded', timeout: 15000 });

      /* At DOMContentLoaded with manifest still pending: no qrcode script must exist. */
      const scriptWhileManifestPending = await page.evaluate(
        () => !!document.querySelector('script[src*="qrcode.min.js"]'),
      );
      assert.equal(
        scriptWhileManifestPending,
        false,
        'qrcode <script> must be absent while manifest response is still pending',
      );

      /* Release the manifest -> verification completes -> CONFIGURE -> injection. */
      manifestHeld = false;
      releaseManifest();

      await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });
      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      const scriptAfterVerified = await page.evaluate(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
      );
      assert.equal(
        scriptAfterVerified,
        true,
        'qrcode <script> must be present after CONFIGURE — injection is ordered after gate',
      );
    } finally {
      await page.close();
    }
  });

  test('qrcode.min.js is dynamically injected into <head> after CONFIGURE state', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      /* Wait for the qrcode script to be injected (state machine reaches READY). */
      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      const scriptAttrs = await page.$eval(
        'script[src="/js/vendor/qrcode.min.js"]',
        (el) => ({
          src:         el.src,
          integrity:   el.integrity,
          crossOrigin: el.crossOrigin,
          parent:      el.parentElement && el.parentElement.tagName,
        }),
      );

      assert.ok(scriptAttrs.src.endsWith('/js/vendor/qrcode.min.js'),
        'injected script src must point to /js/vendor/qrcode.min.js');
      assert.equal(scriptAttrs.integrity, qrcodeMinJsSri,
        'injected script integrity must match SRI encoding of verified hash');
      assert.equal(scriptAttrs.crossOrigin, 'anonymous',
        'injected script must use crossOrigin=anonymous for SRI');
      assert.equal(scriptAttrs.parent, 'HEAD',
        'injected script must be appended to <head>');
    } finally {
      await page.close();
    }
  });

  test('only one qrcode.min.js script tag is injected even after multiple open/close cycles', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      /* Wait for QR library to load. */
      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      /* Open and close the QR panel three times. */
      for (let i = 0; i < 3; i++) {
        await page.click('#ccReceiveBtn');
        await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });
        await page.click('#ccQrClose');
        await page.waitForFunction(
          () => !document.getElementById('ccFrame').classList.contains('cc-qr-active'),
          { timeout: 5000 },
        );
      }

      /* Exactly one qrcode script tag in the DOM — idempotency invariant. */
      const count = await page.$$eval(
        'script[src="/js/vendor/qrcode.min.js"]',
        (els) => els.length,
      );
      assert.equal(count, 1, 'exactly one qrcode script tag must exist after repeated opens');
    } finally {
      await page.close();
    }
  });

  test('PRESENT CARD button opens the QR panel', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      /* Wait for QR library. */
      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      const panelActiveBefore = await page.$eval(
        '#ccFrame',
        (el) => el.classList.contains('cc-qr-active'),
      );
      assert.ok(!panelActiveBefore, 'QR panel must not be active before button click');

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      const panelActiveAfter = await page.$eval(
        '#ccFrame',
        (el) => el.classList.contains('cc-qr-active'),
      );
      assert.ok(panelActiveAfter, 'QR panel must be active after PRESENT CARD click');
    } finally {
      await page.close();
    }
  });

  test('ccQrUrl displays the canonical card URL when the QR panel is open', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Wait for the URL text to appear (generateQR populates it). */
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('/card/qr-test');
        },
        { timeout: 5000 },
      );

      const urlText = await page.$eval('#ccQrUrl', (el) => el.textContent.trim());
      assert.ok(
        urlText.endsWith('/card/qr-test'),
        `ccQrUrl must end with /card/qr-test; got "${urlText}"`,
      );
      assert.ok(
        !urlText.includes('requestAmount') && !urlText.includes('amount='),
        'QR URL must not contain amount parameters',
      );
      assert.ok(
        !urlText.includes('0x') && !urlText.includes('recipient'),
        'QR URL must not contain wallet address or recipient field',
      );
    } finally {
      await page.close();
    }
  });

  test('QR canvas has rendered pixels after the library loads', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Wait for QR URL text as a proxy for generateQR() having run. */
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('/card/');
        },
        { timeout: 5000 },
      );

      /* Sample the canvas: at least some pixels must be non-white. */
      const hasNonWhitePixels = await page.evaluate(() => {
        const canvas = document.getElementById('ccQrCanvas');
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) return true;
        }
        return false;
      });

      assert.ok(hasNonWhitePixels, 'QR canvas must have non-white pixels after rendering');
    } finally {
      await page.close();
    }
  });

  test('close button removes cc-qr-active class and hides the QR panel', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      await page.click('#ccQrClose');

      await page.waitForFunction(
        () => !document.getElementById('ccFrame').classList.contains('cc-qr-active'),
        { timeout: 5000 },
      );

      const isActive = await page.$eval(
        '#ccFrame',
        (el) => el.classList.contains('cc-qr-active'),
      );
      assert.ok(!isActive, 'cc-qr-active must be removed after close button click');
    } finally {
      await page.close();
    }
  });

  test('Escape key closes the QR panel', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Press Escape. */
      await page.keyboard.press('Escape');

      await page.waitForFunction(
        () => !document.getElementById('ccFrame').classList.contains('cc-qr-active'),
        { timeout: 5000 },
      );

      const isActive = await page.$eval(
        '#ccFrame',
        (el) => el.classList.contains('cc-qr-active'),
      );
      assert.ok(!isActive, 'cc-qr-active must be removed after Escape key press');
    } finally {
      await page.close();
    }
  });

  test('a revoked card does not show the PRESENT CARD button', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-revoked');

      /* For revoked cards, the page shows REVOKED state and hides the receive zone. */
      const state = await page.$eval('#ccFrame', (el) => el.dataset.state);
      assert.equal(state, 'REVOKED', 'revoked card must reach REVOKED state');

      const receiveZoneVisible = await page.$eval(
        '#ccReceiveZone',
        /* The receive zone must not be visible — CSS hides it in REVOKED state. */
        (el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
        },
      );
      assert.ok(!receiveZoneVisible, 'PRESENT CARD button must not be visible on a revoked card');
    } finally {
      await page.close();
    }
  });

  test('UI renders without horizontal overflow at 375 px mobile viewport width', async () => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      /* Open the QR panel to test it at mobile width. */
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      assert.ok(!hasOverflow, 'page must not have horizontal overflow at 375 px mobile width');
    } finally {
      await page.close();
    }
  });

  test('QR panel canvas is restored after close and re-open', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      /* First open. */
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('/card/');
        },
        { timeout: 5000 },
      );

      /* Close. */
      await page.click('#ccQrClose');
      await page.waitForFunction(
        () => !document.getElementById('ccFrame').classList.contains('cc-qr-active'),
        { timeout: 5000 },
      );

      /* Re-open: canvas must still be visible (not hidden by renderQrFailed). */
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      const canvasDisplay = await page.$eval(
        '#ccQrCanvas',
        (el) => window.getComputedStyle(el).display,
      );
      assert.notEqual(canvasDisplay, 'none', 'canvas must be visible after re-opening QR panel');
    } finally {
      await page.close();
    }
  });

  test('QR load failure produces no unhandledrejection event — controlled failure state', async () => {
    /* A failed QR library load is a controlled product state (FAILED → "QR unavailable"),
     * not an uncaught program error. The cached promise rejection must be consumed at
     * every call site so no unhandledrejection event fires to the browser console. */
    const page = await browser.newPage();
    try {
      /* Inject rejection tracker before page navigates. */
      await page.evaluateOnNewDocument(() => {
        window.__unhandledRejections = [];
        window.addEventListener('unhandledrejection', (e) => {
          window.__unhandledRejections.push(
            (e.reason && e.reason.message) || String(e.reason),
          );
        });
      });

      await page.setRequestInterception(true);

      page.on('request', (request) => {
        const urlPath = new URL(request.url()).pathname;
        /* Abort qrcode to trigger a controlled FAILED state. */
        if (urlPath === '/js/vendor/qrcode.min.js' && request.resourceType() === 'script') {
          request.abort('failed');
          return;
        }
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
        request.continue();
      });

      await page.goto(`${serverUrl}/card/qr-test`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });

      /* Open the QR panel so the failure path runs. */
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Wait for the failure state to settle. */
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('QR unavailable');
        },
        { timeout: 10000 },
      );

      /* Allow the microtask queue to drain so any unhandled rejection would have fired. */
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));

      const rejections = await page.evaluate(() => window.__unhandledRejections);
      assert.equal(
        rejections.length,
        0,
        `No unhandledrejection must fire on QR load failure; got: ${JSON.stringify(rejections)}`,
      );
    } finally {
      await page.close();
    }
  });

  test('SRI/network failure on qrcode.min.js shows "QR unavailable" in the QR panel', async () => {
    /* Simulate a network failure on qrcode.min.js. The UI must degrade gracefully
     * with "QR unavailable" text rather than a blank panel or thrown error. */
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);

      page.on('request', (request) => {
        const urlPath = new URL(request.url()).pathname;

        /* Block qrcode.min.js — simulate network failure. */
        if (urlPath === '/js/vendor/qrcode.min.js' && request.resourceType() === 'script') {
          request.abort('failed');
          return;
        }

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

        request.continue();
      });

      await page.goto(`${serverUrl}/card/qr-test`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });

      /* Open the QR panel — qrcode.min.js injection will fail. */
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Wait for the failure message to appear. */
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('QR unavailable');
        },
        { timeout: 10000 },
      );

      const urlText = await page.$eval('#ccQrUrl', (el) => el.textContent.trim());
      assert.ok(
        urlText.includes('QR unavailable'),
        `#ccQrUrl must show "QR unavailable" on script failure; got "${urlText}"`,
      );

      /* Canvas must be hidden on failure. */
      const canvasDisplay = await page.$eval(
        '#ccQrCanvas',
        (el) => window.getComputedStyle(el).display,
      );
      assert.equal(canvasDisplay, 'none', 'canvas must be hidden when QR library fails to load');
    } finally {
      await page.close();
    }
  });

  test('revoked card never injects qrcode.min.js into the DOM', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-revoked');

      /* Wait for revoked state to settle. */
      const state = await page.$eval('#ccFrame', (el) => el.dataset.state);
      assert.equal(state, 'REVOKED');

      /* Allow any pending async to complete, then confirm no script was injected. */
      await new Promise((r) => setTimeout(r, 500));

      const qrcodeScriptCount = await page.$$eval(
        'script[src="/js/vendor/qrcode.min.js"]',
        (els) => els.length,
      );
      assert.equal(
        qrcodeScriptCount,
        0,
        'qrcode.min.js must not be injected for a revoked card',
      );
    } finally {
      await page.close();
    }
  });

  test('focus returns to PRESENT CARD button after closing QR panel with close button', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      await page.click('#ccQrClose');
      await page.waitForFunction(
        () => !document.getElementById('ccFrame').classList.contains('cc-qr-active'),
        { timeout: 5000 },
      );

      const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
      assert.equal(focusedId, 'ccReceiveBtn',
        'focus must return to #ccReceiveBtn after closing QR panel with close button');
    } finally {
      await page.close();
    }
  });

  test('focus returns to PRESENT CARD button after closing QR panel with Escape', async () => {
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.getElementById('ccFrame').classList.contains('cc-qr-active'),
        { timeout: 5000 },
      );

      const focusedId = await page.evaluate(() => document.activeElement && document.activeElement.id);
      assert.equal(focusedId, 'ccReceiveBtn',
        'focus must return to #ccReceiveBtn after pressing Escape to close QR panel');
    } finally {
      await page.close();
    }
  });

  test('QR canvas decodes to the exact canonical card URL — independent jsQR verification', async () => {
    /* Decode the rendered QR canvas with jsQR to prove the pixels encode exactly
     * {origin}/card/{cardId} with no amount, recipient, or query parameters.
     * A non-white canvas and a visible URL text string are insufficient proofs. */
    const page = await browser.newPage();
    try {
      await openCardPage(page, 'qr-test');

      await page.waitForFunction(
        () => !!document.querySelector('script[src="/js/vendor/qrcode.min.js"]'),
        { timeout: 10000 },
      );

      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Wait for ccQrUrl to be populated (proxy that generateQR() ran). */
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('/card/');
        },
        { timeout: 5000 },
      );

      /* Extract canvas ImageData: width, height, and flat RGBA pixel array. */
      const imageData = await page.evaluate(() => {
        const canvas = document.getElementById('ccQrCanvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const { width, height } = canvas;
        const data = ctx.getImageData(0, 0, width, height).data;
        /* Transfer as plain array — Puppeteer serialises Uint8ClampedArray safely. */
        return { width, height, data: Array.from(data) };
      });

      assert.ok(imageData, 'Canvas imageData must be extractable');
      assert.ok(imageData.width > 0 && imageData.height > 0, 'Canvas must have non-zero dimensions');

      /* Decode with jsQR in Node.js. */
      const pixels = new Uint8ClampedArray(imageData.data);
      const qrResult = jsQR(pixels, imageData.width, imageData.height);

      assert.ok(qrResult, 'jsQR must successfully decode a QR code from the canvas pixels');

      const decoded = qrResult.data;

      /* Must end with /card/qr-test — the canonical card URL. */
      assert.ok(
        decoded.endsWith('/card/qr-test'),
        `Decoded QR payload must end with /card/qr-test; got "${decoded}"`,
      );

      /* Must start with the test server origin (http://127.0.0.1:...). */
      assert.ok(
        decoded.startsWith('http://127.0.0.1:'),
        `Decoded QR payload must start with server origin; got "${decoded}"`,
      );

      /* Must be exactly {origin}/card/qr-test — no query params, no extra segments. */
      const url = new URL(decoded);
      assert.equal(url.pathname, '/card/qr-test',
        `Decoded QR pathname must be exactly /card/qr-test; got "${url.pathname}"`);
      assert.equal(url.search, '',
        `Decoded QR must have no query parameters; got "${url.search}"`);
      assert.equal(url.hash, '',
        `Decoded QR must have no hash fragment; got "${url.hash}"`);
    } finally {
      await page.close();
    }
  });

  test('SRI-mismatch blocks qrcode.min.js execution — altered bytes refused by browser', async () => {
    /* Serve altered qrcode.min.js bytes at the expected URL while card.js sets
     * the original SRI integrity hash on the injected <script> element.
     * The browser must block execution (SRI check fails), onerror fires,
     * loader transitions to FAILED, and "QR unavailable" appears in the UI. */
    const page = await browser.newPage();
    try {
      await page.setRequestInterception(true);

      /* Load the real file bytes, then modify them so the hash will differ. */
      const realQrcodeBytes = readFileSync(
        path.join(publicDir, 'js/vendor/qrcode.min.js'),
      );
      /* Prepend a benign comment — changes the bytes, defeats SRI. */
      const alteredBytes = Buffer.concat([
        Buffer.from('/* sri-mismatch-test */\n', 'utf8'),
        realQrcodeBytes,
      ]);

      page.on('request', (request) => {
        const urlPath = new URL(request.url()).pathname;

        /* Serve altered bytes — SRI hash will not match. */
        if (urlPath === '/js/vendor/qrcode.min.js' && request.resourceType() === 'script') {
          request.respond({
            status: 200,
            headers: {
              'Content-Type': 'application/javascript',
              'Access-Control-Allow-Origin': '*',
            },
            body: alteredBytes,
          });
          return;
        }
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
        request.continue();
      });

      await page.goto(`${serverUrl}/card/qr-test`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });

      /* Open the QR panel — script injection runs, but SRI blocks execution. */
      await page.click('#ccReceiveBtn');
      await page.waitForSelector('#ccFrame.cc-qr-active', { timeout: 5000 });

      /* Wait for failure state — onerror must fire, loader → FAILED, UI → "QR unavailable". */
      await page.waitForFunction(
        () => {
          const el = document.getElementById('ccQrUrl');
          return el && el.textContent && el.textContent.includes('QR unavailable');
        },
        { timeout: 12000 },
      );

      /* QRCode global must be undefined — the altered script was not executed. */
      const qrcodeGlobalDefined = await page.evaluate(() => typeof QRCode !== 'undefined');
      assert.equal(
        qrcodeGlobalDefined,
        false,
        'QRCode global must be undefined — SRI must have blocked execution of altered bytes',
      );

      /* Canvas must be hidden (renderQrFailed ran). */
      const canvasDisplay = await page.$eval(
        '#ccQrCanvas',
        (el) => window.getComputedStyle(el).display,
      );
      assert.equal(canvasDisplay, 'none',
        'Canvas must be hidden when SRI blocks qrcode execution');
    } finally {
      await page.close();
    }
  });

  /* ----------------------------------------------------------------
   * Execution gate — no eth_sendTransaction without authorization proof
   *
   * With an empty lifecycle registry bundle the promoted presentation
   * result is always blocked. authorizeExecution returns a non-authorized
   * result, so card.js must not call IX_EXECUTION.executeTransfer for
   * the execute-authorized action, and ethereum.request must never be
   * called with method:'eth_sendTransaction'.
   *
   * The test:
   *   1. Injects a mock window.ethereum that records all method calls and
   *      returns scripted responses for prepare-phase calls.
   *   2. Loads the card to CONFIGURE state.
   *   3. Types a valid amount and remains in CONFIGURE.
   *   4. Simulates Review payment with no lifecycle proof.
   *   5. Verifies the review path fails closed before execution.
   *   6. Verifies eth_sendTransaction was NOT called.
   * ---------------------------------------------------------------- */
  test('no eth_sendTransaction when authorization proof is absent (empty lifecycle bundle)', async () => {
    const page = await browser.newPage();
    try {
      /* Inject mock ethereum before page load — records all request calls. */
      await page.evaluateOnNewDocument(() => {
        window.__ethereumCalls = [];
        window.ethereum = {
          isMetaMask: true,
          request: function (args) {
            window.__ethereumCalls.push(args.method);
            /* prepare-phase responses */
            if (args.method === 'eth_requestAccounts') {
              return Promise.resolve(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']);
            }
            if (args.method === 'eth_chainId') {
              /* Return Polygon mainnet (chainId 137 = 0x89) */
              return Promise.resolve('0x89');
            }
            if (args.method === 'eth_accounts') {
              return Promise.resolve(['0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']);
            }
            /* eth_call for balance/allowance reads — return zero (ABI-encoded uint256 zero) */
            if (args.method === 'eth_call') {
              return Promise.resolve('0x' + '0'.repeat(64));
            }
            /* eth_sendTransaction must never be reached */
            return Promise.reject(new Error('eth_sendTransaction-should-not-be-called'));
          },
        };
      });

      /* Standard request interception for manifest and trusted keys. */
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const urlPath = new URL(req.url()).pathname;
        if (urlPath === '/card/coin-card-trusted-keys.js' ||
            urlPath === '/card/card/coin-card-trusted-keys.js') {
          req.respond({
            status: 200,
            headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' },
            body: testTrustedKeysJs,
          });
          return;
        }
        if (urlPath === '/card/coin-card-manifest.json') {
          req.respond({
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(signedManifest),
          });
          return;
        }
        req.continue();
      });

      await page.goto(`${serverUrl}/card/qr-test`, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });

      /* Enter a valid amount (10 USDC) -> still CONFIGURE until Review payment. */
      await page.focus('#ccAmountInput');
      await page.type('#ccAmountInput', '10');
      await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 5000 });

      /* Click Review payment -> missing lifecycle proof must fail closed before execution. */
      await page.click('#ccChip');
      await page.waitForFunction(
        () => {
          const frame = document.getElementById('ccFrame');
          return window.__ethereumCalls.length > 0 ||
            (frame && frame.dataset && frame.dataset.state !== 'CONFIGURE');
        },
        { timeout: 5000 },
      ).catch(() => {});

      const stateAfterReviewAction = await page.$eval('#ccFrame', (el) => el.dataset.state);
      assert.notEqual(stateAfterReviewAction, 'EXECUTING');
      assert.notEqual(stateAfterReviewAction, 'CONFIRMATION_PENDING');
      assert.notEqual(stateAfterReviewAction, 'COMPLETE');

      /* Verify eth_sendTransaction was NOT called at any point. */
      const sendTxCalled = await page.evaluate(
        () => window.__ethereumCalls.includes('eth_sendTransaction'),
      );
      assert.equal(
        sendTxCalled,
        false,
        'eth_sendTransaction must not be called when authorization proof is absent',
      );
    } finally {
      await page.close();
    }
  });

});
