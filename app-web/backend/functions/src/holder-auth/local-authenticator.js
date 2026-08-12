/**
 * Ephemeral ES256 authenticator for local/emulator tests.
 *
 * The private key is generated in memory per harness and is never a production
 * credential or deployable fixture. The verifier interface mirrors the future
 * Firebase ID-token verifier.
 */

'use strict';

const crypto = require('node:crypto');
const {
  AUTH_IDENTITY_SCHEMA,
  HOLDER_AUDIENCE,
  STEP_UP_MAX_AGE_MS,
  fail,
  normalizeIssuer,
  normalizeProvider,
  normalizeSubject,
} = require('./contract');

const TEST_ISSUER = 'https://local-auth.coincard.invalid';
const TEST_AUTH_AUDIENCE = 'coincard-prod-local-auth';
const TEST_PROVIDER = 'local-p256-test-authenticator';

function encode(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64url');
}

function parsePart(value, label) {
  try {
    const buffer = Buffer.from(value, 'base64url');
    const canonical = buffer.toString('base64url');
    if (canonical !== value) throw new Error('non-canonical');
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    return parsed;
  } catch (_) {
    fail('AUTH_TOKEN_MALFORMED', `${label} is malformed.`);
  }
}

function createSigner() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  function sign(payload) {
    const header = { alg: 'ES256', typ: 'JWT', kid: 'NON_PRODUCTION_EPHEMERAL_P256' };
    const input = `${encode(header)}.${encode(payload)}`;
    const signature = crypto.sign('sha256', Buffer.from(input), {
      key: privateKey, dsaEncoding: 'ieee-p1363',
    });
    return `${input}.${signature.toString('base64url')}`;
  }
  function verify(token) {
    if (typeof token !== 'string' || token.length > 8192) fail('AUTH_TOKEN_MALFORMED', 'Token is malformed.');
    const parts = token.split('.');
    if (parts.length !== 3) fail('AUTH_TOKEN_MALFORMED', 'Token is malformed.');
    const header = parsePart(parts[0], 'Token header');
    if (header.alg !== 'ES256' || header.typ !== 'JWT' || header.kid !== 'NON_PRODUCTION_EPHEMERAL_P256') {
      fail('AUTH_TOKEN_ALGORITHM_DENIED', 'Token algorithm or key is denied.');
    }
    const signature = Buffer.from(parts[2], 'base64url');
    if (signature.length !== 64 || signature.toString('base64url') !== parts[2]) {
      fail('AUTH_TOKEN_SIGNATURE_INVALID', 'Token signature is invalid.');
    }
    const valid = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), {
      key: publicKey, dsaEncoding: 'ieee-p1363',
    }, signature);
    if (!valid) fail('AUTH_TOKEN_SIGNATURE_INVALID', 'Token signature is invalid.');
    return parsePart(parts[1], 'Token payload');
  }
  return Object.freeze({ sign, verify });
}

