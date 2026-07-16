'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const contract = require(path.join(repoRoot, 'app-web/frontend/public/card/coin-card-review-projection-contract.js'));

const lifecyclePresentationSource = fs.readFileSync(
  path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-presentation.js'),
  'utf8',
);
const executionAuthorizationSource = fs.readFileSync(
  path.join(repoRoot, 'app-web/frontend/public/card/coin-card-execution-authorization.js'),
  'utf8',
);

const ADDR = {
  recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
  token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  otherToken: '0x0000000000000000000000000000000000000003',
  contract: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
  otherContract: '0x0000000000000000000000000000000000000004',
  sender: '0x1111111111111111111111111111111111111111',
  otherSender: '0x2222222222222222222222222222222222222222',
};

function makePromotionRuntime(overrides = {}) {
  const brandedResolved = new WeakSet();
  const resolved = Object.freeze({
    fact: 'RESOLVED',
    outcome: 'LIFECYCLE_ACTIVE',
    operationallyResolved: true,
    presentationEligible: false,
    executionEligible: false,
    resolutionTime: '2026-07-16T10:00:00.000Z',
    registryId: 'implicitex-production',
    registryVersion: 7,
    cardId: 'cc_demo_implicitex',
    requestedManifestId: null,
    resolvedRecord: null,
    resolvedRecordId: 'record-001',
    resolvedManifestId: 'manifest-001',
    resolvedRevision: 1,
    temporalState: 'CURRENT',
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    supportingLineage: [],
    reason: null,
    ...overrides.resolved,
  });
  brandedResolved.add(resolved);
  const context = {
    window: {
      IX_COIN_CARD_LIFECYCLE_RESOLUTION: Object.freeze({
        isResolvedLifecycleResult(value) {
          return brandedResolved.has(value);
        },
      }),
    },
  };
  context.globalThis = context;
  vm.runInNewContext(lifecyclePresentationSource, context);
  const promoted = context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION.promotePresentation(resolved);
  return {
    resolved,
    promoted,
    presentation: context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
    resolution: context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
  };
}

function makeAuthorizationRuntime(promotion) {
  const context = {
    window: {
      IX_COIN_CARD_LIFECYCLE_PRESENTATION: promotion.presentation,
    },
  };
  context.globalThis = context;
  vm.runInNewContext(executionAuthorizationSource, context);
  return context.window.IX_COIN_CARD_EXECUTION_AUTHORIZATION;
}

function makeReviewRuntime(overrides = {}) {
  const promotion = overrides.promotion || makePromotionRuntime(overrides.promotionOverrides || {});
  const authApi = makeAuthorizationRuntime(promotion);
  const runtime = contract.createReviewProjectionRuntime({
    presentationApi: promotion.presentation,
    lifecycleResolutionApi: promotion.resolution,
    authorizationApi: authApi,
  });
  return { runtime, promotion, authApi };
}

function baseDraft(runtime, overrides = {}) {
  return runtime.createDraftIntent({
    draftId: 'draft-001',
    revision: 'rev-001',
    cardId: 'cc_demo_implicitex',
    manifestId: 'manifest-001',
    recipientAddress: ADDR.recipient,
    tokenAddress: ADDR.token,
    executionContractAddress: ADDR.contract,
    requiredChainId: 137,
    recipientAmountAtomic: '2000000',
    platformFeeAtomic: '20000',
    totalDebitAtomic: '2020000',
    ...overrides,
  });
}

function wallet(overrides = {}) {
  return {
    senderAddress: ADDR.sender,
    observedChainId: 137,
    tokenBalanceAtomic: '10000000',
    nativeGasBalanceAtomic: '50000000000000000',
    gasReadiness: 'SUFFICIENT',
    allowanceAtomic: '0',
    providerReference: 'provider:injected:1',
    accountGeneration: 'acct-1',
    chainGeneration: 'chain-1',
    providerGeneration: 'provider-1',
    createdAt: '2026-07-16T10:00:00.000Z',
    ...overrides,
  };
}

