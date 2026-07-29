/**
 * Firebase callable boundaries for Coin Card handle reservation.
 *
 * Direct client writes to handleReservations are forbidden by Firestore rules.
 * These functions authenticate the Firebase account and delegate every
 * mutation to the transactional store.
 */

'use strict';

const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { HandleReservationError } = require('./domain');
const { createFirestoreHandleReservationStore } = require('./firestore-store');
const { createHandleReservationService } = require('./service');

const FUNCTION_OPTIONS = Object.freeze({
  region: 'us-central1',
  enforceAppCheck: true,
  maxInstances: 20,
  timeoutSeconds: 15,
  memory: '256MiB',
});

let service = null;

function getService() {
  if (!service) {
    service = createHandleReservationService({
      store: createFirestoreHandleReservationStore(getFirestore()),
    });
  }
  return service;
}

function actorFromRequest(request) {
  return {
    uid: (request.auth && request.auth.uid) || null,
    email: (request.auth && request.auth.token && request.auth.token.email) || null,
    emailVerified: request.auth && request.auth.token
      && request.auth.token.email_verified === true,
  };
}

function asHttpsError(error) {
  if (!(error instanceof HandleReservationError)) {
    return new HttpsError('internal', 'Handle reservation service failed.');
  }
  const firebaseCode = {
    AUTH_REQUIRED: 'unauthenticated',
    EMAIL_NOT_VERIFIED: 'failed-precondition',
    REQUEST_INVALID: 'invalid-argument',
    HANDLE_INVALID: 'invalid-argument',
    HANDLE_RESERVED: 'invalid-argument',
    HANDLE_TAKEN: 'already-exists',
    CLOCK_INVALID: 'internal',
  }[error.code] || 'failed-precondition';
  return new HttpsError(firebaseCode, error.message, { reason: error.code });
}

async function invoke(operation, request) {
  try {
    return await operation(actorFromRequest(request), request.data);
  } catch (error) {
    const uid = (request.auth && request.auth.uid) || null;
    logger.warn('coincard_handle_reservation_rejected', {
      uid,
      reason: error instanceof HandleReservationError ? error.code : 'UNEXPECTED',
    });
    throw asHttpsError(error);
  }
}

const coincardReserveHandle = onCall(FUNCTION_OPTIONS, async (request) => {
  const result = await invoke(getService().reserveHandle, request);
  logger.info('coincard_handle_reserved', {
    uid: request.auth.uid,
    handle: result.handle,
    reservationId: result.reservationId,
    existed: result.existed,
  });
  return result;
});

const coincardCheckHandleAvailability = onCall(FUNCTION_OPTIONS, async (request) => {
  return invoke(getService().checkAvailability, request);
});

module.exports = Object.freeze({
  coincardReserveHandle,
  coincardCheckHandleAvailability,
});
