#!/usr/bin/env node
/* generate_lifecycle_bundle.js — Coin Card lifecycle publication generator
 *
 * Reads canonical source data and produces two deterministic signed artifacts:
 *
 *   frontend/public/card/coin-card-lifecycle-bundle.js
 *       Sets window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE with one signed
 *       ACTIVE lifecycle record for the demo Coin Card.
 *
 *   frontend/public/card/coin-card-trusted-keys.js
 *       Sets window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS with the public key
 *       that verifies lifecycle records.
 *
 * The private key is read from COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64 in the
 * environment (base64-encoded raw PKCS8 DER). If the env var is absent and
 * --generate-key is passed, a new key pair is generated and the private key
 * is printed to stdout. Do NOT commit the private key to source control.
 *
 * Usage:
 *   node scripts/generate_lifecycle_bundle.js
 *   node scripts/generate_lifecycle_bundle.js --generate-key
 *   node scripts/generate_lifecycle_bundle.js --dry-run
 *
 * Required env vars (unless --generate-key):
 *   COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64   base64-encoded PKCS8 DER private key
 *
 * Inputs read:
 *   frontend/public/card/coin-card-manifest.json   (for manifestHash / manifestId)
 *   frontend/public/registry/coincards/cc_demo_implicitex.json   (for cardId, status)
 *
 * Outputs written (unless --dry-run):
 *   frontend/public/card/coin-card-lifecycle-bundle.js
 *   frontend/public/card/coin-card-trusted-keys.js
 */

'use strict';

const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const subtle = webcrypto.subtle;

/* ----------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------- */
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH       = path.join(ROOT, 'frontend/public/card/coin-card-manifest.json');
const REGISTRY_CARD_PATH  = path.join(ROOT, 'frontend/public/registry/coincards/cc_demo_implicitex.json');
const BUNDLE_OUT_PATH     = path.join(ROOT, 'frontend/public/card/coin-card-lifecycle-bundle.js');
const TRUSTED_KEYS_OUT    = path.join(ROOT, 'frontend/public/card/coin-card-trusted-keys.js');

/* ----------------------------------------------------------------
 * Constants — must match the runtime modules exactly
 * ---------------------------------------------------------------- */
const REGISTRY_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
const RECORD_SCHEMA_VERSION   = 'coin-card-lifecycle-registry-record.v1';
const TRUSTED_KEY_SCHEMA_VERSION = 'coin-card-trusted-key-record.v1';
const REGISTRY_ID             = 'implicitex-production';
const ENVIRONMENT             = 'production';
const AUTHORITY_ID            = 'implicitex-registry';
const KEY_ID                  = 'ix-lifecycle-pub-v1';
const SIGNATURE_DOMAIN        = 'ImplicitEx Coin Card Lifecycle Registry Record v1';

/* ----------------------------------------------------------------
 * Argument parsing
 * ---------------------------------------------------------------- */
const args = process.argv.slice(2);
const GENERATE_KEY = args.includes('--generate-key');
const DRY_RUN      = args.includes('--dry-run');

/* ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */
function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

/* Canonical JSON — must match canonicalizeJson() in coin-card-lifecycle-registry.js */
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
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error(`Non-safe-integer number in canonical JSON: ${value}`);
    }
    return String(value);
  }
  if (typeof value === 'string') {
    return escapeString(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    const props = keys.map((k) => escapeString(k) + ':' + canonicalizeJson(value[k]));
    return '{' + props.join(',') + '}';
  }
  throw new Error(`Cannot canonicalize value: ${typeof value}`);
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

/* ----------------------------------------------------------------
 * Key management
 * ---------------------------------------------------------------- */
async function generateKeyPair() {
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk  = await subtle.exportKey('jwk', keyPair.publicKey);
  const privatePkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    privateKey: keyPair.privateKey,
    publicJwk,
    privatePkcs8B64: Buffer.from(privatePkcs8).toString('base64'),
  };
}

async function importPrivateKey(pkcs8B64) {
  const der = Buffer.from(pkcs8B64, 'base64');
  return subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
}

async function getPublicJwkFromPrivate(privateKey) {
  /* Re-export public key from private */
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  /* We can't directly extract the public from an imported private in Web Crypto.
   * Instead, export the private as JWK and derive the public key components. */
  const jwk = await subtle.exportKey('jwk', privateKey);
  /* The public key JWK has only kty, crv, x, y (no d) */
  return {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    key_ops: ['verify'],
    ext: true,
  };
}

/* ----------------------------------------------------------------
 * Signing
 * ---------------------------------------------------------------- */
async function signRecord(privateKey, record) {
  /* Build payload: record with signature.value removed */
  const payload = JSON.parse(JSON.stringify(record));
  delete payload.signature.value;

  const canonical = canonicalizeJson(payload);
  const domainBytes = Buffer.from(SIGNATURE_DOMAIN, 'utf8');
  const payloadBytes = Buffer.from(canonical, 'utf8');
  const combined = Buffer.concat([domainBytes, Buffer.from([0]), payloadBytes]);

  const sig = await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    combined,
  );

  if (sig.byteLength !== 64) {
    throw new Error(`Expected 64-byte P1363 signature, got ${sig.byteLength}`);
  }

  return toBase64Url(sig);
}

