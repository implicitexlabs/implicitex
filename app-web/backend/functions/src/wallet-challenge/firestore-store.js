/**
 * Firestore persistence for Coin Card wallet challenges.
 *
 * Authoritative challenge consumption, proof creation, and audit publication
 * occur in one Firestore transaction. A transaction retry re-evaluates the
 * signature against the same stored message and cannot create two proofs.
 */

'use strict';

const {
  RATE_LIMIT_MAX_ISSUES,
  RATE_LIMIT_WINDOW_MS,
  WalletChallengeError,
} = require('./domain');

const COLLECTIONS = Object.freeze({
  challenges: 'walletChallenges',
  proofs: 'walletProofs',
  rateLimits: 'walletChallengeRateLimits',
  auditEvents: 'auditEvents',
});

function asDate(value, field) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new WalletChallengeError('CHALLENGE_RECORD_INVALID', `${field} is invalid.`);
  }
  return date;
}

function createFirestoreWalletChallengeStore(db) {
  if (!db || typeof db.runTransaction !== 'function') {
    throw new TypeError('Firestore database with runTransaction is required');
  }

  async function issueChallenge({ record, auditEventId, now }) {
    const challengeRef = db.collection(COLLECTIONS.challenges).doc(record.challengeId);
    const rateLimitRef = db.collection(COLLECTIONS.rateLimits).doc(record.accountId);
    const auditRef = db.collection(COLLECTIONS.auditEvents).doc(auditEventId);

    await db.runTransaction(async (transaction) => {
      const rateSnapshot = await transaction.get(rateLimitRef);
      const rate = rateSnapshot.exists ? rateSnapshot.data() : null;
      const windowStart = rate && rate.windowStart ? asDate(rate.windowStart, 'rateLimit.windowStart') : now;
      const inWindow = now.getTime() - windowStart.getTime() < RATE_LIMIT_WINDOW_MS;
      const issueCount = inWindow && Number.isSafeInteger(rate && rate.issueCount)
        ? rate.issueCount
        : 0;
      if (issueCount >= RATE_LIMIT_MAX_ISSUES) {
        throw new WalletChallengeError(
          'RATE_LIMITED',
          'Too many wallet challenges. Try again after the rate-limit window.',
        );
      }

      transaction.create(challengeRef, record);
      transaction.set(rateLimitRef, {
        accountId: record.accountId,
        windowStart: inWindow ? windowStart : now,
        issueCount: issueCount + 1,
        updatedAt: now,
      });
      transaction.create(auditRef, {
        schemaVersion: 'implicitex.coincard.audit-event.v1',
        eventId: auditEventId,
        eventType: 'WALLET_CHALLENGE_ISSUED',
        accountId: record.accountId,
        challengeId: record.challengeId,
        requestId: record.requestId,
        handle: record.handle,
        purpose: record.purpose,
        occurredAt: now,
      });
    });
  }

  async function consumeChallenge({ challengeId, accountId, auditEventId, evaluate }) {
    const challengeRef = db.collection(COLLECTIONS.challenges).doc(challengeId);
    const proofRef = db.collection(COLLECTIONS.proofs).doc(challengeId);
    const auditRef = db.collection(COLLECTIONS.auditEvents).doc(auditEventId);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(challengeRef);
      if (!snapshot.exists) {
        throw new WalletChallengeError('CHALLENGE_NOT_FOUND', 'Challenge was not found.');
      }
      const stored = snapshot.data();
      if (stored.accountId !== accountId) {
        throw new WalletChallengeError(
          'CHALLENGE_ACCOUNT_MISMATCH',
          'Challenge belongs to another account.',
        );
      }
      if (stored.status !== 'ISSUED') {
        throw new WalletChallengeError('CHALLENGE_REPLAYED', 'Challenge has already been consumed.');
      }

      const record = Object.freeze({
        ...stored,
        issuedAt: asDate(stored.issuedAt, 'challenge.issuedAt'),
        expiresAt: asDate(stored.expiresAt, 'challenge.expiresAt'),
        consumedAt: stored.consumedAt ? asDate(stored.consumedAt, 'challenge.consumedAt') : null,
      });
      const result = evaluate(record);
      if (!result || !['VERIFIED', 'REJECTED', 'EXPIRED'].includes(result.status)) {
        throw new WalletChallengeError(
          'VERIFICATION_RESULT_INVALID',
          'Challenge evaluator returned an invalid terminal result.',
        );
      }

      transaction.update(challengeRef, {
        status: result.status,
        consumedAt: result.consumedAt,
        terminalOutcome: result.verified ? 'WALLET_CONTROL_VERIFIED' : 'WALLET_CONTROL_REJECTED',
        failureCode: result.code,
        recoveredAddress: result.recoveredAddress,
        proofId: result.proof ? result.proof.proofId : null,
      });
      if (result.proof) transaction.create(proofRef, result.proof);
      transaction.create(auditRef, {
        schemaVersion: 'implicitex.coincard.audit-event.v1',
        eventId: auditEventId,
        eventType: result.verified ? 'WALLET_CHALLENGE_VERIFIED' : 'WALLET_CHALLENGE_REJECTED',
        accountId: record.accountId,
        challengeId: record.challengeId,
        requestId: record.requestId,
        handle: record.handle,
        purpose: record.purpose,
        outcome: result.verified ? 'VERIFIED' : result.code,
        mismatchField: result.mismatchField || null,
        occurredAt: result.consumedAt,
      });
      return result;
    });
  }

  return Object.freeze({
    issueChallenge,
    consumeChallenge,
  });
}

module.exports = Object.freeze({
  COLLECTIONS,
  createFirestoreWalletChallengeStore,
});
