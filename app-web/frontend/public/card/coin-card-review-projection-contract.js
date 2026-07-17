/* coin-card-review-projection-contract.js
 *
 * Pure Coin Card review snapshot and interaction projection contract.
 * Runtime instances bind trusted dependencies once. Individual operations do
 * not accept replacement security predicates.
 */

(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    root.IX_COIN_CARD_REVIEW_PROJECTION_CONTRACT = factory(root);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SCHEMAS = Object.freeze({
    DRAFT: 'coin-card-draft-transfer-intent.v1',
    REVIEWED_TERMS: 'coin-card-reviewed-payment-terms.v1',
    WALLET_SNAPSHOT: 'coin-card-review-wallet-snapshot.v1',
    REVIEW_RECORD: 'coin-card-review-record.v1',
    REVIEW_ELIGIBILITY: 'coin-card-review-eligibility-evaluation.v1',
    AUTHORIZATION_INPUT_BUNDLE: 'coin-card-authorization-input-bundle.v1',
    EXECUTION_ATTEMPT: 'coin-card-execution-attempt-binding.v1',
  });

  var DOMAINS = Object.freeze({
    DRAFT: 'IX_COIN_CARD_DRAFT_V1',
    REVIEWED_TERMS: 'IX_COIN_CARD_REVIEWED_TERMS_V1',
    WALLET_SNAPSHOT: 'IX_COIN_CARD_WALLET_SNAPSHOT_V1',
    REVIEW_BINDING: 'IX_COIN_CARD_REVIEW_BINDING_V1',
    REVIEW_ELIGIBILITY: 'IX_COIN_CARD_REVIEW_ELIGIBILITY_V1',
    AUTHORIZATION_INPUT_BUNDLE: 'IX_COIN_CARD_AUTHORIZATION_INPUT_BUNDLE_V1',
    EXECUTION_ATTEMPT: 'IX_COIN_CARD_EXECUTION_ATTEMPT_V1',
  });

  var REVIEW_STATUS = Object.freeze({ ABSENT: 'ABSENT', CURRENT: 'CURRENT', INVALIDATED: 'INVALIDATED', STALE: 'STALE' });
  var MUTATION_CLASSIFICATION = Object.freeze({
    NO_CHANGE: 'NO_CHANGE',
    READINESS_REFRESH_REQUIRED: 'READINESS_REFRESH_REQUIRED',
    UNEXPECTED_EXTERNAL_DRIFT: 'UNEXPECTED_EXTERNAL_DRIFT',
    UNSAFE_OR_UNPROVABLE: 'UNSAFE_OR_UNPROVABLE',
    EXPECTED_PLAN_MUTATION: 'EXPECTED_PLAN_MUTATION',
  });
  var PROJECTIONS = Object.freeze({
    PRESENTED: 'PRESENTED',
    CONFIGURING: 'CONFIGURING',
    WALLET_REQUIRED: 'WALLET_REQUIRED',
    WRONG_NETWORK: 'WRONG_NETWORK',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    READY_FOR_REVIEW: 'READY_FOR_REVIEW',
    REVIEWING: 'REVIEWING',
    AUTHORIZATION_IN_PROGRESS: 'AUTHORIZATION_IN_PROGRESS',
    TOKEN_APPROVAL_DECISION_PENDING: 'TOKEN_APPROVAL_DECISION_PENDING',
    TOKEN_APPROVAL_PENDING: 'TOKEN_APPROVAL_PENDING',
    TRANSFER_DECISION_PENDING: 'TRANSFER_DECISION_PENDING',
    TRANSFER_SUBMISSION_PENDING: 'TRANSFER_SUBMISSION_PENDING',
    CONFIRMATION_PENDING: 'CONFIRMATION_PENDING',
    EVIDENCE_BLOCKED: 'EVIDENCE_BLOCKED',
    CANCELLED: 'CANCELLED',
    FAILED: 'FAILED',
    OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
    SUCCEEDED: 'SUCCEEDED',
    INTERNAL_INCONSISTENCY: 'INTERNAL_INCONSISTENCY',
  });
  var ACTIONS = Object.freeze({
    INSPECT_EVIDENCE: 'inspectEvidence',
    EXPAND_PRESENTATION: 'expandPresentation',
    EDIT_DRAFT: 'editDraft',
    CONNECT_WALLET: 'connectWallet',
    REQUEST_NETWORK_SWITCH: 'requestNetworkSwitch',
    REFRESH_WALLET_READINESS: 'refreshWalletReadiness',
    ENTER_REVIEW: 'enterReview',
    EXIT_REVIEW: 'exitReview',
    AUTHORIZE: 'authorize',
    CANCEL_PRE_BROADCAST: 'cancelPreBroadcast',
    WAIT: 'wait',
    INSPECT_TRANSACTION: 'inspectTransaction',
    RECONCILE_UNKNOWN_OUTCOME: 'reconcileUnknownOutcome',
    BEGIN_FRESH_ATTEMPT: 'beginFreshAttempt',
  });

  var ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  var ATOMIC_RE = /^(0|[1-9][0-9]*)$/;
  var GAS_READINESS = Object.freeze({ SUFFICIENT: true, INSUFFICIENT: true, UNAVAILABLE: true });

  function err(code, message) { var e = new Error(message); e.code = code; return e; }
  function freezeDeep(v) {
    if (!v || typeof v !== 'object' || Object.isFrozen(v)) return v;
    Object.getOwnPropertyNames(v).forEach(function (k) { freezeDeep(v[k]); });
    return Object.freeze(v);
  }
  function isPlainObject(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    var p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }
  function assertPlain(v, name) { if (!isPlainObject(v)) throw err('INVALID_' + name.toUpperCase(), name + ' must be a plain object'); }
  function readData(v, k) {
    var d = Object.getOwnPropertyDescriptor(v, k);
    if (!d || !Object.prototype.hasOwnProperty.call(d, 'value')) throw err('UNSUPPORTED_DATA_VALUE', 'unsupported accessor or missing data property: ' + k);
    return d.value;
  }
  function nonempty(v, name) { if (typeof v !== 'string' || !v) throw err('INVALID_' + name.toUpperCase(), name + ' must be nonempty'); return v; }
  function addr(v, name) { if (typeof v !== 'string' || !ADDRESS_RE.test(v)) throw err('INVALID_' + name.toUpperCase(), name + ' must be a valid address'); return v.toLowerCase(); }
  function chain(v, name) {
    var n = typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v) ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) throw err('INVALID_' + name.toUpperCase(), name + ' must be a safe positive integer');
    return n;
  }
  function atomic(v, name) {
    if (typeof v === 'bigint') {
      if (v < 0n) throw err('INVALID_' + name.toUpperCase(), name + ' must not be negative');
      return v.toString(10);
    }
    if (typeof v === 'number') throw err('INVALID_' + name.toUpperCase(), name + ' must be an atomic string or BigInt, not a number');
    if (typeof v !== 'string' || !ATOMIC_RE.test(v)) throw err('INVALID_' + name.toUpperCase(), name + ' must be a canonical nonnegative atomic integer string');
    return v;
  }
  function assertTotal(a, f, t) {
    if (BigInt(a) + BigInt(f) !== BigInt(t)) throw err('TOTAL_DEBIT_MISMATCH', 'recipientAmountAtomic + platformFeeAtomic must equal totalDebitAtomic');
  }

  function canonicalNode(v, active) {
    if (v === null) return { t: 'null', v: null };
    if (v === undefined) return { t: 'undefined', v: null };
    if (typeof v === 'string') return { t: 'string', v: v };
    if (typeof v === 'boolean') return { t: 'boolean', v: v };
    if (typeof v === 'bigint') return { t: 'bigint', v: v.toString(10) };
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || Object.is(v, -0)) throw err('UNSUPPORTED_DATA_VALUE', 'unsupported number');
      return { t: 'number', v: String(v) };
    }
    if (typeof v === 'function' || typeof v === 'symbol') throw err('UNSUPPORTED_DATA_VALUE', 'unsupported function or symbol');
    var stack = active || [];
    if (stack.indexOf(v) !== -1) throw err('UNSUPPORTED_DATA_VALUE', 'cyclic data is unsupported');
    if (Array.isArray(v)) {
      stack.push(v);
      var a = v.map(function (item) { return canonicalNode(item, stack); });
      stack.pop();
      return { t: 'array', v: a };
    }
    if (!isPlainObject(v)) throw err('UNSUPPORTED_DATA_VALUE', 'non-plain object');
    stack.push(v);
    var o = {};
    Object.keys(v).sort().forEach(function (k) { o[k] = canonicalNode(readData(v, k), stack); });
    stack.pop();
    return { t: 'object', v: o };
  }
  function len(s) { return String(s.length) + ':' + s; }
  function encodeNode(n) {
    if (n.t === 'string' || n.t === 'number' || n.t === 'bigint') return n.t + '(' + len(n.v) + ')';
    if (n.t === 'boolean') return 'boolean(' + (n.v ? 'true' : 'false') + ')';
    if (n.t === 'null') return 'null()';
    if (n.t === 'undefined') return 'undefined()';
    if (n.t === 'array') return 'array[' + n.v.map(encodeNode).join('') + ']';
    return 'object{' + Object.keys(n.v).map(function (k) { return len(k) + encodeNode(n.v[k]); }).join('') + '}';
  }
  function encodeCanonical(v) { return encodeNode(canonicalNode(v)); }
  function fingerprint(domain, entries) { return domain + '|' + entries.map(function (e) { return len(e[0]) + encodeCanonical(e[1]); }).join(''); }
  function cloneData(v) { return unwrap(canonicalNode(v)); }
  function unwrap(n) {
    if (n.t === 'string' || n.t === 'boolean') return n.v;
    if (n.t === 'number') return Number(n.v);
    if (n.t === 'bigint') return n.v;
    if (n.t === 'null') return null;
    if (n.t === 'undefined') return undefined;
    if (n.t === 'array') return n.v.map(unwrap);
    var o = {};
    Object.keys(n.v).forEach(function (k) { o[k] = unwrap(n.v[k]); });
    return o;
  }

  function createDraftIntent(input) {
    assertPlain(input, 'draftIntentInput');
    var ra = atomic(input.recipientAmountAtomic, 'recipientAmountAtomic');
    var fee = atomic(input.platformFeeAtomic, 'platformFeeAtomic');
    var total = atomic(input.totalDebitAtomic, 'totalDebitAtomic');
    assertTotal(ra, fee, total);
    var d = {
      schemaVersion: SCHEMAS.DRAFT,
      draftId: nonempty(input.draftId, 'draftId'),
      revision: nonempty(input.revision, 'revision'),
      cardId: nonempty(input.cardId, 'cardId'),
      manifestId: nonempty(input.manifestId, 'manifestId'),
      recipientAddress: addr(input.recipientAddress, 'recipientAddress'),
      tokenAddress: addr(input.tokenAddress, 'tokenAddress'),
      executionContractAddress: addr(input.executionContractAddress, 'executionContractAddress'),
      requiredChainId: chain(input.requiredChainId, 'requiredChainId'),
      recipientAmountAtomic: ra,
      platformFeeAtomic: fee,
      totalDebitAtomic: total,
    };
    d.draftFingerprint = fingerprint(DOMAINS.DRAFT, [
      ['schemaVersion', d.schemaVersion], ['draftId', d.draftId], ['revision', d.revision],
      ['cardId', d.cardId], ['manifestId', d.manifestId], ['recipientAddress', d.recipientAddress],
      ['tokenAddress', d.tokenAddress], ['executionContractAddress', d.executionContractAddress],
      ['requiredChainId', d.requiredChainId], ['recipientAmountAtomic', d.recipientAmountAtomic],
      ['platformFeeAtomic', d.platformFeeAtomic], ['totalDebitAtomic', d.totalDebitAtomic],
    ]);
    return freezeDeep(d);
  }

  function normalizeWalletObservation(input, requireNativeGas) {
    assertPlain(input, 'walletObservation');
    if (!GAS_READINESS[input.gasReadiness]) throw err('GAS_READINESS_INVALID', 'gasReadiness must be SUFFICIENT, INSUFFICIENT, or UNAVAILABLE');
    if (requireNativeGas && (input.nativeGasBalanceAtomic === undefined || input.nativeGasBalanceAtomic === null)) throw err('NATIVE_GAS_REQUIRED', 'native gas balance required');
    var w = {
      senderAddress: addr(input.senderAddress, 'senderAddress'),
      observedChainId: chain(input.observedChainId, 'observedChainId'),
      tokenBalanceAtomic: atomic(input.tokenBalanceAtomic, 'tokenBalanceAtomic'),
      allowanceAtomic: atomic(input.allowanceAtomic, 'allowanceAtomic'),
      gasReadiness: input.gasReadiness,
      nativeGasBalanceAtomic: input.nativeGasBalanceAtomic === undefined || input.nativeGasBalanceAtomic === null ? null : atomic(input.nativeGasBalanceAtomic, 'nativeGasBalanceAtomic'),
      providerReference: nonempty(input.providerReference, 'providerReference'),
      accountGeneration: nonempty(String(input.accountGeneration === undefined ? '' : input.accountGeneration), 'accountGeneration'),
      chainGeneration: nonempty(String(input.chainGeneration === undefined ? '' : input.chainGeneration), 'chainGeneration'),
      providerGeneration: nonempty(String(input.providerGeneration === undefined ? '' : input.providerGeneration), 'providerGeneration'),
      observedAt: nonempty(input.observedAt || input.createdAt, 'observedAt'),
    };
    return w;
  }

  function createReviewProjectionRuntime(deps) {
    deps = deps || {};
    var presentationApi = deps.presentationApi || (root && root.IX_COIN_CARD_LIFECYCLE_PRESENTATION);
    var lifecycleResolutionApi = deps.lifecycleResolutionApi || (root && root.IX_COIN_CARD_LIFECYCLE_RESOLUTION);
    var authorizationApi = deps.authorizationApi || (root && root.IX_COIN_CARD_EXECUTION_AUTHORIZATION);
    if (!presentationApi || typeof presentationApi.isPromotedPresentationResult !== 'function' || typeof presentationApi.promotePresentation !== 'function') throw err('DEPENDENCY_UNAVAILABLE', 'presentation API unavailable');
    if (!lifecycleResolutionApi || typeof lifecycleResolutionApi.isResolvedLifecycleResult !== 'function') throw err('DEPENDENCY_UNAVAILABLE', 'lifecycle resolution API unavailable');
    if (!authorizationApi || typeof authorizationApi.isExecutionAuthorizedResult !== 'function') throw err('DEPENDENCY_UNAVAILABLE', 'authorization API unavailable');

    var drafts = new WeakSet();
    var reviews = new WeakSet();
    var evaluations = new WeakSet();
    var bundles = new WeakSet();
    var attempts = new WeakSet();
    var evaluationWalletEvidence = new WeakMap();

    function isDraftIntent(v) { try { return drafts.has(v); } catch (e) { return false; } }
    function isReviewRecord(v) { try { return reviews.has(v); } catch (e) { return false; } }
    function isReviewEligibilityEvaluation(v) { try { return evaluations.has(v); } catch (e) { return false; } }
    function isAuthorizationInputBundle(v) { try { return bundles.has(v); } catch (e) { return false; } }
    function isExecutionAttemptBinding(v) { try { return attempts.has(v); } catch (e) { return false; } }

    function draft(input) { var d = createDraftIntent(input); drafts.add(d); return d; }

    function promoteAndDescribe(resolved) {
      if (lifecycleResolutionApi.isResolvedLifecycleResult(resolved) !== true) throw err('LIFECYCLE_SOURCE_INVALID', 'resolved lifecycle result is not branded');
      var promoted = presentationApi.promotePresentation(resolved);
      if (presentationApi.isPromotedPresentationResult(promoted) !== true) throw err('PROMOTED_AUTHORITY_INVALID', 'canonical promotion did not produce branded authority');
      if (promoted.outcome !== 'PRESENTATION_PROMOTED' || promoted.presentationEligible !== true) throw err('PROMOTION_NOT_ELIGIBLE', 'promotion must be eligible');
      if (resolved.fact !== 'RESOLVED' || resolved.outcome !== 'LIFECYCLE_ACTIVE') throw err('LIFECYCLE_NOT_ACTIVE', 'lifecycle must be active');
      var descriptor = freezeDeep({
        promotionOutcome: promoted.outcome,
        presentationEligible: promoted.presentationEligible,
        resolvedFact: resolved.fact,
        resolvedOutcome: resolved.outcome,
        cardId: resolved.cardId,
        requestedManifestId: resolved.requestedManifestId || null,
        resolvedManifestId: resolved.resolvedManifestId,
        resolvedRevision: resolved.resolvedRevision,
        resolvedRecordId: resolved.resolvedRecordId,
        registryId: resolved.registryId,
        registryVersion: resolved.registryVersion,
        cardStatus: resolved.cardStatus,
        manifestStatus: resolved.manifestStatus,
      });
      return Object.freeze({ promoted: promoted, descriptor: descriptor });
    }

    function createReviewRecord(input) {
      assertPlain(input, 'reviewRecordInput');
      if (!isDraftIntent(input.draftIntent)) throw err('INVALID_DRAFT_INTENT', 'draftIntent must come from this runtime');
      var draftValue = input.draftIntent;
      var wallet = normalizeWalletObservation(input.walletSnapshot, false);
      if (wallet.observedChainId !== draftValue.requiredChainId) throw err('WALLET_CHAIN_MISMATCH', 'wallet chain mismatch');
      if (BigInt(wallet.tokenBalanceAtomic) < BigInt(draftValue.totalDebitAtomic)) throw err('TOKEN_FUNDS_INSUFFICIENT', 'token balance insufficient');
      if (input.providerContinuity !== 'ESTABLISHED') throw err('PROVIDER_CONTINUITY_NOT_ESTABLISHED', 'provider continuity required');
      var promotedAuthority = promoteAndDescribe(input.resolvedLifecycleResult);
      var desc = promotedAuthority.descriptor;
      if (desc.cardId !== draftValue.cardId || desc.resolvedManifestId !== draftValue.manifestId) throw err('AUTHORITY_DRAFT_MISMATCH', 'authority does not match draft');
      var lifecycleRef = freezeDeep(cloneData(input.lifecycleReference));
      if (lifecycleRef.status !== 'ACTIVE' || lifecycleRef.cardId !== desc.cardId || lifecycleRef.manifestId !== desc.resolvedManifestId || lifecycleRef.recordId !== desc.resolvedRecordId) throw err('LIFECYCLE_REFERENCE_MISMATCH', 'lifecycle reference must match authority');
      if (input.evidenceResolution !== 'CONSISTENT') throw err('EVIDENCE_NOT_CONSISTENT', 'evidence must be consistent');
      var terms = {
        schemaVersion: SCHEMAS.REVIEWED_TERMS,
        reviewId: nonempty(input.reviewId, 'reviewId'),
        createdAt: nonempty(input.createdAt, 'createdAt'),
        sourceDraftId: draftValue.draftId,
        sourceDraftRevision: draftValue.revision,
        sourceDraftFingerprint: draftValue.draftFingerprint,
        cardId: draftValue.cardId,
        manifestId: draftValue.manifestId,
        promotedAuthorityDescriptor: desc,
        lifecycleReference: lifecycleRef,
        recipientAddress: draftValue.recipientAddress,
        tokenAddress: draftValue.tokenAddress,
        executionContractAddress: draftValue.executionContractAddress,
        requiredChainId: draftValue.requiredChainId,
        recipientAmountAtomic: draftValue.recipientAmountAtomic,
        platformFeeAtomic: draftValue.platformFeeAtomic,
        totalDebitAtomic: draftValue.totalDebitAtomic,
      };
      terms.reviewedTermsFingerprint = fingerprint(DOMAINS.REVIEWED_TERMS, Object.keys(terms).filter(function (k) { return k !== 'reviewedTermsFingerprint'; }).map(function (k) { return [k, terms[k]]; }));
      freezeDeep(terms);
      wallet.walletSnapshotFingerprint = fingerprint(DOMAINS.WALLET_SNAPSHOT, Object.keys(wallet).filter(function (k) { return k !== 'walletSnapshotFingerprint'; }).map(function (k) { return [k, wallet[k]]; }));
      freezeDeep(wallet);
      var record = {
        schemaVersion: SCHEMAS.REVIEW_RECORD,
        reviewId: terms.reviewId,
        createdAt: terms.createdAt,
        reviewedPaymentTerms: terms,
        walletSnapshot: wallet,
        promotedPresentationResult: promotedAuthority.promoted,
        resolvedLifecycleResult: input.resolvedLifecycleResult,
        invalidation: null,
      };
      record.reviewBindingFingerprint = fingerprint(DOMAINS.REVIEW_BINDING, [
        ['schemaVersion', record.schemaVersion], ['reviewId', record.reviewId],
        ['reviewedTermsFingerprint', terms.reviewedTermsFingerprint], ['walletSnapshotFingerprint', wallet.walletSnapshotFingerprint],
      ]);
      freezeDeep(record);
      reviews.add(record);
      return record;
    }

    function evaluateReviewEligibility(input) {
      input = input || {};
      if (!isReviewRecord(input.reviewRecord)) return makeEval(null, REVIEW_STATUS.ABSENT, ['review record absent or unbranded'], input);
      var record = input.reviewRecord;
      var reasons = [];
      var stale = [];
      if (!input.evaluationId || !input.evaluatedAt) stale.push('evaluation id/time required');
      var ev = input.currentEvidence;
      if (!ev || typeof ev !== 'object') stale.push('current evidence required');
      ev = ev || {};
      if (!isDraftIntent(ev.currentDraftIntent)) stale.push('current draft from this runtime required');
      else if (ev.currentDraftIntent.draftFingerprint !== record.reviewedPaymentTerms.sourceDraftFingerprint) reasons.push('draft revision or terms changed');
      if (!ev.currentResolvedLifecycleResult) {
        stale.push('current branded authority evidence required');
      } else {
        try {
          var currentDesc = promoteAndDescribe(ev.currentResolvedLifecycleResult).descriptor;
          if (encodeCanonical(currentDesc) !== encodeCanonical(record.reviewedPaymentTerms.promotedAuthorityDescriptor)) reasons.push('current authority changed');
        } catch (e) {
          reasons.push('current authority invalid: ' + e.code);
        }
      }
      if (ev.evidenceResolution === undefined) stale.push('evidence resolution required');
      else if (ev.evidenceResolution !== 'CONSISTENT') reasons.push('evidence no longer consistent');
      var authorizationWalletEvidence = null;
      try {
        var obs = normalizeWalletObservation(ev.walletObservation, record.walletSnapshot.nativeGasBalanceAtomic !== null);
        obs.walletSnapshotFingerprint = fingerprint(DOMAINS.WALLET_SNAPSHOT, Object.keys(obs).filter(function (k) { return k !== 'walletSnapshotFingerprint'; }).map(function (k) { return [k, obs[k]]; }));
        freezeDeep(obs);
        authorizationWalletEvidence = obs;
        var snap = record.walletSnapshot;
        ['senderAddress', 'observedChainId', 'tokenBalanceAtomic', 'allowanceAtomic', 'gasReadiness', 'nativeGasBalanceAtomic', 'providerReference', 'accountGeneration', 'chainGeneration', 'providerGeneration'].forEach(function (field) {
          if (obs[field] !== snap[field]) stale.push('wallet evidence changed: ' + field);
        });
        if (obs.gasReadiness !== 'SUFFICIENT') reasons.push('gas readiness blocks authorization');
      } catch (e2) {
        stale.push('complete current wallet observation required: ' + e2.code);
      }
      if (record.invalidation) reasons.push('explicit invalidation: ' + record.invalidation.reason);
      if (input.freshnessPolicy && input.freshnessPolicy.stale === true) stale.push('freshness policy marked stale');
      if (reasons.length) return makeEval(record, REVIEW_STATUS.INVALIDATED, reasons, input, authorizationWalletEvidence);
      if (stale.length) return makeEval(record, REVIEW_STATUS.STALE, stale, input, authorizationWalletEvidence);
      return makeEval(record, REVIEW_STATUS.CURRENT, [], input, authorizationWalletEvidence);
    }

    function authorizationWalletSnapshotFromObservation(obs) {
      return freezeDeep({
        account: obs.senderAddress,
        chainId: obs.observedChainId,
        balanceAtomic: obs.tokenBalanceAtomic,
        allowanceAtomic: obs.allowanceAtomic,
        providerReady: true,
      });
    }

    function makeEval(record, status, reasons, input, authorizationWalletEvidence) {
      var authorizationWalletSnapshot = authorizationWalletEvidence ? authorizationWalletSnapshotFromObservation(authorizationWalletEvidence) : null;
      var authorizationWalletSnapshotFingerprint = authorizationWalletEvidence ? authorizationWalletEvidence.walletSnapshotFingerprint : null;
      var e = {
        schemaVersion: SCHEMAS.REVIEW_ELIGIBILITY,
        evaluationId: input && input.evaluationId ? String(input.evaluationId) : null,
        evaluatedAt: input && input.evaluatedAt ? String(input.evaluatedAt) : null,
        reviewBindingFingerprint: record ? record.reviewBindingFingerprint : null,
        status: status,
        reasons: reasons.slice(),
        currentEvidenceFingerprint: authorizationWalletSnapshotFingerprint,
        authorizationWalletSnapshotFingerprint: authorizationWalletSnapshotFingerprint,
      };
      e.evaluationFingerprint = fingerprint(DOMAINS.REVIEW_ELIGIBILITY, [
        ['schemaVersion', e.schemaVersion], ['evaluationId', e.evaluationId], ['evaluatedAt', e.evaluatedAt],
        ['reviewBindingFingerprint', e.reviewBindingFingerprint], ['status', e.status], ['reasons', e.reasons],
        ['currentEvidenceFingerprint', e.currentEvidenceFingerprint],
        ['authorizationWalletSnapshotFingerprint', e.authorizationWalletSnapshotFingerprint],
      ]);
      freezeDeep(e);
      evaluations.add(e);
      if (authorizationWalletEvidence) {
        evaluationWalletEvidence.set(e, freezeDeep({
          observation: authorizationWalletEvidence,
          authorizationWalletSnapshot: authorizationWalletSnapshot,
          authorizationWalletSnapshotFingerprint: authorizationWalletSnapshotFingerprint,
        }));
      }
      return e;
    }

    function assertCurrent(record, evaluation) {
      if (!isReviewRecord(record)) throw err('INVALID_REVIEW_RECORD', 'reviewRecord must be branded');
      if (!isReviewEligibilityEvaluation(evaluation)) throw err('INVALID_REVIEW_EVALUATION', 'evaluation must be branded');
      if (evaluation.reviewBindingFingerprint !== record.reviewBindingFingerprint) throw err('REVIEW_EVALUATION_MISMATCH', 'evaluation mismatch');
      if (evaluation.status !== REVIEW_STATUS.CURRENT) throw err('REVIEW_NOT_CURRENT', 'review must be CURRENT');
    }

    function buildAuthorizationInputs(record, evaluation) {
      assertCurrent(record, evaluation);
      var t = record.reviewedPaymentTerms;
      var reviewWallet = record.walletSnapshot;
      var evidence = evaluationWalletEvidence.get(evaluation);
      if (!evidence || evidence.authorizationWalletSnapshotFingerprint !== evaluation.authorizationWalletSnapshotFingerprint) throw err('AUTHORIZATION_WALLET_EVIDENCE_MISSING', 'evaluation-bound wallet evidence required');
      var w = evidence.observation;
      var bundle = {
        schemaVersion: SCHEMAS.AUTHORIZATION_INPUT_BUNDLE,
        reviewBindingFingerprint: record.reviewBindingFingerprint,
        eligibilityFingerprint: evaluation.evaluationFingerprint,
        promotedPresentationResult: record.promotedPresentationResult,
        transferIntent: Object.freeze({
          cardId: t.cardId, manifestId: t.manifestId, tokenAddress: t.tokenAddress,
          executionContractAddress: t.executionContractAddress, chainId: t.requiredChainId,
          recipient: t.recipientAddress, recipientAmountAtomic: t.recipientAmountAtomic,
          platformFeeAtomic: t.platformFeeAtomic, totalDebitAtomic: t.totalDebitAtomic,
        }),
        walletSnapshot: evidence.authorizationWalletSnapshot,
        reviewWalletSnapshot: reviewWallet,
        reviewWalletSnapshotFingerprint: reviewWallet.walletSnapshotFingerprint,
        authorizationWalletSnapshotFingerprint: evidence.authorizationWalletSnapshotFingerprint,
        providerReference: w.providerReference,
      };
      bundle.authorizationInputFingerprint = fingerprint(DOMAINS.AUTHORIZATION_INPUT_BUNDLE, [
        ['reviewBindingFingerprint', bundle.reviewBindingFingerprint], ['eligibilityFingerprint', bundle.eligibilityFingerprint],
        ['transferIntent', bundle.transferIntent], ['walletSnapshot', bundle.walletSnapshot],
        ['reviewWalletSnapshotFingerprint', bundle.reviewWalletSnapshotFingerprint],
        ['authorizationWalletSnapshotFingerprint', bundle.authorizationWalletSnapshotFingerprint],
        ['providerReference', bundle.providerReference],
      ]);
      freezeDeep(bundle);
      bundles.add(bundle);
      return bundle;
    }

    function bindExecutionAttempt(input) {
      input = input || {};
      if (!isAuthorizationInputBundle(input.authorizationInputBundle)) throw err('INVALID_AUTHORIZATION_INPUT_BUNDLE', 'branded authorization input bundle required');
      if (authorizationApi.isExecutionAuthorizedResult(input.authorizationResult) !== true) throw err('AUTHORIZATION_RESULT_INVALID', 'authorization result is not branded');
      var bundle = input.authorizationInputBundle;
      var auth = input.authorizationResult;
      var intent = bundle.transferIntent;
      var snap = bundle.walletSnapshot;
      var mismatches = [];
      [['cardId', auth.cardId, intent.cardId], ['manifestId', auth.manifestId, intent.manifestId], ['recipient', auth.recipient, intent.recipient], ['tokenAddress', auth.tokenAddress, intent.tokenAddress], ['executionContractAddress', auth.executionContractAddress, intent.executionContractAddress], ['chainId', auth.chainId, intent.chainId], ['sender', auth.sender, snap.account], ['recipientAmountAtomic', auth.recipientAmountAtomic, intent.recipientAmountAtomic], ['platformFeeAtomic', auth.platformFeeAtomic, intent.platformFeeAtomic], ['totalDebitAtomic', auth.totalDebitAtomic, intent.totalDebitAtomic], ['balanceAtomic', auth.balanceAtomic, snap.balanceAtomic], ['allowanceAtomic', auth.allowanceAtomic, snap.allowanceAtomic]].forEach(function (row) {
        if (row[1] !== row[2]) mismatches.push(row[0]);
      });
      if (mismatches.length) throw err('AUTHORIZATION_BUNDLE_MISMATCH', 'authorization mismatch: ' + mismatches.join(','));
      var providerReference = nonempty(input.providerReference, 'providerReference');
      if (providerReference !== bundle.providerReference) throw err('PROVIDER_REFERENCE_MISMATCH', 'provider reference must match authorization input bundle');
      var attempt = {
        schemaVersion: SCHEMAS.EXECUTION_ATTEMPT,
        attemptId: nonempty(input.attemptId, 'attemptId'),
        authorizationInputBundle: bundle,
        authorizationResult: auth,
        executionPlan: nonempty(auth.executionPlan, 'executionPlan'),
        providerReference: providerReference,
        reviewBindingFingerprint: bundle.reviewBindingFingerprint,
        reviewWalletSnapshotFingerprint: bundle.reviewWalletSnapshotFingerprint,
        authorizationWalletSnapshotFingerprint: bundle.authorizationWalletSnapshotFingerprint,
        eligibilityFingerprint: bundle.eligibilityFingerprint,
        authorizationInputFingerprint: bundle.authorizationInputFingerprint,
      };
      attempt.executionAttemptFingerprint = fingerprint(DOMAINS.EXECUTION_ATTEMPT, [
        ['attemptId', attempt.attemptId], ['executionPlan', attempt.executionPlan],
        ['reviewBindingFingerprint', attempt.reviewBindingFingerprint],
        ['reviewWalletSnapshotFingerprint', attempt.reviewWalletSnapshotFingerprint],
        ['authorizationWalletSnapshotFingerprint', attempt.authorizationWalletSnapshotFingerprint],
        ['eligibilityFingerprint', attempt.eligibilityFingerprint],
        ['providerReference', attempt.providerReference],
        ['authorizationInputFingerprint', attempt.authorizationInputFingerprint],
      ]);
      freezeDeep(attempt);
      attempts.add(attempt);
      return attempt;
    }

    function classifyWalletMutation(input) {
      input = input || {};
      if (!isExecutionAttemptBinding(input.executionAttemptBinding)) return result(MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE, ['execution attempt binding required']);
      if (!input.currentObservation) return result(MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE, ['current observation required']);
      var binding = input.executionAttemptBinding;
      var before = binding.authorizationInputBundle.reviewWalletSnapshot;
      var after;
      try { after = normalizeWalletObservation(input.currentObservation, false); } catch (e) { return result(MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE, ['complete current observation required']); }
      if (after.senderAddress !== before.senderAddress || after.observedChainId !== before.observedChainId || after.providerReference !== binding.providerReference) return result(MUTATION_CLASSIFICATION.UNEXPECTED_EXTERNAL_DRIFT, ['sender, chain, or provider changed']);
      if (after.accountGeneration !== before.accountGeneration || after.chainGeneration !== before.chainGeneration || after.providerGeneration !== before.providerGeneration) return result(MUTATION_CLASSIFICATION.UNEXPECTED_EXTERNAL_DRIFT, ['wallet generation changed']);
      var tokenChanged = after.tokenBalanceAtomic !== before.tokenBalanceAtomic;
      var allowanceChanged = after.allowanceAtomic !== before.allowanceAtomic;
      var gasChanged = after.gasReadiness !== before.gasReadiness || after.nativeGasBalanceAtomic !== before.nativeGasBalanceAtomic;
      if (!tokenChanged && !allowanceChanged && !gasChanged) return result(MUTATION_CLASSIFICATION.NO_CHANGE, []);
      if (BigInt(after.tokenBalanceAtomic) < BigInt(binding.authorizationResult.totalDebitAtomic) || after.gasReadiness !== 'SUFFICIENT') return result(MUTATION_CLASSIFICATION.READINESS_REFRESH_REQUIRED, ['wallet readiness refresh required']);
      return result(MUTATION_CLASSIFICATION.UNSAFE_OR_UNPROVABLE, ['plan-owned mutation classification deferred until trusted execution evidence exists']);
    }

    function result(classification, reasons) { return freezeDeep({ classification: classification, reasons: reasons }); }

    function deriveInteractionProjection(input) { return deriveProjection(input || {}, isReviewRecord, isReviewEligibilityEvaluation, isExecutionAttemptBinding); }
    function evaluateProjectionActions(projection, options) { return actionSet(projection, options); }

    return freezeDeep({
      createDraftIntent: draft,
      isDraftIntent: isDraftIntent,
      createReviewRecord: createReviewRecord,
      isReviewRecord: isReviewRecord,
      evaluateReviewEligibility: evaluateReviewEligibility,
      isReviewEligibilityEvaluation: isReviewEligibilityEvaluation,
      buildAuthorizationInputs: buildAuthorizationInputs,
      isAuthorizationInputBundle: isAuthorizationInputBundle,
      bindExecutionAttempt: bindExecutionAttempt,
      isExecutionAttemptBinding: isExecutionAttemptBinding,
      classifyWalletMutation: classifyWalletMutation,
      deriveInteractionProjection: deriveInteractionProjection,
      evaluateProjectionActions: evaluateProjectionActions,
    });
  }

  function evidenceBlocked(input) {
    return input.integrity === 'INTEGRITY_FAILED' || input.integrity === 'VERIFICATION_UNAVAILABLE'
      || ['REVOKED', 'SUSPENDED', 'SUPERSEDED', 'EXPIRED', 'UNAVAILABLE'].indexOf(input.lifecycle) !== -1
      || input.promotion === 'PROMOTION_BLOCKED' || input.evidenceResolution === 'CONFLICT' || input.evidenceResolution === 'UNAVAILABLE';
  }
  var VOCAB = {
    integrity: ['VERIFIED', 'ASSET_HASHES_PASSED', 'INTEGRITY_FAILED', 'VERIFICATION_UNAVAILABLE'],
    lifecycle: ['ACTIVE', 'SUSPENDED', 'REVOKED', 'SUPERSEDED', 'EXPIRED', 'UNAVAILABLE'],
    promotion: ['NOT_EVALUATED', 'PRESENTATION_PROMOTED', 'PROMOTION_BLOCKED'],
    evidenceResolution: ['CONSISTENT', 'CONFLICT', 'UNAVAILABLE'],
    walletConnection: ['NOT_CONNECTED', 'CONNECTING', 'CONNECTED', 'CONNECTION_REJECTED', 'CONNECTION_UNAVAILABLE'],
    networkCompatibility: ['UNKNOWN', 'MATCHED', 'MISMATCHED', 'SWITCH_REQUESTED', 'SWITCH_REJECTED'],
    fundingReadiness: ['UNKNOWN', 'NOT_EVALUATED', 'SUFFICIENT', 'INSUFFICIENT_TOKEN', 'INSUFFICIENT_GAS', 'UNAVAILABLE'],
    authorization: ['NOT_REQUESTED', 'EVALUATING', 'EXECUTION_AUTHORIZED', 'BLOCKED', 'PROOF_CONSUMED'],
    allowanceApproval: ['NOT_REQUIRED', 'REQUIRED', 'WALLET_DECISION_PENDING', 'SUBMITTED', 'CONFIRMED', 'REJECTED', 'FAILED', 'OUTCOME_UNKNOWN'],
    transferExecution: ['NOT_STARTED', 'WALLET_DECISION_PENDING', 'SUBMISSION_PENDING', 'SUBMITTED', 'REJECTED', 'FAILED'],
    settlement: ['NOT_SUBMITTED', 'CONFIRMATION_PENDING', 'CONFIRMED', 'FAILED', 'OUTCOME_UNKNOWN', 'UNCLEAR'],
  };
  function deriveProjection(input, isReview, isEval, isAttempt) {
    var c = [];
    Object.keys(VOCAB).forEach(function (k) { if (input[k] !== undefined && VOCAB[k].indexOf(input[k]) === -1) c.push('unknown ' + k + ': ' + input[k]); });
    var currentReview = isReview(input.reviewRecord) && isEval(input.reviewEligibilityEvaluation) && input.reviewEligibilityEvaluation.status === REVIEW_STATUS.CURRENT && input.reviewEligibilityEvaluation.reviewBindingFingerprint === input.reviewRecord.reviewBindingFingerprint;
    var hasAttempt = isAttempt(input.executionAttemptBinding);
    var attemptPlan = hasAttempt ? input.executionAttemptBinding.executionPlan : null;
    var effectivePlan = attemptPlan || input.executionPlan;
    if (hasAttempt && input.executionPlan !== undefined && input.executionPlan !== attemptPlan) c.push('executionPlan contradicts attempt binding');
    if ((input.reviewStatus || input.hasReviewRecord) && !currentReview) c.push('review projection requires branded review and matching current evaluation');
    if (input.authorization === 'EXECUTION_AUTHORIZED' && !hasAttempt) c.push('authorized state requires execution-attempt binding');
    if (input.authorization === 'PROOF_CONSUMED' && !hasAttempt) c.push('proof-consumed state requires execution-attempt binding');
    if (input.authorization === 'EVALUATING' && !currentReview && !hasAttempt) c.push('authorization evaluating requires current review or attempt binding');
    if (input.transferExecution === 'SUBMITTED' && input.settlement === 'NOT_SUBMITTED') c.push('submitted transfer contradicts NOT_SUBMITTED settlement');
    if (input.settlement === 'CONFIRMED' && !meaningfulTx(input.transactionEvidence)) c.push('success requires meaningful transaction evidence');
    if (input.transferExecution === 'SUBMITTED' && !meaningfulTx(input.transactionEvidence)) c.push('submitted transfer requires meaningful transaction evidence');
    if (input.allowanceApproval !== undefined && ['WALLET_DECISION_PENDING', 'SUBMITTED', 'CONFIRMED', 'OUTCOME_UNKNOWN'].indexOf(input.allowanceApproval) !== -1 && !hasAttempt) c.push('token approval phase requires execution-attempt binding');
    if (effectivePlan === 'TRANSFER_ONLY' && ['REQUIRED', 'WALLET_DECISION_PENDING', 'SUBMITTED', 'CONFIRMED', 'OUTCOME_UNKNOWN'].indexOf(input.allowanceApproval) !== -1) c.push('TRANSFER_ONLY cannot have token approval phase');
    if (input.allowanceApproval === 'SUBMITTED' && !meaningfulTx(input.approvalEvidence)) c.push('submitted token approval requires meaningful approval evidence');
    if (input.allowanceApproval === 'OUTCOME_UNKNOWN' && !meaningfulTx(input.approvalEvidence)) c.push('unknown token approval requires preserved approval evidence');
    if (input.allowanceApproval === 'CONFIRMED' && !meaningfulTx(input.approvalEvidence)) c.push('confirmed token approval requires confirmation evidence');
    if ((input.transferExecution === 'WALLET_DECISION_PENDING' || input.transferExecution === 'SUBMISSION_PENDING') && !hasAttempt) c.push('transfer phase requires execution-attempt binding');
    if (input.cancelled === true && (input.transferExecution === 'SUBMITTED' || input.settlement === 'CONFIRMATION_PENDING')) c.push('ordinary cancel after broadcast is invalid');
    if (input.allowAuthorization === true && evidenceBlocked(input)) c.push('authorization cannot be allowed while evidence is blocked');
    if (input.reviewEligibilityEvaluation && input.reviewEligibilityEvaluation.status !== REVIEW_STATUS.CURRENT && input.allowAuthorization === true) c.push('stale or invalid review cannot allow authorization');
    if (c.length) return projection(PROJECTIONS.INTERNAL_INCONSISTENCY, c, input.presentation);

    if (input.settlement === 'CONFIRMED') return projection(PROJECTIONS.SUCCEEDED, ['settlement confirmed'], input.presentation);
    if (input.settlement === 'FAILED') return projection(PROJECTIONS.FAILED, ['settlement failed'], input.presentation);
    if (input.settlement === 'OUTCOME_UNKNOWN' || input.settlement === 'UNCLEAR' || input.allowanceApproval === 'OUTCOME_UNKNOWN') return projection(PROJECTIONS.OUTCOME_UNKNOWN, ['outcome unknown'], input.presentation);
    if (input.settlement === 'CONFIRMATION_PENDING' || input.transferExecution === 'SUBMITTED') return projection(PROJECTIONS.CONFIRMATION_PENDING, ['transaction submitted'], input.presentation);
    if (input.transferExecution === 'SUBMISSION_PENDING') return projection(PROJECTIONS.TRANSFER_SUBMISSION_PENDING, ['transfer submission pending'], input.presentation);
    if (input.transferExecution === 'WALLET_DECISION_PENDING') return projection(PROJECTIONS.TRANSFER_DECISION_PENDING, ['transfer wallet decision pending'], input.presentation);
    if (input.allowanceApproval === 'SUBMITTED') return projection(PROJECTIONS.TOKEN_APPROVAL_PENDING, ['token approval submitted'], input.presentation);
    if (input.allowanceApproval === 'WALLET_DECISION_PENDING') return projection(PROJECTIONS.TOKEN_APPROVAL_DECISION_PENDING, ['token approval wallet decision pending'], input.presentation);
    if (input.allowanceApproval === 'CONFIRMED' && hasAttempt) return projection(PROJECTIONS.AUTHORIZATION_IN_PROGRESS, ['token approval confirmed; transfer not complete'], input.presentation);
    if (input.transferExecution === 'REJECTED' || input.allowanceApproval === 'REJECTED') return projection(PROJECTIONS.CANCELLED, ['wallet rejected before broadcast'], input.presentation);
    if (input.transferExecution === 'FAILED' || input.allowanceApproval === 'FAILED' || input.authorization === 'BLOCKED') return projection(PROJECTIONS.FAILED, ['attempt failed'], input.presentation);
    if (input.authorization === 'EVALUATING' || (input.authorization === 'EXECUTION_AUTHORIZED' && hasAttempt) || (input.authorization === 'PROOF_CONSUMED' && hasAttempt)) return projection(PROJECTIONS.AUTHORIZATION_IN_PROGRESS, ['authorization attempt in progress'], input.presentation);
    if (input.cancelled === true) return projection(PROJECTIONS.CANCELLED, ['cancelled before broadcast'], input.presentation);
    if (evidenceBlocked(input)) return projection(PROJECTIONS.EVIDENCE_BLOCKED, ['evidence blocks execution'], input.presentation);
    if (currentReview) return projection(PROJECTIONS.REVIEWING, ['current branded review and evaluation'], input.presentation);
    if (input.draftValid === true) {
      if (input.walletConnection !== 'CONNECTED') return projection(PROJECTIONS.WALLET_REQUIRED, ['wallet not connected'], input.presentation);
      if (input.networkCompatibility === 'MISMATCHED') return projection(PROJECTIONS.WRONG_NETWORK, ['wrong network'], input.presentation);
      if (input.fundingReadiness === 'INSUFFICIENT_TOKEN' || input.fundingReadiness === 'INSUFFICIENT_GAS' || input.fundingReadiness === 'UNAVAILABLE') return projection(PROJECTIONS.INSUFFICIENT_FUNDS, ['funding readiness blocked'], input.presentation);
      if (input.integrity === 'VERIFIED' && input.promotion === 'PRESENTATION_PROMOTED' && input.networkCompatibility === 'MATCHED' && (input.fundingReadiness === 'SUFFICIENT' || input.fundingReadiness === 'NOT_EVALUATED' || input.fundingReadiness === 'UNKNOWN')) return projection(PROJECTIONS.READY_FOR_REVIEW, ['ready to collect review evidence'], input.presentation);
      return projection(PROJECTIONS.CONFIGURING, ['configuring'], input.presentation);
    }
    if (input.cardPresented === true) return projection(PROJECTIONS.PRESENTED, ['card presented'], input.presentation);
    return projection(PROJECTIONS.INTERNAL_INCONSISTENCY, ['no presentable card state'], input.presentation);
  }
  function meaningfulTx(v) { return v && typeof v === 'object' && typeof v.txHash === 'string' && v.txHash.length > 0; }
  function projection(p, reasons, options) {
    var actions = actionSet(p, options);
    return freezeDeep({ projection: p, reasons: reasons || [], allowedActions: actions.allowed, prohibitedActions: actions.prohibited });
  }
  function actionSet(p, options) {
    options = options || {};
    var allowed = [ACTIONS.INSPECT_EVIDENCE];
    function allow(a) { if (allowed.indexOf(a) === -1) allowed.push(a); }
    if (p === PROJECTIONS.PRESENTED) allow(ACTIONS.EXPAND_PRESENTATION);
    if (p === PROJECTIONS.CONFIGURING) { allow(ACTIONS.EDIT_DRAFT); allow(ACTIONS.CONNECT_WALLET); }
    if (p === PROJECTIONS.WALLET_REQUIRED) { allow(ACTIONS.EDIT_DRAFT); allow(ACTIONS.CONNECT_WALLET); }
    if (p === PROJECTIONS.WRONG_NETWORK) { allow(ACTIONS.EDIT_DRAFT); allow(ACTIONS.REQUEST_NETWORK_SWITCH); }
    if (p === PROJECTIONS.INSUFFICIENT_FUNDS) { allow(ACTIONS.EDIT_DRAFT); allow(ACTIONS.REFRESH_WALLET_READINESS); }
    if (p === PROJECTIONS.READY_FOR_REVIEW) { allow(ACTIONS.EDIT_DRAFT); allow(ACTIONS.ENTER_REVIEW); }
    if (p === PROJECTIONS.REVIEWING) { allow(ACTIONS.EXIT_REVIEW); allow(ACTIONS.AUTHORIZE); allow(ACTIONS.CANCEL_PRE_BROADCAST); }
    if ([PROJECTIONS.AUTHORIZATION_IN_PROGRESS, PROJECTIONS.TOKEN_APPROVAL_DECISION_PENDING, PROJECTIONS.TOKEN_APPROVAL_PENDING, PROJECTIONS.TRANSFER_DECISION_PENDING, PROJECTIONS.TRANSFER_SUBMISSION_PENDING, PROJECTIONS.CONFIRMATION_PENDING].indexOf(p) !== -1) { allow(ACTIONS.WAIT); allow(ACTIONS.INSPECT_TRANSACTION); }
    if (p === PROJECTIONS.OUTCOME_UNKNOWN) { allow(ACTIONS.RECONCILE_UNKNOWN_OUTCOME); allow(ACTIONS.INSPECT_TRANSACTION); }
    if ([PROJECTIONS.SUCCEEDED, PROJECTIONS.FAILED, PROJECTIONS.CANCELLED].indexOf(p) !== -1) { allow(ACTIONS.INSPECT_TRANSACTION); allow(ACTIONS.BEGIN_FRESH_ATTEMPT); }
    if (p === PROJECTIONS.EVIDENCE_BLOCKED || p === PROJECTIONS.INTERNAL_INCONSISTENCY) allow(ACTIONS.WAIT);
    if (options.compact === true) {
      allowed = allowed.filter(function (a) { return a !== ACTIONS.AUTHORIZE && a !== ACTIONS.ENTER_REVIEW; });
      allow(ACTIONS.EXPAND_PRESENTATION);
    }
    if (options.allowAuthorization === false) {
      allowed = allowed.filter(function (a) { return a !== ACTIONS.AUTHORIZE; });
    }
    if (options.allowReview === false) {
      allowed = allowed.filter(function (a) { return a !== ACTIONS.ENTER_REVIEW; });
    }
    if (options.allowEdit === false) {
      allowed = allowed.filter(function (a) { return a !== ACTIONS.EDIT_DRAFT && a !== ACTIONS.EXIT_REVIEW; });
    }
    var all = Object.keys(ACTIONS).map(function (k) { return ACTIONS[k]; });
    return freezeDeep({ allowed: allowed, prohibited: all.filter(function (a) { return allowed.indexOf(a) === -1; }) });
  }

  return freezeDeep({
    SCHEMAS: SCHEMAS, DOMAINS: DOMAINS, REVIEW_STATUS: REVIEW_STATUS,
    MUTATION_CLASSIFICATION: MUTATION_CLASSIFICATION, PROJECTIONS: PROJECTIONS, ACTIONS: ACTIONS,
    createDraftIntent: createDraftIntent,
    createReviewProjectionRuntime: createReviewProjectionRuntime,
    _test: Object.freeze({ encodeCanonical: encodeCanonical, fingerprint: fingerprint }),
  });
}));
