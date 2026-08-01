/* coin-card-production-artifact.test.js — exact Hosting artifact smoke test
 *
 * Serves frontend/public without substituting signed files. Both ACTIVE
 * internal cards must reach VERIFIED and complete lifecycle promotion.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer');

const APP_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_ROOT = path.join(APP_ROOT, 'frontend/public');
const REGISTRY_ROOT = path.join(PUBLIC_ROOT, 'registry/coincards');
const CARD_INDEX_PATH = path.join(PUBLIC_ROOT, 'card/index.html');

function contentType(filePath) {
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  }[path.extname(filePath)] || 'application/octet-stream';
}

function activeCards() {
  return fs.readdirSync(REGISTRY_ROOT)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .map((name) => JSON.parse(fs.readFileSync(path.join(REGISTRY_ROOT, name), 'utf8')))
    .filter((card) => card.status === 'active')
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestPath = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let filePath;
      if (/^\/card\/[a-zA-Z0-9_-]{3,80}$/.test(requestPath)) {
        filePath = CARD_INDEX_PATH;
      } else {
        filePath = path.resolve(PUBLIC_ROOT, '.' + requestPath);
      }

      if (
        !filePath.startsWith(PUBLIC_ROOT + path.sep)
        || !fs.existsSync(filePath)
        || !fs.statSync(filePath).isFile()
      ) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentType(filePath),
      });
      response.end(fs.readFileSync(filePath));
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function verifyCard(browser, baseUrl, card) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') {
      request.abort();
      return;
    }
    request.continue();
  });

  await page.goto(`${baseUrl}/card/${encodeURIComponent(card.cardId)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  // card.js transitions to CONFIGURE after verification passes (HEAD state machine);
  // promotedPresentationReady requires the async lifecycle pipeline to complete.
  await page.waitForSelector('#ccFrame[data-state="CONFIGURE"]', { timeout: 15000 });
  await page.waitForFunction(() => (
    window.IX_COIN_CARD_RUNTIME_PREREQUISITES
    && window.IX_COIN_CARD_RUNTIME_PREREQUISITES.getStateSnapshot().promotedPresentationReady
  ), { timeout: 15000 });

  const observed = await page.evaluate(() => ({
    cardId: window.location.pathname.split('/').filter(Boolean)[1],
    cardName: document.getElementById('ccCardName')?.textContent || '',
    recipient: document.getElementById('ccCardRecipient')?.title || '',
    state: document.getElementById('ccFrame')?.dataset.state || '',
    statusLabel: document.getElementById('ccStatusLabel')?.textContent || '',
    transferDisabled: document.getElementById('ccChip')?.disabled,
    lifecycleReady: window.IX_COIN_CARD_RUNTIME_PREREQUISITES
      .getStateSnapshot().promotedPresentationReady,
  }));

  assert.equal(observed.cardId, card.cardId);
  assert.equal(observed.cardName, card.displayName, card.cardId);
  assert.equal(observed.recipient, card.recipient, card.cardId);
  assert.equal(observed.state, 'CONFIGURE', card.cardId);
  assert.equal(observed.statusLabel, 'Verified', card.cardId);
  assert.equal(observed.transferDisabled, true, `${card.cardId}: empty-amount transfer must stay disabled`);
  assert.equal(observed.lifecycleReady, true, card.cardId);
  assert.deepEqual(pageErrors, [], `${card.cardId}: browser page errors`);
  await page.close();
}

async function main() {
  const cards = activeCards();
  assert.deepEqual(cards.map((card) => card.cardId), ['antoine', 'cc_demo_implicitex']);

  const requestedBaseUrl = (process.env.COIN_CARD_SMOKE_BASE_URL || '').replace(/\/+$/, '');
  const server = requestedBaseUrl ? null : await startServer();
  const address = server && server.address();
  const baseUrl = requestedBaseUrl || `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    for (const card of cards) {
      await verifyCard(browser, baseUrl, card);
    }
  } finally {
    if (browser) await browser.close();
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }

  console.log(`Coin Card browser smoke: PASS at ${baseUrl} (${cards.map((card) => card.cardId).join(', ')})`);
}

main().catch((error) => {
  console.error(`Coin Card production artifact browser smoke: FAIL — ${error.stack || error.message}`);
  process.exit(1);
});
