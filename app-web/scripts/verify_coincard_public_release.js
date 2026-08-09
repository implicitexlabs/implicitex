#!/usr/bin/env node
/* verify_coincard_public_release.js
 *
 * Read-only Gate 1 verifier for the Coin Card early-access Hosting release.
 * This is a release-integrity fingerprint, not signed routing authority.
 */

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_ROOT = path.join(REPO_ROOT, 'coincard/public');
const FIREBASE_PATH = path.join(REPO_ROOT, 'firebase.json');
const FIREBASE_RC_PATH = path.join(REPO_ROOT, '.firebaserc');
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'coincard/release/coincard-early-access-release.v1.json',
);
const EXPECTED_PREDEPLOY = 'npm --prefix app-web run predeploy:coincard-public';
const EXPECTED_IGNORES = Object.freeze([
  'claim/**',
  'send/**',
  'js/claim.js',
  'css/claim-theme.css',
  'css/coincard.css',
  'components/images/coincard-logo.svg',
  'components/images/lettermark-white.svg',
  'components/images/wordmark-white.svg',
]);
const EXPECTED_EXCLUDED_SOURCE_FILES = Object.freeze([
  'claim/index.html',
  'components/images/coincard-logo.svg',
  'components/images/lettermark-white.svg',
  'components/images/wordmark-white.svg',
  'css/claim-theme.css',
  'css/coincard.css',
  'js/claim.js',
  'send/index.html',
]);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => (
    JSON.stringify(key) + ':' + canonicalJson(value[key])
  )).join(',') + '}';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function walkFiles(root, relative = '') {
  const result = [];
  for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
    const itemRelative = relative ? `${relative}/${name}` : name;
    const itemPath = path.join(root, itemRelative);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) result.push(...walkFiles(root, itemRelative));
    else if (stat.isFile()) result.push(itemRelative);
  }
  return result;
}

function releaseDescriptor(manifest) {
  const descriptor = { ...manifest };
  delete descriptor.artifactSha256;
  return descriptor;
}