/* ----------------------------------------------------------------
 * Record construction
 * ---------------------------------------------------------------- */
function buildRecord(cardId, manifestId, registryVersion, now, signatureValue) {
  return {
    registryId:           REGISTRY_ID,
    registrySchemaVersion: RECORD_SCHEMA_VERSION,
    environment:          ENVIRONMENT,
    registryVersion,
    recordId:             `${REGISTRY_ID}-r${registryVersion}-${cardId.slice(0, 20)}`,
    publishedAt:          now,
    cardId,
    manifestId,
    revision:             1,
    previousManifestId:   null,
    cardStatus:           'CARD_ACTIVE',
    manifestStatus:       'MANIFEST_CURRENT',
    effectiveFrom:        now,
    effectiveUntil:       null,
    supersededByManifestId: null,
    reasonCode:           null,
    authorityId:          AUTHORITY_ID,
    administrationEvidenceHash: null,
    signature: {
      mode:                  'signed-p256-v1',
      algorithm:             'ECDSA_P256_SHA256',
      signatureEncoding:     'ieee-p1363',
      signatureLengthBytes:  64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId:                 KEY_ID,
      authorityId:           AUTHORITY_ID,
      signedAt:              now,
      value:                 signatureValue,
    },
  };
}

/* ----------------------------------------------------------------
 * Trusted-keys file generation
 * ---------------------------------------------------------------- */
