/**
 * Firestore persistence for Coin Card handle reservations.
 *
 * The document ID for every reservation record is the normalized handle itself,
 * making Firestore the hard uniqueness constraint. The reservation transaction
 * reads, decides, and writes atomically so concurrent requests for the same
 * handle produce exactly one winner.
 */

'use strict';

const { HandleReservationError } = require('./domain');

const COLLECTIONS = Object.freeze({
  reservations: 'handleReservations',
  auditEvents: 'auditEvents',
});

function asDate(value, field) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HandleReservationError('RESERVATION_RECORD_INVALID', `${field} is invalid.`);
  }
  return date;
}

function createFirestoreHandleReservationStore(db) {
  if (!db || typeof db.runTransaction !== 'function') {
    throw new TypeError('Firestore database with runTransaction is required');
  }

  // reserveHandle atomically claims a handle for one authenticated user.
  //
  // Outcomes:
  //   { existed: false, reservation } — handle was available; reservation created.
  //   { existed: true,  reservation } — same user already holds this reservation;
  //                                     returned idempotently without a new write.
  //   throws HANDLE_TAKEN             — another active user holds this handle.
  async function reserveHandle({ record, auditEventId }) {
    const reservationRef = db.collection(COLLECTIONS.reservations).doc(record.normalizedHandle);
    const auditRef = db.collection(COLLECTIONS.auditEvents).doc(auditEventId);
    const now = record.createdAt;

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reservationRef);

      if (snapshot.exists) {
        const existing = snapshot.data();
        const existingExpiry = asDate(existing.expiresAt, 'reservation.expiresAt');
        const isExpired = now.getTime() >= existingExpiry.getTime();

        if (!isExpired) {
          if (existing.uid === record.uid) {
            // Idempotent: the authenticated user already holds this reservation.
            // Return the stored record without a new write.
            return Object.freeze({ existed: true, reservation: existing });
          }
          throw new HandleReservationError(
            'HANDLE_TAKEN',
            'This handle is not available.',
          );
        }
        // Existing reservation is expired — fall through and overwrite.
      }

      // No active reservation (never existed, or was expired). Claim it.
      transaction.set(reservationRef, record);
      transaction.create(auditRef, {
        schemaVersion: 'implicitex.coincard.audit-event.v1',
        eventId: auditEventId,
        eventType: 'HANDLE_RESERVED',
        uid: record.uid,
        handle: record.normalizedHandle,
        reservationId: record.reservationId,
        occurredAt: now,
      });
      return Object.freeze({ existed: false, reservation: record });
    });
  }

  // checkAvailability is an informational read. The reservation transaction
  // re-checks availability at write time; this result is not authoritative.
  async function checkAvailability({ normalizedHandle, now }) {
    const reservationRef = db.collection(COLLECTIONS.reservations).doc(normalizedHandle);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reservationRef);
      if (!snapshot.exists) return Object.freeze({ available: true });
      const data = snapshot.data();
      if (data.status === 'consumed' || data.status === 'released') {
        return Object.freeze({ available: true });
      }
      const expiry = asDate(data.expiresAt, 'reservation.expiresAt');
      if (now.getTime() >= expiry.getTime()) return Object.freeze({ available: true });
      return Object.freeze({ available: false, status: data.status });
    });
  }

  return Object.freeze({
    reserveHandle,
    checkAvailability,
  });
}

module.exports = Object.freeze({
  COLLECTIONS,
  createFirestoreHandleReservationStore,
});
