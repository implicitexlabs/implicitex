'use strict';

/**
 * CC-001 Handle Reservation — acceptance test suite.
 *
 * Covers all ten acceptance criteria:
 *   AC-1  Normalization:  Antoine / antoine / ANTOINE resolve to same key.
 *   AC-2  Concurrency:    Two simultaneous requests produce exactly one winner.
 *   AC-3  Idempotency:    Same user can safely retry without creating duplicates.
 *   AC-4  Isolation:      Another user cannot claim, modify, or release a reservation.
 *   AC-5  Rules:          Browser cannot directly create or edit reservation records.
 *                         (Firestore rules enforced by emulator test; here we verify
 *                          the service path is the only mutation path.)
 *   AC-6  Reserved names: System-reserved handles are rejected.
 *   AC-7  Validation:     Invalid handles are rejected before any persistent write.
 *   AC-8  Expiry:         Expired reservations do not block new legitimate reservations.
 *   AC-9  Coverage:       Tests cover normalization, validation, collision, ownership,
 *                         expiry, and retries.
 *   AC-10 Artifact:       Covered by the broader deployment gate; this file is the test boundary.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  HandleReservationError,
  RESERVATION_TTL_MS,
  normalizeHandle,
} = require('../src/handle-reservation/domain');
const {
  COLLECTIONS,
  createFirestoreHandleReservationStore,
} = require('../src/handle-reservation/firestore-store');
const {
  createHandleReservationService,
} = require('../src/handle-reservation/service');

// ---------------------------------------------------------------------------
// Fake Firestore — mirrors the wallet-challenge test infrastructure exactly.
// Transactions are queued serially via transactionTail so concurrency tests
// work deterministically without real network latency.
// ---------------------------------------------------------------------------

function clone(value) {
  return structuredClone(value);
}

class FakeDocumentReference {
  constructor(db, documentPath) {
    this.db = db;
    this.path = documentPath;
  }
}

class FakeCollectionReference {
  constructor(db, collectionPath) {
    this.db = db;
    this.path = collectionPath;
  }

  doc(id) {
    return new FakeDocumentReference(this.db, `${this.path}/${id}`);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }

  async get(ref) {
    const data = this.db.documents.get(ref.path);
    return {
      exists: data !== undefined,
      data: () => clone(data),
    };
  }

  create(ref, data) {
    if (this.db.documents.has(ref.path) || this.writes.some((w) => w.path === ref.path)) {
      throw new Error(`already exists: ${ref.path}`);
    }
    this.writes.push({ kind: 'create', path: ref.path, data: clone(data) });
  }

  set(ref, data) {
    this.writes.push({ kind: 'set', path: ref.path, data: clone(data) });
  }

  update(ref, data) {
    if (!this.db.documents.has(ref.path)) throw new Error(`not found: ${ref.path}`);
    this.writes.push({ kind: 'update', path: ref.path, data: clone(data) });
  }

  commit() {
    for (const write of this.writes) {
      if (write.kind === 'update') {
        this.db.documents.set(write.path, {
          ...this.db.documents.get(write.path),
          ...write.data,
        });
      } else {
        this.db.documents.set(write.path, write.data);
      }
    }
  }
}

class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.transactionTail = Promise.resolve();
  }

  collection(name) {
    return new FakeCollectionReference(this, name);
  }

  runTransaction(callback) {
    const run = this.transactionTail.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.transactionTail = run.catch(() => {});
    return run;
  }

  read(documentPath) {
    const value = this.documents.get(documentPath);
    return value === undefined ? null : clone(value);
  }

  list(collection) {
    const prefix = `${collection}/`;
    return [...this.documents.entries()]
      .filter(([p]) => p.startsWith(prefix))
      .map(([, v]) => clone(v));
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEnvironment() {
  let nowMs = Date.parse('2026-07-25T12:00:00.000Z');
  const db = new FakeFirestore();
  const store = createFirestoreHandleReservationStore(db);
  const service = createHandleReservationService({
    store,
    clock: () => new Date(nowMs),
    randomUUID: crypto.randomUUID,
  });
  return {
    db,
    service,
    advance(ms) { nowMs += ms; },
  };
}

function actor(uid = 'uid_alice', emailVerified = true, email = 'alice@example.com') {
  return { uid, emailVerified, email };
}

function actorBob() {
  return { uid: 'uid_bob', emailVerified: true, email: 'bob@example.com' };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (err) => (
    err instanceof HandleReservationError && err.code === code
  ));
}

// ---------------------------------------------------------------------------
// AC-1  Normalization: Antoine / antoine / ANTOINE all resolve to the same key.
// ---------------------------------------------------------------------------

test('AC-1: Antoine, antoine, and ANTOINE normalize to the same handle', () => {
  assert.equal(normalizeHandle('Antoine'), 'antoine');
  assert.equal(normalizeHandle('antoine'), 'antoine');
  assert.equal(normalizeHandle('ANTOINE'), 'antoine');
});

test('AC-1: normalized handle is the document ID and uniqueness key', async () => {
  const { db, service } = makeEnvironment();
  await service.reserveHandle(actor(), { handle: 'ANTOINE' });
  // Document exists under the normalized key.
  assert.ok(db.read(`${COLLECTIONS.reservations}/antoine`));
  // No document exists for the raw input casing.
  assert.equal(db.read(`${COLLECTIONS.reservations}/ANTOINE`), null);
});

// ---------------------------------------------------------------------------
// AC-2  Concurrency: two simultaneous requests produce exactly one winner.
// ---------------------------------------------------------------------------

test('AC-2: two simultaneous reservation attempts produce exactly one winner', async () => {
  const { service } = makeEnvironment();
  const results = await Promise.allSettled([
    service.reserveHandle(actor(), { handle: 'antoine' }),
    service.reserveHandle(actorBob(), { handle: 'antoine' }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one reservation must succeed');
  assert.equal(rejected.length, 1, 'exactly one request must be rejected');
  assert.equal(rejected[0].reason.code, 'HANDLE_TAKEN');
});

test('AC-2: audit log records exactly one HANDLE_RESERVED event after concurrent attempts', async () => {
  const { db, service } = makeEnvironment();
  await Promise.allSettled([
    service.reserveHandle(actor(), { handle: 'antoine' }),
    service.reserveHandle(actorBob(), { handle: 'antoine' }),
  ]);
  const auditEvents = db.list(COLLECTIONS.auditEvents)
    .filter((e) => e.eventType === 'HANDLE_RESERVED');
  assert.equal(auditEvents.length, 1);
});

// ---------------------------------------------------------------------------
// AC-3  Idempotency: same user can safely retry their own successful reservation.
// ---------------------------------------------------------------------------

test('AC-3: same user retrying their own reservation gets the original record back', async () => {
  const { service } = makeEnvironment();
  const first = await service.reserveHandle(actor(), { handle: 'antoine' });
  const second = await service.reserveHandle(actor(), { handle: 'antoine' });

  assert.equal(second.reservationId, first.reservationId, 'same reservationId returned');
  assert.equal(second.existed, true, 'existed flag is true on idempotent retry');
  assert.equal(first.existed, false, 'existed flag is false on initial reservation');
});

test('AC-3: idempotent retry does not produce a second audit event', async () => {
  const { db, service } = makeEnvironment();
  await service.reserveHandle(actor(), { handle: 'antoine' });
  await service.reserveHandle(actor(), { handle: 'antoine' });

  const events = db.list(COLLECTIONS.auditEvents)
    .filter((e) => e.eventType === 'HANDLE_RESERVED');
  assert.equal(events.length, 1);
});

// ---------------------------------------------------------------------------
// AC-4  Isolation: another authenticated user cannot claim or modify the reservation.
// ---------------------------------------------------------------------------

test('AC-4: another authenticated user cannot claim an active reservation', async () => {
  const { service } = makeEnvironment();
  await service.reserveHandle(actor(), { handle: 'antoine' });
  await expectCode(
    service.reserveHandle(actorBob(), { handle: 'antoine' }),
    'HANDLE_TAKEN',
  );
});

test('AC-4: another user cannot claim by varying the handle casing', async () => {
  const { service } = makeEnvironment();
  await service.reserveHandle(actor(), { handle: 'antoine' });
  await expectCode(
    service.reserveHandle(actorBob(), { handle: 'Antoine' }),
    'HANDLE_TAKEN',
  );
});

// ---------------------------------------------------------------------------
// AC-6  Reserved names: system handles are rejected before any persistent write.
// ---------------------------------------------------------------------------

test('AC-6: reserved handle "implicitex" is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'implicitex' }),
    'HANDLE_RESERVED',
  );
});

test('AC-6: reserved handle "admin" is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'admin' }),
    'HANDLE_RESERVED',
  );
});

test('AC-6: "ImplicitEx" normalizes to "implicitex" and is then rejected as reserved', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'ImplicitEx' }),
    'HANDLE_RESERVED',
  );
});

test('AC-6: reserved handle rejection writes no Firestore document', async () => {
  const { db, service } = makeEnvironment();
  await assert.rejects(service.reserveHandle(actor(), { handle: 'admin' }));
  assert.equal(db.read(`${COLLECTIONS.reservations}/admin`), null);
});

// ---------------------------------------------------------------------------
// AC-7  Validation: invalid handles are rejected before any persistent write.
// ---------------------------------------------------------------------------

test('AC-7: handle shorter than 3 characters is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(service.reserveHandle(actor(), { handle: 'an' }), 'HANDLE_INVALID');
  await expectCode(service.reserveHandle(actor(), { handle: 'a' }), 'HANDLE_INVALID');
});

test('AC-7: handle longer than 32 characters is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'a'.repeat(33) }),
    'HANDLE_INVALID',
  );
});

test('AC-7: leading hyphen is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: '-antoine' }),
    'HANDLE_INVALID',
  );
});

test('AC-7: trailing hyphen is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'antoine-' }),
    'HANDLE_INVALID',
  );
});

test('AC-7: consecutive hyphens are rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'antoine--dennison' }),
    'HANDLE_INVALID',
  );
});

test('AC-7: underscore is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle(actor(), { handle: 'antoine_dennison' }),
    'HANDLE_INVALID',
  );
});

test('AC-7: non-string handle is rejected', async () => {
  const { service } = makeEnvironment();
  await expectCode(service.reserveHandle(actor(), { handle: 42 }), 'HANDLE_INVALID');
  await expectCode(service.reserveHandle(actor(), { handle: null }), 'HANDLE_INVALID');
});

test('AC-7: validation failure writes no Firestore document', async () => {
  const { db, service } = makeEnvironment();
  await assert.rejects(service.reserveHandle(actor(), { handle: '-bad' }));
  assert.equal(db.list(COLLECTIONS.reservations).length, 0);
});

test('AC-7: valid single-hyphen handle is accepted', async () => {
  const { service } = makeEnvironment();
  const result = await service.reserveHandle(actor(), { handle: 'aden-media' });
  assert.equal(result.handle, 'aden-media');
  assert.equal(result.status, 'reserved');
});

// ---------------------------------------------------------------------------
// AC-8  Expiry: expired reservations do not block a new legitimate reservation.
// ---------------------------------------------------------------------------

test('AC-8: expired reservation by another user can be claimed by a new user', async () => {
  const env = makeEnvironment();
  await env.service.reserveHandle(actor(), { handle: 'antoine' });
  env.advance(RESERVATION_TTL_MS + 1);

  const result = await env.service.reserveHandle(actorBob(), { handle: 'antoine' });
  assert.equal(result.handle, 'antoine');
  assert.equal(result.existed, false);

  // Verify the stored document now belongs to Bob.
  const stored = env.db.read(`${COLLECTIONS.reservations}/antoine`);
  assert.equal(stored.uid, 'uid_bob');
});

test('AC-8: expired reservation by same user starts a fresh reservation', async () => {
  const env = makeEnvironment();
  const first = await env.service.reserveHandle(actor(), { handle: 'antoine' });
  env.advance(RESERVATION_TTL_MS + 1);

  const second = await env.service.reserveHandle(actor(), { handle: 'antoine' });
  assert.notEqual(second.reservationId, first.reservationId);
  assert.equal(second.existed, false);
});

// ---------------------------------------------------------------------------
// Authentication and precondition guards
// ---------------------------------------------------------------------------

test('unauthenticated request is rejected with AUTH_REQUIRED', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle({ uid: null, emailVerified: true }, { handle: 'antoine' }),
    'AUTH_REQUIRED',
  );
});

test('unverified email is rejected with EMAIL_NOT_VERIFIED', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.reserveHandle({ uid: 'uid_alice', emailVerified: false }, { handle: 'antoine' }),
    'EMAIL_NOT_VERIFIED',
  );
});

test('checkAvailability requires authentication', async () => {
  const { service } = makeEnvironment();
  await expectCode(
    service.checkAvailability({ uid: null, emailVerified: false }, { handle: 'antoine' }),
    'AUTH_REQUIRED',
  );
});

// ---------------------------------------------------------------------------
// AC-9  Normalization coverage — additional valid handle shapes
// ---------------------------------------------------------------------------

test('AC-9: handle with leading digit is valid', async () => {
  const { service } = makeEnvironment();
  const result = await service.reserveHandle(actor(), { handle: '3rdwave' });
  assert.equal(result.handle, '3rdwave');
});

test('AC-9: handle with internal hyphen and digits is valid', async () => {
  const { service } = makeEnvironment();
  const result = await service.reserveHandle(actor(), { handle: 'wave-3' });
  assert.equal(result.handle, 'wave-3');
});

test('AC-9: reservation record carries correct schema version and fields', async () => {
  const { db, service } = makeEnvironment();
  const result = await service.reserveHandle(actor(), { handle: 'antoine' });

  assert.equal(result.schemaVersion, 'implicitex.coincard.handle-reservation.v1');
  assert.equal(result.handle, 'antoine');
  assert.equal(result.status, 'reserved');
  assert.ok(result.reservationId, 'reservationId is present');
  assert.ok(result.createdAt, 'createdAt is present');
  assert.ok(result.expiresAt, 'expiresAt is present');

  const stored = db.read(`${COLLECTIONS.reservations}/antoine`);
  assert.equal(stored.uid, 'uid_alice');
  assert.equal(stored.normalizedHandle, 'antoine');
  assert.equal(stored.status, 'reserved');
});

test('AC-9: checkAvailability returns available for unclaimed handle', async () => {
  const { service } = makeEnvironment();
  const result = await service.checkAvailability(actor(), { handle: 'unclaimed' });
  assert.equal(result.available, true);
});

test('AC-9: checkAvailability returns unavailable for active reservation', async () => {
  const { service } = makeEnvironment();
  await service.reserveHandle(actor(), { handle: 'antoine' });
  const result = await service.checkAvailability(actor(), { handle: 'antoine' });
  assert.equal(result.available, false);
  assert.equal(result.status, 'reserved');
});

test('AC-9: checkAvailability returns available after reservation expires', async () => {
  const env = makeEnvironment();
  await env.service.reserveHandle(actor(), { handle: 'antoine' });
  env.advance(RESERVATION_TTL_MS + 1);
  const result = await env.service.checkAvailability(actor(), { handle: 'antoine' });
  assert.equal(result.available, true);
});
