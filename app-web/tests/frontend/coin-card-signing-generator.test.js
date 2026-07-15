const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app-web');
const generatorPath = path.join(appRoot, 'scripts/generate_signed_coin_card_acceptance.js');
const generatedArtifactPaths = [
  path.join(appRoot, 'frontend/public/card/coin-card-manifest.json'),
  path.join(appRoot, 'frontend/public/card/coin-card-trusted-keys.js'),
  path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-bundle.js'),
];

function runGenerator(args = [], env = {}) {
  return spawnSync(process.execPath, [generatorPath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      COIN_CARD_MANIFEST_PRIVATE_KEY_B64: '',
      COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64: '',
      COIN_CARD_ACCEPTANCE_BUILD_VERSION: '',
      ...env,
    },
  });
}

test('signing generator has no private-key generation or disclosure path', () => {
  const source = fs.readFileSync(generatorPath, 'utf8');

  assert.equal(source.includes('--generate-keys'), false);
  assert.equal(source.includes('generateKeyPair'), false);
  assert.equal(source.includes('privatePkcs8'), false);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*PRIVATE/i);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*process\.env/i);
});

test('signing generator fails safely when signing keys are absent', () => {
  const result = runGenerator(['--build-version', 'acceptance-test']);
  const output = result.stdout + result.stderr;

  assert.notEqual(result.status, 0);
  assert.match(output, /manifest private key missing/);
  assert.doesNotMatch(output, /MIGH|BEGIN PRIVATE|PRIVATE_KEY_B64=.*[A-Za-z0-9+/=]/);
});

test('signing generator rejects placeholder build identity before signing', () => {
  const result = runGenerator(['--build-version', 'commit-i']);
  const output = result.stdout + result.stderr;

  assert.notEqual(result.status, 0);
  assert.match(output, /non-placeholder --build-version/);
  assert.doesNotMatch(output, /MIGH|BEGIN PRIVATE/);
});

test('generated signing artifacts contain no private key material', () => {
  for (const artifactPath of generatedArtifactPaths) {
    const source = fs.readFileSync(artifactPath, 'utf8');
    assert.doesNotMatch(source, /"d"\s*:/, artifactPath);
    assert.doesNotMatch(source, /MIGH|BEGIN PRIVATE|PRIVATE KEY/, artifactPath);
  }
});
