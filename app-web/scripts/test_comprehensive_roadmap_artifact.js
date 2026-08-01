'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '..', 'frontend', 'public');
const dataPath = path.join(publicRoot, 'data', 'comprehensive-roadmap.json');
const pdfPath = path.join(
  publicRoot,
  'downloads',
  'implicitex-comprehensive-roadmap-2026-07-30.pdf'
);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf'
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relativePath =
    requestPath === '/' ? 'comprehensive-roadmap.html' : requestPath.slice(1);
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

async function selectView(page, view) {
  await page.click(`.roadmap-view-tabs [data-view-target="${view}"]`);
  await page.waitForFunction(
    (targetView) => {
      const section = document.querySelector(`.roadmap-view[data-view="${targetView}"]`);
      return section && !section.hidden;
    },
    {},
    view
  );
}

async function main() {
  assert(fs.existsSync(dataPath), 'Generated comprehensive-roadmap data is missing.');
  assert(fs.existsSync(pdfPath), 'Generated comprehensive-roadmap PDF is missing.');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.strictEqual(data.meta.totals.roadmapRecords, 289);
  assert.strictEqual(data.meta.totals.fullRecords, 259);
  assert.strictEqual(data.meta.totals.parents, 42);
  assert.strictEqual(data.meta.totals.workPackages, 8);
  assert.strictEqual(data.meta.totals.exclusions, 30);
  assert.strictEqual(
    data.meta.sourceState,
    'Founder-approved WP-01 snapshot (not live authorization)'
  );
  assert.strictEqual(data.meta.generatedFromInventoryRevision, '0.2');
  assert.strictEqual(
    data.meta.projectionBaseCommit,
    '6bf16083de42696680b4301094e1c32c0e5d5181'
  );
  assert.strictEqual(
    data.workPackages.filter((item) => item.fields.State === 'Active change').length,
    1,
    'Exactly one work package must be active.'
  );
  assert(
    data.workPackages[1].fields['Stop rule'].includes('move the decision into WP-03'),
    'WP-02 governance stop rule is missing from generated data.'
  );
  assert(
    data.workPackages[1].fields['Decision-escalation loop'].includes(
      'control returns to WP-02'
    ),
    'WP-02 → WP-03 → WP-02 decision-escalation loop is missing.'
  );
  assert(
    data.records.every(
      (record) =>
        record.fields['Parent user value'] && record.fields['Parent strategic role']
    ),
    'Every detailed record must preserve inherited parent strategy explicitly.'
  );
  const recordById = new Map(data.records.map((record) => [record.id, record]));
  assert.strictEqual(
    recordById.get('GOV-06').evidenceReferences.length,
    0,
    'A file locator without a safely associated revision must remain plain text.'
  );
  assert(
    recordById
      .get('GOV-02')
      .evidenceReferences.some((reference) =>
        reference.href.includes('/blob/ec78178/docs/product/')
      ),
    'GOV-02 file evidence must resolve against its stated commit.'
  );
  assert(
    recordById
      .get('FND-01')
      .evidenceReferences.filter((reference) => reference.kind === 'file')
      .every((reference) => reference.href.includes('/blob/6bf1608/')),
    'FND-01 file evidence must resolve against its stated branch revision.'
  );
  assert.strictEqual(
    recordById
      .get('GOV-04')
      .evidenceReferences.filter((reference) => reference.kind === 'file').length,
    0,
    'A locator with multiple revisions must not infer file-revision relationships.'
  );
  assert(
    data.records
      .flatMap((record) => record.evidenceReferences)
      .filter((reference) => reference.kind === 'file')
      .every(
        (reference) =>
          reference.revision &&
          reference.href.includes(`/blob/${reference.revision}/`) &&
          reference.label.endsWith(`@ ${reference.revision}`)
      ),
    'Every linked file must expose and use its parsed revision.'
  );

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    const localRequestFailures = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('requestfailed', (request) => {
      if (request.url().startsWith(baseUrl)) {
        localRequestFailures.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    const response = await page.goto(`${baseUrl}/comprehensive-roadmap.html`, {
      waitUntil: 'networkidle0'
    });
    assert.strictEqual(response.status(), 200);
    assert.strictEqual(
      await page.title(),
      'ImplicitEx — Comprehensive Roadmap Inventory'
    );
    assert.strictEqual(
      await page.$eval('meta[name="robots"]', (element) => element.content),
      'noindex, nofollow'
    );
    assert.strictEqual(
      await page.$eval('.roadmap-source-card > span', (element) =>
        element.textContent.trim()
      ),
      'Operational overlay · July 30, 2026'
    );
    assert.strictEqual(
      await page.$eval('.roadmap-overlay-evidence', (element) =>
        element.textContent.replace(/\s+/g, ' ').trim()
      ),
      'Evidence eb73070 · 6952cf6 · b2404ce · 9a8b7a9'
    );
    assert.strictEqual(
      await page.$eval('.roadmap-pdf-link', (element) => element.getAttribute('href')),
      '/downloads/implicitex-comprehensive-roadmap-2026-07-30.pdf'
    );
    await page.waitForSelector('.roadmap-package');
    assert.strictEqual(await page.$$eval('.roadmap-package', (items) => items.length), 8);
    assert.strictEqual(
      await page.$$eval('.roadmap-package[data-state="Active change"]', (items) => items.length),
      1
    );
    assert.strictEqual(
      await page.$eval('#package-WP-02', (element) =>
        element.textContent.includes('control returns to WP-02')
      ),
      true
    );
    assert.strictEqual(
      await page.$eval('#projectionState', (element) => element.textContent.trim()),
      'Founder-approved WP-01 snapshot (not live authorization)'
    );
    assert.strictEqual(
      await page.$eval('#inventoryRevision', (element) => element.textContent.trim()),
      '0.2'
    );
    assert.strictEqual(
      await page.$eval('#projectionBaseCommit', (element) => element.textContent.trim()),
      '6bf16083de42696680b4301094e1c32c0e5d5181'
    );
    await assertNoHorizontalOverflow(page, 'desktop command');
    await page.screenshot({
      path: '/tmp/implicitex-comprehensive-roadmap-command-desktop.png',
      fullPage: false
    });

    await selectView(page, 'capabilities');
    assert.strictEqual(await page.$$eval('.roadmap-parent-card', (items) => items.length), 42);
    assert.strictEqual(await page.$$eval('.roadmap-phase-group', (items) => items.length), 10);
    await assertNoHorizontalOverflow(page, 'desktop capabilities');

    await selectView(page, 'records');
    assert.strictEqual(await page.$$eval('.roadmap-record-card', (items) => items.length), 259);
    await page.type('#recordSearch', 'CC-31');
    assert.strictEqual(
      await page.$eval('#recordResultCount', (element) => element.textContent.trim()),
      '1 record'
    );
    assert.strictEqual(
      await page.$eval('#record-CC-31', (element) => !element.classList.contains('is-filtered')),
      true
    );
    await assertNoHorizontalOverflow(page, 'desktop records');

    await selectView(page, 'exclusions');
    assert.strictEqual(await page.$$eval('.roadmap-exclusion', (items) => items.length), 30);
    await assertNoHorizontalOverflow(page, 'desktop exclusions');

    await page.goto(`${baseUrl}/comprehensive-roadmap.html#record-CC-31`, {
      waitUntil: 'networkidle0'
    });
    await page.waitForFunction(() => {
      const section = document.querySelector('[data-view="records"]');
      const record = document.querySelector('#record-CC-31');
      return section && !section.hidden && record && record.open;
    });
    assert.strictEqual(
      await page.$eval('#record-CC-31', (element) => element.open),
      true,
      'Direct record navigation must open the requested detail.'
    );
    await page.goto(`${baseUrl}/comprehensive-roadmap.html#record-FND-01`, {
      waitUntil: 'networkidle0'
    });
    assert.strictEqual(
      await page.$eval('#record-FND-01 .roadmap-record-links .roadmap-card-label', (element) =>
        element.textContent.trim()
      ),
      'Revision-qualified evidence links'
    );
    assert(
      await page.$$eval('#record-FND-01 .roadmap-evidence-list a', (links) =>
        links.every(
          (link) =>
            link.textContent.includes('@ 6bf1608') ||
            link.textContent.includes('docs/product-commercial-roadmap-rev6 @ 6bf1608')
        )
      ),
      'Rendered evidence links must visibly identify their revision.'
    );
    await page.screenshot({
      path: '/tmp/implicitex-comprehensive-roadmap-desktop.png',
      fullPage: false
    });

    await page.emulateMediaType('print');
    assert.strictEqual(
      await page.$eval('.roadmap-main', (element) => getComputedStyle(element).display),
      'none',
      'The interactive snapshot must not be used as the printable roadmap.'
    );
    assert.notStrictEqual(
      await page.$eval('.roadmap-print-block', (element) => getComputedStyle(element).display),
      'none',
      'Print output must show the approved-snapshot notice.'
    );
    assert(
      await page.$eval('.roadmap-print-block', (element) =>
        element.textContent.includes('Approved review snapshot—not the printable roadmap')
      ),
      'The print notice must explain why roadmap printing is disabled.'
    );
    await page.emulateMediaType('screen');

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/comprehensive-roadmap.html`, {
      waitUntil: 'networkidle0'
    });
    await page.waitForSelector('.roadmap-package');
    await assertNoHorizontalOverflow(page, 'mobile command');
    await selectView(page, 'capabilities');
    await page.$eval('#parent-PC-09', (element) => {
      element.open = true;
    });
    await assertNoHorizontalOverflow(page, 'mobile expanded capability');
    await page.screenshot({
      path: '/tmp/implicitex-comprehensive-roadmap-mobile.png',
      fullPage: false
    });

    assert.deepStrictEqual(localRequestFailures, []);
    assert.deepStrictEqual(consoleErrors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  process.stdout.write(
    'Comprehensive roadmap data, navigation, filters, counts, and responsive layouts passed.\n'
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
