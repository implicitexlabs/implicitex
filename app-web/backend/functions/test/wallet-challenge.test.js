'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Wallet } = require('ethers');
const {
  CHALLENGE_TTL_MS,
  PURPOSE,
  RATE_LIMIT_MAX_ISSUES,
  RATE_LIMIT_WINDOW_MS,
  WalletChallengeError,
} = require('../src/wallet-challenge/domain');
const {
  createFirestoreWalletChallengeStore,
} = require('../src/wallet-challenge/firestore-store');
const {
  createWalletChallengeService,
} = require('../src/wallet-challenge/service');

function clone(value) {
  return structuredClone(value);
}

class FakeDocumentReference {
  constructor(db, documentPath) {
    this.db = db;
    this.path = documentPath;
  }
}

class FakeCollectionReference {
  constructor(db, collectionPath) {
    this.db = db;
    this.path = collectionPath;
  }

  doc(id) {
    return new FakeDocumentReference(this.db, `${this.path}/${id}`);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.writes = [];
  }

  async get(ref) {
    const data = this.db.documents.get(ref.path);
    return {
      exists: data !== undefined,
      data: () => clone(data),
    };
  }

  create(ref, data) {
    if (this.db.documents.has(ref.path) || this.writes.some((write) => write.path === ref.path)) {
      throw new Error(`already exists: ${ref.path}`);
    }
    this.writes.push({ kind: 'create', path: ref.path, data: clone(data) });
  }

  set(ref, data) {
    this.writes.push({ kind: 'set', path: ref.path, data: clone(data) });
  }

  update(ref, data) {
    if (!this.db.documents.has(ref.path)) throw new Error(`not found: ${ref.path}`);
    this.writes.push({ kind: 'update', path: ref.path, data: clone(data) });
  }

  commit() {
    for (const write of this.writes) {
      if (write.kind === 'update') {
        this.db.documents.set(write.path, {
          ...this.db.documents.get(write.path),
          ...write.data,
        });
      } else {
        this.db.documents.set(write.path, write.data);
      }
    }
  }
}

class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.transactionTail = Promise.resolve();
  }

  collection(name) {
    return new FakeCollectionReference(this, name);
  }

  runTransaction(callback) {
    const run = this.transactionTail.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.transactionTail = run.catch(() => {});
    return run;
  }

  read(documentPath) {
    const value = this.documents.get(documentPath);
    return value === undefined ? null : clone(value);
  }

  list(collection) {
    const prefix = `${collection}/`;
    return [...this.documents.entries()]
      .filter(([documentPath]) => documentPath.startsWith(prefix))
      .map(([, value]) => clone(value));
  }
}

function makeEnvironment() {
  let nowMs = Date.parse('2026-07-25T12:00:00.000Z');
  const db = new FakeFirestore();
  const store = createFirestoreWalletChallengeStore(db);
  const service = createWalletChallengeService({
    store,
    clock: () => new Date(nowMs),
  });
  return {
    db,
    service,
    advance(ms) {
      nowMs += ms;
    },
  };
}

function actor(uid = 'account_alice', emailVerified = true) {
  return { uid, emailVerified };
}

function issueInput(wallet, overrides = {}) {
  return {
    handle: 'alice',
    walletAddress: wallet.address,
    chainId: 137,
    purpose: PURPOSE,
    ...overrides,
  };
}

function verifyInput(challenge, signature, overrides = {}) {
  return {
    challengeId: challenge.challengeId,
    requestId: challenge.requestId,
    handle: challenge.bindings.handle,
    walletAddress: challenge.bindings.walletAddress,
    chainId: challenge.bindings.chainId,
    purpose: challenge.bindings.purpose,
    signature,
    ...overrides,
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => (
    error instanceof WalletChallengeError && error.code === code
  ));
}

test('server issues 32 random nonce bytes and binds the canonical account operation', async () => {
  const wallet = Wallet.createRandom();
  const { db, service } = makeEnvironment();
  const challenge = await service.issueChallenge(actor(), issueInput(wallet, {
    handle: 'Alice',
    nonce: 'client-controlled-nonce-must-be-ignored',
  }));

  assert.equal(challenge.bindings.domain, 'implicitex.com');
  assert.equal(challenge.bindings.version, 1);
  assert.equal(challenge.bindings.accountId, 'account_alice');
  assert.equal(challenge.bindings.handle, 'alice');
  assert.equal(challenge.bindings.walletAddress, wallet.address);
  assert.equal(challenge.bindings.chainId, 137);
  assert.equal(challenge.bindings.purpose, PURPOSE);
  assert.match(challenge.requestId, /^[0-9a-f-]{36}$/);
  assert.match(challenge.challengeId, /^[A-Za-z0-9_-]{32}$/);

  const nonce = challenge.message.match(/^nonce: ([A-Za-z0-9_-]+)$/m)[1];
  assert.equal(Buffer.from(nonce, 'base64url').length, 32);
  assert.notEqual(nonce, 'client-controlled-nonce-must-be-ignored');
  assert.match(challenge.message, /^ImplicitEx Coin Card Wallet Ownership v1\n\n/);
  assert.match(challenge.message, /^account_id: account_alice$/m);
  assert.match(challenge.message, /^request_id: [0-9a-f-]{36}$/m);
  assert.equal(db.read(`walletChallenges/${challenge.challengeId}`).status, 'ISSUED');
  assert.equal(db.list('auditEvents')[0].eventType, 'WALLET_CHALLENGE_ISSUED');
});

