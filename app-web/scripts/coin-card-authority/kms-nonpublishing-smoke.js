#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const {
  createHash, createPublicKey, verify,
} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const canonicalJson = require('../../frontend/public/card/coin-card-canonical-json-v1.js');
const { derP256ToP1363 } = require('./strict-der-p256');
const { ROLES, ROLE_PROFILES, createRoleBoundSigner } = require('./authority-roles');
const {
  SCHEMA_V3, USAGES, createTrustedKeyRecord, publicKeyFingerprint,
} = require('./trusted-key-records');
const { signProtectedManifest, verifyProtectedManifest } = require('./protected-manifest-authority');

const MARKER = 'NON_PUBLISHED_KMS_SMOKE';
const ALGORITHM = 'EC_SIGN_P256_SHA256';
const RESOURCE_RE = /^projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+)\/cryptoKeyVersions\/([1-9][0-9]*)$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROLE_BY_USAGE = Object.freeze({
  [USAGES.MANIFEST]: ROLES.MANIFEST,
  [USAGES.REGISTRY_PUBLICATION]: ROLES.REGISTRY_PUBLICATION,
  [USAGES.EXECUTABLE_CURRENT_HEAD]: ROLES.EXECUTABLE_CURRENT_HEAD,
  [USAGES.TRANSACTION_EVIDENCE]: ROLES.TRANSACTION_EVIDENCE,
});
const ISSUER_BY_USAGE = Object.freeze({
  [USAGES.MANIFEST]: 'implicitex',
  [USAGES.REGISTRY_PUBLICATION]: 'implicitex-registry',
  [USAGES.EXECUTABLE_CURRENT_HEAD]: 'implicitex-executable-registry',
  [USAGES.TRANSACTION_EVIDENCE]: 'implicitex-transaction-evidence',
});
const DOMAIN_BY_USAGE = Object.freeze({
  [USAGES.REGISTRY_PUBLICATION]: 'ImplicitEx Coin Card Lifecycle Registry Record v1',
  [USAGES.EXECUTABLE_CURRENT_HEAD]: 'ImplicitEx.CoinCard.ExecutableRegistryHead.v1',
  [USAGES.TRANSACTION_EVIDENCE]: 'ImplicitEx.CoinCard.TransactionEvidence.v2',
});
const GUARDED_REPOSITORY_FILES = Object.freeze([
  'app-web/frontend/public/card/coin-card-manifest.json',
  'app-web/frontend/public/card/coin-card-trusted-keys.js',
  'app-web/frontend/public/card/coin-card-lifecycle-bundle.js',
]);

function parseArgs(argv) {
  const options = { noPublish: false };
  const names = new Set(['project', 'key-version', 'key-id', 'usage', 'verification-time', 'output-dir']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--no-publish') {
      if (options.noPublish) throw new Error('--no-publish repeated');
      options.noPublish = true;
      continue;
    }
    if (!argument.startsWith('--') || !names.has(argument.slice(2))) {
      throw new Error(`unsupported argument: ${argument}`);
    }
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    const property = argument.slice(2).replace(/-([a-z])/g, (_, valuePart) => valuePart.toUpperCase());
    if (options[property]) throw new Error(`${argument} repeated`);
    options[property] = value;
  }
  if (!options.noPublish) throw new Error('--no-publish is mandatory');
  for (const property of ['project', 'keyVersion', 'keyId', 'usage', 'verificationTime', 'outputDir']) {
    if (!options[property]) throw new Error(`missing required --${property.replace(/[A-Z]/g, (v) => `-${v.toLowerCase()}`)}`);
  }
  if (!ROLE_BY_USAGE[options.usage]) throw new Error('unsupported Coin Card authority usage');
  if (!TIMESTAMP_RE.test(options.verificationTime)
    || new Date(options.verificationTime).toISOString() !== options.verificationTime) {
    throw new Error('reviewed verification time must be canonical UTC');
  }
  const resource = RESOURCE_RE.exec(options.keyVersion);
  if (!resource || resource[1] !== options.project) throw new Error('CryptoKeyVersion resource/project mismatch');
  options.resource = Object.freeze({
    project: resource[1], location: resource[2], keyRing: resource[3],
    key: resource[4], version: resource[5], fullName: options.keyVersion,
  });
  return Object.freeze(options);
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function repositoryGuard(repoRoot) {
  return new Map(GUARDED_REPOSITORY_FILES.map((relative) => [relative, hashFile(path.join(repoRoot, relative))]));
}