function generateTrustedKeysSource(publicJwk, validFrom) {
  /* Build the frozen key record that coin-card-trusted-key-resolution.js validates */
  const keyRecord = {
    schemaVersion:    TRUSTED_KEY_SCHEMA_VERSION,
    keyId:            KEY_ID,
    algorithm:        'ECDSA_P256_SHA256',
    publicKey:        {
      kty:      publicJwk.kty,
      crv:      publicJwk.crv,
      x:        publicJwk.x,
      y:        publicJwk.y,
      key_ops:  ['verify'],
      ext:      true,
    },
    issuerId:         AUTHORITY_ID,
    usage:            ['coin-card-registry-publication'],
    status:           'ACTIVE',
    validFrom,
    validUntil:       null,
    revokedAt:        null,
    revocationReason: null,
    revocationPolicy: null,
    successorKeyId:   null,
    environment:      ENVIRONMENT,
  };

  return `/* coin-card-trusted-keys.js — protected bootstrap for trusted Coin Card key records
 *
 * This module creates the runtime allowlist used by the Coin Card verifier.
 * GENERATED FILE — do not edit by hand. Run scripts/generate_lifecycle_bundle.js.
 *
 * Key:     ${KEY_ID}
 * Usage:   coin-card-registry-publication
 * ValidFrom: ${validFrom}
 */

(function () {
  'use strict';

  var trustedPublicKeys = Object.freeze(Object.assign(Object.create(null), {
    ${JSON.stringify(KEY_ID, null, 0)}: Object.freeze(Object.assign(Object.create(Object.prototype), {
      schemaVersion:    ${JSON.stringify(keyRecord.schemaVersion)},
      keyId:            ${JSON.stringify(keyRecord.keyId)},
      algorithm:        ${JSON.stringify(keyRecord.algorithm)},
      publicKey:        Object.freeze(Object.assign(Object.create(Object.prototype), {
        kty:     ${JSON.stringify(keyRecord.publicKey.kty)},
        crv:     ${JSON.stringify(keyRecord.publicKey.crv)},
        x:       ${JSON.stringify(keyRecord.publicKey.x)},
        y:       ${JSON.stringify(keyRecord.publicKey.y)},
        key_ops: Object.freeze([${JSON.stringify(keyRecord.publicKey.key_ops[0])}]),
        ext:     true,
      })),
      issuerId:         ${JSON.stringify(keyRecord.issuerId)},
      usage:            Object.freeze([${keyRecord.usage.map((u) => JSON.stringify(u)).join(', ')}]),
      status:           ${JSON.stringify(keyRecord.status)},
      validFrom:        ${JSON.stringify(keyRecord.validFrom)},
      validUntil:       null,
      revokedAt:        null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId:   null,
      environment:      ${JSON.stringify(keyRecord.environment)},
    })),
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

/* ----------------------------------------------------------------
 * Bundle file generation
 * ---------------------------------------------------------------- */
function generateBundleSource(record, generatedAt, registryVersion) {
  const bundle = {
    registrySchemaVersion: REGISTRY_SCHEMA_VERSION,
    registryId:            REGISTRY_ID,
    environment:           ENVIRONMENT,
    registryVersion,
    generatedAt,
    entries:               [record],
  };

  const bundleJson = JSON.stringify(bundle, null, 2);

  return `/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_lifecycle_bundle.js.
 *
 * This file pre-defines IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE before
 * coin-card-lifecycle-registry.js loads. The registry module skips
 * redefining the property when it is already present.
 *
 * GeneratedAt:      ${generatedAt}
 * RegistryVersion:  ${registryVersion}
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

  var bundle = deepFreeze(${bundleJson.replace(/\n/g, '\n  ')});

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE', {
    value: bundle,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
`;
}

/* ----------------------------------------------------------------
 * Main
 * ---------------------------------------------------------------- */
async function main() {
  /* --- 1. Read source data --- */
  const integrityManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const registryCard      = JSON.parse(fs.readFileSync(REGISTRY_CARD_PATH, 'utf8'));

  const manifestId = integrityManifest.manifestHash;
  if (!manifestId || !manifestId.startsWith('sha256:')) {
    throw new Error(`manifestHash in coin-card-manifest.json is missing or malformed: ${manifestId}`);
  }

  const cardId = registryCard.cardId;
  if (!cardId) {
    throw new Error('cardId missing from cc_demo_implicitex.json');
  }
  if (registryCard.status !== 'active') {
    throw new Error(`Card status is not active: ${registryCard.status}. Only active cards can be published.`);
  }

  console.log(`Source card:     ${cardId}`);
  console.log(`Manifest ID:     ${manifestId}`);
  console.log(`Card status:     ${registryCard.status}`);

  /* --- 2. Key material --- */
  let privateKey, publicJwk, privatePkcs8B64;

  if (GENERATE_KEY) {
    console.log('\nGenerating new ECDSA P-256 key pair...');
    ({ privateKey, publicJwk, privatePkcs8B64 } = await generateKeyPair());
    console.log('\n=== PRIVATE KEY (PKCS8 base64) — save to COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64 ===');
    console.log(privatePkcs8B64);
    console.log('=== END PRIVATE KEY ===\n');
  } else {
    const pkcs8B64 = process.env.COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64;
    if (!pkcs8B64) {
      throw new Error(
        'COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64 env var not set.\n'
        + 'Run with --generate-key to create a new key pair.',
      );
    }
    privateKey = await importPrivateKey(pkcs8B64);
    publicJwk  = await getPublicJwkFromPrivate(privateKey);
    console.log('Private key loaded from environment.');
  }

  console.log(`Key ID:          ${KEY_ID}`);
  console.log(`Public key x:    ${publicJwk.x}`);

  /* --- 3. Build and sign record --- */
  const now            = new Date().toISOString();
  const registryVersion = 1;

  /* Build unsigned record first */
  const unsignedRecord = buildRecord(cardId, manifestId, registryVersion, now, '');

  console.log(`\nSigning record...`);
  console.log(`  RecordId:    ${unsignedRecord.recordId}`);
  console.log(`  PublishedAt: ${now}`);

  const signatureValue = await signRecord(privateKey, unsignedRecord);
  unsignedRecord.signature.value = signatureValue;

  const record = unsignedRecord;
  console.log(`  Signature:   ${signatureValue.slice(0, 20)}...`);

  /* --- 4. Verify the signature locally before writing --- */
  console.log('\nVerifying signature locally...');
  const publicKey = await subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const payload = JSON.parse(JSON.stringify(record));
  delete payload.signature.value;
  const canonical = canonicalizeJson(payload);
  const domainBytes = Buffer.from(SIGNATURE_DOMAIN, 'utf8');
  const payloadBytes = Buffer.from(canonical, 'utf8');
  const combined = Buffer.concat([domainBytes, Buffer.from([0]), payloadBytes]);
  const sigBytes = fromBase64Url(signatureValue);

  const valid = await subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    publicKey,
    sigBytes,
    combined,
  );

  if (!valid) {
    throw new Error('FATAL: local signature verification failed — this is a generator bug');
  }
  console.log('Local verification: PASS');

  /* --- 5. Generate output files --- */
  const validFrom = '2026-07-15T00:00:00.000Z'; /* Key validity start */
  const trustedKeysSource = generateTrustedKeysSource(publicJwk, validFrom);
  const bundleSource      = generateBundleSource(record, now, registryVersion);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no files written ===');
    console.log('\n--- coin-card-trusted-keys.js ---');
    console.log(trustedKeysSource);
    console.log('\n--- coin-card-lifecycle-bundle.js ---');
    console.log(bundleSource);
    return;
  }

  fs.writeFileSync(TRUSTED_KEYS_OUT, trustedKeysSource, 'utf8');
  console.log(`\nWrote: ${TRUSTED_KEYS_OUT}`);

  fs.writeFileSync(BUNDLE_OUT_PATH, bundleSource, 'utf8');
  console.log(`Wrote: ${BUNDLE_OUT_PATH}`);

  console.log('\nDone. Run the test suite to verify:');
  console.log('  node tests/frontend/coin-card-lifecycle-publication.test.js');
  console.log('  npm run test:coin-card-verification');
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
