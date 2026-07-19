const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ethers = require('ethers');

const repoRoot = path.resolve(__dirname, '../../..');
const policyPath = path.join(repoRoot, 'app-web/frontend/public/js/ix-execution-gas-policy.js');
const observerPath = path.join(repoRoot, 'app-web/frontend/public/js/ix-execution-policy-applicability.js');
const policySource = fs.readFileSync(policyPath, 'utf8');
const observerSource = fs.readFileSync(observerPath, 'utf8');

// Load the gas-policy module once in the test process to derive symbolic constants.
// All expected 64-hex values in this file (except KNOWN_KECCAK256_DEADBEEF) must come
// from this resolved security payload — no inline policy literals are permitted.
const _policyVmContext = { window: { __IX_POLICY_TEST_MODE__: false } };
_policyVmContext.globalThis = _policyVmContext;
vm.runInNewContext(policySource, _policyVmContext, { filename: policyPath });
const _policySecurityPayload = _policyVmContext.window.IX_EXECUTION_GAS_POLICY.getPolicySecurityPayload('COIN_CARD_POLYGON_V1');

// Symbolic constants derived from the canonical gas-policy security payload.
const TOKEN_PROXY_RUNTIME_KECCAK = _policySecurityPayload.token.runtimeKeccak256;
const TOKEN_IMPL_RUNTIME_KECCAK = _policySecurityPayload.token.implementationRuntimeKeccak256;
const EXECUTION_RUNTIME_KECCAK = _policySecurityPayload.executionContract.runtimeKeccak256;
const IMPLEMENTATION_SLOT = _policySecurityPayload.token.implementationSlot;

// One independent literal: the known keccak256(0xdeadbeef) test vector.
// This value is intentionally NOT derived from the policy module — it exists to verify
// that the real Ethers keccak path produces the correct cryptographic output.
const KNOWN_KECCAK256_DEADBEEF = '0xd4fd4e189132273036449fc9e11198c739161b4c0116a9a2dccdfa1c492006f1';

const TOKEN_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const EXECUTION_ADDRESS = '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0';
const IMPLEMENTATION_ADDRESS = '0x235AE97b28466Db30469b89A9fe4cFf0659f82Cb';
const TREASURY_ADDRESS = '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919';
const BLOCK_HASH = '0x' + '11'.repeat(32);
const BLOCK_HASH_REORGED = '0x' + '22'.repeat(32);
const BLOCK_NUMBER = '0x2a';
const BLOCK_TIMESTAMP = '0x64';
const POLICY_HASH_ETHERS = makeTestEthers({
  [ethers.hexlify('0x60016000556001600155').toLowerCase()]: TOKEN_PROXY_RUNTIME_KECCAK,
  [ethers.hexlify('0x60026000556002600155').toLowerCase()]: EXECUTION_RUNTIME_KECCAK,
  [ethers.hexlify('0x60036000556003600155').toLowerCase()]: TOKEN_IMPL_RUNTIME_KECCAK,
});

function loadRuntime(options = {}) {
  const ethersApi = options.ethersApi || ethers;
  const context = {
    BigInt,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Symbol,
    Array,
    parseInt,
    isNaN,
    window: {
      __IX_POLICY_TEST_MODE__: Boolean(options.testMode),
      ethers: ethersApi,
    },
  };
  context.window.window = context.window;
  context.window.globalThis = context.window;
  context.globalThis = context.window;
  if (options.includePolicy !== false) {
    vm.runInNewContext(policySource, context, { filename: policyPath });
  } else if (options.policyOverride) {
    context.window.IX_EXECUTION_GAS_POLICY = options.policyOverride;
  }
  if (typeof options.beforeObserver === 'function') {
    options.beforeObserver(context.window);
  }
  vm.runInNewContext(observerSource, context, { filename: observerPath });
  return context.window;
}

