#!/usr/bin/env node
/* generate_signed_coin_card_acceptance.js — signed Coin Card acceptance artifacts
 *
 * Produces a signed package manifest, trusted public-key allowlist, and a
 * lifecycle bundle bound to the signed manifest hash. Private keys are read
 * from protected local files by default, or from explicitly named environment
 * variables when requested. This script must never print private key material.
 */

'use strict';

const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const subtle = webcrypto.subtle;
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'frontend/public');
const MANIFEST_PATH = path.join(PUBLIC_ROOT, 'card/coin-card-manifest.json');
const TRUSTED_KEYS_OUT = path.join(PUBLIC_ROOT, 'card/coin-card-trusted-keys.js');
const BUNDLE_OUT = path.join(PUBLIC_ROOT, 'card/coin-card-lifecycle-bundle.js');
const CARD_RECORD_PATH = path.join(PUBLIC_ROOT, 'registry/coincards/cc_demo_implicitex.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const MANIFEST_KEY_ID = 'ix-coin-card-manifest-v1';
const LIFECYCLE_KEY_ID = 'ix-lifecycle-pub-v1';
const AUTHORITY_ID = 'implicitex-registry';
const MANIFEST_ISSUER_ID = 'implicitex';
const ENVIRONMENT = 'production';
const VALID_FROM = '2026-07-15T00:00:00.000Z';
const LIFECYCLE_DOMAIN = 'ImplicitEx Coin Card Lifecycle Registry Record v1';

const PROTECTED_ASSETS = Object.freeze([
  'js/ix-execution.js',
  'js/vendor/qrcode.min.js',
  'card/coin-card-trusted-keys.js',
  'card/coin-card-trusted-key-resolution.js',
  'card/coin-card-lifecycle-registry.js',
  'card/coin-card-lifecycle-record-verification.js',
  'card/coin-card-lifecycle-bundle-verification.js',
  'card/coin-card-lifecycle-record-selection.js',
  'card/coin-card-lifecycle-resolution.js',
  'card/coin-card-lifecycle-presentation.js',
  'card/coin-card-execution-authorization.js',
  'card/coin-card-review-projection-contract.js',
  'card/coin-card-verification.js',
  'card/card.js',
  'card/card.css',
]);

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function compareCodePoints(a, b) {
  const aPoints = [...a];
  const bPoints = [...b];
  for (let i = 0; i < Math.min(aPoints.length, bPoints.length); i++) {
    const d = aPoints[i].codePointAt(0) - bPoints[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return aPoints.length - bPoints.length;
}

function escapeString(value) {
  let result = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x22) result += '\\"';
    else if (code === 0x5c) result += '\\\\';
    else if (code === 0x08) result += '\\b';
    else if (code === 0x09) result += '\\t';
    else if (code === 0x0a) result += '\\n';
    else if (code === 0x0c) result += '\\f';
    else if (code === 0x0d) result += '\\r';
    else if (code >= 0 && code <= 0x1f) result += '\\u00' + code.toString(16).padStart(2, '0');
    else result += value[i];
  }
  return result + '"';
}

function canonicalizeJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error(`Non-canonical number: ${value}`);
    return String(value);
  }
  if (typeof value === 'string') return escapeString(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalizeJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort(compareCodePoints).map((key) => (
      escapeString(key) + ':' + canonicalizeJson(value[key])
    )).join(',') + '}';
  }
  throw new Error(`Cannot canonicalize: ${typeof value}`);
}

function canonicalizeIntegrityManifestPayload(manifest) {
  const payload = {};
  Object.keys(manifest).sort().forEach((key) => {
    if (key === 'signature' || key === 'manifestHash') return;
    payload[key] = manifest[key];
  });
  return JSON.stringify(sortForBrowserCanonical(payload));
}

function sortForBrowserCanonical(value) {
  if (Array.isArray(value)) return value.map(sortForBrowserCanonical);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.keys(value).sort().forEach((key) => {
    out[key] = sortForBrowserCanonical(value[key]);
  });
  return out;
}

async function sha256Hex(bytes) {
  const digest = await subtle.digest('SHA-256', bytes);
  return 'sha256:' + Buffer.from(digest).toString('hex');
}

async function sha256Base64Url(bytes) {
  const digest = await subtle.digest('SHA-256', bytes);
  return toBase64Url(digest);
}

async function sha256File(relativePath) {
  return sha256Hex(fs.readFileSync(path.join(PUBLIC_ROOT, relativePath)));
}

async function importPrivateKey(pkcs8B64) {
  return subtle.importKey(
    'pkcs8',
    Buffer.from(pkcs8B64, 'base64'),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
}

async function publicJwkFromPrivate(privateKey) {
  const jwk = await subtle.exportKey('jwk', privateKey);
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, key_ops: ['verify'], ext: true };
}

function readArgValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function assertProtectedFileMode(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`Signing key path is not a file: ${filePath}`);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`Signing key file must not be readable by group/other: ${filePath}`);
  }
}

function readPrivateKeyMaterial(label, fileArg, envArg, defaultEnvName) {
  const filePath = readArgValue(fileArg);
  const envName = readArgValue(envArg);
  if (filePath && envName) {
    throw new Error(`${label} key source must be either ${fileArg} or ${envArg}, not both`);
  }
  if (filePath) {
    assertProtectedFileMode(filePath);
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  const selectedEnvName = envName || defaultEnvName;
  if (process.env[selectedEnvName]) return process.env[selectedEnvName].trim();
  throw new Error(`${label} private key missing; provide ${fileArg} or ${envArg}`);
}

async function getKey(label, fileArg, envArg, defaultEnvName) {
  const raw = readPrivateKeyMaterial(label, fileArg, envArg, defaultEnvName);
  const privateKey = await importPrivateKey(raw);
  const publicJwk = await publicJwkFromPrivate(privateKey);
  const fingerprint = await sha256Base64Url(Buffer.from(JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  }), 'utf8'));
  return { privateKey, publicJwk, fingerprint, label };
}

function getBuildVersion() {
  const buildVersion = readArgValue('--build-version') || process.env.COIN_CARD_ACCEPTANCE_BUILD_VERSION || '';
  if (!buildVersion || buildVersion === 'commit-i' || buildVersion === 'dev') {
    throw new Error('A non-placeholder --build-version or COIN_CARD_ACCEPTANCE_BUILD_VERSION is required');
  }
  return buildVersion;
}

function trustedKeyRecord(keyId, publicJwk, issuerId, usage) {
  return {
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey: publicJwk,
    issuerId,
    usage,
    status: 'ACTIVE',
    validFrom: VALID_FROM,
    validUntil: null,
    revokedAt: null,
    revocationReason: null,
    revocationPolicy: null,
    successorKeyId: null,
    environment: ENVIRONMENT,
  };
}

function renderTrustedKeys(records) {
  const entries = records.map((record) => `    ${JSON.stringify(record.keyId)}: Object.freeze(Object.assign(Object.create(Object.prototype), {
      schemaVersion:    ${JSON.stringify(record.schemaVersion)},
      keyId:            ${JSON.stringify(record.keyId)},
      algorithm:        ${JSON.stringify(record.algorithm)},
      publicKey:        Object.freeze(Object.assign(Object.create(Object.prototype), {
        kty:     ${JSON.stringify(record.publicKey.kty)},
        crv:     ${JSON.stringify(record.publicKey.crv)},
        x:       ${JSON.stringify(record.publicKey.x)},
        y:       ${JSON.stringify(record.publicKey.y)},
        key_ops: Object.freeze(["verify"]),
        ext:     true,
      })),
      issuerId:         ${JSON.stringify(record.issuerId)},
      usage:            Object.freeze([${record.usage.map((u) => JSON.stringify(u)).join(', ')}]),
      status:           "ACTIVE",
      validFrom:        ${JSON.stringify(record.validFrom)},
      validUntil:       null,
      revokedAt:        null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId:   null,
      environment:      "production",
    }))`).join(',\n');

  return `/* coin-card-trusted-keys.js — protected bootstrap for trusted Coin Card key records
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 */

(function () {
  'use strict';

  var trustedPublicKeys = Object.freeze(Object.assign(Object.create(null), {
${entries},
  }));

  Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', {
    value: trustedPublicKeys,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
`;
}

async function buildManifest(manifestKey, buildVersion) {
  const assets = [];
  for (const assetPath of PROTECTED_ASSETS.slice().sort()) {
    assets.push({
      bytes: fs.statSync(path.join(PUBLIC_ROOT, assetPath)).size,
      path: assetPath,
      sha256: await sha256File(assetPath),
    });
  }

  const signedAt = new Date().toISOString();
  const manifest = {
    assets,
    buildVersion,
    coinCardVersion: 'coin-card.v1',
    environment: ENVIRONMENT,
    issuerId: MANIFEST_ISSUER_ID,
    keyId: MANIFEST_KEY_ID,
    layoutVersion: 'coin-card-layout.v1',
    schemaVersion: 'coin-card-manifest.v1',
    scope: 'coin-card-runtime-package',
    signedAt,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      keyId: MANIFEST_KEY_ID,
      issuerId: MANIFEST_ISSUER_ID,
      environment: ENVIRONMENT,
      signedAt,
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      value: '',
    },
  };
  const canonicalPayload = canonicalizeIntegrityManifestPayload(manifest);
  const sig = await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    manifestKey.privateKey,
    Buffer.from(canonicalPayload, 'utf8'),
  );
  manifest.signature.value = toBase64Url(sig);
  manifest.manifestHash = await sha256Hex(Buffer.from(canonicalizeJson(manifest), 'utf8'));
  return manifest;
}

