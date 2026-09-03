'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const allocationPath = path.join(
  repoRoot,
  'docs/operations/evidence/coin-card-antoine-production-identity-allocation-2026-08-09.json',
);
const transportPreflightPath = path.join(
  repoRoot,
  'docs/operations/evidence/coin-card-antoine-migration-transport-preflight-2026-08-09.json',
);
const publicRoot = path.join(repoRoot, 'coincard/public');
const allocation = JSON.parse(fs.readFileSync(allocationPath, 'utf8'));
const transportPreflight = JSON.parse(fs.readFileSync(transportPreflightPath, 'utf8'));
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function timestampFromUlid(value) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timestamp = 0n;
  for (const character of value.slice(0, 10)) {
    timestamp = timestamp * 32n + BigInt(alphabet.indexOf(character));
  }
  return Number(timestamp);
}

test('Phase A allocates one canonical username to non-fixture opaque production IDs', () => {
  assert.equal(allocation.schemaVersion, 'implicitex-coin-card-production-identity-allocation.v1');
  assert.equal(allocation.status, 'IDENTITY_FROZEN_NOT_PUBLISHED');
  assert.equal(allocation.ceremonyPhase, 'PHASE_A_COMPLETE');
  assert.equal(allocation.identity.username, 'antoinedennison');
  assert.match(allocation.identity.accountId, /^acct_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.match(allocation.identity.cardId, /^cc_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(allocation.identity.accountId.includes('TST'), false);
  assert.equal(allocation.identity.cardId.includes('TST'), false);
  assert.notEqual(allocation.identity.accountId.slice(5), allocation.identity.cardId.slice(3));
  assert.deepEqual(allocation.identityFreeze, {
    status: 'PERMANENT',
    frozenAt: allocation.allocatedAt,
    regenerationPermitted: false,
    reassignmentPermitted: false,
    reusePermitted: false,
    pauseOrDelayChangesIdentity: false,
    declaration: "The allocated account ID and Coin Card ID permanently identify Antoine's production Coin Card even while unpublished.",
  });
});

test('allocated ULID timestamps equal the recorded allocation instant', () => {
  const allocatedAt = Date.parse(allocation.allocatedAt);
  assert.equal(Number.isFinite(allocatedAt), true);
  for (const value of [
    allocation.identity.accountId.slice(5),
    allocation.identity.cardId.slice(3),
  ]) {
    assert.match(value, ULID_RE);
    assert.equal(timestampFromUlid(value), allocatedAt);
  }
});

test('Phase A freezes Antoine public identity and intended Polygon native-USDC route', () => {
  assert.deepEqual(allocation.intendedRoute, {
    chainId: 137,
    chainName: 'Polygon',
    token: 'USDC',
    tokenContract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    recipient: '0x2489587C9da6EaB970a5479BA70273BA37961221',
    amountMode: 'sender_input',
  });
  assert.equal(allocation.identity.canonicalUrl, 'https://antoinedennison.coincard.click/');
  assert.equal(allocation.identity.equivalentUrl, 'https://coincard.click/antoinedennison');
  assert.equal(allocation.identity.legacyUsernameLookup, 'https://coincard.click/antoine');
  assert.equal(allocation.identity.legacyUsernameExpectedOutcome, 'NOT_FOUND');
});

test('signing and publication remain closed after allocation', () => {
  assert.equal(
    allocation.signingCustody.status,
    'REQUIRED_KEYS_NOT_AVAILABLE_IN_WORKSPACE_OR_ENVIRONMENT',
  );
  assert.equal(allocation.signingCustody.rotationAuthorized, false);
  assert.equal(allocation.signingCustody.replacementKeyGenerationAuthorized, false);
  for (const [field, value] of Object.entries(allocation.publicationState)) {
    assert.equal(value, false, field);
  }
  assert.equal(
    allocation.hardGate,
    'CURRENT_HEAD_ADVANCE_FORBIDDEN_UNTIL_LIVE_SNAPSHOT_TRANSPORT_AND_AUTHENTICATION_GATES_PASS',
  );
  assert.equal(allocation.operationalDeclarations.productionIdentifiersAllocated, true);
  assert.equal(allocation.operationalDeclarations.productionIdentifiersPermanentlyFrozen, true);
  assert.equal(allocation.operationalDeclarations.productionIdentifiersPublished, false);
  assert.equal(allocation.operationalDeclarations.currentHeadChanged, false);
});

test('Phase A creates no production endpoint object or immutable snapshot directory', () => {
  assert.equal(
    fs.existsSync(path.join(
      publicRoot,
      '.well-known/coin-card-public-username-registry-head.v1.json',
    )),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(
      publicRoot,
      '.well-known/coin-card-public-username-registry-snapshots',
    )),
    false,
  );
});

test('live transport preflight preserves the Current Head hard gate', () => {
  assert.equal(
    transportPreflight.schemaVersion,
    'implicitex-coin-card-migration-transport-preflight.v1',
  );
  assert.equal(transportPreflight.status, 'LIVE_TRANSPORT_GATE_BLOCKED');
  assert.deepEqual(transportPreflight.identity, {
    username: allocation.identity.username,
    accountId: allocation.identity.accountId,
    cardId: allocation.identity.cardId,
  });
  assert.equal(
    transportPreflight.checks.apexOrigin.result,
    'RESPONDED_FROM_UNEXPECTED_ORIGIN',
  );
  assert.equal(
    transportPreflight.checks.currentHeadEndpoint.result,
    'TRANSPORT_CONTRACT_VIOLATED',
  );
  assert.equal(transportPreflight.checks.currentHeadEndpoint.httpStatus, 200);
  assert.equal(transportPreflight.checks.currentHeadEndpoint.requiredContentTypePassed, false);
  assert.equal(transportPreflight.checks.currentHeadEndpoint.requiredNoStorePassed, false);
  assert.equal(transportPreflight.checks.currentHeadEndpoint.requiredCorsPassed, false);
  assert.equal(
    transportPreflight.checks.canonicalUsernameOrigin.result,
    'DNS_RESOLUTION_FAILED',
  );
  assert.equal(
    transportPreflight.checks.firebaseHostingControlPlane.result,
    'AUTHENTICATION_EXPIRED',
  );
  assert.equal(transportPreflight.gateEvaluation.currentHeadAdvanceAuthorized, false);
  assert.equal(transportPreflight.operationalDeclarations.signatureCreated, false);
  assert.equal(transportPreflight.operationalDeclarations.deploymentOccurred, false);
  assert.equal(transportPreflight.operationalDeclarations.dnsChanged, false);
  assert.equal(transportPreflight.operationalDeclarations.currentHeadChanged, false);
});
