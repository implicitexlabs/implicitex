/**
 * Firebase callable boundaries for server-issued wallet ownership challenges.
 *
 * Direct client writes are forbidden. These functions authenticate the
 * Firebase account and delegate every mutation to the transactional store.
 */

'use strict';

const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { WalletChallengeError } = require('./domain');
const { createFirestoreWalletChallengeStore } = require('./firestore-store');
const { createWalletChallengeService } = require('./service');

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
    service = createWalletChallengeService({
      store: createFirestoreWalletChallengeStore(getFirestore()),
    });
  }
  return service;
}

function actorFromRequest(request) {
  return {
    uid: request.auth && request.auth.uid || null,
    emailVerified: request.auth && request.auth.token
      && request.auth.token.email_verified === true,
  };
}

function asHttpsError(error) {
  if (!(error instanceof WalletChallengeError)) {
    return new HttpsError('internal', 'Wallet challenge service failed.');
  }
  const firebaseCode = {
    AUTH_REQUIRED: 'unauthenticated',
    EMAIL_NOT_VERIFIED: 'failed-precondition',
    REQUEST_INVALID: 'invalid-argument',
    HANDLE_INVALID: 'invalid-argument',
    WALLET_INVALID: 'invalid-argument',
    CHAIN_INVALID: 'invalid-argument',
    PURPOSE_INVALID: 'invalid-argument',
    CHALLENGE_ID_INVALID: 'invalid-argument',
    REQUEST_ID_INVALID: 'invalid-argument',
    SIGNATURE_INVALID: 'invalid-argument',
    RATE_LIMITED: 'resource-exhausted',
    CHALLENGE_NOT_FOUND: 'not-found',
    CHALLENGE_ACCOUNT_MISMATCH: 'permission-denied',
    CHALLENGE_REPLAYED: 'already-exists',
    CHALLENGE_EXPIRED: 'deadline-exceeded',
    CHALLENGE_BINDING_MISMATCH: 'failed-precondition',
    SIGNER_MISMATCH: 'permission-denied',
  }[error.code] || 'failed-precondition';
  return new HttpsError(firebaseCode, error.message, {
    reason: error.code,
    ...(error.details || {}),
  });
}

async function invoke(operation, request) {
  try {
    return await operation(actorFromRequest(request), request.data);
  } catch (error) {
    const uid = request.auth && request.auth.uid || null;
    logger.warn('coincard_wallet_challenge_rejected', {
      uid,
      reason: error instanceof WalletChallengeError ? error.code : 'UNEXPECTED',
    });
    throw asHttpsError(error);
  }
}

const coincardWalletChallenge = onCall(FUNCTION_OPTIONS, async (request) => {
  const result = await invoke(getService().issueChallenge, request);
  logger.info('coincard_wallet_challenge_issued', {
    uid: request.auth.uid,
    challengeId: result.challengeId,
    requestId: result.requestId,
  });
  return result;
});

const coincardWalletVerify = onCall(FUNCTION_OPTIONS, async (request) => {
  const result = await invoke(getService().verifyChallenge, request);
  logger.info('coincard_wallet_challenge_verified', {
    uid: request.auth.uid,
    challengeId: result.challengeId,
    requestId: result.requestId,
    proofId: result.proofId,
  });
  return result;
});

module.exports = Object.freeze({
  coincardWalletChallenge,
  coincardWalletVerify,
});