async function signLifecycleRecord(lifecycleKey, record) {
  const payload = JSON.parse(JSON.stringify(record));
  delete payload.signature.value;
  const canonical = canonicalizeJson(payload);
  const combined = Buffer.concat([
    Buffer.from(LIFECYCLE_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
  const sig = await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    lifecycleKey.privateKey,
    combined,
  );
  return toBase64Url(sig);
}

function buildLifecycleRecord(cardId, manifestId, now) {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: ENVIRONMENT,
    registryVersion: 1,
    recordId: `implicitex-production-r1-${cardId.slice(0, 20)}`,
    publishedAt: now,
    cardId,
    manifestId,
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: now,
    effectiveUntil: null,
    supersededByManifestId: null,
    reasonCode: null,
    authorityId: AUTHORITY_ID,
    administrationEvidenceHash: null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: LIFECYCLE_KEY_ID,
      authorityId: AUTHORITY_ID,
      signedAt: now,
      value: '',
    },
  };
}

function renderLifecycleBundle(record, generatedAt) {
  const bundle = {
    registrySchemaVersion: 'coin-card-lifecycle-registry-bundle.v1',
    registryId: 'implicitex-production',
    environment: ENVIRONMENT,
    registryVersion: 1,
    generatedAt,
    entries: [record],
  };
  return `/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      ${generatedAt}
 * RegistryVersion:  1
 * CardId:           ${record.cardId}
 * ManifestId:       ${record.manifestId}
 * RecordId:         ${record.recordId}
 * Signer:           ${record.signature.keyId}
 */

(function () {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (k) { deepFreeze(value[k]); });
    return Object.freeze(value);
  }

  var bundle = deepFreeze(${JSON.stringify(bundle, null, 2).replace(/\n/g, '\n  ')});

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE', {
    value: bundle,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
`;
}

async function verifySignature(publicJwk, signatureValue, bytes) {
  const key = await subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, fromBase64Url(signatureValue), bytes);
}

async function main() {
  const buildVersion = getBuildVersion();
  const manifestKey = await getKey(
    'manifest',
    '--manifest-key-file',
    '--manifest-key-env',
    'COIN_CARD_MANIFEST_PRIVATE_KEY_B64',
  );
  const lifecycleKey = await getKey(
    'lifecycle',
    '--lifecycle-key-file',
    '--lifecycle-key-env',
    'COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64',
  );

  const trustedKeys = renderTrustedKeys([
    trustedKeyRecord(MANIFEST_KEY_ID, manifestKey.publicJwk, MANIFEST_ISSUER_ID, ['coin-card-manifest-signing']),
    trustedKeyRecord(LIFECYCLE_KEY_ID, lifecycleKey.publicJwk, AUTHORITY_ID, ['coin-card-registry-publication']),
  ]);
  if (!DRY_RUN) fs.writeFileSync(TRUSTED_KEYS_OUT, trustedKeys, 'utf8');

  const manifest = await buildManifest(manifestKey, buildVersion);
  const manifestPayload = Buffer.from(canonicalizeIntegrityManifestPayload(manifest), 'utf8');
  if (!await verifySignature(manifestKey.publicJwk, manifest.signature.value, manifestPayload)) {
    throw new Error('manifest signature self-verification failed');
  }
  if (!DRY_RUN) fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const card = JSON.parse(fs.readFileSync(CARD_RECORD_PATH, 'utf8'));
  const now = new Date().toISOString();
  const record = buildLifecycleRecord(card.cardId, manifest.manifestHash, now);
  record.signature.value = await signLifecycleRecord(lifecycleKey, record);
  const lifecyclePayload = JSON.parse(JSON.stringify(record));
  delete lifecyclePayload.signature.value;
  const lifecycleBytes = Buffer.concat([
    Buffer.from(LIFECYCLE_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonicalizeJson(lifecyclePayload), 'utf8'),
  ]);
  if (!await verifySignature(lifecycleKey.publicJwk, record.signature.value, lifecycleBytes)) {
    throw new Error('lifecycle signature self-verification failed');
  }
  if (!DRY_RUN) fs.writeFileSync(BUNDLE_OUT, renderLifecycleBundle(record, now), 'utf8');

  console.log(`manifest key: ${MANIFEST_KEY_ID}`);
  console.log(`manifest public fingerprint: ${manifestKey.fingerprint}`);
  console.log(`lifecycle key: ${LIFECYCLE_KEY_ID}`);
  console.log(`lifecycle public fingerprint: ${lifecycleKey.fingerprint}`);
  console.log(`buildVersion: ${buildVersion}`);
  console.log(`manifestHash: ${manifest.manifestHash}`);
  console.log(`lifecycle recordId: ${record.recordId}`);
  console.log(`cardId: ${card.cardId}`);
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
