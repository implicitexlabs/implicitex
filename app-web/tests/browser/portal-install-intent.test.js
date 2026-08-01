'use strict';

/**
 * portal-install-intent.test.js
 *
 * Verifies that loading /portal-index.html?install=1 activates the install
 * surface correctly without automatically invoking the browser prompt.
 *
 * Assertions:
 *   1. The footer install button (#portalFooterInstallBtn) carries the
 *      data-install-intent attribute (confirming the JS reached it).
 *   2. The browser install prompt was NOT automatically invoked.
 *   3. On an iOS user-agent (no beforeinstallprompt), a platform-specific
 *      instruction note (#portalFooterInstallNote) appears next to the button.
 */

const assert    = require('node:assert/strict');
const fs        = require('node:fs');
const http      = require('node:http');
const path      = require('node:path');
const { test }  = require('node:test');
const puppeteer = require('puppeteer');

const appRoot    = path.resolve(__dirname, '../..');
const publicRoot = path.join(appRoot, 'frontend/public');

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

function startServer() {
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

// ─── Tests ────────────────────────────────────────────────────────────────────

test('?install=1 — footer install button emphasised, no auto-prompt (desktop)', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    // Track whether the install prompt was invoked automatically.
    await page.evaluateOnNewDocument(() => {
      window.__installPromptInvoked = false;
      try { localStorage.setItem('implicitex-theme', 'dark'); } catch (_) {}
    });

    // Intercept and track beforeinstallprompt so we can assert it was not
    // automatically invoked. We do NOT suppress the event — the JS under test
    // captures it via addEventListener and we want that to work normally.
    await page.evaluateOnNewDocument(() => {
      const _addEventListener = window.addEventListener.bind(window);
      window.addEventListener = function (type, handler, options) {
        if (type === 'beforeinstallprompt') {
          const wrappedHandler = function (e) {
            // Track if .prompt() is called during page initialisation.
            const _prompt = e.prompt.bind(e);
            e.prompt = function () {
              window.__installPromptInvoked = true;
              return _prompt();
            };
            return handler(e);
          };
          return _addEventListener(type, wrappedHandler, options);
        }
        return _addEventListener(type, handler, options);
      };
    });

    await page.goto(`${baseUrl}/portal-index.html?install=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('#modules', { timeout: 15000 });
    // Give the 60ms setTimeout in handleInstallIntent a comfortable margin.
    await new Promise((r) => setTimeout(r, 300));

    const result = await page.evaluate(() => {
      const footerBtn = document.getElementById('portalFooterInstallBtn');

      return {
        btnHasIntent:      footerBtn && footerBtn.hasAttribute('data-install-intent'),
        btnFocused:        footerBtn && document.activeElement === footerBtn,
        autoPromptInvoked: window.__installPromptInvoked === true,
      };
    });

    assert.ok(result.btnHasIntent, 'footer install button must carry data-install-intent attribute on ?install=1');
    assert.ok(
      result.btnHasIntent || result.btnFocused,
      'footer install button must be emphasised (data-install-intent) or focused'
    );
    assert.equal(result.autoPromptInvoked, false, 'browser install prompt must NOT be invoked automatically');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('?install=1 — iOS user-agent shows instruction note without auto-prompt', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();

    // Emulate iPhone UA — this puts portal-install.js into ios-safari mode.
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    );
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });

    await page.evaluateOnNewDocument(() => {
      window.__installPromptInvoked = false;
      // iOS Safari does not fire beforeinstallprompt — no need to intercept.
      try { localStorage.setItem('implicitex-theme', 'dark'); } catch (_) {}
    });

    await page.goto(`${baseUrl}/portal-index.html?install=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('#modules', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 300));

    const result = await page.evaluate(() => {
      const footerBtn = document.getElementById('portalFooterInstallBtn');
      const note      = document.getElementById('portalFooterInstallNote');

      return {
        btnHasIntent:      footerBtn && footerBtn.hasAttribute('data-install-intent'),
        notePresent:       note !== null,
        noteText:          note ? note.textContent.trim() : '',
        autoPromptInvoked: window.__installPromptInvoked === true,
      };
    });

    assert.ok(result.btnHasIntent,           'footer install button must carry data-install-intent on iOS ?install=1');
    assert.ok(result.notePresent,            'platform instruction note (#portalFooterInstallNote) must appear on iOS');
    assert.ok(result.noteText.length > 0,    'instruction note must have non-empty text');
    assert.equal(result.autoPromptInvoked, false, 'browser install prompt must NOT be invoked on iOS');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('?install=1 absent — install control has no data-install-intent (no false activation)', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem('implicitex-theme', 'dark'); } catch (_) {}
    });

    // Load WITHOUT the query parameter.
    await page.goto(`${baseUrl}/portal-index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('#modules', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 200));

    const result = await page.evaluate(() => {
      const footerBtn = document.getElementById('portalFooterInstallBtn');
      const note      = document.getElementById('portalFooterInstallNote');
      return {
        btnHasIntent: footerBtn ? footerBtn.hasAttribute('data-install-intent') : false,
        notePresent:  note !== null,
      };
    });

    assert.equal(result.btnHasIntent, false, 'data-install-intent must NOT be set without ?install=1');
    assert.equal(result.notePresent,  false, 'instruction note must NOT appear without ?install=1');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
