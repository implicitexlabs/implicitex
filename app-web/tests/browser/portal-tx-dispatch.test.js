'use strict';

/**
 * portal-tx-dispatch.test.js
 *
 * Regression guard for handleTxAction() dispatch correctness.
 *
 * Each network state must route to a distinct action:
 *
 *   WRONG_NETWORK       — clicks wallet_switchEthereumChain
 *   CONTRACT_UNAVAILABLE while chainId === 137
 *                       — does NOT call wallet_switchEthereumChain;
 *                         retries readiness (syncProviderState) instead
 *   TRANSFERS_DISABLED  — primary action button remains disabled
 *   DISCONNECTED        — IX.handleTxAction() calls eth_requestAccounts
 *                         (the injected-wallet connect flow), not a chain RPC
 *
 * Critical invariant: CONTRACT_UNAVAILABLE must never invoke a chain-switch
 * request. The wallet may already be on Polygon; switching cannot resolve a
 * contract-configuration or RPC failure.
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

// Inject stub so that non-CDN-delivered ethers (localStorage, workers) also work.
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

/**
 * Build the evaluateOnNewDocument payload for a mock ethereum provider.
 * chainHex: e.g. '0x89' for Polygon, '0x1' for Ethereum
 */
function injectMockProvider(chainHex) {
  return `
    (function () {
      var CHAIN_HEX = ${JSON.stringify(chainHex)};
      var ADDR = '0xDeAdBeEf00000000000000000000000000000001';
      var authorized = false;

      window.__providerRequestCalls = [];

      window.ethereum = {
        isMetaMask: true,
        request: function (args) {
          var method = args && args.method;
          window.__providerRequestCalls.push({
            method: method,
            params: args && args.params ? JSON.parse(JSON.stringify(args.params)) : null
          });

          if (method === 'eth_chainId')         return Promise.resolve(CHAIN_HEX);
          if (method === 'eth_accounts')        return Promise.resolve(authorized ? [ADDR] : []);
          if (method === 'eth_requestAccounts') {
            authorized = true;
            return Promise.resolve([ADDR]);
          }
          if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
          if (method === 'wallet_addEthereumChain') return Promise.resolve(null);
          // eth_getBalance, eth_call, net_version, etc.
          return Promise.resolve('0x0');
        },
        on: function () {},
        removeListener: function () {}
      };
    }());
  `;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loadPageAndWaitForIX(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#modules', { timeout: 15000 });
  // Allow synchronous wallet init scripts to flush.
  await new Promise((r) => setTimeout(r, 200));
}

/** Programmatically trigger connect and wait for IX state to settle. */
async function triggerConnectAndWait(page) {
  await page.evaluate(() => window.IX && window.IX.connect());
  // Connect involves at least two awaited provider.request() calls
  // (eth_requestAccounts + eth_chainId). Give it 800ms.
  await new Promise((r) => setTimeout(r, 800));
}

const WALLET_ACTION_METHODS = new Set([
  'eth_requestAccounts',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
]);

async function readRequestCalls(page) {
  return page.evaluate(() => (window.__providerRequestCalls || []).map((call) => ({
    method: call.method,
    params: call.params,
  })));
}

async function clearRequestCalls(page) {
  await page.evaluate(() => {
    window.__providerRequestCalls = [];
  });
}

function callsFor(requestCalls, method) {
  return requestCalls.filter((call) => call.method === method);
}

function ordinaryRequestCalls(requestCalls) {
  return requestCalls.filter((call) => !WALLET_ACTION_METHODS.has(call.method));
}

function assertConnectedViaInjectedProvider(requestCalls, label) {
  assert.equal(callsFor(requestCalls, 'eth_requestAccounts').length, 1,
    `${label}: connect must request accounts exactly once`);
  assert.equal(callsFor(requestCalls, 'wallet_switchEthereumChain').length, 0,
    `${label}: connect must not switch chains`);
  assert.equal(callsFor(requestCalls, 'wallet_addEthereumChain').length, 0,
    `${label}: connect must not add chains`);
  assert.ok(callsFor(requestCalls, 'eth_accounts').length >= 1,
    `${label}: startup hydration must use the ordinary eth_accounts read`);
  assert.ok(callsFor(requestCalls, 'eth_chainId').length >= 1,
    `${label}: connect must read chain state with eth_chainId`);
  assert.ok(ordinaryRequestCalls(requestCalls).length >= 2,
    `${label}: ordinary state/read RPCs must remain distinct from wallet actions`);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test('WRONG_NETWORK — handleTxAction calls wallet_switchEthereumChain', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    // Ethereum mainnet (chainId 1) is not in IX_CHAINS — triggers WRONG_NETWORK.
    await page.evaluateOnNewDocument(injectMockProvider('0x1'));

    await loadPageAndWaitForIX(page, `${baseUrl}/portal-index.html`);
    await triggerConnectAndWait(page);

    const connectCalls = await readRequestCalls(page);
    assertConnectedViaInjectedProvider(connectCalls, 'WRONG_NETWORK');
    await clearRequestCalls(page);

    await page.evaluate(() => window.IX && window.IX.handleTxAction());
    await new Promise((r) => setTimeout(r, 500));

    const dispatchCalls = await readRequestCalls(page);
    const switchCalls = callsFor(dispatchCalls, 'wallet_switchEthereumChain');
    assert.equal(switchCalls.length, 1,
      'WRONG_NETWORK: wallet_switchEthereumChain must be called exactly once');
    assert.deepEqual(switchCalls[0].params, [{ chainId: '0x89' }],
      'WRONG_NETWORK: switch request must target Polygon Mainnet');
    assert.equal(callsFor(dispatchCalls, 'wallet_addEthereumChain').length, 0,
      'WRONG_NETWORK: wallet_addEthereumChain must not run when switch succeeds');
    assert.equal(callsFor(dispatchCalls, 'eth_requestAccounts').length, 0,
      'WRONG_NETWORK: dispatch must not re-enter the connection flow');
    assert.ok(callsFor(dispatchCalls, 'eth_chainId').length >= 1,
      'WRONG_NETWORK: post-switch sync must perform ordinary chain-state reads');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('CONTRACT_UNAVAILABLE on chain 137 — handleTxAction does NOT call wallet_switchEthereumChain', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    // Polygon Mainnet (chainId 137 = 0x89).
    await page.evaluateOnNewDocument(injectMockProvider('0x89'));

    await loadPageAndWaitForIX(page, `${baseUrl}/portal-index.html`);

    // Force CONTRACT_UNAVAILABLE: wallet is on Polygon but contractAddress is null.
    await page.evaluate(() => {
      if (window.IX_CHAINS && window.IX_CHAINS[137]) {
        window.IX_CHAINS[137].contractAddress = null;
      }
    });

    await triggerConnectAndWait(page);
    const connectCalls = await readRequestCalls(page);
    assertConnectedViaInjectedProvider(connectCalls, 'CONTRACT_UNAVAILABLE');

    // Verify getNetworkState resolves to CONTRACT_UNAVAILABLE before acting.
    // (wallet.js exposes getState() but not getNetworkState; proxy via button label)
    const btnLabel = await page.evaluate(() => {
      var btn = document.getElementById('txBtn');
      return btn ? btn.textContent.trim() : '';
    });
    // The button must show 'Retry verification' — confirming CONTRACT_UNAVAILABLE state.
    assert.equal(btnLabel, 'Retry verification',
      'CONTRACT_UNAVAILABLE: txBtn must show "Retry verification", not "Switch to Polygon"');

    await clearRequestCalls(page);
    await page.evaluate(() => window.IX && window.IX.handleTxAction());
    await new Promise((r) => setTimeout(r, 800));

    const dispatchCalls = await readRequestCalls(page);
    assert.equal(callsFor(dispatchCalls, 'wallet_switchEthereumChain').length, 0,
      'CONTRACT_UNAVAILABLE on chain 137: wallet_switchEthereumChain must NOT be called');
    assert.equal(callsFor(dispatchCalls, 'wallet_addEthereumChain').length, 0,
      'CONTRACT_UNAVAILABLE on chain 137: wallet_addEthereumChain must NOT be called');
    assert.equal(callsFor(dispatchCalls, 'eth_requestAccounts').length, 0,
      'CONTRACT_UNAVAILABLE on chain 137: retry must not reconnect the wallet');
    assert.ok(callsFor(dispatchCalls, 'eth_chainId').length >= 1,
      'CONTRACT_UNAVAILABLE: retryContractReadiness must re-read eth_chainId');
    assert.ok(callsFor(dispatchCalls, 'eth_accounts').length >= 1,
      'CONTRACT_UNAVAILABLE: retryContractReadiness must re-read eth_accounts');
    assert.ok(ordinaryRequestCalls(dispatchCalls).length >= 2,
      'CONTRACT_UNAVAILABLE: retry must use ordinary state/read RPCs only');

    const finalUi = await page.evaluate(() => ({
      buttonLabel: document.getElementById('txBtn').textContent.trim(),
      status: document.getElementById('txStatus').textContent.trim(),
    }));
    assert.equal(finalUi.buttonLabel, 'Retry verification',
      'CONTRACT_UNAVAILABLE: retry must remain available after verification fails');
    assert.equal(
      finalUi.status,
      'Transfer service is temporarily unavailable. Your wallet remains connected and no transaction was submitted.',
      'CONTRACT_UNAVAILABLE: retry must report the safe service-unavailable outcome'
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('TRANSFERS_DISABLED — primary action button remains disabled', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.evaluateOnNewDocument(injectMockProvider('0x89'));

    await loadPageAndWaitForIX(page, `${baseUrl}/portal-index.html`);

    // Force TRANSFERS_DISABLED: on Polygon but transfersEnabled = false.
    await page.evaluate(() => {
      if (window.IX_CHAINS && window.IX_CHAINS[137]) {
        window.IX_CHAINS[137].transfersEnabled = false;
      }
    });

    await triggerConnectAndWait(page);
    const connectCalls = await readRequestCalls(page);
    assertConnectedViaInjectedProvider(connectCalls, 'TRANSFERS_DISABLED');

    const btnDisabled = await page.evaluate(() => {
      var btn = document.getElementById('txBtn');
      return btn ? btn.disabled : true;
    });
    assert.equal(btnDisabled, true,
      'TRANSFERS_DISABLED: txBtn must be disabled — no wallet action can unblock a policy gate');

    await clearRequestCalls(page);
    await page.evaluate(() => document.getElementById('txBtn').click());
    await new Promise((r) => setTimeout(r, 100));

    const blockedCalls = await readRequestCalls(page);
    assert.equal(callsFor(blockedCalls, 'eth_requestAccounts').length, 0,
      'TRANSFERS_DISABLED: blocked action must not reconnect');
    assert.equal(callsFor(blockedCalls, 'wallet_switchEthereumChain').length, 0,
      'TRANSFERS_DISABLED: blocked action must not switch chains');
    assert.equal(callsFor(blockedCalls, 'wallet_addEthereumChain').length, 0,
      'TRANSFERS_DISABLED: blocked action must not add chains');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});

test('DISCONNECTED — IX.handleTxAction() triggers connect flow, not a chain switch', async () => {
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    // Provider present but no auto-connect — wallet starts disconnected.
    await page.evaluateOnNewDocument(injectMockProvider('0x89'));

    await loadPageAndWaitForIX(page, `${baseUrl}/portal-index.html`);
    // Do NOT call triggerConnectAndWait — we want the disconnected state.

    const hydrationCalls = await readRequestCalls(page);
    assert.ok(callsFor(hydrationCalls, 'eth_accounts').length >= 1,
      'DISCONNECTED: startup must check authorization with ordinary eth_accounts');
    assert.equal(callsFor(hydrationCalls, 'eth_requestAccounts').length, 0,
      'DISCONNECTED: startup hydration must not prompt for account access');
    assert.equal(callsFor(hydrationCalls, 'wallet_switchEthereumChain').length, 0,
      'DISCONNECTED: startup hydration must not switch chains');
    assert.equal(callsFor(hydrationCalls, 'wallet_addEthereumChain').length, 0,
      'DISCONNECTED: startup hydration must not add chains');
    await clearRequestCalls(page);

    // Call handleTxAction programmatically — the button is disabled when
    // disconnected so this is the only way to exercise the branch.
    await page.evaluate(() => window.IX && window.IX.handleTxAction());
    await new Promise((r) => setTimeout(r, 500));

    const connectCalls = await readRequestCalls(page);
    assert.equal(callsFor(connectCalls, 'wallet_switchEthereumChain').length, 0,
      'DISCONNECTED: wallet_switchEthereumChain must NOT be called');
    assert.equal(callsFor(connectCalls, 'wallet_addEthereumChain').length, 0,
      'DISCONNECTED: wallet_addEthereumChain must NOT be called');
    assert.equal(callsFor(connectCalls, 'eth_requestAccounts').length, 1,
      'DISCONNECTED: normal injected-wallet flow must call eth_requestAccounts exactly once');
    assert.ok(callsFor(connectCalls, 'eth_chainId').length >= 1,
      'DISCONNECTED: successful connection must continue with an ordinary eth_chainId read');
    assert.ok(ordinaryRequestCalls(connectCalls).length >= 1,
      'DISCONNECTED: state/read RPCs must remain distinct from the account request');
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
