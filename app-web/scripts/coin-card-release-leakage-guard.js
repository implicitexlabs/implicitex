'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FORBIDDEN_CONTENT_MARKERS = Object.freeze([
  'NON_PRODUCTION_TEST_FIXTURE',
  'coin-card-readonly-non-production-test-key',
  'non-production-kms-compatible-test-key',
  'PRIVATE_JWK',
  'coin-card-readonly-non-production-fixtures',
  'coin-card-readonly-vertical-slice',
]);

const FORBIDDEN_PATH_MARKERS = Object.freeze([
  'coin-card-readonly-non-production-fixtures',
  'coin-card-readonly-vertical-slice',
]);

function walkFiles(root, relative = '') {
  const files = [];
  for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
    const itemRelative = relative ? `${relative}/${name}` : name;
    const itemPath = path.join(root, itemRelative);
    const stat = fs.lstatSync(itemPath);
    assert.equal(stat.isSymbolicLink(), false, `${itemRelative}: symlink denied in deployable root`);
    if (stat.isDirectory()) files.push(...walkFiles(root, itemRelative));
    else if (stat.isFile()) files.push(itemRelative);
  }
  return files;
}

function assertNoNonProductionAuthorityMaterial(root, label = 'deployable Coin Card root') {
  const canonicalRoot = fs.realpathSync(root);
  assert(fs.statSync(canonicalRoot).isDirectory(), `${label}: root is not a directory`);
  const files = walkFiles(canonicalRoot);
  for (const relativePath of files) {
    const normalized = relativePath.replace(/\\/g, '/');
    for (const marker of FORBIDDEN_PATH_MARKERS) {
      assert.equal(
        normalized.includes(marker),
        false,
        `${label}: browser fixture artifact path leaked: ${relativePath}`,
      );
    }
    const bytes = fs.readFileSync(path.join(canonicalRoot, relativePath));
    for (const marker of FORBIDDEN_CONTENT_MARKERS) {
      assert.equal(
        bytes.includes(Buffer.from(marker, 'utf8')),
        false,
        `${label}: forbidden non-production authority marker ${marker} in ${relativePath}`,
      );
    }
  }
  return Object.freeze({ root: canonicalRoot, fileCount: files.length });
}

module.exports = Object.freeze({
  FORBIDDEN_CONTENT_MARKERS,
  FORBIDDEN_PATH_MARKERS,
  assertNoNonProductionAuthorityMaterial,
});
