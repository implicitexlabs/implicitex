'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { describe, test, before, after } = require('node:test');
const puppeteer = require('puppeteer');

const appRoot = path.resolve(__dirname, '../..');
const publicDir = path.join(appRoot, 'frontend/public');
const CARD_ID = 'cc_demo_implicitex';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const DRIFT_ACCOUNT = '0x2222222222222222222222222222222222222222';
const CHAIN_ID_HEX = '0x89';
const DRIFT_CHAIN_ID_HEX = '0x1';
const ONE_HUNDRED_USDC = '0x' + (100n * 1000000n).toString(16);
const ZERO = '0x0';

let browser;
let httpServer;
let serverUrl;

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream';
}

function startHttpServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const urlPath = req.url.split('?')[0];
      const tryPaths = [urlPath];
      if (urlPath.startsWith('/card/js/') || urlPath.startsWith('/card/card/')) {
        tryPaths.push(urlPath.slice('/card'.length));
      }

      for (const tryPath of tryPaths) {
        const filePath = path.join(publicDir, tryPath);
        try {
          const content = readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': contentType(filePath) });
          res.end(content);
          return;
        } catch (_) {
          /* try next path */
        }
      }

      if (urlPath.startsWith('/card/') || urlPath === '/card') {
        const indexPath = path.join(publicDir, 'card/index.html');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(readFileSync(indexPath));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

async function installProviderFirewall(page, options = {}) {
  await page.evaluateOnNewDocument((opts) => {
    const PROHIBITED = new Set([
      'eth_sendTransaction',
      'eth_signTransaction',
      'eth_sign',
      'personal_sign',
      'eth_signTypedData',
      'eth_signTypedData_v1',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
    ]);
    const READ_ALLOWED = new Set([
      'eth_requestAccounts',
      'eth_accounts',
      'eth_chainId',
      'eth_call',
      'eth_getBalance',
      'eth_getTransactionReceipt',
    ]);

    const state = {
      account: opts.account,
      chainId: opts.chainId,
      balanceHex: opts.balanceHex,
      allowanceHex: opts.allowanceHex,
      sendRejectionCode: opts.sendRejectionCode || 'FIREWALL_BLOCKED',
      disconnected: false,
      observed: [],
      blocked: [],
      forwarded: [],
      forwardedProhibited: [],
    };

    const underlying = {
      request(payload) {
        state.forwarded.push({ method: payload && payload.method, params: payload && payload.params || null });
        const method = payload && payload.method;
        if (PROHIBITED.has(method)) state.forwardedProhibited.push(method);
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return Promise.resolve(state.disconnected ? [] : [state.account]);
          case 'eth_chainId':
            return Promise.resolve(state.chainId);
          case 'eth_call': {
            const data = payload && payload.params && payload.params[0] && payload.params[0].data || '';
            if (data.startsWith('0x70a08231')) return Promise.resolve(state.balanceHex);
            if (data.startsWith('0xdd62ed3e')) return Promise.resolve(state.allowanceHex);
            return Promise.resolve('0x');
          }
          case 'eth_getBalance':
            return Promise.resolve('0x0');
          case 'eth_getTransactionReceipt':
            return Promise.resolve(null);
          default:
            return Promise.reject(Object.assign(new Error('Unsupported test RPC method: ' + method), { code: 'UNSUPPORTED_TEST_RPC' }));
        }
      },
    };

    window.__coinCardFirewall = {
      state,
      setAccount(account) { state.account = account; },
      setChainId(chainId) { state.chainId = chainId; },
      setBalanceHex(balanceHex) { state.balanceHex = balanceHex; },
      setAllowanceHex(allowanceHex) { state.allowanceHex = allowanceHex; },
      setDisconnected(disconnected) { state.disconnected = !!disconnected; },
      snapshot() {
        return JSON.parse(JSON.stringify({
          observed: state.observed,
          blocked: state.blocked,
          forwarded: state.forwarded,
          forwardedProhibited: state.forwardedProhibited,
        }));
      },
    };

    window.ethereum = {
      isMetaMask: true,
      request(payload) {
        const method = payload && payload.method;
        state.observed.push({ method, params: payload && payload.params || null });
        if (PROHIBITED.has(method)) {
          const err = new Error('Blocked by Coin Card acceptance firewall: ' + method);
          err.code = state.sendRejectionCode;
          state.blocked.push(method);
          return Promise.reject(err);
        }
        if (!READ_ALLOWED.has(method)) {
          const err = new Error('RPC method not allowlisted by Coin Card acceptance firewall: ' + method);
          err.code = 'FIREWALL_METHOD_NOT_ALLOWED';
          state.blocked.push(method);
          return Promise.reject(err);
        }
        return underlying.request(payload);
      },
      on() {},
      removeListener() {},
    };
  }, {
    account: options.account || ACCOUNT,
    chainId: options.chainId || CHAIN_ID_HEX,
    balanceHex: options.balanceHex || ONE_HUNDRED_USDC,
    allowanceHex: options.allowanceHex || ZERO,
    sendRejectionCode: options.sendRejectionCode || 'FIREWALL_BLOCKED',
  });
}