function makeTestEthers(hashMap = {}) {
  return Object.assign({}, ethers, {
    keccak256(bytes) {
      const hex = ethers.hexlify(bytes).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(hashMap, hex)) return hashMap[hex];
      return ethers.keccak256(bytes);
    },
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeHexWord(address) {
  return '0x' + '0'.repeat(24) + address.slice(2).toLowerCase();
}

function encodeResult(iface, name, values) {
  return iface.encodeFunctionResult(name, values);
}

function makeProvider(overrides = {}) {
  const calls = [];
  const tokenIface = new ethers.Interface([
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ]);
  const executionIface = new ethers.Interface([
    'function treasury() view returns (address)',
    'function feeBasisPoints() view returns (uint16)',
    'function minTransferAmount() view returns (uint256)',
    'function transferPrecision() view returns (uint256)',
    'function paused() view returns (bool)',
  ]);
  const tokenCode = overrides.tokenCode || '0x60016000556001600155';
  const executionCode = overrides.executionCode || '0x60026000556002600155';
  const implementationCode = overrides.implementationCode || '0x60036000556003600155';
  const implementationAddress = overrides.implementationAddress || IMPLEMENTATION_ADDRESS;
  const implementationWord = overrides.implementationWord || makeHexWord(implementationAddress);
  const tokenDecimals = overrides.tokenDecimals ?? 6;
  const tokenSymbol = overrides.tokenSymbol ?? 'USDC';
  const treasuryAddress = overrides.treasuryAddress || TREASURY_ADDRESS;
  const feeBasisPoints = overrides.feeBasisPoints ?? 100;
  const minimumAmount = overrides.minimumAmount || '1000000';
  const transferPrecision = overrides.transferPrecision || '1000000';
  const paused = overrides.paused ?? false;

  return {
    calls,
    request: async ({ method, params }) => {
      calls.push({ method, params });
      if (overrides.onRequest) {
        const hookResult = overrides.onRequest({ method, params, calls });
        if (typeof hookResult !== 'undefined') return hookResult;
      }
      switch (method) {
        case 'eth_chainId':
          return overrides.chainIdHex || '0x89';
        case 'eth_blockNumber':
          return overrides.blockNumberHex || BLOCK_NUMBER;
        case 'eth_getBlockByNumber': {
          const blockCallCount = calls.filter((c) => c.method === 'eth_getBlockByNumber').length;
          if ('firstBlockOverride' in overrides && blockCallCount === 1) {
            return overrides.firstBlockOverride;
          }
          if ('finalBlockOverride' in overrides && blockCallCount > 1) {
            return overrides.finalBlockOverride;
          }
          const hash = calls.filter((call) => call.method === 'eth_getBlockByNumber').length === 1
            ? (overrides.blockHash || BLOCK_HASH)
            : (overrides.finalBlockHash || overrides.blockHash || BLOCK_HASH);
          const timestamp = overrides.blockTimestampHex || BLOCK_TIMESTAMP;
          return { number: overrides.blockNumberHex || BLOCK_NUMBER, hash, timestamp };
        }
        case 'eth_getCode': {
          const address = String(params[0]).toLowerCase();
          const normalizedToken = TOKEN_ADDRESS.toLowerCase();
          const normalizedExecution = EXECUTION_ADDRESS.toLowerCase();
          const normalizedImplementation = implementationAddress.toLowerCase();
          if (address === normalizedToken) return tokenCode;
          if (address === normalizedExecution) return executionCode;
          if (address === normalizedImplementation) return implementationCode;
          return '0x';
        }
        case 'eth_getStorageAt':
          return implementationWord;
        case 'eth_call': {
          const { to, data } = params[0];
          if (to.toLowerCase() === TOKEN_ADDRESS.toLowerCase()) {
            if (data.startsWith(tokenIface.encodeFunctionData('decimals', []).slice(0, 10))) {
              return encodeResult(tokenIface, 'decimals', [tokenDecimals]);
            }
            if (data.startsWith(tokenIface.encodeFunctionData('symbol', []).slice(0, 10))) {
              return encodeResult(tokenIface, 'symbol', [tokenSymbol]);
            }
          }
          if (to.toLowerCase() === EXECUTION_ADDRESS.toLowerCase()) {
            if (data.startsWith(executionIface.encodeFunctionData('treasury', []).slice(0, 10))) {
              return encodeResult(executionIface, 'treasury', [treasuryAddress]);
            }
            if (data.startsWith(executionIface.encodeFunctionData('feeBasisPoints', []).slice(0, 10))) {
              return encodeResult(executionIface, 'feeBasisPoints', [feeBasisPoints]);
            }
            if (data.startsWith(executionIface.encodeFunctionData('minTransferAmount', []).slice(0, 10))) {
              return encodeResult(executionIface, 'minTransferAmount', [minimumAmount]);
            }
            if (data.startsWith(executionIface.encodeFunctionData('transferPrecision', []).slice(0, 10))) {
              return encodeResult(executionIface, 'transferPrecision', [transferPrecision]);
            }
            if (data.startsWith(executionIface.encodeFunctionData('paused', []).slice(0, 10))) {
              return encodeResult(executionIface, 'paused', [paused]);
            }
          }
          return '0x';
        }
        default:
          throw new Error(`unexpected method ${method}`);
      }
    },
  };
}

function getPolicyApi(window) {
  return window.IX_EXECUTION_GAS_POLICY;
}

function getObserverApi(window) {
  return window.IX_EXECUTION_POLICY_APPLICABILITY;
}

// ---------------------------------------------------------------------------
// Existing tests (preserved)
// ---------------------------------------------------------------------------

test('successful observation is APPLICABLE and uses one coherent block tag', async () => {
  const window = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
  });
  const policyApi = getPolicyApi(window);
  const policy = policyApi.resolveGasPolicy('COIN_CARD_POLYGON_V1');
  const provider = makeProvider();

  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider,
  });

  assert.equal(result.status, 'APPLICABLE');
  assert.equal(result.policyId, 'COIN_CARD_POLYGON_V1');
  assert.equal(result.source.chainId, '137');
  assert.equal(result.source.blockNumber, BigInt(BLOCK_NUMBER).toString(10));
  assert.equal(result.source.blockHash, BLOCK_HASH.toLowerCase());
  assert.equal(result.source.blockTimestamp, BigInt(BLOCK_TIMESTAMP).toString(10));
  assert.equal(result.providerEvidence.providerKind, 'eip1193');
  assert.equal(result.observed.token.address, TOKEN_ADDRESS.toLowerCase());
  assert.equal(
    result.observed.token.runtime.keccak256,
    POLICY_HASH_ETHERS.keccak256(POLICY_HASH_ETHERS.getBytes('0x60016000556001600155'))
  );
  assert.equal(result.observed.executionContract.address, EXECUTION_ADDRESS.toLowerCase());
  assert.equal(result.observed.executionContract.treasury, TREASURY_ADDRESS.toLowerCase());
  assert.equal(result.observed.executionContract.feeBasisPoints, '100');
  assert.equal(result.observed.executionContract.minimumRecipientAmountAtomic, '1000000');
  assert.equal(result.observed.executionContract.maximumRecipientAmountAtomic, policy.security.amountPolicy.maximumRecipientAmountAtomic);
  assert.equal(result.observed.executionContract.transferPrecisionAtomic, '1000000');
  assert.equal(result.observed.executionContract.paused, false);
  assert.equal(result.match.token.runtime.status, 'MATCH');
  assert.equal(result.match.executionContract.runtime.status, 'MATCH');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.source), true);
  assert.equal(Object.isFrozen(result.observed), true);
  assert.equal(Object.isFrozen(result.match), true);

  const blockTags = provider.calls
    .filter((call) => ['eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call'].includes(call.method))
    .map((call) => call.params[call.method === 'eth_getBlockByNumber' ? 0 : call.method === 'eth_getStorageAt' ? 2 : 1]);
  assert.equal(new Set(blockTags).size, 1);
  assert.equal(blockTags[0], BLOCK_NUMBER);
  assert.deepEqual(provider.calls.filter((call) => !['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call'].includes(call.method)), []);
  assert.equal(result.observationBinding.includes('"bindingFormat"'), false);
});

