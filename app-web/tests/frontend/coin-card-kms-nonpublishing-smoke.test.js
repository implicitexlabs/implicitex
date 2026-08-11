'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { runSmoke, parseArgs } = require('../../scripts/coin-card-authority/kms-nonpublishing-smoke');
const { USAGES } = require('../../scripts/coin-card-authority/trusted-key-records');

const repoRoot = path.resolve(__dirname, '../../..');
const project = 'coincard-prod';

function argv(usage, outputDir, extra = []) {
  return [
    '--project', project,
    '--key-version', `projects/${project}/locations/global/keyRings/coincard-production-authority/cryptoKeys/smoke/cryptoKeyVersions/1`,
    '--key-id', `non-production-smoke-${usage}`,
    '--usage', usage,
    '--verification-time', '2026-08-11T12:00:00.000Z',
    '--output-dir', outputDir,
    '--no-publish', ...extra,
  ];
}

function mockRunner(pair, algorithm = 'EC_SIGN_P256_SHA256') {
  return (command, args) => {
    assert.equal(command, 'gcloud');
    if (args.includes('describe')) {
      const version = args[args.indexOf('describe') + 1];
      return JSON.stringify({
        name: `projects/${project}/locations/global/keyRings/coincard-production-authority/cryptoKeys/smoke/cryptoKeyVersions/${version}`,
        algorithm, state: 'ENABLED',
      });
    }
    if (args.includes('get-public-key')) {
      fs.writeFileSync(args[args.indexOf('--output-file') + 1], pair.publicKey.export({ type: 'spki', format: 'pem' }));
      return '';
    }
    if (args.includes('asymmetric-sign')) {
      const message = fs.readFileSync(args[args.indexOf('--input-file') + 1]);
      const der = sign('sha256', message, { key: pair.privateKey, dsaEncoding: 'der' });
      fs.writeFileSync(args[args.indexOf('--signature-file') + 1], der.toString('base64'));
      return '';
    }
    throw new Error(`unexpected mock command: ${args.join(' ')}`);
  };
}

test('smoke driver refuses publication-capable, incomplete, mismatched, or ambiguous invocations', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-kms-smoke-'));
  assert.throws(() => parseArgs(argv(USAGES.MANIFEST, output).filter((value) => value !== '--no-publish')), /mandatory/);
  assert.throws(() => parseArgs(argv('coin-card-lifecycle-administration', output)), /unsupported.*usage/);
  const wrongProject = argv(USAGES.MANIFEST, output);
  wrongProject[1] = 'wrong-project';
  assert.throws(() => parseArgs(wrongProject), /resource\/project mismatch/);
  assert.throws(() => parseArgs([...argv(USAGES.MANIFEST, output), '--usage', USAGES.MANIFEST]), /repeated/);
});

test('mocked live-KMS boundary verifies every role and proves tampering without publishing', async () => {
  for (const usage of [
    USAGES.MANIFEST, USAGES.REGISTRY_PUBLICATION,
    USAGES.EXECUTABLE_CURRENT_HEAD, USAGES.TRANSACTION_EVIDENCE,
  ]) {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-kms-smoke-'));
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const report = await runSmoke(argv(usage, output), { repoRoot, run: mockRunner(pair) });
    assert.equal(report.authorityUsage, usage);
    assert.equal(report.verified, true);
    assert.equal(report.tamperingRejected, true);
    assert.equal(report.noPublish, true);
    assert.equal(report.currentHeadAdvanced, false);
    assert.equal(report.lifecycleWritten, false);
    assert.equal(report.repositoryModified, false);
    assert.equal(report.deployableRootWritten, false);
    assert.equal(report.publicOriginWritten, false);
    assert.equal(report.executionEnabled, false);
    assert.equal(fs.existsSync(path.join(output, 'smoke-report.json')), true);
  }
});

test('smoke driver fails closed on KMS algorithm mismatch and nonempty output directories', async () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-kms-smoke-'));
  await assert.rejects(runSmoke(argv(USAGES.MANIFEST, output), {
    repoRoot, run: mockRunner(pair, 'EC_SIGN_P384_SHA384'),
  }), /algorithm mismatch/);
  const occupied = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-kms-smoke-'));
  fs.writeFileSync(path.join(occupied, 'unexpected'), 'x');
  await assert.rejects(runSmoke(argv(USAGES.MANIFEST, occupied), {
    repoRoot, run: mockRunner(pair),
  }), /must be empty/);
});
