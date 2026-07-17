/* card.js — Coin Card live surface state machine
 *
 * States:
 *   BOOT                  → initializing; reading card ID from URL
 *   MANIFEST_LOADING      → fetching Coin Card Registry Record
 *   CONFIGURE             → registry record valid; payer configures draft
 *   REVIEW_PREPARING      → collecting frozen review evidence
 *   REVIEW                → visible frozen review projection
 *   AUTHORIZING           → synchronously evaluating current authorization
 *   EXECUTING             → wallet write path active before broadcast
 *   CONFIRMATION_PENDING  → transaction broadcast; awaiting receipt
 *   COMPLETE              → transfer confirmed on-chain
 *   REVOKED               → registry record revoked; transfer blocked
 *   CONNECTING            → wallet connect in progress
 *   WRONG_NETWORK         → connected but on wrong chain
 *   SWITCHING_NETWORK     → chain switch in progress
 *   TX_FAILED             → execution error (card visible; error panel shown)
 *   ERROR                 → registry-record-level error (card hidden; frame error shown)
 *
 * Body panels (CSS data-state rules control visibility):
 *   #ccBodyInput     — amount entry
 *   #ccBodyReview    — frozen visible review
 *   #ccBodyExec      — execution in-progress
 *   #ccBodyConfirmed — settled
 *   #ccBodyError     — TX_FAILED / REVOKED
 *
 * Chip states (class on #ccChip):
 *   cc-card-chip--waiting  → not actionable; slow pulse
 *   cc-card-chip--ready    → actionable; solid border
 *   cc-card-chip--active   → wallet prompt open / on-chain
 *   cc-card-chip--done     → terminal
 *
 * Execution:
 *   All fund-moving writes route through window.IX_EXECUTION (js/ix-execution.js).
 *   No direct eth_sendTransaction outside IX_EXECUTION.
 *
 * PostMessage bridge (iframe → parent):
 *   { source:'implicitex-coincard', type:'CC_READY',          cardId, payload:{ recipient, chainId, token, owner } }
 *   { source:'implicitex-coincard', type:'CC_AMOUNT_CHANGED',  cardId, payload:{ amountText, fee, total } }
 *   { source:'implicitex-coincard', type:'CC_REVIEW_READY',    cardId, payload:{ sender, reviewId } }
 *   { source:'implicitex-coincard', type:'CC_CONFIRMED',       cardId, payload:{ txHash, sender, intent, receipt } }
 *   { source:'implicitex-coincard', type:'CC_ERROR',           cardId, payload:{ message } }
 *
 * PostMessage bridge (parent → iframe):
 *   { source:'coincard-host', type:'CC_THEME', payload:{ theme:'dark'|'light' } }
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Constants
   * ---------------------------------------------------------------- */
  var CARD_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/;

  var CHAIN_NAMES = {
    '137':   'Polygon',
    '80002': 'Polygon Amoy',
    '1':     'Ethereum',
  };

  /* Fee calculation delegated to window.IX_EXECUTION.calculateFee() */
  var CHAIN_MIN_USDC = { 137: 1,   80002: 1,   1: 1   };
  var CHAIN_MAX_USDC = { 137: 250, 80002: 250, 1: 250  };

  /*
   * COIN_CARD_GAS_POLICY_ID — Coin Card's authoritative policy binding.
   *
   * This is the Coin Card's canonical policy registration with the gas-policy
   * registry (window.IX_EXECUTION_GAS_POLICY). The value matches the POLICY_ID
   * constant inside ix-execution-gas-policy.js and the registry key
   * REGISTRY['COIN_CARD_POLYGON_V1']. If the gas-policy module is absent or
   * does not recognize this ID, execution fails closed before any wallet call.
   *
   * Do NOT derive this ID from a dynamic source. It is a static policy binding
   * owned by the Coin Card and must match the policy module exactly.
   */
  var COIN_CARD_GAS_POLICY_ID = 'COIN_CARD_POLYGON_V1';

  /* ----------------------------------------------------------------
   * State machine
   * ---------------------------------------------------------------- */
  var QR_LIBRARY_STATE = Object.freeze({
    NOT_REQUESTED: 'NOT_REQUESTED',
    LOADING:       'LOADING',
    READY:         'READY',
    FAILED:        'FAILED',
  });

  var state = {
    current:             'BOOT',
    cardId:              null,
    registryRecord:      null,
    trustedParentOrigin: null,
    amount:              null,
    amountText:          '',
    fee:                 null,
    total:               null,
    rawAmount:           null,   /* BigInt — recipientAmountAtomic for authorization */
    rawFee:              null,   /* BigInt — platformFeeAtomic for authorization */
    rawTotal:            null,   /* BigInt — totalDebitAtomic for authorization */
    draft:               null,
    draftRevision:       0,
    editGeneration:      0,
    draftId:             'coin-card-draft-session',
    reviewRecord:        null,
    reviewEligibility:   null,
    currentWalletObservation: null,
    currentEvidenceState: 'UNAVAILABLE',
    authorizationInputBundle: null,
    executionAttemptBinding: null,
    operationInFlight:   false,
    activeExecutionAttempt: null,
    reviewSequence:      0,
    lastReviewBlockReason: null,
    sender:              null,
    /*
     * activeProvider — the EIP-1193 provider resolved at wallet connect time.
     * Set by connectWallet() when the 'prepare' action returns 'ready-to-send'
     * or 'wrong-network'. Remains set through snapshot, authorization, and
     * execution. The same provider object is passed to readWalletSnapshot()
     * and to executeTransfer() as both request.provider and request.snapshotProvider.
     * Cleared if the card returns to an unconnected Configure state.
     */
    activeProvider:      null,
    providerReference:   null,
    providerGeneration:  0,
    accountGeneration:   0,
    chainGeneration:     0,
    observedAccount:     null,
    observedChainId:     null,
    observationGeneration: 0,
    manifestId:          null,   /* manifestHash from verification result, used as lifecycle manifestId */
    reviewRuntime:       null,
    reviewRuntimeError:  null,
    resolvedLifecycleResult: null, /* genuine branded resolver result retained for future ReviewRecord construction */
    lifecycleReference:  null,   /* plain diagnostic/binding reference derived from resolvedLifecycleResult */
    promotedPresentationResult: null, /* result of lifecycle pipeline; set async after VERIFIED */
    integrityManifestVerificationState: 'VERIFICATION_UNAVAILABLE',
    qrLibraryState:       QR_LIBRARY_STATE.NOT_REQUESTED,
    qrLibraryAttestation: null,
  };

  /* Cached promise from loadQrLibrary(). Repeated calls return the same
   * promise; the UI can attach .then()/.catch() rather than polling state. */
  var qrLibraryPromise = null;

  var frame = document.getElementById('ccFrame');
  var verification = window.IX_COIN_CARD_VERIFICATION || null;
  var providerReferences = typeof WeakMap === 'function' ? new WeakMap() : null;
  var providerListeners = typeof WeakSet === 'function' ? new WeakSet() : null;
  var startedExecutionAttempts = typeof WeakSet === 'function' ? new WeakSet() : null;
  var providerReferenceSeq = 0;
  var USDC_ATOMIC_SCALE = 1000000n;

  var SHELL_ACTIVE_STATES = {
    CONFIGURE: true, REVIEW_PREPARING: true, REVIEW: true,
    AUTHORIZING: true, EXECUTING: true, CONFIRMATION_PENDING: true,
    COMPLETE: true, VERIFIED: true,
    REVOKED: true, CONNECTING: true, WRONG_NETWORK: true,
    SWITCHING_NETWORK: true, TX_FAILED: true,
    OUTCOME_UNKNOWN: true,
  };

  function transition(next) {
    state.current = next;
    frame.dataset.state = next;
    frame.classList.toggle('is-active', !!SHELL_ACTIVE_STATES[next]);
  }

  /* ----------------------------------------------------------------
   * DOM helpers
   * ---------------------------------------------------------------- */
  function el(id) { return document.getElementById(id); }
  function setText(id, text) { var e = el(id); if (e) e.textContent = text; }

  /* ----------------------------------------------------------------
   * PostMessage bridge
   * ---------------------------------------------------------------- */
  function isAllowedParentOrigin(origin) {
    var allowed = (state.registryRecord && state.registryRecord.allowedParentOrigins) || [];
    return allowed.includes('*') || allowed.includes(origin);
  }

  function emit(type, payload) {
    if (!window.parent || window.parent === window) return;
    var allowed = (state.registryRecord && state.registryRecord.allowedParentOrigins) || [];
    var targetOrigin = state.trustedParentOrigin
      || (allowed.includes('*') ? '*' : '*');
    window.parent.postMessage({
      source:  'implicitex-coincard',
      type:    type,
      cardId:  state.cardId || null,
      payload: payload || {},
    }, targetOrigin);
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.source !== 'coincard-host') return;
    if (!state.registryRecord) return;
    if (!isAllowedParentOrigin(event.origin)) return;
    if (!state.trustedParentOrigin) state.trustedParentOrigin = event.origin;
  });

  /* ----------------------------------------------------------------
   * generateTraceId — opaque per-execution correlation identifier
   * ---------------------------------------------------------------- */
  function generateTraceId() {
    return 'cc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function normalizeAddress(value) {
    return (typeof value === 'string') ? value.toLowerCase() : null;
  }

  function normalizeChainId(value) {
    var max = BigInt(Number.MAX_SAFE_INTEGER);
    var parsed = null;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value <= 0) return null;
      return value;
    }
    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) parsed = BigInt(value);
    else if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) parsed = BigInt(value);
    else return null;
    if (parsed <= 0n || parsed > max) return null;
    return Number(parsed);
  }

  function getProviderReference(provider) {
    if (!provider || typeof provider.request !== 'function') return null;
    if (!providerReferences) return null;
    if (!providerReferences.has(provider)) {
      providerReferenceSeq += 1;
      providerReferences.set(provider, 'provider:session:' + providerReferenceSeq);
    }
    return providerReferences.get(provider);
  }

  function noteProvider(provider) {
    var ref = getProviderReference(provider);
    if (!ref) return null;
    if (state.providerReference !== ref) {
      state.providerReference = ref;
      state.providerGeneration += 1;
    }
    attachProviderListeners(provider);
    return ref;
  }

  function noteAccount(account) {
    var normalized = normalizeAddress(account);
    if (!normalized) return null;
    if (state.observedAccount !== normalized) {
      state.observedAccount = normalized;
      state.accountGeneration += 1;
    }
    return normalized;
  }

  function noteChain(chainId) {
    var normalized = normalizeChainId(chainId);
    if (!normalized) return null;
    if (state.observedChainId !== normalized) {
      state.observedChainId = normalized;
      state.chainGeneration += 1;
    }
    return normalized;
  }

  function attachProviderListeners(provider) {
    if (!provider || typeof provider.on !== 'function' || !providerListeners) return;
    if (providerListeners.has(provider)) return;
    providerListeners.add(provider);
    provider.on('accountsChanged', function (accounts) {
      if (provider !== state.activeProvider) return;
      var account = accounts && accounts.length ? accounts[0] : null;
      if (account) noteAccount(account);
      else {
        state.observedAccount = null;
        state.accountGeneration += 1;
      }
    });
    provider.on('chainChanged', function (chainId) {
      if (provider !== state.activeProvider) return;
      var normalized = normalizeChainId(chainId);
      if (normalized) noteChain(normalized);
      else {
        state.observedChainId = null;
        state.chainGeneration += 1;
      }
    });
  }

  function initializeReviewRuntime() {
    if (state.reviewRuntime || state.reviewRuntimeError) return state.reviewRuntime;
    var reviewContract = window.IX_COIN_CARD_REVIEW_PROJECTION_CONTRACT;
    try {
      if (!reviewContract || typeof reviewContract.createReviewProjectionRuntime !== 'function') {
        throw new Error('Review projection contract unavailable');
      }
      state.reviewRuntime = reviewContract.createReviewProjectionRuntime({
        presentationApi: window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
        lifecycleResolutionApi: window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
        authorizationApi: window.IX_COIN_CARD_EXECUTION_AUTHORIZATION,
      });
      state.reviewRuntimeError = null;
      return state.reviewRuntime;
    } catch (error) {
      state.reviewRuntime = null;
      state.reviewRuntimeError = error && error.message || 'Review runtime unavailable';
      return null;
    }
  }

  function parseUsdcAtomicString(input) {
    var text = typeof input === 'string' ? input.trim() : '';
    if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(text)) {
      throw new Error('Invalid USDC decimal amount');
    }
    var parts = text.split('.');
    var whole = BigInt(parts[0]);
    var fractional = parts[1] || '';
    while (fractional.length < 6) fractional += '0';
    var atomic = whole * USDC_ATOMIC_SCALE + BigInt(fractional || '0');
    return atomic.toString(10);
  }

  function limitAtomic(units) {
    return BigInt(units) * USDC_ATOMIC_SCALE;
  }

  function prepareContractDraftAmounts(amountText, chainId, feeBps) {
    var normalizedChainId = normalizeChainId(chainId);
    if (
      !normalizedChainId ||
      !Object.prototype.hasOwnProperty.call(CHAIN_MIN_USDC, normalizedChainId) ||
      !Object.prototype.hasOwnProperty.call(CHAIN_MAX_USDC, normalizedChainId)
    ) {
      throw new Error('Unsupported chain policy');
    }
    var recipientAmountAtomic = parseUsdcAtomicString(amountText);
    var min = CHAIN_MIN_USDC[normalizedChainId];
    var max = CHAIN_MAX_USDC[normalizedChainId];
    var raw = BigInt(recipientAmountAtomic);
    if (raw < limitAtomic(min) || raw > limitAtomic(max)) {
      throw new Error('Amount outside supported range');
    }
    if (!window.IX_EXECUTION || typeof window.IX_EXECUTION.calculateFee !== 'function') {
      throw new Error('Execution fee policy unavailable');
    }
    var feeResult = window.IX_EXECUTION.calculateFee(raw, normalizedChainId, feeBps);
    var platformFeeAtomic = String(feeResult.fee);
    var totalDebitAtomic = String(feeResult.total);
    if (raw + BigInt(platformFeeAtomic) !== BigInt(totalDebitAtomic)) {
      throw new Error('Amount/fee/total invariant failed');
    }
    return Object.freeze({
      recipientAmountAtomic: recipientAmountAtomic,
      platformFeeAtomic: platformFeeAtomic,
      totalDebitAtomic: totalDebitAtomic,
    });
  }

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { freezeDeep(value[key]); });
    return Object.freeze(value);
  }

  function atomicToDecimal(atomic) {
    var text = String(atomic || '0');
    while (text.length <= 6) text = '0' + text;
    var whole = text.slice(0, -6);
    var frac = text.slice(-6).replace(/0+$/, '');
    return frac ? whole + '.' + frac : whole;
  }

  function atomicToFixed2(atomic) {
    var value = BigInt(atomic || '0');
    var cents = (value + 5000n) / 10000n;
    var whole = cents / 100n;
    var frac = String(cents % 100n).padStart(2, '0');
    return whole.toString(10) + '.' + frac;
  }

  function atomicToExactDisplay(atomic) {
    var text = String(atomic || '0');
    while (text.length <= 6) text = '0' + text;
    var whole = text.slice(0, -6);
    var frac = text.slice(-6).replace(/0+$/, '');
    if (!frac) return whole + '.00';
    return whole + '.' + frac;
  }

  function abbreviate(value) {
    if (typeof value !== 'string') return '\u2014';
    return value.length >= 12 ? value.slice(0, 6) + '\u2026' + value.slice(-4) : value;
  }

  function invalidateReview(reason) {
    state.reviewRecord = null;
    state.reviewEligibility = null;
    state.currentWalletObservation = null;
    state.currentEvidenceState = 'UNAVAILABLE';
    state.authorizationInputBundle = null;
    state.executionAttemptBinding = null;
    state.activeExecutionAttempt = null;
    state.lastReviewBlockReason = reason || null;
  }

  function draftSemanticFingerprint(draft) {
    if (!draft) return null;
    return [
      draft.cardId, draft.manifestId, draft.recipientAddress,
      draft.tokenAddress, draft.executionContractAddress, draft.requiredChainId,
      draft.token, draft.recipientAmountAtomic, draft.platformFeeAtomic,
      draft.totalDebitAtomic,
    ].join('|');
  }

  function buildDraftFromAmountText(amountText, revisionOverride) {
    if (!state.registryRecord || !state.manifestId) return null;
    var m = state.registryRecord;
    var chainParams = window.IX_EXECUTION && window.IX_EXECUTION.getChainParams
      ? window.IX_EXECUTION.getChainParams(m.chainId)
      : null;
    if (!chainParams) return null;
    var amounts = prepareContractDraftAmounts(amountText, m.chainId, m.feeBps);
    var revision = String(revisionOverride || (state.draftRevision + 1));
    var draft = freezeDeep({
      schemaVersion: 'coin-card-runtime-draft.v1',
      draftId: state.draftId,
      revision: revision,
      cardId: m.cardId,
      manifestId: state.manifestId,
      displayName: m.displayName || '',
      recipientAddress: m.recipient,
      tokenAddress: chainParams.usdcAddress,
      executionContractAddress: chainParams.contractAddress,
      requiredChainId: normalizeChainId(m.chainId),
      token: (m.token || 'USDC').toUpperCase(),
      originalAmountText: amountText,
      canonicalAmountText: atomicToDecimal(amounts.recipientAmountAtomic),
      amountText: amountText,
      recipientAmountAtomic: amounts.recipientAmountAtomic,
      platformFeeAtomic: amounts.platformFeeAtomic,
      totalDebitAtomic: amounts.totalDebitAtomic,
      createdAt: 'draft-revision:' + revision,
      updatedAt: 'draft-revision:' + revision,
    });
    return draft;
  }

  function commitDraftFromInput(amountText) {
    var nextDraft;
    try {
      nextDraft = buildDraftFromAmountText(amountText);
    } catch (error) {
      nextDraft = null;
    }
    var previous = state.draft;
    var changed = !previous || !nextDraft || draftSemanticFingerprint(previous) !== draftSemanticFingerprint(nextDraft);
    if (nextDraft && changed) {
      state.editGeneration += 1;
      state.draftRevision += 1;
      nextDraft = buildDraftFromAmountText(amountText, state.draftRevision);
      state.draft = nextDraft;
      invalidateReview('draft-changed');
    } else if (nextDraft && previous) {
      state.editGeneration += previous.originalAmountText === amountText ? 0 : 1;
      state.draft = previous;
    } else if (!nextDraft) {
      state.editGeneration += 1;
      state.draft = null;
      invalidateReview('draft-invalid');
    }
    return state.draft;
  }

  function transferIntentFromDraft(draft) {
    if (!draft) return null;
    return Object.freeze({
      cardId: draft.cardId,
      manifestId: draft.manifestId,
      tokenAddress: draft.tokenAddress,
      executionContractAddress: draft.executionContractAddress,
      chainId: draft.requiredChainId,
      recipient: draft.recipientAddress,
      recipientAmountAtomic: draft.recipientAmountAtomic,
      platformFeeAtomic: draft.platformFeeAtomic,
      totalDebitAtomic: draft.totalDebitAtomic,
    });
  }

  function reviewDraftIntentFromDraft(draft) {
    return state.reviewRuntime.createDraftIntent({
      draftId: draft.draftId,
      revision: draft.revision,
      cardId: draft.cardId,
      manifestId: draft.manifestId,
      recipientAddress: draft.recipientAddress,
      tokenAddress: draft.tokenAddress,
      executionContractAddress: draft.executionContractAddress,
      requiredChainId: draft.requiredChainId,
      recipientAmountAtomic: draft.recipientAmountAtomic,
      platformFeeAtomic: draft.platformFeeAtomic,
      totalDebitAtomic: draft.totalDebitAtomic,
    });
  }

  function captureContinuity() {
    return Object.freeze({
      provider: state.activeProvider,
      providerReference: state.providerReference,
      providerGeneration: state.providerGeneration,
      accountGeneration: state.accountGeneration,
      chainGeneration: state.chainGeneration,
      editGeneration: state.editGeneration,
      observedAccount: state.observedAccount,
      observedChainId: state.observedChainId,
      resolvedLifecycleResult: state.resolvedLifecycleResult,
      promotedPresentationResult: state.promotedPresentationResult,
      lifecycleReference: state.lifecycleReference,
    });
  }

  function continuityMatches(capture) {
    return !!capture
      && capture.provider === state.activeProvider
      && capture.providerReference === state.providerReference
      && capture.providerGeneration === state.providerGeneration
      && capture.accountGeneration === state.accountGeneration
      && capture.chainGeneration === state.chainGeneration
      && capture.editGeneration === state.editGeneration
      && capture.resolvedLifecycleResult === state.resolvedLifecycleResult
      && capture.promotedPresentationResult === state.promotedPresentationResult;
  }

  function buildPlanInput(draft, walletObservation) {
    return Object.freeze({
      chainId: draft.requiredChainId,
      sender: walletObservation.senderAddress,
      recipient: draft.recipientAddress,
      recipientAmountAtomic: draft.recipientAmountAtomic,
      totalDebitAtomic: draft.totalDebitAtomic,
      allowanceAtomic: walletObservation.allowanceAtomic,
    });
  }

  function assessGasReadiness(provider, draft, partialObservation) {
    if (!window.IX_EXECUTION || typeof window.IX_EXECUTION.estimateNativeGasRequirement !== 'function') {
      return Promise.resolve(Object.freeze({ status: 'UNAVAILABLE', reason: 'gas-policy-unavailable' }));
    }
    return window.IX_EXECUTION.estimateNativeGasRequirement(provider, buildPlanInput(draft, partialObservation))
      .then(function (estimate) {
        if (!estimate || estimate.status !== 'AVAILABLE') {
          return Object.freeze({
            status: 'UNAVAILABLE',
            reason: estimate && estimate.reason || 'gas-estimate-unavailable',
            estimate: estimate || null,
          });
        }
        var balance = BigInt(partialObservation.nativeGasBalanceAtomic || '0');
        var required = BigInt(estimate.nativeGasRequiredAtomic);
        return Object.freeze({
          status: balance >= required ? 'SUFFICIENT' : 'INSUFFICIENT',
          requiredAtomic: estimate.nativeGasRequiredAtomic,
          balanceAtomic: partialObservation.nativeGasBalanceAtomic,
          transactionCount: estimate.transactionCount,
          estimate: estimate,
        });
      })
      .catch(function () {
        return Object.freeze({ status: 'UNAVAILABLE', reason: 'gas-readiness-unavailable' });
      });
  }

  function buildLifecycleReference(resolved) {
    if (!resolved || typeof resolved !== 'object') return null;
    return Object.freeze({
      status: resolved.outcome === 'LIFECYCLE_ACTIVE' ? 'ACTIVE' : resolved.outcome || null,
      cardId: resolved.cardId || null,
      manifestId: resolved.resolvedManifestId || null,
      revision: resolved.resolvedRevision || null,
      recordId: resolved.resolvedRecordId || null,
      registryId: resolved.registryId || null,
      registryVersion: resolved.registryVersion || null,
    });
  }

  function readNativeGasBalance(provider, account) {
    if (!provider || typeof provider.request !== 'function' || !account) {
      return Promise.resolve({ status: 'UNAVAILABLE' });
    }
    return provider.request({
      method: 'eth_getBalance',
      params: [account, 'latest'],
    }).then(function (hex) {
      return {
        status: 'AVAILABLE',
        value: (hex && hex !== '0x') ? BigInt(hex).toString(10) : '0',
      };
    }).catch(function () {
      return { status: 'UNAVAILABLE' };
    });
  }

  function makeUnavailableWalletObservation(reason, partial) {
    return Object.freeze({
      status: 'UNAVAILABLE',
      reason: reason,
      walletObservation: partial ? Object.freeze(partial) : null,
    });
  }

  function readCompleteWalletObservation(provider, draftOverride) {
    if (provider && provider !== state.activeProvider) {
      return Promise.resolve(makeUnavailableWalletObservation('provider-mismatch'));
    }
    provider = state.activeProvider;
    if (!provider || typeof provider.request !== 'function') {
      return Promise.resolve(makeUnavailableWalletObservation('provider-unavailable'));
    }
    if (!window.IX_EXECUTION || typeof window.IX_EXECUTION.readWalletSnapshot !== 'function') {
      return Promise.resolve(makeUnavailableWalletObservation('execution-wallet-snapshot-unavailable'));
    }

    var providerReference = state.providerReference;
    if (!providerReference) {
      return Promise.resolve(makeUnavailableWalletObservation('provider-reference-unavailable'));
    }

    var draftForGas = draftOverride || state.draft;
    if (!draftForGas) {
      return Promise.resolve(makeUnavailableWalletObservation('draft-unavailable'));
    }

    return provider.request({ method: 'eth_accounts' })
      .then(function (accounts) {
        var sender = accounts && accounts.length ? accounts[0] : null;
        if (!sender) throw new Error('account-unavailable');
        state.sender = sender;
        noteAccount(sender);
        return provider.request({ method: 'eth_chainId' }).then(function (chainHex) {
          var observedChainId = noteChain(chainHex);
          if (!observedChainId) throw new Error('chain-unavailable');
          return window.IX_EXECUTION.readWalletSnapshot(sender, observedChainId, provider)
            .then(function (snapshot) {
              if (!snapshot) throw new Error('token-evidence-unavailable');
              if (typeof snapshot.balanceAtomic !== 'string') throw new Error('token-balance-unavailable');
              if (typeof snapshot.allowanceAtomic !== 'string') throw new Error('allowance-unavailable');
              return readNativeGasBalance(provider, sender).then(function (nativeGasBalanceResult) {
                state.observationGeneration += 1;
                var observation = {
                  senderAddress: sender,
                  observedChainId: observedChainId,
                  tokenBalanceAtomic: snapshot.balanceAtomic,
                  allowanceAtomic: snapshot.allowanceAtomic,
                  nativeGasBalanceAtomic: nativeGasBalanceResult && nativeGasBalanceResult.status === 'AVAILABLE' ? nativeGasBalanceResult.value : null,
                  gasReadiness: 'UNAVAILABLE',
                  providerReference: providerReference,
                  accountGeneration: String(state.accountGeneration),
                  chainGeneration: String(state.chainGeneration),
                  providerGeneration: String(state.providerGeneration),
                  observedAt: 'observation:' + state.observationGeneration,
                };
                if (!nativeGasBalanceResult || nativeGasBalanceResult.status !== 'AVAILABLE') {
                  return Object.freeze({
                    status: 'AVAILABLE',
                    reason: 'native-gas-balance-unavailable',
                    walletObservation: Object.freeze(observation),
                  });
                }
                return assessGasReadiness(provider, draftForGas, observation).then(function (gas) {
                  observation.gasReadiness = gas.status;
                  observation.nativeGasRequiredAtomic = gas.requiredAtomic || null;
                  observation.gasReadinessReason = gas.reason || null;
                  return Object.freeze({
                    status: 'AVAILABLE',
                    reason: gas.status === 'SUFFICIENT' ? null : (gas.status === 'INSUFFICIENT' ? 'native-gas-insufficient' : 'native-gas-readiness-unavailable'),
                    walletObservation: Object.freeze(observation),
                  });
                });
              });
            });
        });
      })
      .catch(function (error) {
        return makeUnavailableWalletObservation(error && error.message || 'wallet-observation-unavailable');
      });
  }

  /* ----------------------------------------------------------------
   * Chip — in-card execution trigger
   * ---------------------------------------------------------------- */
  function setChipState(modifier, disabled, ariaLabel) {
    var chip = el('ccChip');
    if (!chip) return;
    chip.className = 'cc-card-chip ' + modifier;
    chip.disabled  = !!disabled;
    if (ariaLabel != null) chip.setAttribute('aria-label', ariaLabel);
  }

  function setEditEnabled(enabled) {
    var edit = el('ccEditPayment');
    if (!edit) return;
    edit.disabled = !enabled;
  }

  /* ----------------------------------------------------------------
   * Status pill
   * ---------------------------------------------------------------- */
  function setStatus(type, label) {
    var dot  = el('ccStatusDot');
    var pill = el('ccCardStatus');
    if (dot)  dot.className  = 'cc-card-status-dot cc-card-status-dot--' + type;
    if (pill) pill.className = 'cc-card-status cc-card-status--' + type;
    setText('ccStatusLabel', label);
  }

  function hasAction(actions, actionName) {
    return !!actions && actions.allowed && actions.allowed.indexOf(actionName) !== -1;
  }

  function projectionAxes(overrides) {
    var walletForReadiness = null;
    var impossibleEvidenceState = false;
    if (state.currentEvidenceState === 'REFRESHED') {
      walletForReadiness = state.currentWalletObservation;
      impossibleEvidenceState = !!state.reviewRecord && !walletForReadiness;
    } else if (state.currentEvidenceState === 'INITIAL_REVIEW') {
      walletForReadiness = state.reviewRecord && state.reviewRecord.walletSnapshot;
      impossibleEvidenceState = !!state.currentWalletObservation && state.currentWalletObservation !== walletForReadiness;
    } else if (state.currentEvidenceState === 'REFRESHING' || state.currentEvidenceState === 'UNAVAILABLE') {
      walletForReadiness = null;
    } else if (state.reviewRecord) {
      impossibleEvidenceState = true;
    }
    var gasReadiness = walletForReadiness
      ? walletForReadiness.gasReadiness
      : null;
    var tokenInsufficient = false;
    if (state.reviewRecord && walletForReadiness) {
      tokenInsufficient = BigInt(walletForReadiness.tokenBalanceAtomic) < BigInt(state.reviewRecord.reviewedPaymentTerms.totalDebitAtomic);
    }
    var axes = {
      cardPresented: !!state.registryRecord,
      draftValid: !!state.draft,
      integrity: state.integrityManifestVerificationState,
      lifecycle: state.resolvedLifecycleResult && state.resolvedLifecycleResult.outcome === 'LIFECYCLE_ACTIVE' ? 'ACTIVE' : 'UNAVAILABLE',
      promotion: state.promotedPresentationResult && state.promotedPresentationResult.outcome === 'PRESENTATION_PROMOTED' ? 'PRESENTATION_PROMOTED' : 'NOT_EVALUATED',
      evidenceResolution: impossibleEvidenceState ? 'CONFLICT' : (state.resolvedLifecycleResult ? 'CONSISTENT' : 'UNAVAILABLE'),
      walletConnection: state.activeProvider ? 'CONNECTED' : 'NOT_CONNECTED',
      networkCompatibility: state.draft && state.observedChainId ? (state.observedChainId === state.draft.requiredChainId ? 'MATCHED' : 'MISMATCHED') : 'UNKNOWN',
      fundingReadiness: state.currentEvidenceState === 'REFRESHING'
        ? 'NOT_EVALUATED'
        : (state.currentEvidenceState === 'UNAVAILABLE' && state.reviewRecord
          ? 'UNAVAILABLE'
          : (walletForReadiness
        ? (gasReadiness === 'INSUFFICIENT' ? 'INSUFFICIENT_GAS' : (gasReadiness === 'UNAVAILABLE' ? 'UNAVAILABLE' : (tokenInsufficient ? 'INSUFFICIENT_TOKEN' : (gasReadiness === 'SUFFICIENT' ? 'SUFFICIENT' : 'UNKNOWN'))))
        : 'NOT_EVALUATED')),
      authorization: 'NOT_REQUESTED',
      allowanceApproval: 'NOT_REQUIRED',
      transferExecution: 'NOT_STARTED',
      settlement: 'NOT_SUBMITTED',
      reviewRecord: state.reviewRecord,
      reviewEligibilityEvaluation: state.reviewEligibility,
      executionAttemptBinding: state.executionAttemptBinding,
    };
    Object.keys(overrides || {}).forEach(function (key) { axes[key] = overrides[key]; });
    return axes;
  }

  function renderInteractionProjection(overrides, actionOptions) {
    if (!state.reviewRuntime || typeof state.reviewRuntime.deriveInteractionProjection !== 'function') {
      return null;
    }
    try {
      var projection = state.reviewRuntime.deriveInteractionProjection(projectionAxes(overrides));
      if (!projection || typeof projection.projection !== 'string') return null;
      var actions = state.reviewRuntime.evaluateProjectionActions(projection.projection, actionOptions || {});
      if (!actions || !actions.allowed) return null;
      state.interactionProjection = projection;
      state.interactionActions = actions;
      return { projection: projection, actions: actions };
    } catch (error) {
      state.interactionProjection = null;
      state.interactionActions = null;
      return null;
    }
  }

  function applyInteractionProjection(overrides, actionOptions) {
    var result = renderInteractionProjection(overrides, actionOptions);
    if (!result || !result.projection || !result.actions) {
      transition('TX_FAILED');
      setText('ccErrorStateLabel', 'Unavailable');
      setText('ccCardError', 'This payment state cannot be shown safely.');
      applyProjectedActions(null);
      return null;
    }
    var aliases = {
      PRESENTED: 'CONFIGURE',
      CONFIGURING: 'CONFIGURE',
      WALLET_REQUIRED: 'CONFIGURE',
      WRONG_NETWORK: 'WRONG_NETWORK',
      READY_FOR_REVIEW: 'CONFIGURE',
      REVIEWING: 'REVIEW',
      INSUFFICIENT_FUNDS: 'REVIEW',
      AUTHORIZATION_IN_PROGRESS: 'AUTHORIZING',
      TOKEN_APPROVAL_DECISION_PENDING: 'EXECUTING',
      TOKEN_APPROVAL_PENDING: 'EXECUTING',
      TRANSFER_DECISION_PENDING: 'EXECUTING',
      TRANSFER_SUBMISSION_PENDING: 'EXECUTING',
      CONFIRMATION_PENDING: 'CONFIRMATION_PENDING',
      OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
      SUCCEEDED: 'COMPLETE',
      FAILED: 'TX_FAILED',
      CANCELLED: 'REVIEW',
      EVIDENCE_BLOCKED: 'TX_FAILED',
      INTERNAL_INCONSISTENCY: 'TX_FAILED',
    };
    var alias = aliases[result.projection.projection];
    if (!alias) {
      transition('TX_FAILED');
      setText('ccErrorStateLabel', 'Unavailable');
      setText('ccCardError', 'This payment state cannot be shown safely.');
      applyProjectedActions(null);
      return null;
    }
    transition(alias);
    applyProjectedActions(result);
    if (result.projection.projection === 'INTERNAL_INCONSISTENCY') {
      setText('ccErrorStateLabel', 'Unavailable');
      setText('ccCardError', 'This payment state cannot be shown safely.');
      applyProjectedActions(null);
      return null;
    }
    return result;
  }

  function applyProjectedActions(result, labelOverride) {
    if (!result || !result.actions || !result.actions.allowed) {
      setChipState('cc-card-chip--waiting', true, labelOverride || 'Unavailable');
      setEditEnabled(false);
      return;
    }
    var allowed = result.actions;
    var projection = result.projection && result.projection.projection;
    setEditEnabled(hasAction(allowed, 'editDraft') || hasAction(allowed, 'exitReview'));
    if (hasAction(allowed, 'authorize')) {
      setChipState('cc-card-chip--ready', false, 'Authorize & pay');
      return;
    }
    if (hasAction(allowed, 'enterReview')) {
      setChipState('cc-card-chip--ready', false, 'Review payment');
      return;
    }
    if (hasAction(allowed, 'connectWallet')) {
      setChipState('cc-card-chip--ready', false, 'Review payment');
      return;
    }
    if (hasAction(allowed, 'requestNetworkSwitch')) {
      setChipState('cc-card-chip--ready', false, 'Switch network');
      return;
    }
    if (hasAction(allowed, 'wait') || projection === 'INTERNAL_INCONSISTENCY') {
      setChipState('cc-card-chip--waiting', true, labelOverride || 'Unavailable');
      return;
    }
    setChipState('cc-card-chip--waiting', true, labelOverride || 'Unavailable');
  }

  function renderVerificationBlocked() {
    var copy = verification && verification.getStateCopy
      ? verification.getStateCopy(state.integrityManifestVerificationState)
      : {
        statusLabel: 'Verification unavailable',
        primaryMessage: 'This Coin Card cannot currently be verified.',
        actionLabel: 'Transfers disabled',
      };
    setText('ccErrorStateLabel', copy.statusLabel);
    setText('ccCardError', copy.primaryMessage);
    setStatus(state.integrityManifestVerificationState === 'CARD_REVOKED' ? 'revoked' : 'failed', copy.statusLabel);
    transition('TX_FAILED');
    setChipState('cc-card-chip--waiting', true, copy.actionLabel);
    emit('CC_ERROR', { message: copy.primaryMessage, verificationState: state.integrityManifestVerificationState });
  }

  /* ----------------------------------------------------------------
   * Lifecycle pipeline — runs asynchronously after manifest verification
   * succeeds. Stores the promoted presentation result in state so it is
   * available at commitment time (startExecution). Failure is silently
   * absorbed; state.promotedPresentationResult stays null.
   * ---------------------------------------------------------------- */
  function runLifecyclePipeline(registryRecord) {
    var bundleVerifier = window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION;
    var selector       = window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION;
    var resolver       = window.IX_COIN_CARD_LIFECYCLE_RESOLUTION;
    var presenter      = window.IX_COIN_CARD_LIFECYCLE_PRESENTATION;

    if (!bundleVerifier || typeof bundleVerifier.authenticateLifecycleRegistryBundle !== 'function') return;
    if (!selector || !resolver || !presenter) return;

    var bundle = window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;

    bundleVerifier.authenticateLifecycleRegistryBundle(bundle)
      .then(function (bundleResult) {
        var selectionRequest = {
          cardId:     registryRecord.cardId,
          manifestId: state.manifestId,
        };
        var selected = selector.selectLifecycleEvidence(bundleResult, selectionRequest);
        var resolved = resolver.resolveLifecycle(selected);
        state.resolvedLifecycleResult = resolved;
        state.lifecycleReference = buildLifecycleReference(resolved);
        state.promotedPresentationResult = presenter.promotePresentation(resolved);
      })
      .catch(function () {
        state.resolvedLifecycleResult = null;
        state.lifecycleReference = null;
        state.promotedPresentationResult = null;
      });
  }

  /* ----------------------------------------------------------------
   * Trust population — runs once on registry record load.
   * Populates recipient identity across all body panels so each panel
   * shows the correct data when it becomes visible.
   * ---------------------------------------------------------------- */
  function populateRecipientFields(addr, name) {
    var truncAddr = addr.length >= 12
      ? addr.slice(0, 6) + '\u2026' + addr.slice(-4)
      : addr;

    var nameIds  = ['ccCardName', 'ccReviewName', 'ccExecName', 'ccConfirmedName', 'ccErrorName'];
    var recipIds = ['ccCardRecipient', 'ccReviewRecipient', 'ccExecRecipient', 'ccConfirmedRecipient', 'ccErrorRecipient'];

    for (var i = 0; i < nameIds.length; i++) setText(nameIds[i], name || '');
    for (var j = 0; j < recipIds.length; j++) {
      var e = el(recipIds[j]);
      if (e) { e.textContent = truncAddr; e.title = addr; }
    }
  }

  function renderTrust(registryRecord) {
    var addr    = registryRecord.recipient || '';
    var name    = registryRecord.displayName || '';
    var token   = (registryRecord.token || 'USDC').toUpperCase();
    var chainId = String(registryRecord.chainId || '');
    var network = registryRecord.chainName || CHAIN_NAMES[chainId] || ('Chain ' + chainId);
    var bps     = registryRecord.feeBps != null ? registryRecord.feeBps : 100;
    var pctStr  = 'Fee ' + (bps / 100).toFixed(1) + '%';

    populateRecipientFields(addr, name);
    setText('ccCardNetwork', network + ' \u00b7 ' + token);
    setText('ccAmountToken', token);
    setText('ccFeePctLabel', pctStr);
    setText('ccReviewFeePct', pctStr);
    setStatus('verified', 'Verified');
  }

  function renderRevoked(registryRecord) {
    var addr = registryRecord.recipient || '';
    var name = registryRecord.displayName || '';
    var copy = verification && verification.getStateCopy
      ? verification.getStateCopy('CARD_REVOKED')
      : {
        statusLabel: 'Revoked',
        actionLabel: 'Transfers disabled',
    };
    populateRecipientFields(addr, name);
    setText('ccErrorStateLabel', copy.statusLabel);
    setText('ccCardError', copy.primaryMessage);
    setStatus('revoked', copy.statusLabel);
    setChipState('cc-card-chip--waiting', true, copy.actionLabel);
  }

  /* ----------------------------------------------------------------
   * Amount handling
   * ---------------------------------------------------------------- */
  function applyAmountText(amountText, chainId) {
    var feeBps    = (state.registryRecord && state.registryRecord.feeBps != null)
                     ? state.registryRecord.feeBps : null;
    var draft = commitDraftFromInput(amountText);
    if (!draft) {
      clearFee();
      transition('CONFIGURE');
      return;
    }

    state.amountText = amountText;
    state.amount   = atomicToDecimal(draft.recipientAmountAtomic);
    state.fee      = atomicToDecimal(draft.platformFeeAtomic);
    state.total    = atomicToDecimal(draft.totalDebitAtomic);
    state.rawAmount = BigInt(draft.recipientAmountAtomic);
    state.rawFee    = BigInt(draft.platformFeeAtomic);
    state.rawTotal  = BigInt(draft.totalDebitAtomic);

    var token = (state.registryRecord && state.registryRecord.token || 'USDC').toUpperCase();
    setText('ccFeeValue',   atomicToFixed2(draft.platformFeeAtomic) + ' ' + token);
    setText('ccTotalValue', atomicToFixed2(draft.totalDebitAtomic) + ' ' + token);

    transition('CONFIGURE');
    setChipState('cc-card-chip--ready', false, 'Review payment');
    emit('CC_AMOUNT_CHANGED', {
      amountText: amountText,
      fee: atomicToDecimal(draft.platformFeeAtomic),
      total: atomicToDecimal(draft.totalDebitAtomic),
    });
  }

  function clearFee() {
    state.amount    = null;
    state.fee       = null;
    state.total     = null;
    state.rawAmount = null;
    state.rawFee    = null;
    state.rawTotal  = null;
    state.draft     = null;
    state.intent    = null;
    invalidateReview('draft-cleared');
    setText('ccFeeValue',   '\u2014');
    setText('ccTotalValue', '\u2014');
    setChipState('cc-card-chip--waiting', true, 'Enter amount to review');
  }

  /* ----------------------------------------------------------------
   * Intent construction
   * ---------------------------------------------------------------- */
  function buildIntent() {
    if (!state.registryRecord || !state.draft) return;
    var m          = state.registryRecord;
    var draft      = state.draft;
    state.intent = {
      cardId:                   m.cardId,
      recipient:                m.recipient,
      amount:                   atomicToDecimal(draft.recipientAmountAtomic),
      fee:                      atomicToDecimal(draft.platformFeeAtomic),
      total:                    atomicToDecimal(draft.totalDebitAtomic),
      chainId:                  m.chainId,
      token:                    m.token,
      owner:                    m.owner || null,
      /* Atomic string amounts for execution authorization. */
      recipientAmountAtomic:    draft.recipientAmountAtomic,
      platformFeeAtomic:        draft.platformFeeAtomic,
      totalDebitAtomic:         draft.totalDebitAtomic,
      /* Chain contract addresses for execution authorization. */
      tokenAddress:             draft.tokenAddress,
      executionContractAddress: draft.executionContractAddress,
    };
    transition('CONFIGURE');
    setChipState('cc-card-chip--ready', false, 'Review payment');
    emit('CC_INTENT_READY', { intent: state.intent });
  }

  /* ----------------------------------------------------------------
   * Amount surface setup
   * ---------------------------------------------------------------- */
  function initAmountSurface(registryRecord) {
    var mode    = registryRecord.amountMode || 'sender_input';
    var chainId = registryRecord.chainId;
    var token   = (registryRecord.token || 'USDC').toUpperCase();
    setText('ccAmountToken', token);

    if (mode === 'locked' && registryRecord.lockedAmount != null) {
      /* locked: auto-apply; hide the input field */
      var field = el('ccAmountField');
      if (field) field.style.display = 'none';
      applyAmountText(String(registryRecord.lockedAmount), chainId);
    } else {
      /* sender_input / suggested: user enters amount */
      var input = el('ccAmountInput');
      if (input) {
        input.addEventListener('input', function () {
          var text = input.value.trim();
          if (!text) {
            clearFee();
            transition('CONFIGURE');
            return;
          }
          applyAmountText(text, chainId);
        });
      }
    }
  }

  /* ----------------------------------------------------------------
   * resolveProvider — select the active EIP-1193 provider.
   *
   * Rule: prefer the injected provider (window.ethereum) if it is present.
   * Fall back to the WalletConnect provider from IX_WC.getProvider() if a
   * WalletConnect session has already been established. Returns null when
   * neither is available.
   *
   * This is called once at wallet-connect time. The resolved provider is
   * stored in state.activeProvider and used for all subsequent operations
   * (snapshot read, TOCTOU check, approval, transfer) in the same session.
   * ---------------------------------------------------------------- */
  function resolveProvider() {
    if (window.ethereum && typeof window.ethereum.request === 'function') {
      return window.ethereum;
    }
    if (window.IX_WC && typeof window.IX_WC.getProvider === 'function') {
      var wcp = window.IX_WC.getProvider();
      if (wcp && typeof wcp.request === 'function') return wcp;
    }
    return null;
  }

  /* ----------------------------------------------------------------
   * Wallet connect + network switch
   * ---------------------------------------------------------------- */
  function connectWallet(afterReady) {
    if (!window.IX_EXECUTION) { renderError('Execution module unavailable'); return; }
    if (!verification || !verification.canExecuteTransfer(state.integrityManifestVerificationState)) {
      renderVerificationBlocked();
      return;
    }

    /* Resolve the active provider once at connect time. */
    var resolvedProvider = resolveProvider();

    transition('CONNECTING');
    setText('ccExecLabel', 'Connecting wallet\u2026');
    if (state.draft) setText('ccExecAmount', atomicToExactDisplay(state.draft.recipientAmountAtomic));
    setChipState('cc-card-chip--active', true, 'Connecting wallet\u2026');
    setStatus('pending', 'Connecting');

    window.IX_EXECUTION.executeTransfer({
      action:    'prepare',
      chainId:   state.registryRecord && state.registryRecord.chainId,
      provider:  resolvedProvider,
    })
      .then(function (result) {
        if (result.status === 'wallet-missing') {
          renderError('No wallet detected', 'Install MetaMask to send USDC.');
          return;
        }
        if (result.status === 'wallet-rejected') {
          state.activeProvider = null;
          transition('CONFIGURE');
          setText('ccTxLabel', 'Configure payment');
          setStatus('verified', 'Verified');
          setChipState('cc-card-chip--ready', false, 'Review payment');
          return;
        }
        if (result.status === 'failed') {
          state.activeProvider = null;
          renderError('Wallet error', result.error && result.error.message);
          return;
        }

        /* Provider is confirmed active — store for snapshot and execution. */
        state.activeProvider = resolvedProvider;
        noteProvider(resolvedProvider);

        if (result.sender) {
          state.sender = result.sender;
          noteAccount(result.sender);
          /* Self-send detection */
          var warn = el('ccSelfSendWarn');
          if (warn && state.registryRecord) {
            warn.classList.toggle('is-active',
              result.sender.toLowerCase() === state.registryRecord.recipient.toLowerCase());
          }
        }

        if (result.status === 'wrong-network') {
          transition('WRONG_NETWORK');
          setText('ccTxLabel', 'Wrong Network');
          setStatus('pending', 'Wrong Network');
          setChipState('cc-card-chip--ready', false,
            'Switch to ' + (result.chain ? result.chain.name : 'correct network'));
          return;
        }
        if (result.status === 'ready-to-send') {
          if (result.chain && result.chain.chainId) noteChain(result.chain.chainId);
          if (afterReady === true) {
            enterReview();
          } else {
            transition('CONFIGURE');
            setChipState('cc-card-chip--ready', false, 'Review payment');
          }
          return;
        }
        renderError('Wallet connection failed');
      })
      .catch(function (err) {
        state.activeProvider = null;
        renderError('Wallet error', err && err.message);
      });
  }

  function switchNetwork() {
    if (!window.IX_EXECUTION) return;
    if (!verification || !verification.canExecuteTransfer(state.integrityManifestVerificationState)) {
      renderVerificationBlocked();
      return;
    }
    var registryRecordChainId = state.registryRecord && state.registryRecord.chainId;

    transition('SWITCHING_NETWORK');
    setText('ccExecLabel', 'Switching network\u2026');
    if (state.draft) setText('ccExecAmount', atomicToExactDisplay(state.draft.recipientAmountAtomic));
    setChipState('cc-card-chip--active', true, 'Switching network\u2026');
    setStatus('pending', 'Switching');

    window.IX_EXECUTION.executeTransfer({
      action: 'switch-network',
      chainId: registryRecordChainId,
    })
      .then(function (result) {
        if (result.status === 'ready-to-send') {
          noteProvider(state.activeProvider);
          enterReview();
          return;
        }
        if (result.status === 'wrong-network') {
          transition('WRONG_NETWORK');
          setText('ccTxLabel', 'Wrong Network');
          setStatus('pending', 'Wrong Network');
          setChipState('cc-card-chip--ready', false,
            'Switch to ' + (result.chain ? result.chain.name : 'correct network'));
          return;
        }
        if (result.status === 'failed') {
          renderError('Network switch failed', result.error && result.error.message);
          return;
        }
        renderError('Network switch failed');
      })
      .catch(function (err) {
        renderError('Network switch failed', err && err.message);
      });
  }

  /* ----------------------------------------------------------------
   * Visible review
   * ---------------------------------------------------------------- */
  function enterReview() {
    if (state.operationInFlight) return;
    if (!state.draft || !state.registryRecord) {
      transition('CONFIGURE');
      setText('ccTxLabel', 'Configure payment');
      setStatus('verified', 'Verified');
      setChipState('cc-card-chip--waiting', true, 'Enter amount to review');
      return;
    }
    if (!state.activeProvider) {
      connectWallet(true);
      return;
    }
    if (!state.reviewRuntime) {
      renderTxError(state.reviewRuntimeError || 'Review contract unavailable');
      return;
    }
    if (!state.resolvedLifecycleResult || !state.promotedPresentationResult || !state.lifecycleReference) {
      renderTxError('Card authority is not ready for review.');
      return;
    }

    state.operationInFlight = true;
    var sequence = ++state.reviewSequence;
    var draft = state.draft;
    var capture = captureContinuity();
    transition('REVIEW_PREPARING');
    setText('ccExecLabel', 'Preparing review\u2026');
    setText('ccExecAmount', atomicToExactDisplay(draft.recipientAmountAtomic));
    setChipState('cc-card-chip--active', true, 'Preparing review\u2026');

    return readCompleteWalletObservation(state.activeProvider, draft)
      .then(function (result) {
        state.operationInFlight = false;
        if (sequence !== state.reviewSequence || draft !== state.draft || !continuityMatches(capture)) {
          invalidateReview('review-stale');
          transition('CONFIGURE');
          setText('ccTxLabel', 'Review needs current wallet information');
          setChipState('cc-card-chip--ready', false, 'Review payment');
          return;
        }
        if (!result || result.status !== 'AVAILABLE') {
          invalidateReview(result && result.reason || 'wallet-readiness-unavailable');
          transition('CONFIGURE');
          setText('ccTxLabel', result && result.reason === 'native-gas-insufficient' ? 'Add network gas before review' : 'Wallet readiness unavailable');
          setChipState('cc-card-chip--ready', false, 'Review payment');
          return;
        }
        try {
          var reviewDraft = reviewDraftIntentFromDraft(draft);
          var reviewRecord = state.reviewRuntime.createReviewRecord({
            reviewId: 'review:' + sequence + ':' + draft.revision,
            createdAt: 'review-sequence:' + sequence,
            draftIntent: reviewDraft,
            resolvedLifecycleResult: state.resolvedLifecycleResult,
            lifecycleReference: state.lifecycleReference,
            walletSnapshot: result.walletObservation,
            providerContinuity: 'ESTABLISHED',
            evidenceResolution: 'CONSISTENT',
          });
          var eligibility = state.reviewRuntime.evaluateReviewEligibility({
            evaluationId: 'review-eval:' + sequence,
            evaluatedAt: 'review-eval-sequence:' + sequence,
            reviewRecord: reviewRecord,
            currentEvidence: {
              currentDraftIntent: reviewDraft,
              currentResolvedLifecycleResult: state.resolvedLifecycleResult,
              evidenceResolution: 'CONSISTENT',
              walletObservation: result.walletObservation,
            },
          });
          state.reviewRecord = reviewRecord;
          state.reviewEligibility = eligibility;
          state.currentWalletObservation = reviewRecord.walletSnapshot;
          state.currentEvidenceState = 'INITIAL_REVIEW';
          renderReview(reviewRecord, eligibility);
        } catch (error) {
          invalidateReview(error && error.code || 'review-record-unavailable');
          transition('CONFIGURE');
          setText('ccTxLabel', 'Review unavailable');
          setChipState('cc-card-chip--ready', false, 'Review payment');
        }
      })
      .catch(function () {
        state.operationInFlight = false;
        invalidateReview('review-preparation-failed');
        transition('CONFIGURE');
        setText('ccTxLabel', 'Review unavailable');
        setChipState('cc-card-chip--ready', false, 'Review payment');
      });
  }

  function renderReview(reviewRecord, eligibility) {
    var terms = reviewRecord.reviewedPaymentTerms;
    var wallet = reviewRecord.walletSnapshot;
    var currentWallet = currentReadinessWallet(reviewRecord);
    var token  = (state.registryRecord.token || 'USDC').toUpperCase();
    var bps    = state.registryRecord.feeBps != null ? state.registryRecord.feeBps : 100;

    setText('ccReviewAmount',  atomicToExactDisplay(terms.recipientAmountAtomic));
    setText('ccReviewFee',     atomicToExactDisplay(terms.platformFeeAtomic) + ' ' + token);
    setText('ccReviewTotal',   atomicToExactDisplay(terms.totalDebitAtomic) + ' ' + token);
    setText('ccReviewFeePct',  'Fee ' + (bps / 100).toFixed(1) + '%');
    setText('ccReviewRecipient', abbreviate(terms.recipientAddress));
    setText('ccReviewRecipientAddress', abbreviate(terms.recipientAddress));
    setText('ccReviewNetwork', CHAIN_NAMES[String(terms.requiredChainId)] || ('Chain ' + terms.requiredChainId));
    setText('ccReviewWallet', abbreviate(wallet.senderAddress));
    setText('ccReviewGas', state.currentEvidenceState === 'REFRESHING' ? 'Refreshing' : (currentWallet.gasReadiness === 'SUFFICIENT' ? 'Sufficient' : (currentWallet.gasReadiness === 'INSUFFICIENT' ? 'Insufficient' : 'Unavailable')));
    setText('ccReviewBlockReason', reviewBlockReason(currentWallet, terms));
    var recip = el('ccReviewRecipient');
    if (recip) recip.title = terms.recipientAddress;
    var recipAddr = el('ccReviewRecipientAddress');
    if (recipAddr) recipAddr.title = terms.recipientAddress;
    setText('ccTxLabel', 'Review payment');
    var canAuthorize = state.currentEvidenceState !== 'REFRESHING' && state.currentEvidenceState !== 'UNAVAILABLE' && currentWallet.gasReadiness === 'SUFFICIENT' && eligibility && eligibility.status === 'CURRENT';
    var projection = applyInteractionProjection({}, {
      allowAuthorization: canAuthorize,
      allowEdit: !state.activeExecutionAttempt && state.currentEvidenceState !== 'REFRESHING',
    });
    setStatus('verified', canAuthorize ? 'Review' : 'Review blocked');
    applyProjectedActions(projection, canAuthorize ? 'Authorize & pay' : 'Review blocked');
    emit('CC_REVIEW_READY', { sender: wallet.senderAddress, reviewId: reviewRecord.reviewId });
  }

  function currentReadinessWallet(reviewRecord) {
    if (state.currentEvidenceState === 'INITIAL_REVIEW') return reviewRecord.walletSnapshot;
    if (state.currentEvidenceState === 'REFRESHED' && state.currentWalletObservation) return state.currentWalletObservation;
    return {
      senderAddress: reviewRecord.walletSnapshot.senderAddress,
      observedChainId: reviewRecord.walletSnapshot.observedChainId,
      tokenBalanceAtomic: null,
      allowanceAtomic: null,
      nativeGasBalanceAtomic: null,
      gasReadiness: 'UNAVAILABLE',
      providerReference: reviewRecord.walletSnapshot.providerReference,
      accountGeneration: reviewRecord.walletSnapshot.accountGeneration,
      chainGeneration: reviewRecord.walletSnapshot.chainGeneration,
      providerGeneration: reviewRecord.walletSnapshot.providerGeneration,
      observedAt: state.currentEvidenceState === 'REFRESHING' ? 'refreshing' : 'unavailable',
    };
  }

  function reviewBlockReason(wallet, terms) {
    if (!wallet) return '';
    if (state.currentEvidenceState === 'REFRESHING') return 'Refreshing wallet readiness\u2026';
    if (state.currentEvidenceState === 'UNAVAILABLE') return 'Wallet and network-fee readiness could not be confirmed.';
    if (terms && wallet.tokenBalanceAtomic != null && BigInt(wallet.tokenBalanceAtomic) < BigInt(terms.totalDebitAtomic)) return 'More USDC is needed for this payment.';
    if (wallet.gasReadiness === 'INSUFFICIENT') return 'More POL is needed for network fees.';
    if (wallet.gasReadiness === 'UNAVAILABLE') {
      if (wallet.nativeGasBalanceAtomic === null) return 'Network-fee readiness could not be confirmed.';
      return 'USDC approval and transfer fee readiness could not be established.';
    }
    return '';
  }

  function editPayment() {
    if (state.operationInFlight) return;
    var projection = renderInteractionProjection({}, {
      allowAuthorization: false,
      allowEdit: !state.activeExecutionAttempt,
    });
    if (!projection || (!hasAction(projection.actions, 'exitReview') && !hasAction(projection.actions, 'editDraft'))) return;
    invalidateReview('edit-payment');
    setText('ccTxLabel', 'Configure payment');
    setStatus('verified', 'Verified');
    applyInteractionProjection({}, { allowAuthorization: false, allowReview: !!state.draft, allowEdit: true });
  }

  /* ----------------------------------------------------------------
   * Execution — all writes through window.IX_EXECUTION
   * ---------------------------------------------------------------- */

  /* Map authorization outcome codes to user-visible messages. */
  function describeAuthFailure(authResult) {
    if (!authResult || !authResult.outcome) return 'Transfer not authorized';
    var messages = {
      EXECUTION_PRESENTATION_PROOF_INVALID: 'Card not authorized for transfer',
      EXECUTION_INTENT_INVALID:             'Transfer intent invalid',
      EXECUTION_WALLET_UNAVAILABLE:         'Wallet not ready',
      EXECUTION_ACCOUNT_INVALID:            'Invalid wallet account',
      EXECUTION_NETWORK_MISMATCH:           'Wrong network',
      EXECUTION_RECIPIENT_INVALID:          'Invalid recipient',
      EXECUTION_SELF_SEND_BLOCKED:          'Cannot send to yourself',
      EXECUTION_AMOUNT_INVALID:             'Invalid amount',
      EXECUTION_AMOUNT_OUT_OF_RANGE:        'Amount out of range',
      EXECUTION_TOTAL_MISMATCH:             'Fee calculation mismatch',
      EXECUTION_FUNDS_INSUFFICIENT:         'Insufficient USDC balance',
      EXECUTION_POLICY_UNAVAILABLE:         'Authorization module unavailable',
    };
    return messages[authResult.outcome] || 'Transfer not authorized';
  }

  function executeBoundAttempt(attempt, token, draft) {
    if (!state.reviewRuntime || typeof state.reviewRuntime.isExecutionAttemptBinding !== 'function') {
      throw new Error('Review runtime unavailable');
    }
    if (state.reviewRuntime.isExecutionAttemptBinding(attempt) !== true) {
      throw new Error('Execution attempt is not branded');
    }
    if (attempt !== state.executionAttemptBinding) {
      throw new Error('Execution attempt is not current');
    }
    if (attempt === state.activeExecutionAttempt) {
      throw new Error('Execution attempt already started');
    }
    if (!startedExecutionAttempts || startedExecutionAttempts.has(attempt)) {
      throw new Error('Execution attempt already consumed');
    }
    if (!state.reviewRecord || !state.authorizationInputBundle) {
      throw new Error('Execution attempt context unavailable');
    }
    if (attempt.authorizationInputBundle !== state.authorizationInputBundle) {
      throw new Error('Execution attempt input bundle mismatch');
    }
    if (attempt.reviewBindingFingerprint !== state.reviewRecord.reviewBindingFingerprint) {
      throw new Error('Execution attempt review mismatch');
    }
    if (attempt.providerReference !== state.providerReference) {
      throw new Error('Execution attempt provider mismatch');
    }
    if (!window.IX_EXECUTION || typeof window.IX_EXECUTION.executeTransfer !== 'function') {
      throw new Error('Execution service unavailable');
    }
    /*
     * Gas-policy fail-closed guard.
     *
     * window.IX_EXECUTION_GAS_POLICY must be loaded and available before any
     * wallet call is made. The execute-authorized path in IX_EXECUTION does not
     * internally call loadValidatedGasPolicy(), so this card-level guard is the
     * primary fail-closed check for policy availability on the authorized path.
     *
     * If the guard is absent and ix-execution-gas-policy.js fails to load, the
     * card would call the wallet without canonical policy enforcement active.
     * This must not happen — return a synthetic failed result without calling
     * the wallet if the policy module is absent.
     */
    if (!window.IX_EXECUTION_GAS_POLICY ||
        typeof window.IX_EXECUTION_GAS_POLICY.resolveGasPolicy !== 'function') {
      return Promise.resolve({
        status: 'failed',
        sender: null,
        chain: null,
        receipt: null,
        error: { code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' },
      });
    }
    startedExecutionAttempts.add(attempt);
    state.activeExecutionAttempt = attempt;
    var traceId = generateTraceId();

    setText('ccExecAmount', atomicToExactDisplay(attempt.authorizationResult.recipientAmountAtomic));
    applyInteractionProjection({
      authorization: 'EXECUTION_AUTHORIZED',
      allowanceApproval: attempt.executionPlan === 'APPROVE_THEN_TRANSFER' ? 'WALLET_DECISION_PENDING' : 'NOT_REQUIRED',
      transferExecution: attempt.executionPlan === 'TRANSFER_ONLY' ? 'WALLET_DECISION_PENDING' : 'NOT_STARTED',
    }, { allowAuthorization: false, allowEdit: false });
    setChipState('cc-card-chip--active', true, 'Confirm in wallet\u2026');
    setText('ccExecLabel', attempt.executionPlan === 'APPROVE_THEN_TRANSFER' ? 'Confirm USDC approval in wallet\u2026' : 'Confirm payment in wallet\u2026');
    setStatus('pending', 'Pending');

    return window.IX_EXECUTION.executeTransfer({
      action:             'execute-authorized',
      authorizationProof: attempt.authorizationResult,
      gasPolicyId:        COIN_CARD_GAS_POLICY_ID,
      provider:           state.activeProvider,
      snapshotProvider:   state.activeProvider,
      token:              token,
      source:             'coincard',
      traceId:            traceId,
    }, {
      onApprovalSubmitted: function (approvalHash) {
        applyInteractionProjection({
          authorization: 'PROOF_CONSUMED',
          allowanceApproval: 'SUBMITTED',
          approvalEvidence: { txHash: approvalHash || 'approval-submitted' },
          transferExecution: 'NOT_STARTED',
        }, { allowAuthorization: false, allowEdit: false });
        setText('ccExecLabel', 'Approval submitted. Awaiting confirmation\u2026');
      },
      onTransferRequested: function () {
        applyInteractionProjection({
          authorization: 'PROOF_CONSUMED',
          allowanceApproval: attempt.executionPlan === 'APPROVE_THEN_TRANSFER' ? 'CONFIRMED' : 'NOT_REQUIRED',
          transferExecution: 'WALLET_DECISION_PENDING',
        }, { allowAuthorization: false, allowEdit: false });
        setChipState('cc-card-chip--active', true, 'Confirm transfer in wallet\u2026');
        setText('ccExecLabel', 'Confirm transfer in wallet\u2026');
      },
      onTransferSubmitted: function (txHash) {
        applyInteractionProjection({
          authorization: 'PROOF_CONSUMED',
          allowanceApproval: attempt.executionPlan === 'APPROVE_THEN_TRANSFER' ? 'CONFIRMED' : 'NOT_REQUIRED',
          transferExecution: 'SUBMITTED',
          settlement: 'CONFIRMATION_PENDING',
          transactionEvidence: { txHash: txHash || 'transfer-submitted' },
        }, { allowAuthorization: false, allowEdit: false });
        setText('ccExecLabel', 'Transfer submitted. Awaiting on-chain confirmation\u2026');
        setStatus('submitted', 'Confirming');
      },
    }).then(function (result) {
      state.operationInFlight = false;
      if (result.status === 'confirmed') {
        var receipt = result.receipt;
        setText('ccConfirmedAmount', atomicToExactDisplay(attempt.authorizationResult.recipientAmountAtomic));
        var txHashEl = el('ccTxHash');
        if (txHashEl && receipt) {
          txHashEl.href        = receipt.explorerUrl || '#';
          txHashEl.textContent = receipt.txHash.slice(0, 10) + '\u2026' + receipt.txHash.slice(-6);
          txHashEl.title       = receipt.txHash;
        }
        applyInteractionProjection({
          authorization: 'PROOF_CONSUMED',
          transferExecution: 'SUBMITTED',
          settlement: 'CONFIRMED',
          transactionEvidence: receipt && receipt.txHash ? { txHash: receipt.txHash } : { txHash: 'confirmed' },
        }, { allowAuthorization: false, allowEdit: false });
        setStatus('confirmed', 'Confirmed');
        emit('CC_CONFIRMED', { txHash: receipt && receipt.txHash, sender: attempt.authorizationResult.sender, intent: transferIntentFromDraft(draft), receipt: receipt });
        return;
      }
      if (result.status === 'wallet-rejected') {
        state.activeExecutionAttempt = null;
        state.executionAttemptBinding = null;
        state.authorizationInputBundle = null;
        refreshReviewAfterPreBroadcastAttempt();
        return;
      }
      if (result.status === 'wallet-busy') {
        state.activeExecutionAttempt = null;
        state.executionAttemptBinding = null;
        state.authorizationInputBundle = null;
        refreshReviewAfterPreBroadcastAttempt('Wallet busy \u2014 retry when ready');
        return;
      }
      if (result.status === 'outcome-unknown') {
        var explorerUrl = result.error && result.error.explorerUrl;
        var unknownMsg  = explorerUrl
          ? 'Transfer submitted. Check the explorer to confirm.'
          : 'Transfer status unknown. Check the explorer before retrying.';
        var txHashLink = el('ccTxHash');
        if (txHashLink && explorerUrl) {
          txHashLink.href        = explorerUrl;
          txHashLink.textContent = 'View on explorer';
          txHashLink.title       = result.error && result.error.txHash || '';
        }
        renderOutcomeUnknown(unknownMsg, explorerUrl, result.error && result.error.txHash);
        return;
      }
      if (result.status === 'failed') {
        state.activeExecutionAttempt = null;
        state.executionAttemptBinding = null;
        state.authorizationInputBundle = null;
        var msg = result.error && result.error.message || 'Transfer failed';
        refreshReviewAfterPreBroadcastAttempt(msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg);
        return;
      }
      renderTxError('Unexpected execution result');
    }).catch(function (err) {
      state.operationInFlight = false;
      state.activeExecutionAttempt = null;
      state.executionAttemptBinding = null;
      state.authorizationInputBundle = null;
      var msg = err && err.message || 'Transfer failed';
      renderTxError(msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg);
    });
  }

  function refreshReviewAfterPreBroadcastAttempt(label) {
    if (!state.reviewRecord || !state.draft || !state.reviewRuntime) {
      applyInteractionProjection({}, { allowAuthorization: false, allowEdit: true });
      applyProjectedActions(null, label || 'Unavailable');
      return;
    }
    var reviewRecord = state.reviewRecord;
    var draft = state.draft;
    var capture = captureContinuity();
    var lifecycle = state.resolvedLifecycleResult;
    var promoted = state.promotedPresentationResult;
    state.operationInFlight = true;
    state.currentWalletObservation = null;
    state.currentEvidenceState = 'REFRESHING';
    setText('ccTxLabel', label || 'Refreshing wallet readiness\u2026');
    renderReview(reviewRecord, state.reviewEligibility || { status: 'STALE' });
    return readCompleteWalletObservation(state.activeProvider, draft)
      .then(function (result) {
        state.operationInFlight = false;
        if (reviewRecord !== state.reviewRecord || draft !== state.draft || !continuityMatches(capture) || lifecycle !== state.resolvedLifecycleResult || promoted !== state.promotedPresentationResult) {
          invalidateReview('recovery-stale');
          setText('ccTxLabel', 'Payment changed. Review again.');
          applyInteractionProjection({}, { allowAuthorization: false, allowReview: !!state.draft, allowEdit: true });
          return;
        }
        if (!result || result.status !== 'AVAILABLE') {
          state.reviewEligibility = null;
          state.currentWalletObservation = null;
          state.currentEvidenceState = 'UNAVAILABLE';
          setText('ccTxLabel', 'Wallet readiness could not be refreshed.');
          renderReview(reviewRecord, { status: 'STALE' });
          return;
        }
        var evaluation = state.reviewRuntime.evaluateReviewEligibility({
          evaluationId: 'prebroadcast-refresh:' + Date.now(),
          evaluatedAt: 'prebroadcast-refresh:' + Date.now(),
          reviewRecord: reviewRecord,
          currentEvidence: {
            currentDraftIntent: reviewDraftIntentFromDraft(draft),
            currentResolvedLifecycleResult: state.resolvedLifecycleResult,
            evidenceResolution: 'CONSISTENT',
            walletObservation: result.walletObservation,
          },
        });
        state.reviewEligibility = evaluation;
        state.currentWalletObservation = result.walletObservation;
        state.currentEvidenceState = result.walletObservation.gasReadiness === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'REFRESHED';
        var canAuthorize = evaluation.status === 'CURRENT' && result.walletObservation.gasReadiness === 'SUFFICIENT';
        renderReview(reviewRecord, evaluation);
        setStatus('verified', canAuthorize ? 'Review' : 'Review blocked');
        if (!canAuthorize) setText('ccTxLabel', 'Review blocked');
      })
      .catch(function () {
        state.operationInFlight = false;
        state.reviewEligibility = null;
        state.currentWalletObservation = null;
        state.currentEvidenceState = 'UNAVAILABLE';
        setText('ccTxLabel', 'Wallet readiness could not be refreshed.');
        renderReview(reviewRecord, { status: 'STALE' });
      });
  }

  function startExecution() {
    if (state.operationInFlight) return;
    if (!state.reviewRecord || !state.draft || !state.registryRecord || !window.IX_EXECUTION) return;
    if (!state.reviewRuntime) {
      renderTxError(state.reviewRuntimeError || 'Review contract unavailable');
      return;
    }

    /* Existing verification gate — remains until authorization integration is proven. */
    if (!verification || !verification.canExecuteTransfer(state.integrityManifestVerificationState)) {
      renderVerificationBlocked();
      return;
    }

    var authModule = window.IX_COIN_CARD_EXECUTION_AUTHORIZATION;
    if (!authModule || typeof authModule.authorizeExecution !== 'function') {
      renderTxError('Authorization module unavailable');
      return;
    }

    var reviewRecord = state.reviewRecord;
    var draft = state.draft;
    var chainId = state.registryRecord.chainId;
    var token   = (state.registryRecord.token || 'USDC').toUpperCase();
    var capture = captureContinuity();

    state.operationInFlight = true;
    var initialProjection = renderInteractionProjection({}, {
      allowAuthorization: reviewRecord.walletSnapshot.gasReadiness === 'SUFFICIENT' && state.reviewEligibility && state.reviewEligibility.status === 'CURRENT',
      allowEdit: false,
    });
    if (!initialProjection || !hasAction(initialProjection.actions, 'authorize')) {
      state.operationInFlight = false;
      applyInteractionProjection({}, { allowAuthorization: false, allowEdit: true });
      setStatus('verified', 'Review blocked');
      applyProjectedActions(null, 'Review blocked');
      setText('ccTxLabel', reviewRecord.walletSnapshot.gasReadiness === 'INSUFFICIENT' ? 'Network gas is insufficient' : 'Wallet readiness unavailable');
      return;
    }
    applyInteractionProjection({ authorization: 'EVALUATING' }, { allowAuthorization: false, allowEdit: false });
    setChipState('cc-card-chip--active', true, 'Authorizing\u2026');
    setText('ccExecLabel', 'Authorizing payment\u2026');
    setText('ccExecAmount', atomicToExactDisplay(draft.recipientAmountAtomic));

    return readCompleteWalletObservation(state.activeProvider, draft)
      .then(function (observationResult) {
        if (!observationResult || observationResult.status !== 'AVAILABLE') {
          state.operationInFlight = false;
          refreshReviewAfterPreBroadcastAttempt('Wallet readiness changed');
          setText('ccTxLabel', observationResult && observationResult.reason === 'native-gas-insufficient' ? 'Network gas is insufficient' : 'Wallet readiness changed');
          return null;
        }
        if (observationResult.walletObservation.gasReadiness !== 'SUFFICIENT') {
          state.operationInFlight = false;
          applyInteractionProjection({}, { allowAuthorization: false, allowEdit: true });
          setStatus('verified', 'Review blocked');
          applyProjectedActions(null, 'Review blocked');
          setText('ccTxLabel', observationResult.walletObservation.gasReadiness === 'INSUFFICIENT' ? 'Network gas is insufficient' : 'Wallet readiness unavailable');
          return null;
        }
        if (reviewRecord !== state.reviewRecord || draft !== state.draft || !continuityMatches(capture)) {
          state.operationInFlight = false;
          invalidateReview('authorization-input-changed');
          setText('ccTxLabel', 'Payment changed. Review again.');
          applyInteractionProjection({}, { allowAuthorization: false, allowReview: !!state.draft, allowEdit: true });
          return null;
        }
        var reviewDraft = reviewDraftIntentFromDraft(draft);
        var eligibility = state.reviewRuntime.evaluateReviewEligibility({
          evaluationId: 'authorize-eval:' + Date.now(),
          evaluatedAt: 'authorize-eval:' + Date.now(),
          reviewRecord: reviewRecord,
          currentEvidence: {
            currentDraftIntent: reviewDraft,
            currentResolvedLifecycleResult: state.resolvedLifecycleResult,
            evidenceResolution: 'CONSISTENT',
            walletObservation: observationResult.walletObservation,
          },
        });
        if (eligibility.status !== 'CURRENT') {
          state.operationInFlight = false;
          invalidateReview('review-no-longer-current');
          setText('ccTxLabel', 'Payment changed. Review again.');
          applyInteractionProjection({}, { allowAuthorization: false, allowReview: !!state.draft, allowEdit: true });
          return null;
        }
        state.currentWalletObservation = observationResult.walletObservation;
        state.currentEvidenceState = 'REFRESHED';
        var bundle = state.reviewRuntime.buildAuthorizationInputs(reviewRecord, eligibility);
        var authResult = authModule.authorizeExecution(
          bundle.promotedPresentationResult,
          bundle.transferIntent,
          bundle.walletSnapshot
        );
        if (!authModule.isExecutionAuthorizedResult(authResult)) {
          state.operationInFlight = false;
          refreshReviewAfterPreBroadcastAttempt(describeAuthFailure(authResult));
          setStatus('verified', 'Review');
          setText('ccTxLabel', describeAuthFailure(authResult));
          return null;
        }
        var attempt = state.reviewRuntime.bindExecutionAttempt({
          attemptId: 'attempt:' + Date.now(),
          authorizationInputBundle: bundle,
          authorizationResult: authResult,
          providerReference: bundle.providerReference,
        });
        state.reviewEligibility = eligibility;
        state.authorizationInputBundle = bundle;
        state.executionAttemptBinding = attempt;
        return executeBoundAttempt(attempt, token, draft);
      })
      .catch(function () {
        state.operationInFlight = false;
        state.activeExecutionAttempt = null;
        state.executionAttemptBinding = null;
        state.authorizationInputBundle = null;
        refreshReviewAfterPreBroadcastAttempt('Authorization failed. Review again.');
        setText('ccTxLabel', 'Authorization failed. Review again.');
      });
  }

  /* ----------------------------------------------------------------
   * Chip click dispatcher
   * ---------------------------------------------------------------- */
  function handleChipClick() {
    var currentProjection = renderInteractionProjection({}, {
      allowAuthorization: state.reviewRecord && state.reviewRecord.walletSnapshot && state.reviewRecord.walletSnapshot.gasReadiness === 'SUFFICIENT' && state.reviewEligibility && state.reviewEligibility.status === 'CURRENT',
      allowReview: !!state.draft,
      allowEdit: !state.activeExecutionAttempt,
    });
    switch (state.current) {
      case 'CONFIGURE':
        if (currentProjection && (hasAction(currentProjection.actions, 'enterReview') || hasAction(currentProjection.actions, 'connectWallet'))) enterReview();
        break;
      case 'WRONG_NETWORK':
        if (currentProjection && hasAction(currentProjection.actions, 'requestNetworkSwitch')) switchNetwork();
        break;
      case 'REVIEW':
        if (currentProjection && hasAction(currentProjection.actions, 'authorize')) startExecution();
        break;
      default: break;
    }
  }

  /* ----------------------------------------------------------------
   * Registry record validation
   * ---------------------------------------------------------------- */
  function validateRegistryRecord(registryRecord, cardId) {
    if (registryRecord.schema !== 'implicitex.coincard.v1') return 'schema-mismatch';
    if (registryRecord.cardId !== cardId)                   return 'card-id-mismatch';
    if (!registryRecord.recipient || !registryRecord.chainId || !registryRecord.token) return 'missing-required-fields';
    if (registryRecord.owner && (typeof registryRecord.owner !== 'object' || !registryRecord.owner.name)) return 'owner-malformed';
    return null;
  }

  /* ----------------------------------------------------------------
   * Error rendering
   * ---------------------------------------------------------------- */

  /* Registry-record-level error — card hidden; frame error surface shown */
  function renderError(message, sub) {
    setText('ccErrorMessage', message || 'Registry error');
    setText('ccErrorSub', sub || '');
    transition('ERROR');
    emit('CC_ERROR', { message: message });
  }

  /* Execution error — card remains visible; error body panel shown */
  function renderTxError(message) {
    setText('ccErrorStateLabel', 'Transfer Failed');
    setText('ccCardError', message || 'Transfer failed');
    setStatus('failed', 'Failed');
    transition('TX_FAILED');
    emit('CC_ERROR', { message: message });
  }

  function renderOutcomeUnknown(message, explorerUrl, txHash) {
    applyInteractionProjection({
      settlement: 'OUTCOME_UNKNOWN',
      transactionEvidence: txHash ? { txHash: txHash } : undefined,
    }, { allowAuthorization: false, allowEdit: false, allowReview: false });
    setText('ccErrorStateLabel', 'Settlement unresolved');
    setText('ccCardError', message || 'Transfer status is unresolved. Inspect the transaction before taking further action.');
    var txHashLink = el('ccTxHash');
    if (txHashLink && explorerUrl) {
      txHashLink.href = explorerUrl;
      txHashLink.textContent = 'View on explorer';
      txHashLink.title = txHash || '';
    }
    setStatus('pending', 'Unresolved');
    setChipState('cc-card-chip--waiting', true, 'Inspect transaction');
  }

  function getFetchImpl() {
    if (window && typeof window.fetch === 'function') return window.fetch;
    if (typeof fetch === 'function') return fetch;
    return null;
  }

  function applyIntegrityManifestVerification(registryRecord, pointer) {
    var manifestUrl = pointer.integrityManifestUrl || pointer.manifestUrl;
    var request = getFetchImpl();
    if (!request) {
      state.integrityManifestVerificationState = 'VERIFICATION_UNAVAILABLE';
      renderVerificationBlocked();
      return;
    }
    if (!verification || typeof verification.loadIntegrityManifest !== 'function') {
      state.integrityManifestVerificationState = 'VERIFICATION_UNAVAILABLE';
      renderVerificationBlocked();
      return;
    }

    verification.loadIntegrityManifest(manifestUrl, request)
      .then(function (result) {
        state.integrityManifestVerificationState = verification && verification.normalizeState
          ? verification.normalizeState(result && result.state)
          : 'VERIFICATION_UNAVAILABLE';

        /* Store the manifest hash as the lifecycle manifestId. This binds
         * lifecycle records to this specific package version. */
        state.manifestId = (result && result.metadata && result.metadata.manifestHash) || null;

        /* Store the frozen QR library attestation issued by the verifier.
         * This is the only token passed to loadQrLibrary(); it contains
         * exactly the path and sha256 of qrcode.min.js and nothing more. */
        state.qrLibraryAttestation = (result && result.qrLibraryAttestation) || null;

        if (!verification || !verification.canExecuteTransfer(state.integrityManifestVerificationState)) {
          renderVerificationBlocked();
          return;
        }

        /* Run lifecycle pipeline async — result stored for commitment time.
         * With the current empty lifecycle bundle this produces a blocked
         * result; authorization will fail until real lifecycle records exist. */
        runLifecyclePipeline(registryRecord);

        initAmountSurface(registryRecord);
        transition('CONFIGURE');

        /* Load the QR rendering library after the UI state transitions to CONFIGURE.
         * A failed load is a controlled product state (FAILED → "QR unavailable").
         * The rejection is handled inside loadQrLibrary via .catch() on the cached
         * promise; consume it explicitly here too so no unhandled rejection fires. */
        loadQrLibrary(state.qrLibraryAttestation).catch(function () {});
        setChipState('cc-card-chip--waiting', true, 'Enter amount to review');

        emit('CC_READY', {
          recipient: registryRecord.recipient,
          chainId:   registryRecord.chainId,
          token:     registryRecord.token,
          owner:     registryRecord.owner || null,
        });
      })
      .catch(function (err) {
        state.integrityManifestVerificationState = 'VERIFICATION_UNAVAILABLE';
        renderVerificationBlocked();
      });
  }

  /* ----------------------------------------------------------------
   * Registry record fetch
   * ---------------------------------------------------------------- */
  function loadRegistryRecord(cardId) {
    transition('MANIFEST_LOADING');
    var pointer = verification && verification.readIntegrityManifestPointer(frame);
    if (!pointer || pointer.state === 'VERIFICATION_UNAVAILABLE') {
      state.integrityManifestVerificationState = 'VERIFICATION_UNAVAILABLE';
      renderError('Verification unavailable', pointer && pointer.error);
      return;
    }
    var request = getFetchImpl();
    if (!request) {
      renderError('Registry unavailable', 'fetch-unavailable');
      return;
    }
    var url = '/registry/coincards/' + encodeURIComponent(cardId) + '.json';

    request(url)
      .then(function (response) {
        if (response.status === 404) return { _notFound: true };
        if (!response.ok) throw new Error('fetch-error-' + response.status);
        return response.json();
      })
      .then(function (registryRecord) {
        if (registryRecord._notFound) {
          renderError('No record found', cardId);
          return;
        }

        if (registryRecord.status === 'revoked') {
          state.registryRecord = registryRecord;
          state.integrityManifestVerificationState = 'CARD_REVOKED';
          renderRevoked(registryRecord);
          transition('REVOKED');
          emit('CC_ERROR', { message: 'revoked' });
          return;
        }

        var err = validateRegistryRecord(registryRecord, cardId);
        if (err) {
          renderError('Invalid registry record', err);
          return;
        }

        if (registryRecord.status !== 'active') {
          renderError('Card not active', registryRecord.status);
          return;
        }

        state.registryRecord = registryRecord;
        renderTrust(registryRecord);
        state.integrityManifestVerificationState = 'VERIFICATION_UNAVAILABLE';
        applyIntegrityManifestVerification(registryRecord, pointer);
      })
      .catch(function (err) {
        renderError('Registry unavailable', err && err.message);
      });
  }

  /* ----------------------------------------------------------------
   * QR library governance — load only after verification succeeds.
   *
   *   qrcode.min.js is NOT loaded via a static <script> tag. It is
   *   injected dynamically by loadQrLibrary(), called only after
   *   canExecuteTransfer() returns true, using the frozen attestation
   *   issued by the integrity verifier (qrLibraryAttestation).
   *
   *   The attestation contains exactly one validated path and sha256
   *   hex string — no other manifest data is passed downstream.
   *
   *   The browser SRI attribute provides a second independent check
   *   before execution; the browser refuses to execute if bytes differ.
   *
   *   State machine: NOT_REQUESTED → LOADING → READY | FAILED.
   *   loadQrLibrary is idempotent; repeated calls after the first are
   *   no-ops. Each state transition is visible to openQrPanel.
   * ---------------------------------------------------------------- */
  function renderQrFailed() {
    var urlEl = el('ccQrUrl');
    if (urlEl) urlEl.textContent = 'QR unavailable — present card URL manually';
    var canvas = el('ccQrCanvas');
    if (canvas) canvas.style.display = 'none';
  }

  function loadQrLibrary(attestation) {
    /* Idempotent: return the cached promise on repeated calls. */
    if (qrLibraryPromise) return qrLibraryPromise;

    /* Brand check — only attestations issued by the active verifier instance
     * are accepted. Shape-alike external objects are rejected. */
    if (!verification || !verification.isQrLibraryAttestation ||
        !verification.isQrLibraryAttestation(attestation)) {
      state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
      qrLibraryPromise = Promise.reject(new Error('qr-attestation-not-recognized'));
      qrLibraryPromise.catch(function () {});
      return qrLibraryPromise;
    }

    /* Shape validation — keep path and sha256 format checks as defence in depth. */
    if (!attestation || attestation.path !== 'js/vendor/qrcode.min.js') {
      state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
      qrLibraryPromise = Promise.reject(new Error('qr-attestation-path-invalid'));
      qrLibraryPromise.catch(function () {});
      return qrLibraryPromise;
    }
    if (typeof attestation.sha256 !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/.test(attestation.sha256)) {
      state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
      qrLibraryPromise = Promise.reject(new Error('qr-attestation-sha256-invalid'));
      qrLibraryPromise.catch(function () {});
      return qrLibraryPromise;
    }

    /* Convert sha256:HEX → base64 for the SRI integrity attribute. */
    var hexHash = attestation.sha256.slice('sha256:'.length);
    var hashBytes = new Uint8Array(32);
    for (var bi = 0; bi < 32; bi++) {
      hashBytes[bi] = parseInt(hexHash.slice(bi * 2, bi * 2 + 2), 16);
    }
    var binary = '';
    for (var ci = 0; ci < hashBytes.length; ci++) binary += String.fromCharCode(hashBytes[ci]);
    var btoaImpl = window.btoa || null;
    if (typeof btoaImpl !== 'function') {
      state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
      qrLibraryPromise = Promise.reject(new Error('qr-btoa-unavailable'));
      qrLibraryPromise.catch(function () {});
      return qrLibraryPromise;
    }
    var b64 = btoaImpl(binary);
    if (!b64) {
      state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
      qrLibraryPromise = Promise.reject(new Error('qr-btoa-failed'));
      qrLibraryPromise.catch(function () {});
      return qrLibraryPromise;
    }

    qrLibraryPromise = new Promise(function (resolve, reject) {
      state.qrLibraryState = QR_LIBRARY_STATE.LOADING;

      var scriptEl = document.createElement('script');
      scriptEl.src = '/js/vendor/qrcode.min.js';
      scriptEl.integrity = 'sha256-' + b64;
      scriptEl.crossOrigin = 'anonymous';

      scriptEl.onload = function () {
        if (typeof QRCode === 'undefined' || !QRCode.toCanvas) {
          state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
          renderQrFailed();
          reject(new Error('qrcode-not-available-after-load'));
          return;
        }
        state.qrLibraryState = QR_LIBRARY_STATE.READY;
        /* Render immediately if the user opened the QR panel while loading. */
        if (frame && frame.classList.contains('cc-qr-active')) {
          generateQR();
        }
        resolve();
      };

      scriptEl.onerror = function () {
        /* SRI mismatch, network failure, or CSP violation — fail closed. */
        state.qrLibraryState = QR_LIBRARY_STATE.FAILED;
        if (frame && frame.classList.contains('cc-qr-active')) {
          renderQrFailed();
        }
        reject(new Error('qrcode-load-failed'));
      };

      document.head.appendChild(scriptEl);
    });

    return qrLibraryPromise;
  }

  /* ----------------------------------------------------------------
   * Init — read card ID from URL path
   *   URL: https://implicitex.com/card/antoine
   *   pathname.split('/') → ['', 'card', 'antoine']
   * ---------------------------------------------------------------- */
  /* ----------------------------------------------------------------
   * QR receive — generates QR encoding the environment-origin card URL.
   *   Without amount: {window.location.origin}/card/{cardId}
   * ---------------------------------------------------------------- */
  function generateQR() {
    if (typeof QRCode === 'undefined' || !QRCode.toCanvas) return;
    var canvas = el('ccQrCanvas');
    if (!canvas || !state.cardId) return;

    /* Canonical card URL — uses the page's own origin so staging and
     * local environments do not silently route into production. */
    var url    = window.location.origin + '/card/' + encodeURIComponent(state.cardId);
    var urlEl  = el('ccQrUrl');
    if (urlEl) urlEl.textContent = url;

    QRCode.toCanvas(canvas, url, {
      width: 200,
      margin: 2,
      color: { dark: '#0c0c0a', light: '#ffffff' }
    }, function (err) {
      if (err) console.warn('[IX] QR generation error', err);
    });
  }

  function openQrPanel() {
    if (frame) frame.classList.add('cc-qr-active');

    if (state.qrLibraryState === QR_LIBRARY_STATE.LOADING) {
      /* Show a transient message; generateQR() is called in onload. */
      var urlElL = el('ccQrUrl');
      if (urlElL) urlElL.textContent = 'Loading\u2026';
      return;
    }

    if (state.qrLibraryState === QR_LIBRARY_STATE.FAILED) {
      renderQrFailed();
      return;
    }

    if (state.qrLibraryState !== QR_LIBRARY_STATE.READY) {
      /* NOT_REQUESTED or unexpected — fail closed. */
      var urlElU = el('ccQrUrl');
      if (urlElU) urlElU.textContent = 'QR unavailable';
      return;
    }

    generateQR();
  }

  function closeQrPanel() {
    if (frame) frame.classList.remove('cc-qr-active');
    /* Restore canvas visibility if renderQrFailed() had hidden it. */
    var canvas = el('ccQrCanvas');
    if (canvas) canvas.style.display = '';
    /* Return focus to the PRESENT CARD button so keyboard users retain context. */
    var receiveBtn = el('ccReceiveBtn');
    if (receiveBtn && typeof receiveBtn.focus === 'function') receiveBtn.focus();
  }

  Object.defineProperty(window, 'IX_COIN_CARD_RUNTIME_PREREQUISITES', {
    value: Object.freeze({
      parseUsdcAtomicString: parseUsdcAtomicString,
      prepareContractDraftAmounts: prepareContractDraftAmounts,
      initializeReviewRuntime: initializeReviewRuntime,
      getStateSnapshot: function () {
        return Object.freeze({
          reviewRuntimeReady: !!state.reviewRuntime,
          reviewRuntimeError: state.reviewRuntimeError,
          resolvedLifecycleReady: !!state.resolvedLifecycleResult,
          lifecycleReference: state.lifecycleReference,
          promotedPresentationReady: !!state.promotedPresentationResult,
          providerReference: state.providerReference,
          providerGeneration: state.providerGeneration,
          accountGeneration: state.accountGeneration,
          chainGeneration: state.chainGeneration,
          observedAccount: state.observedAccount,
          observedChainId: state.observedChainId,
        });
      },
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });

  function init() {
    initializeReviewRuntime();

    var chip = el('ccChip');
    if (chip) chip.addEventListener('click', handleChipClick);

    var receiveBtn = el('ccReceiveBtn');
    if (receiveBtn) receiveBtn.addEventListener('click', openQrPanel);

    var editBtn = el('ccEditPayment');
    if (editBtn) editBtn.addEventListener('click', editPayment);

    var qrClose = el('ccQrClose');
    if (qrClose) qrClose.addEventListener('click', closeQrPanel);

    /* Escape key closes the QR panel when it is open. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && frame && frame.classList.contains('cc-qr-active')) {
        closeQrPanel();
      }
    });

    var parts  = window.location.pathname.split('/').filter(Boolean);
    var cardId = (parts[1] || '').trim();

    state.cardId = cardId;

    if (!cardId) {
      renderError('No card specified');
      return;
    }

    if (!CARD_ID_RE.test(cardId)) {
      renderError('Invalid card ID', cardId);
      return;
    }

    loadRegistryRecord(cardId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
