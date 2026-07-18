const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app-web');
const cardJsPath = path.join(appRoot, 'frontend/public/card/card.js');
const indexHtmlPath = path.join(appRoot, 'frontend/public/card/index.html');
const gasPolicyPath = path.join(appRoot, 'frontend/public/js/ix-execution-gas-policy.js');
const executionJsPath = path.join(appRoot, 'frontend/public/js/ix-execution.js');
const reviewContractPath = path.join(appRoot, 'frontend/public/card/coin-card-review-projection-contract.js');
const authPath = path.join(appRoot, 'frontend/public/card/coin-card-execution-authorization.js');

const cardSource = fs.readFileSync(cardJsPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const gasPolicySource = fs.readFileSync(gasPolicyPath, 'utf8');
const reviewContractSource = fs.readFileSync(reviewContractPath, 'utf8');
const authSource = fs.readFileSync(authPath, 'utf8');

/* Canonical Coin Card policy ID — must match POLICY_ID in ix-execution-gas-policy.js */
const COIN_CARD_GAS_POLICY_ID = 'COIN_CARD_POLYGON_V1';

/* Minimal gas-policy mock that satisfies the card's fail-closed guard */
function makeMockGasPolicy(options = {}) {
  if (options.absent) return null;
  const policyIds = options.missingPolicyIds
    ? undefined
    : Object.freeze({ COIN_CARD_POLYGON_V1: options.malformedPolicyId ? '' : COIN_CARD_GAS_POLICY_ID });
  return {
    POLICY_IDS: policyIds,
    resolveGasPolicy(id) {
      if (options.unknown || id !== COIN_CARD_GAS_POLICY_ID) return null;
      return { security: { policyId: COIN_CARD_GAS_POLICY_ID, amountPolicy: { feeBasisPoints: '100' } } };
    },
    validateGasPolicy(id) {
      if (options.unknown || id !== COIN_CARD_GAS_POLICY_ID) return { valid: false, errors: ['unknown policy'] };
      return { valid: true, errors: [] };
    },
    getPolicySecurityPayload(id) {
      if (options.unknown || id !== COIN_CARD_GAS_POLICY_ID) return null;
      return { policyId: COIN_CARD_GAS_POLICY_ID, amountPolicy: { feeBasisPoints: '100' } };
    },
    getCanonicalPolicyBinding(id) {
      if (options.unknown || id !== COIN_CARD_GAS_POLICY_ID) return null;
      return '{"policyId":"COIN_CARD_POLYGON_V1"}';
    },
    getGasLimit() { return null; },
    validateExecutionDomain() { return { ok: true }; },
  };
}
const pendingTests = [];

function test(name, fn) {
  const pending = Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error && error.stack || error);
      process.exitCode = 1;
    });
  pendingTests.push(pending);
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
      toggle(value, enabled) { enabled ? this.values.add(value) : this.values.delete(value); },
    },
    addEventListener(type, handler) { listeners[type] = handler; },
    click() { if (listeners.click) listeners.click({}); },
    dispatch(type, event) { if (listeners[type]) listeners[type](event || {}); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    focus() {},
  };
}

function makeProvider(options = {}) {
  const calls = [];
  const provider = {
    calls,
    request({ method, params }) {
      calls.push({ method, params });
      if (method === 'eth_accounts') return Promise.resolve([options.account || '0x1111111111111111111111111111111111111111']);
      if (method === 'eth_chainId') return Promise.resolve(options.chainHex || '0x89');
      if (method === 'eth_getBalance') {
        if (options.balanceReject) return Promise.reject(new Error('balance unavailable'));
        return Promise.resolve(options.nativeBalanceHex || '0xde0b6b3a7640000');
      }
      if (method === 'eth_gasPrice') {
        if (options.gasPriceReject) return Promise.reject(new Error('fee unavailable'));
        return Promise.resolve(options.gasPriceHex || '0x3b9aca00');
      }
      if (method === 'eth_maxPriorityFeePerGas') {
        if (options.maxPriorityReject) return Promise.reject(new Error('priority fee unavailable'));
        return Promise.resolve(options.maxPriorityFeeHex || '0x3b9aca00');
      }
      if (method === 'eth_getBlockByNumber') {
        if (options.blockReject) return Promise.reject(new Error('block unavailable'));
        return Promise.resolve({ baseFeePerGas: options.baseFeeHex || '0x3b9aca00' });
      }
      if (method === 'eth_estimateGas') {
        if (options.estimateReject) return Promise.reject(new Error('estimate unavailable'));
        return Promise.resolve(options.estimateHex || '0x5208');
      }
      if (method === 'eth_sendTransaction') {
        if (options.rejectSend) {
          const err = new Error('rejected');
          err.code = 4001;
          return Promise.reject(err);
        }
        return Promise.resolve(options.txHash || '0x' + 'a'.repeat(64));
      }
      if (method === 'eth_getTransactionReceipt') {
        return Promise.resolve({ status: '0x1', transactionHash: options.txHash || '0x' + 'a'.repeat(64), blockNumber: '0x1' });
      }
      return Promise.resolve('0x0');
    },
    on() {},
  };
  return provider;
}