function verify() {
  const firebase = JSON.parse(fs.readFileSync(FIREBASE_PATH, 'utf8'));
  const firebaseRc = JSON.parse(fs.readFileSync(FIREBASE_RC_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const hosting = firebase.hosting.find((entry) => entry.target === 'coincard');

  assert(hosting, 'missing coincard Firebase Hosting target');
  assert.equal(hosting.public, 'coincard/public', 'unexpected Coin Card public root');
  assert.deepEqual(hosting.predeploy, [EXPECTED_PREDEPLOY], 'Coin Card predeploy guard drift');
  assert.deepEqual(hosting.redirects, [
    { source: '/claim{,/**}', destination: '/', type: 302 },
    { source: '/send{,/**}', destination: '/', type: 302 },
  ], 'disabled route redirects drift');
  for (const ignored of EXPECTED_IGNORES) {
    assert(hosting.ignore.includes(ignored), `required Hosting exclusion missing: ${ignored}`);
  }

  assert.equal(firebaseRc.projects.production, 'implicitex', 'production project alias drift');
  assert.deepEqual(
    firebaseRc.targets?.implicitex?.hosting?.coincard,
    ['implicitex-coincard'],
    'production Coin Card target binding drift',
  );
  assert.equal(
    firebaseRc.targets?.['implicitex-236f2']?.hosting?.coincard?.includes('implicitex-coincard'),
    false,
    'production Coin Card site must not be bound to the default project',
  );

  assert.equal(manifest.schemaVersion, 'implicitex-coincard-public-release.v1');
  assert.equal(manifest.status, 'PREPARED_NOT_DEPLOYED');
  assert.equal(manifest.environment, 'production');
  assert.equal(manifest.projectId, 'implicitex');
  assert.equal(manifest.hostingSiteId, 'implicitex-coincard');
  assert.equal(manifest.hostingTarget, 'coincard');
  assert.equal(manifest.externalState.firebaseAuthenticated, false);
  assert.equal(manifest.externalState.firebaseResourceChanged, false);
  assert.equal(manifest.externalState.deployed, false);
  assert.equal(manifest.externalState.dnsChanged, false);
  assert.equal(manifest.externalState.currentHeadChanged, false);

  const hostingConfigSha256 = sha256(canonicalJson(hosting));
  assert.equal(
    manifest.hostingConfigSha256,
    `sha256:${hostingConfigSha256}`,
    'Firebase Hosting configuration fingerprint drift',
  );

  const declaredPaths = manifest.files.map((entry) => entry.path);
  assert.deepEqual(declaredPaths, declaredPaths.slice().sort(), 'release files must be sorted');
  assert.equal(new Set(declaredPaths).size, declaredPaths.length, 'duplicate release file');

  const sourceFiles = walkFiles(PUBLIC_ROOT);
  assert.deepEqual(
    manifest.excludedSourceFiles,
    EXPECTED_EXCLUDED_SOURCE_FILES,
    'excluded source policy drift',
  );
  const excludedFiles = new Set(manifest.excludedSourceFiles);
  assert.deepEqual(
    sourceFiles.filter((name) => !excludedFiles.has(name)),
    declaredPaths,
    'deployable public file set differs from frozen release manifest',
  );
  assert.deepEqual(
    sourceFiles.filter((name) => excludedFiles.has(name)),
    manifest.excludedSourceFiles,
    'excluded source file set differs from frozen release manifest',
  );

  for (const entry of manifest.files) {
    assert.match(entry.path, /^(?!\/)(?!.*\.\.)(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/);
    const bytes = fs.readFileSync(path.join(PUBLIC_ROOT, entry.path));
    assert.equal(entry.sha256, `sha256:${sha256(bytes)}`, `${entry.path}: byte hash drift`);
  }

  const deployedHtml = manifest.files
    .filter((entry) => entry.path.endsWith('.html'))
    .map((entry) => fs.readFileSync(path.join(PUBLIC_ROOT, entry.path), 'utf8'))
    .join('\n');
  assert(!/href=["']\/claim(?:\/|["'#?])/i.test(deployedHtml), 'claim acquisition link exposed');
  assert(!/href=["']\/send(?:\/|["'#?])/i.test(deployedHtml), 'unfinished send route exposed');
  assert(!/eth_requestAccounts|personal_sign|wallet_switchEthereumChain/.test(deployedHtml), 'wallet authority exposed');

  const landing = fs.readFileSync(path.join(PUBLIC_ROOT, 'index.html'), 'utf8');
  const example = fs.readFileSync(path.join(PUBLIC_ROOT, 'example/index.html'), 'utf8');
  assert(landing.includes('id="early-access"'), 'landing early-access section missing');
  assert(landing.includes('Public claiming is not open yet.'), 'landing launch posture drift');
  assert(landing.includes('href="/example/"'), 'landing example route missing');
  assert(example.includes('Demonstration only'), 'example disclosure missing');
  assert(example.includes('Sending disabled in example'), 'example execution closure missing');
  assert.equal(fs.existsSync(path.join(PUBLIC_ROOT, '.well-known')), false, 'authority artifact published during Gate 1');

  const artifactSha256 = sha256(canonicalJson(releaseDescriptor(manifest)));
  assert.equal(
    manifest.artifactSha256,
    `sha256:${artifactSha256}`,
    'release artifact fingerprint drift',
  );

  return { manifest, hostingConfigSha256, artifactSha256 };
}

if (require.main === module) {
  try {
    const result = verify();
    console.log('Coin Card public release preparation: PASS');
    console.log(`release: ${result.manifest.releaseId}`);
    console.log(`site: ${result.manifest.hostingSiteId}`);
    console.log(`files: ${result.manifest.files.length}`);
    console.log(`artifact: sha256:${result.artifactSha256}`);
    console.log('external state: unchanged');
  } catch (error) {
    console.error(`Coin Card public release preparation: FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  EXPECTED_IGNORES,
  EXPECTED_EXCLUDED_SOURCE_FILES,
  EXPECTED_PREDEPLOY,
  canonicalJson,
  releaseDescriptor,
  sha256,
  verify,
});
