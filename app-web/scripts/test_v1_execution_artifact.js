'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '..', 'frontend', 'public');
const pdfPath = path.join(
  publicRoot,
  'downloads',
  'implicitex-v1-execution-plan-rev6.pdf'
);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf'
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? 'v1-execution.html' : requestPath.slice(1);
  const resolved = path.resolve(publicRoot, relativePath);
  return resolved.startsWith(publicRoot + path.sep) ? resolved : null;
}

function createServer() {
  return http.createServer((request, response) => {
    const filePath = resolveRequestPath(request.url);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert(
    dimensions.scrollWidth <= dimensions.clientWidth + 1,
    `${label} layout overflows horizontally: ${JSON.stringify(dimensions)}`
  );
}

async function main() {
  assert(fs.existsSync(pdfPath), 'Generated V1 execution PDF is missing.');
  assert(
    fs.readFileSync(pdfPath, { encoding: null, flag: 'r' }).subarray(0, 4).toString() === '%PDF',
    'V1 execution download is not a PDF.'
  );

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const failedRequests = [];
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()}`);
    });

    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    const response = await page.goto(`${baseUrl}/v1-execution.html`, {
      waitUntil: 'networkidle0'
    });
    assert.strictEqual(response.status(), 200);
    assert.strictEqual(await page.title(), 'ImplicitEx — V1 Execution Plan');
    assert.strictEqual(
      await page.$$eval('[data-check]', (elements) => elements.length),
      32
    );
    assert.strictEqual(
      await page.$eval('#checklistProgress', (element) => element.textContent.trim()),
      '0 of 32 complete'
    );
    assert.strictEqual(
      await page.$eval('.v1-nav-download', (element) => element.getAttribute('href')),
      '/downloads/implicitex-v1-execution-plan-rev6.pdf'
    );
    assert.strictEqual(
      await page.$eval('meta[name="robots"]', (element) => element.getAttribute('content')),
      'noindex, nofollow'
    );
    await assertNoHorizontalOverflow(page, 'desktop');
    await page.screenshot({
      path: '/tmp/implicitex-v1-execution-desktop.png',
      fullPage: true
    });

    await page.click('[data-check]');
    assert.strictEqual(
      await page.$eval('#checklistProgress', (element) => element.textContent.trim()),
      '1 of 32 complete'
    );
    await page.reload({ waitUntil: 'networkidle0' });
    assert.strictEqual(
      await page.$eval('[data-check]', (element) => element.checked),
      true
    );

    await page.goto(`${baseUrl}/v1-execution.html?pdf=1`, {
      waitUntil: 'networkidle0'
    });
    assert.strictEqual(
      await page.$$eval('[data-check]:checked', (elements) => elements.length),
      0,
      'PDF rendering must ignore saved checklist state.'
    );

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/v1-execution.html`, { waitUntil: 'networkidle0' });
    await assertNoHorizontalOverflow(page, 'mobile');
    await page.screenshot({
      path: '/tmp/implicitex-v1-execution-mobile.png',
      fullPage: true
    });

    const pdfResponse = await page.goto(
      `${baseUrl}/downloads/implicitex-v1-execution-plan-rev6.pdf`,
      { waitUntil: 'networkidle0' }
    );
    assert.strictEqual(pdfResponse.status(), 200);
    assert.strictEqual(
      pdfResponse.headers()['content-type'],
      'application/pdf'
    );
    assert.deepStrictEqual(failedRequests, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  process.stdout.write('V1 execution HTML and PDF artifact checks passed.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