function loadRuntime(options = {}) {
  const elements = new Map();
  const document = {
    readyState: 'loading',
    head: { appendChild() {} },
    createElement() { return makeElement('created'); },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    addEventListener() {},
  };
  const promotedSet = new WeakSet();
  const resolvedSet = new WeakSet();
  const resolved = Object.freeze({
    fact: 'RESOLVED',
    outcome: 'LIFECYCLE_ACTIVE',
    cardId: 'cc_demo_implicitex',
    requestedManifestId: 'manifest-001',
    resolvedManifestId: 'manifest-001',
    resolvedRevision: '1',
    resolvedRecordId: 'record-001',
    registryId: 'implicitex-production',
    registryVersion: 1,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
  });
  resolvedSet.add(resolved);
  const promoted = Object.freeze({
    outcome: 'PRESENTATION_PROMOTED',
    presentationEligible: true,
    executionEligible: false,
  });
  promotedSet.add(promoted);
  const provider = options.provider || makeProvider();
  let executionAttempt = null;
  let executeTransferCalls = 0;
  const window = {
    document,
    location: { pathname: '/card/cc_demo_implicitex', origin: 'https://example.test' },
    parent: null,
    addEventListener() {},
    IX_COIN_CARD_LIFECYCLE_PRESENTATION: {
      promotePresentation(value) {
        if (value !== resolved) throw new Error('wrong resolved result');
        return promoted;
      },
      isPromotedPresentationResult(value) { return promotedSet.has(value); },
    },
    IX_COIN_CARD_LIFECYCLE_RESOLUTION: {
      isResolvedLifecycleResult(value) { return resolvedSet.has(value); },
    },
    IX_COIN_CARD_VERIFICATION: {
      canExecuteTransfer(state) { return state === 'VERIFIED'; },
    },
    IX_EXECUTION: {
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
      readWalletSnapshot() {
        options.walletSnapshotReads = (options.walletSnapshotReads || 0) + 1;
        return Promise.resolve(Object.freeze({
          account: options.account || '0x1111111111111111111111111111111111111111',
          chainId: 137,
          providerReady: true,
          balanceAtomic: options.tokenBalanceAtomic || '10000000',
          allowanceAtomic: options.allowanceAtomic || '0',
        }));
      },
      estimateNativeGasRequirement() {
        options.gasEstimateReads = (options.gasEstimateReads || 0) + 1;
        if (options.deferGasEstimate) return options.deferGasEstimate;
        if (options.gasStatus === 'UNAVAILABLE') return Promise.resolve(Object.freeze({ status: 'UNAVAILABLE', reason: 'test-unavailable' }));
        return Promise.resolve(Object.freeze({
          status: 'AVAILABLE',
          transactionCount: options.transactionCount || 2,
          gasLimitTotal: '42000',
          feePerGasAtomic: '1000000000',
          nativeGasRequiredAtomic: options.nativeRequiredAtomic || '42000000000000',
        }));
      },
      executeTransfer(request, hooks) {
        executionAttempt = request.authorizationProof;
        executeTransferCalls += 1;
        if (typeof options.onExecuteTransfer === 'function') options.onExecuteTransfer(request);
        if (Array.isArray(options.executeStatuses) && options.executeStatuses.length) {
          const status = options.executeStatuses.shift();
          if (status === 'wallet-rejected') return Promise.resolve({ status: 'wallet-rejected' });
          if (status === 'wallet-busy') return Promise.resolve({ status: 'wallet-busy' });
          if (status === 'failed') return Promise.resolve({ status: 'failed', error: new Error('pre-broadcast failure') });
        }
        if (options.executeRejects) return Promise.resolve({ status: 'wallet-rejected' });
        if (hooks && hooks.onTransferSubmitted) hooks.onTransferSubmitted('0x' + 'a'.repeat(64));
        return Promise.resolve({
          status: 'confirmed',
          receipt: { txHash: '0x' + 'a'.repeat(64), explorerUrl: 'https://polygonscan.com/tx/0xaaa' },
        });
      },
    },
    IX_EXECUTION_GAS_POLICY: options.gasPolicy !== undefined
      ? options.gasPolicy
      : makeMockGasPolicy(options.gasPolicyOptions || {}),
    ethereum: provider,
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
    Error,
    RegExp,
    WeakMap,
    WeakSet,
    Set,
    Map,
    Date,
    parseInt,
    isFinite,
  });
  vm.runInContext(reviewContractSource, context, { filename: reviewContractPath });
  window.IX_COIN_CARD_REVIEW_PROJECTION_CONTRACT = context.IX_COIN_CARD_REVIEW_PROJECTION_CONTRACT;
  vm.runInContext(authSource, context, { filename: authPath });
  let source = cardSource.replace(/\n\}\)\(\);\s*$/, `
  window.__VISIBLE_REVIEW_TEST__ = Object.freeze({
    setRegistry: function () {
      state.registryRecord = {
        cardId: 'cc_demo_implicitex',
        displayName: 'Demo Card',
        recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
        chainId: 137,
        token: 'USDC',
        feeBps: 100
      };
      state.manifestId = 'manifest-001';
      state.integrityManifestVerificationState = 'VERIFIED';
      renderTrust(state.registryRecord);
      transition('CONFIGURE');
    },
    setAuthority: function () {
      state.resolvedLifecycleResult = window.__TEST_RESOLVED__;
      state.promotedPresentationResult = window.__TEST_PROMOTED__;
      state.lifecycleReference = {
        status: 'ACTIVE',
        cardId: 'cc_demo_implicitex',
        manifestId: 'manifest-001',
        revision: '1',
        recordId: 'record-001',
        registryId: 'implicitex-production',
        registryVersion: 1
      };
    },
    setProvider: function (provider) {
      state.activeProvider = provider;
      noteProvider(provider);
      noteAccount('0x1111111111111111111111111111111111111111');
      noteChain(137);
    },
    noteAccountForTest: noteAccount,
    noteChainForTest: noteChain,
    replaceAuthorityForTest: function (which) {
      if (which === 'lifecycle') state.resolvedLifecycleResult = Object.freeze(Object.assign({}, state.resolvedLifecycleResult, { resolvedRevision: String(Date.now()) }));
      if (which === 'presentation') state.promotedPresentationResult = Object.freeze(Object.assign({}, state.promotedPresentationResult));
    },
    replaceReviewForTest: function () { state.reviewRecord = null; },
    inputAmount: commitDraftFromInput,
    enterReview: enterReview,
    startExecution: startExecution,
    executeBoundAttempt: executeBoundAttempt,
    editPayment: editPayment,
    handleChipClick: handleChipClick,
    projection: renderInteractionProjection,
    applyProjection: applyInteractionProjection,
    clearReviewRuntime: function () { state.reviewRuntime = null; },
    setCurrentForTest: function (value) { transition(value); },
    state: function () {
      return {
        current: state.current,
        draft: state.draft,
        reviewRecord: state.reviewRecord,
        reviewEligibility: state.reviewEligibility,
        currentWalletObservation: state.currentWalletObservation,
        currentEvidenceState: state.currentEvidenceState,
        authorizationInputBundle: state.authorizationInputBundle,
        executionAttemptBinding: state.executionAttemptBinding,
        activeExecutionAttempt: state.activeExecutionAttempt,
        interactionActions: state.interactionActions,
        operationInFlight: state.operationInFlight,
        lastReviewBlockReason: state.lastReviewBlockReason,
        cardError: document.getElementById('ccCardError').textContent,
        reviewRuntimeReady: !!state.reviewRuntime,
        authorityReady: !!state.resolvedLifecycleResult && !!state.promotedPresentationResult && !!state.lifecycleReference,
        chipDisabled: document.getElementById('ccChip').disabled,
        chipLabel: document.getElementById('ccChip').getAttribute('aria-label'),
        editDisabled: document.getElementById('ccEditPayment').disabled
      };
    },
    isReviewRecord: function (value) { return state.reviewRuntime.isReviewRecord(value); },
    isExecutionAttemptBinding: function (value) { return state.reviewRuntime.isExecutionAttemptBinding(value); }
  });
})();
`);
  window.__TEST_RESOLVED__ = resolved;
  window.__TEST_PROMOTED__ = promoted;
  vm.runInContext(source, context, { filename: cardJsPath });
  window.IX_COIN_CARD_RUNTIME_PREREQUISITES.initializeReviewRuntime();
  const api = window.__VISIBLE_REVIEW_TEST__;
  api.setRegistry();
  api.setAuthority();
  api.setProvider(provider);
  return { window, document, elements, provider, options, api, getExecutionAttempt: () => executionAttempt, getExecuteTransferCalls: () => executeTransferCalls };
}