function review(overrides = {}) {
  const env = makeReviewRuntime(overrides);
  const promotion = env.promotion;
  const draft = overrides.draft || baseDraft(env.runtime, overrides.draftOverrides || {});
  const record = env.runtime.createReviewRecord({
    reviewId: 'review-001',
    createdAt: '2026-07-16T10:01:00.000Z',
    draftIntent: draft,
    promotedPresentationResult: promotion.promoted,
    resolvedLifecycleResult: promotion.resolved,
    lifecycleReference: {
      status: 'ACTIVE',
      cardId: 'cc_demo_implicitex',
      manifestId: 'manifest-001',
      registryVersion: '7',
      recordId: 'record-001',
    },
    evidenceResolution: 'CONSISTENT',
    providerContinuity: 'ESTABLISHED',
    walletSnapshot: wallet(overrides.walletOverrides || {}),
    ...overrides.recordOverrides,
  });
  return { record, promotion, draft, runtime: env.runtime, authApi: env.authApi };
}

function currentEvidence(r, overrides = {}) {
  return {
    currentDraftIntent: r.draft,
    currentPromotedPresentationResult: r.promotion.promoted,
    currentResolvedLifecycleResult: r.promotion.resolved,
    evidenceResolution: 'CONSISTENT',
    walletObservation: overrides.walletOverrides ? wallet(overrides.walletOverrides) : { ...r.record.walletSnapshot },
    ...overrides,
  };
}

function currentEvaluation(r, overrides = {}) {
  return r.runtime.evaluateReviewEligibility({
    reviewRecord: r.record,
    evaluationId: 'eval-001',
    evaluatedAt: '2026-07-16T10:02:00.000Z',
    currentEvidence: currentEvidence(r, overrides.currentEvidenceOverrides || {}),
    freshnessPolicy: overrides.freshnessPolicy || { stale: false },
    ...overrides.evaluationOverrides,
  });
}

test('real presentation module produces promoted authority accepted by review creation', () => {
  const r = review();
  assert.equal(r.promotion.presentation.isPromotedPresentationResult(r.promotion.promoted), true);
  assert.equal(r.runtime.isReviewRecord(r.record), true);
  assert.equal(r.record.reviewedPaymentTerms.promotedAuthorityDescriptor.cardId, 'cc_demo_implicitex');
  assert.equal(r.record.reviewedPaymentTerms.promotedAuthorityDescriptor.resolvedManifestId, 'manifest-001');
});

test('review stores canonical promotion for the exact resolved source, not caller-supplied promotion', () => {
  const supplied = makePromotionRuntime({ resolved: { cardId: 'card-other', resolvedManifestId: 'manifest-other' } });
  const r = review({ recordOverrides: { promotedPresentationResult: supplied.promoted } });
  assert.notStrictEqual(r.record.promotedPresentationResult, supplied.promoted);
  assert.equal(r.promotion.presentation.isPromotedPresentationResult(r.record.promotedPresentationResult), true);
  assert.equal(r.record.reviewedPaymentTerms.promotedAuthorityDescriptor.cardId, 'cc_demo_implicitex');
});

test('authority descriptor cannot contradict the real promoted lifecycle source', () => {
  const promotion = makePromotionRuntime({ resolved: { cardId: 'card-b', resolvedManifestId: 'manifest-b' } });
  assert.throws(() => review({ promotion }), /authority does not match draft/);
  const manifestOnly = makePromotionRuntime({ resolved: { resolvedManifestId: 'manifest-b' } });
  assert.throws(() => review({ promotion: manifestOnly }), /authority does not match draft/);
});

test('current eligibility cannot use a different active lifecycle source', () => {
  const r = review();
  const other = makePromotionRuntime({ resolved: { cardId: 'card-other', resolvedManifestId: 'manifest-other' } });
  const evaluation = r.runtime.evaluateReviewEligibility({
    reviewRecord: r.record,
    evaluationId: 'eval-other-source',
    evaluatedAt: '2026-07-16T10:02:00.000Z',
    currentEvidence: currentEvidence(r, { currentResolvedLifecycleResult: other.resolved }),
  });
  assert.equal(evaluation.status, contract.REVIEW_STATUS.INVALIDATED);
});

test('lifecycle contradiction fails review creation', () => {
  assert.throws(() => review({
    recordOverrides: {
      lifecycleReference: { status: 'REVOKED', cardId: 'cc_demo_implicitex', manifestId: 'manifest-001' },
    },
  }), /lifecycle reference must match authority/);
});

