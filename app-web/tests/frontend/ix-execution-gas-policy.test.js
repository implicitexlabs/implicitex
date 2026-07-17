'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const policyPath = path.join(repoRoot, 'app-web/frontend/public/js/ix-execution-gas-policy.js');
const policySource = fs.readFileSync(policyPath, 'utf8');

function loadPolicyRuntime(testMode = true) {
  const context = {
    window: testMode ? { __IX_POLICY_TEST_MODE__: true } : {},
  };
  context.globalThis = context;
  vm.runInNewContext(policySource, context, { filename: policyPath });
  return context.window.IX_EXECUTION_GAS_POLICY;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

test('canonical policy values are fixed and deeply frozen', () => {
  const policyApi = loadPolicyRuntime();
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');

  assert.equal(policy.security.bindingFormat, 'implicitex.execution-gas-policy.binding.v1');
  assert.equal(policy.security.bindingVersion, '1');
  assert.equal(policy.security.schemaVersion, 'implicitex.execution-gas-policy.security.v1');
  assert.equal(policy.security.policyId, 'COIN_CARD_POLYGON_V1');
  assert.equal(policy.security.policyRevision, '2026-07-17.1');
  assert.equal(policy.security.chainId, 137);
  assert.equal(policy.security.amountPolicy.minimumRecipientAmountAtomic, '1000000');
  assert.equal(policy.security.amountPolicy.maximumRecipientAmountAtomic, '250000000');
  assert.equal(policy.security.amountPolicy.precisionIncrementAtomic, '1000000');
  assert.equal(policy.security.amountPolicy.feeBasisPoints, '100');
  assert.equal(policy.security.gasLimits.approve, '75000');
  assert.equal(policy.security.gasLimits.transferWithFee, '135000');
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.security), true);
  assert.equal(Object.isFrozen(policy.security.gasLimits), true);
  assert.equal(Object.isFrozen(policy.provenance), true);
  assert.equal(policyApi.getPolicySecurityPayload('COIN_CARD_POLYGON_V1').token.address, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
});

test('canonical policy binding is deterministic and ignores provenance-only edits', () => {
  const policyApi = loadPolicyRuntime();
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');
  const binding = policyApi.getCanonicalPolicyBinding('COIN_CARD_POLYGON_V1');
  assert.equal(binding.startsWith('implicitex.execution-gas-policy.binding.v1|'), false);
  assert.equal(countOccurrences(binding, '"bindingFormat"'), 1);
  const cloned = clone(policy);
  cloned.provenance.description = 'edited provenance only';
  assert.equal(policyApi.__TEST_ONLY__.getCanonicalPolicyBindingFromDefinition(cloned), binding);

  const changed = clone(policy);
  changed.security.gasLimits.approve = '76000';
  assert.notEqual(policyApi.__TEST_ONLY__.getCanonicalPolicyBindingFromDefinition(changed), binding);
});

