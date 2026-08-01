#!/usr/bin/env node
/* verify_coin_card_release_gate.js — fail-closed Coin Card deployment gate
 *
 * Verifies the exact bytes in frontend/public, authenticates the signed
 * lifecycle bundle, and requires one current lifecycle record for every
 * ACTIVE static registry card. This command is read-only.
 */

'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(APP_ROOT, 'frontend/public');
const CARD_ROOT = path.join(PUBLIC_ROOT, 'card');
const REGISTRY_ROOT = path.join(PUBLIC_ROOT, 'registry/coincards');
const MANIFEST_PATH = path.join(CARD_ROOT, 'coin-card-manifest.json');

const RUNTIME_MODULES = Object.freeze([
  'coin-card-trusted-keys.js',
  'coin-card-trusted-key-resolution.js',
  'coin-card-verification.js',
  'coin-card-lifecycle-bundle.js',
  'coin-card-lifecycle-registry.js',
  'coin-card-lifecycle-record-verification.js',
  'coin-card-lifecycle-bundle-verification.js',
  'coin-card-lifecycle-record-selection.js',
  'coin-card-lifecycle-resolution.js',
  'coin-card-lifecycle-presentation.js',
]);

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function loadRuntime() {
  const context = {
    Buffer,
    Date,
    Promise,
    String,
    TextEncoder,
    Uint8Array,
    atob: nodeAtob,
    btoa: nodeBtoa,
    window: {},
  };
  context.globalThis = context;
  context.window.Date = Date;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = webcrypto;

  for (const name of RUNTIME_MODULES) {
    const filePath = path.join(CARD_ROOT, name);
    vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
  }
  return context.window;
}

function readActiveRegistryCards() {
  const activeCards = [];
  const seen = new Set();
  for (const name of fs.readdirSync(REGISTRY_ROOT).sort()) {
    if (!name.endsWith('.json') || name === 'index.json') continue;
    const card = JSON.parse(fs.readFileSync(path.join(REGISTRY_ROOT, name), 'utf8'));
    assert.equal(card.schema, 'implicitex.coincard.v1', `${name}: unsupported registry schema`);
    assert.equal(typeof card.cardId, 'string', `${name}: missing cardId`);
    assert(card.cardId.length > 0, `${name}: empty cardId`);
    assert.equal(path.basename(name, '.json'), card.cardId, `${name}: filename/cardId mismatch`);
    assert(!seen.has(card.cardId), `${name}: duplicate cardId`);
    seen.add(card.cardId);
    if (card.status === 'active') activeCards.push(card);
  }
  assert(activeCards.length > 0, 'no ACTIVE Coin Card registry records found');
  return activeCards.sort((left, right) => left.cardId.localeCompare(right.cardId));
}

function resolvePublicAsset(assetPath) {
  assert.equal(typeof assetPath, 'string', 'asset path must be a string');
  assert(!path.isAbsolute(assetPath), `absolute asset path denied: ${assetPath}`);
  const resolved = path.resolve(PUBLIC_ROOT, assetPath);
  assert(
    resolved.startsWith(PUBLIC_ROOT + path.sep),
    `asset path escapes frontend/public: ${assetPath}`,
  );
  return resolved;
}

async function verifyExactManifest(runtime, manifest) {
  const verification = runtime.IX_COIN_CARD_VERIFICATION;
  const result = await verification.loadIntegrityManifest(
    'card/coin-card-manifest.json',
    async (url) => {
      if (url === 'card/coin-card-manifest.json') {
        return { ok: true, json: async () => manifest };
      }
      const assetPath = resolvePublicAsset(url);
      if (!fs.existsSync(assetPath)) return { ok: false };
      return {
        ok: true,
        arrayBuffer: async () => {
          const bytes = fs.readFileSync(assetPath);
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      };
    },
  );
  assert.equal(
    result.state,
    'VERIFIED',
    `protected artifact verification failed: ${result.state} ${result.error || ''} ${result.assetPath || ''}`,
  );

  const required = Array.from(verification.getRequiredAssetPaths()).sort();
  const declared = manifest.assets.map((asset) => asset.path).sort();
  assert.deepEqual(declared, required, 'manifest assets differ from runtime protected-asset policy');
  return result;
}

async function verifyLifecycle(runtime, manifest, activeCards) {
  const bundle = runtime.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;
  const bundleVerifier = runtime.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION;
  const selector = runtime.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION;
  const resolver = runtime.IX_COIN_CARD_LIFECYCLE_RESOLUTION;
  const presenter = runtime.IX_COIN_CARD_LIFECYCLE_PRESENTATION;
  const proof = await bundleVerifier.authenticateLifecycleRegistryBundle(bundle);
  assert.equal(
    proof.authenticated,
    true,
    `lifecycle bundle authentication failed: ${proof.outcome} ${proof.reason || ''}`,
  );

  const activeCardIds = new Set(activeCards.map((card) => card.cardId));
  const currentEntries = bundle.entries.filter((entry) => (
    entry.cardStatus === 'CARD_ACTIVE'
    && entry.manifestStatus === 'MANIFEST_CURRENT'
  ));
  const currentCounts = new Map();
  for (const entry of currentEntries) {
    assert.equal(
      entry.manifestId,
      manifest.manifestHash,
      `${entry.cardId}: current lifecycle record is not bound to current manifest`,
    );
    assert(
      activeCardIds.has(entry.cardId),
      `${entry.cardId}: current ACTIVE lifecycle has no ACTIVE registry card`,
    );
    currentCounts.set(entry.cardId, (currentCounts.get(entry.cardId) || 0) + 1);
  }

  for (const card of activeCards) {
    assert.equal(
      currentCounts.get(card.cardId),
      1,
      `${card.cardId}: expected exactly one current signed lifecycle record`,
    );
    const selected = selector.selectLifecycleEvidence(proof, {
      cardId: card.cardId,
      manifestId: manifest.manifestHash,
    });
    assert.equal(
      selected.outcome,
      'LIFECYCLE_EVIDENCE_SELECTED',
      `${card.cardId}: lifecycle selection failed: ${selected.outcome} ${selected.reason || ''}`,
    );
    const resolved = resolver.resolveLifecycle(selected);
    assert.equal(
      resolved.outcome,
      'LIFECYCLE_ACTIVE',
      `${card.cardId}: lifecycle resolution failed: ${resolved.outcome}`,
    );
    const promoted = presenter.promotePresentation(resolved);
    assert.equal(
      promoted.outcome,
      'PRESENTATION_PROMOTED',
      `${card.cardId}: presentation promotion failed: ${promoted.outcome}`,
    );
  }
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const runtime = loadRuntime();
  const activeCards = readActiveRegistryCards();
  await verifyExactManifest(runtime, manifest);
  await verifyLifecycle(runtime, manifest, activeCards);

  console.log('Coin Card release gate: PASS');
  console.log(`manifest: ${manifest.manifestHash}`);
  console.log(`protected assets: ${manifest.assets.length}`);
  console.log(`active cards: ${activeCards.map((card) => card.cardId).join(', ')}`);
}

main().catch((error) => {
  console.error(`Coin Card release gate: FAIL — ${error.message}`);
  process.exit(1);
});
