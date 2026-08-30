'use strict';

/**
 * payment-route-flow.test.js
 * ==========================
 * Workflow tests for IXIDPaymentRouteFlow.doSignAndPublish.
 *
 * These tests verify the full orchestration: account state checked before
 * challenge, exact challenge text forwarded to signer, account change detected
 * at both guard points, network contract (no chain restriction at signing),
 * user rejection, signature forwarded to verify endpoint, successful publication,
 * and replacement flow.
 *
 * All tests use stub implementations — zero real network calls.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'public/payment-route-flow.js'), 'utf8');

// Load into an isolated context that exposes the module via CommonJS.
const sandbox = { module: { exports: {} } };
vm.runInNewContext(src, sandbox);
const { doSignAndPublish } = sandbox.module.exports;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ── Constants ──────────────────────────────────────────────────────────────────

const ADDR = '0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb';
const ADDR_ALT = '0x1234567890abcdef1234567890abcdef12345678';
const CHALLENGE_TEXT = 'IX ID ownership challenge: chain_id=137 network=polygon address=' + ADDR + ' nonce=abc123';
const CHALLENGE_ID = 'ch-test-id-001';
const SIG = '0xdeadbeef1234';
const CLAIM_ID = 'claim-001';

// ── Stub builders ─────────────────────────────────────────────────────────────

// Build a wallet stub.
// opts.accounts: accounts returned by getAccounts() for all calls (default: [ADDR])
// opts.accountsSequence: if provided, each getAccounts() call consumes the next entry
// opts.signResult: signMessage result (default: { rejected: false, signature: SIG })
function makeWallet(opts) {
  var o = opts || {};
  var accountsSequence = o.accountsSequence || null;
  var callIndex = 0;
  return {
    getAccounts: function getAccounts() {
      if (accountsSequence) {
        var entry = accountsSequence[callIndex] || accountsSequence[accountsSequence.length - 1];
        callIndex++;
        return Promise.resolve(entry);
      }
      return Promise.resolve(o.accounts !== undefined
        ? o.accounts
        : { rejected: false, accounts: [ADDR] });
    },
    signMessage: function signMessage(text, address) {
      // Record what was passed so tests can assert on it
      makeWallet._lastSignArgs = { text: text, address: address };
      var res = o.signResult !== undefined ? o.signResult : { rejected: false, signature: SIG };
      return Promise.resolve(res);
    },
  };
}
makeWallet._lastSignArgs = null;

// Build an API stub.
// opts.challengeStatus: HTTP status for issueWalletChallenge (default: 201)
// opts.challengeBody: body for issueWalletChallenge
// opts.verifyStatus: HTTP status for verifyWallet (default: 200)
// opts.verifyBody: body for verifyWallet
// Records calls for assertion.
function makeApi(opts) {
  var o = opts || {};
  var calls = [];
  return {
    _calls: calls,
    issueWalletChallenge: function issueWalletChallenge(token, address) {
      calls.push({ method: 'issueWalletChallenge', token: token, address: address });
      var status = o.challengeStatus !== undefined ? o.challengeStatus : 201;
      var body = o.challengeBody !== undefined ? o.challengeBody : {
        challenge_id: CHALLENGE_ID,
        challenge_text: CHALLENGE_TEXT,
        ix_id: 'alice',
        destination_address: address,
        chain_id: 137,
        expires_at: '2026-08-27T12:10:00Z',
      };
      return Promise.resolve({ status: status, body: body });
    },
    verifyWallet: function verifyWallet(token, challengeId, signature) {
      calls.push({ method: 'verifyWallet', token: token, challengeId: challengeId, signature: signature });
      var status = o.verifyStatus !== undefined ? o.verifyStatus : 200;
      var body = o.verifyBody !== undefined ? o.verifyBody : {
        claim_id: CLAIM_ID,
        ix_id: 'alice',
        destination_address: ADDR,
        chain_id: 137,
        is_replacement: false,
      };
      return Promise.resolve({ status: status, body: body });
    },
  };
}

function makeGetToken(token) {
  return async function getToken() { return token !== undefined ? token : 'test-token'; };
}

// ── Tests: successful publication ─────────────────────────────────────────────

test('successful publication: resolves ok=true with claim_id, ix_id, destination_address', async function () {
  var wallet = makeWallet();
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, true);
  assert.equal(result.claim_id, CLAIM_ID);
  assert.equal(result.ix_id, 'alice');
  assert.equal(result.destination_address, ADDR);
});

test('challenge is requested for the current connected account address', async function () {
  var wallet = makeWallet();
  var api = makeApi();
  await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  var challengeCall = api._calls.find(function(c) { return c.method === 'issueWalletChallenge'; });
  assert.ok(challengeCall, 'issueWalletChallenge must be called');
  assert.equal(challengeCall.address, ADDR, 'challenge must be issued for the connected wallet address');
});

test('exact server challenge text is forwarded to the signer', async function () {
  var wallet = makeWallet();
  var api = makeApi();
  await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.ok(makeWallet._lastSignArgs, 'signMessage must be called');
  assert.equal(makeWallet._lastSignArgs.text, CHALLENGE_TEXT,
    'signMessage must receive the exact challenge_text from the server response');
  assert.equal(makeWallet._lastSignArgs.address, ADDR,
    'signMessage must use the connected wallet address');
});

test('signature returned by signer is forwarded to the verify endpoint', async function () {
  var wallet = makeWallet({ signResult: { rejected: false, signature: '0xsentinel' } });
  var api = makeApi();
  await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  var verifyCall = api._calls.find(function(c) { return c.method === 'verifyWallet'; });
  assert.ok(verifyCall, 'verifyWallet must be called');
  assert.equal(verifyCall.challengeId, CHALLENGE_ID);
  assert.equal(verifyCall.signature, '0xsentinel',
    'verifyWallet must receive the exact signature from the signer');
});

// ── Tests: account change detection ──────────────────────────────────────────

test('account_changed before challenge: if wallet reports a different account, no challenge is issued', async function () {
  // getAccounts returns a different address than what was passed as `address`
  var wallet = makeWallet({ accounts: { rejected: false, accounts: [ADDR_ALT] } });
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'account_changed');
  assert.equal(api._calls.length, 0, 'no challenge should be issued when account does not match');
});

test('account_changed_during_signing: if wallet account changes after challenge issuance, no sign call is made', async function () {
  // First getAccounts call (before challenge): returns ADDR — OK
  // Second getAccounts call (after challenge, before signing): returns ADDR_ALT — mismatch
  var wallet = makeWallet({
    accountsSequence: [
      { rejected: false, accounts: [ADDR] },
      { rejected: false, accounts: [ADDR_ALT] },
    ],
  });
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'account_changed_during_signing');

  // Challenge was issued (first guard passed)
  var challengeCall = api._calls.find(function(c) { return c.method === 'issueWalletChallenge'; });
  assert.ok(challengeCall, 'challenge was issued before account change was detected');

  // But sign was NOT called — abort before signMessage
  assert.equal(makeWallet._lastSignArgs && makeWallet._lastSignArgs.text, null,
    'signMessage must not be called after account change detected post-challenge');
  // verifyWallet must not be called
  assert.equal(api._calls.filter(function(c) { return c.method === 'verifyWallet'; }).length, 0);
});

// ── Tests: network contract ────────────────────────────────────────────────────

test('network contract: personal_sign is called regardless of wallet chainId; no chain check before signing', async function () {
  // Wallet is "on" Ethereum mainnet (chainId 1), not Polygon.
  // M3 contract: network at signing time is irrelevant. The challenge text
  // binds the route to Polygon chain 137; no chainId restriction at signing.
  var wallet = makeWallet();
  // Add a fake chainId property to document the contract; it should not affect the flow.
  wallet.validateChainId = function() { return false; }; // would fail a chain check
  var api = makeApi();

  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  // Flow must succeed; chainId of the wallet was not checked during signing
  assert.equal(result.ok, true, 'flow must succeed even if wallet is on a non-Polygon network');
  assert.ok(makeWallet._lastSignArgs, 'signMessage must have been called');
});

// ── Tests: no address / no wallet ────────────────────────────────────────────

test('no_address: resolves ok=false when address is empty or null', async function () {
  var wallet = makeWallet();
  var api = makeApi();

  var r1 = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: '' });
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'no_address');
  assert.equal(api._calls.length, 0);

  var r2 = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: null });
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'no_address');
});

test('no_wallet: resolves ok=false when wallet connector is absent', async function () {
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet: null, getToken: makeGetToken(), address: ADDR });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'no_wallet');
  assert.equal(api._calls.length, 0);
});

// ── Tests: wallet unavailable ─────────────────────────────────────────────────

test('wallet_unavailable: getAccounts rejected before challenge → ok=false, no challenge issued', async function () {
  var wallet = makeWallet({ accounts: { rejected: true, reason: 'no_provider', accounts: [] } });
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'wallet_unavailable');
  assert.equal(api._calls.length, 0);
});

// ── Tests: unauthenticated ────────────────────────────────────────────────────

test('unauthenticated: getToken returns null → ok=false, no API calls', async function () {
  var wallet = makeWallet();
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(null), address: ADDR });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unauthenticated');
  assert.equal(api._calls.length, 0);
});

// ── Tests: user rejection ─────────────────────────────────────────────────────

test('sign_rejected: user rejects in wallet → ok=false code=sign_rejected, no verify call', async function () {
  var wallet = makeWallet({ signResult: { rejected: true, reason: 'user_rejected', code: 4001 } });
  var api = makeApi();
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'sign_rejected');
  assert.match(result.message, /rejected in wallet/i);
  assert.equal(api._calls.filter(function(c) { return c.method === 'verifyWallet'; }).length, 0,
    'verifyWallet must not be called after user rejection');
});

// ── Tests: challenge failure ──────────────────────────────────────────────────

test('challenge_failed: server 422 → ok=false code=challenge_failed, no sign or verify call', async function () {
  var wallet = makeWallet();
  var api = makeApi({ challengeStatus: 422, challengeBody: { error: 'INVALID_ADDRESS' } });
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'challenge_failed');
  assert.equal(api._calls.filter(function(c) { return c.method === 'verifyWallet'; }).length, 0);
  assert.ok(!makeWallet._lastSignArgs || !makeWallet._lastSignArgs.text,
    'signMessage must not be called after challenge failure');
});

test('challenge_failed rate-limited: server 429 → message indicates too many attempts', async function () {
  var wallet = makeWallet();
  var api = makeApi({ challengeStatus: 429, challengeBody: { error: 'RATE_LIMIT_EXCEEDED' } });
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'challenge_failed');
  assert.match(result.message, /too many/i);
});

// ── Tests: verify failure ─────────────────────────────────────────────────────

test('verify_failed WRONG_SIGNER: message identifies signer mismatch', async function () {
  var wallet = makeWallet();
  var api = makeApi({ verifyStatus: 422, verifyBody: { error: 'WRONG_SIGNER' } });
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'verify_failed');
  assert.match(result.message, /does not match/i);
});

test('verify_failed CHALLENGE_EXPIRED: message indicates expiry', async function () {
  var wallet = makeWallet();
  var api = makeApi({ verifyStatus: 422, verifyBody: { error: 'CHALLENGE_EXPIRED' } });
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'verify_failed');
  assert.match(result.message, /expired/i);
});

test('verify_failed rate-limited: server 429 → message indicates too many attempts', async function () {
  var wallet = makeWallet();
  var api = makeApi({ verifyStatus: 429, verifyBody: { error: 'RATE_LIMIT_EXCEEDED' } });
  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'verify_failed');
  assert.match(result.message, /too many/i);
});

// ── Tests: replacement flow ───────────────────────────────────────────────────

test('replacement flow: called with a different address, challenge is issued for that address', async function () {
  var wallet = makeWallet({ accounts: { rejected: false, accounts: [ADDR_ALT] } });
  var api = makeApi({
    challengeBody: {
      challenge_id: 'ch-replacement',
      challenge_text: 'challenge for ' + ADDR_ALT,
      ix_id: 'alice',
      destination_address: ADDR_ALT,
      chain_id: 137,
      expires_at: '2026-08-27T12:10:00Z',
    },
    verifyBody: {
      claim_id: 'claim-002',
      ix_id: 'alice',
      destination_address: ADDR_ALT,
      chain_id: 137,
      is_replacement: true,
    },
  });

  var result = await doSignAndPublish({ api, wallet, getToken: makeGetToken(), address: ADDR_ALT });

  assert.equal(result.ok, true);
  assert.equal(result.claim_id, 'claim-002');
  assert.equal(result.destination_address, ADDR_ALT);

  var challengeCall = api._calls.find(function(c) { return c.method === 'issueWalletChallenge'; });
  assert.equal(challengeCall.address, ADDR_ALT, 'replacement challenge must be issued for the new address');
});

// ── reset sign args between tests ─────────────────────────────────────────────

// Ensure _lastSignArgs is reset between tests that check it
(function resetSignArgsHook() {
  var original = tests.map(function(t) { return t.fn; });
  tests.forEach(function(entry, i) {
    var fn = original[i];
    entry.fn = async function() {
      makeWallet._lastSignArgs = null;
      return fn();
    };
  });
}());

// ── Runner ────────────────────────────────────────────────────────────────────

(async function run() {
  var passed = 0;
  var failures = [];
  for (var entry of tests) {
    try {
      await entry.fn();
      passed++;
    } catch (error) {
      failures.push({ name: entry.name, error: error });
    }
  }
  failures.forEach(function(failure) {
    process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
  });
  process.stdout.write('\n' + tests.length + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) process.exitCode = 1;
}());
