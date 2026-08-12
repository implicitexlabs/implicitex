/**
 * Firebase Authentication adapter for the production-shaped holder boundary.
 * This module is not wired to a deployed endpoint by this milestone.
 */

'use strict';

const {
  AUTH_IDENTITY_SCHEMA,
  HOLDER_AUDIENCE,
  fail,
  normalizeIssuer,
  normalizeProvider,
  normalizeSubject,
} = require('./contract');

function createFirebaseAuthenticationVerifier(options) {
  if (!options || !options.firebaseAuth || typeof options.firebaseAuth.verifyIdToken !== 'function'
    || typeof options.projectId !== 'string' || !/^[a-z][a-z0-9-]{4,29}$/.test(options.projectId)) {
    throw new TypeError('Firebase Auth verifier and explicit project ID are required');
  }
  const firebaseAuth = options.firebaseAuth;
  const projectId = options.projectId;
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const allowedProviders = new Set(options.allowedProviders || ['google.com', 'password', 'passkey']);
  const verifiedIdentities = new WeakSet();

  async function verifyAuthentication(idToken) {
    if (typeof idToken !== 'string' || idToken.length < 16 || idToken.length > 16384) {
      fail('AUTH_TOKEN_MALFORMED', 'Firebase ID token is malformed.');
    }
    let decoded;
    try { decoded = await firebaseAuth.verifyIdToken(idToken, true); } catch (_) {
      fail('AUTH_TOKEN_INVALID', 'Firebase ID token verification failed.');
    }
    const provider = decoded.firebase && decoded.firebase.sign_in_provider;
    if (decoded.aud !== projectId || decoded.iss !== expectedIssuer
      || decoded.email_verified !== true || !allowedProviders.has(provider)
      || !Number.isSafeInteger(decoded.auth_time) || !Number.isSafeInteger(decoded.iat)
      || !Number.isSafeInteger(decoded.exp)) {
      fail('AUTH_TOKEN_CLAIMS_INVALID', 'Firebase ID token claims are not permitted.');
    }
    const result = Object.freeze({
      schemaVersion: AUTH_IDENTITY_SCHEMA,
      environment: 'PRODUCTION_SHAPED_UNDEPLOYED',
      subject: normalizeSubject(decoded.sub),
      issuer: normalizeIssuer(decoded.iss),
      provider: normalizeProvider(provider),
      authenticationAudience: decoded.aud,
      holderAudience: HOLDER_AUDIENCE,
      emailVerified: true,
      authenticationTime: new Date(decoded.auth_time * 1000).toISOString(),
      issuedAt: new Date(decoded.iat * 1000).toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
      assuranceMethods: Object.freeze(Array.isArray(decoded.amr) ? [...decoded.amr] : []),
      testOnly: false,
    });
    verifiedIdentities.add(result);
    return result;
  }

  return Object.freeze({
    verifyAuthentication,
    isVerifiedIdentity(value) { return verifiedIdentities.has(value); },
    projectId,
    expectedIssuer,
    mode: 'FIREBASE_ID_TOKEN_CHECK_REVOKED',
  });
}

module.exports = Object.freeze({ createFirebaseAuthenticationVerifier });
