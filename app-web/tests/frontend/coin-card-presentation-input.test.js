const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '../..');
const modulePath = path.join(appRoot, 'frontend/public/coincard/coin-card-presentation-input.js');
const presentationInput = require(modulePath);
const { normalizeLaneAPresentationInput } = presentationInput;

const LIVE_STATUS_TEXT = {
  no_provider: 'No wallet detected',
  no_wallet: 'No wallet connected',
  wallet_pending: 'Connecting',
  wrong_network: 'Wrong network',
  no_amount: 'Enter amount',
  insufficient_balance: 'Insufficient USDC balance',
  ready: 'Ready',
  approval_pending: 'Approval pending',
  approval_confirming: 'Approval confirming',
  approval_rejected: 'Approval rejected',
  credential_changed: 'Credential changed',
  credential_unavailable: 'Credential unavailable',
  transfer_pending: 'Transfer pending',
  transfer_unconfirmed: 'Transfer submitted',
  transfer_rejected: 'Transfer rejected',
  transfer_failed: 'Transfer failed',
  settled: 'Transfer confirmed',
};

const REVIEW_OVERLAP = {
  no_provider: 'wallet adapter: live no-provider has no exact review axis value',
  no_wallet: 'wallet=DISCONNECTED',
  wallet_pending: 'wallet=CONNECTING',
  wrong_network: 'wallet=CONNECTED_WRONG_NETWORK / networkSupport adapter',
  no_amount: 'amountText=EMPTY',
  unknown_funds: 'funding=UNKNOWN',
  insufficient_balance: 'funding=INSUFFICIENT_USDC',
  ready: 'execution=EXECUTION_READY with allowance adapter omitted',
  approval_pending: 'execution=APPROVAL_PENDING',
  approval_confirming: 'execution=APPROVAL_PENDING plus approval confirmation adapter',
  approval_rejected: 'execution failure adapter required',
  credential_changed: 'route mutation adapter required; no direct review state',
  credential_unavailable: 'routeAvailability=UNAVAILABLE / routeValidity=UNKNOWN',
  transfer_pending: 'execution=TRANSFER_PENDING',
  transfer_unconfirmed: 'receipt=SUBMITTED / receiptOutcome=unknown adapter',
  transfer_rejected: 'execution failure adapter required',
  transfer_failed: 'execution=FAILED adapter',
  settled: 'execution=CONFIRMED / receipt=FINAL / receiptOutcome=success',
  route_unknown: 'routeAvailability adapter required',
  route_revoked: 'routeValidity adapter required',
  route_unavailable: 'routeAvailability=UNAVAILABLE',
  route_verified: 'routeAvailability=AVAILABLE / routeValidity=VALID',
};

const ENUM_VALUES = {
  viewMode: ['BADGE', 'INSPECT', 'TRANSACT', 'SETTLE'],
  routeState: ['UNKNOWN', 'VERIFIED', 'REVOKED', 'UNAVAILABLE'],
  providerState: ['AVAILABLE', 'UNAVAILABLE'],
  walletState: ['DISCONNECTED', 'CONNECTING', 'CONNECTED'],
  networkState: ['UNKNOWN', 'EXPECTED', 'WRONG'],
  amountState: ['EMPTY', 'PRESENT'],
  fundsState: ['UNKNOWN', 'SUFFICIENT', 'INSUFFICIENT'],
  credentialState: ['OK', 'CHANGED', 'UNAVAILABLE'],
  executionPhase: [
    'IDLE',
    'APPROVAL_PENDING',
    'APPROVAL_CONFIRMING',
    'APPROVAL_REJECTED',
    'TRANSFER_PENDING',
    'TRANSFER_SUBMITTED',
    'TRANSFER_REJECTED',
    'TRANSFER_FAILED',
    'CONFIRMED',
  ],
};

function baseObservation(overrides = {}) {
  return Object.assign({
    viewMode: 'TRANSACT',
    routeState: 'VERIFIED',
    providerState: 'AVAILABLE',
    walletState: 'CONNECTED',
    networkState: 'EXPECTED',
    amountState: 'PRESENT',
    fundsState: 'SUFFICIENT',
    credentialState: 'OK',
    executionPhase: 'IDLE',
  }, overrides);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoExecutionAuthorityFields(output) {
  const forbidden = new Set(['canSend', 'authorized', 'allowed', 'enabled', 'canExecute', 'shouldSend']);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach((key) => {
      assert.equal(forbidden.has(key), false, `forbidden execution-authority field: ${key}`);
      visit(value[key]);
    });
  }
  visit(output);
}

