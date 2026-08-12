'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  HOLDER_ORIGIN,
  SESSION_TTL_MS,
} = require('../src/holder-auth/contract');
const { createFirestoreHolderAuthStore, COLLECTIONS } = require('../src/holder-auth/firestore-auth-store');
const { createHolderSessionService } = require('../src/holder-auth/session-service');
const {
  createLocalAuthenticationHarness,
} = require('../src/holder-auth/local-authenticator');

const ACCOUNT_A = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8';
const ACCOUNT_B = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR9';
const START = Date.parse('2026-08-11T12:00:00.000Z');

function clone(value) { return value === undefined || value === null ? value : structuredClone(value); }

class Ref {
  constructor(db, path) { this.db = db; this.path = path; }
  async get() {
    const value = this.db.documents.get(this.path);
    return { exists: value !== undefined, data: () => clone(value) };
  }
}
class Collection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, `${this.path}/${id}`); }
}
class Transaction {
  constructor(db) { this.db = db; this.writes = []; }
  async get(ref) {
    const value = this.db.documents.get(ref.path);
    return { exists: value !== undefined, data: () => clone(value) };
  }
  create(ref, data) {
    if (this.db.documents.has(ref.path) || this.writes.some((write) => write.path === ref.path)) {
      throw new Error(`already exists: ${ref.path}`);
    }
    this.writes.push({ path: ref.path, data: clone(data) });
  }
  commit() { for (const write of this.writes) this.db.documents.set(write.path, write.data); }
}
class Db {
  constructor() { this.documents = new Map(); this.tail = Promise.resolve(); }
  collection(name) { return new Collection(this, name); }
  runTransaction(callback) {
    const run = this.tail.then(async () => {
      const transaction = new Transaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.tail = run.catch(() => {});
    return run;
  }
  list(collection) {
    return [...this.documents.entries()].filter(([path]) => path.startsWith(`${collection}/`));
  }
}

function environment() {
  let nowMs = START;
  let accountIndex = 0;
  const db = new Db();
  const auth = createLocalAuthenticationHarness({ clock: () => new Date(nowMs) });
  const store = createFirestoreHolderAuthStore(db);
  const ensured = [];
  const session = createHolderSessionService({
    store,
    authenticationVerifier: auth.verifier,
    controlPlaneService: {
      async ensureAccount(principal) { ensured.push(principal.accountId); },
    },
    clock: () => new Date(nowMs),
    accountIdFactory: () => [ACCOUNT_A, ACCOUNT_B][accountIndex++],
  });
  return { db, auth, store, session, ensured, advance(ms) { nowMs += ms; }, now: () => new Date(nowMs) };
}

test('verified subject maps transactionally to one opaque account', async () => {
  const env = environment();
  const token = env.auth.issueToken({ subject: 'stable-firebase-subject' });
  const [first, second] = await Promise.all([
    env.session.issueSession(token),
    env.session.issueSession(token),
  ]);
  assert.equal(first.accountId, second.accountId);
  assert.equal(env.db.list(COLLECTIONS.subjects).length, 1);
  assert.equal(env.db.list(COLLECTIONS.accounts).length, 1);
  assert.deepEqual(env.ensured, [ACCOUNT_A, ACCOUNT_A]);
  assert.notEqual(first.sessionId, second.sessionId);
});

test('host-only session verifies to a privately branded Coin Card principal', async () => {
  const env = environment();
  const issued = await env.session.issueSession(env.auth.issueToken({ subject: 'session-subject' }));
  assert.match(issued.setCookie, /^__Host-coincard_session=/);
  assert.match(issued.setCookie, /; Secure; HttpOnly; SameSite=Strict$/);
  assert.doesNotMatch(issued.setCookie, /Domain=/i);
  const cookie = issued.setCookie.split(';', 1)[0];
  const principal = await env.session.verifySession(cookie);
  assert.equal(principal.authenticationSubject, 'session-subject');
  assert.equal(principal.accountId, ACCOUNT_A);
  assert.equal(principal.audience, 'coin-card-holder');
  assert.equal(principal.origin, HOLDER_ORIGIN);
  assert.equal(env.session.requireVerifiedPrincipal(principal), principal);
  assert.throws(() => env.session.requireVerifiedPrincipal({ ...principal }), /Verified holder session/);
  assert.equal(await env.session.verifyCsrf(principal, issued.csrfToken, cookie), true);
  await assert.rejects(env.session.verifyCsrf(principal, 'malformed', cookie), (error) => error.code === 'CSRF_INVALID');
});

test('session expires exactly at its server-side boundary', async () => {
  const env = environment();
  const issued = await env.session.issueSession(env.auth.issueToken({ subject: 'expiring-subject' }));
  const cookie = issued.setCookie.split(';', 1)[0];
  env.advance(SESSION_TTL_MS - 1);
  assert.equal((await env.session.verifySession(cookie)).accountId, ACCOUNT_A);
  env.advance(1);
  await assert.rejects(env.session.verifySession(cookie), (error) => error.code === 'SESSION_EXPIRED_OR_REVOKED');
});