async function flushAsync(turns = 8) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

test('configure creates frozen monotonic draft revisions and rejects invalid decimals', () => {
  const runtime = loadRuntime();
  assert.equal(runtime.api.state().current, 'CONFIGURE');
  assert.equal(runtime.api.inputAmount('1.00').revision, '1');
  const first = runtime.api.state().draft;
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.recipientAmountAtomic, '1000000');
  assert.equal(runtime.api.inputAmount('1.0').revision, '1', 'cosmetic decimal formatting does not increment semantic revision');
  assert.equal(runtime.api.inputAmount('1.000000').revision, '1', 'canonical-equivalent decimal formatting does not increment semantic revision');
  assert.equal(runtime.api.inputAmount('1.000001').revision, '2');
  assert.equal(first.recipientAmountAtomic, '1000000');
  assert.equal(runtime.api.inputAmount('1.000001').revision, '2', 'same semantic value does not increment');
  assert.equal(runtime.api.inputAmount('1.0000001'), null);
  assert.doesNotMatch(cardSource, /parseFloat\s*\(/);
});

test('pre-review projection uses not-evaluated funding but still permits review evidence collection', () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  const projection = runtime.api.projection({}, { allowReview: true, allowAuthorization: false, allowEdit: true });
  assert.equal(projection.projection.projection, 'READY_FOR_REVIEW');
  assert.equal(projection.actions.allowed.includes('enterReview'), true);
  assert.equal(projection.actions.allowed.includes('authorize'), false);
  const impossible = runtime.api.projection({ fundingReadiness: 'NOT_A_REAL_STATE' }, {});
  assert.equal(impossible.projection.projection, 'INTERNAL_INCONSISTENCY');
});