test('every bound security field changes the canonical binding and provenance-only edits do not', () => {
  const policyApi = loadPolicyRuntime();
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');
  const binding = policyApi.getCanonicalPolicyBinding('COIN_CARD_POLYGON_V1');
  const mutations = [
    (draft) => { draft.security.bindingFormat = 'implicitex.execution-gas-policy.binding.v2'; },
    (draft) => { draft.security.bindingVersion = '2'; },
    (draft) => { draft.security.schemaVersion = 'implicitex.execution-gas-policy.security.v2'; },
    (draft) => { draft.security.policyId = 'COIN_CARD_POLYGON_V2'; },
    (draft) => { draft.security.policyRevision = '2026-07-17.2'; },
    (draft) => { draft.security.chainId = 80001; },
    (draft) => { draft.security.token.address = '0x0000000000000000000000000000000000000001'; },
    (draft) => { draft.security.token.proxyType = 'other-proxy'; },
    (draft) => { draft.security.token.implementationSlot = '0x0000000000000000000000000000000000000000000000000000000000000000'; },
    (draft) => { draft.security.token.runtimeKeccak256 = '0x' + '1'.repeat(64); },
    (draft) => { draft.security.token.implementationAddress = '0x0000000000000000000000000000000000000002'; },
    (draft) => { draft.security.token.implementationRuntimeKeccak256 = '0x' + '2'.repeat(64); },
    (draft) => { draft.security.executionContract.address = '0x0000000000000000000000000000000000000003'; },
    (draft) => { draft.security.executionContract.runtimeKeccak256 = '0x' + '3'.repeat(64); },
    (draft) => { draft.security.executionContract.treasuryAddress = '0x0000000000000000000000000000000000000004'; },
    (draft) => { draft.security.executionContract.paused = true; },
    (draft) => { draft.security.selectors.approve = '0x00000000'; },
    (draft) => { draft.security.selectors.transferWithFee = '0x11111111'; },
    (draft) => { draft.security.amountPolicy.feeBasisPoints = '101'; },
    (draft) => { draft.security.amountPolicy.minimumRecipientAmountAtomic = '1000001'; },
    (draft) => { draft.security.amountPolicy.maximumRecipientAmountAtomic = '250000001'; },
    (draft) => { draft.security.amountPolicy.precisionIncrementAtomic = '2'; },
    (draft) => { draft.security.gasLimits.approve = '75001'; },
    (draft) => { draft.security.gasLimits.transferWithFee = '135001'; },
  ];

  mutations.forEach((mutate, index) => {
    const cloned = clone(policy);
    mutate(cloned);
    assert.equal(policyApi.__TEST_ONLY__.validateSecurityPayload(cloned.security).valid, false, `mutation ${index} must fail validation`);
    assert.notEqual(policyApi.__TEST_ONLY__.getCanonicalPolicyBindingFromDefinition(cloned), binding, `mutation ${index} must change binding`);
  });

  const provenanceOnly = clone(policy);
  provenanceOnly.provenance.description = 'edited provenance only';
  assert.equal(policyApi.__TEST_ONLY__.validateSecurityPayload(provenanceOnly.security).valid, true);
  assert.equal(policyApi.__TEST_ONLY__.getCanonicalPolicyBindingFromDefinition(provenanceOnly), binding);
});

test('unknown policy IDs are rejected and the supported plan list is fixed', () => {
  const policyApi = loadPolicyRuntime();
  assert.equal(policyApi.resolveGasPolicy('UNKNOWN_POLICY'), null);
  assert.equal(policyApi.resolveGasPolicy({ policyId: 'COIN_CARD_POLYGON_V1' }), null);
  const validation = policyApi.validateGasPolicy('COIN_CARD_POLYGON_V1');
  assert.equal(validation.valid, true);
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');
  assert.equal(JSON.stringify(Array.from(policy.security.supportedExecutionPlans)), JSON.stringify(['TRANSFER_ONLY', 'APPROVE_THEN_TRANSFER']));
});

test('gas-limit lookup and validation cover supported and unsupported plans', () => {
  const policyApi = loadPolicyRuntime();
  assert.equal(policyApi.getGasLimit('COIN_CARD_POLYGON_V1', 'APPROVE_THEN_TRANSFER', 'approve').toString(), '75000');
  assert.equal(policyApi.getGasLimit('COIN_CARD_POLYGON_V1', 'TRANSFER_ONLY', 'transfer').toString(), '135000');
  assert.equal(policyApi.getGasLimit('COIN_CARD_POLYGON_V1', 'TRANSFER_ONLY', 'approve'), null);
  assert.equal(policyApi.getGasLimit('COIN_CARD_POLYGON_V1', 'UNKNOWN_PLAN', 'transfer'), null);

  const unsupported = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'UNKNOWN_PLAN',
    amountAtomic: '1000000',
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, 'GAS_POLICY_UNSUPPORTED');
});