test('gas readiness is explicit and fail-closed', () => {
  assert.throws(() => review({ walletOverrides: { gasReadiness: undefined } }), /gasReadiness must/);
  assert.throws(() => review({ walletOverrides: { gasReadiness: 'UNKNOWN' } }), /gasReadiness must/);
  assert.throws(() => review({ walletOverrides: { gasReadiness: 'INSUFFICIENT' } }), /gas readiness must be SUFFICIENT/);
  assert.throws(() => review({ walletOverrides: { gasReadiness: 'UNAVAILABLE' } }), /gas readiness must be SUFFICIENT/);
  assert.equal((() => { const rr = review({ walletOverrides: { gasReadiness: 'SUFFICIENT' } }); return rr.runtime.isReviewRecord(rr.record); })(), true);
});

test('draft construction is deterministic, immutable, and rejects atomic ambiguity', () => {
  const env = makeReviewRuntime();
  const a = baseDraft(env.runtime);
  const b = baseDraft(env.runtime);
  const c = baseDraft(env.runtime, { revision: 'rev-002', recipientAmountAtomic: 3000000n, platformFeeAtomic: 30000n, totalDebitAtomic: 3030000n });
  assert.equal(a.draftFingerprint, b.draftFingerprint);
  assert.notEqual(a.draftFingerprint, c.draftFingerprint);
  assert.equal(Object.isFrozen(a), true);
  assert.throws(() => baseDraft(env.runtime, { recipientAmountAtomic: 1 }), /not a number/);
  assert.throws(() => baseDraft(env.runtime, { recipientAmountAtomic: '1.00' }), /canonical/);
  assert.throws(() => baseDraft(env.runtime, { recipientAmountAtomic: '-1' }), /canonical/);
  assert.throws(() => baseDraft(env.runtime, { totalDebitAtomic: '1' }), /must equal/);
});

test('same draft id and revision with different normalized terms invalidates evaluation', () => {
  const r = review();
  const sameRevisionDifferentAmount = baseDraft(r.runtime, { recipientAmountAtomic: '3000000', platformFeeAtomic: '30000', totalDebitAtomic: '3030000' });
  const evaluation = r.runtime.evaluateReviewEligibility({
    reviewRecord: r.record,
    evaluationId: 'eval-conflict',
    evaluatedAt: '2026-07-16T10:02:00.000Z',
    currentEvidence: currentEvidence(r, { currentDraftIntent: sameRevisionDifferentAmount }),
  });
  assert.equal(evaluation.status, contract.REVIEW_STATUS.INVALIDATED);
});

test('every reviewed draft field participates in invalidation', () => {
  const cases = [
    { cardId: 'other-card' },
    { manifestId: 'other-manifest' },
    { executionContractAddress: ADDR.otherContract },
    { recipientAddress: ADDR.otherSender },
    { tokenAddress: ADDR.otherToken },
    { requiredChainId: 1 },
    { recipientAmountAtomic: '3000000', platformFeeAtomic: '30000', totalDebitAtomic: '3030000' },
    { recipientAmountAtomic: '2000000', platformFeeAtomic: '30000', totalDebitAtomic: '2030000' },
  ];
  for (const draftOverrides of cases) {
    const r = review();
    const changed = baseDraft(r.runtime, draftOverrides);
    const ev = r.runtime.evaluateReviewEligibility({
      reviewRecord: r.record,
      evaluationId: `eval-${Object.keys(draftOverrides)[0]}`,
      evaluatedAt: '2026-07-16T10:02:00.000Z',
      currentEvidence: currentEvidence(r, { currentDraftIntent: changed }),
    });
    assert.equal(ev.status, contract.REVIEW_STATUS.INVALIDATED, JSON.stringify(draftOverrides));
  }
  assert.throws(() => baseDraft(review().runtime, {
    recipientAmountAtomic: '2000000',
    platformFeeAtomic: '20000',
    totalDebitAtomic: '3000000',
  }), /must equal/, 'independent total mutation is rejected before review');
});