async function openCommittedCard(page, options = {}) {
  await installProviderFirewall(page, options);
  await page.goto(`${serverUrl}/card/${CARD_ID}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#ccFrame[data-state="VERIFIED"]', { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('ccStatusLabel')?.textContent === 'Route Verified');
}

async function enterAmount(page, value) {
  await page.click('#ccAmountInput', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (value !== '') await page.type('#ccAmountInput', value);
  await page.$eval('#ccAmountInput', (el) => el.dispatchEvent(new Event('input', { bubbles: true })));
}

async function connectWallet(page) {
  await page.click('#ccChip');
  await page.waitForSelector('#ccFrame[data-state="READY_TO_SEND"]', { timeout: 10000 });
}

async function installExecutionProbe(page, mode) {
  await page.evaluate((probeMode, driftAccount, driftChainId) => {
    const original = window.IX_EXECUTION.executeTransfer.bind(window.IX_EXECUTION);
    window.__coinCardExecutionProbe = {
      mode: probeMode,
      executeAuthorizedCount: 0,
      firstResult: null,
      replayResult: null,
    };
    window.IX_EXECUTION.executeTransfer = async function patchedExecuteTransfer(request, hooks) {
      if (request && request.action === 'execute-authorized') {
        window.__coinCardExecutionProbe.executeAuthorizedCount += 1;
        const forwarded = Object.assign({}, request);
        if (probeMode === 'provider-mismatch') {
          forwarded.snapshotProvider = { request() { return Promise.reject(new Error('wrong provider')); } };
        }
        if (probeMode === 'account-drift') window.__coinCardFirewall.setAccount(driftAccount);
        if (probeMode === 'chain-drift') window.__coinCardFirewall.setChainId(driftChainId);
        if (probeMode === 'disconnect') window.__coinCardFirewall.setDisconnected(true);
        const result = await original(forwarded, hooks);
        window.__coinCardExecutionProbe.firstResult = result;
        window.__coinCardExecutionProbe.replayResult = await original(forwarded, {});
        return result;
      }
      return original(request, hooks);
    };
  }, mode || 'firewall', DRIFT_ACCOUNT, DRIFT_CHAIN_ID_HEX);
}

async function runFinalAction(page, mode) {
  await installExecutionProbe(page, mode);
  const beforeClick = await page.evaluate(() => ({
    frameState: document.getElementById('ccFrame')?.dataset.state,
    chipDisabled: document.getElementById('ccChip')?.disabled,
    chipLabel: document.getElementById('ccChip')?.getAttribute('aria-label'),
    hasExecution: !!window.IX_EXECUTION,
    hasAuthorization: !!window.IX_COIN_CARD_EXECUTION_AUTHORIZATION,
  }));
  await page.$eval('#ccChip', (el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
  try {
    await page.waitForFunction(
      () => window.__coinCardExecutionProbe &&
        window.__coinCardExecutionProbe.firstResult,
      { timeout: 10000 },
    );
  } catch (_) {
    /* Return diagnostic state; assertions will report the missed transition. */
  }
  return page.evaluate((before) => ({
    beforeClick: before,
    frameState: document.getElementById('ccFrame')?.dataset.state,
    errorText: document.getElementById('ccCardError')?.textContent || '',
    statusLabel: document.getElementById('ccStatusLabel')?.textContent || '',
    probe: window.__coinCardExecutionProbe,
    firewall: window.__coinCardFirewall.snapshot(),
  }), beforeClick);
}

function assertNoProhibitedForwarded(result) {
  assert.deepEqual(result.firewall.forwardedProhibited, [], 'no prohibited method may reach the underlying provider');
}

describe('Coin Card active-flow acceptance firewall', () => {
  before(async () => {
    httpServer = await startHttpServer();
    serverUrl = `http://127.0.0.1:${httpServer.address().port}`;
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (httpServer) httpServer.close();
  });

  test('committed VERIFIED/ACTIVE card reaches authorization and local firewall blocks approval before provider forwarding', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page);
      await enterAmount(page, '2.00');
      await connectWallet(page);

      const result = await runFinalAction(page, 'firewall');
      assert.ok(result.probe.firstResult, JSON.stringify(result, null, 2));
      assert.equal(result.probe.firstResult.status, 'failed');
      assert.equal(result.probe.firstResult.error.code, 'FIREWALL_BLOCKED');
      assert.equal(result.probe.replayResult.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
      assert.equal(result.frameState, 'TX_FAILED');
      assert.deepEqual(result.firewall.blocked, ['eth_sendTransaction']);
      assert.ok(result.firewall.observed.some((call) => call.method === 'eth_sendTransaction'));
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('account drift after authorization fails before state-changing RPC', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page);
      await enterAmount(page, '2.00');
      await connectWallet(page);

      const result = await runFinalAction(page, 'account-drift');
      assert.equal(result.probe.firstResult.status, 'failed');
      assert.equal(result.probe.firstResult.error.code, 'TOCTOU_ACCOUNT_DRIFT');
      assert.equal(result.probe.replayResult.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
      assert.equal(result.firewall.blocked.length, 0);
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('chain drift after authorization fails before state-changing RPC', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page);
      await enterAmount(page, '2.00');
      await connectWallet(page);

      const result = await runFinalAction(page, 'chain-drift');
      assert.equal(result.probe.firstResult.status, 'failed');
      assert.equal(result.probe.firstResult.error.code, 'TOCTOU_CHAIN_DRIFT');
      assert.equal(result.probe.replayResult.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
      assert.equal(result.firewall.blocked.length, 0);
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('provider disconnect after authorization fails before state-changing RPC', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page);
      await enterAmount(page, '2.00');
      await connectWallet(page);

      const result = await runFinalAction(page, 'disconnect');
      assert.equal(result.probe.firstResult.status, 'failed');
      assert.equal(result.probe.firstResult.error.code, 'TOCTOU_ACCOUNT_DRIFT');
      assert.equal(result.probe.replayResult.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
      assert.equal(result.firewall.blocked.length, 0);
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('provider mismatch consumes proof and fails before wallet reads or state-changing RPC', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page);
      await enterAmount(page, '2.00');
      await connectWallet(page);

      const before = await page.evaluate(() => window.__coinCardFirewall.snapshot().observed.length);
      const result = await runFinalAction(page, 'provider-mismatch');
      const after = result.firewall.observed.length;
      const finalActionMethods = result.firewall.observed.slice(before).map((call) => call.method);
      assert.equal(result.probe.firstResult.status, 'failed');
      assert.equal(result.probe.firstResult.error.code, 'PROVIDER_MISMATCH');
      assert.equal(result.probe.replayResult.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
      assert.equal(after, before + 2, 'provider mismatch may only perform the pre-authorization snapshot reads');
      assert.deepEqual(finalActionMethods, ['eth_call', 'eth_call']);
      assert.equal(result.firewall.blocked.length, 0);
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('wallet rejection simulation is local, non-forwarded, and does not retry automatically', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page, { sendRejectionCode: 4001 });
      await enterAmount(page, '2.00');
      await connectWallet(page);

      const result = await runFinalAction(page, 'firewall');
      assert.equal(result.probe.firstResult.status, 'wallet-rejected');
      assert.equal(result.probe.replayResult.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
      assert.equal(result.probe.executeAuthorizedCount, 1);
      assert.equal(result.frameState, 'READY_TO_SEND');
      assert.deepEqual(result.firewall.blocked, ['eth_sendTransaction']);
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('insufficient funds blocks authorization and never calls execute-authorized', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page, { balanceHex: ZERO });
      await enterAmount(page, '2.00');
      await connectWallet(page);
      await installExecutionProbe(page, 'firewall');
      await page.click('#ccChip');
      await page.waitForSelector('#ccFrame[data-state="TX_FAILED"]', { timeout: 10000 });

      const result = await page.evaluate(() => ({
        probe: window.__coinCardExecutionProbe,
        firewall: window.__coinCardFirewall.snapshot(),
        errorText: document.getElementById('ccCardError')?.textContent || '',
      }));
      assert.equal(result.probe.executeAuthorizedCount, 0);
      assert.match(result.errorText, /Insufficient USDC balance/);
      assert.equal(result.firewall.blocked.length, 0);
      assertNoProhibitedForwarded(result);
    } finally {
      await page.close();
    }
  });

  test('malformed, below-minimum, and above-maximum amounts do not arm execution', async () => {
    const page = await browser.newPage();
    try {
      await openCommittedCard(page);
      for (const value of ['', 'abc', '0.50', '251.00']) {
        await enterAmount(page, value);
        const state = await page.$eval('#ccFrame', (el) => el.dataset.state);
        const chip = await page.$eval('#ccChip', (el) => ({
          disabled: el.disabled,
          label: el.getAttribute('aria-label'),
        }));
        assert.equal(state, 'VERIFIED', `amount ${value || '<empty>'} must stay in VERIFIED`);
        assert.equal(chip.disabled, true, `amount ${value || '<empty>'} must not enable chip`);
      }
      const firewall = await page.evaluate(() => window.__coinCardFirewall.snapshot());
      assert.equal(firewall.blocked.length, 0);
      assert.deepEqual(firewall.forwardedProhibited, []);
    } finally {
      await page.close();
    }
  });
});