test('valid EIP-191 signature atomically creates one immutable wallet proof', async () => {
  const wallet = Wallet.createRandom();
  const { db, service } = makeEnvironment();
  const challenge = await service.issueChallenge(actor(), issueInput(wallet));
  const signature = await wallet.signMessage(challenge.message);
  const result = await service.verifyChallenge(actor(), verifyInput(challenge, signature));

  assert.equal(result.verified, true);
  assert.equal(result.proofId, challenge.challengeId);
  assert.equal(result.walletAddress, wallet.address);
  const record = db.read(`walletChallenges/${challenge.challengeId}`);
  const proof = db.read(`walletProofs/${challenge.challengeId}`);
  assert.equal(record.status, 'VERIFIED');
  assert.equal(record.proofId, challenge.challengeId);
  assert.equal(proof.accountId, 'account_alice');
  assert.equal(proof.handle, 'alice');
  assert.equal(proof.requestId, challenge.requestId);
  assert.equal(proof.signature, signature);
  assert.equal(db.list('auditEvents').at(-1).eventType, 'WALLET_CHALLENGE_VERIFIED');
});

test('replayed signature is rejected after successful atomic consumption', async () => {
  const wallet = Wallet.createRandom();
  const { service } = makeEnvironment();
  const challenge = await service.issueChallenge(actor(), issueInput(wallet));
  const request = verifyInput(challenge, await wallet.signMessage(challenge.message));

  await service.verifyChallenge(actor(), request);
  await expectCode(service.verifyChallenge(actor(), request), 'CHALLENGE_REPLAYED');
});

