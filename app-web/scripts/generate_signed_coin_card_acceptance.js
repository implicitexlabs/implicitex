#!/usr/bin/env node
/* generate_signed_coin_card_acceptance.js — signed Coin Card acceptance artifacts
 *
 * Produces a signed package manifest, trusted public-key allowlist, and a
 * lifecycle bundle bound to the signed manifest hash. Private keys are read
 * from protected local files by default, or from explicitly named environment
 * variables when requested. This script must never print private key material.
 */

'use strict';

const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  canonicalizeJson: canonicalizeJsonOrNull,
} = require('../frontend/public/card/coin-card-canonical-json-v1.js');

const subtle = webcrypto.subtle;
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'frontend/public');
const MANIFEST_PATH = path.join(PUBLIC_ROOT, 'card/coin-card-manifest.json');
const TRUSTED_KEYS_OUT = path.join(PUBLIC_ROOT, 'card/coin-card-trusted-keys.js');
const BUNDLE_OUT = path.join(PUBLIC_ROOT, 'card/coin-card-lifecycle-bundle.js');
const CARD_RECORDS_ROOT = path.join(PUBLIC_ROOT, 'registry/coincards');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const DEFAULT_MANIFEST_KEY_ID = 'ix-coin-card-manifest-v1';
const DEFAULT_LIFECYCLE_KEY_ID = 'ix-lifecycle-pub-v1';
const RESERVED_PRODUCTION_KEY_IDS = Object.freeze([
  DEFAULT_MANIFEST_KEY_ID,
  DEFAULT_LIFECYCLE_KEY_ID,
]);
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
  'card/coin-card-canonical-json-v1.js',
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
  'card/index.html',
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

function canonicalizeJson(value) {
  const canonical = canonicalizeJsonOrNull(value);
  if (canonical === null) throw new Error('Cannot canonicalize non-canonical JSON value');
  return canonical;
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

async function sha256File(relativePath, assetOverrides) {
  if (assetOverrides && Object.prototype.hasOwnProperty.call(assetOverrides, relativePath)) {
    return sha256Hex(Buffer.from(assetOverrides[relativePath], 'utf8'));
  }
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

function hasArg(name) {
  return args.includes(name);
}

function readOutputPath(name, fallback) {
  const value = readArgValue(name);
  return value ? path.resolve(value) : fallback;
}

function canonicalExistingPath(filePath) {
  return fs.realpathSync(path.resolve(filePath));
}

function canonicalOutputPath(filePath) {
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved)) return fs.realpathSync(resolved);
  const parsed = path.parse(resolved);
  const missing = [];
  let current = resolved;
  while (!fs.existsSync(current)) {
    if (current === parsed.root) throw new Error(`No existing filesystem ancestor for output path: ${filePath}`);
    missing.unshift(path.basename(current));
    current = path.dirname(current);
  }
  return path.normalize(path.join(fs.realpathSync(current), ...missing));
}

function assertDistinctCanonicalPaths(entries) {
  const seen = new Map();
  for (const entry of entries) {
    if (!entry || !entry.path) continue;
    const existing = seen.get(entry.path);
    if (existing) throw new Error(`${entry.label} path collides with ${existing}: ${entry.displayPath}`);
    seen.set(entry.path, entry.label);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  return value.trim();
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
    return {
      material: fs.readFileSync(filePath, 'utf8').trim(),
      sourceType: 'file',
      sourcePath: path.resolve(filePath),
      canonicalPath: canonicalExistingPath(filePath),
    };
  }
  const selectedEnvName = envName || defaultEnvName;
  if (process.env[selectedEnvName]) {
    return {
      material: process.env[selectedEnvName].trim(),
      sourceType: 'env',
      envName: selectedEnvName,
      canonicalPath: null,
    };
  }
  throw new Error(`${label} private key missing; provide ${fileArg} or ${envArg}`);
}

async function getKey(label, fileArg, envArg, defaultEnvName) {
  const source = readPrivateKeyMaterial(label, fileArg, envArg, defaultEnvName);
  const privateKey = await importPrivateKey(source.material);
  const publicJwk = await publicJwkFromPrivate(privateKey);
  const fingerprint = await sha256Base64Url(Buffer.from(JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y,
  }), 'utf8'));
  return { privateKey, publicJwk, fingerprint, label, source };
}

function getBuildVersion() {
  const buildVersion = readArgValue('--build-version') || process.env.COIN_CARD_ACCEPTANCE_BUILD_VERSION || '';
  if (!buildVersion || buildVersion === 'commit-i' || buildVersion === 'dev') {
    throw new Error('A non-placeholder --build-version or COIN_CARD_ACCEPTANCE_BUILD_VERSION is required');
  }
  return buildVersion;
}

function getSignedAt() {
  const supplied = readArgValue('--signed-at');
  const signedAt = supplied || new Date().toISOString();
  const parsed = Date.parse(signedAt);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== signedAt) {
    throw new Error('--signed-at must be an exact UTC ISO-8601 timestamp');
  }
  return signedAt;
}

