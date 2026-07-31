'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const publicRoot = path.resolve(__dirname, '..', 'frontend', 'public');
const dataPath = path.join(publicRoot, 'data', 'comprehensive-roadmap.json');
const pdfPath = path.join(
  publicRoot,
  'downloads',
  'implicitex-comprehensive-roadmap-2026-07-30.pdf'
);

function command(name, args) {
  return childProcess.execFileSync(name, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
}

function assertEveryIdAppears(text, items, label) {
  const missing = items.map((item) => item.id).filter((id) => !text.includes(id));
  assert.deepStrictEqual(missing, [], `PDF is missing ${label}: ${missing.join(', ')}`);
}

function main() {
  assert(fs.existsSync(dataPath), 'Generated comprehensive-roadmap data is missing.');
  assert(fs.existsSync(pdfPath), 'Generated comprehensive roadmap PDF is missing.');

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const pdf = fs.readFileSync(pdfPath);
  assert.strictEqual(pdf.subarray(0, 4).toString(), '%PDF');
  assert(pdf.length > 500000, `PDF is unexpectedly small: ${pdf.length} bytes`);

  const info = command('pdfinfo', [pdfPath]);
  const pageMatch = info.match(/^Pages:\s+(\d+)$/m);
  assert(pageMatch, 'pdfinfo did not report a page count.');
  const pageCount = Number(pageMatch[1]);
  assert(pageCount >= 100, `PDF page count is unexpectedly low: ${pageCount}`);
  assert(
    info.includes('Title:           ImplicitEx Comprehensive Roadmap — July 30, 2026'),
    'PDF title metadata is missing or incorrect.'
  );

  const text = command('pdftotext', ['-layout', pdfPath, '-']);
  [
    'The complete founder-approved roadmap inventory',
    'July 30, 2026',
    'WP-02 · Active / paused',
    'Founder-approved WP-01 inventory snapshot',
    'Eight-package V1 critical path',
    '42 parent capabilities',
    '259 detailed roadmap records',
    '30 explicit exclusions',
    '937c7c7',
    'eb73070',
    '6952cf6',
    'b2404ce',
    '9a8b7a9'
  ].forEach((expected) => {
    assert(text.includes(expected), `PDF text is missing: ${expected}`);
  });

  assertEveryIdAppears(text, data.workPackages, 'work-package IDs');
  assertEveryIdAppears(text, data.parents, 'parent-capability IDs');
  assertEveryIdAppears(text, data.records, 'detailed-record IDs');
  assertEveryIdAppears(text, data.exclusions, 'exclusion IDs');

  process.stdout.write(
    `Comprehensive roadmap PDF passed: ${pageCount} pages, ${pdf.length} bytes, ` +
      `${data.meta.totals.roadmapRecords} roadmap records.\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
