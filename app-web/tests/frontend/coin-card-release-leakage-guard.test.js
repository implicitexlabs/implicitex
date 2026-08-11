'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  FORBIDDEN_CONTENT_MARKERS,
  assertNoNonProductionAuthorityMaterial,
} = require('../../scripts/coin-card-release-leakage-guard');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-leakage-guard-'));
}

test('clean deployable root passes the non-production authority leakage guard', () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, 'card'));
    fs.writeFileSync(path.join(root, 'index.html'), '<h1>Coin Card</h1>', 'utf8');
    fs.writeFileSync(path.join(root, 'card/runtime.js'), 'window.COIN_CARD = true;', 'utf8');
    const result = assertNoNonProductionAuthorityMaterial(root, 'test root');
    assert.equal(result.fileCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('every non-production marker fails closed inside a deployable root', () => {
  for (const marker of FORBIDDEN_CONTENT_MARKERS) {
    const root = makeRoot();
    try {
      fs.writeFileSync(path.join(root, 'index.html'), `safe-prefix ${marker} safe-suffix`, 'utf8');
      assert.throws(
        () => assertNoNonProductionAuthorityMaterial(root, 'test root'),
        new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('browser fixture artifact filenames fail even without marker content', () => {
  const root = makeRoot();
  try {
    fs.writeFileSync(
      path.join(root, 'coin-card-readonly-vertical-slice.html'),
      '<h1>renamed content would still be unsafe</h1>',
      'utf8',
    );
    assert.throws(
      () => assertNoNonProductionAuthorityMaterial(root, 'test root'),
      /browser fixture artifact path leaked/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