test('review alone, stale review, mismatched evaluation, and forged evaluation cannot build auth inputs', () => {
  const r = review();
  assert.throws(() => r.runtime.buildAuthorizationInputs(r.record), /evaluation must be branded/);
  const stale = r.runtime.evaluateReviewEligibility({
    reviewRecord: r.record,
    evaluationId: 'eval-stale',
    evaluatedAt: '2026-07-16T10:02:00.000Z',
    currentEvidence: currentEvidence(r),
    freshnessPolicy: { stale: true },
  });
  assert.equal(stale.status, contract.REVIEW_STATUS.STALE);
  assert.throws(() => r.runtime.buildAuthorizationInputs(r.record, stale), /must be CURRENT/);
  assert.throws(() => r.runtime.buildAuthorizationInputs(r.record, { status: 'CURRENT', reviewBindingFingerprint: r.record.reviewBindingFingerprint }), /evaluation must be branded/);
  const other = review({ recordOverrides: { reviewId: 'review-002' } });
  const otherEval = currentEvaluation(other);
  assert.throws(() => r.runtime.buildAuthorizationInputs(r.record, otherEval), /evaluation must be branded|not bound/);
});

test('missing current evidence does not imply current eligibility', () => {
  const r = review();
  const evaluation = r.runtime.evaluateReviewEligibility({
    reviewRecord: r.record,
    evaluationId: 'eval-missing',
    evaluatedAt: '2026-07-16T10:02:00.000Z',
  });
  assert.equal(evaluation.status, contract.REVIEW_STATUS.STALE);
});

test('current branded evaluation produces frozen authorization inputs', () => {
  const r = review();
  const evaluation = currentEvaluation(r);
  const inputs = r.runtime.buildAuthorizationInputs(r.record, evaluation);
  assert.equal(evaluation.status, contract.REVIEW_STATUS.CURRENT);
  assert.strictEqual(inputs.promotedPresentationResult, r.record.promotedPresentationResult);
  assert.equal(Object.isFrozen(inputs.transferIntent), true);
  assert.equal(Object.isFrozen(inputs.walletSnapshot), true);
  assert.equal(r.runtime.isAuthorizationInputBundle(inputs), true);
  assert.equal(r.runtime.isAuthorizationInputBundle({ ...inputs }), false);
  assert.equal(inputs.providerReference, 'provider:injected:1');
});

test('complete current wallet observation is required for current eligibility', () => {
  const required = [
    'tokenBalanceAtomic',
    'allowanceAtomic',
    'gasReadiness',
    'providerGeneration',
  ];
  for (const field of required) {
    const r = review();
    const obs = { ...r.record.walletSnapshot };
    delete obs[field];
    const evaluation = r.runtime.evaluateReviewEligibility({
      reviewRecord: r.record,
      evaluationId: `eval-missing-${field}`,
      evaluatedAt: '2026-07-16T10:02:00.000Z',
      currentEvidence: currentEvidence(r, { walletObservation: obs }),
    });
    assert.equal(evaluation.status, contract.REVIEW_STATUS.STALE, field);
  }
});

test('changed authorization-relevant wallet evidence is stale and cannot authorize', () => {
  const changes = [
    { tokenBalanceAtomic: '9000000' },
    { allowanceAtomic: '2020000' },
    { gasReadiness: 'INSUFFICIENT' },
    { nativeGasBalanceAtomic: '49900000000000000' },
    { accountGeneration: 'acct-2' },
    { chainGeneration: 'chain-2' },
    { providerGeneration: 'provider-2' },
  ];
  for (const walletOverrides of changes) {
    const r = review();
    const evaluation = r.runtime.evaluateReviewEligibility({
      reviewRecord: r.record,
      evaluationId: `eval-wallet-change-${Object.keys(walletOverrides)[0]}`,
      evaluatedAt: '2026-07-16T10:02:00.000Z',
      currentEvidence: currentEvidence(r, { walletOverrides }),
    });
    assert.equal(evaluation.status, contract.REVIEW_STATUS.STALE, JSON.stringify(walletOverrides));
    assert.throws(() => r.runtime.buildAuthorizationInputs(r.record, evaluation), /review must be CURRENT/);
  }
});

