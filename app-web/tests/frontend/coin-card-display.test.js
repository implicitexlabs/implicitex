const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const puppeteer = require('puppeteer');

const repoRoot = path.resolve(__dirname, '../..', '..');
const appRoot = path.join(repoRoot, 'app-web');
const display = require(path.join(appRoot, 'frontend/public/coincard/coin-card-display.js'));
const contract = require(path.join(appRoot, 'frontend/public/coincard/state-review-contract.generated.js'));
const core = require(path.join(appRoot, 'frontend/public/coincard/state-review-core.js'));

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`missing function ${name}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function loadFunctionFromSource(filePath, name, sandbox) {
  const source = fs.readFileSync(filePath, 'utf8');
  const fnSource = extractFunctionSource(source, name);
  return vm.runInNewContext(`(${fnSource})`, sandbox);
}

function referenceLiveTruncate(value) {
  if (!value || String(value).length < 12) return value;
  const text = String(value);
  return text.slice(0, 6) + '…' + text.slice(-4);
}

function referenceReviewTruncate(value) {
  if (!value || String(value).length <= 17) return value;
  const text = String(value);
  return text.slice(0, 8) + '...' + text.slice(-6);
}

function referenceFormatUsdcExact(units) {
  if (units === null || units === undefined || units === '') return '—';
  const raw = BigInt(units);
  const sign = raw < 0n ? '-' : '';
  const abs = raw < 0n ? -raw : raw;
  const whole = abs / 1000000n;
  const frac = (abs % 1000000n).toString().padStart(6, '0');
  const trimmed = frac.replace(/0+$/, '');
  if (!trimmed) return `${sign}${whole.toString()}.00`;
  if (trimmed.length <= 2) return `${sign}${whole.toString()}.${trimmed.padEnd(2, '0')}`;
  return `${sign}${whole.toString()}.${trimmed}`;
}

function makeMockElement() {
  const attributes = new Map();
  return {
    textContent: '',
    title: '',
    href: '',
    style: {},
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'title') this.title = String(value);
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'title') this.title = '';
    },
  };
}

function startStaticServer(rootDir) {
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(rootDir, urlPath);
    if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!path.extname(filePath)) {
      const htmlPath = `${filePath}.html`;
      if (fs.existsSync(htmlPath)) filePath = htmlPath;
      else if (fs.existsSync(path.join(filePath, 'index.html'))) filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath) || !filePath.startsWith(rootDir)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    const body = fs.readFileSync(filePath);
    res.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
    res.end(body);
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.on('error', reject);
  });
}

test('formatUsdcUnits matches fixed production valid-unit vectors', () => {
  const vectors = [
    { value: 0n, expected: '0.00' },
    { value: '1000000', expected: '1.00' },
    { value: 1010000n, expected: '1.01' },
    { value: 1500000n, expected: '1.50' },
    { value: '1000001', expected: '1.000001' },
    { value: '1234567890123456', expected: '1234567890.123456' },
    { value: -1000000n, expected: '-1.00' },
  ];

  vectors.forEach(({ value, expected }) => {
    assert.equal(display.formatUsdcUnits(value), expected, String(value));
    assert.equal(referenceFormatUsdcExact(value), expected, String(value));
  });
});

test('formatUsdcUnits rejects unsafe numeric inputs', () => {
  assert.throws(() => display.formatUsdcUnits(1.5), /integer base units/);
  assert.throws(() => display.formatUsdcUnits(Number.MAX_SAFE_INTEGER + 1), /integer base units/);
  assert.throws(() => display.formatUsdcUnits(Number.MIN_SAFE_INTEGER - 1), /integer base units/);
  assert.throws(() => display.formatUsdcUnits(Number.NaN), /integer base units/);
  assert.throws(() => display.formatUsdcUnits(Number.POSITIVE_INFINITY), /integer base units/);
});

test('formatUsdcUnits matches production-compatible valid-unit vectors', () => {
  const vectors = [
    0n,
    1000000,
    '1000000',
    1010000n,
    1500000n,
    '1000001',
    '1234567890123456',
    -1000000n,
    -1000000,
  ];

  vectors.forEach((value) => {
    const displayValue = display.formatUsdcUnits(value);
    const coreValue = core.formatUnits(contract, value);
    assert.equal(displayValue, referenceFormatUsdcExact(value), String(value));
    assert.equal(coreValue, `${displayValue} USDC`, String(value));
  });
});

test('formatUsdcUnits defensive unavailable values are explicit', () => {
  const vectors = [null, undefined, ''];
  vectors.forEach((value) => {
    assert.equal(display.formatUsdcUnits(value), '—', String(value));
  });
});

test('middleTruncate preserves live and review truncation contracts', () => {
  const liveVectors = [
    { value: '1234567890', expected: '1234567890' },
    { value: '12345678901', expected: '12345678901' },
    { value: '123456789012', expected: '123456…9012' },
    { value: '1234567890123', expected: '123456…0123' },
    { value: '0x1234567890abcdef1234567890abcdef12345678', expected: '0x1234…5678' },
  ];

  liveVectors.forEach(({ value, expected }) => {
    const actual = display.middleTruncate(value, 6, 4, { marker: '…', truncateAtLength: 11 });
    assert.equal(actual, expected, `live ${value}`);
    assert.equal(referenceLiveTruncate(value), expected, `live reference ${value}`);
  });

  const reviewVectors = [
    { value: '12345678901234567', expected: '12345678901234567' },
    { value: '123456789012345678', expected: '12345678...345678' },
    { value: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678g0', expected: '0xabcdef...5678g0' },
  ];

  reviewVectors.forEach(({ value, expected }) => {
    const actual = display.middleTruncate(value, 8, 6, { marker: '...', truncateAtLength: 17 });
    assert.equal(actual, expected, `review ${value}`);
    assert.equal(core.middleTruncate(value, 8, 6), expected, `review core ${value}`);
    assert.equal(referenceReviewTruncate(value), expected, `review reference ${value}`);
  });
});

test('helper source avoids float formatting primitives', () => {
  const source = fs.readFileSync(
    path.join(appRoot, 'frontend/public/coincard/coin-card-display.js'),
    'utf8'
  );
  assert.equal(source.includes('parseFloat('), false);
  assert.equal(source.includes('.toFixed('), false);
});

test('live wrappers and browser surfaces preserve current accessible values', async () => {
  const cardTruncate = loadFunctionFromSource(path.join(appRoot, 'frontend/public/js/card.js'), 'truncateAddress', {
    CoinCardDisplay: display,
  });
  const laneAbbrev = loadFunctionFromSource(path.join(appRoot, 'frontend/public/coincard/card-acceptance-lane-a.html'), 'abbrev', {
    CoinCardDisplay: display,
  });

  assert.equal(cardTruncate(null), null, 'live card null passthrough');
  assert.equal(cardTruncate(undefined), undefined, 'live card undefined passthrough');
  assert.equal(cardTruncate(''), '', 'live card empty-string passthrough');
  assert.equal(cardTruncate('1234567890'), '1234567890', 'live card length 10 passthrough');
  assert.equal(cardTruncate('12345678901'), '12345678901', 'live card length 11 passthrough');
  assert.equal(cardTruncate('123456789012'), '123456…9012', 'live card length 12 truncation');
  assert.equal(cardTruncate('1234567890123'), '123456…0123', 'live card length 13 truncation');
  assert.equal(cardTruncate('0x1234567890abcdef1234567890abcdef12345678'), '0x1234…5678', 'live card long address truncation');

  assert.equal(laneAbbrev(null), null, 'lane A null passthrough');
  assert.equal(laneAbbrev(undefined), undefined, 'lane A undefined passthrough');
  assert.equal(laneAbbrev(''), '', 'lane A empty-string passthrough');
  assert.equal(laneAbbrev('1234567890'), '1234567890', 'lane A length 10 passthrough');
  assert.equal(laneAbbrev('12345678901'), '12345678901', 'lane A length 11 passthrough');
  assert.equal(laneAbbrev('123456789012'), '123456…9012', 'lane A length 12 truncation');
  assert.equal(laneAbbrev('1234567890123'), '123456…0123', 'lane A length 13 truncation');
  assert.equal(laneAbbrev('0x1234567890abcdef1234567890abcdef12345678'), '0x1234…5678', 'lane A long address truncation');

  const elements = new Map();
  const getMockElement = (id) => {
    if (!elements.has(id)) elements.set(id, makeMockElement());
    return elements.get(id);
  };
  const toSettle = loadFunctionFromSource(path.join(appRoot, 'frontend/public/coincard/card-acceptance-lane-a.html'), 'toSettle', {
    calcFeeWei: (amountWei) => amountWei * 250n / 10000n,
    wrapper: { classList: { add() {}, remove() {} } },
    setPanelOpen() {},
    CHAIN_NAMES_MAP: { 137: 'Polygon' },
    $: getMockElement,
    formatUsdcExact: referenceFormatUsdcExact,
    abbrev: laneAbbrev,
  });

  const settleRecipient = '0x1234567890abcdef1234567890abcdef12345678';
  const settleTxHash = '0x' + 'b'.repeat(64);
  toSettle(BigInt('1500000'), {
    recipient: settleRecipient,
    chainId: 137,
    chainName: 'Polygon',
    token: 'USDC',
  }, settleTxHash);
  assert.equal(getMockElement('settle-recipient').textContent, '0x1234…5678', 'lane A settle recipient visible text remains abbreviated');
  assert.equal(getMockElement('settle-recipient').title, settleRecipient, 'lane A settle recipient retains full title');
  assert.equal(getMockElement('settle-recipient').getAttribute('aria-label'), settleRecipient, 'lane A settle recipient retains full aria-label');

  const secondRecipient = '0xfedcba9876543210fedcba9876543210fedcba98';
  toSettle(BigInt('2500000'), {
    recipient: secondRecipient,
    chainId: 137,
    chainName: 'Polygon',
    token: 'USDC',
  }, settleTxHash);
  assert.equal(getMockElement('settle-recipient').textContent, '0xfedc…ba98', 'lane A settle recipient visible text remains abbreviated after update');
  assert.equal(getMockElement('settle-recipient').title, secondRecipient, 'lane A settle recipient title updates with new destination');
  assert.equal(getMockElement('settle-recipient').getAttribute('aria-label'), secondRecipient, 'lane A settle recipient aria-label updates with new destination');

  const server = await startStaticServer(path.join(appRoot, 'frontend/public'));
  const ethersBundlePath = path.join(appRoot, 'node_modules/ethers/dist/ethers.umd.min.js');
  const ethersBundle = fs.readFileSync(ethersBundlePath, 'utf8');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1600, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith(server.baseUrl)) {
        request.continue();
        return;
      }
      if (url === `file://${ethersBundlePath}` || url.endsWith('/ethers.umd.min.js')) {
        request.respond({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: ethersBundle,
        });
        return;
      }
      if (url.startsWith('data:') || url.startsWith('about:')) {
        request.continue();
        return;
      }
      request.abort();
    });

    await page.goto(`${server.baseUrl}/card.html?cc=cc_demo_implicitex`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#ccCardRecipientField');
    const cardResult = await page.evaluate(() => ({
      visible: document.getElementById('ccCardRecipientField')?.textContent,
      title: document.getElementById('ccCardRecipientField')?.title,
    }));
    assert.equal(cardResult.title, '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919', 'card recipient retains full title');
    assert.equal(cardResult.visible, '0xa7cE…3919', 'card recipient visible truncation');

    await page.goto(`${server.baseUrl}/coincard/card-acceptance-lane-a.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#settle-recipient');
    const laneAResult = await page.evaluate(() => ({
      destinationText: document.getElementById('ival-destination')?.textContent,
      destinationTitle: document.getElementById('ival-destination')?.title,
    }));
    assert.equal(laneAResult.destinationTitle, '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919', 'lane A destination retains full title');
  } finally {
    await browser.close();
    await server.close();
  }
});

(async () => {
  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`ok - ${entry.name}`);
    } catch (err) {
      console.error(`not ok - ${entry.name}`);
      throw err;
    }
  }
})();
