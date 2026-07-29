'use strict';

/**
 * AC-2 emulator contention test — Coin Card handle reservation.
 *
 * Proves the exactly-one-winner invariant against actual Firestore transaction
 * contention. FakeFirestore serializes transactions; this test uses the real
 * Admin SDK against the Firestore emulator to exercise optimistic locking and
 * the real retry loop.
 *
 * Run via:
 *   npm run test:rules
 * (which starts the emulator via firebase emulators:exec)
 *
 * The test fails clearly when the emulator is unavailable rather than
 * silently reporting success.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Fail immediately and clearly if the emulator is not configured.
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost) {
  console.error('FAIL: FIRESTORE_EMULATOR_HOST is not set.');
  console.error('This test must run inside firebase emulators:exec.');
  process.exit(1);
}
assert.equal(
  emulatorHost,
  '127.0.0.1:8083',
  `Expected emulator at 127.0.0.1:8083, got ${emulatorHost}`,
);

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  COLLECTIONS,
  createFirestoreHandleReservationStore,
} = require('../src/handle-reservation/firestore-store');
const { HandleReservationError, RESERVATION_TTL_MS } = require('../src/handle-reservation/domain');

const PROJECT_ID = 'demo-coincard-wallet';
const TEST_HANDLE = 'contention-test-handle';

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID });
}

const db = getFirestore();

function makeRecord(uid) {
  const now = new Date();
  return {
    schemaVersion: 'implicitex.coincard.handle-reservation.v1',
    reservationId: crypto.randomUUID(),
    handle: TEST_HANDLE,
    normalizedHandle: TEST_HANDLE,
    uid,
    email: `${uid}@example.com`,
    status: 'reserved',
    createdAt: now,
    expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
  };
}

async function cleanupTestData() {
  const reservationRef = db.collection(COLLECTIONS.reservations).doc(TEST_HANDLE);
  await reservationRef.delete();

  const auditSnapshot = await db.collection(COLLECTIONS.auditEvents)
    .where('handle', '==', TEST_HANDLE)
    .get();
  await Promise.all(auditSnapshot.docs.map((doc) => doc.ref.delete()));
}

async function main() {
  // Ensure clean state before the test.
  await cleanupTestData();

  const store = createFirestoreHandleReservationStore(db);

  const aliceRecord = makeRecord('emulator-uid-alice');
  const bobRecord   = makeRecord('emulator-uid-bob');
  const aliceAuditId = crypto.randomUUID();
  const bobAuditId   = crypto.randomUUID();

  // Submit two reservation attempts for the same handle concurrently.
  // Real Firestore uses optimistic locking: both transactions read the
  // (initially absent) document, then race to commit. The first commit
  // wins; the second detects contention, retries, re-reads the now-present
  // document, and throws HANDLE_TAKEN.
  const results = await Promise.allSettled([
    store.reserveHandle({ record: aliceRecord, auditEventId: aliceAuditId }),
    store.reserveHandle({ record: bobRecord,   auditEventId: bobAuditId }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected  = results.filter((r) => r.status === 'rejected');

  // 4. Exactly one request succeeds.
  assert.equal(fulfilled.length, 1, `expected 1 fulfilled, got ${fulfilled.length}`);

  // 5. Exactly one returns HANDLE_TAKEN.
  assert.equal(rejected.length, 1, `expected 1 rejected, got ${rejected.length}`);
  assert.ok(
    rejected[0].reason instanceof HandleReservationError,
    `rejection must be HandleReservationError, got: ${rejected[0].reason}`,
  );
  assert.equal(rejected[0].reason.code, 'HANDLE_TAKEN');

  // 6. Exactly one active reservation document exists in Firestore.
  const reservationDoc = await db.collection(COLLECTIONS.reservations).doc(TEST_HANDLE).get();
  assert.ok(reservationDoc.exists, 'reservation document must exist after contention');

  // 7. The stored UID belongs to the winning request.
  const winnerUid = fulfilled[0].value.reservation.uid;
  const storedUid = reservationDoc.data().uid;
  assert.equal(storedUid, winnerUid, 'stored UID must match the winning requester');

  // 8. Exactly one audit event exists for this handle.
  const auditSnapshot = await db.collection(COLLECTIONS.auditEvents)
    .where('handle', '==', TEST_HANDLE)
    .where('eventType', '==', 'HANDLE_RESERVED')
    .get();
  assert.equal(auditSnapshot.size, 1, `expected 1 audit event, got ${auditSnapshot.size}`);

  // 9. Clean up emulator data.
  await cleanupTestData();

  console.log('AC-2 emulator contention test: PASS');
  console.log(`  Winner UID:        ${winnerUid}`);
  console.log(`  Loser error code:  ${rejected[0].reason.code}`);
  console.log(`  Audit events:      ${auditSnapshot.size}`);
  console.log('  Test data cleaned up.');
}

main().catch((error) => {
  console.error('\nAC-2 emulator contention test: FAIL');
  console.error(error.stack || error.message);
  process.exit(1);
});
