const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app-web');
const cardJsPath = path.join(appRoot, 'frontend/public/card/card.js');
const cardIndexPath = path.join(appRoot, 'frontend/public/card/index.html');
const verificationPath = path.join(appRoot, 'frontend/public/card/coin-card-verification.js');
const generatorPath = path.join(appRoot, 'scripts/generate_signed_coin_card_acceptance.js');
const integrityScriptPath = path.join(appRoot, 'scripts/test_coin_card_integrity.js');
const qrBrowserPath = path.join(appRoot, 'tests/browser/coin-card-qr-browser.test.js');

const cardSource = fs.readFileSync(cardJsPath, 'utf8');
const indexHtml = fs.readFileSync(cardIndexPath, 'utf8');
const REVIEW_ASSET = 'card/coin-card-review-projection-contract.js';

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error && error.stack || error);
      process.exitCode = 1;
    });
}

function makeElement(id) {
  const listeners = {};
  return {
    id,
    dataset: {},
    style: {},
    textContent: '',
    title: '',
    href: '',
    className: '',
    disabled: false,
    attributes: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
      toggle(value, enabled) {
        if (enabled) this.values.add(value);
        else this.values.delete(value);
      },
    },
    addEventListener(type, handler) { listeners[type] = handler; },
    dispatch(type, event) { if (listeners[type]) listeners[type](event || {}); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    focus() {},
  };
}

function makeProvider(options = {}) {
  const listeners = {};
  const calls = [];
  const provider = {
    request({ method }) {
      calls.push(method);
      if (method === 'eth_accounts') return Promise.resolve([options.account || '0x1111111111111111111111111111111111111111']);
      if (method === 'eth_chainId') return Promise.resolve(options.chainHex || '0x89');
      if (method === 'eth_getBalance') {
        if (options.gasReject) return Promise.reject(new Error('gas failed'));
        return Promise.resolve(options.gasHex || '0xde0b6b3a7640000');
      }
      if (method === 'eth_sendTransaction') return Promise.reject(new Error('must not write'));
      return Promise.resolve('0x0');
    },
    on(type, handler) { listeners[type] = handler; },
    emit(type, value) { if (listeners[type]) listeners[type](value); },
    calls,
    listeners,
  };
  return provider;
}

function loadCardRuntime(overrides = {}) {
  const elements = new Map();
  const documentListeners = {};
  const document = {
    readyState: 'loading',
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    addEventListener(type, handler) { documentListeners[type] = handler; },
  };
  const window = {
    document,
    location: { pathname: '/card/cc_demo_implicitex' },
    parent: null,
    addEventListener() {},
    IX_EXECUTION: overrides.execution || {
      calculateFee(rawAmount, chainId, feeBps) {
        const bps = BigInt(feeBps == null ? 100 : feeBps);
        const fee = (BigInt(rawAmount) * bps) / 10000n;
        return { fee, total: BigInt(rawAmount) + fee };
      },
      getChainParams() {
        return Object.freeze({
          usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          contractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
        });
      },
      estimateNativeGasRequirement() {
        return Promise.resolve(Object.freeze({
          status: 'AVAILABLE',
          transactionCount: 2,
          gasLimitTotal: '42000',
          feePerGasAtomic: '1000000000',
          nativeGasRequiredAtomic: '42000000000000',
        }));
      },
      readWalletSnapshot() {
        return Promise.resolve({
          account: '0x1111111111111111111111111111111111111111',
          chainId: 137,
          providerReady: true,
          balanceAtomic: '10000000',
          allowanceAtomic: '0',
        });
      },
    },
    IX_COIN_CARD_LIFECYCLE_PRESENTATION: overrides.presentationApi || {},
    IX_COIN_CARD_LIFECYCLE_RESOLUTION: overrides.lifecycleResolutionApi || {},
    IX_COIN_CARD_EXECUTION_AUTHORIZATION: overrides.authorizationApi || {},
    IX_COIN_CARD_REVIEW_PROJECTION_CONTRACT: overrides.reviewContract,
  };
  window.window = window;
  window.parent = window;
  const context = vm.createContext({
    window,
    document,
    console,
    Promise,
    BigInt,
    Number,
    String,
    Object,
    Error,
    RegExp,
    WeakMap,
    WeakSet,
    Set,
    Map,
    parseInt,
    isFinite,
  });
  let source = cardSource;
  if (overrides.exposeInternals) {
    source = source.replace(/\n\}\)\(\);\s*$/, `
  window.__CC_TEST_INTERNALS = Object.freeze({
    normalizeChainId: normalizeChainId,
    noteProvider: noteProvider,
    noteAccount: noteAccount,
    noteChain: noteChain,
    runLifecyclePipeline: runLifecyclePipeline,
    readCompleteWalletObservation: readCompleteWalletObservation,
    getPrivateStateSnapshot: function () {
      return {
        resolvedLifecycleResult: state.resolvedLifecycleResult,
        promotedPresentationResult: state.promotedPresentationResult
      };
    },
    setActiveProviderForTest: function (provider) {
      state.activeProvider = provider;
      return noteProvider(provider);
    },
    setDraftForTest: function (amountText) {
      state.registryRecord = {
        cardId: 'cc_demo_implicitex',
        displayName: 'Demo Card',
        recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
        chainId: 137,
        token: 'USDC',
        feeBps: 100
      };
      state.manifestId = 'manifest-001';
      return commitDraftFromInput(amountText || '2.00');
    },
    clearActiveProviderForTest: function () {
      state.activeProvider = null;
    }
  });
})();
`);
  }
  vm.runInContext(source, context, { filename: cardJsPath });
  return { window, document, elements, documentListeners };
}