test('repeated observations are independent and deterministic', async () => {
  const window = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
  });
  const observer = getObserverApi(window);
  const provider = makeProvider();

  const first = await observer.observePolicyApplicability({ policyId: 'COIN_CARD_POLYGON_V1', provider });
  const second = await observer.observePolicyApplicability({ policyId: 'COIN_CARD_POLYGON_V1', provider: makeProvider() });

  assert.notEqual(first, second);
  assert.equal(first.observationBinding, second.observationBinding);
  assert.equal(first.policyBinding, second.policyBinding);
});

test('chain mismatch fails closed with CHAIN_ID_MISMATCH', async () => {
  const window = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
  });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ chainIdHex: '0x1' }),
  });

  assert.equal(result.status, 'MISMATCH');
  assert.equal(result.reasonCodes[0], 'CHAIN_ID_MISMATCH');
});

test('empty or malformed runtime data is unavailable, not accepted', async () => {
  const window = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
  });
  const emptyTokenCode = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ tokenCode: '0x' }),
  });
  assert.equal(emptyTokenCode.status, 'UNAVAILABLE');
  assert.equal(emptyTokenCode.reasonCodes[0], 'TOKEN_RUNTIME_UNAVAILABLE');

  const malformedSlot = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ implementationWord: '0x1234' }),
  });
  assert.equal(malformedSlot.status, 'UNAVAILABLE');
  assert.equal(malformedSlot.reasonCodes[0], 'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE');

  const emptyExecutionCode = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ executionCode: '0x' }),
  });
  assert.equal(emptyExecutionCode.status, 'UNAVAILABLE');
  assert.equal(emptyExecutionCode.reasonCodes[0], 'EXECUTION_RUNTIME_UNAVAILABLE');
});

