/**
 * Coin Card handle reservation application service.
 *
 * Orchestrates domain normalization and store persistence. The store is
 * responsible for the atomic transaction boundary; this service owns input
 * validation and result shaping.
 */

'use strict';

const crypto = require('node:crypto');
const {
  HandleReservationError,
  createReservationRecord,
  normalizeActor,
  normalizeHandle,
} = require('./domain');

function defaultClock() {
  return new Date();
}

function createHandleReservationService(options) {
  if (!options || !options.store) {
    throw new TypeError('handle reservation store is required');
  }
  const store = options.store;
  const clock = options.clock || defaultClock;
  const randomUUID = options.randomUUID || crypto.randomUUID;

  async function reserveHandle(actor, input) {
    const account = normalizeActor(actor);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HandleReservationError('REQUEST_INVALID', 'Request must be an object.');
    }
    const normalizedHandle = normalizeHandle(input.handle);
    const now = clock();
    const record = createReservationRecord({
      actor: account,
      normalizedHandle,
      now,
      randomUUID,
    });
    const auditEventId = randomUUID();
    const result = await store.reserveHandle({ record, auditEventId });
    return Object.freeze({
      schemaVersion: record.schemaVersion,
      reservationId: result.reservation.reservationId,
      handle: normalizedHandle,
      status: result.reservation.status,
      createdAt: new Date(result.reservation.createdAt).toISOString(),
      expiresAt: new Date(result.reservation.expiresAt).toISOString(),
      existed: result.existed,
    });
  }

  async function checkAvailability(actor, input) {
    // Authentication is required even for informational reads — availability
    // data should not be exposed to unauthenticated callers.
    normalizeActor(actor);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HandleReservationError('REQUEST_INVALID', 'Request must be an object.');
    }
    const normalizedHandle = normalizeHandle(input.handle);
    return store.checkAvailability({ normalizedHandle, now: clock() });
  }

  return Object.freeze({
    reserveHandle,
    checkAvailability,
  });
}

module.exports = Object.freeze({
  createHandleReservationService,
});