function assertRepositoryGuard(repoRoot, before) {
  before.forEach((digest, relative) => {
    if (hashFile(path.join(repoRoot, relative)) !== digest) throw new Error(`protected repository state changed: ${relative}`);
  });
}

function safeOutputDirectory(value, repoRoot) {
  const output = fs.realpathSync(value);
  const tmp = fs.realpathSync(os.tmpdir());
  const repo = fs.realpathSync(repoRoot);
  if (!fs.statSync(output).isDirectory()) throw new Error('temporary output path is not a directory');
  if (output === tmp || !output.startsWith(`${tmp}${path.sep}`)) throw new Error('temporary output must be a child of the system temp directory');
  if (output === repo || output.startsWith(`${repo}${path.sep}`)) throw new Error('temporary output cannot be inside the repository');
  if (fs.readdirSync(output).length !== 0) throw new Error('temporary output directory must be empty');
  return output;
}

function gcloudBase(resource) {
  return [
    '--project', resource.project, '--location', resource.location,
    '--keyring', resource.keyRing, '--key', resource.key,
  ];
}

function wireResult(keyId, derBytes) {
  const p1363 = derP256ToP1363(derBytes);
  if (p1363.length !== 64) throw new Error('DER conversion did not produce 64-byte P1363');
  const value = p1363.toString('base64url');
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) throw new Error('P1363 signature is not canonical base64url');
  return Object.freeze({
    mode: 'signed-p256-v1', algorithm: 'ECDSA_P256_SHA256',
    signatureEncoding: 'ieee-p1363', signatureLengthBytes: 64,
    signatureValueEncoding: 'base64url-unpadded', keyId, value,
  });
}

function makeCliSigner(options, output, run) {
  let sequence = 0;
  async function signMessage(message) {
    sequence += 1;
    const inputPath = path.join(output, `smoke-${sequence}.input`);
    const signaturePath = path.join(output, `smoke-${sequence}.signature`);
    fs.writeFileSync(inputPath, Buffer.from(message), { mode: 0o600, flag: 'wx' });
    run('gcloud', [
      'kms', 'asymmetric-sign', ...gcloudBase(options.resource), '--version', options.resource.version,
      '--digest-algorithm', 'sha256', '--input-file', inputPath, '--signature-file', signaturePath,
    ]);
    const encodedDer = fs.readFileSync(signaturePath, 'utf8').trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedDer)) throw new Error('gcloud signature output is not canonical base64');
    return wireResult(options.keyId, Buffer.from(encodedDer, 'base64'));
  }
  return Object.freeze({
    keyId: options.keyId, keyVersionName: options.keyVersion,
    signMessage,
    async signCanonicalPayload(domain, payload) {
      return signMessage(Buffer.concat([Buffer.from(domain), Buffer.from([0]), Buffer.from(payload)]));
    },
  });
}

