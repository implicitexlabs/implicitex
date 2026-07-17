/**
 * ix-execution-gas-policy.js — Canonical Coin Card Polygon gas policy.
 *
 * Canonical policy resolution is ID-only. The canonical security payload is
 * normalized once and the canonical binding is derived from that payload.
 * Runtime test helpers are only exposed when __IX_POLICY_TEST_MODE__ is true
 * before this module is loaded.
 */

(function () {
  'use strict';

  var BINDING_FORMAT = 'implicitex.execution-gas-policy.binding.v1';
  var BINDING_VERSION = '1';
  var SECURITY_SCHEMA_VERSION = 'implicitex.execution-gas-policy.security.v1';
  var POLICY_ID = 'COIN_CARD_POLYGON_V1';
  var POLICY_REVISION = '2026-07-17.1';
  var CHAIN_ID = 137;

  var ZEPPELINOS_IMPLEMENTATION_SLOT = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';
  var TOKEN_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
  var TOKEN_PROXY_RUNTIME_KECCAK256 = '0x7dbf0ee7d6d69b563891ceb7056cf0ff0fa09d21a48e5f812d89981c2ef95944';
  var TOKEN_IMPLEMENTATION_ADDRESS = '0x235AE97b28466Db30469b89A9fe4cFf0659f82Cb';
  var TOKEN_IMPLEMENTATION_RUNTIME_KECCAK256 = '0x39ec98a4509fb2d4380a9cd4623e7b20cf651cb58edb8d8332bfad9c3d698143';
  var EXECUTION_ADDRESS = '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0';
  var EXECUTION_RUNTIME_KECCAK256 = '0xa94dad9f7f1da1e65b082d49b8e47c5d8b214534e73446809e1728073d6d9e06';
  var TREASURY_ADDRESS = '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919';
  var APPROVE_SELECTOR = '0x095ea7b3';
  var TRANSFER_WITH_FEE_SELECTOR = '0x08acece2';
  var GAS_LIMIT_APPROVE = '75000';
  var GAS_LIMIT_TRANSFER = '135000';
  var CANONICAL_PLANS = Object.freeze(['TRANSFER_ONLY', 'APPROVE_THEN_TRANSFER']);

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) {
      freezeDeep(value[key]);
    });
    return Object.freeze(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function cloneCanonical(value) {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString(10);
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error('unsupported number in canonical payload');
      return String(value);
    }
    if (Array.isArray(value)) return value.map(cloneCanonical);
    if (!isPlainObject(value)) throw new Error('unsupported non-plain object in canonical payload');
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      var next = value[key];
      if (typeof next === 'undefined' || typeof next === 'function' || typeof next === 'symbol') {
        throw new Error('unsupported canonical field value');
      }
      out[key] = cloneCanonical(next);
    });
    return out;
  }

  function canonicalizeJson(value) {
    return JSON.stringify(cloneCanonical(value));
  }

  function normalizeLowerHex(value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
  }

  function normalizeAtomic(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
    return null;
  }

  function normalizePlanList(plans) {
    var values = Array.isArray(plans) ? plans.slice() : [];
    var seen = Object.create(null);
    var normalized = [];
    CANONICAL_PLANS.forEach(function (plan) {
      if (values.indexOf(plan) !== -1 && !seen[plan]) {
        seen[plan] = true;
        normalized.push(plan);
      }
    });
    values.forEach(function (plan) {
      if (CANONICAL_PLANS.indexOf(plan) === -1 && !seen[plan]) {
        seen[plan] = true;
        normalized.push(plan);
      }
    });
    return normalized;
  }

  function exactKeys(value) {
    return Object.keys(value || {}).sort().join('|');
  }

  function normalizeSecurityPayload(security) {
    var source = freezeDeep(cloneCanonical(security || {}));
    return freezeDeep({
      bindingFormat: source.bindingFormat,
      bindingVersion: source.bindingVersion,
      schemaVersion: source.schemaVersion,
      policyId: source.policyId,
      policyRevision: source.policyRevision,
      chainId: source.chainId,
      token: freezeDeep({
        address: normalizeLowerHex(source.token && source.token.address),
        proxyType: source.token && source.token.proxyType,
        implementationSlot: normalizeLowerHex(source.token && source.token.implementationSlot),
        runtimeKeccak256: normalizeLowerHex(source.token && source.token.runtimeKeccak256),
        implementationAddress: normalizeLowerHex(source.token && source.token.implementationAddress),
        implementationRuntimeKeccak256: normalizeLowerHex(source.token && source.token.implementationRuntimeKeccak256),
        decimals: source.token && source.token.decimals,
        symbol: source.token && source.token.symbol,
      }),
      executionContract: freezeDeep({
        address: normalizeLowerHex(source.executionContract && source.executionContract.address),
        runtimeKeccak256: normalizeLowerHex(source.executionContract && source.executionContract.runtimeKeccak256),
        treasuryAddress: normalizeLowerHex(source.executionContract && source.executionContract.treasuryAddress),
        paused: source.executionContract && source.executionContract.paused,
      }),
      selectors: freezeDeep({
        approve: normalizeLowerHex(source.selectors && source.selectors.approve),
        transferWithFee: normalizeLowerHex(source.selectors && source.selectors.transferWithFee),
      }),
      amountPolicy: freezeDeep({
        feeBasisPoints: source.amountPolicy && source.amountPolicy.feeBasisPoints,
        minimumRecipientAmountAtomic: source.amountPolicy && source.amountPolicy.minimumRecipientAmountAtomic,
        maximumRecipientAmountAtomic: source.amountPolicy && source.amountPolicy.maximumRecipientAmountAtomic,
        precisionIncrementAtomic: source.amountPolicy && source.amountPolicy.precisionIncrementAtomic,
      }),
      supportedExecutionPlans: freezeDeep(normalizePlanList(source.supportedExecutionPlans)),
      gasLimits: freezeDeep({
        approve: source.gasLimits && source.gasLimits.approve,
        transferWithFee: source.gasLimits && source.gasLimits.transferWithFee,
      }),
    });
  }

  var CANONICAL_SECURITY = freezeDeep({
    bindingFormat: BINDING_FORMAT,
    bindingVersion: BINDING_VERSION,
    schemaVersion: SECURITY_SCHEMA_VERSION,
    policyId: POLICY_ID,
    policyRevision: POLICY_REVISION,
    chainId: CHAIN_ID,
    token: {
      address: TOKEN_ADDRESS.toLowerCase(),
      proxyType: 'zeppelinos-unstructured-storage',
      implementationSlot: ZEPPELINOS_IMPLEMENTATION_SLOT.toLowerCase(),
      runtimeKeccak256: TOKEN_PROXY_RUNTIME_KECCAK256.toLowerCase(),
      implementationAddress: TOKEN_IMPLEMENTATION_ADDRESS.toLowerCase(),
      implementationRuntimeKeccak256: TOKEN_IMPLEMENTATION_RUNTIME_KECCAK256.toLowerCase(),
      decimals: '6',
      symbol: 'USDC',
    },
    executionContract: {
      address: EXECUTION_ADDRESS.toLowerCase(),
      runtimeKeccak256: EXECUTION_RUNTIME_KECCAK256.toLowerCase(),
      treasuryAddress: TREASURY_ADDRESS.toLowerCase(),
      paused: false,
    },
    selectors: {
      approve: APPROVE_SELECTOR.toLowerCase(),
      transferWithFee: TRANSFER_WITH_FEE_SELECTOR.toLowerCase(),
    },
    amountPolicy: {
      feeBasisPoints: '100',
      minimumRecipientAmountAtomic: '1000000',
      maximumRecipientAmountAtomic: '250000000',
      precisionIncrementAtomic: '1000000',
    },
    supportedExecutionPlans: CANONICAL_PLANS,
    gasLimits: {
      approve: GAS_LIMIT_APPROVE,
      transferWithFee: GAS_LIMIT_TRANSFER,
    },
  });

  var POLICY_PROVENANCE = freezeDeep({
    evidenceId: 'polygon-fork-gas-evidence.v1',
    description: 'Derived from the completed two-block Polygon fork evidence matrix.',
  });

  var POLICY = freezeDeep({
    security: CANONICAL_SECURITY,
    provenance: POLICY_PROVENANCE,
  });

  var REGISTRY = freezeDeep(Object.assign(Object.create(null), {
    COIN_CARD_POLYGON_V1: POLICY,
  }));

  function loadPolicyById(policyId) {
    return typeof policyId === 'string' ? REGISTRY[policyId] || null : null;
  }

  function getPolicySecurityPayload(policyId) {
    var policy = loadPolicyById(policyId);
    if (!policy) return null;
    return normalizeSecurityPayload(policy.security);
  }

  function getCanonicalPolicyBinding(policyId) {
    var security = getPolicySecurityPayload(policyId);
    if (!security) return null;
    return canonicalizeJson(security);
  }

  function validateSecurityPayload(security) {
    var normalized;
    try {
      normalized = normalizeSecurityPayload(security);
    } catch (error) {
      return freezeDeep({ valid: false, errors: ['invalid canonical payload'] });
    }

    var errors = [];
    if (!isPlainObject(security)) {
      errors.push('security payload must be a plain object');
    }
    if (exactKeys(security) !== 'amountPolicy|bindingFormat|bindingVersion|chainId|executionContract|gasLimits|policyId|policyRevision|schemaVersion|selectors|supportedExecutionPlans|token') {
      errors.push('security key set mismatch');
    }
    if (normalized.bindingFormat !== BINDING_FORMAT) errors.push('bindingFormat mismatch');
    if (normalized.bindingVersion !== BINDING_VERSION) errors.push('bindingVersion mismatch');
    if (normalized.schemaVersion !== SECURITY_SCHEMA_VERSION) errors.push('schemaVersion mismatch');
    if (normalized.policyId !== POLICY_ID) errors.push('policyId mismatch');
    if (normalized.policyRevision !== POLICY_REVISION) errors.push('policyRevision mismatch');
    if (normalized.chainId !== String(CHAIN_ID)) errors.push('chainId mismatch');

    if (!isPlainObject(security && security.token) ||
        exactKeys(security.token) !== 'address|decimals|implementationAddress|implementationRuntimeKeccak256|implementationSlot|proxyType|runtimeKeccak256|symbol') {
      errors.push('token key set mismatch');
    }
    if (normalized.token.address !== TOKEN_ADDRESS.toLowerCase()) errors.push('token address mismatch');
    if (normalized.token.proxyType !== 'zeppelinos-unstructured-storage') errors.push('token proxyType mismatch');
    if (normalized.token.implementationSlot !== ZEPPELINOS_IMPLEMENTATION_SLOT.toLowerCase()) errors.push('implementationSlot mismatch');
    if (normalized.token.runtimeKeccak256 !== TOKEN_PROXY_RUNTIME_KECCAK256.toLowerCase()) errors.push('token runtime hash mismatch');
    if (normalized.token.implementationAddress !== TOKEN_IMPLEMENTATION_ADDRESS.toLowerCase()) errors.push('token implementation address mismatch');
    if (normalized.token.implementationRuntimeKeccak256 !== TOKEN_IMPLEMENTATION_RUNTIME_KECCAK256.toLowerCase()) errors.push('token implementation runtime hash mismatch');
    if (normalized.token.decimals !== '6') errors.push('token decimals mismatch');
    if (normalized.token.symbol !== 'USDC') errors.push('token symbol mismatch');

    if (!isPlainObject(security && security.executionContract) ||
        exactKeys(security.executionContract) !== 'address|paused|runtimeKeccak256|treasuryAddress') {
      errors.push('executionContract key set mismatch');
    }
    if (normalized.executionContract.address !== EXECUTION_ADDRESS.toLowerCase()) errors.push('execution address mismatch');
    if (normalized.executionContract.runtimeKeccak256 !== EXECUTION_RUNTIME_KECCAK256.toLowerCase()) errors.push('execution runtime hash mismatch');
    if (normalized.executionContract.treasuryAddress !== TREASURY_ADDRESS.toLowerCase()) errors.push('treasury address mismatch');
    if (normalized.executionContract.paused !== false) errors.push('paused expectation mismatch');

    if (!isPlainObject(security && security.selectors) ||
        exactKeys(security.selectors) !== 'approve|transferWithFee') errors.push('selector key set mismatch');
    if (normalized.selectors.approve !== APPROVE_SELECTOR.toLowerCase()) errors.push('approve selector mismatch');
    if (normalized.selectors.transferWithFee !== TRANSFER_WITH_FEE_SELECTOR.toLowerCase()) errors.push('transferWithFee selector mismatch');

    if (!isPlainObject(security && security.amountPolicy) ||
        exactKeys(security.amountPolicy) !== 'feeBasisPoints|maximumRecipientAmountAtomic|minimumRecipientAmountAtomic|precisionIncrementAtomic') {
      errors.push('amount policy key set mismatch');
    }
    if (normalized.amountPolicy.feeBasisPoints !== '100') errors.push('fee basis points mismatch');
    if (normalized.amountPolicy.minimumRecipientAmountAtomic !== '1000000') errors.push('minimum amount mismatch');
    if (normalized.amountPolicy.maximumRecipientAmountAtomic !== '250000000') errors.push('maximum amount mismatch');
    if (normalized.amountPolicy.precisionIncrementAtomic !== '1000000') errors.push('precision increment mismatch');

    if (!isPlainObject(security && security.gasLimits) ||
        exactKeys(security.gasLimits) !== 'approve|transferWithFee') errors.push('gas limit key set mismatch');
    if (normalized.gasLimits.approve !== GAS_LIMIT_APPROVE) errors.push('approve gas limit mismatch');
    if (normalized.gasLimits.transferWithFee !== GAS_LIMIT_TRANSFER) errors.push('transfer gas limit mismatch');

    if (!Array.isArray(security && security.supportedExecutionPlans) ||
        security.supportedExecutionPlans.length !== 2 ||
        new Set(security.supportedExecutionPlans).size !== 2 ||
        security.supportedExecutionPlans.some(function (plan) { return CANONICAL_PLANS.indexOf(plan) === -1; })) {
      errors.push('supportedExecutionPlans mismatch');
    }

    return freezeDeep({ valid: errors.length === 0, errors: errors });
  }

  function validateGasPolicy(policyId) {
    var policy = loadPolicyById(policyId);
    if (!policy) return freezeDeep({ valid: false, errors: ['unknown policy'] });
    return validateSecurityPayload(policy.security);
  }

  function getGasLimit(policyId, executionPlan, stepName) {
    var policy = loadPolicyById(policyId);
    if (!policy) return null;
    var plan = executionPlan || null;
    if (CANONICAL_PLANS.indexOf(plan) === -1) return null;
    if (stepName === 'approve') {
      return plan === 'APPROVE_THEN_TRANSFER' ? BigInt(policy.security.gasLimits.approve) : null;
    }
    if (stepName === 'transfer' || stepName === 'transferWithFee') {
      return BigInt(policy.security.gasLimits.transferWithFee);
    }
    return null;
  }

  function validateExecutionDomain(policyId, input) {
    var policy = loadPolicyById(policyId);
    if (!policy) {
      return freezeDeep({ ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' });
    }

    input = input || {};
    var executionPlan = input.executionPlan || null;
    if (CANONICAL_PLANS.indexOf(executionPlan) === -1) {
      return freezeDeep({ ok: false, code: 'GAS_POLICY_UNSUPPORTED', message: 'Unsupported execution plan.' });
    }

    var amountAtomic = normalizeAtomic(input.amountAtomic);
    if (amountAtomic == null) {
      return freezeDeep({ ok: false, code: 'INVALID_AMOUNT', message: 'Amount must be a canonical atomic integer.' });
    }

    var amountPolicy = policy.security.amountPolicy;
    var minimum = BigInt(amountPolicy.minimumRecipientAmountAtomic);
    var maximum = BigInt(amountPolicy.maximumRecipientAmountAtomic);
    var precision = BigInt(amountPolicy.precisionIncrementAtomic);
    if (amountAtomic < minimum) return freezeDeep({ ok: false, code: 'BELOW_MINIMUM', message: 'Amount is below the minimum transfer size.' });
    if (amountAtomic > maximum) return freezeDeep({ ok: false, code: 'ABOVE_MAXIMUM', message: 'Amount is above the maximum transfer size.' });
    if (amountAtomic % precision !== 0n) return freezeDeep({ ok: false, code: 'PRECISION_MISMATCH', message: 'Enter an amount in whole USDC increments.' });

    var feeBasisPoints = BigInt(amountPolicy.feeBasisPoints);
    var expectedFeeAtomic = (amountAtomic * feeBasisPoints) / 10000n;
    var expectedTotalAtomic = amountAtomic + expectedFeeAtomic;

    if (input.platformFeeAtomic != null) {
      var suppliedFeeAtomic = normalizeAtomic(input.platformFeeAtomic);
      if (suppliedFeeAtomic == null || suppliedFeeAtomic !== expectedFeeAtomic) {
        return freezeDeep({ ok: false, code: 'PLATFORM_FEE_MISMATCH', message: 'Platform fee does not match the policy rate.' });
      }
    }

    if (input.totalDebitAtomic != null) {
      var suppliedTotalAtomic = normalizeAtomic(input.totalDebitAtomic);
      if (suppliedTotalAtomic == null || suppliedTotalAtomic !== expectedTotalAtomic) {
        return freezeDeep({ ok: false, code: 'TOTAL_DEBIT_MISMATCH', message: 'Amount, fee, and total debit must reconcile.' });
      }
    }

    return freezeDeep({
      ok: true,
      policyId: POLICY_ID,
      executionPlan: executionPlan,
      amountAtomic: amountAtomic.toString(10),
      platformFeeAtomic: expectedFeeAtomic.toString(10),
      totalDebitAtomic: expectedTotalAtomic.toString(10),
      gasLimitApprove: getGasLimit(policyId, executionPlan, 'approve'),
      gasLimitTransfer: getGasLimit(policyId, executionPlan, 'transfer'),
    });
  }

  function resolveGasPolicy(policyId) {
    return loadPolicyById(policyId);
  }

  var api = {
    BINDING_FORMAT: BINDING_FORMAT,
    BINDING_VERSION: BINDING_VERSION,
    SECURITY_SCHEMA_VERSION: SECURITY_SCHEMA_VERSION,
    POLICY_ID: POLICY_ID,
    POLICY_REVISION: POLICY_REVISION,
    ZEPPELINOS_IMPLEMENTATION_SLOT: ZEPPELINOS_IMPLEMENTATION_SLOT,
    resolveGasPolicy: resolveGasPolicy,
    validateGasPolicy: validateGasPolicy,
    getPolicySecurityPayload: getPolicySecurityPayload,
    getCanonicalPolicyBinding: getCanonicalPolicyBinding,
    getGasLimit: getGasLimit,
    validateExecutionDomain: validateExecutionDomain,
  };

  if (window.__IX_POLICY_TEST_MODE__ === true) {
    Object.defineProperty(api, '__TEST_ONLY__', {
      value: freezeDeep({
        normalizeSecurityPayload: normalizeSecurityPayload,
        validateSecurityPayload: validateSecurityPayload,
        getCanonicalPolicyBindingFromSecurity: function (security) {
          return canonicalizeJson(normalizeSecurityPayload(security));
        },
        getCanonicalPolicyBindingFromDefinition: function (policy) {
          return policy && policy.security ? canonicalizeJson(normalizeSecurityPayload(policy.security)) : null;
        },
      }),
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  freezeDeep(api);

  Object.defineProperty(window, 'IX_EXECUTION_GAS_POLICY', {
    value: api,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
