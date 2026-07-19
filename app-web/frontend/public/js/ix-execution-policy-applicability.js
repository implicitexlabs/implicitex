/**
 * ix-execution-policy-applicability.js — Read-only Polygon policy applicability observer.
 *
 * Phase 2A only. No transaction paths, no fee observation, no trust-chain binding.
 * The observer reads one coherent Polygon block and compares the deployed runtime
 * configuration against the canonical policy security payload.
 *
 * APPLICABLE means every required runtime-observable identity and configuration field
 * matches. Policy-only execution restrictions (e.g. maximumRecipientAmountAtomic) remain
 * authoritative through the validated policy binding; they are not observable on-chain
 * and are classified POLICY_BOUND, not MATCH.
 */

(function () {
  'use strict';

  var SCHEMA_VERSION = 'ix-execution-policy-applicability.v1';
  var READ_ONLY_METHODS = Object.freeze([
    'eth_chainId',
    'eth_blockNumber',
    'eth_getBlockByNumber',
    'eth_getCode',
    'eth_getStorageAt',
    'eth_call',
  ]);
  var TOKEN_INTERFACE = [
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ];
  var EXECUTION_INTERFACE = [
    'function treasury() view returns (address)',
    'function feeBasisPoints() view returns (uint16)',
    'function minTransferAmount() view returns (uint256)',
    'function transferPrecision() view returns (uint256)',
    'function paused() view returns (bool)',
  ];

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

  function normalizeQuantity(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
    return null;
  }

  function normalizeAddress(value, ethersApi) {
    if (typeof value !== 'string') return null;
    try {
      return ethersApi.getAddress(value).toLowerCase();
    } catch (error) {
      return null;
    }
  }

  function normalizeLowerHex(value) {
    return typeof value === 'string' ? value.toLowerCase() : null;
  }

  function toHexTag(quantity) {
    return '0x' + quantity.toString(16);
  }

  /**
   * Validate a block header returned by eth_getBlockByNumber.
   * Returns true only if:
   *   - block.number is a canonical hex string (0x + hex digits) equal to requestedTag
   *   - block.hash is a canonical 32-byte hex (0x + 64 hex chars)
   *   - block.timestamp is a valid nonnegative hexadecimal string
   */
  function isValidBlockHeader(block, requestedTag) {
    if (!block || typeof block !== 'object') return false;
    var num = block.number;
    var hash = block.hash;
    var ts = block.timestamp;
    if (typeof num !== 'string' || !/^0x[0-9a-fA-F]+$/.test(num)) return false;
    if (num.toLowerCase() !== requestedTag.toLowerCase()) return false;
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return false;
    if (typeof ts !== 'string' || !/^0x[0-9a-fA-F]+$/.test(ts)) return false;
    return true;
  }

  function makeMatch(expected, actual, status, reason) {
    return freezeDeep({
      expected: expected,
      actual: actual,
      status: status,
      reason: reason || null,
    });
  }

  function makePolicyBound(expected) {
    return freezeDeep({
      expected: expected,
      actual: null,
      status: 'POLICY_BOUND',
      source: 'POLICY',
      reason: null,
    });
  }

  function unavailableResult(policyId, policyBinding, reasonCode, message, source, observed, match) {
    return freezeDeep({
      schemaVersion: SCHEMA_VERSION,
      observationBinding: null,
      policyId: policyId || null,
      policyBinding: policyBinding || null,
      status: 'UNAVAILABLE',
      reasonCodes: [reasonCode],
      retryable: true,
      source: source || null,
      observed: observed || null,
      match: match || null,
      providerEvidence: freezeDeep({ providerKind: 'eip1193' }),
      message: message || null,
    });
  }

  function loadPolicyApi() {
    var api = window.IX_EXECUTION_GAS_POLICY;
    if (
      !api ||
      typeof api.getPolicySecurityPayload !== 'function' ||
      typeof api.getCanonicalPolicyBinding !== 'function' ||
      typeof api.validateGasPolicy !== 'function'
    ) {
      return null;
    }
    return api;
  }

  function loadCanonicalPolicy(policyId) {
    var api = loadPolicyApi();
    if (!api) {
      return { ok: false, code: 'POLICY_MODULE_UNAVAILABLE', message: 'Gas policy module unavailable.' };
    }

    var validation;
    var security;
    var binding;
    try {
      validation = api.validateGasPolicy(policyId);
      security = api.getPolicySecurityPayload(policyId);
      binding = api.getCanonicalPolicyBinding(policyId);
    } catch (error) {
      return { ok: false, code: 'POLICY_INVALID', message: 'Gas policy module is invalid.' };
    }

    if (!validation || validation.valid !== true) {
      return { ok: false, code: 'POLICY_INVALID', message: 'Gas policy module is invalid.' };
    }
    if (!security || security.policyId !== policyId) {
      return { ok: false, code: 'POLICY_INVALID', message: 'Gas policy module is invalid.' };
    }
    if (typeof binding !== 'string' || !binding.length) {
      return { ok: false, code: 'POLICY_INVALID', message: 'Gas policy module is invalid.' };
    }

    return freezeDeep({
      ok: true,
      policyId: policyId,
      policyBinding: binding,
      security: security,
    });
  }

  function getEthersApi() {
    return window.ethers &&
      typeof window.ethers.Interface === 'function' &&
      typeof window.ethers.keccak256 === 'function' &&
      typeof window.ethers.getBytes === 'function' &&
      typeof window.ethers.getAddress === 'function'
      ? window.ethers
      : null;
  }

  function assertReadOnlyMethod(method) {
    return READ_ONLY_METHODS.indexOf(method) !== -1;
  }

  async function requestRead(provider, method, params) {
    if (!provider || typeof provider.request !== 'function' || !assertReadOnlyMethod(method)) return null;
    try {
      return await provider.request({ method: method, params: params || [] });
    } catch (error) {
      return null;
    }
  }

  function decodeResult(iface, name, raw) {
    if (raw == null) return null;
    try {
      return iface.decodeFunctionResult(name, raw)[0];
    } catch (error) {
      return null;
    }
  }

  function codeIdentity(code, ethersApi) {
    if (typeof code !== 'string' || code === '0x' || !/^0x[0-9a-fA-F]*$/.test(code)) return null;
    try {
      var bytes = ethersApi.getBytes(code);
      return freezeDeep({
        byteLength: String(bytes.length),
        keccak256: ethersApi.keccak256(bytes),
      });
    } catch (error) {
      return null;
    }
  }

  function buildAvailableResult(policy, source, observed, match, reasons) {
    var status = reasons.length ? 'MISMATCH' : 'APPLICABLE';
    var retryable = false;
    var observationBinding = canonicalizeJson({
      schemaVersion: SCHEMA_VERSION,
      policyId: policy.policyId,
      policyBinding: policy.policyBinding,
      source: source,
      match: match,
      status: status,
    });

    return freezeDeep({
      schemaVersion: SCHEMA_VERSION,
      observationBinding: observationBinding,
      policyId: policy.policyId,
      policyBinding: policy.policyBinding,
      status: status,
      reasonCodes: freezeDeep(reasons.slice()),
      retryable: retryable,
      source: source,
      observed: observed,
      match: freezeDeep(match),
      providerEvidence: freezeDeep({ providerKind: 'eip1193' }),
    });
  }

  function compare(expected, actual, failureReason) {
    if (actual == null) {
      return makeMatch(expected, actual, 'UNAVAILABLE', failureReason + '_UNAVAILABLE');
    }
    if (actual === expected) {
      return makeMatch(expected, actual, 'MATCH', null);
    }
    return makeMatch(expected, actual, 'MISMATCH', failureReason);
  }

  /**
   * Status-to-reason classification table.
   * Every reason code emitted by the observer must appear here exactly once.
   */
  var REASON_STATUS_MAP = Object.freeze({
    // UNAVAILABLE reasons — returned as the top-level status
    POLICY_ID_REQUIRED:                           'UNAVAILABLE',
    POLICY_MODULE_UNAVAILABLE:                    'UNAVAILABLE',
    POLICY_INVALID:                               'UNAVAILABLE',
    KECCAK_UNAVAILABLE:                           'UNAVAILABLE',
    RPC_READ_UNAVAILABLE:                         'UNAVAILABLE',
    OBSERVATION_BLOCK_UNAVAILABLE:                'UNAVAILABLE',
    TOKEN_RUNTIME_UNAVAILABLE:                    'UNAVAILABLE',
    TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE:        'UNAVAILABLE',
    TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE:     'UNAVAILABLE',
    TOKEN_DECIMALS_UNAVAILABLE:                   'UNAVAILABLE',
    TOKEN_SYMBOL_UNAVAILABLE:                     'UNAVAILABLE',
    EXECUTION_RUNTIME_UNAVAILABLE:                'UNAVAILABLE',
    // MISMATCH reasons
    CHAIN_ID_MISMATCH:                            'MISMATCH',
    TOKEN_RUNTIME_MISMATCH:                       'MISMATCH',
    TOKEN_IMPLEMENTATION_MISMATCH:                'MISMATCH',
    TOKEN_IMPLEMENTATION_RUNTIME_MISMATCH:        'MISMATCH',
    TOKEN_DECIMALS_MISMATCH:                      'MISMATCH',
    TOKEN_SYMBOL_MISMATCH:                        'MISMATCH',
    EXECUTION_RUNTIME_MISMATCH:                   'MISMATCH',
    TREASURY_MISMATCH:                            'MISMATCH',
    FEE_BASIS_POINTS_MISMATCH:                    'MISMATCH',
    MINIMUM_AMOUNT_MISMATCH:                      'MISMATCH',
    TRANSFER_PRECISION_CONFIGURATION_MISMATCH:    'MISMATCH',
    PAUSED_STATE_MISMATCH:                        'MISMATCH',
    // REORGED reasons
    OBSERVATION_BLOCK_REORGED:                    'REORGED',
  });

  async function observePolicyApplicability(input) {
    input = input || {};

    // Issue 1: explicit policy ID required
    var policyId = input.policyId;
    if (typeof policyId !== 'string' || policyId.length === 0) {
      return unavailableResult(null, null, 'POLICY_ID_REQUIRED', 'An explicit policy ID is required.', null, null, null);
    }

    var provider = input.provider;

    var policy = loadCanonicalPolicy(policyId);
    if (!policy.ok) {
      return unavailableResult(policyId, null, policy.code, policy.message, null, null, null);
    }

    var ethersApi = getEthersApi();
    if (!ethersApi) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'KECCAK_UNAVAILABLE', 'Browser Keccak capability unavailable.', null, null, null);
    }

    if (!provider || typeof provider.request !== 'function') {
      return unavailableResult(policy.policyId, policy.policyBinding, 'RPC_READ_UNAVAILABLE', 'Read-only provider unavailable.', null, null, null);
    }

    // Issue 2: derive expected chain ID from policy, not from a hardcoded constant
    var expectedChainId = BigInt(policy.security.chainId);
    var expectedChainIdStr = expectedChainId.toString(10);

    var chainIdHex = await requestRead(provider, 'eth_chainId', []);
    var chainId = normalizeQuantity(chainIdHex);
    if (chainId == null) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'RPC_READ_UNAVAILABLE', 'Unable to interpret chain ID.', null, null, null);
    }
    if (chainId !== expectedChainId) {
      return freezeDeep({
        schemaVersion: SCHEMA_VERSION,
        observationBinding: null,
        policyId: policy.policyId,
        policyBinding: policy.policyBinding,
        status: 'MISMATCH',
        reasonCodes: ['CHAIN_ID_MISMATCH'],
        retryable: false,
        source: freezeDeep({
          chainId: chainId.toString(10),
          blockNumber: null,
          blockHash: null,
          blockTimestamp: null,
        }),
        observed: null,
        match: freezeDeep({
          chainId: makeMatch(expectedChainIdStr, chainId.toString(10), 'MISMATCH', 'CHAIN_ID_MISMATCH'),
        }),
        providerEvidence: freezeDeep({ providerKind: 'eip1193' }),
      });
    }

    var blockNumberHex = await requestRead(provider, 'eth_blockNumber', []);
    var blockNumber = normalizeQuantity(blockNumberHex);
    if (blockNumber == null) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'OBSERVATION_BLOCK_UNAVAILABLE', 'Unable to read block number.', freezeDeep({ chainId: chainId.toString(10) }), null, null);
    }

    var blockTag = toHexTag(blockNumber);

    // Issue 4: strict first-block header validation
    var firstBlock = await requestRead(provider, 'eth_getBlockByNumber', [blockTag, false]);
    if (!isValidBlockHeader(firstBlock, blockTag)) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'OBSERVATION_BLOCK_UNAVAILABLE', 'Block header unavailable or malformed.', freezeDeep({
        chainId: chainId.toString(10),
        blockNumber: blockNumber.toString(10),
      }), null, null);
    }

    var firstBlockTimestamp = normalizeQuantity(firstBlock.timestamp);
    if (firstBlockTimestamp == null) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'OBSERVATION_BLOCK_UNAVAILABLE', 'Block timestamp invalid.', freezeDeep({
        chainId: chainId.toString(10),
        blockNumber: blockNumber.toString(10),
      }), null, null);
    }

    var source = freezeDeep({
      chainId: chainId.toString(10),
      blockNumber: blockNumber.toString(10),
      blockHash: normalizeLowerHex(firstBlock.hash),
      blockTimestamp: firstBlockTimestamp.toString(10),
    });

    var tokenAddress = normalizeAddress(policy.security.token.address, ethersApi);
    var executionAddress = normalizeAddress(policy.security.executionContract.address, ethersApi);
    if (!tokenAddress || !executionAddress) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'POLICY_INVALID', 'Policy address normalization failed.', source, null, null);
    }

    var tokenIface = new ethersApi.Interface(TOKEN_INTERFACE);
    var executionIface = new ethersApi.Interface(EXECUTION_INTERFACE);

    // Issue 2: use implementationSlot from policy, not from a hardcoded constant
    var implementationSlot = policy.security.token.implementationSlot;

    var tokenCode = await requestRead(provider, 'eth_getCode', [tokenAddress, blockTag]);
    var executionCode = await requestRead(provider, 'eth_getCode', [executionAddress, blockTag]);
    var implementationWord = await requestRead(provider, 'eth_getStorageAt', [tokenAddress, implementationSlot, blockTag]);

    var implementationAddress = null;
    var implementationReason = null;
    if (typeof implementationWord !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(implementationWord)) {
      implementationReason = 'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE';
    } else if (BigInt(implementationWord) === 0n) {
      implementationReason = 'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE';
    } else {
      try {
        implementationAddress = ethersApi.getAddress('0x' + implementationWord.slice(-40)).toLowerCase();
      } catch (error) {
        implementationReason = 'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE';
      }
    }

    // Issue 5: classify empty or malformed implementation code as UNAVAILABLE
    var implementationCode = null;
    if (implementationAddress) {
      implementationCode = await requestRead(provider, 'eth_getCode', [implementationAddress, blockTag]);
      if (typeof implementationCode !== 'string' || implementationCode === '0x' || !/^0x[0-9a-fA-F]*$/.test(implementationCode)) {
        implementationCode = null;
        if (!implementationReason) {
          implementationReason = 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE';
        }
      }
    }

    var tokenDecimalsRaw = await requestRead(provider, 'eth_call', [{ to: tokenAddress, data: tokenIface.encodeFunctionData('decimals', []) }, blockTag]);
    var tokenSymbolRaw = await requestRead(provider, 'eth_call', [{ to: tokenAddress, data: tokenIface.encodeFunctionData('symbol', []) }, blockTag]);
    var treasuryRaw = await requestRead(provider, 'eth_call', [{ to: executionAddress, data: executionIface.encodeFunctionData('treasury', []) }, blockTag]);
    var feeBasisPointsRaw = await requestRead(provider, 'eth_call', [{ to: executionAddress, data: executionIface.encodeFunctionData('feeBasisPoints', []) }, blockTag]);
    var minTransferRaw = await requestRead(provider, 'eth_call', [{ to: executionAddress, data: executionIface.encodeFunctionData('minTransferAmount', []) }, blockTag]);
    var transferPrecisionRaw = await requestRead(provider, 'eth_call', [{ to: executionAddress, data: executionIface.encodeFunctionData('transferPrecision', []) }, blockTag]);
    var pausedRaw = await requestRead(provider, 'eth_call', [{ to: executionAddress, data: executionIface.encodeFunctionData('paused', []) }, blockTag]);

    // Issue 4: strict final-block validation for reorg detection
    var finalBlock = await requestRead(provider, 'eth_getBlockByNumber', [blockTag, false]);
    if (!finalBlock) {
      return freezeDeep({
        schemaVersion: SCHEMA_VERSION,
        observationBinding: null,
        policyId: policy.policyId,
        policyBinding: policy.policyBinding,
        status: 'REORGED',
        reasonCodes: ['OBSERVATION_BLOCK_REORGED'],
        retryable: true,
        source: source,
        observed: null,
        match: null,
        providerEvidence: freezeDeep({ providerKind: 'eip1193' }),
      });
    }
    // Intrinsic malformation of the final block → UNAVAILABLE, not REORGED
    if (
      typeof finalBlock.number !== 'string' ||
      !/^0x[0-9a-fA-F]+$/.test(finalBlock.number) ||
      typeof finalBlock.hash !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(finalBlock.hash)
    ) {
      return unavailableResult(policy.policyId, policy.policyBinding, 'OBSERVATION_BLOCK_UNAVAILABLE', 'Final block header malformed.', source, null, null);
    }
    // Number or hash divergence → REORGED
    if (
      finalBlock.number.toLowerCase() !== blockTag.toLowerCase() ||
      normalizeLowerHex(finalBlock.hash) !== source.blockHash
    ) {
      return freezeDeep({
        schemaVersion: SCHEMA_VERSION,
        observationBinding: null,
        policyId: policy.policyId,
        policyBinding: policy.policyBinding,
        status: 'REORGED',
        reasonCodes: ['OBSERVATION_BLOCK_REORGED'],
        retryable: true,
        source: source,
        observed: null,
        match: null,
        providerEvidence: freezeDeep({ providerKind: 'eip1193' }),
      });
    }

    var tokenDecimals = decodeResult(tokenIface, 'decimals', tokenDecimalsRaw);
    var tokenSymbol = decodeResult(tokenIface, 'symbol', tokenSymbolRaw);
    var treasury = decodeResult(executionIface, 'treasury', treasuryRaw);
    treasury = treasury == null ? null : normalizeAddress(treasury, ethersApi);
    var feeBasisPoints = decodeResult(executionIface, 'feeBasisPoints', feeBasisPointsRaw);
    var minimumRecipientAmountAtomic = decodeResult(executionIface, 'minTransferAmount', minTransferRaw);
    var transferPrecisionAtomic = decodeResult(executionIface, 'transferPrecision', transferPrecisionRaw);
    var paused = decodeResult(executionIface, 'paused', pausedRaw);

    var observed = freezeDeep({
      token: freezeDeep({
        address: tokenAddress,
        runtime: codeIdentity(tokenCode, ethersApi),
        implementationSlot: normalizeLowerHex(implementationSlot),
        implementationSlotWord: normalizeLowerHex(implementationWord),
        implementationAddress: implementationAddress,
        implementationRuntime: implementationCode ? codeIdentity(implementationCode, ethersApi) : null,
        decimals: tokenDecimals == null ? null : String(tokenDecimals),
        symbol: tokenSymbol == null ? null : String(tokenSymbol),
      }),
      executionContract: freezeDeep({
        address: executionAddress,
        runtime: codeIdentity(executionCode, ethersApi),
        treasury: treasury,
        feeBasisPoints: feeBasisPoints == null ? null : String(feeBasisPoints),
        minimumRecipientAmountAtomic: minimumRecipientAmountAtomic == null ? null : String(minimumRecipientAmountAtomic),
        // Issue 3: maximumRecipientAmountAtomic is not observable on-chain; use POLICY_BOUND
        maximumRecipientAmountAtomic: policy.security.amountPolicy.maximumRecipientAmountAtomic,
        transferPrecisionAtomic: transferPrecisionAtomic == null ? null : String(transferPrecisionAtomic),
        paused: paused == null ? null : Boolean(paused),
      }),
    });

    var reasons = [];

    // Issue 5: determine implementation runtime match status using explicit reason codes
    var implementationRuntimeMatch;
    if (implementationAddress == null) {
      // slot not readable → unavailable
      implementationRuntimeMatch = makeMatch(policy.security.token.implementationRuntimeKeccak256, null, 'UNAVAILABLE', 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE');
    } else if (implementationReason === 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE') {
      // code empty or malformed → unavailable
      implementationRuntimeMatch = makeMatch(policy.security.token.implementationRuntimeKeccak256, null, 'UNAVAILABLE', 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE');
    } else {
      var implementationRuntimeKeccak = observed.token.implementationRuntime ? observed.token.implementationRuntime.keccak256 : null;
      if (implementationRuntimeKeccak == null) {
        implementationRuntimeMatch = makeMatch(policy.security.token.implementationRuntimeKeccak256, null, 'UNAVAILABLE', 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE');
      } else if (implementationRuntimeKeccak === policy.security.token.implementationRuntimeKeccak256) {
        implementationRuntimeMatch = makeMatch(policy.security.token.implementationRuntimeKeccak256, implementationRuntimeKeccak, 'MATCH', null);
      } else {
        implementationRuntimeMatch = makeMatch(policy.security.token.implementationRuntimeKeccak256, implementationRuntimeKeccak, 'MISMATCH', 'TOKEN_IMPLEMENTATION_RUNTIME_MISMATCH');
      }
    }

    var match = {
      chainId: makeMatch(expectedChainIdStr, chainId.toString(10), 'MATCH', null),
      token: {
        runtime: observed.token.runtime == null
          ? makeMatch(policy.security.token.runtimeKeccak256, null, 'UNAVAILABLE', 'TOKEN_RUNTIME_UNAVAILABLE')
          : compare(policy.security.token.runtimeKeccak256, observed.token.runtime.keccak256, 'TOKEN_RUNTIME_MISMATCH'),
        implementationSlot: implementationWord == null
          ? makeMatch(implementationSlot, null, 'UNAVAILABLE', 'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE')
          : makeMatch(implementationSlot, implementationSlot, 'MATCH', null),
        implementationAddress: implementationAddress == null
          ? makeMatch(policy.security.token.implementationAddress, null, 'UNAVAILABLE', 'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE')
          : compare(policy.security.token.implementationAddress, implementationAddress, 'TOKEN_IMPLEMENTATION_MISMATCH'),
        implementationRuntime: implementationRuntimeMatch,
        decimals: tokenDecimals == null
          ? makeMatch(policy.security.token.decimals, null, 'UNAVAILABLE', 'TOKEN_DECIMALS_UNAVAILABLE')
          : compare(policy.security.token.decimals, String(tokenDecimals), 'TOKEN_DECIMALS_MISMATCH'),
        symbol: tokenSymbol == null
          ? makeMatch(policy.security.token.symbol, null, 'UNAVAILABLE', 'TOKEN_SYMBOL_UNAVAILABLE')
          : compare(policy.security.token.symbol, String(tokenSymbol), 'TOKEN_SYMBOL_MISMATCH'),
      },
      executionContract: {
        runtime: observed.executionContract.runtime == null
          ? makeMatch(policy.security.executionContract.runtimeKeccak256, null, 'UNAVAILABLE', 'EXECUTION_RUNTIME_UNAVAILABLE')
          : compare(policy.security.executionContract.runtimeKeccak256, observed.executionContract.runtime.keccak256, 'EXECUTION_RUNTIME_MISMATCH'),
        treasury: treasury == null
          ? makeMatch(policy.security.executionContract.treasuryAddress, null, 'UNAVAILABLE', 'RPC_READ_UNAVAILABLE')
          : compare(policy.security.executionContract.treasuryAddress, treasury, 'TREASURY_MISMATCH'),
        feeBasisPoints: feeBasisPoints == null
          ? makeMatch(policy.security.amountPolicy.feeBasisPoints, null, 'UNAVAILABLE', 'RPC_READ_UNAVAILABLE')
          : compare(policy.security.amountPolicy.feeBasisPoints, String(feeBasisPoints), 'FEE_BASIS_POINTS_MISMATCH'),
        minimumRecipientAmountAtomic: minimumRecipientAmountAtomic == null
          ? makeMatch(policy.security.amountPolicy.minimumRecipientAmountAtomic, null, 'UNAVAILABLE', 'RPC_READ_UNAVAILABLE')
          : compare(policy.security.amountPolicy.minimumRecipientAmountAtomic, String(minimumRecipientAmountAtomic), 'MINIMUM_AMOUNT_MISMATCH'),
        // Issue 3: maximum amount is POLICY_BOUND — not observable on-chain, not included in APPLICABLE conjunction
        maximumRecipientAmountAtomic: makePolicyBound(policy.security.amountPolicy.maximumRecipientAmountAtomic),
        transferPrecisionAtomic: transferPrecisionAtomic == null
          ? makeMatch(policy.security.amountPolicy.precisionIncrementAtomic, null, 'UNAVAILABLE', 'RPC_READ_UNAVAILABLE')
          : compare(policy.security.amountPolicy.precisionIncrementAtomic, String(transferPrecisionAtomic), 'TRANSFER_PRECISION_CONFIGURATION_MISMATCH'),
        paused: paused == null
          ? makeMatch(String(policy.security.executionContract.paused), null, 'UNAVAILABLE', 'RPC_READ_UNAVAILABLE')
          : compare(String(policy.security.executionContract.paused), String(Boolean(paused)), 'PAUSED_STATE_MISMATCH'),
      },
    };

    // Collect reasons from all runtime-observable fields only.
    // maximumRecipientAmountAtomic is POLICY_BOUND and never contributes to reasons.
    if (match.token.runtime.status !== 'MATCH') reasons.push(match.token.runtime.reason);
    if (match.token.implementationSlot.status !== 'MATCH') reasons.push(match.token.implementationSlot.reason);
    if (match.token.implementationAddress.status !== 'MATCH') reasons.push(match.token.implementationAddress.reason);
    if (match.token.implementationRuntime.status !== 'MATCH') reasons.push(match.token.implementationRuntime.reason);
    if (match.token.decimals.status !== 'MATCH') reasons.push(match.token.decimals.reason);
    if (match.token.symbol.status !== 'MATCH') reasons.push(match.token.symbol.reason);
    if (match.executionContract.runtime.status !== 'MATCH') reasons.push(match.executionContract.runtime.reason);
    if (match.executionContract.treasury.status !== 'MATCH') reasons.push(match.executionContract.treasury.reason);
    if (match.executionContract.feeBasisPoints.status !== 'MATCH') reasons.push(match.executionContract.feeBasisPoints.reason);
    if (match.executionContract.minimumRecipientAmountAtomic.status !== 'MATCH') reasons.push(match.executionContract.minimumRecipientAmountAtomic.reason);
    // maximumRecipientAmountAtomic is intentionally excluded from the reasons loop
    if (match.executionContract.transferPrecisionAtomic.status !== 'MATCH') reasons.push(match.executionContract.transferPrecisionAtomic.reason);
    if (match.executionContract.paused.status !== 'MATCH') reasons.push(match.executionContract.paused.reason);

    var unavailableReasons = [
      'RPC_READ_UNAVAILABLE',
      'POLICY_MODULE_UNAVAILABLE',
      'POLICY_INVALID',
      'KECCAK_UNAVAILABLE',
      'OBSERVATION_BLOCK_UNAVAILABLE',
      'TOKEN_RUNTIME_UNAVAILABLE',
      'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE',
      'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE',
      'TOKEN_DECIMALS_UNAVAILABLE',
      'TOKEN_SYMBOL_UNAVAILABLE',
      'EXECUTION_RUNTIME_UNAVAILABLE',
    ];
    var isUnavailable = reasons.some(function (reason) { return unavailableReasons.indexOf(reason) !== -1; });
    if (isUnavailable) {
      return unavailableResult(policy.policyId, policy.policyBinding, reasons[0] || 'RPC_READ_UNAVAILABLE', 'Policy applicability could not be established.', source, observed, match);
    }

    return buildAvailableResult(policy, source, observed, match, reasons);
  }

  var api = {
    schemaVersion: SCHEMA_VERSION,
    observePolicyApplicability: observePolicyApplicability,
    REASON_STATUS_MAP: REASON_STATUS_MAP,
  };

  if (window.__IX_POLICY_TEST_MODE__ === true) {
    api.__TEST_ONLY__ = freezeDeep({
      READ_ONLY_METHODS: READ_ONLY_METHODS,
      getCanonicalObservationBinding: function (value) {
        return canonicalizeJson(value);
      },
      normalizeQuantity: normalizeQuantity,
      normalizeAddress: function (value, ethersApi) {
        return normalizeAddress(value, ethersApi);
      },
      codeIdentity: codeIdentity,
      loadCanonicalPolicy: loadCanonicalPolicy,
      loadPolicyApi: loadPolicyApi,
      requestRead: requestRead,
      isValidBlockHeader: isValidBlockHeader,
      REASON_STATUS_MAP: REASON_STATUS_MAP,
    });
  }

  api = freezeDeep(api);

  Object.defineProperty(window, 'IX_EXECUTION_POLICY_APPLICABILITY', {
    value: api,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