test('identity and configuration mismatches are reported explicitly', async () => {
  const window = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
  });
  const observer = getObserverApi(window);

  const tokenRuntimeMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ tokenCode: '0x60046000556004600155' }),
  });
  assert.equal(tokenRuntimeMismatch.status, 'MISMATCH');
  assert.equal(tokenRuntimeMismatch.reasonCodes.includes('TOKEN_RUNTIME_MISMATCH'), true);

  const implementationAddressMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ implementationAddress: '0x9999999999999999999999999999999999999999' }),
  });
  assert.equal(implementationAddressMismatch.status, 'MISMATCH');
  assert.equal(implementationAddressMismatch.reasonCodes.includes('TOKEN_IMPLEMENTATION_MISMATCH'), true);

  const implementationRuntimeMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ implementationCode: '0x60056000556005600155' }),
  });
  assert.equal(implementationRuntimeMismatch.status, 'MISMATCH');
  assert.equal(implementationRuntimeMismatch.reasonCodes.includes('TOKEN_IMPLEMENTATION_RUNTIME_MISMATCH'), true);

  const treasuryMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ treasuryAddress: '0x0000000000000000000000000000000000000001' }),
  });
  assert.equal(treasuryMismatch.status, 'MISMATCH');
  assert.equal(treasuryMismatch.reasonCodes.includes('TREASURY_MISMATCH'), true);

  const feeMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ feeBasisPoints: 101 }),
  });
  assert.equal(feeMismatch.status, 'MISMATCH');
  assert.equal(feeMismatch.reasonCodes.includes('FEE_BASIS_POINTS_MISMATCH'), true);

  const minimumMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ minimumAmount: '1000001' }),
  });
  assert.equal(minimumMismatch.status, 'MISMATCH');
  assert.equal(minimumMismatch.reasonCodes.includes('MINIMUM_AMOUNT_MISMATCH'), true);

  const precisionMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ transferPrecision: '2' }),
  });
  assert.equal(precisionMismatch.status, 'MISMATCH');
  assert.equal(precisionMismatch.reasonCodes.includes('TRANSFER_PRECISION_CONFIGURATION_MISMATCH'), true);

  const pausedMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ paused: true }),
  });
  assert.equal(pausedMismatch.status, 'MISMATCH');
  assert.equal(pausedMismatch.reasonCodes.includes('PAUSED_STATE_MISMATCH'), true);

  const decimalsMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ tokenDecimals: 18 }),
  });
  assert.equal(decimalsMismatch.status, 'MISMATCH');
  assert.equal(decimalsMismatch.reasonCodes.includes('TOKEN_DECIMALS_MISMATCH'), true);

  const symbolMismatch = await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ tokenSymbol: 'DAI' }),
  });
  assert.equal(symbolMismatch.status, 'MISMATCH');
  assert.equal(symbolMismatch.reasonCodes.includes('TOKEN_SYMBOL_MISMATCH'), true);
});

