'use strict';

/**
 * portal-coordinator-regression.test.js
 *
 * Regression guard for the portal-navigation-coordinator.js structural
 * validation change (removed positional children[] checks; retained all
 * semantic checks).
 *
 * Proves two invariants:
 *
 *   1. Happy path — valid portal-index.html with all required elements
 *      present and correctly attributed: coordinator initializes, marks
 *      itself available, and reveals the navigation bar.
 *
 *   2. Fail-closed — when a required structural element is absent (here:
 *      the primary nav element, ID "portalPrimaryNav"): coordinator catches
 *      the error, stays unavailable, and leaves the navigation bar hidden
 *      (the page is still usable — only nav switching is disabled).
 *
 * Why these two cases matter:
 *   The positional checks (children[0] === nav, children[1] === status on
 *   #modules) were removed to allow nav to live inside .portal-sticky-bar
 *   rather than as a direct child of #modules. Without a regression test,
 *   a future DOM reorganisation could break the semantic checks silently —
 *   coordinator would fail-closed and nav would never appear.
 */

const assert    = require('node:assert/strict');
const fs        = require('node:fs');
const http      = require('node:http');
const path      = require('node:path');
const { test }  = require('node:test');
const puppeteer = require('puppeteer');

const appRoot    = path.resolve(__dirname, '../..');
const publicRoot = path.join(appRoot, 'frontend/public');

// ─── Ethers stub ─────────────────────────────────────────────────────────────
// wallet.js imports ethers from the CDN. In tests we serve a stub so the page
// does not block on an external network request.

const ETHERS_STUB = `<script>
  window.ethers = {
    getAddress(a) {
      const v = String(a || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error('invalid address');
      return v.toLowerCase();
    },
    formatUnits(value, decimals) {
      const big = typeof value === 'bigint' ? value : BigInt(value);
      const scale = BigInt(10) ** BigInt(decimals || 0);
      const whole = big / scale;
      const fraction = big % scale;
      return fraction === 0n
        ? String(whole)
        : String(whole) + '.' + String(fraction).padStart(Number(decimals || 0), '0');
    },
  };
</script>\n`;

const ETHERS_CDN_RE = /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/ethers@[\d.]+\/dist\/ethers\.umd\.min\.js"[\s\S]*?<\/script>\s*/m;

// ─── Server factory ───────────────────────────────────────────────────────────

/**
 * Start a minimal static server that serves portal-index.html with an
 * optional HTML transform function applied before the response is sent.
 *
 * @param {function(string): string} [htmlTransform]
 */