test('review creates branded frozen ReviewRecord and renders frozen values', async () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('1.005001');
  await runtime.api.enterReview();
  await Promise.resolve();
  const snapshot = runtime.api.state();
  assert.equal(snapshot.current, 'REVIEW', JSON.stringify(snapshot));
  assert.equal(runtime.api.isReviewRecord(snapshot.reviewRecord), true);
  assert.equal(Object.isFrozen(snapshot.reviewRecord), true);
  assert.equal(snapshot.reviewRecord.reviewedPaymentTerms.recipientAmountAtomic, '1005001');
  assert.equal(snapshot.reviewRecord.reviewedPaymentTerms.platformFeeAtomic, '10050');
  assert.equal(snapshot.reviewRecord.reviewedPaymentTerms.totalDebitAtomic, '1015051');
  assert.equal(runtime.elements.get('ccReviewAmount').textContent, '1.005001');
  assert.equal(runtime.elements.get('ccReviewFee').textContent, '0.01005 USDC');
  assert.equal(runtime.elements.get('ccReviewTotal').textContent, '1.015051 USDC');
  runtime.api.inputAmount('3.00');
  assert.equal(runtime.elements.get('ccReviewAmount').textContent, '1.005001', 'visible review remains frozen');
  runtime.api.editPayment();
  assert.equal(runtime.api.state().current, 'CONFIGURE');
  assert.equal(runtime.api.state().reviewRecord, null);
});

test('gas readiness enters blocked review unless complete evidence is sufficient', async () => {
  const insufficient = loadRuntime({ nativeRequiredAtomic: '999999999999999999999999' });
  insufficient.api.inputAmount('2.00');
  await insufficient.api.enterReview();
  await Promise.resolve();
  assert.equal(insufficient.api.state().current, 'REVIEW', JSON.stringify(insufficient.api.state()));
  assert.equal(insufficient.api.state().reviewRecord.walletSnapshot.gasReadiness, 'INSUFFICIENT');
  assert.equal(insufficient.elements.get('ccReviewGas').textContent, 'Insufficient');
  assert.equal(insufficient.elements.get('ccChip').disabled, true);

  const unavailable = loadRuntime({ gasStatus: 'UNAVAILABLE' });
  unavailable.api.inputAmount('2.00');
  await unavailable.api.enterReview();
  await Promise.resolve();
  assert.equal(unavailable.api.state().current, 'REVIEW');
  assert.equal(unavailable.api.state().reviewRecord.walletSnapshot.gasReadiness, 'UNAVAILABLE');
  assert.equal(unavailable.elements.get('ccReviewGas').textContent, 'Unavailable');
  assert.equal(unavailable.elements.get('ccChip').disabled, true);
});

test('authorization synchronously binds exact reviewed state and executes exact branded attempt', async () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  const reviewed = runtime.api.state().reviewRecord;
  await runtime.api.startExecution();
  await Promise.resolve();
  await Promise.resolve();
  const after = runtime.api.state();
  assert.equal(after.current, 'COMPLETE', JSON.stringify(after));
  assert.equal(runtime.api.isExecutionAttemptBinding(after.executionAttemptBinding), true);
  assert.equal(after.executionAttemptBinding.authorizationResult, runtime.getExecutionAttempt());
  assert.equal(after.activeExecutionAttempt, after.executionAttemptBinding);
  assert.equal(after.executionAttemptBinding.authorizationInputBundle.reviewBindingFingerprint, reviewed.reviewBindingFingerprint);
  assert.equal(runtime.elements.get('ccConfirmedAmount').textContent, '2.00');
});

test('executeBoundAttempt accepts only the current branded attempt once', async () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await runtime.api.startExecution();
  await Promise.resolve();
  await Promise.resolve();
  const attempt = runtime.api.state().executionAttemptBinding;
  assert.equal(runtime.api.isExecutionAttemptBinding(attempt), true);
  assert.throws(() => runtime.api.executeBoundAttempt(Object.assign({}, attempt), 'USDC', runtime.api.state().draft), /not branded|not current/);
  assert.throws(() => runtime.api.executeBoundAttempt(attempt, 'USDC', runtime.api.state().draft), /already started/);
  assert.equal(runtime.getExecuteTransferCalls(), 1);
});