function makeReviewContract(assertDeps) {
  return {
    createReviewProjectionRuntime(deps) {
      if (assertDeps) assertDeps(deps);
      return Object.freeze({ reviewRuntime: true });
    },
  };
}

test('review projection asset is protected and loaded before card.js', () => {
  [
    generatorPath,
    verificationPath,
    integrityScriptPath,
    qrBrowserPath,
  ].forEach((filePath) => {
    assert.match(fs.readFileSync(filePath, 'utf8'), new RegExp(REVIEW_ASSET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  const reviewScript = 'coin-card-review-projection-contract.js';
  const reviewPos = indexHtml.indexOf(reviewScript);
  const verificationPos = indexHtml.indexOf('coin-card-verification.js');
  const cardPos = indexHtml.indexOf('card.js');
  assert(reviewPos !== -1, 'review contract script is present');
  assert(reviewPos < verificationPos, 'review contract loads before verification runtime');
  assert(reviewPos < cardPos, 'review contract loads before card.js');
});

test('dependency-bound review runtime initializes from canonical globals', () => {
  const presentationApi = { name: 'presentation' };
  const lifecycleResolutionApi = { name: 'resolution' };
  const authorizationApi = { name: 'authorization' };
  const runtime = loadCardRuntime({
    presentationApi,
    lifecycleResolutionApi,
    authorizationApi,
    reviewContract: makeReviewContract((deps) => {
      assert.equal(deps.presentationApi, presentationApi);
      assert.equal(deps.lifecycleResolutionApi, lifecycleResolutionApi);
      assert.equal(deps.authorizationApi, authorizationApi);
    }),
  });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  assert.equal(api.initializeReviewRuntime().reviewRuntime, true);
  assert.equal(api.getStateSnapshot().reviewRuntimeReady, true);
});

test('missing review runtime dependency fails closed before authorization', () => {
  const runtime = loadCardRuntime({ reviewContract: null });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  api.initializeReviewRuntime();
  const snapshot = api.getStateSnapshot();
  assert.equal(snapshot.reviewRuntimeReady, false);
  assert.match(snapshot.reviewRuntimeError, /Review projection contract unavailable/);
  const reviewCheck = cardSource.indexOf('if (!state.reviewRuntime)');
  const authorizeCall = cardSource.indexOf('authModule.authorizeExecution');
  assert(reviewCheck !== -1 && authorizeCall !== -1 && reviewCheck < authorizeCall);
});

test('decimal strings convert to deterministic atomic values without float syntax', () => {
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract() });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  assert.equal(api.parseUsdcAtomicString('1'), '1000000');
  assert.equal(api.parseUsdcAtomicString('1.00'), '1000000');
  assert.equal(api.parseUsdcAtomicString('1.000001'), '1000001');
  assert.equal(api.parseUsdcAtomicString('250.00'), '250000000');
  assert.throws(() => api.parseUsdcAtomicString('1.0000001'), /Invalid USDC/);
  assert.throws(() => api.parseUsdcAtomicString('1e3'), /Invalid USDC/);
  assert.throws(() => api.parseUsdcAtomicString('-1'), /Invalid USDC/);
  assert.throws(() => api.parseUsdcAtomicString('1,00'), /Invalid USDC/);
  const prepared = api.prepareContractDraftAmounts('2.00', 137, 100);
  assert.equal(prepared.recipientAmountAtomic, '2000000');
  assert.equal(prepared.platformFeeAtomic, '20000');
  assert.equal(prepared.totalDebitAtomic, '2020000');
  assert.equal(
    BigInt(prepared.recipientAmountAtomic) + BigInt(prepared.platformFeeAtomic),
    BigInt(prepared.totalDebitAtomic)
  );
  assert.deepEqual(api.prepareContractDraftAmounts('2.00', 137, 100), prepared);
});

test('chain IDs normalize only from safe positive integer evidence', () => {
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract(), exposeInternals: true });
  const normalizeChainId = runtime.window.__CC_TEST_INTERNALS.normalizeChainId;
  assert.equal(normalizeChainId(137), 137);
  assert.equal(normalizeChainId('137'), 137);
  assert.equal(normalizeChainId('0x89'), 137);
  assert.equal(normalizeChainId(0), null);
  assert.equal(normalizeChainId('0'), null);
  assert.equal(normalizeChainId(-1), null);
  assert.equal(normalizeChainId('-1'), null);
  assert.equal(normalizeChainId(1.5), null);
  assert.equal(normalizeChainId('0xzz'), null);
  assert.equal(normalizeChainId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(normalizeChainId(String(BigInt(Number.MAX_SAFE_INTEGER) + 1n)), null);
  assert.equal(normalizeChainId('0x20000000000000'), null);
});

test('contract draft preparation rejects unsupported chain policy before fee calculation', () => {
  let feeCalls = 0;
  const runtime = loadCardRuntime({
    reviewContract: makeReviewContract(),
    execution: {
      calculateFee(rawAmount, chainId, feeBps) {
        feeCalls += 1;
        const bps = BigInt(feeBps == null ? 100 : feeBps);
        const fee = (BigInt(rawAmount) * bps) / 10000n;
        return { fee, total: BigInt(rawAmount) + fee };
      },
      readWalletSnapshot() {
        return Promise.resolve({ balanceAtomic: '10000000', allowanceAtomic: '0' });
      },
    },
  });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  assert.equal(api.prepareContractDraftAmounts('2.00', 137, 100).totalDebitAtomic, '2020000');
  assert.equal(feeCalls, 1);
  assert.throws(() => api.prepareContractDraftAmounts('2.00', 999999, 100), /Unsupported chain policy/);
  assert.equal(feeCalls, 1, 'unsupported chain does not calculate fee');
  Object.prototype[999999] = 1;
  try {
    assert.throws(() => api.prepareContractDraftAmounts('2.00', 999999, 100), /Unsupported chain policy/);
    assert.equal(feeCalls, 1, 'prototype chain does not provide policy');
  } finally {
    delete Object.prototype[999999];
  }
});

test('production prerequisite global exposes no continuity mutators', () => {
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract() });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  assert.equal(typeof api.noteProvider, 'undefined');
  assert.equal(typeof api.noteAccount, 'undefined');
  assert.equal(typeof api.noteChain, 'undefined');
  assert.equal(typeof api.getProviderReference, 'undefined');
  assert.equal(typeof api.readCompleteWalletObservation, 'undefined');
});

