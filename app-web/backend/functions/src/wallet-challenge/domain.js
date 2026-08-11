/**
 * Coin Card wallet-ownership challenge domain.
 *
 * This module owns canonical input normalization, the exact EIP-191 message,
 * and signature evaluation. It has no Firebase or HTTP dependency.
 */

'use strict';

const crypto = require('node:crypto');
const { getAddress, verifyMessage } = require('ethers');
const canonicalUsername = require('../shared/coin-card-canonical-username');

const SCHEMA_VERSION = 'implicitex.coincard.wallet-challenge.v1';
const PROOF_SCHEMA_VERSION = 'implicitex.coincard.wallet-proof.v1';
const MESSAGE_TITLE = 'ImplicitEx Coin Card Wallet Ownership';
const DOMAIN = 'implicitex.com';
const VERSION = 1;
const PURPOSE = 'claim_coin_card';
const CHAIN_ID = 137;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ISSUES = 5;
const CHALLENGE_ID_RE = /^[A-Za-z0-9_-]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class WalletChallengeError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'WalletChallengeError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new WalletChallengeError(code, message, details);
}

function sha256(value) {
  return 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeActor(actor) {
  if (!actor || typeof actor.uid !== 'string' || !actor.uid.trim()) {
    fail('AUTH_REQUIRED', 'Firebase authentication is required.');
  }
  if (actor.emailVerified !== true) {
    fail('EMAIL_NOT_VERIFIED', 'A verified email account is required.');
  }
  return Object.freeze({
    uid: actor.uid.trim(),
    emailVerified: true,
  });
}

function normalizeHandle(value) {
  if (typeof value !== 'string') fail('HANDLE_INVALID', 'handle must be a string.');
  const validation = canonicalUsername.validateCurrentUsername(value);
  if (!validation.valid) {
    fail(
      'HANDLE_INVALID',
      'handle must be 4–32 lowercase ASCII letters, digits, or hyphens without a leading or trailing hyphen.',
      { usernameValidationCode: validation.code },
    );
  }
  return validation.username;
}

function normalizeWalletAddress(value) {
  if (typeof value !== 'string') fail('WALLET_INVALID', 'walletAddress must be a string.');
  try {
    return getAddress(value.trim());
  } catch (_) {
    fail('WALLET_INVALID', 'walletAddress must be a valid EVM address.');
  }
}

function normalizeChainId(value) {
  if (!Number.isSafeInteger(value) || value !== CHAIN_ID) {
    fail('CHAIN_INVALID', `chainId must be Polygon mainnet (${CHAIN_ID}).`);
  }
  return value;
}

function normalizePurpose(value) {
  if (value !== PURPOSE) fail('PURPOSE_INVALID', `purpose must be ${PURPOSE}.`);
  return value;
}

function normalizeSubmittedChainId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail('CHAIN_INVALID', 'chainId must be a safe positive integer.');
  }
  return value;
}

function normalizeSubmittedPurpose(value) {
  if (typeof value !== 'string' || !/^[a-z0-9_]{3,64}$/.test(value)) {
    fail('PURPOSE_INVALID', 'purpose is invalid.');
  }
  return value;
}

function normalizeIssueInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('REQUEST_INVALID', 'Challenge request must be an object.');
  }
  return Object.freeze({
    handle: normalizeHandle(input.handle),
    walletAddress: normalizeWalletAddress(input.walletAddress),
    chainId: normalizeChainId(input.chainId),
    purpose: normalizePurpose(input.purpose),
  });
}

function normalizeVerifyInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('REQUEST_INVALID', 'Verification request must be an object.');
  }
  if (typeof input.challengeId !== 'string' || !CHALLENGE_ID_RE.test(input.challengeId)) {
    fail('CHALLENGE_ID_INVALID', 'challengeId is invalid.');
  }
  if (typeof input.requestId !== 'string' || !UUID_RE.test(input.requestId)) {
    fail('REQUEST_ID_INVALID', 'requestId is invalid.');
  }
  if (typeof input.signature !== 'string' || input.signature.length > 1024) {
    fail('SIGNATURE_INVALID', 'signature must be a bounded string.');
  }
  return Object.freeze({
    challengeId: input.challengeId,
    requestId: input.requestId,
    handle: normalizeHandle(input.handle),
    walletAddress: normalizeWalletAddress(input.walletAddress),
    chainId: normalizeSubmittedChainId(input.chainId),
    purpose: normalizeSubmittedPurpose(input.purpose),
    signature: input.signature,
  });
}

function buildWalletOwnershipMessage(fields) {
  return [
    `${MESSAGE_TITLE} v${VERSION}`,
    '',
    `domain: ${DOMAIN}`,
    `version: ${VERSION}`,
    `purpose: ${fields.purpose}`,
    `account_id: ${fields.accountId}`,
    `handle: ${fields.handle}`,
    `wallet_address: ${fields.walletAddress}`,
    `chain_id: ${fields.chainId}`,
    `request_id: ${fields.requestId}`,
    `issued_at: ${fields.issuedAt}`,
    `expires_at: ${fields.expiresAt}`,
    `nonce: ${fields.nonce}`,
  ].join('\n');
}

