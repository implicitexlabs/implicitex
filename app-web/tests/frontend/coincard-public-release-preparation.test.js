'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app-web');
const publicRoot = path.join(repoRoot, 'coincard/public');
const manifest = JSON.parse(fs.readFileSync(path.join(
  repoRoot,
  'coincard/release/coincard-early-access-release.v1.json',
), 'utf8'));
const firebase = JSON.parse(fs.readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
const verifier = require('../../scripts/verify_coincard_public_release.js');
const deployer = require('../../scripts/deploy_coincard_production.js');

test('early-access release manifest authenticates exact local bytes and Hosting policy', () => {
  const result = verifier.verify();
  assert.equal(result.manifest.releaseId, 'coincard-early-access-2026-08-09');
  assert.equal(result.manifest.status, 'PREPARED_NOT_DEPLOYED');
  assert.equal(result.manifest.artifactSha256, `sha256:${result.artifactSha256}`);
});

test('release contains only the landing, non-transactional example, and shared static assets', () => {
  assert.deepEqual(manifest.files.map((entry) => entry.path), [
    'components/images/coincard-mark.svg',
    'css/site.css',
    'example/index.html',
    'index.html',
    'js/site.js',
  ]);
  assert.equal(manifest.externalState.deployed, false);
  assert.equal(manifest.externalState.dnsChanged, false);
  assert.equal(manifest.externalState.currentHeadChanged, false);
});

test('unfinished claim and send surfaces are excluded and redirected before static resolution', () => {
  const hosting = firebase.hosting.find((entry) => entry.target === 'coincard');
  assert.deepEqual(hosting.redirects, [
    { source: '/claim{,/**}', destination: '/', type: 302 },
    { source: '/send{,/**}', destination: '/', type: 302 },
  ]);
  for (const ignored of verifier.EXPECTED_IGNORES) assert(hosting.ignore.includes(ignored));
  assert.equal(fs.existsSync(path.join(publicRoot, 'js/claim.js')), true, 'future source is preserved');
  assert(manifest.excludedSourceFiles.includes('js/claim.js'));
  const claimSource = fs.readFileSync(path.join(publicRoot, 'js/claim.js'), 'utf8');
  assert.match(claimSource, /'example','demo'/);
});

test('deployed HTML offers early access and an example without acquisition routes', () => {
  const html = manifest.files
    .filter((entry) => entry.path.endsWith('.html'))
    .map((entry) => fs.readFileSync(path.join(publicRoot, entry.path), 'utf8'))
    .join('\n');
  assert(html.includes('Public claiming is not open yet.'));
  assert(html.includes('Demonstration only'));
  assert.doesNotMatch(html, /href=["']\/(?:claim|send)(?:\/|["'#?])/i);
  assert.doesNotMatch(html, /eth_requestAccounts|personal_sign|wallet_switchEthereumChain/);
});

test('deployment wrapper hard-locks the production project and Coin Card target', () => {
  assert.deepEqual(deployer.FIREBASE_ARGS, [
    'deploy',
    '--only',
    'hosting:coincard',
    '--project',
    'production',
  ]);
  assert.equal(deployer.EXECUTE_ARGUMENT, '--execute-production-coincard');
});

test('review mode performs local verification without invoking Firebase', () => {
  const result = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts/deploy_coincard_production.js'),
    '--review',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Locked command: firebase deploy --only hosting:coincard --project production/);
  assert.match(result.stdout, /Locked project: implicitex/);
  assert.match(result.stdout, /Hosting site: implicitex-coincard/);
  assert.match(result.stdout, /no authentication, Firebase request, or deployment performed/);
});

test('deployment wrapper rejects arbitrary project or target arguments before Firebase', () => {
  const result = spawnSync(process.execPath, [
    path.join(appRoot, 'scripts/deploy_coincard_production.js'),
    '--project',
    'default',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /Production deploy denied/);
});