test('production diagnostic snapshot does not expose branded authority objects', async () => {
  const resolvedResult = Object.freeze({
    outcome: 'LIFECYCLE_ACTIVE',
    cardId: 'cc_demo_implicitex',
    resolvedManifestId: 'manifest-a',
    resolvedRevision: '1',
    resolvedRecordId: 'record-a',
    registryId: 'registry-a',
    registryVersion: 'v1',
  });
  const promotedResult = Object.freeze({ promoted: true });
  const runtime = loadCardRuntime({
    reviewContract: makeReviewContract(),
    exposeInternals: true,
  });
  runtime.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION = {
    authenticateLifecycleRegistryBundle() {
      return Promise.resolve(Object.freeze({ authenticated: true }));
    },
  };
  runtime.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION = {
    selectLifecycleEvidence() {
      return Object.freeze({ selected: true });
    },
  };
  runtime.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION = {
    resolveLifecycle() {
      return resolvedResult;
    },
    isResolvedLifecycleResult(value) {
      return value === resolvedResult;
    },
  };
  runtime.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION = {
    promotePresentation(value) {
      assert.equal(value, resolvedResult);
      return promotedResult;
    },
    isPromotedPresentationResult(value) {
      return value === promotedResult;
    },
  };
  runtime.window.__CC_TEST_INTERNALS.runLifecyclePipeline({ cardId: 'cc_demo_implicitex' });
  await Promise.resolve();
  await Promise.resolve();
  const snapshot = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES.getStateSnapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'resolvedLifecycleResult'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'promotedPresentationResult'), false);
  assert.equal(snapshot.resolvedLifecycleReady, true);
  assert.equal(snapshot.promotedPresentationReady, true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.lifecycleReference)), {
    status: 'ACTIVE',
    cardId: 'cc_demo_implicitex',
    manifestId: 'manifest-a',
    revision: '1',
    recordId: 'record-a',
    registryId: 'registry-a',
    registryVersion: 'v1',
  });
  assert.equal(runtime.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION.isResolvedLifecycleResult(snapshot), false);
  assert.equal(runtime.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION.isPromotedPresentationResult(snapshot), false);
  const privateState = runtime.window.__CC_TEST_INTERNALS.getPrivateStateSnapshot();
  assert.equal(privateState.resolvedLifecycleResult, resolvedResult);
  assert.equal(privateState.promotedPresentationResult, promotedResult);
});

