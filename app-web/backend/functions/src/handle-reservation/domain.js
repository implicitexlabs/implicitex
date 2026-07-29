/**
 * Coin Card handle reservation domain.
 *
 * This module owns canonical handle normalization, format validation, reserved-
 * name rejection, and reservation record construction. It has no Firebase or
 * HTTP dependency and is fully testable without infrastructure.
 */

'use strict';

const SCHEMA_VERSION = 'implicitex.coincard.handle-reservation.v1';
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Valid handle: 3–32 chars, starts and ends with [a-z0-9], middle allows
// letters, numbers, and hyphens. Consecutive hyphens are checked separately.
// Underscores are not allowed (no HANDLE_RE in wallet-challenge shares this).
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

const RESERVED_NAMES = new Set([
  'admin', 'api', 'app', 'assets', 'auth',
  'billing', 'business', 'card', 'checkout', 'coincard',
  'creator', 'help', 'implicitex', 'login', 'manifest',
  'registry', 'settings', 'status', 'support', 'verify', 'www',
]);

class HandleReservationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'HandleReservationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new HandleReservationError(code, message, details);
}

function normalizeActor(actor) {
  if (!actor || typeof actor.uid !== 'string' || !actor.uid.trim()) {
    fail('AUTH_REQUIRED', 'Firebase authentication is required.');
  }
  if (actor.emailVerified !== true) {
    fail('EMAIL_NOT_VERIFIED', 'A verified email account is required.');
  }
  const email = typeof actor.email === 'string' && actor.email.trim()
    ? actor.email.trim()
    : null;
  return Object.freeze({
    uid: actor.uid.trim(),
    email,
    emailVerified: true,
  });
}

// normalizeHandle trims, lowercases, validates format, and rejects reserved
// names. Returns the normalized handle string on success.
function normalizeHandle(value) {
  if (typeof value !== 'string') fail('HANDLE_INVALID', 'handle must be a string.');
  const handle = value.trim().toLowerCase();

  if (handle.length < 3 || handle.length > 32) {
    fail('HANDLE_INVALID', 'handle must be 3–32 characters.');
  }
  if (!HANDLE_RE.test(handle)) {
    fail(
      'HANDLE_INVALID',
      'handle must start and end with a letter or number and may only contain ' +
      'letters, numbers, and single hyphens. Underscores are not allowed.',
    );
  }
  if (handle.includes('--')) {
    fail('HANDLE_INVALID', 'handle must not contain consecutive hyphens.');
  }
  if (RESERVED_NAMES.has(handle)) {
    fail('HANDLE_RESERVED', `"${handle}" is a reserved name and cannot be registered.`);
  }
  return handle;
}

function createReservationRecord({ actor, normalizedHandle, now, randomUUID }) {
  const account = normalizeActor(actor);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('CLOCK_INVALID', 'Server clock is unavailable.');
  }
  const reservationId = randomUUID();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    reservationId,
    handle: normalizedHandle,
    normalizedHandle,
    uid: account.uid,
    email: account.email,
    status: 'reserved',
    createdAt: now,
    expiresAt,
  });
}

module.exports = Object.freeze({
  HANDLE_RE,
  RESERVED_NAMES,
  RESERVATION_TTL_MS,
  SCHEMA_VERSION,
  HandleReservationError,
  createReservationRecord,
  normalizeActor,
  normalizeHandle,
});