function verifyDomainArtifact(publicKey, domain, payload, signature) {
  return verify('sha256', Buffer.concat([
    Buffer.from(domain), Buffer.from([0]), Buffer.from(canonicalJson.canonicalizeJson(payload)),
  ]), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
}

async function runSmoke(argv, dependencies = {}) {
  const options = parseArgs(argv);
  const repoRoot = dependencies.repoRoot || path.resolve(__dirname, '../../..');
  const output = safeOutputDirectory(options.outputDir, repoRoot);
  const run = dependencies.run || ((command, commandArgs) => execFileSync(command, commandArgs, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const guard = repositoryGuard(repoRoot);
  const description = JSON.parse(run('gcloud', [
    'kms', 'keys', 'versions', 'describe', options.resource.version,
    ...gcloudBase(options.resource), '--format=json',
  ]));
  if (description.name !== options.keyVersion) throw new Error('described CryptoKeyVersion resource mismatch');
  if (description.algorithm !== ALGORITHM) throw new Error('CryptoKeyVersion algorithm mismatch');
  if (description.state !== 'ENABLED') throw new Error('CryptoKeyVersion is not enabled');

  const pemPath = path.join(output, 'public-key.pem');
  run('gcloud', [
    'kms', 'keys', 'versions', 'get-public-key', options.resource.version,
    ...gcloudBase(options.resource), '--public-key-format=pem', '--output-file', pemPath,
  ]);
  const publicKey = createPublicKey(fs.readFileSync(pemPath));
  const exported = publicKey.export({ format: 'jwk' });
  const publicJwk = {
    kty: exported.kty, crv: exported.crv, x: exported.x, y: exported.y,
    key_ops: ['verify'], ext: true,
  };
  const trustedKeyCandidate = createTrustedKeyRecord({
    schemaVersion: SCHEMA_V3, keyId: options.keyId, publicKey: publicJwk,
    issuerId: ISSUER_BY_USAGE[options.usage], usage: [options.usage],
    validFrom: options.verificationTime, environment: 'production',
  });
  const role = ROLE_BY_USAGE[options.usage];
  if (ROLE_PROFILES[role].usage !== options.usage) throw new Error('authority role/usage mismatch');
  const signer = createRoleBoundSigner({ role, signer: makeCliSigner(options, output, run) });

  let verified;
  let tamperingRejected;
  if (role === ROLES.MANIFEST) {
    const artifact = await signProtectedManifest({
      schemaVersion: 'coin-card-manifest.v1', issuerId: trustedKeyCandidate.issuerId,
      environment: 'production', signedAt: options.verificationTime,
      buildVersion: MARKER, scope: 'non-published-smoke', assets: [],
    }, signer);
    verified = verifyProtectedManifest(artifact, publicJwk);
    const tampered = { ...artifact, buildVersion: `${MARKER}-TAMPERED` };
    tamperingRejected = !verifyProtectedManifest(tampered, publicJwk);
  } else {
    const payload = Object.freeze({
      smokeMarker: MARKER, authorityUsage: options.usage, keyId: options.keyId,
      verificationTime: options.verificationTime, publish: false,
    });
    const signed = await signer.signCanonicalPayload(DOMAIN_BY_USAGE[options.usage], canonicalJson.canonicalizeJson(payload));
    verified = verifyDomainArtifact(publicKey, DOMAIN_BY_USAGE[options.usage], payload, signed.value);
    tamperingRejected = !verifyDomainArtifact(publicKey, DOMAIN_BY_USAGE[options.usage],
      { ...payload, publish: true }, signed.value);
  }
  if (!verified || !tamperingRejected) throw new Error('Coin Card verifier smoke proof failed');
  assertRepositoryGuard(repoRoot, guard);
  const report = Object.freeze({
    marker: MARKER, project: options.project, keyVersion: options.keyVersion,
    keyId: options.keyId, authorityUsage: options.usage, algorithm: ALGORITHM,
    publicKeyFingerprint: publicKeyFingerprint(publicJwk), verified: true,
    tamperingRejected: true, noPublish: true, currentHeadAdvanced: false,
    lifecycleWritten: false, repositoryModified: false, deployableRootWritten: false,
    publicOriginWritten: false, executionEnabled: false,
  });
  fs.writeFileSync(path.join(output, 'smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600, flag: 'wx',
  });
  return report;
}

if (require.main === module) {
  runSmoke(process.argv.slice(2)).then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`KMS non-publishing smoke failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({
  MARKER, ALGORITHM, ROLE_BY_USAGE, parseArgs, wireResult, runSmoke,
});