test('provider, account, and chain generations track only active-provider evidence', () => {
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract(), exposeInternals: true });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  const internals = runtime.window.__CC_TEST_INTERNALS;
  const p1 = makeProvider();
  const p2 = makeProvider();
  assert.equal(internals.setActiveProviderForTest(p1), 'provider:session:1');
  assert.equal(internals.setActiveProviderForTest(p1), 'provider:session:1');
  assert.equal(api.getStateSnapshot().providerGeneration, 1);
  internals.noteAccount('0x1111111111111111111111111111111111111111');
  internals.noteChain(137);
  assert.equal(api.getStateSnapshot().accountGeneration, 1);
  assert.equal(api.getStateSnapshot().chainGeneration, 1);

  assert.equal(internals.setActiveProviderForTest(p2), 'provider:session:2');
  assert.equal(api.getStateSnapshot().providerGeneration, 2);
  p1.emit('accountsChanged', ['0x3333333333333333333333333333333333333333']);
  p1.emit('chainChanged', '0x2a');
  assert.equal(api.getStateSnapshot().accountGeneration, 1, 'inactive provider account event ignored');
  assert.equal(api.getStateSnapshot().chainGeneration, 1, 'inactive provider chain event ignored');

  p2.emit('accountsChanged', ['0x2222222222222222222222222222222222222222']);
  assert.equal(api.getStateSnapshot().accountGeneration, 2);
  p2.emit('chainChanged', '0x1');
  assert.equal(api.getStateSnapshot().chainGeneration, 2);
  const listenerCount = Object.keys(p2.listeners).length;
  internals.setActiveProviderForTest(p2);
  assert.equal(Object.keys(p2.listeners).length, listenerCount, 'listeners are not duplicated');
  assert.equal(internals.setActiveProviderForTest(p1), 'provider:session:1');
  assert.equal(api.getStateSnapshot().providerGeneration, 3, 'switching back is explicit provider transition');
});

test('card required chain does not masquerade as observed wallet chain', async () => {
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract(), exposeInternals: true });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  const internals = runtime.window.__CC_TEST_INTERNALS;
  const provider = makeProvider({ chainHex: '0x89' });
  internals.setActiveProviderForTest(provider);
  internals.setDraftForTest('2.00');
  assert.equal(api.getStateSnapshot().observedChainId, null);
  assert.equal(api.getStateSnapshot().chainGeneration, 0);
  api.prepareContractDraftAmounts('2.00', 1, 100);
  assert.equal(api.getStateSnapshot().observedChainId, null, 'required chain input does not set observed chain');
  const observation = await internals.readCompleteWalletObservation(provider);
  assert.equal(observation.walletObservation.observedChainId, 137);
  assert.equal(api.getStateSnapshot().observedChainId, 137);
  provider.emit('chainChanged', '0x1');
  assert.equal(api.getStateSnapshot().observedChainId, 1);
});