test('amount-domain validation accepts whole-USDC amounts and rejects fractional or out-of-range inputs', () => {
  const policyApi = loadPolicyRuntime();

  const minimum = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'TRANSFER_ONLY',
    amountAtomic: '1000000',
  });
  const middle = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'APPROVE_THEN_TRANSFER',
    amountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    platformFeeAtomic: '1250000',
  });
  const maximum = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'TRANSFER_ONLY',
    amountAtomic: '250000000',
  });
  const fractional = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'APPROVE_THEN_TRANSFER',
    amountAtomic: '1005001',
    totalDebitAtomic: '1015051',
    platformFeeAtomic: '10050',
  });
  const belowMinimum = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'TRANSFER_ONLY',
    amountAtomic: '999999',
  });
  const aboveMaximum = policyApi.validateExecutionDomain('COIN_CARD_POLYGON_V1', {
    executionPlan: 'TRANSFER_ONLY',
    amountAtomic: '250000001',
  });

  assert.equal(minimum.ok, true);
  assert.equal(minimum.amountAtomic, '1000000');
  assert.equal(middle.ok, true);
  assert.equal(maximum.ok, true);
  assert.equal(fractional.ok, false);
  assert.equal(fractional.code, 'PRECISION_MISMATCH');
  assert.equal(belowMinimum.ok, false);
  assert.equal(belowMinimum.code, 'BELOW_MINIMUM');
  assert.equal(aboveMaximum.ok, false);
  assert.equal(aboveMaximum.code, 'ABOVE_MAXIMUM');
});

test('plan ordering normalizes to one canonical order and duplicates are rejected', () => {
  const policyApi = loadPolicyRuntime();
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');
  const canonicalBinding = policyApi.getCanonicalPolicyBinding('COIN_CARD_POLYGON_V1');
  const reversed = clone(policy);
  reversed.security.supportedExecutionPlans = ['APPROVE_THEN_TRANSFER', 'TRANSFER_ONLY'];
  assert.equal(policyApi.__TEST_ONLY__.getCanonicalPolicyBindingFromDefinition(reversed), canonicalBinding);
  assert.equal(policyApi.__TEST_ONLY__.validateSecurityPayload(reversed.security).valid, true);

  const duplicate = clone(policy);
  duplicate.security.supportedExecutionPlans = ['TRANSFER_ONLY', 'TRANSFER_ONLY'];
  assert.equal(policyApi.__TEST_ONLY__.validateSecurityPayload(duplicate.security).valid, false);
});

test('public APIs remain ID-only and production globals omit test hooks', () => {
  const policyApi = loadPolicyRuntime(false);
  assert.equal(policyApi.resolveGasPolicy({ policyId: 'COIN_CARD_POLYGON_V1' }), null);
  assert.equal(policyApi.validateGasPolicy({ policyId: 'COIN_CARD_POLYGON_V1' }).valid, false);
  assert.equal(policyApi.getGasLimit({ policyId: 'COIN_CARD_POLYGON_V1' }, 'TRANSFER_ONLY', 'transfer'), null);
  assert.equal(Object.prototype.hasOwnProperty.call(policyApi, '__TEST_ONLY__'), false);
});

test('canonical address casing and payload validation use normalized lowercase values', () => {
  const policyApi = loadPolicyRuntime();
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');
  const cloned = clone(policy);
  cloned.security.token.address = '0x3C499C542CEF5E3811E1192CE70D8CC03D5C3359';
  cloned.security.executionContract.treasuryAddress = '0xA7CE4232811021D2DD01F4F0F264DF2427AB3919';
  const canonicalBinding = policyApi.getCanonicalPolicyBinding('COIN_CARD_POLYGON_V1');
  assert.equal(policyApi.__TEST_ONLY__.getCanonicalPolicyBindingFromDefinition(cloned), canonicalBinding);
  assert.equal(policyApi.__TEST_ONLY__.validateSecurityPayload(cloned.security).valid, true);
});

test('production global omits test hooks unless test mode is explicitly enabled', () => {
  const policyApi = loadPolicyRuntime(false);
  assert.equal(Object.prototype.hasOwnProperty.call(policyApi, '__TEST_ONLY__'), false);
});
