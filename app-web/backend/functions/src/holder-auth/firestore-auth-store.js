/** Transactional subject/account mapping and opaque holder-session storage. */

'use strict';

const {
  ACCOUNT_BINDING_SCHEMA,
  ACCOUNT_MAPPING_SCHEMA,
  ENVIRONMENT,
  SESSION_SCHEMA,
  asDate,
  fail,
  normalizeAccountId,
  normalizeIssuer,
  normalizeProvider,
  normalizeSessionId,
  normalizeSubject,
  subjectDocumentId,
} = require('./contract');

const COLLECTIONS = Object.freeze({
  subjects: 'coinCardHolderAuthSubjects',
  accounts: 'coinCardHolderAccountBindings',
  sessions: 'coinCardHolderSessions',
});

function clone(value) {
  return value === undefined || value === null ? value : structuredClone(value);
}

function dataOf(snapshot) {
  return snapshot && snapshot.exists ? snapshot.data() : null;
}

function validateMapping(mapping, binding, identity) {
  if (!mapping || mapping.schemaVersion !== ACCOUNT_MAPPING_SCHEMA
    || mapping.environment !== ENVIRONMENT || mapping.status !== 'ACTIVE'
    || mapping.subject !== identity.subject || mapping.issuer !== identity.issuer
    || mapping.provider !== identity.provider || !binding
    || binding.schemaVersion !== ACCOUNT_BINDING_SCHEMA || binding.status !== 'ACTIVE'
    || binding.accountId !== mapping.accountId || binding.subject !== mapping.subject
    || binding.issuer !== mapping.issuer || binding.provider !== mapping.provider
    || binding.sessionVersion !== mapping.sessionVersion) {
    fail('ACCOUNT_MAPPING_INVALID', 'Authentication subject/account mapping is inconsistent.');
  }
  return clone(mapping);
}

function createFirestoreHolderAuthStore(db) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.collection !== 'function') {
    throw new TypeError('Firestore database with transactions is required');
  }
  const ref = (collection, id) => db.collection(collection).doc(id);

  async function resolveOrCreateMapping(input) {
    const identity = {
      subject: normalizeSubject(input.subject),
      issuer: normalizeIssuer(input.issuer),
      provider: normalizeProvider(input.provider),
    };
    const candidateAccountId = normalizeAccountId(input.candidateAccountId);
    const subjectRef = ref(COLLECTIONS.subjects, subjectDocumentId(identity.issuer, identity.subject));
    const candidateAccountRef = ref(COLLECTIONS.accounts, candidateAccountId);
    return db.runTransaction(async (transaction) => {
      const subjectSnapshot = await transaction.get(subjectRef);
      const existing = dataOf(subjectSnapshot);
      if (existing) {
        const bindingSnapshot = await transaction.get(ref(COLLECTIONS.accounts, existing.accountId));
        return validateMapping(existing, dataOf(bindingSnapshot), identity);
      }
      const accountSnapshot = await transaction.get(candidateAccountRef);
      if (accountSnapshot.exists) {
        fail('ACCOUNT_MAPPING_CONFLICT', 'Candidate account is already bound to another subject.');
      }
      const mapping = {
        schemaVersion: ACCOUNT_MAPPING_SCHEMA,
        environment: ENVIRONMENT,
        status: 'ACTIVE',
        subject: identity.subject,
        issuer: identity.issuer,
        provider: identity.provider,
        accountId: candidateAccountId,
        sessionVersion: 1,
        createdAt: input.now,
        updatedAt: input.now,
      };
      const binding = {
        schemaVersion: ACCOUNT_BINDING_SCHEMA,
        environment: ENVIRONMENT,
        status: 'ACTIVE',
        accountId: candidateAccountId,
        subject: identity.subject,
        issuer: identity.issuer,
        provider: identity.provider,
        sessionVersion: 1,
        createdAt: input.now,
        updatedAt: input.now,
      };
      transaction.create(subjectRef, mapping);
      transaction.create(candidateAccountRef, binding);
      return clone(mapping);
    });
  }

  async function createSession(input) {
    const identity = {
      subject: normalizeSubject(input.subject),
      issuer: normalizeIssuer(input.issuer),
      provider: normalizeProvider(input.provider),
    };
    const accountId = normalizeAccountId(input.accountId);
    const sessionId = normalizeSessionId(input.sessionId);
    const subjectRef = ref(COLLECTIONS.subjects, subjectDocumentId(identity.issuer, identity.subject));
    const accountRef = ref(COLLECTIONS.accounts, accountId);
    const sessionRef = ref(COLLECTIONS.sessions, input.sessionDocumentId);
    return db.runTransaction(async (transaction) => {
      const [mappingSnapshot, bindingSnapshot, sessionSnapshot] = await Promise.all([
        transaction.get(subjectRef), transaction.get(accountRef), transaction.get(sessionRef),
      ]);
      if (sessionSnapshot.exists) fail('SESSION_COLLISION', 'Session identifier collision.');
      const mapping = validateMapping(
        dataOf(mappingSnapshot), dataOf(bindingSnapshot), identity,
      );
      if (mapping.accountId !== accountId || mapping.sessionVersion !== input.sessionVersion) {
        fail('ACCOUNT_MAPPING_CONFLICT', 'Session account mapping changed before issuance.');
      }
      const session = {
        schemaVersion: SESSION_SCHEMA,
        environment: ENVIRONMENT,
        status: 'ACTIVE',
        sessionId,
        sessionDocumentId: input.sessionDocumentId,
        sessionTokenHash: input.sessionTokenHash,
        csrfTokenHash: input.csrfTokenHash,
        subject: identity.subject,
        issuer: identity.issuer,
        provider: identity.provider,
        authenticationAudience: input.authenticationAudience,
        holderAudience: input.holderAudience,
        accountId,
        sessionVersion: input.sessionVersion,
        emailVerified: input.emailVerified,
        authenticationTime: input.authenticationTime,
        assuranceMethods: clone(input.assuranceMethods),
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
        revokedAt: null,
      };
      transaction.create(sessionRef, session);
      return clone(session);
    });
  }

  async function loadSession(input) {
    const sessionSnapshot = await ref(COLLECTIONS.sessions, input.sessionDocumentId).get();
    const session = dataOf(sessionSnapshot);
    if (!session) return null;
    const [mappingSnapshot, bindingSnapshot] = await Promise.all([
      ref(COLLECTIONS.subjects, subjectDocumentId(session.issuer, session.subject)).get(),
      ref(COLLECTIONS.accounts, session.accountId).get(),
    ]);
    validateMapping(dataOf(mappingSnapshot), dataOf(bindingSnapshot), session);
    if (session.schemaVersion !== SESSION_SCHEMA || session.sessionTokenHash !== input.sessionTokenHash
      || session.sessionDocumentId !== input.sessionDocumentId
      || session.sessionVersion !== dataOf(mappingSnapshot).sessionVersion) {
      fail('SESSION_INVALID', 'Stored holder session is inconsistent.');
    }
    return clone(session);
  }

  return Object.freeze({ resolveOrCreateMapping, createSession, loadSession });
}

module.exports = Object.freeze({ COLLECTIONS, createFirestoreHolderAuthStore });