test('complete wallet observation gathers read-only evidence and fails closed on gas policy', async () => {
  const provider = makeProvider();
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract(), exposeInternals: true });
  const internals = runtime.window.__CC_TEST_INTERNALS;
  internals.setActiveProviderForTest(provider);
  internals.setDraftForTest('2.00');
  const result = await internals.readCompleteWalletObservation(provider);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.reason, null);
  assert.equal(result.walletObservation.senderAddress, '0x1111111111111111111111111111111111111111');
  assert.equal(result.walletObservation.observedChainId, 137);
  assert.equal(result.walletObservation.tokenBalanceAtomic, '10000000');
  assert.equal(result.walletObservation.allowanceAtomic, '0');
  assert.equal(result.walletObservation.nativeGasBalanceAtomic, '1000000000000000000');
  assert.equal(result.walletObservation.gasReadiness, 'SUFFICIENT');
  assert.equal(result.walletObservation.providerReference, 'provider:session:1');
  assert(!provider.calls.includes('eth_sendTransaction'), 'adapter performs no wallet write');
});

test('native gas read failure is distinct from unavailable gas policy', async () => {
  const provider = makeProvider({ gasReject: true });
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract(), exposeInternals: true });
  const internals = runtime.window.__CC_TEST_INTERNALS;
  internals.setActiveProviderForTest(provider);
  internals.setDraftForTest('2.00');
  const result = await internals.readCompleteWalletObservation(provider);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.reason, 'native-gas-balance-unavailable');
  assert.equal(result.walletObservation.gasReadiness, 'UNAVAILABLE');
  assert.equal(result.walletObservation.nativeGasBalanceAtomic, null);
});

test('wallet observation fails closed when required read evidence is missing', async () => {
  const missingBalanceRuntime = loadCardRuntime({
    reviewContract: makeReviewContract(),
    exposeInternals: true,
    execution: {
      calculateFee(rawAmount) { return { fee: 0n, total: BigInt(rawAmount) }; },
      getChainParams() {
        return Object.freeze({
          usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          contractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
        });
      },
      estimateNativeGasRequirement() {
        return Promise.resolve(Object.freeze({ status: 'AVAILABLE', nativeGasRequiredAtomic: '1', transactionCount: 1 }));
      },
      readWalletSnapshot() {
        return Promise.resolve({ allowanceAtomic: '0' });
      },
    },
  });
  const missingBalanceProvider = makeProvider();
  missingBalanceRuntime.window.__CC_TEST_INTERNALS.setActiveProviderForTest(missingBalanceProvider);
  missingBalanceRuntime.window.__CC_TEST_INTERNALS.setDraftForTest('2.00');
  const missingBalance = await missingBalanceRuntime.window.__CC_TEST_INTERNALS
    .readCompleteWalletObservation(missingBalanceProvider);
  assert.equal(missingBalance.status, 'UNAVAILABLE');
  assert.equal(missingBalance.reason, 'token-balance-unavailable');

  const missingAllowanceRuntime = loadCardRuntime({
    reviewContract: makeReviewContract(),
    exposeInternals: true,
    execution: {
      calculateFee(rawAmount) { return { fee: 0n, total: BigInt(rawAmount) }; },
      getChainParams() {
        return Object.freeze({
          usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          contractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
        });
      },
      estimateNativeGasRequirement() {
        return Promise.resolve(Object.freeze({ status: 'AVAILABLE', nativeGasRequiredAtomic: '1', transactionCount: 1 }));
      },
      readWalletSnapshot() {
        return Promise.resolve({ balanceAtomic: '10000000' });
      },
    },
  });
  const missingAllowanceProvider = makeProvider({ gasReject: true });
  missingAllowanceRuntime.window.__CC_TEST_INTERNALS.setActiveProviderForTest(missingAllowanceProvider);
  missingAllowanceRuntime.window.__CC_TEST_INTERNALS.setDraftForTest('2.00');
  const missingAllowance = await missingAllowanceRuntime.window.__CC_TEST_INTERNALS
    .readCompleteWalletObservation(missingAllowanceProvider);
  assert.equal(missingAllowance.status, 'UNAVAILABLE');
  assert.equal(missingAllowance.reason, 'allowance-unavailable');
});