test('real execution authorization integrates with review authorization inputs and attempt binding', () => {
  const r = review();
  const evaluation = currentEvaluation(r);
  const inputs = r.runtime.buildAuthorizationInputs(r.record, evaluation);
  const authApi = r.authApi;
  const authorized = authApi.authorizeExecution(inputs.promotedPresentationResult, inputs.transferIntent, inputs.walletSnapshot);
  assert.equal(authApi.isExecutionAuthorizedResult(authorized), true);
  const binding = r.runtime.bindExecutionAttempt({
    attemptId: 'attempt-001',
    authorizationInputBundle: inputs,
    authorizationResult: authorized,
    providerReference: 'provider:injected:1',
  });
  assert.equal(r.runtime.isExecutionAttemptBinding(binding), true);
  assert.equal(binding.executionPlan, authorized.executionPlan);
});

test('authorization-input bundle for one review cannot bind another review attempt', () => {
  const a = review();
  const b = review({ recordOverrides: { reviewId: 'review-b' } });
  const evalA = currentEvaluation(a);
  const bundleA = a.runtime.buildAuthorizationInputs(a.record, evalA);
  const authorizedBInputs = b.runtime.buildAuthorizationInputs(b.record, currentEvaluation(b));
  const authorizedB = b.authApi.authorizeExecution(
    authorizedBInputs.promotedPresentationResult,
    authorizedBInputs.transferIntent,
    authorizedBInputs.walletSnapshot,
  );
  assert.throws(() => a.runtime.bindExecutionAttempt({
    attemptId: 'attempt-cross',
    authorizationInputBundle: bundleA,
    authorizationResult: authorizedB,
    providerReference: 'provider:injected:1',
  }), /authorization result is not branded|authorization mismatch/);
});

test('execution-attempt binding rejects independent plan/provider claims', () => {
  const r = review();
  const evaluation = currentEvaluation(r);
  const authApi = r.authApi;
  const inputs = r.runtime.buildAuthorizationInputs(r.record, evaluation);
  const authorized = authApi.authorizeExecution(inputs.promotedPresentationResult, inputs.transferIntent, inputs.walletSnapshot);
  assert.throws(() => r.runtime.bindExecutionAttempt({
    attemptId: 'attempt-001',
    authorizationInputBundle: inputs,
    authorizationResult: { ...authorized, executionPlan: 'TRANSFER_ONLY' },
    providerReference: 'provider:injected:1',
  }), /authorization result is not branded/);
  assert.throws(() => r.runtime.bindExecutionAttempt({
    attemptId: 'attempt-001',
    authorizationInputBundle: inputs,
    authorizationResult: authorized,
    providerReference: 'provider:other',
  }), /provider reference must match/);
  const other = review({ walletOverrides: { providerReference: 'provider:other' } });
  assert.throws(() => r.runtime.bindExecutionAttempt({
    attemptId: 'attempt-002',
    authorizationInputBundle: inputs,
    authorizationResult: authorized,
    providerReference: other.record.walletSnapshot.providerReference,
  }), /provider reference must match/);
});

test('canonical fingerprints distinguish delimiters, missing values, nulls, and types', () => {
  const fp = contract._test.fingerprint;
  assert.notEqual(fp('D', [['x', 'a=b\nc']]), fp('D', [['x\na', 'b=c']]));
  assert.notEqual(fp('D', [['x', '1']]), fp('D', [['x', 1]]));
  assert.notEqual(fp('D', [['x', null]]), fp('D', [['x', undefined]]));
  assert.notEqual(fp('D', [['x', '']]), fp('D', [['x', false]]));
  assert.throws(() => contract._test.encodeCanonical({ get x() { return 'side-effect'; } }), /unsupported accessor/);
  assert.throws(() => contract._test.encodeCanonical({ fn() {} }), /unsupported function/);
});

