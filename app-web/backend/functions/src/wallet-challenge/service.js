/**
 * Coin Card wallet challenge application service.
 *
 * The store is responsible for transaction boundaries. In particular,
 * consumeChallenge must evaluate and persist the terminal result in one
 * transaction so concurrent verification attempts cannot both succeed.
 */

'use strict';

const crypto = require('node:crypto');
const {
  WalletChallengeError,
  createChallengeRecord,
  evaluateVerification,
  normalizeActor,
  normalizeVerifyInput,
} = require('./domain');

function defaultClock() {
  return new Date();
}

function createWalletChallengeService(options) {
  if (!options || !options.store) throw new TypeError('wallet challenge store is required');
  const store = options.store;
  const clock = options.clock || defaultClock;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const randomUUID = options.randomUUID || crypto.randomUUID;

  async function issueChallenge(actor, input) {
    const account = normalizeActor(actor);
    const created = createChallengeRecord({
      actor: account,
      input,
      now: clock(),
      randomBytes,
      randomUUID,
    });
    const auditEventId = randomUUID();
    await store.issueChallenge({
      record: created.record,
      auditEventId,
      now: new Date(created.record.issuedAt),
    });
    return created.publicResult;
  }

  async function verifyChallenge(actor, request) {
    const account = normalizeActor(actor);
    const input = normalizeVerifyInput(request);
    const auditEventId = randomUUID();
    const result = await store.consumeChallenge({
      challengeId: input.challengeId,
      accountId: account.uid,
      auditEventId,
      evaluate(record) {
        return evaluateVerification({
          record,
          actor: account,
          input,
          now: clock(),
        });
      },
    });

    if (!result.verified) {
      throw new WalletChallengeError(
        result.code,
        'Wallet ownership verification failed.',
        result.mismatchField ? { mismatchField: result.mismatchField } : null,
      );
    }
    return Object.freeze({
      schemaVersion: result.proof.schemaVersion,
      verified: true,
      proofId: result.proof.proofId,
      challengeId: result.proof.challengeId,
      requestId: result.proof.requestId,
      accountId: result.proof.accountId,
      handle: result.proof.handle,
      walletAddress: result.proof.walletAddress,
      chainId: result.proof.chainId,
      purpose: result.proof.purpose,
      verifiedAt: result.proof.verifiedAt.toISOString(),
    });
  }

  return Object.freeze({
    issueChallenge,
    verifyChallenge,
  });
}

module.exports = Object.freeze({
  createWalletChallengeService,
});
