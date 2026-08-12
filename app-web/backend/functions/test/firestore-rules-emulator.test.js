'use strict';

const assert = require('node:assert/strict');

const projectId = 'demo-coincard-wallet';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(emulatorHost, '127.0.0.1:8083', 'Firestore rules test must run on the isolated emulator');

const collections = [
  'accounts',
  'handleReservations',
  'walletChallenges',
  'walletProofs',
  'walletChallengeRateLimits',
  'coinCardHolderAccounts',
  'coinCardHolderUsernameClaims',
  'coinCardHolderReservations',
  'coinCardHolderCards',
  'coinCardHolderOperations',
  'coinCardHolderEvidenceUses',
  'coinCardHolderAuthSubjects',
  'coinCardHolderAccountBindings',
  'coinCardHolderSessions',
  'orders',
  'coinCards',
  'registry',
  'lifecycleRecords',
  'auditEvents',
  'unexpectedCollection',
];

async function assertDenied(method, collection) {
  const url = `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/probe`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'PATCH' ? JSON.stringify({ fields: { value: { stringValue: 'denied' } } }) : undefined,
  });
  const body = await response.text();
  assert.equal(response.status, 403, `${method} ${collection}: ${response.status} ${body}`);
  assert.match(body, /PERMISSION_DENIED/, `${method} ${collection}`);
}

async function main() {
  for (const collection of collections) {
    await assertDenied('GET', collection);
    await assertDenied('PATCH', collection);
  }
  console.log(`Firestore emulator rules: PASS (${collections.length} collections, reads and writes denied)`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