function getExpectedSha256Arg(name) {
  const value = readArgValue(name);
  if (!value) return null;
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function samePublicJwk(left, right) {
  return !!left && !!right
    && left.kty === right.kty
    && left.crv === right.crv
    && left.x === right.x
    && left.y === right.y;
}

function publicIdentityKey(publicJwk) {
  return JSON.stringify({
    crv: publicJwk && publicJwk.crv,
    kty: publicJwk && publicJwk.kty,
    x: publicJwk && publicJwk.x,
    y: publicJwk && publicJwk.y,
  });
}

function validateDataOnly(value, label, state = { count: 0, seen: new Set() }, depth = 0) {
  if (value === null) return;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains non-finite number`);
    return;
  }
  if (type === 'function' || type === 'symbol' || type === 'bigint' || type === 'undefined') {
    throw new Error(`${label} contains unsupported ${type}`);
  }
  if (type !== 'object') throw new Error(`${label} contains unsupported ${type}`);
  if (state.seen.has(value)) throw new Error(`${label} contains cycle`);
  if (depth > 32) throw new Error(`${label} exceeds maximum depth`);
  state.count += 1;
  if (state.count > 1000) throw new Error(`${label} exceeds maximum object count`);
  state.seen.add(value);

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw new Error(`${label} contains symbol key`);

  if (Array.isArray(value)) {
    const stringKeys = keys.filter((key) => key !== 'length');
    if (stringKeys.length !== value.length) throw new Error(`${label} contains sparse or custom array properties`);
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, String(index))) throw new Error(`${label} contains sparse array`);
    }
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && Object.getPrototypeOf(proto) !== null) throw new Error(`${label} has custom prototype`);
  }

  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error(`${label} contains accessor`);
    if (typeof descriptor.value === 'function') throw new Error(`${label} contains function`);
    validateDataOnly(descriptor.value, `${label}.${String(key)}`, state, depth + 1);
  }
  state.seen.delete(value);
}

function isValidPublicP256Jwk(publicKey) {
  return isPlainDataObject(publicKey)
    && publicKey.kty === 'EC'
    && publicKey.crv === 'P-256'
    && typeof publicKey.x === 'string'
    && /^[A-Za-z0-9_-]+$/.test(publicKey.x)
    && typeof publicKey.y === 'string'
    && /^[A-Za-z0-9_-]+$/.test(publicKey.y)
    && (!Object.prototype.hasOwnProperty.call(publicKey, 'd'));
}

function isPlainDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    validateDataOnly(value, 'trusted key source value');
    return true;
  } catch (_) {
    return false;
  }
}

function assertIsoTimestampOrNull(value, label) {
  if (value === null) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be an ISO timestamp or null`);
  }
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} timestamp invalid`);
}

function validateTrustedRecord(record, expectedKeyId) {
  if (!isPlainDataObject(record)) throw new Error('trusted key record invalid');
  const required = [
    'schemaVersion',
    'keyId',
    'algorithm',
    'publicKey',
    'issuerId',
    'usage',
    'status',
    'validFrom',
    'validUntil',
    'revokedAt',
    'revocationReason',
    'revocationPolicy',
    'successorKeyId',
    'environment',
  ];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`trusted key record missing ${key}`);
  }
  for (const key of Object.getOwnPropertyNames(record)) {
    if (!required.includes(key)) throw new Error(`trusted key record has unsupported field ${key}`);
  }
  if (record.schemaVersion !== 'coin-card-trusted-key-record.v1') throw new Error('trusted key record schema unsupported');
  if (!assertNonemptyString(record.keyId, 'trusted key ID')) throw new Error('trusted key ID invalid');
  if (expectedKeyId && record.keyId !== expectedKeyId) throw new Error(`trusted key source key mismatch: ${expectedKeyId}`);
  if (record.algorithm !== 'ECDSA_P256_SHA256') throw new Error(`trusted key ${record.keyId} algorithm unsupported`);
  if (!isValidPublicP256Jwk(record.publicKey)) throw new Error(`trusted key ${record.keyId} public key invalid`);
  if (!Array.isArray(record.usage) || record.usage.length < 1) throw new Error(`trusted key ${record.keyId} usage invalid`);
  const usages = new Set(record.usage);
  if (usages.size !== record.usage.length) throw new Error(`trusted key ${record.keyId} usage duplicate`);
  for (const usage of record.usage) {
    if (!['coin-card-manifest-signing', 'coin-card-registry-publication'].includes(usage)) {
      throw new Error(`trusted key ${record.keyId} usage unsupported`);
    }
  }
  if (record.usage.includes('coin-card-manifest-signing') && record.issuerId !== MANIFEST_ISSUER_ID) {
    throw new Error(`trusted key ${record.keyId} issuer invalid for manifest usage`);
  }
  if (record.usage.includes('coin-card-registry-publication') && record.issuerId !== AUTHORITY_ID) {
    throw new Error(`trusted key ${record.keyId} issuer invalid for lifecycle usage`);
  }
  if (record.environment !== ENVIRONMENT) throw new Error(`trusted key ${record.keyId} environment unsupported`);
  if (!['ACTIVE', 'REVOKED', 'EXPIRED'].includes(record.status)) throw new Error(`trusted key ${record.keyId} status invalid`);
  assertIsoTimestampOrNull(record.validFrom, `trusted key ${record.keyId} validFrom`);
  assertIsoTimestampOrNull(record.validUntil, `trusted key ${record.keyId} validUntil`);
  assertIsoTimestampOrNull(record.revokedAt, `trusted key ${record.keyId} revokedAt`);
  if (record.status === 'ACTIVE') {
    if (record.revokedAt !== null || record.revocationReason !== null || record.revocationPolicy !== null) {
      throw new Error(`trusted key ${record.keyId} active record contains revocation data`);
    }
  }
  if (record.successorKeyId !== null && typeof record.successorKeyId !== 'string') {
    throw new Error(`trusted key ${record.keyId} successor invalid`);
  }
  return record;
}

function cloneTrustedRecord(record) {
  return validateTrustedRecord(JSON.parse(JSON.stringify(record)));
}

function loadTrustedRecordsFromFile(filePath) {
  if (!filePath) return [];
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context, { filename: filePath, timeout: 1000 });
  const trustedKeys = context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
  if (!isPlainDataObject(trustedKeys)) {
    throw new Error(`trusted key source unavailable: ${filePath}`);
  }
  return Object.keys(trustedKeys).map((keyId) => cloneTrustedRecord(validateTrustedRecord(trustedKeys[keyId], keyId)));
}

function mergeTrustedRecords(existingRecords, newRecords) {
  const byId = new Map();
  for (const record of existingRecords) {
    const normalized = cloneTrustedRecord(record);
    if (byId.has(normalized.keyId)) throw new Error(`duplicate trusted key ID: ${normalized.keyId}`);
    byId.set(normalized.keyId, normalized);
  }
  for (const record of newRecords) {
    const normalized = cloneTrustedRecord(record);
    const existing = byId.get(normalized.keyId);
    if (existing) {
      if (!samePublicJwk(existing.publicKey, normalized.publicKey)) {
        throw new Error(`trusted key ID already bound to a different public key: ${normalized.keyId}`);
      }
      if (existing.algorithm !== normalized.algorithm) {
        throw new Error(`trusted key ID already bound to different algorithm: ${normalized.keyId}`);
      }
      if (existing.issuerId !== normalized.issuerId || existing.environment !== normalized.environment) {
        throw new Error(`trusted key ID already bound to different issuer/environment: ${normalized.keyId}`);
      }
      const existingUsage = existing.usage.slice().sort().join('\n');
      const nextUsage = normalized.usage.slice().sort().join('\n');
      if (existingUsage !== nextUsage) throw new Error(`trusted key ID already bound to different usage: ${normalized.keyId}`);
      continue;
    }
    byId.set(normalized.keyId, normalized);
  }
  return Array.from(byId.values()).sort((left, right) => compareCodePoints(left.keyId, right.keyId));
}

function uniqueExistingSourcePaths(trustedKeysOut, preserveTrustedKeysFrom, initializeNewTrustSet) {
  const paths = [];
  const add = (filePath) => {
    if (!filePath) return;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) return;
    if (!paths.includes(resolved)) paths.push(resolved);
  };
  add(trustedKeysOut);
  add(preserveTrustedKeysFrom);
  if (paths.length === 0 && !initializeNewTrustSet) {
    throw new Error('existing trusted-key source missing; use --initialize-new-trust-set only for governed fresh initialization');
  }
  return paths;
}

function loadMergedTrustedRecords(sourcePaths) {
  let records = [];
  for (const sourcePath of sourcePaths) {
    records = mergeTrustedRecords(records, loadTrustedRecordsFromFile(sourcePath));
  }
  return records;
}

function assertReservedProductionKeyIdentity(records, manifestKeyId, manifestPublicJwk, lifecycleKeyId, lifecyclePublicJwk, initializeNewTrustSet) {
  const canonicalRecords = fs.existsSync(TRUSTED_KEYS_OUT)
    ? loadTrustedRecordsFromFile(TRUSTED_KEYS_OUT)
    : [];
  const canonicalById = new Map(canonicalRecords.map((record) => [record.keyId, record]));
  const checks = [
    { keyId: manifestKeyId, publicJwk: manifestPublicJwk, usage: 'coin-card-manifest-signing' },
    { keyId: lifecycleKeyId, publicJwk: lifecyclePublicJwk, usage: 'coin-card-registry-publication' },
  ];
  for (const check of checks) {
    if (!RESERVED_PRODUCTION_KEY_IDS.includes(check.keyId)) continue;
    if (initializeNewTrustSet) throw new Error(`reserved production key ID cannot initialize a new trust set: ${check.keyId}`);
    const canonical = canonicalById.get(check.keyId);
    if (!canonical) throw new Error(`canonical reserved trusted key unavailable: ${check.keyId}`);
    if (!samePublicJwk(canonical.publicKey, check.publicJwk)) {
      throw new Error(`reserved production key ID cannot be rebound: ${check.keyId}`);
    }
    if (!canonical.usage.includes(check.usage)) throw new Error(`reserved production key usage mismatch: ${check.keyId}`);
  }
}

function assertSeparateSignerKeys(manifestKey, lifecycleKey) {
  if (manifestKey.source.canonicalPath && lifecycleKey.source.canonicalPath && manifestKey.source.canonicalPath === lifecycleKey.source.canonicalPath) {
    throw new Error('manifest and lifecycle private-key files must be distinct');
  }
  if (samePublicJwk(manifestKey.publicJwk, lifecycleKey.publicJwk) || manifestKey.fingerprint === lifecycleKey.fingerprint) {
    throw new Error('manifest and lifecycle signer keypairs must be distinct');
  }
}

function assertNoIncompatiblePublicIdentityReuse(records) {
  const byIdentity = new Map();
  for (const record of records) {
    const key = publicIdentityKey(record.publicKey);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, record);
      continue;
    }
    const existingUsage = existing.usage.slice().sort().join('\n');
    const recordUsage = record.usage.slice().sort().join('\n');
    if (existingUsage !== recordUsage || existing.issuerId !== record.issuerId || existing.environment !== record.environment) {
      throw new Error(`public key identity reused across incompatible trusted usages: ${existing.keyId} and ${record.keyId}`);
    }
  }
}

function fileGuard(filePath) {
  const resolved = fs.existsSync(path.resolve(filePath))
    ? fs.realpathSync(path.resolve(filePath))
    : canonicalOutputPath(filePath);
  if (!fs.existsSync(resolved)) return { path: resolved, exists: false, size: null, sha256: null };
  const bytes = fs.readFileSync(resolved);
  return {
    path: resolved,
    exists: true,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function createFileGuards(paths) {
  const byPath = new Map();
  for (const filePath of paths) {
    if (!filePath) continue;
    const guard = fileGuard(filePath);
    if (!byPath.has(guard.path)) byPath.set(guard.path, guard);
  }
  return Array.from(byPath.values());
}

function assertGuardsUnchanged(guards) {
  for (const guard of guards) {
    const next = fileGuard(guard.path);
    if (next.exists !== guard.exists || next.size !== guard.size || next.sha256 !== guard.sha256) {
      throw new Error(`source changed before package promotion: ${guard.path}`);
    }
  }
}

function assertPathSafety(paths) {
  assertDistinctCanonicalPaths([
    { label: 'manifest output', path: canonicalOutputPath(paths.manifestOut), displayPath: paths.manifestOut },
    { label: 'trusted-key output', path: canonicalOutputPath(paths.trustedKeysOut), displayPath: paths.trustedKeysOut },
    { label: 'lifecycle-bundle output', path: canonicalOutputPath(paths.lifecycleBundleOut), displayPath: paths.lifecycleBundleOut },
  ]);

  const collisionEntries = [
    { label: 'manifest output', path: canonicalOutputPath(paths.manifestOut), displayPath: paths.manifestOut },
    { label: 'trusted-key output', path: canonicalOutputPath(paths.trustedKeysOut), displayPath: paths.trustedKeysOut },
    { label: 'lifecycle-bundle output', path: canonicalOutputPath(paths.lifecycleBundleOut), displayPath: paths.lifecycleBundleOut },
  ];
  if (paths.manifestKeyFile) collisionEntries.push({ label: 'manifest private-key input', path: canonicalExistingPath(paths.manifestKeyFile), displayPath: paths.manifestKeyFile });
  if (paths.lifecycleKeyFile) collisionEntries.push({ label: 'lifecycle private-key input', path: canonicalExistingPath(paths.lifecycleKeyFile), displayPath: paths.lifecycleKeyFile });
  if (paths.preserveTrustedKeysFrom) collisionEntries.push({ label: 'preserved trusted-key source', path: canonicalExistingPath(paths.preserveTrustedKeysFrom), displayPath: paths.preserveTrustedKeysFrom });

  const seen = new Map();
  for (const entry of collisionEntries) {
    const existing = seen.get(entry.path);
    if (!existing) {
      seen.set(entry.path, entry.label);
      continue;
    }
    if (
      entry.label === 'preserved trusted-key source'
      && existing === 'trusted-key output'
      && canonicalExistingPath(paths.preserveTrustedKeysFrom) === canonicalOutputPath(paths.trustedKeysOut)
    ) {
      continue;
    }
    throw new Error(`${entry.label} path collides with ${existing}: ${entry.displayPath}`);
  }
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
      status:           ${JSON.stringify(record.status)},
      validFrom:        ${JSON.stringify(record.validFrom)},
      validUntil:       ${JSON.stringify(record.validUntil)},
      revokedAt:        ${JSON.stringify(record.revokedAt)},
      revocationReason: ${JSON.stringify(record.revocationReason)},
      revocationPolicy: ${JSON.stringify(record.revocationPolicy)},
      successorKeyId:   ${JSON.stringify(record.successorKeyId)},
      environment:      ${JSON.stringify(record.environment)},
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

async function buildManifestCandidate(buildVersion, manifestKeyId, assetOverrides, signedAt) {
  const assets = [];
  for (const assetPath of PROTECTED_ASSETS.slice().sort()) {
    const override = assetOverrides && Object.prototype.hasOwnProperty.call(assetOverrides, assetPath)
      ? Buffer.from(assetOverrides[assetPath], 'utf8')
      : null;
    assets.push({
      bytes: override ? override.length : fs.statSync(path.join(PUBLIC_ROOT, assetPath)).size,
      path: assetPath,
      sha256: await sha256File(assetPath, assetOverrides),
    });
  }

  const manifest = {
    assets,
    buildVersion,
    coinCardVersion: 'coin-card.v1',
    environment: ENVIRONMENT,
    issuerId: MANIFEST_ISSUER_ID,
    keyId: manifestKeyId,
    layoutVersion: 'coin-card-layout.v1',
    schemaVersion: 'coin-card-manifest.v1',
    scope: 'coin-card-runtime-package',
    signedAt,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      keyId: manifestKeyId,
      issuerId: MANIFEST_ISSUER_ID,
      environment: ENVIRONMENT,
      signedAt,
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      value: '',
    },
  };
  return manifest;
}

async function signManifest(manifestKey, manifest) {
  const canonicalPayload = canonicalizeIntegrityManifestPayload(manifest);
  const sig = await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    manifestKey.privateKey,
    Buffer.from(canonicalPayload, 'utf8'),
  );
  manifest.signature.value = toBase64Url(sig);
  manifest.manifestHash = await sha256Hex(Buffer.from(canonicalizeJson(manifest), 'utf8'));
}

async function protectedAssetSetDigest(assets) {
  return sha256Hex(Buffer.from(canonicalizeJson({
    assetCount: assets.length,
    assets,
  }), 'utf8'));
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

function loadActiveRegistryCards() {
  const cardFiles = fs.readdirSync(CARD_RECORDS_ROOT)
    .filter((name) => name.endsWith('.json') && name !== 'index.json')
    .sort();
  const activeCards = [];
  const seenCardIds = new Set();

  for (const name of cardFiles) {
    const filePath = path.join(CARD_RECORDS_ROOT, name);
    const card = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!card || card.schema !== 'implicitex.coincard.v1') {
      throw new Error(`unsupported Coin Card registry schema: ${name}`);
    }
    if (typeof card.cardId !== 'string' || !card.cardId.trim()) {
      throw new Error(`Coin Card registry record has no cardId: ${name}`);
    }
    if (seenCardIds.has(card.cardId)) {
      throw new Error(`duplicate Coin Card registry cardId: ${card.cardId}`);
    }
    seenCardIds.add(card.cardId);
    if (card.status !== 'active') continue;
    // Route validation — all active cards must have a valid recipient address and chain
    if (typeof card.recipient !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(card.recipient)) {
      throw new Error(`Coin Card registry record has invalid recipient address: ${card.cardId}`);
    }
    if (!Number.isInteger(card.chainId) || card.chainId <= 0) {
      throw new Error(`Coin Card registry record has invalid chainId: ${card.cardId}`);
    }
    if (typeof card.token !== 'string' || !card.token.trim()) {
      throw new Error(`Coin Card registry record has no token: ${card.cardId}`);
    }
    activeCards.push(card);
  }

  if (!activeCards.length) throw new Error('no active Coin Card registry records found');
  return activeCards.sort((left, right) => compareCodePoints(left.cardId, right.cardId));
}

function buildLifecycleRecord(cardId, manifestId, now, lifecycleKeyId, registryVersion) {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: ENVIRONMENT,
    registryVersion,
    recordId: `implicitex-production-r1-${cardId}`,
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
      keyId: lifecycleKeyId,
      authorityId: AUTHORITY_ID,
      signedAt: now,
      value: '',
    },
  };
}

function renderLifecycleBundle(records, generatedAt) {
  const registryVersion = records[records.length - 1].registryVersion;
  const bundle = {
    registrySchemaVersion: 'coin-card-lifecycle-registry-bundle.v1',
    registryId: 'implicitex-production',
    environment: ENVIRONMENT,
    registryVersion,
    generatedAt,
    entries: records,
  };
  return `/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      ${generatedAt}
 * RegistryVersion:  ${registryVersion}
 * ActiveCards:      ${records.map((record) => record.cardId).join(', ')}
 * ManifestId:       ${records[0].manifestId}
 * Signer:           ${records[0].signature.keyId}
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

