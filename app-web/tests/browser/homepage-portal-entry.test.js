'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const puppeteer = require('puppeteer');

const appRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(appRoot, 'frontend/public');
const screenshotRoot = path.join('/tmp', 'implicitex-homepage-portal-entry');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.join(publicRoot, relativePath);

    if (!filePath.startsWith(publicRoot)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
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

async function openHomepage(page, baseUrl, width, height, theme) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((themeValue) => {
    try {
      localStorage.setItem('implicitex-theme', themeValue);
    } catch (error) {
      void error;
    }
  }, theme);
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#transfer');
}

async function collectHomepageState(page) {
  return page.evaluate(() => {
    const entry = document.querySelector('.portal-entry');
    const kicker = document.querySelector('.portal-entry-kicker');
    const lede = document.querySelector('.portal-entry-lede');
    const note = document.querySelector('.portal-entry-note');
    const primary = document.querySelector('.portal-entry-action--primary');
    const secondary = document.querySelector('.portal-entry-action--secondary');
    const previewSteps = Array.from(document.querySelectorAll('.portal-entry-preview-step')).map((step) => step.textContent.trim());

    return {
      theme: document.documentElement.dataset.theme || '',
      entryWidth: entry?.getBoundingClientRect().width || 0,
      kickerText: kicker?.textContent.trim() || '',
      ledeText: lede?.textContent.replace(/\s+/g, ' ').trim() || '',
      noteText: note?.textContent.replace(/\s+/g, ' ').trim() || '',
      primaryHref: primary?.href || '',
      secondaryHref: secondary?.getAttribute('href') || '',
      primaryText: primary?.textContent.trim() || '',
      secondaryText: secondary?.textContent.trim() || '',
      previewSteps,
      sendUsdcHref: document.querySelector('.send-usdc-link')?.href || '',
      portalNote: document.querySelector('.mobile-menu-portal-note')?.textContent.trim() || '',
      hasConnectBtn: !!document.getElementById('connectBtn'),
      hasWalletMenu: !!document.getElementById('walletMenu'),
      hasWalletOverlay: !!document.getElementById('walletChoiceOverlay'),
      documentOverflow: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      bodyOverflow: {
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
    };
  });
}

test('homepage portal entry renders cleanly at mobile and desktop widths', async () => {
  ensureDir(screenshotRoot);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-crash-reporter',
      '--disable-dev-shm-usage',
    ],
  });

  const pageErrors = [];
  const consoleErrors = [];
  const { server, baseUrl } = await startStaticServer();

  try {
    const cases = [
      { width: 390, height: 1800, theme: 'dark', screenshot: 'homepage-390-dark.png' },
      { width: 390, height: 1800, theme: 'light', screenshot: 'homepage-390-light.png' },
      { width: 1365, height: 1800, theme: 'dark', screenshot: 'homepage-1365-dark.png' },
      { width: 1365, height: 1800, theme: 'light', screenshot: 'homepage-1365-light.png' },
    ];

    for (const entry of cases) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.url().startsWith('https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js')) {
          request.respond({
            status: 200,
            contentType: 'application/javascript; charset=utf-8',
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
            body: 'window.ethers = window.ethers || {};',
          });
          return;
        }
        request.continue();
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          if (
            text.includes('ethers.umd.min.js') ||
            text.includes('computed SHA-384 integrity') ||
            text.includes('Access to script at')
          ) {
            return;
          }
          consoleErrors.push(text);
        }
      });

      await openHomepage(page, baseUrl, entry.width, entry.height, entry.theme);
      const state = await collectHomepageState(page);

      await page.screenshot({
        path: path.join(screenshotRoot, entry.screenshot),
        fullPage: true,
      });

      assert.equal(state.theme, entry.theme, `theme should stay set to ${entry.theme}`);
      assert.equal(state.kickerText, 'Quick access', 'homepage kicker should be neutral and user-facing');
      assert.equal(state.primaryText, 'Open Transfer Portal', 'primary homepage action should launch the portal');
      assert.equal(state.secondaryText, 'Install ImplicitEx', 'secondary homepage action should promote installation');
      assert.equal(state.primaryHref, 'https://portal.implicitex.com/', 'primary action must target the canonical portal domain');
      assert.equal(state.secondaryHref, '/install.html', 'secondary action should remain the install guide');
      assert.equal(state.sendUsdcHref, 'https://portal.implicitex.com/', 'nav launch link must target the canonical portal domain');
      assert.equal(state.portalNote, 'Opens the dedicated transfer workspace.', 'mobile menu launch note should stay user-facing');
      assert.equal(state.hasConnectBtn, false, 'homepage should not expose wallet connect controls');
      assert.equal(state.hasWalletMenu, false, 'homepage should not expose wallet menu controls');
      assert.equal(state.hasWalletOverlay, false, 'homepage should not expose wallet choice overlay');
      assert(state.previewSteps.join(' ') === '01 02 03', 'portal preview should remain a static three-step reference');
      assert(state.documentOverflow.scrollWidth <= state.documentOverflow.clientWidth, 'document must not overflow horizontally');
      assert(state.bodyOverflow.scrollWidth <= state.bodyOverflow.clientWidth, 'body must not overflow horizontally');
      assert.match(state.ledeText, /Open the Transfer Portal to review the recipient, amount, fee, and network before you send USDC on Polygon\./);
      assert.match(state.noteText, /Transfers open in a dedicated workspace so preparation, review, and confirmation stay separated\./);

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  assert.equal(pageErrors.length, 0, `homepage should not emit page errors: ${pageErrors.join(' | ')}`);
  assert.equal(consoleErrors.length, 0, `homepage should not emit console errors: ${consoleErrors.join(' | ')}`);
});