function createChallengeRecord({ actor, input, now, randomBytes, randomUUID }) {
  const account = normalizeActor(actor);
  const normalized = normalizeIssueInput(input);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('CLOCK_INVALID', 'Server clock is unavailable.');
  }

  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const nonce = randomBytes(32).toString('base64url');
  const challengeId = randomBytes(24).toString('base64url');
  const requestId = randomUUID();
  const message = buildWalletOwnershipMessage({
    accountId: account.uid,
    ...normalized,
    requestId,
    issuedAt,
    expiresAt,
    nonce,
  });

  return Object.freeze({
    challengeId,
    requestId,
    message,
    publicResult: Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      challengeId,
      requestId,
      message,
      issuedAt,
      expiresAt,
      bindings: Object.freeze({
        domain: DOMAIN,
        version: VERSION,
        purpose: normalized.purpose,
        accountId: account.uid,
        handle: normalized.handle,
        walletAddress: normalized.walletAddress,
        chainId: normalized.chainId,
      }),
    }),
    record: Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      status: 'ISSUED',
      challengeId,
      requestId,
      domain: DOMAIN,
      version: VERSION,
      purpose: normalized.purpose,
      accountId: account.uid,
      handle: normalized.handle,
      walletAddress: normalized.walletAddress,
      chainId: normalized.chainId,
      message,
      messageHash: sha256(Buffer.from(message, 'utf8')),
      nonceHash: sha256(Buffer.from(nonce, 'utf8')),
      issuedAt: new Date(issuedAt),
      expiresAt: new Date(expiresAt),
      consumedAt: null,
      terminalOutcome: null,
      failureCode: null,
      recoveredAddress: null,
      proofId: null,
    }),
  });
}

function evaluateVerification({ record, actor, input, now }) {
  const account = normalizeActor(actor);
  if (record.accountId !== account.uid) {
    fail('CHALLENGE_ACCOUNT_MISMATCH', 'Challenge belongs to another account.');
  }
  if (record.status !== 'ISSUED') {
    fail('CHALLENGE_REPLAYED', 'Challenge has already been consumed.');
  }

  const consumedAt = new Date(now);
  if (!Number.isFinite(consumedAt.getTime())) fail('CLOCK_INVALID', 'Server clock is unavailable.');
  if (consumedAt.getTime() >= new Date(record.expiresAt).getTime()) {
    return Object.freeze({
      verified: false,
      status: 'EXPIRED',
      code: 'CHALLENGE_EXPIRED',
      consumedAt,
      recoveredAddress: null,
      proof: null,
    });
  }

  const bindings = [
    ['requestId', input.requestId],
    ['handle', input.handle],
    ['walletAddress', input.walletAddress],
    ['chainId', input.chainId],
    ['purpose', input.purpose],
  ];
  for (const [field, submitted] of bindings) {
    if (record[field] !== submitted) {
      return Object.freeze({
        verified: false,
        status: 'REJECTED',
        code: 'CHALLENGE_BINDING_MISMATCH',
        mismatchField: field,
        consumedAt,
        recoveredAddress: null,
        proof: null,
      });
    }
  }

  let recoveredAddress = null;
  try {
    recoveredAddress = getAddress(verifyMessage(record.message, input.signature));
  } catch (_) {
    return Object.freeze({
      verified: false,
      status: 'REJECTED',
      code: 'SIGNATURE_INVALID',
      consumedAt,
      recoveredAddress: null,
      proof: null,
    });
  }
  if (recoveredAddress !== record.walletAddress) {
    return Object.freeze({
      verified: false,
      status: 'REJECTED',
      code: 'SIGNER_MISMATCH',
      consumedAt,
      recoveredAddress,
      proof: null,
    });
  }

  const proofId = record.challengeId;
  return Object.freeze({
    verified: true,
    status: 'VERIFIED',
    code: null,
    consumedAt,
    recoveredAddress,
    proof: Object.freeze({
      schemaVersion: PROOF_SCHEMA_VERSION,
      proofId,
      challengeId: record.challengeId,
      requestId: record.requestId,
      domain: record.domain,
      version: record.version,
      purpose: record.purpose,
      accountId: record.accountId,
      handle: record.handle,
      walletAddress: record.walletAddress,
      chainId: record.chainId,
      message: record.message,
      messageHash: record.messageHash,
      signature: input.signature,
      signatureHash: sha256(Buffer.from(input.signature, 'utf8')),
      recoveredAddress,
      issuedAt: new Date(record.issuedAt),
      expiresAt: new Date(record.expiresAt),
      verifiedAt: consumedAt,
    }),
  });
}

module.exports = Object.freeze({
  CHAIN_ID,
  CHALLENGE_TTL_MS,
  DOMAIN,
  PURPOSE,
  PROOF_SCHEMA_VERSION,
  RATE_LIMIT_MAX_ISSUES,
  RATE_LIMIT_WINDOW_MS,
  SCHEMA_VERSION,
  VERSION,
  WalletChallengeError,
  buildWalletOwnershipMessage,
  createChallengeRecord,
  evaluateVerification,
  normalizeActor,
  normalizeIssueInput,
  normalizeVerifyInput,
  sha256,
});