test('policy module absence, invalid policy, provider failure, and reorgs fail closed', async () => {
  const absentWindow = loadRuntime({ includePolicy: false, testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const absent = await getObserverApi(absentWindow).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider(),
  });
  assert.equal(absent.status, 'UNAVAILABLE');
  assert.equal(absent.reasonCodes[0], 'POLICY_MODULE_UNAVAILABLE');

  const invalidWindow = loadRuntime({
    includePolicy: false,
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
    policyOverride: {
      validateGasPolicy() { return { valid: false }; },
      getPolicySecurityPayload() { return { policyId: 'COIN_CARD_POLYGON_V1' }; },
      getCanonicalPolicyBinding() { return 'binding'; },
    },
  });
  const invalid = await getObserverApi(invalidWindow).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider(),
  });
  assert.equal(invalid.status, 'UNAVAILABLE');
  assert.equal(invalid.reasonCodes[0], 'POLICY_INVALID');

  const throwingWindow = loadRuntime({
    includePolicy: false,
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
    policyOverride: {
      validateGasPolicy() { throw new Error('boom'); },
      getPolicySecurityPayload() { throw new Error('boom'); },
      getCanonicalPolicyBinding() { throw new Error('boom'); },
    },
  });
  const thrown = await getObserverApi(throwingWindow).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider(),
  });
  assert.equal(thrown.status, 'UNAVAILABLE');
  assert.equal(thrown.reasonCodes[0], 'POLICY_INVALID');

  const providerAbsent = await getObserverApi(loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS })).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: null,
  });
  assert.equal(providerAbsent.status, 'UNAVAILABLE');
  assert.equal(providerAbsent.reasonCodes[0], 'RPC_READ_UNAVAILABLE');

  const providerThrows = await getObserverApi(loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS })).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: {
      request() { throw new Error('nope'); },
    },
  });
  assert.equal(providerThrows.status, 'UNAVAILABLE');
  assert.equal(providerThrows.reasonCodes[0], 'RPC_READ_UNAVAILABLE');

  const reorg = await getObserverApi(loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS })).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ finalBlockHash: BLOCK_HASH_REORGED }),
  });
  assert.equal(reorg.status, 'REORGED');
  assert.equal(reorg.reasonCodes[0], 'OBSERVATION_BLOCK_REORGED');
});

test('only read-only RPC methods are usable and production globals omit test hooks', async () => {
  const window = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
  });
  const observer = getObserverApi(window);
  const provider = makeProvider({
    onRequest({ method }) {
      if (!['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call'].includes(method)) {
        throw new Error(`disallowed method ${method}`);
      }
    },
  });

  await observer.observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider,
  });

  assert.equal(provider.calls.some((call) => ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'personal_sign', 'eth_signTypedData'].includes(call.method)), false);

  const productionWindow = loadRuntime({
    testMode: false,
    ethersApi: POLICY_HASH_ETHERS,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(getObserverApi(productionWindow), '__TEST_ONLY__'), false);
});

// ---------------------------------------------------------------------------
// Issue 1 — Explicit policy ID required
// ---------------------------------------------------------------------------

test('omitted policyId returns UNAVAILABLE POLICY_ID_REQUIRED with zero provider calls', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const observer = getObserverApi(window);
  const calls = [];
  const provider = {
    request(...args) {
      calls.push(args);
      return Promise.resolve(null);
    },
  };

  const result = await observer.observePolicyApplicability({ provider });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'POLICY_ID_REQUIRED');
  assert.equal(calls.length, 0, 'no provider calls should be made when policyId is omitted');
});

test('empty string policyId returns UNAVAILABLE POLICY_ID_REQUIRED with zero provider calls', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const observer = getObserverApi(window);
  const calls = [];
  const provider = {
    request(...args) {
      calls.push(args);
      return Promise.resolve(null);
    },
  };

  const result = await observer.observePolicyApplicability({ policyId: '', provider });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'POLICY_ID_REQUIRED');
  assert.equal(calls.length, 0, 'no provider calls should be made when policyId is empty string');
});