test('executeBoundAttempt rejects foreign-runtime attempts', async () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await runtime.api.startExecution();
  await Promise.resolve();
  await Promise.resolve();
  const foreign = loadRuntime();
  foreign.api.inputAmount('2.00');
  await foreign.api.enterReview();
  await foreign.api.startExecution();
  await Promise.resolve();
  await Promise.resolve();
  assert.throws(
    () => runtime.api.executeBoundAttempt(foreign.api.state().executionAttemptBinding, 'USDC', runtime.api.state().draft),
    /not branded|not current/,
  );
});

test('wallet rejection clears current attempt and requires fresh authorization', async () => {
  const runtime = loadRuntime({ executeRejects: true });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await runtime.api.startExecution();
  assert.equal(runtime.api.state().chipDisabled, true, 'recovery disables primary action while collecting evidence');
  await flushAsync();
  assert.equal(runtime.api.state().current, 'REVIEW');
  assert.equal(runtime.api.state().executionAttemptBinding, null);
  assert.equal(runtime.getExecuteTransferCalls(), 1);
  assert.equal(runtime.options.walletSnapshotReads >= 2, true, 'recovery performs a fresh wallet observation');
  assert.equal(runtime.api.state().chipLabel, 'Authorize & pay');
});

test('missing projection denies review edit and authorize actions', async () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  runtime.api.clearReviewRuntime();
  runtime.api.setCurrentForTest('CONFIGURE');
  runtime.api.handleChipClick();
  assert.equal(runtime.api.state().current, 'CONFIGURE');
  runtime.api.setCurrentForTest('REVIEW');
  runtime.api.handleChipClick();
  assert.equal(runtime.getExecuteTransferCalls(), 0);
  runtime.api.editPayment();
  assert.equal(runtime.api.state().current, 'REVIEW');
});

test('manual DOM state cannot enable authorization without projection action', async () => {
  const runtime = loadRuntime({ gasStatus: 'UNAVAILABLE' });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  assert.equal(runtime.api.state().current, 'REVIEW');
  runtime.api.setCurrentForTest('REVIEW');
  runtime.api.handleChipClick();
  assert.equal(runtime.getExecuteTransferCalls(), 0);
  assert.equal(runtime.elements.get('ccChip').disabled, true);
});

test('draft mutation after review blocks authorization and requires fresh review', async () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  runtime.api.inputAmount('2.50');
  await runtime.api.startExecution();
  await Promise.resolve();
  assert.equal(runtime.api.state().current, 'REVIEW');
  assert.equal(runtime.getExecutionAttempt(), null);
});

test('wallet rejection returns to review without confirmation and double clicks do not duplicate execution', async () => {
  const runtime = loadRuntime({ executeRejects: true });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  const first = runtime.api.startExecution();
  runtime.api.startExecution();
  await first;
  await flushAsync();
  assert.equal(runtime.api.state().current, 'REVIEW');
  const sends = runtime.provider.calls.filter((call) => call.method === 'eth_sendTransaction');
  assert.equal(sends.length, 0);
});