test('concurrent double submission permits exactly one proof', async () => {
  const wallet = Wallet.createRandom();
  const { db, service } = makeEnvironment();
  const challenge = await service.issueChallenge(actor(), issueInput(wallet));
  const request = verifyInput(challenge, await wallet.signMessage(challenge.message));
  const results = await Promise.allSettled([
    service.verifyChallenge(actor(), request),
    service.verifyChallenge(actor(), request),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejection = results.find((result) => result.status === 'rejected');
  assert.equal(rejection.reason.code, 'CHALLENGE_REPLAYED');
  assert.equal(db.list('walletProofs').length, 1);
  assert.equal(
    db.list('auditEvents').filter((event) => event.eventType === 'WALLET_CHALLENGE_VERIFIED').length,
    1,
  );
});

test('expired challenge is terminal and cannot later be replayed', async () => {
  const wallet = Wallet.createRandom();
  const env = makeEnvironment();
  const challenge = await env.service.issueChallenge(actor(), issueInput(wallet));
  const request = verifyInput(challenge, await wallet.signMessage(challenge.message));
  env.advance(CHALLENGE_TTL_MS);

  await expectCode(env.service.verifyChallenge(actor(), request), 'CHALLENGE_EXPIRED');
  assert.equal(env.db.read(`walletChallenges/${challenge.challengeId}`).status, 'EXPIRED');
  await expectCode(env.service.verifyChallenge(actor(), request), 'CHALLENGE_REPLAYED');
});

test('wrong signer is terminal and the valid signer cannot reuse the nonce', async () => {
  const owner = Wallet.createRandom();
  const attacker = Wallet.createRandom();
  const { db, service } = makeEnvironment();
  const challenge = await service.issueChallenge(actor(), issueInput(owner));

  await expectCode(
    service.verifyChallenge(
      actor(),
      verifyInput(challenge, await attacker.signMessage(challenge.message)),
    ),
    'SIGNER_MISMATCH',
  );
  assert.equal(db.read(`walletChallenges/${challenge.challengeId}`).status, 'REJECTED');
  await expectCode(
    service.verifyChallenge(
      actor(),
      verifyInput(challenge, await owner.signMessage(challenge.message)),
    ),
    'CHALLENGE_REPLAYED',
  );
});

test('wallet, handle, chain, purpose, and request mutations are bound and terminal', async () => {
  const mutationCases = [
    ['walletAddress', () => Wallet.createRandom().address],
    ['handle', () => 'mallory'],
    ['chainId', () => 80002],
    ['purpose', () => 'update_wallet'],
    ['requestId', () => crypto.randomUUID()],
  ];

  for (const [field, replacement] of mutationCases) {
    const wallet = Wallet.createRandom();
    const { db, service } = makeEnvironment();
    const challenge = await service.issueChallenge(actor(), issueInput(wallet));
    const signature = await wallet.signMessage(challenge.message);
    const request = verifyInput(challenge, signature, { [field]: replacement() });

    await expectCode(service.verifyChallenge(actor(), request), 'CHALLENGE_BINDING_MISMATCH');
    const record = db.read(`walletChallenges/${challenge.challengeId}`);
    assert.equal(record.status, 'REJECTED', field);
    assert.equal(db.list('auditEvents').at(-1).mismatchField, field);
    await expectCode(
      service.verifyChallenge(actor(), verifyInput(challenge, signature)),
      'CHALLENGE_REPLAYED',
    );
  }
});

test('signatures over changed domain or version messages are rejected and consumed', async () => {
  const mutations = [
    (message) => message.replace('domain: implicitex.com', 'domain: attacker.example'),
    (message) => message.replace('version: 1', 'version: 2'),
  ];
  for (const mutate of mutations) {
    const wallet = Wallet.createRandom();
    const { service } = makeEnvironment();
    const challenge = await service.issueChallenge(actor(), issueInput(wallet));
    const signature = await wallet.signMessage(mutate(challenge.message));

    await expectCode(
      service.verifyChallenge(actor(), verifyInput(challenge, signature)),
      'SIGNER_MISMATCH',
    );
    await expectCode(
      service.verifyChallenge(
        actor(),
        verifyInput(challenge, await wallet.signMessage(challenge.message)),
      ),
      'CHALLENGE_REPLAYED',
    );
  }
});

test('cross-account reuse is rejected without consuming the owner challenge', async () => {
  const wallet = Wallet.createRandom();
  const { service } = makeEnvironment();
  const challenge = await service.issueChallenge(actor(), issueInput(wallet));
  const request = verifyInput(challenge, await wallet.signMessage(challenge.message));

  await expectCode(
    service.verifyChallenge(actor('account_mallory'), request),
    'CHALLENGE_ACCOUNT_MISMATCH',
  );
  const result = await service.verifyChallenge(actor(), request);
  assert.equal(result.verified, true);
});

test('unverified email cannot issue or consume ownership evidence', async () => {
  const wallet = Wallet.createRandom();
  const { service } = makeEnvironment();
  await expectCode(
    service.issueChallenge(actor('account_alice', false), issueInput(wallet)),
    'EMAIL_NOT_VERIFIED',
  );

  const challenge = await service.issueChallenge(actor(), issueInput(wallet));
  const request = verifyInput(challenge, await wallet.signMessage(challenge.message));
  await expectCode(
    service.verifyChallenge(actor('account_alice', false), request),
    'EMAIL_NOT_VERIFIED',
  );
  assert.equal((await service.verifyChallenge(actor(), request)).verified, true);
});

test('challenge issuance rate limit is transactionally enforced and resets by window', async () => {
  const wallet = Wallet.createRandom();
  const env = makeEnvironment();
  for (let i = 0; i < RATE_LIMIT_MAX_ISSUES; i++) {
    await env.service.issueChallenge(actor(), issueInput(wallet, { handle: `alice${i}` }));
  }
  await expectCode(
    env.service.issueChallenge(actor(), issueInput(wallet, { handle: 'alice9' })),
    'RATE_LIMITED',
  );
  env.advance(RATE_LIMIT_WINDOW_MS);
  const challenge = await env.service.issueChallenge(
    actor(),
    issueInput(wallet, { handle: 'alice9' }),
  );
  assert.equal(challenge.bindings.handle, 'alice9');
});

test('authoritative Firestore rules deny every direct client read and write', () => {
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const source = fs.readFileSync(rulesPath, 'utf8');
  const collectionNames = [
    'accounts',
    'handleReservations',
    'walletChallenges',
    'walletProofs',
    'walletChallengeRateLimits',
    'orders',
    'coinCards',
    'registry',
    'lifecycleRecords',
    'auditEvents',
  ];
  for (const collection of collectionNames) {
    assert.ok(
      source.includes(`match /${collection}/{document=**}`),
      `${collection} must have an explicit deny rule`,
    );
  }
  assert.equal((source.match(/allow read, write: if false;/g) || []).length, 11);
  assert.doesNotMatch(source, /allow\s+(read|write)[^;]*if\s+true/);
});