// Issue 7 — Zero-provider-call guarantee (explicit)
test('zero provider calls when policyId is missing (read-only guarantee)', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const observer = getObserverApi(window);

  let providerCallCount = 0;
  const provider = {
    request() {
      providerCallCount++;
      return Promise.resolve(null);
    },
  };

  await observer.observePolicyApplicability({ provider });
  assert.equal(providerCallCount, 0, 'provider must never be called when policyId is missing');

  providerCallCount = 0;
  await observer.observePolicyApplicability({ policyId: '', provider });
  assert.equal(providerCallCount, 0, 'provider must never be called when policyId is empty');
});

// ---------------------------------------------------------------------------
// Issue 3 — Maximum amount is POLICY_BOUND
// ---------------------------------------------------------------------------

test('maximumRecipientAmountAtomic field is POLICY_BOUND, not MATCH', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider(),
  });

  assert.equal(result.status, 'APPLICABLE');
  const maxField = result.match.executionContract.maximumRecipientAmountAtomic;
  assert.equal(maxField.status, 'POLICY_BOUND', 'maximumRecipientAmountAtomic must be POLICY_BOUND');
  assert.equal(maxField.actual, null, 'actual must be null — not observable on-chain');
  assert.equal(maxField.source, 'POLICY', 'source must be POLICY');
  assert.equal(maxField.reason, null);
});

test('changing policy maximum changes the POLICY_BOUND binding value', async () => {
  // Use a custom policy override with a different maximum
  const customMax = '999999999';
  const customWindow = loadRuntime({
    testMode: true,
    ethersApi: POLICY_HASH_ETHERS,
    includePolicy: false,
    policyOverride: {
      validateGasPolicy() { return { valid: true }; },
      getPolicySecurityPayload() {
        return {
          policyId: 'COIN_CARD_POLYGON_V1',
          chainId: 137,
          token: {
            address: TOKEN_ADDRESS.toLowerCase(),
            runtimeKeccak256: TOKEN_PROXY_RUNTIME_KECCAK,
            implementationSlot: IMPLEMENTATION_SLOT,
            implementationAddress: IMPLEMENTATION_ADDRESS.toLowerCase(),
            implementationRuntimeKeccak256: TOKEN_IMPL_RUNTIME_KECCAK,
            decimals: '6',
            symbol: 'USDC',
          },
          executionContract: {
            address: EXECUTION_ADDRESS.toLowerCase(),
            runtimeKeccak256: EXECUTION_RUNTIME_KECCAK,
            treasuryAddress: TREASURY_ADDRESS.toLowerCase(),
            paused: false,
          },
          amountPolicy: {
            feeBasisPoints: '100',
            minimumRecipientAmountAtomic: '1000000',
            maximumRecipientAmountAtomic: customMax,
            precisionIncrementAtomic: '1000000',
          },
        };
      },
      getCanonicalPolicyBinding() { return '{"policyId":"COIN_CARD_POLYGON_V1"}'; },
    },
  });

  const result = await getObserverApi(customWindow).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider(),
  });

  const maxField = result.match.executionContract.maximumRecipientAmountAtomic;
  assert.equal(maxField.status, 'POLICY_BOUND');
  assert.equal(maxField.expected, customMax, 'expected must reflect the policy value');
  assert.equal(maxField.actual, null);
});

test('observer makes no eth_call for maximum amount', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const provider = makeProvider();

  await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider,
  });

  // There is no contract getter for maximum amount — verify no extra call was made
  // that could be attributed to it (the only eth_calls should be the known 5)
  const ethCalls = provider.calls.filter((c) => c.method === 'eth_call');
  // Known calls: decimals, symbol, treasury, feeBasisPoints, minTransferAmount, transferPrecision, paused = 7
  assert.equal(ethCalls.length, 7, 'exactly 7 eth_call ops: decimals/symbol/treasury/fee/min/precision/paused');
});

test('observer can return APPLICABLE when all runtime-observable fields match', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider(),
  });

  assert.equal(result.status, 'APPLICABLE');
  // Verify maximumRecipientAmountAtomic is never in reasonCodes
  assert.equal(result.reasonCodes.length, 0);
  assert.equal(result.match.executionContract.maximumRecipientAmountAtomic.status, 'POLICY_BOUND');
});