test('post-rejection recovery blocks stale and insufficient current evidence', async () => {
  const runtime = loadRuntime({
    executeRejects: true,
    onExecuteTransfer() { runtime.options.nativeRequiredAtomic = '999999999999999999999999'; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  const originalSnapshot = runtime.api.state().reviewRecord.walletSnapshot;
  await runtime.api.startExecution();
  await flushAsync();
  const state = runtime.api.state();
  assert.equal(state.current, 'REVIEW');
  assert.equal(state.reviewRecord.walletSnapshot, originalSnapshot, 'ReviewRecord snapshot remains frozen');
  assert.notEqual(state.currentWalletObservation, originalSnapshot, 'current evidence is freshly observed');
  assert.equal(state.currentWalletObservation.gasReadiness, 'INSUFFICIENT');
  assert.equal(state.chipDisabled, true);
  assert.equal(runtime.elements.get('ccReviewBlockReason').textContent, 'More POL is needed for network fees.');
});

test('post-rejection unavailable evidence does not fall back to old wallet snapshot', async () => {
  const runtime = loadRuntime({
    executeRejects: true,
    onExecuteTransfer() { runtime.options.gasStatus = 'UNAVAILABLE'; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  const originalSnapshot = runtime.api.state().reviewRecord.walletSnapshot;
  await runtime.api.startExecution();
  await flushAsync();
  const state = runtime.api.state();
  assert.equal(state.reviewRecord.walletSnapshot, originalSnapshot);
  assert.notEqual(state.currentWalletObservation, originalSnapshot);
  assert.equal(state.currentEvidenceState, 'UNAVAILABLE');
  assert.equal(state.currentWalletObservation.gasReadiness, 'UNAVAILABLE');
  assert.notEqual(state.reviewEligibility.status, 'CURRENT');
  assert.equal(state.chipDisabled, true);
  assert.equal(runtime.elements.get('ccReviewGas').textContent, 'Unavailable');
  assert.equal(runtime.elements.get('ccReviewBlockReason').textContent, 'Wallet and network-fee readiness could not be confirmed.');
});

test('insufficient USDC copy appears only from refreshed current evidence', async () => {
  const runtime = loadRuntime({
    executeRejects: true,
    onExecuteTransfer() { runtime.options.tokenBalanceAtomic = '1'; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  await runtime.api.startExecution();
  await flushAsync();
  assert.equal(runtime.api.state().currentEvidenceState, 'REFRESHED');
  assert.equal(runtime.elements.get('ccReviewBlockReason').textContent, 'More USDC is needed for this payment.');
  assert.equal(runtime.api.state().chipDisabled, true);
});

async function assertStaleRecoveryDiscarded(mutator) {
  let releaseGas;
  let recoveryStarted = false;
  const runtime = loadRuntime({
    executeRejects: true,
    onExecuteTransfer() {
      recoveryStarted = true;
      runtime.options.deferGasEstimate = new Promise((resolve) => {
        releaseGas = () => resolve(Object.freeze({
          status: 'AVAILABLE',
          transactionCount: 2,
          gasLimitTotal: '42000',
          feePerGasAtomic: '1000000000',
          nativeGasRequiredAtomic: '42000000000000',
        }));
      });
    },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  const pending = runtime.api.startExecution();
  await flushAsync();
  assert.equal(recoveryStarted, true);
  assert.equal(runtime.api.state().current, 'REVIEW');
  assert.equal(runtime.elements.get('ccReviewGas').textContent, 'Refreshing');
  assert.equal(runtime.elements.get('ccReviewBlockReason').textContent, 'Refreshing wallet readiness\u2026');
  assert.equal(runtime.api.state().chipDisabled, true);
  assert.equal(runtime.api.state().editDisabled, true);
  mutator(runtime);
  releaseGas();
  await pending;
  await flushAsync();
  const state = runtime.api.state();
  assert.equal(state.reviewRecord, null);
  assert.equal(state.currentWalletObservation, null);
  assert.notEqual(state.reviewEligibility && state.reviewEligibility.status, 'CURRENT');
  assert.equal(state.executionAttemptBinding, null);
  assert.notEqual(state.chipLabel, 'Authorize & pay');
  assert.equal(runtime.getExecuteTransferCalls(), 1);
}

test('stale recovery result cannot overwrite changed provider identity', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.setProvider(makeProvider({ account: '0x2222222222222222222222222222222222222222' })));
});

test('stale recovery result cannot overwrite changed account generation', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.noteAccountForTest('0x2222222222222222222222222222222222222222'));
});

test('stale recovery result cannot overwrite changed chain generation', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.noteChainForTest(80002));
});

test('stale recovery result cannot overwrite changed semantic draft revision', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.inputAmount('2.50'));
});

test('stale recovery result cannot overwrite changed edit generation from invalid input', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.inputAmount('not-a-number'));
});

test('cosmetic equivalent amount during recovery follows edit-generation semantics', async () => {
  let releaseGas;
  let recoveryStarted = false;
  const runtime = loadRuntime({
    executeRejects: true,
    onExecuteTransfer() {
      recoveryStarted = true;
      runtime.options.deferGasEstimate = new Promise((resolve) => {
        releaseGas = () => resolve(Object.freeze({
          status: 'AVAILABLE',
          transactionCount: 2,
          gasLimitTotal: '42000',
          feePerGasAtomic: '1000000000',
          nativeGasRequiredAtomic: '42000000000000',
        }));
      });
    },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  const pending = runtime.api.startExecution();
  await flushAsync();
  assert.equal(recoveryStarted, true);
  runtime.api.inputAmount('2.0');
  releaseGas();
  await pending;
  await flushAsync();
  assert.equal(runtime.api.state().reviewRecord, null, 'raw input mutation generation invalidates even cosmetic recovery result');
  assert.equal(runtime.api.state().chipLabel, 'Review payment');
});

test('stale recovery result cannot overwrite changed lifecycle identity', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.replaceAuthorityForTest('lifecycle'));
});

test('stale recovery result cannot overwrite changed presentation identity', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.replaceAuthorityForTest('presentation'));
});

test('stale recovery result cannot overwrite changed ReviewRecord identity', async () => {
  await assertStaleRecoveryDiscarded((runtime) => runtime.api.replaceReviewForTest());
});