async function validateCompletePackage(packageData, faultStage) {
  const {
    trustedRecords,
    preservedRecords,
    manifestKey,
    lifecycleKey,
    manifestKeyId,
    lifecycleKeyId,
    trustedKeys,
    manifest,
    record,
    card,
  } = packageData;

  const byId = new Map(trustedRecords.map((trustedRecord) => [trustedRecord.keyId, trustedRecord]));
  const manifestRecord = byId.get(manifestKeyId);
  const lifecycleRecord = byId.get(lifecycleKeyId);
  if (!manifestRecord || !samePublicJwk(manifestRecord.publicKey, manifestKey.publicJwk)) {
    throw new Error('generated manifest trusted-key record does not match supplied key');
  }
  if (!lifecycleRecord || !samePublicJwk(lifecycleRecord.publicKey, lifecycleKey.publicJwk)) {
    throw new Error('generated lifecycle trusted-key record does not match supplied key');
  }
  if (!manifestRecord.usage.includes('coin-card-manifest-signing') || manifestRecord.issuerId !== MANIFEST_ISSUER_ID) {
    throw new Error('generated manifest trusted-key record metadata invalid');
  }
  if (!lifecycleRecord.usage.includes('coin-card-registry-publication') || lifecycleRecord.issuerId !== AUTHORITY_ID) {
    throw new Error('generated lifecycle trusted-key record metadata invalid');
  }
  assertNoIncompatiblePublicIdentityReuse(trustedRecords);
  for (const preserved of preservedRecords) {
    const next = byId.get(preserved.keyId);
    if (!next || JSON.stringify(next) !== JSON.stringify(preserved)) {
      throw new Error(`preserved trusted-key record changed: ${preserved.keyId}`);
    }
  }
  if (faultStage === 'trusted-keys') throw new Error('simulated trusted-key validation failure');

  if (manifest.keyId !== manifestKeyId || manifest.signature.keyId !== manifestKeyId) {
    throw new Error('manifest signer ID mismatch');
  }
  const manifestWithoutHash = JSON.parse(JSON.stringify(manifest));
  delete manifestWithoutHash.manifestHash;
  const recomputedManifestHash = await sha256Hex(Buffer.from(canonicalizeJson(manifestWithoutHash), 'utf8'));
  if (manifest.manifestHash !== recomputedManifestHash) throw new Error('manifest hash mismatch');
  const manifestPayload = Buffer.from(canonicalizeIntegrityManifestPayload(manifest), 'utf8');
  if (!await verifySignature(manifestKey.publicJwk, manifest.signature.value, manifestPayload)) {
    throw new Error('manifest signature package validation failed');
  }
  const paths = new Set();
  for (const asset of manifest.assets) {
    if (paths.has(asset.path)) throw new Error(`duplicate protected asset path: ${asset.path}`);
    paths.add(asset.path);
  }
  const trustedKeyAsset = manifest.assets.find((asset) => asset.path === 'card/coin-card-trusted-keys.js');
  if (!trustedKeyAsset) throw new Error('trusted-key source missing from manifest assets');
  const trustedBytes = Buffer.from(trustedKeys, 'utf8');
  if (trustedKeyAsset.bytes !== trustedBytes.length) throw new Error('trusted-key asset byte count mismatch');
  if (trustedKeyAsset.sha256 !== await sha256Hex(trustedBytes)) throw new Error('trusted-key asset hash mismatch');
  if (faultStage === 'manifest') throw new Error('simulated manifest validation failure');

  if (record.signature.keyId !== lifecycleKeyId) throw new Error('lifecycle signer ID mismatch');
  if (record.manifestId !== manifest.manifestHash) throw new Error('lifecycle manifest binding mismatch');
  if (record.cardId !== card.cardId) throw new Error('lifecycle card ID mismatch');
  if (record.registryId !== 'implicitex-production' || !Number.isInteger(record.registryVersion) || record.registryVersion < 1 || record.authorityId !== AUTHORITY_ID || record.environment !== ENVIRONMENT) {
    throw new Error('lifecycle production metadata mismatch');
  }
  const lifecyclePayload = JSON.parse(JSON.stringify(record));
  delete lifecyclePayload.signature.value;
  const lifecycleBytes = Buffer.concat([
    Buffer.from(LIFECYCLE_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonicalizeJson(lifecyclePayload), 'utf8'),
  ]);
  if (!await verifySignature(lifecycleKey.publicJwk, record.signature.value, lifecycleBytes)) {
    throw new Error('lifecycle signature package validation failed');
  }
  if (faultStage === 'lifecycle') throw new Error('simulated lifecycle validation failure');
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {
    // Best-effort cleanup; rollback errors below remain authoritative.
  }
}