function startServer(htmlTransform) {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? '/portal-index.html' : requestPath;
    const filePath = path.join(publicRoot, relativePath);

    if (!filePath.startsWith(publicRoot)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('Not found'); return;
    }

    if (path.basename(filePath) === 'portal-index.html') {
      let html = fs.readFileSync(filePath, 'utf8');
      html = html.replace(ETHERS_CDN_RE, ETHERS_STUB);
      if (htmlTransform) html = htmlTransform(html);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon',
      '.png':  'image/png',
      '.webp': 'image/webp',
      '.woff2':'font/woff2',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// ─── Shared page loader ───────────────────────────────────────────────────────

async function loadPortal(page, baseUrl) {
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('implicitex-theme', 'dark'); } catch (_) {}
  });
  await page.goto(`${baseUrl}/portal-index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  // #modules present → page rendered and inline scripts executed.
  await page.waitForSelector('#modules', { timeout: 15000 });
  // Give synchronous scripts that run immediately (like the coordinator) a
  // tick to finish. DOMContentLoaded guarantees deferred scripts have run;
  // coordinator runs synchronously on script load so no extra wait needed,
  // but a brief settled-frame wait avoids any micro-task edge cases.
  await new Promise((r) => setTimeout(r, 200));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('coordinator happy path — initializes and reveals navigation on valid DOM', async () => {
  const { server, baseUrl } = await startServer(/* no transform */);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await loadPortal(page, baseUrl);

    const result = await page.evaluate(() => {
      const nav    = document.getElementById('portalPrimaryNav');
      const status = document.getElementById('portalPrimaryNavStatus');
      const coord  = window.IX_PORTAL_NAVIGATION_COORDINATOR;

      return {
        coordinatorExists:  typeof coord !== 'undefined' && typeof coord.getStatus === 'function',
        coordinatorStatus:  coord ? coord.getStatus() : null,
        navHidden:          nav  ? nav.hasAttribute('hidden')  : null,
        statusHidden:       status ? status.hasAttribute('hidden') : null,
      };
    });

    assert.ok(result.coordinatorExists, 'IX_PORTAL_NAVIGATION_COORDINATOR must be exposed on window');
    assert.ok(result.coordinatorStatus !== null, 'getStatus() must return a value');
    assert.equal(
      result.coordinatorStatus.available,
      true,
      'coordinator must report available=true on valid DOM\n  status: ' + JSON.stringify(result.coordinatorStatus)
    );
    assert.equal(
      result.navHidden,
      false,
      'nav must NOT have hidden attribute after successful initialization'
    );
    assert.equal(
      result.statusHidden,
      true,
      'status region must be hidden when nav is working normally'
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('coordinator fail-closed — stays unavailable and leaves nav hidden when required element is missing', async () => {
  // Transform: corrupt the nav element ID so the coordinator cannot find it.
  // All other structural elements remain intact. This proves fail-closed
  // behavior is NOT triggered by a missing external API — it is triggered by
  // the specific structural validation the coordinator runs on the DOM.
  function breakNavId(html) {
    // Replace id="portalPrimaryNav" on the <nav> element only.
    // The nav buttons reference this via JS (not HTML), so only the element
    // attribute needs to be corrupted.
    return html.replace(
      /(<nav\b[^>]*)\bid="portalPrimaryNav"([^>]*>)/,
      '$1id="portalPrimaryNav-MISSING"$2'
    );
  }

  const { server, baseUrl } = await startServer(breakNavId);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();

    // Suppress console errors — the coordinator failing is expected here.
    page.on('console', () => {});

    await loadPortal(page, baseUrl);

    const result = await page.evaluate(() => {
      const navBroken  = document.getElementById('portalPrimaryNav-MISSING');
      const navCorrect = document.getElementById('portalPrimaryNav');
      const coord      = window.IX_PORTAL_NAVIGATION_COORDINATOR;

      return {
        coordinatorExists:    typeof coord !== 'undefined' && typeof coord.getStatus === 'function',
        coordinatorStatus:    coord ? coord.getStatus() : null,
        // The nav element should still be in the DOM (just with the wrong id)
        // and must retain its initial hidden attribute — coordinator never
        // called showNavigation() on it.
        brokenNavFound:       navBroken !== null,
        brokenNavHidden:      navBroken ? navBroken.hasAttribute('hidden') : null,
        // Sanity check: element with the "correct" ID must not exist
        correctNavExists:     navCorrect !== null,
      };
    });

    assert.ok(result.coordinatorExists, 'IX_PORTAL_NAVIGATION_COORDINATOR must still be exposed');
    assert.ok(result.coordinatorStatus !== null, 'getStatus() must return a value');
    assert.equal(
      result.coordinatorStatus.available,
      false,
      'coordinator must report available=false when required element is missing\n  status: ' + JSON.stringify(result.coordinatorStatus)
    );
    assert.ok(
      result.brokenNavFound,
      'the nav element (with corrupted id) must still be in the DOM'
    );
    assert.equal(
      result.brokenNavHidden,
      true,
      'nav element must retain its hidden attribute — coordinator must not have shown it'
    );
    assert.equal(
      result.correctNavExists,
      false,
      'sanity: element with id="portalPrimaryNav" must not exist in the broken fixture'
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