async function assertDistinctReauthorization(firstStatus) {
  const captures = [];
  const runtime = loadRuntime({
    executeStatuses: [firstStatus, 'wallet-rejected'],
    onExecuteTransfer(request) {
      captures.push({
        authResult: request.authorizationProof,
        bundle: runtime.api.state().authorizationInputBundle,
        attempt: runtime.api.state().executionAttemptBinding,
        reviewRecord: runtime.api.state().reviewRecord,
        currentObservation: runtime.api.state().currentWalletObservation,
      });
    },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  await runtime.api.startExecution();
  await flushAsync();
  const afterFirst = runtime.api.state();
  assert.equal(afterFirst.current, 'REVIEW');
  assert.equal(afterFirst.executionAttemptBinding, null);
  assert.equal(afterFirst.chipLabel, 'Authorize & pay');
  await runtime.api.startExecution();
  await flushAsync();
  assert.equal(captures.length, 2);
  assert.notEqual(captures[0].bundle, captures[1].bundle);
  assert.notEqual(captures[0].authResult, captures[1].authResult);
  assert.notEqual(captures[0].attempt, captures[1].attempt);
  assert.equal(captures[0].reviewRecord, captures[1].reviewRecord);
  assert.notEqual(captures[1].currentObservation, captures[1].reviewRecord.walletSnapshot);
  assert.throws(() => runtime.api.executeBoundAttempt(captures[0].attempt, 'USDC', runtime.api.state().draft), /not current|already consumed|not branded/);
}

test('reauthorization after wallet rejection creates distinct current attempt', async () => {
  await assertDistinctReauthorization('wallet-rejected');
});

test('reauthorization after wallet busy creates distinct current attempt', async () => {
  await assertDistinctReauthorization('wallet-busy');
});

test('reauthorization after pre-broadcast failure creates distinct current attempt', async () => {
  await assertDistinctReauthorization('failed');
});

test('action labels correspond to canonical allowed actions', () => {
  const runtime = loadRuntime();
  runtime.api.inputAmount('2.00');
  runtime.api.applyProjection({}, { allowReview: true, allowAuthorization: false, allowEdit: true });
  assert.equal(runtime.api.state().chipLabel, 'Review payment');
  runtime.api.setCurrentForTest('REVIEW');
  const projection = runtime.api.projection({}, { allowAuthorization: false, allowEdit: true });
  assert.equal(projection.actions.allowed.includes('authorize'), false);
  assert.notEqual(runtime.api.state().chipLabel, 'Authorize & pay');
});

/* ----------------------------------------------------------------
 * Gas-policy wiring regression tests (Step 4 of D2A correction)
 * ---------------------------------------------------------------- */

test('ix-execution-gas-policy.js script tag is present in index.html', () => {
  assert.match(indexHtml, /ix-execution-gas-policy\.js/, 'gas-policy script tag must be present');
});

test('gas-policy script appears before ix-execution.js in index.html', () => {
  const gasPolicyPos = indexHtml.indexOf('ix-execution-gas-policy.js');
  const executionPos = indexHtml.indexOf('ix-execution.js');
  assert(gasPolicyPos !== -1, 'ix-execution-gas-policy.js must be present');
  assert(executionPos !== -1, 'ix-execution.js must be present');
  assert(gasPolicyPos < executionPos, 'gas-policy script must appear before ix-execution.js');
});

test('card supplies an explicit authoritative policy ID to executeTransfer', () => {
  const capturedPolicyIds = [];
  const runtime = loadRuntime({
    onExecuteTransfer(request) { capturedPolicyIds.push(request.gasPolicyId); },
  });
  runtime.api.inputAmount('2.00');
  return runtime.api.enterReview()
    .then(() => Promise.resolve())
    .then(() => runtime.api.startExecution())
    .then(() => Promise.resolve())
    .then(() => {
      assert.equal(capturedPolicyIds.length, 1, 'executeTransfer was called once');
      assert.equal(capturedPolicyIds[0], COIN_CARD_GAS_POLICY_ID, 'gasPolicyId must be the Coin Card policy ID');
    });
});

test('card does not use legacy no-policy path: gasPolicyId is non-null in executeTransfer call', () => {
  let capturedRequest = null;
  const runtime = loadRuntime({
    onExecuteTransfer(request) { capturedRequest = request; },
  });
  runtime.api.inputAmount('2.00');
  return runtime.api.enterReview()
    .then(() => Promise.resolve())
    .then(() => runtime.api.startExecution())
    .then(() => Promise.resolve())
    .then(() => {
      assert(capturedRequest !== null, 'executeTransfer must have been called');
      assert(capturedRequest.gasPolicyId != null, 'gasPolicyId must not be null or undefined');
      assert.equal(typeof capturedRequest.gasPolicyId, 'string', 'gasPolicyId must be a string');
      assert(capturedRequest.gasPolicyId.length > 0, 'gasPolicyId must be nonempty');
    });
});

test('gas-policy global absent: execution fails closed with zero wallet calls before any wallet interaction', async () => {
  let executeTransferCalls = 0;
  const provider = makeProvider();
  const runtime = loadRuntime({
    gasPolicy: null,
    provider,
    onExecuteTransfer() { executeTransferCalls += 1; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  await runtime.api.startExecution();
  await flushAsync();
  const walletWrites = provider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(walletWrites.length, 0, 'no wallet write must occur when gas policy is absent');
  assert.equal(executeTransferCalls, 0, 'IX_EXECUTION.executeTransfer must not be called when policy is absent');
  /* Card should recover to REVIEW without confirmation */
  assert.notEqual(runtime.api.state().current, 'COMPLETE', 'execution must not confirm without policy');
});

test('policy ID absent/null: card.js contains no copied literal; exported ID reaches wallet', async () => {
  /* card.js must not contain the copied literal — duplication is gone */
  assert.equal(
    cardSource.includes("'COIN_CARD_POLYGON_V1'"),
    false,
    'card.js must not contain the string literal \'COIN_CARD_POLYGON_V1\' — ID must come from gas-policy POLICY_IDS export'
  );
  /* Verify that executeTransfer is still called with a non-null gasPolicyId from the export */
  let capturedGasPolicyId;
  const runtime = loadRuntime({
    onExecuteTransfer(request) { capturedGasPolicyId = request.gasPolicyId; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  await runtime.api.startExecution();
  await Promise.resolve();
  assert.notEqual(capturedGasPolicyId, null, 'gasPolicyId must not be null');
  assert.notEqual(capturedGasPolicyId, undefined, 'gasPolicyId must not be undefined');
  assert.equal(capturedGasPolicyId, COIN_CARD_GAS_POLICY_ID, 'gasPolicyId must equal the canonical Coin Card policy ID from the export');
});

test('missing POLICY_IDS export: execution fails closed with zero wallet calls', async () => {
  let executeTransferCalls = 0;
  const provider = makeProvider();
  const runtime = loadRuntime({
    gasPolicyOptions: { missingPolicyIds: true },
    provider,
    onExecuteTransfer() { executeTransferCalls += 1; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  await runtime.api.startExecution();
  await flushAsync();
  const walletWrites = provider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(walletWrites.length, 0, 'no wallet write must occur when POLICY_IDS export is missing');
  assert.equal(executeTransferCalls, 0, 'IX_EXECUTION.executeTransfer must not be called when POLICY_IDS is missing');
  assert.notEqual(runtime.api.state().current, 'COMPLETE', 'execution must not confirm without policy identity export');
});

test('malformed (empty) POLICY_IDS.COIN_CARD_POLYGON_V1: execution fails closed with zero wallet calls', async () => {
  let executeTransferCalls = 0;
  const provider = makeProvider();
  const runtime = loadRuntime({
    gasPolicyOptions: { malformedPolicyId: true },
    provider,
    onExecuteTransfer() { executeTransferCalls += 1; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  await runtime.api.startExecution();
  await flushAsync();
  const walletWrites = provider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(walletWrites.length, 0, 'no wallet write must occur when exported policy ID is malformed');
  assert.equal(executeTransferCalls, 0, 'IX_EXECUTION.executeTransfer must not be called when policy ID is malformed');
  assert.notEqual(runtime.api.state().current, 'COMPLETE', 'execution must not confirm with malformed policy ID');
});

test('unknown/invalid policy ID: resolveGasPolicy returns null and execution fails closed', async () => {
  let executeTransferCalls = 0;
  const provider = makeProvider();
  const runtime = loadRuntime({
    gasPolicyOptions: { unknown: true },
    provider,
    onExecuteTransfer() { executeTransferCalls += 1; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  await runtime.api.startExecution();
  await flushAsync();
  /* The card's fail-closed guard resolves the policy ID from POLICY_IDS and then
   * calls resolveGasPolicy(). When resolveGasPolicy returns null (unknown policy),
   * the guard fires and execution fails closed before any wallet call. */
  const walletWrites = provider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(walletWrites.length, 0, 'no wallet write when policy resolution returns null');
  assert.equal(executeTransferCalls, 0, 'IX_EXECUTION.executeTransfer must not be called when policy cannot be resolved');
  assert.notEqual(runtime.api.state().current, 'COMPLETE', 'execution must not confirm when policy resolution fails');
});

test('valid policy present: execution reaches the authorized boundary', async () => {
  let reachedExecute = false;
  const runtime = loadRuntime({
    onExecuteTransfer(request) {
      reachedExecute = true;
      assert.equal(request.gasPolicyId, COIN_CARD_GAS_POLICY_ID);
    },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await Promise.resolve();
  await runtime.api.startExecution();
  await Promise.resolve();
  assert.equal(reachedExecute, true, 'execution must reach IX_EXECUTION.executeTransfer when policy is present');
});

test('Review and execution remain distinct user actions', async () => {
  /* Review (enterReview) and execution (startExecution) are separate calls.
   * Entering review alone must not trigger wallet interaction. */
  let executeTransferCalls = 0;
  const provider = makeProvider();
  const runtime = loadRuntime({
    provider,
    onExecuteTransfer() { executeTransferCalls += 1; },
  });
  runtime.api.inputAmount('2.00');
  await runtime.api.enterReview();
  await flushAsync();
  const walletCallsAfterReview = provider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(walletCallsAfterReview.length, 0, 'review must not trigger wallet writes');
  assert.equal(executeTransferCalls, 0, 'IX_EXECUTION.executeTransfer must not be called during review');
  assert.equal(runtime.api.state().current, 'REVIEW', 'state must be REVIEW after enterReview');
  /* Execution is a separate subsequent action */
  await runtime.api.startExecution();
  await flushAsync();
  assert.equal(executeTransferCalls, 1, 'executeTransfer is called only after explicit startExecution');
});

Promise.allSettled(pendingTests).then(() => {
  if (process.exitCode) return;
  console.log('Coin Card visible review runtime checks passed.');
});
