/**
 * seed-fixtures.js — Hosting-rewrite spike fixture seeder
 *
 * Creates six test fixtures in the Firebase emulator (Firestore + Storage):
 *
 *   spike-active     — ACTIVE record with correct artifact → expect 200
 *   spike-revoked    — REVOKED record with correct artifact → expect 200
 *   spike-pending    — PENDING_PUBLICATION record → expect 503 (no artifact needed)
 *   spike-mismatch   — ACTIVE record with wrong hash → expect 503
 *   spike-no-record  — (no document) → expect 404
 *   antoine          — (static file exists) → expect static file, NOT function
 *
 * Also clears spike_invocations so verify.js starts from a clean baseline.
 *
 * PREREQUISITES:
 *   firebase emulators:start --config firebase.routing-spike.json --project demo-spike
 *
 * RUN:
 *   cd app-web/backend/scripts/spikes/hosting-rewrite
 *   npm install
 *   node seed-fixtures.js
 */

'use strict';

const crypto = require('node:crypto');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

// ─── Step 0: Safety guard ─────────────────────────────────────────────────────
// Refuse to run against real Firebase services. This script writes Firestore
// and Storage data. Accidentally pointing it at a production or staging project
// would write garbage fixture data to real collections.
//
// Guards:
//   - FIREBASE_STORAGE_EMULATOR_HOST must be set (emulator, not real GCS)
//   - FIRESTORE_EMULATOR_HOST must be set (emulator, not real Firestore)
//   - GCLOUD_PROJECT or FIREBASE_PROJECT must look like a demo project
//     (prefixed with 'demo-') or match the known spike project ID

const EXPECTED_PROJECT_ID = 'demo-spike';
// Allowlist: any project ID not explicitly listed here causes the guard to fail closed.
// This includes production, staging, unknown developer projects, and typos.
// Do not use a blacklist — a blacklist must be updated every time a new project appears.
const ALLOWED_PROJECT_IDS = new Set(['demo-spike']);

function guardAgainstProductionRun() {
  const inferredProject = process.env.GCLOUD_PROJECT
    || process.env.FIREBASE_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || null;

  if (inferredProject && !ALLOWED_PROJECT_IDS.has(inferredProject)) {
    console.error('\n✗  SAFETY GUARD: refusing to run — project is not in the approved allowlist.');
    console.error(`   Detected project: ${inferredProject}`);
    console.error(`   Allowed projects: ${[...ALLOWED_PROJECT_IDS].join(', ')}`);
    console.error('   This script writes fixture data to Firestore and Storage.');
    console.error('   Run with: firebase emulators:start --config firebase.routing-spike.json --project demo-spike');
    process.exit(1);
  }

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('\n✗  SAFETY GUARD: FIRESTORE_EMULATOR_HOST is not set.');
    console.error('   The script would connect to the real Firestore service.');
    console.error('   Start the emulators first:');
    console.error('   firebase emulators:start --config firebase.routing-spike.json --project demo-spike');
    process.exit(1);
  }

  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    console.error('\n✗  SAFETY GUARD: FIREBASE_STORAGE_EMULATOR_HOST is not set.');
    console.error('   The script would connect to the real Cloud Storage service.');
    console.error('   Start the emulators first:');
    console.error('   firebase emulators:start --config firebase.routing-spike.json --project demo-spike');
    process.exit(1);
  }

  console.log('Step 0: Safety guard passed.');
  console.log(`  FIRESTORE_EMULATOR_HOST: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`  FIREBASE_STORAGE_EMULATOR_HOST: ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
  if (inferredProject) console.log(`  Project: ${inferredProject}`);
  console.log('  No production credentials detected.\n');
}

guardAgainstProductionRun();

// Point the Admin SDK at the emulators. Must be set before initializeApp.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';

if (!getApps().length) {
  initializeApp({ projectId: EXPECTED_PROJECT_ID, storageBucket: `${EXPECTED_PROJECT_ID}.appspot.com` });
}

const db = getFirestore();
const bucket = getStorage().bucket();

const SPIKE_REGISTRY = 'spike_registry';
const SPIKE_INVOCATIONS = 'spike_invocations';