// ---------------------------------------------------------------------------
// Issue 4 — Strict first-block header validation
// ---------------------------------------------------------------------------

test('malformed first block number → UNAVAILABLE OBSERVATION_BLOCK_UNAVAILABLE, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      firstBlockOverride: { number: 'not-hex', hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP },
    }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_UNAVAILABLE');
});

test('first block number different from requested tag → UNAVAILABLE OBSERVATION_BLOCK_UNAVAILABLE, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      // block number in response does not match the requested blockTag
      firstBlockOverride: { number: '0x99', hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP },
    }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_UNAVAILABLE');
});

test('malformed first block hash (short) → UNAVAILABLE OBSERVATION_BLOCK_UNAVAILABLE, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      firstBlockOverride: { number: BLOCK_NUMBER, hash: '0x1234', timestamp: BLOCK_TIMESTAMP },
    }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_UNAVAILABLE');
});

test('malformed first block timestamp → UNAVAILABLE OBSERVATION_BLOCK_UNAVAILABLE, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      firstBlockOverride: { number: BLOCK_NUMBER, hash: BLOCK_HASH, timestamp: 'not-a-hex' },
    }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_UNAVAILABLE');
});

test('final block disappearance → REORGED, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      finalBlockOverride: null,
    }),
  });
  assert.equal(result.status, 'REORGED');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_REORGED');
});

test('final block number change → REORGED, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      finalBlockOverride: { number: '0x99', hash: BLOCK_HASH, timestamp: BLOCK_TIMESTAMP },
    }),
  });
  assert.equal(result.status, 'REORGED');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_REORGED');
});

test('final block hash change → REORGED, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      finalBlockHash: BLOCK_HASH_REORGED,
    }),
  });
  assert.equal(result.status, 'REORGED');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_REORGED');
});

test('final block intrinsically malformed (bad hash format) → UNAVAILABLE, no throw', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({
      finalBlockOverride: { number: BLOCK_NUMBER, hash: 'not-valid', timestamp: BLOCK_TIMESTAMP },
    }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'OBSERVATION_BLOCK_UNAVAILABLE');
});

// ---------------------------------------------------------------------------
// Issue 5 — Empty implementation-runtime classification
// ---------------------------------------------------------------------------

test('empty implementation code (0x) → UNAVAILABLE TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ implementationCode: '0x' }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE');
});

test('malformed implementation code → UNAVAILABLE TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ implementationCode: 'not-hex-at-all' }),
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE');
});

test('provider failure while reading implementation code → UNAVAILABLE TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });

  // Provider returns null for eth_getCode on the implementation address
  const customProvider = makeProvider({
    onRequest({ method, params }) {
      if (method === 'eth_getCode') {
        const addr = String(params[0]).toLowerCase();
        if (addr === IMPLEMENTATION_ADDRESS.toLowerCase()) return null;
      }
    },
  });

  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: customProvider,
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reasonCodes[0], 'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE');
});

test('implementation code present but hash mismatched → MISMATCH TOKEN_IMPLEMENTATION_RUNTIME_MISMATCH', async () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const result = await getObserverApi(window).observePolicyApplicability({
    policyId: 'COIN_CARD_POLYGON_V1',
    provider: makeProvider({ implementationCode: '0x60056000556005600155' }),
  });
  assert.equal(result.status, 'MISMATCH');
  assert.equal(result.reasonCodes.includes('TOKEN_IMPLEMENTATION_RUNTIME_MISMATCH'), true);
});

// ---------------------------------------------------------------------------
// Issue 6 — Real Keccak path test
// ---------------------------------------------------------------------------