function createLocalAuthenticationHarness(options = {}) {
  const clock = options.clock || (() => new Date());
  const signer = createSigner();
  const verifiedIdentities = new WeakSet();

  function issueToken(input) {
    const now = Math.floor(new Date(clock()).getTime() / 1000);
    const subject = normalizeSubject(input.subject);
    return signer.sign({
      schemaVersion: 'coin-card-holder-local-auth-token.v1',
      iss: input.issuer || TEST_ISSUER,
      aud: input.audience || TEST_AUTH_AUDIENCE,
      sub: subject,
      provider: input.provider || TEST_PROVIDER,
      email_verified: input.emailVerified !== false,
      auth_time: input.authTime || now,
      iat: now,
      exp: input.expiresAtSeconds || now + 3600,
      amr: input.amr || ['local-p256'],
    });
  }

  async function verifyAuthentication(token) {
    const payload = signer.verify(token);
    const now = Math.floor(new Date(clock()).getTime() / 1000);
    if (payload.schemaVersion !== 'coin-card-holder-local-auth-token.v1'
      || payload.iss !== TEST_ISSUER || payload.aud !== TEST_AUTH_AUDIENCE
      || payload.provider !== TEST_PROVIDER
      || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
      || !Number.isSafeInteger(payload.auth_time) || payload.iat > now
      || payload.exp <= now || payload.auth_time > now || payload.email_verified !== true) {
      fail('AUTH_TOKEN_CLAIMS_INVALID', 'Authentication token claims are invalid or expired.');
    }
    const result = Object.freeze({
      schemaVersion: AUTH_IDENTITY_SCHEMA,
      environment: 'NON_PRODUCTION',
      subject: normalizeSubject(payload.sub),
      issuer: normalizeIssuer(payload.iss),
      provider: normalizeProvider(payload.provider),
      authenticationAudience: payload.aud,
      holderAudience: HOLDER_AUDIENCE,
      emailVerified: true,
      authenticationTime: new Date(payload.auth_time * 1000).toISOString(),
      issuedAt: new Date(payload.iat * 1000).toISOString(),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      assuranceMethods: Object.freeze(Array.isArray(payload.amr) ? [...payload.amr] : []),
      testOnly: true,
    });
    verifiedIdentities.add(result);
    return result;
  }

  return Object.freeze({
    issueToken,
    verifier: Object.freeze({
      verifyAuthentication,
      isVerifiedIdentity(value) { return verifiedIdentities.has(value); },
      mode: 'NON_PRODUCTION_EPHEMERAL_P256',
    }),
  });
}

function createLocalStepUpHarness(options = {}) {
  const clock = options.clock || (() => new Date());
  const signer = createSigner();
  const verified = new WeakSet();

  function issueToken(context) {
    const now = Math.floor(new Date(clock()).getTime() / 1000);
    return signer.sign({
      schemaVersion: 'coin-card-holder-local-step-up-token.v1',
      iss: TEST_ISSUER,
      aud: HOLDER_AUDIENCE,
      sub: normalizeSubject(context.subject),
      accountId: context.accountId,
      sessionId: context.sessionId,
      action: context.action,
      auth_time: now,
      iat: now,
      exp: now + Math.floor(STEP_UP_MAX_AGE_MS / 1000),
      amr: ['local-p256', 'webauthn-test-double'],
    });
  }

  async function verifyStepUp(token, context) {
    const payload = signer.verify(token);
    const now = Math.floor(new Date(clock()).getTime() / 1000);
    if (payload.schemaVersion !== 'coin-card-holder-local-step-up-token.v1'
      || payload.iss !== TEST_ISSUER || payload.aud !== HOLDER_AUDIENCE
      || payload.sub !== context.subject || payload.accountId !== context.accountId
      || payload.sessionId !== context.sessionId || payload.action !== context.action
      || !Number.isSafeInteger(payload.auth_time) || !Number.isSafeInteger(payload.exp)
      || payload.auth_time > now || payload.exp <= now
      || now - payload.auth_time > Math.floor(STEP_UP_MAX_AGE_MS / 1000)
      || !Array.isArray(payload.amr) || !payload.amr.includes('webauthn-test-double')) {
      fail('STEP_UP_INVALID', 'Recent action-bound step-up assurance is required.');
    }
    const result = Object.freeze({
      verified: true,
      action: context.action,
      subject: context.subject,
      accountId: context.accountId,
      sessionId: context.sessionId,
      verifiedAt: new Date(payload.auth_time * 1000).toISOString(),
      productionAssurance: false,
    });
    verified.add(result);
    return result;
  }

  return Object.freeze({
    issueToken,
    verifier: Object.freeze({
      verifyStepUp,
      isVerifiedStepUp(value) { return verified.has(value); },
      mode: 'NON_PRODUCTION_WEBAUTHN_SHAPED_TEST_DOUBLE',
    }),
  });
}

module.exports = Object.freeze({
  TEST_ISSUER,
  TEST_AUTH_AUDIENCE,
  TEST_PROVIDER,
  createLocalAuthenticationHarness,
  createLocalStepUpHarness,
});
