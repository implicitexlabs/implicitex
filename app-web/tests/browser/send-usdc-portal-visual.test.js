'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const puppeteer = require('puppeteer');

const appRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(appRoot, 'frontend/public');
const screenshotRoot = path.join('/tmp', 'implicitex-send-usdc-portal-visual');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? '/portal-index.html' : requestPath;
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

async function openPortal(page, baseUrl, width, height, theme) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((themeValue) => {
    try {
      localStorage.setItem('implicitex-theme', themeValue);
    } catch (error) {
      void error;
    }
  }, theme);
  await page.evaluateOnNewDocument(() => {
    window.ethers = {
      getAddress(address) {
        const value = String(address || '').trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
          throw new Error('invalid address');
        }
        if (/[a-f]/.test(value) && /[A-F]/.test(value) && value === '0x52908400098527886E0F7030069857D2E4169ee7') {
          throw new Error('bad checksum');
        }
        return value.toLowerCase();
      },
      formatUnits(value, decimals) {
        const big = typeof value === 'bigint' ? value : BigInt(value);
        const scale = BigInt(10) ** BigInt(decimals || 0);
        const whole = big / scale;
        const fraction = big % scale;
        return fraction === 0n ? String(whole) : String(whole) + '.' + String(fraction).padStart(Number(decimals || 0), '0');
      },
    };
  });
  await page.goto(`${baseUrl}/portal-index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#txRecipient');
  await page.waitForFunction(() => (
    typeof window.IX !== 'undefined'
    && typeof window.IX.connect === 'function'
    && typeof window.IX.handleTxAction === 'function'
  ), { timeout: 30000 });
}

async function injectState(page, stateName) {
  await page.evaluate((name) => {
    const recipient = document.getElementById('txRecipient');
    const amount = document.getElementById('txAmount');
    const purpose = document.getElementById('txPurposeTag');
    const reference = document.getElementById('txReference');
    const memo = document.getElementById('txMemo');
    const status = document.getElementById('txStatus');
    const stateNote = document.getElementById('transferStateNote');
    const confirmWrap = document.getElementById('txConfirmWrap');
    const confirmAck = document.getElementById('txConfirmAck');
    const preview = document.getElementById('txPreview');
    const lowercaseAction = document.querySelector('.tx-recipient-lowercase-action');

    function setValue(node, value) {
      if (!node) return;
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }

    [recipient, amount, purpose, reference, memo].forEach((node) => {
      if (!node) return;
      node.disabled = false;
      node.removeAttribute('disabled');
    });

    if (status) status.textContent = '';
    if (stateNote) stateNote.textContent = '';
    if (confirmWrap) confirmWrap.hidden = true;
    if (confirmAck) confirmAck.checked = false;
    if (preview) preview.hidden = true;
    if (lowercaseAction && lowercaseAction.parentElement) lowercaseAction.parentElement.removeChild(lowercaseAction);

    setValue(recipient, '');
    setValue(amount, '');
    setValue(purpose, '');
    setValue(reference, '');
    setValue(memo, '');

    if (name === 'focused') {
      recipient?.focus();
      return;
    }

    if (name === 'populated') {
      setValue(recipient, '0x1111111111111111111111111111111111111111');
      setValue(amount, '12.34');
      setValue(purpose, 'invoice');
      setValue(reference, 'INV-12345');
      setValue(memo, 'Ops review');
      return;
    }

    if (name === 'invalid') {
      setValue(recipient, '0x52908400098527886E0F7030069857D2E4169ee7');
      setValue(amount, '12.34');
      setValue(purpose, 'contractor');
      setValue(reference, 'Checksum review');
      setValue(memo, 'Lowercase action should appear');
      recipient?.focus();
      return;
    }

    if (name === 'disabled') {
      [recipient, amount, purpose, reference, memo].forEach((node) => {
        if (!node) return;
        node.disabled = true;
        node.setAttribute('disabled', '');
      });
      if (confirmAck) {
        confirmAck.disabled = true;
        confirmAck.setAttribute('disabled', '');
      }
      return;
    }
  }, stateName);
}

async function collectState(page, stateName) {
  return page.evaluate((name) => {
    const recipient = document.getElementById('txRecipient');
    const amount = document.getElementById('txAmount');
    const purpose = document.getElementById('txPurposeTag');
    const reference = document.getElementById('txReference');
    const memo = document.getElementById('txMemo');
    const error = document.getElementById('recipientError');
    const button = document.getElementById('txBtn');
    const lowercaseAction = document.querySelector('.tx-recipient-lowercase-action');
    const active = document.activeElement;

    return {
      state: name,
      theme: document.documentElement.dataset.theme || '',
      focusId: active ? active.id || active.className || active.tagName : '',
      recipientValue: recipient?.value || '',
      amountValue: amount?.value || '',
      purposeValue: purpose?.value || '',
      referenceValue: reference?.value || '',
      memoValue: memo?.value || '',
      recipientDisabled: !!recipient?.disabled,
      amountDisabled: !!amount?.disabled,
      purposeDisabled: !!purpose?.disabled,
      buttonText: button?.textContent.trim() || '',
      buttonDisabled: !!button?.disabled,
      errorText: error?.textContent.replace(/\s+/g, ' ').trim() || '',
      errorHtml: error?.innerHTML || '',
      lowercaseActionText: lowercaseAction?.textContent.trim() || '',
      lowercaseActionDisplay: lowercaseAction ? getComputedStyle(lowercaseAction).display : '',
      lowercaseActionRect: lowercaseAction ? lowercaseAction.getBoundingClientRect().toJSON() : null,
      recipientRect: recipient ? recipient.getBoundingClientRect().toJSON() : null,
      recipientComputed: recipient ? {
        fontFamily: getComputedStyle(recipient).fontFamily,
        fontSize: getComputedStyle(recipient).fontSize,
        borderColor: getComputedStyle(recipient).borderColor,
        boxShadow: getComputedStyle(recipient).boxShadow,
      } : null,
      ethersType: typeof window.ethers,
      documentOverflow: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      bodyOverflow: {
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
    };
  }, stateName);
}

test('Send USDC real portal states render cleanly at mobile and desktop widths', async () => {
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
  const requestUrls = [];
  const { server, baseUrl } = await startStaticServer();

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      requestUrls.push(url);
      if (url.includes('cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js')) {
        request.abort();
        return;
      }
      request.continue();
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('Failed to load resource: net::ERR_FAILED')) {
        consoleErrors.push(message.text());
      }
    });

    const cases = [
      { width: 390, height: 1800, theme: 'dark' },
      { width: 390, height: 1800, theme: 'light' },
      { width: 1365, height: 1800, theme: 'dark' },
      { width: 1365, height: 1800, theme: 'light' },
    ];

    const states = ['empty', 'focused', 'populated', 'invalid', 'disabled'];

    for (const entry of cases) {
      await openPortal(page, baseUrl, entry.width, entry.height, entry.theme);
      for (const stateName of states) {
        await injectState(page, stateName);
        const state = await collectState(page, stateName);

        await page.screenshot({
          path: path.join(
            screenshotRoot,
            `send-usdc-portal-${entry.width}-${entry.theme}-${stateName}.png`
          ),
          fullPage: true,
        });

        assert.equal(state.theme, entry.theme, `theme should remain ${entry.theme}`);
        assert.equal(state.documentOverflow.scrollWidth <= state.documentOverflow.clientWidth, true, `${entry.width} ${entry.theme} ${stateName}: document must not overflow`);
        assert.equal(state.bodyOverflow.scrollWidth <= state.bodyOverflow.clientWidth, true, `${entry.width} ${entry.theme} ${stateName}: body must not overflow`);
        assert.equal(state.lowercaseActionText === 'Use lowercase address' || state.lowercaseActionText === '', true, `${entry.width} ${entry.theme} ${stateName}: lowercase action text should be neutral`);
        if (stateName === 'focused') {
          assert.equal(state.focusId, 'txRecipient', `${entry.width} ${entry.theme} focused: recipient should own focus`);
        }
        if (stateName === 'populated') {
          assert.equal(state.recipientValue, '0x1111111111111111111111111111111111111111', `${entry.width} ${entry.theme} populated: recipient should persist`);
          assert.equal(state.amountValue, '12.34', `${entry.width} ${entry.theme} populated: amount should persist`);
        }
        if (stateName === 'invalid') {
          assert.match(
            state.errorText,
            /Invalid checksum/i,
            `${entry.width} ${entry.theme} invalid: checksum guidance should appear; ethers=${state.ethersType}; html=${state.errorHtml}`
          );
          assert.equal(state.lowercaseActionText, 'Use lowercase address', `${entry.width} ${entry.theme} invalid: lowercase action should appear`);
          assert.equal(state.lowercaseActionDisplay !== 'none', true, `${entry.width} ${entry.theme} invalid: lowercase action should render`);
          assert.equal(state.lowercaseActionRect.width > 0 && state.lowercaseActionRect.height > 0, true, `${entry.width} ${entry.theme} invalid: lowercase action should have layout`);
        }
        if (stateName === 'disabled') {
          assert.equal(state.recipientDisabled, true, `${entry.width} ${entry.theme} disabled: recipient should be disabled`);
          assert.equal(state.amountDisabled, true, `${entry.width} ${entry.theme} disabled: amount should be disabled`);
          assert.equal(state.purposeDisabled, true, `${entry.width} ${entry.theme} disabled: purpose should be disabled`);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  assert.equal(pageErrors.length, 0, `portal should not emit page errors: ${pageErrors.join(' | ')}`);
  assert.equal(consoleErrors.length, 0, `portal should not emit console errors: ${consoleErrors.join(' | ')}`);
});