test('real Ethers keccak256 of 0xdeadbeef matches known value', () => {
  const knownHash = KNOWN_KECCAK256_DEADBEEF;

  // Bytecode is hashed as bytes, not as a UTF-8 hex string
  const bytesFromHex = ethers.getBytes('0xdeadbeef');
  const hash = ethers.keccak256(bytesFromHex);
  assert.equal(hash, knownHash, 'keccak256(0xdeadbeef) must equal known value');

  // Uppercase and lowercase hex produce the same result
  const bytesUpper = ethers.getBytes('0xDEADBEEF');
  const hashUpper = ethers.keccak256(bytesUpper);
  assert.equal(hashUpper, knownHash, 'uppercase and lowercase hex must produce same Keccak hash');

  // 0x alone (empty code) is rejected by codeIdentity — verify getBytes('0x') returns zero-length
  const emptyBytes = ethers.getBytes('0x');
  assert.equal(emptyBytes.length, 0, '0x decodes to zero-length bytes');
  // codeIdentity explicitly rejects '0x' before calling getBytes
  // Demonstrate that a non-0x string is also invalid for getBytes
  let threw = false;
  try {
    ethers.getBytes('not-hex');
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, true, 'getBytes must throw on non-hex input');

  // Odd-length hex is rejected
  let oddThrew = false;
  try {
    ethers.getBytes('0xdeadbee');
  } catch (e) {
    oddThrew = true;
  }
  assert.equal(oddThrew, true, 'getBytes must throw on odd-length hex');
});

// ---------------------------------------------------------------------------
// Global reason-code audit test
// ---------------------------------------------------------------------------

test('every reason code maps deterministically to MISMATCH, UNAVAILABLE, or REORGED', () => {
  const window = loadRuntime({ testMode: true, ethersApi: POLICY_HASH_ETHERS });
  const api = getObserverApi(window);

  // The observer exposes REASON_STATUS_MAP at the top level
  const map = api.REASON_STATUS_MAP;
  assert.ok(map && typeof map === 'object', 'REASON_STATUS_MAP must be present');

  const validStatuses = new Set(['MISMATCH', 'UNAVAILABLE', 'REORGED']);
  const allCodes = Object.keys(map);
  assert.ok(allCodes.length > 0, 'REASON_STATUS_MAP must not be empty');

  for (const code of allCodes) {
    const status = map[code];
    assert.ok(
      validStatuses.has(status),
      `reason code ${code} maps to unknown status "${status}" — must be MISMATCH, UNAVAILABLE, or REORGED`
    );
  }

  // Verify that every UNAVAILABLE reason in the observer's unavailableReasons list is in the map
  const expectedUnavailable = [
    'POLICY_ID_REQUIRED',
    'POLICY_MODULE_UNAVAILABLE',
    'POLICY_INVALID',
    'KECCAK_UNAVAILABLE',
    'RPC_READ_UNAVAILABLE',
    'OBSERVATION_BLOCK_UNAVAILABLE',
    'TOKEN_RUNTIME_UNAVAILABLE',
    'TOKEN_IMPLEMENTATION_SLOT_UNAVAILABLE',
    'TOKEN_IMPLEMENTATION_RUNTIME_UNAVAILABLE',
    'TOKEN_DECIMALS_UNAVAILABLE',
    'TOKEN_SYMBOL_UNAVAILABLE',
    'EXECUTION_RUNTIME_UNAVAILABLE',
  ];
  for (const code of expectedUnavailable) {
    assert.equal(map[code], 'UNAVAILABLE', `${code} must map to UNAVAILABLE`);
  }

  // Verify known MISMATCH codes
  const expectedMismatch = [
    'CHAIN_ID_MISMATCH',
    'TOKEN_RUNTIME_MISMATCH',
    'TOKEN_IMPLEMENTATION_MISMATCH',
    'TOKEN_IMPLEMENTATION_RUNTIME_MISMATCH',
    'TOKEN_DECIMALS_MISMATCH',
    'TOKEN_SYMBOL_MISMATCH',
    'EXECUTION_RUNTIME_MISMATCH',
    'TREASURY_MISMATCH',
    'FEE_BASIS_POINTS_MISMATCH',
    'MINIMUM_AMOUNT_MISMATCH',
    'TRANSFER_PRECISION_CONFIGURATION_MISMATCH',
    'PAUSED_STATE_MISMATCH',
  ];
  for (const code of expectedMismatch) {
    assert.equal(map[code], 'MISMATCH', `${code} must map to MISMATCH`);
  }

  // Verify known REORGED codes
  assert.equal(map['OBSERVATION_BLOCK_REORGED'], 'REORGED');
});