function writePackageOutputs(outputs, options = {}) {
  const prepared = outputs.map((output, index) => {
    const dir = path.dirname(output.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const nonce = `${process.pid}.${Date.now()}.${index}`;
    return {
      label: output.label,
      filePath: output.filePath,
      contents: output.contents,
      tmpPath: path.join(dir, `.${path.basename(output.filePath)}.${nonce}.tmp`),
      existed: fs.existsSync(output.filePath),
      previousContents: fs.existsSync(output.filePath) ? fs.readFileSync(output.filePath) : null,
      promoted: false,
    };
  });

  const restorePreparedOutputs = () => {
    for (const item of prepared.slice().reverse()) {
      if (item.previousContents !== null) {
        fs.writeFileSync(item.filePath, item.previousContents);
      } else if (item.promoted) {
        cleanupFile(item.filePath);
      }
    }
  };

  try {
    for (const item of prepared) fs.writeFileSync(item.tmpPath, item.contents, 'utf8');
    for (const item of prepared) {
      fs.copyFileSync(item.tmpPath, item.filePath);
      item.promoted = true;
      if (options.failAfterLabel === item.label) {
        restorePreparedOutputs();
        throw new Error(`simulated package promotion failure after ${item.label}`);
      }
    }
  } catch (error) {
    restorePreparedOutputs();
    for (const item of prepared) cleanupFile(item.tmpPath);
    throw error;
  } finally {
    for (const item of prepared) {
      cleanupFile(item.tmpPath);
    }
  }
}

async function main() {
  const buildVersion = getBuildVersion();
  const signedAt = getSignedAt();
  const expectedAssetSetDigest = getExpectedSha256Arg('--expected-asset-set-digest');
  const expectedSignaturePayloadDigest = getExpectedSha256Arg('--expected-signature-payload-sha256');
  const manifestKeyId = assertNonemptyString(readArgValue('--manifest-key-id') || DEFAULT_MANIFEST_KEY_ID, 'manifest key ID');
  const lifecycleKeyId = assertNonemptyString(readArgValue('--lifecycle-key-id') || DEFAULT_LIFECYCLE_KEY_ID, 'lifecycle key ID');
  if (manifestKeyId === lifecycleKeyId) throw new Error('manifest and lifecycle key IDs must be distinct');
  const preserveTrustedKeysFrom = readArgValue('--preserve-trusted-keys-from');
  const initializeNewTrustSet = hasArg('--initialize-new-trust-set');
  const testFailPackagePromoteAfter = readArgValue('--test-fail-package-promote-after');
  const testFailValidationStage = readArgValue('--test-fail-validation-stage');
  const testMutateSourceBeforePromote = readArgValue('--test-mutate-source-before-promote');
  if (testFailPackagePromoteAfter && process.env.COIN_CARD_GENERATOR_TEST_FAULTS !== '1') {
    throw new Error('--test-fail-package-promote-after is disabled outside tests');
  }
  if ((testFailValidationStage || testMutateSourceBeforePromote) && process.env.COIN_CARD_GENERATOR_TEST_FAULTS !== '1') {
    throw new Error('test fault hooks are disabled outside tests');
  }
  const manifestOut = readOutputPath('--manifest-out', MANIFEST_PATH);
  const trustedKeysOut = readOutputPath('--trusted-keys-out', TRUSTED_KEYS_OUT);
  const lifecycleBundleOut = readOutputPath('--lifecycle-bundle-out', BUNDLE_OUT);
  const manifestKeyFile = readArgValue('--manifest-key-file');
  const lifecycleKeyFile = readArgValue('--lifecycle-key-file');
  assertPathSafety({
    manifestOut,
    trustedKeysOut,
    lifecycleBundleOut,
    manifestKeyFile,
    lifecycleKeyFile,
    preserveTrustedKeysFrom,
  });
  const trustedSourcePaths = uniqueExistingSourcePaths(trustedKeysOut, preserveTrustedKeysFrom, initializeNewTrustSet);
  const sourceGuards = createFileGuards([
    manifestOut,
    trustedKeysOut,
    lifecycleBundleOut,
    ...trustedSourcePaths,
    ...PROTECTED_ASSETS.map((assetPath) => path.join(PUBLIC_ROOT, assetPath)),
  ]);
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
  assertSeparateSignerKeys(manifestKey, lifecycleKey);

  assertReservedProductionKeyIdentity(
    [],
    manifestKeyId,
    manifestKey.publicJwk,
    lifecycleKeyId,
    lifecycleKey.publicJwk,
    initializeNewTrustSet,
  );
  const existingRecords = loadMergedTrustedRecords(trustedSourcePaths);
  const trustedRecords = mergeTrustedRecords(existingRecords, [
    trustedKeyRecord(manifestKeyId, manifestKey.publicJwk, MANIFEST_ISSUER_ID, ['coin-card-manifest-signing']),
    trustedKeyRecord(lifecycleKeyId, lifecycleKey.publicJwk, AUTHORITY_ID, ['coin-card-registry-publication']),
  ]);
  assertNoIncompatiblePublicIdentityReuse(trustedRecords);
  const trustedKeys = renderTrustedKeys(trustedRecords);

  const manifest = await buildManifestCandidate(buildVersion, manifestKeyId, {
    'card/coin-card-trusted-keys.js': trustedKeys,
  }, signedAt);
  const assetSetDigest = await protectedAssetSetDigest(manifest.assets);
  if (expectedAssetSetDigest && assetSetDigest !== expectedAssetSetDigest) {
    throw new Error(`protected asset-set digest mismatch: expected ${expectedAssetSetDigest}, got ${assetSetDigest}`);
  }
  const manifestPayload = Buffer.from(canonicalizeIntegrityManifestPayload(manifest), 'utf8');
  const signaturePayloadDigest = await sha256Hex(manifestPayload);
  if (expectedSignaturePayloadDigest && signaturePayloadDigest !== expectedSignaturePayloadDigest) {
    throw new Error(`manifest signature-payload digest mismatch: expected ${expectedSignaturePayloadDigest}, got ${signaturePayloadDigest}`);
  }
  await signManifest(manifestKey, manifest);
  if (!await verifySignature(manifestKey.publicJwk, manifest.signature.value, manifestPayload)) {
    throw new Error('manifest signature self-verification failed');
  }

  const now = signedAt;
  const cards = loadActiveRegistryCards();
  const records = [];
  for (let index = 0; index < cards.length; index++) {
    const activeCard = cards[index];
    const record = buildLifecycleRecord(activeCard.cardId, manifest.manifestHash, now, lifecycleKeyId, index + 1);
    record.signature.value = await signLifecycleRecord(lifecycleKey, record);
    const lifecyclePayload = JSON.parse(JSON.stringify(record));
    delete lifecyclePayload.signature.value;
    const lifecycleBytes = Buffer.concat([
      Buffer.from(LIFECYCLE_DOMAIN, 'utf8'),
      Buffer.from([0]),
      Buffer.from(canonicalizeJson(lifecyclePayload), 'utf8'),
    ]);
    if (!await verifySignature(lifecycleKey.publicJwk, record.signature.value, lifecycleBytes)) {
      throw new Error(`lifecycle signature self-verification failed for ${record.cardId}`);
    }
    await validateCompletePackage({
      trustedRecords,
      preservedRecords: existingRecords,
      manifestKey,
      lifecycleKey,
      manifestKeyId,
      lifecycleKeyId,
      trustedKeys,
      manifest,
      record,
      card: activeCard,
    }, testFailValidationStage);
    records.push(record);
  }
  const lifecycleBundle = renderLifecycleBundle(records, now);

  if (testMutateSourceBeforePromote === 'trusted-keys-output') {
    fs.appendFileSync(trustedKeysOut, '\n/* simulated concurrent mutation */\n');
  } else if (testMutateSourceBeforePromote === 'manifest-output') {
    fs.appendFileSync(manifestOut, '\n/* simulated concurrent mutation */\n');
  } else if (testMutateSourceBeforePromote === 'lifecycle-output') {
    fs.appendFileSync(lifecycleBundleOut, '\n/* simulated concurrent mutation */\n');
  } else if (testMutateSourceBeforePromote === 'delete-manifest-output') {
    if (fs.existsSync(manifestOut)) fs.unlinkSync(manifestOut);
  } else if (testMutateSourceBeforePromote === 'create-manifest-output') {
    if (!fs.existsSync(manifestOut)) fs.writeFileSync(manifestOut, 'simulated concurrent creation', 'utf8');
  }
  assertGuardsUnchanged(sourceGuards);

  if (!DRY_RUN) {
    writePackageOutputs([
      { label: 'trusted-keys', filePath: trustedKeysOut, contents: trustedKeys },
      { label: 'manifest', filePath: manifestOut, contents: JSON.stringify(manifest, null, 2) + '\n' },
      { label: 'lifecycle-bundle', filePath: lifecycleBundleOut, contents: lifecycleBundle },
    ], { failAfterLabel: testFailPackagePromoteAfter });
  }

  console.log(`manifest key: ${manifestKeyId}`);
  console.log(`manifest public fingerprint: ${manifestKey.fingerprint}`);
  console.log(`lifecycle key: ${lifecycleKeyId}`);
  console.log(`lifecycle public fingerprint: ${lifecycleKey.fingerprint}`);
  console.log(`buildVersion: ${buildVersion}`);
  console.log(`protected asset-set digest: ${assetSetDigest}`);
  console.log(`manifest signature-payload digest: ${signaturePayloadDigest}`);
  console.log(`manifestHash: ${manifest.manifestHash}`);
  console.log(`lifecycle records: ${records.length}`);
  console.log(`cardIds: ${records.map((record) => record.cardId).join(', ')}`);
}

main().catch((error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});