test('projection cannot expose AUTHORIZE from forged review booleans or copied review shapes', () => {
  const r = review();
  const forged = r.runtime.deriveInteractionProjection({ reviewStatus: 'CURRENT', hasReviewRecord: true });
  assert.equal(forged.projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(forged.allowedActions.includes(contract.ACTIONS.AUTHORIZE), false);

  const copied = { ...r.record };
  const evalForReal = currentEvaluation(r);
  const copiedProjection = r.runtime.deriveInteractionProjection({ reviewRecord: copied, reviewEligibilityEvaluation: evalForReal });
  assert.equal(copiedProjection.projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
});

test('current branded review and matching evaluation project REVIEWING with AUTHORIZE', () => {
  const r = review();
  const evaluation = currentEvaluation(r);
  const projected = r.runtime.deriveInteractionProjection({ reviewRecord: r.record, reviewEligibilityEvaluation: evaluation });
  assert.equal(projected.projection, contract.PROJECTIONS.REVIEWING);
  assert.equal(projected.allowedActions.includes(contract.ACTIONS.AUTHORIZE), true);

  const stale = r.runtime.evaluateReviewEligibility({
    reviewRecord: r.record,
    evaluationId: 'eval-stale',
    evaluatedAt: '2026-07-16T10:02:00.000Z',
    currentEvidence: currentEvidence(r),
    freshnessPolicy: { stale: true },
  });
  const staleProjection = r.runtime.deriveInteractionProjection({ reviewRecord: r.record, reviewEligibilityEvaluation: stale, allowAuthorization: true });
  assert.equal(staleProjection.projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
});

test('post-authorization projections never expose AUTHORIZE for the same attempt', () => {
  const { r, binding } = executionBindingFor();
  for (const authorization of ['EXECUTION_AUTHORIZED', 'PROOF_CONSUMED']) {
    const projected = r.runtime.deriveInteractionProjection({
      authorization,
      executionAttemptBinding: binding,
    });
    assert.equal(projected.projection, contract.PROJECTIONS.AUTHORIZATION_IN_PROGRESS);
    assert.equal(projected.allowedActions.includes(contract.ACTIONS.AUTHORIZE), false);
  }
  assert.equal(r.runtime.deriveInteractionProjection({ authorization: 'EXECUTION_AUTHORIZED' }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({ authorization: 'PROOF_CONSUMED' }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
});

test('token approval post-authorization states do not fall back to review', () => {
  const { r, binding } = executionBindingFor();
  assert.equal(r.runtime.deriveInteractionProjection({
    allowanceApproval: 'OUTCOME_UNKNOWN',
    executionAttemptBinding: binding,
    approvalEvidence: { txHash: '0xapprove' },
  }).projection, contract.PROJECTIONS.OUTCOME_UNKNOWN);
  assert.equal(r.runtime.deriveInteractionProjection({
    allowanceApproval: 'CONFIRMED',
    executionAttemptBinding: binding,
    approvalEvidence: { txHash: '0xapprove' },
  }).projection, contract.PROJECTIONS.AUTHORIZATION_IN_PROGRESS);
  assert.equal(r.runtime.deriveInteractionProjection({
    allowanceApproval: 'SUBMITTED',
    executionAttemptBinding: binding,
    approvalEvidence: { txHash: '0xapprove' },
  }).projection, contract.PROJECTIONS.TOKEN_APPROVAL_PENDING);
  assert.equal(r.runtime.deriveInteractionProjection({
    allowanceApproval: 'SUBMITTED',
    executionAttemptBinding: binding,
  }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({
    allowanceApproval: 'WALLET_DECISION_PENDING',
  }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
});

test('transfer post-authorization states require binding and transaction evidence where needed', () => {
  const { r, binding } = executionBindingFor();
  assert.equal(r.runtime.deriveInteractionProjection({
    transferExecution: 'WALLET_DECISION_PENDING',
  }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({
    transferExecution: 'WALLET_DECISION_PENDING',
    executionAttemptBinding: binding,
  }).projection, contract.PROJECTIONS.TRANSFER_DECISION_PENDING);
  assert.equal(r.runtime.deriveInteractionProjection({
    transferExecution: 'SUBMITTED',
    executionAttemptBinding: binding,
  }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({
    transferExecution: 'SUBMITTED',
    executionAttemptBinding: binding,
    transactionEvidence: { txHash: '0xabc' },
  }).projection, contract.PROJECTIONS.CONFIRMATION_PENDING);
});

test('projection validates unknown values and contradictions', () => {
  const r = review();
  assert.equal(r.runtime.deriveInteractionProjection({ walletConnection: 'MAYBE' }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({ transferExecution: 'SUBMITTED', settlement: 'NOT_SUBMITTED' }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({ settlement: 'CONFIRMED' }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({ executionPlan: 'TRANSFER_ONLY', allowanceApproval: 'SUBMITTED' }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({ integrity: 'INTEGRITY_FAILED', allowAuthorization: true }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
});

test('settlement truth outranks ordinary readiness when transaction evidence is consistent', () => {
  const r = review();
  const projected = r.runtime.deriveInteractionProjection({
    settlement: 'CONFIRMED',
    transactionEvidence: { txHash: '0xabc' },
    walletConnection: 'NOT_CONNECTED',
    networkCompatibility: 'MISMATCHED',
  });
  assert.equal(projected.projection, contract.PROJECTIONS.SUCCEEDED);
});

test('compact projection retains expansion path without bypassing review', () => {
  const r = review();
  const projected = r.runtime.deriveInteractionProjection({
    integrity: 'VERIFIED',
    promotion: 'PRESENTATION_PROMOTED',
    draftValid: true,
    walletConnection: 'CONNECTED',
    networkCompatibility: 'MATCHED',
    fundingReadiness: 'SUFFICIENT',
    presentation: { compact: true },
  });
  assert.equal(projected.projection, contract.PROJECTIONS.READY_FOR_REVIEW);
  assert.equal(projected.allowedActions.includes(contract.ACTIONS.ENTER_REVIEW), false);
  assert.equal(projected.allowedActions.includes(contract.ACTIONS.EXPAND_PRESENTATION), true);
});

function executionBindingFor(overrides = {}) {
  const r = review({ walletOverrides: overrides.walletOverrides || {} });
  const evaluation = currentEvaluation(r);
  const inputs = r.runtime.buildAuthorizationInputs(r.record, evaluation);
  const authApi = r.authApi;
  const authorized = authApi.authorizeExecution(inputs.promotedPresentationResult, inputs.transferIntent, inputs.walletSnapshot);
  const binding = r.runtime.bindExecutionAttempt({
    attemptId: 'attempt-001',
    authorizationInputBundle: inputs,
    authorizationResult: authorized,
    providerReference: 'provider:injected:1',
  });
  return { r, binding };
}

test('loose transaction hash cannot prove plan-owned mutation', () => {
  const { r, binding } = executionBindingFor();
  const classified = r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: wallet({ allowanceAtomic: '2020000' }),
    executionEvidence: { attemptId: 'attempt-001', providerReference: 'provider:injected:1', phase: 'APPROVAL_CONFIRMED', approvalTxHash: '0xabc' },
  });
  assert.equal(classified.classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);
});

test('detailed but untrusted approval and transfer objects remain unprovable for APPROVE_THEN_TRANSFER', () => {
  const { r, binding } = executionBindingFor();
  const approval = r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: wallet({ allowanceAtomic: '2020000', nativeGasBalanceAtomic: '49900000000000000' }),
    executionEvidence: {
      attemptId: 'attempt-001',
      providerReference: 'provider:injected:1',
      phase: 'APPROVAL_CONFIRMED',
      approval: { tokenAddress: ADDR.token, spenderAddress: ADDR.contract, txHash: '0xabc' },
    },
  });
  assert.equal(approval.classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);

  const transfer = r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: wallet({ tokenBalanceAtomic: '7980000', nativeGasBalanceAtomic: '49800000000000000' }),
    executionEvidence: {
      attemptId: 'attempt-001',
      providerReference: 'provider:injected:1',
      phase: 'TRANSFER_CONFIRMED',
      transfer: { tokenAddress: ADDR.token, recipientAddress: ADDR.recipient, txHash: '0xdef' },
    },
  });
  assert.equal(transfer.classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);
});

test('TRANSFER_ONLY mutation handling also defers positive plan-owned classification', () => {
  const { r, binding } = executionBindingFor({ walletOverrides: { allowanceAtomic: '2020000' } });
  assert.equal(binding.executionPlan, 'TRANSFER_ONLY');
  const ok = r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: wallet({ allowanceAtomic: '2020000', tokenBalanceAtomic: '7980000' }),
    executionEvidence: {
      attemptId: 'attempt-001',
      providerReference: 'provider:injected:1',
      phase: 'TRANSFER_CONFIRMED',
      transfer: { tokenAddress: ADDR.token, recipientAddress: ADDR.recipient, txHash: '0xdef' },
    },
  });
  assert.equal(ok.classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);

  const loose = r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: wallet({ allowanceAtomic: '2020000', tokenBalanceAtomic: '7980000' }),
    executionEvidence: {
      attemptId: 'attempt-001',
      providerReference: 'provider:injected:1',
      phase: 'TRANSFER_CONFIRMED',
      transfer: { tokenAddress: ADDR.otherToken, recipientAddress: ADDR.recipient, txHash: '0xdef' },
    },
  });
  assert.equal(loose.classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);
});

test('wallet mutation comparison uses complete wallet evidence', () => {
  const { r, binding } = executionBindingFor();
  assert.equal(r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: { ...binding.authorizationInputBundle.reviewWalletSnapshot },
  }).classification, contract.MUTATION_CLASSIFICATION.NO_CHANGE);
  const noNative = executionBindingFor({ walletOverrides: { nativeGasBalanceAtomic: null } });
  assert.equal(noNative.r.runtime.classifyWalletMutation({
    executionAttemptBinding: noNative.binding,
    currentObservation: { ...noNative.binding.authorizationInputBundle.reviewWalletSnapshot },
  }).classification, contract.MUTATION_CLASSIFICATION.NO_CHANGE);
  assert.equal(r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: { ...binding.authorizationInputBundle.reviewWalletSnapshot, nativeGasBalanceAtomic: '49900000000000000' },
  }).classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);
  assert.equal(r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: { ...binding.authorizationInputBundle.reviewWalletSnapshot, allowanceAtomic: '2020000' },
  }).classification, contract.MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE);
  assert.equal(r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: { ...binding.authorizationInputBundle.reviewWalletSnapshot, tokenBalanceAtomic: '1' },
  }).classification, contract.MUTATION_CLASSIFICATION.READINESS_REFRESH_REQUIRED);
  assert.equal(r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: { ...binding.authorizationInputBundle.reviewWalletSnapshot, gasReadiness: 'INSUFFICIENT' },
  }).classification, contract.MUTATION_CLASSIFICATION.READINESS_REFRESH_REQUIRED);
  assert.equal(r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: { ...binding.authorizationInputBundle.reviewWalletSnapshot, providerGeneration: 'provider-2' },
  }).classification, contract.MUTATION_CLASSIFICATION.UNEXPECTED_EXTERNAL_DRIFT);
});