test('wallet observation requires the active provider and mismatch does not mutate continuity', async () => {
  const runtime = loadCardRuntime({ reviewContract: makeReviewContract(), exposeInternals: true });
  const api = runtime.window.IX_COIN_CARD_RUNTIME_PREREQUISITES;
  const internals = runtime.window.__CC_TEST_INTERNALS;
  const p1 = makeProvider();
  const p2 = makeProvider();
  let result = await internals.readCompleteWalletObservation();
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason, 'provider-unavailable');
  internals.setActiveProviderForTest(p1);
  internals.setDraftForTest('2.00');
  const before = api.getStateSnapshot();
  result = await internals.readCompleteWalletObservation(p2);
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason, 'provider-mismatch');
  const after = api.getStateSnapshot();
  assert.equal(after.providerGeneration, before.providerGeneration);
  assert.equal(after.accountGeneration, before.accountGeneration);
  assert.equal(after.chainGeneration, before.chainGeneration);
  result = await internals.readCompleteWalletObservation(p1);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.reason, null);
});

/* ----------------------------------------------------------------
 * Gas-policy load-order assertions (Step 4 of D2A correction)
 * ---------------------------------------------------------------- */

test('ix-execution-gas-policy.js is present in index.html', () => {
  assert.match(indexHtml, /ix-execution-gas-policy\.js/, 'gas-policy script tag must exist');
});

test('ix-execution-gas-policy.js loads before ix-execution.js in index.html', () => {
  const gasPolicyPos = indexHtml.indexOf('ix-execution-gas-policy.js');
  const executionPos = indexHtml.indexOf('ix-execution.js');
  assert(gasPolicyPos !== -1, 'gas-policy script must be present');
  assert(executionPos !== -1, 'ix-execution.js must be present');
  assert(
    gasPolicyPos < executionPos,
    'ix-execution-gas-policy.js must appear before ix-execution.js'
  );
});

test('card.js defines COIN_CARD_GAS_POLICY_ID as the canonical policy binding constant', () => {
  assert.match(
    cardSource,
    /COIN_CARD_GAS_POLICY_ID\s*=\s*['"]COIN_CARD_POLYGON_V1['"]/,
    'card must define COIN_CARD_GAS_POLICY_ID = "COIN_CARD_POLYGON_V1"'
  );
  /* Must be in the constants section, not inside a function body */
  const constantsSection = cardSource.indexOf('COIN_CARD_GAS_POLICY_ID');
  const firstFunctionPos = cardSource.search(/^\s+function\s+/m);
  assert(constantsSection !== -1, 'constant must be defined');
  assert(constantsSection < firstFunctionPos, 'constant must be at module scope before function definitions');
});

test('card.js passes COIN_CARD_GAS_POLICY_ID as gasPolicyId to executeTransfer', () => {
  assert.match(
    cardSource,
    /gasPolicyId\s*:\s*COIN_CARD_GAS_POLICY_ID/,
    'executeTransfer call must include gasPolicyId: COIN_CARD_GAS_POLICY_ID'
  );
});

test('card.js contains fail-closed guard for IX_EXECUTION_GAS_POLICY before executeTransfer', () => {
  /* Verify the guard appears in card.js and is positioned before the executeTransfer call */
  const guardPos = cardSource.indexOf('IX_EXECUTION_GAS_POLICY');
  const executeTransferPos = cardSource.indexOf("window.IX_EXECUTION.executeTransfer({");
  /* Find the last occurrence of executeTransfer call (the execute-authorized one in executeBoundAttempt) */
  let lastExecPos = -1;
  let searchFrom = 0;
  while (true) {
    const pos = cardSource.indexOf("window.IX_EXECUTION.executeTransfer({", searchFrom);
    if (pos === -1) break;
    lastExecPos = pos;
    searchFrom = pos + 1;
  }
  assert(guardPos !== -1, 'IX_EXECUTION_GAS_POLICY guard must be present in card.js');
  assert(lastExecPos !== -1, 'executeTransfer call must be present');
  assert(guardPos < lastExecPos, 'gas-policy guard must appear before executeTransfer call');
});

process.on('beforeExit', () => {
  if (process.exitCode) return;
  console.log('Coin Card review runtime prerequisite checks passed.');
});