function assertNoVisibleCopyOrCtaLabels(output) {
  const text = JSON.stringify(output);
  Object.values(LIVE_STATUS_TEXT).forEach((label) => {
    assert.equal(text.includes(label), false, `visible label leaked into normalized output: ${label}`);
  });
  ['Connect Wallet', 'Send USDC', 'Proceed', 'Retry'].forEach((label) => {
    assert.equal(text.includes(label), false, `CTA label leaked into normalized output: ${label}`);
  });
}

const stateVectors = [
  {
    id: 'no_provider',
    observation: baseObservation({ providerState: 'UNAVAILABLE', walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'NO_PROVIDER', preflightState: 'NO_PROVIDER', walletState: 'DISCONNECTED' },
  },
  {
    id: 'no_wallet',
    observation: baseObservation({ walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WALLET_DISCONNECTED', preflightState: 'WALLET_DISCONNECTED' },
  },
  {
    id: 'wallet_pending',
    observation: baseObservation({ walletState: 'CONNECTING', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WALLET_CONNECTING', preflightState: 'WALLET_CONNECTING' },
  },
  {
    id: 'wrong_network',
    observation: baseObservation({ networkState: 'WRONG' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WRONG_NETWORK', preflightState: 'WRONG_NETWORK', networkState: 'WRONG' },
  },
  {
    id: 'no_amount',
    observation: baseObservation({ amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'AMOUNT_EMPTY', preflightState: 'AMOUNT_EMPTY' },
  },
  {
    id: 'unknown_funds',
    observation: baseObservation({ fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'FUNDS_UNKNOWN', preflightState: 'FUNDS_UNKNOWN' },
  },
  {
    id: 'insufficient_balance',
    observation: baseObservation({ fundsState: 'INSUFFICIENT' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'FUNDS_INSUFFICIENT', preflightState: 'FUNDS_INSUFFICIENT' },
  },
  {
    id: 'ready',
    observation: baseObservation(),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'READY', preflightState: 'READY' },
  },
  {
    id: 'approval_pending',
    observation: baseObservation({ executionPhase: 'APPROVAL_PENDING' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'APPROVAL_PENDING', preflightState: 'READY' },
  },
  {
    id: 'approval_confirming',
    observation: baseObservation({ executionPhase: 'APPROVAL_CONFIRMING' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'APPROVAL_CONFIRMING', preflightState: 'READY' },
  },
  {
    id: 'approval_rejected',
    observation: baseObservation({ executionPhase: 'APPROVAL_REJECTED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'APPROVAL_REJECTED', preflightState: 'READY' },
  },
  {
    id: 'credential_changed',
    observation: baseObservation({ credentialState: 'CHANGED', executionPhase: 'APPROVAL_PENDING' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'APPROVAL_PENDING', preflightState: 'READY', credentialState: 'CHANGED', ambiguity: ['CREDENTIAL_ISSUE_DURING_EXECUTION'] },
  },
  {
    id: 'credential_unavailable',
    observation: baseObservation({ credentialState: 'UNAVAILABLE', executionPhase: 'TRANSFER_PENDING', routeState: 'UNAVAILABLE' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_PENDING', preflightState: 'READY', credentialState: 'UNAVAILABLE', ambiguity: ['ROUTE_DEGRADED_DURING_EXECUTION', 'CREDENTIAL_ISSUE_DURING_EXECUTION'] },
  },
  {
    id: 'transfer_pending',
    observation: baseObservation({ executionPhase: 'TRANSFER_PENDING' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_PENDING', preflightState: 'READY' },
  },
  {
    id: 'transfer_unconfirmed',
    observation: baseObservation({ executionPhase: 'TRANSFER_SUBMITTED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_SUBMITTED', preflightState: 'READY' },
  },
  {
    id: 'transfer_rejected',
    observation: baseObservation({ executionPhase: 'TRANSFER_REJECTED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_REJECTED', preflightState: 'READY' },
  },
  {
    id: 'transfer_failed',
    observation: baseObservation({ executionPhase: 'TRANSFER_FAILED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_FAILED', preflightState: 'READY' },
  },
  {
    id: 'settled',
    observation: baseObservation({ viewMode: 'SETTLE', executionPhase: 'CONFIRMED' }),
    expected: { presentationFocus: 'SETTLE', presentationState: 'CONFIRMED', preflightState: 'READY' },
  },
  {
    id: 'route_unknown',
    observation: baseObservation({ routeState: 'UNKNOWN', providerState: 'UNAVAILABLE', walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'ROUTE', presentationState: 'UNKNOWN', preflightState: 'NO_PROVIDER' },
  },
  {
    id: 'route_revoked',
    observation: baseObservation({ routeState: 'REVOKED', walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'ROUTE', presentationState: 'REVOKED', preflightState: 'WALLET_DISCONNECTED' },
  },
  {
    id: 'route_unavailable',
    observation: baseObservation({ routeState: 'UNAVAILABLE' }),
    expected: { presentationFocus: 'ROUTE', presentationState: 'UNAVAILABLE', preflightState: 'READY' },
  },
  {
    id: 'route_verified',
    observation: baseObservation({ routeState: 'VERIFIED' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'READY', preflightState: 'READY' },
  },
];

const precedenceVectors = [
  {
    id: 'no wallet plus empty amount',
    observation: baseObservation({ walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WALLET_DISCONNECTED' },
  },
  {
    id: 'connecting plus wrong network',
    observation: baseObservation({ walletState: 'CONNECTING', networkState: 'WRONG', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WALLET_CONNECTING' },
  },
  {
    id: 'wrong network plus insufficient balance',
    observation: baseObservation({ networkState: 'WRONG', fundsState: 'INSUFFICIENT' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WRONG_NETWORK' },
  },
  {
    id: 'approval pending plus route degradation',
    observation: baseObservation({ executionPhase: 'APPROVAL_PENDING', routeState: 'UNAVAILABLE' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'APPROVAL_PENDING', preflightState: 'READY', ambiguity: ['ROUTE_DEGRADED_DURING_EXECUTION'] },
  },
  {
    id: 'transfer pending plus route degradation',
    observation: baseObservation({ executionPhase: 'TRANSFER_PENDING', routeState: 'REVOKED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_PENDING', preflightState: 'READY', ambiguity: ['ROUTE_DEGRADED_DURING_EXECUTION'] },
  },
  {
    id: 'settled view plus stale wallet state',
    observation: baseObservation({ viewMode: 'SETTLE', walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN', executionPhase: 'CONFIRMED' }),
    expected: { presentationFocus: 'SETTLE', presentationState: 'CONFIRMED', preflightState: 'WALLET_DISCONNECTED', ambiguity: ['SETTLED_VIEW_WITH_STALE_PREFLIGHT_FACTS'] },
  },
  {
    id: 'execution failure plus amount changes',
    observation: baseObservation({ executionPhase: 'TRANSFER_FAILED', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_FAILED', preflightState: 'AMOUNT_EMPTY', ambiguity: ['EXECUTION_FAILURE_WITH_CHANGED_PREFLIGHT_FACTS'] },
  },
  {
    id: 'provider unavailable plus connected wallet observation',
    observation: baseObservation({ providerState: 'UNAVAILABLE', walletState: 'CONNECTED' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'NO_PROVIDER', preflightState: 'NO_PROVIDER', walletState: 'CONNECTED', ambiguity: ['PROVIDER_UNAVAILABLE_WITH_CONNECTED_WALLET'] },
  },
  {
    id: 'network unknown',
    observation: baseObservation({ networkState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'NETWORK_UNKNOWN', preflightState: 'NETWORK_UNKNOWN', networkState: 'UNKNOWN' },
  },
  {
    id: 'connected wallet plus wrong network',
    observation: baseObservation({ networkState: 'WRONG' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WRONG_NETWORK', preflightState: 'WRONG_NETWORK', networkState: 'WRONG' },
  },
  {
    id: 'disconnected wallet plus unknown network',
    observation: baseObservation({ walletState: 'DISCONNECTED', networkState: 'UNKNOWN', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WALLET_DISCONNECTED', preflightState: 'WALLET_DISCONNECTED', networkState: 'UNKNOWN' },
  },
  {
    id: 'connecting wallet plus wrong network',
    observation: baseObservation({ walletState: 'CONNECTING', networkState: 'WRONG', amountState: 'EMPTY', fundsState: 'UNKNOWN' }),
    expected: { presentationFocus: 'PREFLIGHT', presentationState: 'WALLET_CONNECTING', preflightState: 'WALLET_CONNECTING', networkState: 'WRONG' },
  },
  {
    id: 'settle view without confirmed execution',
    observation: baseObservation({ viewMode: 'SETTLE', executionPhase: 'IDLE' }),
    expected: { presentationFocus: 'SETTLE', presentationState: 'SETTLE_VIEW', executionPhase: 'IDLE', ambiguity: ['SETTLE_VIEW_WITHOUT_CONFIRMED_EXECUTION'] },
  },
  {
    id: 'confirmed execution while still in transact view',
    observation: baseObservation({ viewMode: 'TRANSACT', executionPhase: 'CONFIRMED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'CONFIRMED', executionPhase: 'CONFIRMED', ambiguity: ['CONFIRMED_EXECUTION_OUTSIDE_SETTLE_VIEW'] },
  },
  {
    id: 'credential issue plus approval phase',
    observation: baseObservation({ credentialState: 'CHANGED', executionPhase: 'APPROVAL_CONFIRMING' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'APPROVAL_CONFIRMING', credentialState: 'CHANGED', ambiguity: ['CREDENTIAL_ISSUE_DURING_EXECUTION'] },
  },
  {
    id: 'credential issue plus transfer phase',
    observation: baseObservation({ credentialState: 'UNAVAILABLE', executionPhase: 'TRANSFER_SUBMITTED' }),
    expected: { presentationFocus: 'EXECUTION', presentationState: 'TRANSFER_SUBMITTED', credentialState: 'UNAVAILABLE', ambiguity: ['CREDENTIAL_ISSUE_DURING_EXECUTION'] },
  },
];

function assertExpectedSubset(actual, expected) {
  Object.entries(expected).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      assert.deepEqual(actual[key], value, key);
      return;
    }
    assert.equal(actual[key], value, key);
  });
}

function assertVector(vector) {
  assert(LIVE_STATUS_TEXT[vector.id] || REVIEW_OVERLAP[vector.id] || precedenceVectors.includes(vector), `${vector.id} has reference metadata or precedence-only status`);
  if (LIVE_STATUS_TEXT[vector.id]) assert(REVIEW_OVERLAP[vector.id], `${vector.id} has review overlap note`);

  const before = clone(vector.observation);
  const first = normalizeLaneAPresentationInput(vector.observation);
  const second = normalizeLaneAPresentationInput(vector.observation);

  assert.deepEqual(vector.observation, before, `${vector.id} input is not mutated`);
  assert.deepEqual(first, second, `${vector.id} output is deterministic`);
  assert.equal(first.schema, 'implicitex.coin-card.presentation-input.v1', `${vector.id} schema`);
  assertExpectedSubset(first, vector.expected);
  assertNoExecutionAuthorityFields(first);
  assertNoVisibleCopyOrCtaLabels(first);
}

stateVectors.forEach(assertVector);
precedenceVectors.forEach(assertVector);

Object.entries(ENUM_VALUES).forEach(([key, values]) => {
  values.forEach((value) => {
    const overrides = {};
    overrides[key] = value;
    const output = normalizeLaneAPresentationInput(baseObservation(overrides));
    assert.equal(output[key], value, `${key} enum value exercised: ${value}`);
  });
});

assert.throws(
  () => normalizeLaneAPresentationInput(baseObservation({ walletState: 'LOCKED' })),
  /Unknown Lane A presentation walletState: LOCKED/
);
assert.throws(
  () => normalizeLaneAPresentationInput(baseObservation({ executionPhase: 'INTERRUPTED' })),
  /Unknown Lane A presentation executionPhase: INTERRUPTED/
);
assert.throws(
  () => normalizeLaneAPresentationInput(Object.assign({}, baseObservation(), { routeState: undefined })),
  /Unknown Lane A presentation routeState: undefined/
);
{
  const missingNetwork = Object.assign({}, baseObservation());
  delete missingNetwork.networkState;
  assert.throws(
    () => normalizeLaneAPresentationInput(missingNetwork),
    /Missing Lane A presentation observation: networkState/
  );
}
assert.throws(
  () => normalizeLaneAPresentationInput(baseObservation({ networkState: '0x89' })),
  /Unknown Lane A presentation networkState: 0x89/
);

const source = fs.readFileSync(modulePath, 'utf8');
assert.equal(source.includes('document.'), false, 'module must not access the DOM');
assert.equal(source.includes('window.ethereum'), false, 'module must not access wallet provider');
assert.equal(source.includes('ethers'), false, 'module must not depend on ethers');
assert.equal(source.includes('parseFloat('), false, 'module must not parse entered amount text');
assert.equal(source.includes('formatUsdc'), false, 'module must not format visible money copy');
assert.equal(source.includes('canSend'), false, 'module must not expose send authority');
assert.equal(source.includes('authorized'), false, 'module must not expose authorization');
assert.equal(source.includes('allowed'), false, 'module must not expose execution allowance');

console.log('Coin Card presentation-input projection checks passed.');