// Build a representative lifecycle record artifact (not KMS-signed; content
// does not matter for the routing proof — only the hash match matters).
function buildArtifact(handle, cardStatus) {
  return JSON.stringify({
    _spike: true,
    _note: 'Not a real signed lifecycle record. Routing proof only.',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    cardId: `coincard:spike:${handle}`,
    cardStatus,
    manifestStatus: cardStatus === 'CARD_REVOKED' ? 'MANIFEST_REVOKED' : 'MANIFEST_CURRENT',
    environment: 'spike',
    authorityId: 'spike-authority',
    registryId: 'spike-registry',
    registryVersion: 1,
    recordId: `spike-${handle}-record-001`,
    publishedAt: new Date().toISOString(),
  }, null, 2);
}

function sha256Base64Url(bytes) {
  return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('base64url');
}

async function clearCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  if (snapshot.docs.length > 0) await batch.commit();
  console.log(`  cleared ${collectionName} (${snapshot.docs.length} documents)`);
}

async function seedRecord(handle, firestoreData, artifactContent) {
  // Write Firestore record
  await db.collection(SPIKE_REGISTRY).doc(handle).set(firestoreData);

  // Upload artifact to Storage if provided
  if (artifactContent !== null) {
    const artifactBytes = Buffer.from(artifactContent, 'utf8');
    const file = bucket.file(`${handle}/artifact.json`);
    await file.save(artifactBytes, { contentType: 'application/json' });
  }

  console.log(`  seeded ${handle}: registry_status=${firestoreData.registry_status}`);
}

async function main() {
  console.log('\n=== Hosting-rewrite spike: seeding fixtures ===\n');

  // Clear previous runs
  console.log('Clearing previous spike data...');
  await clearCollection(SPIKE_REGISTRY);
  await clearCollection(SPIKE_INVOCATIONS);

  console.log('\nSeeding fixtures...');

  // 1. ACTIVE — correct artifact; expect 200
  const activeArtifact = buildArtifact('spike-active', 'CARD_ACTIVE');
  const activeBytes = Buffer.from(activeArtifact, 'utf8');
  const activeHash = sha256Base64Url(activeBytes);
  await seedRecord('spike-active', {
    registry_status: 'ACTIVE',
    artifact_uri: 'spike-active/artifact.json',
    artifact_hash: activeHash,
  }, activeArtifact);

  // 2. REVOKED — correct artifact; expect 200 with revocation evidence
  const revokedArtifact = buildArtifact('spike-revoked', 'CARD_REVOKED');
  const revokedBytes = Buffer.from(revokedArtifact, 'utf8');
  const revokedHash = sha256Base64Url(revokedBytes);
  await seedRecord('spike-revoked', {
    registry_status: 'REVOKED',
    artifact_uri: 'spike-revoked/artifact.json',
    artifact_hash: revokedHash,
  }, revokedArtifact);

  // 3. PENDING_PUBLICATION — no artifact needed; expect 503
  await seedRecord('spike-pending', {
    registry_status: 'PENDING_PUBLICATION',
  }, null);

  // 4. MISMATCH — ACTIVE record but wrong hash → Firestore/Storage disagree; expect 503
  const mismatchArtifact = buildArtifact('spike-mismatch', 'CARD_ACTIVE');
  await seedRecord('spike-mismatch', {
    registry_status: 'ACTIVE',
    artifact_uri: 'spike-mismatch/artifact.json',
    // Deliberately wrong hash — artifact content does not match this hash
    artifact_hash: 'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  }, mismatchArtifact);

  // 5. spike-no-record — no Firestore document; expect 404
  // (nothing to seed — absence is the fixture)
  console.log('  seeded spike-no-record: (no document — 404 expected)');

  // 6. antoine — static file exists; expect static file served, function NOT invoked
  // (nothing to seed — antoine.json is a static file in app-web/frontend/public/registry/coincards/)
  console.log('  seeded antoine: (static file; no Firestore record needed)');

  console.log('\nFixtures ready. Emulator should be running at http://localhost:5000');
  console.log('Run: node verify.js\n');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