test('projection plan comes from attempt binding and rejects contradictions', () => {
  const { r, binding } = executionBindingFor();
  assert.equal(r.runtime.deriveInteractionProjection({
    executionAttemptBinding: binding,
    executionPlan: 'TRANSFER_ONLY',
  }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
  assert.equal(r.runtime.deriveInteractionProjection({
    executionAttemptBinding: binding,
    executionPlan: binding.executionPlan,
    allowanceApproval: 'WALLET_DECISION_PENDING',
  }).projection, contract.PROJECTIONS.TOKEN_APPROVAL_DECISION_PENDING);
  const transferOnly = executionBindingFor({ walletOverrides: { allowanceAtomic: '2020000' } });
  assert.equal(transferOnly.r.runtime.deriveInteractionProjection({
    executionAttemptBinding: transferOnly.binding,
    allowanceApproval: 'WALLET_DECISION_PENDING',
  }).projection, contract.PROJECTIONS.INTERNAL_INCONSISTENCY);
});

test('sender, chain, or provider drift is external drift in mutation classification', () => {
  const { r, binding } = executionBindingFor();
  const classified = r.runtime.classifyWalletMutation({
    executionAttemptBinding: binding,
    currentObservation: wallet({ senderAddress: ADDR.otherSender }),
    executionEvidence: { attemptId: 'attempt-001', providerReference: 'provider:injected:1' },
  });
  assert.equal(classified.classification, contract.MUTATION_CLASSIFICATION.UNEXPECTED_EXTERNAL_DRIFT);
});
