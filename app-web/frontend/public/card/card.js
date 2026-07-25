/* card.js — Coin Card live surface state machine
 *
 * States:
 *   BOOT                  → initializing; reading card ID from URL
 *   MANIFEST_LOADING      → fetching Coin Card Registry Record
 *   VERIFIED              → registry record valid; input panel shown
 *   AMOUNT_READY          → valid amount entered; fee calculated
 *   TRANSFER_INTENT_READY → intent ready; chip --ready
 *   REVOKED               → registry record revoked; transfer blocked
 *   CONNECTING            → wallet connect in progress
 *   WRONG_NETWORK         → connected but on wrong chain
 *   SWITCHING_NETWORK     → chain switch in progress
 *   READY_TO_SEND         → review panel shown; awaiting chip tap
 *   APPROVE_PENDING       → USDC approval submitted
 *   EXECUTE_PENDING       → transferWithFee submitted
 *   CONFIRMED             → transfer confirmed on-chain
 *   TX_FAILED             → execution error (card visible; error panel shown)
 *   ERROR                 → registry-record-level error (card hidden; frame error shown)
 *
 * Body panels (CSS data-state rules control visibility):
 *   #ccBodyInput     — amount entry
 *   #ccBodyReview    — confirm review
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
 *   { source:'implicitex-coincard', type:'CC_AMOUNT_CHANGED',  cardId, payload:{ amount, fee, total } }
 *   { source:'implicitex-coincard', type:'CC_INTENT_READY',    cardId, payload:{ intent } }
 *   { source:'implicitex-coincard', type:'CC_READY_TO_SEND',   cardId, payload:{ sender, intent } }
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
    fee:                 null,
    total:               null,
    rawAmount:           null,   /* BigInt — recipientAmountAtomic for authorization */
    rawFee:              null,   /* BigInt — platformFeeAtomic for authorization */
    rawTotal:            null,   /* BigInt — totalDebitAtomic for authorization */
    intent:              null,
    sender:              null,
    /*
     * activeProvider — the EIP-1193 provider resolved at wallet connect time.
     * Set by connectWallet() when the 'prepare' action returns 'ready-to-send'
     * or 'wrong-network'. Remains set through snapshot, authorization, and
     * execution. The same provider object is passed to readWalletSnapshot()
     * and to executeTransfer() as both request.provider and request.snapshotProvider.
     * Cleared if the card transitions back to TRANSFER_INTENT_READY.
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
  var providerReferenceSeq = 0;
  var USDC_ATOMIC_SCALE = 1000000n;

  var SHELL_ACTIVE_STATES = {
    VERIFIED: true, AMOUNT_READY: true, TRANSFER_INTENT_READY: true,
    REVOKED: true, CONNECTING: true, WRONG_NETWORK: true,
    SWITCHING_NETWORK: true, READY_TO_SEND: true,
    APPROVE_PENDING: true, EXECUTE_PENDING: true,
    CONFIRMED: true, TX_FAILED: true,
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

  function getRouteVerifiedStatusLabel() {
    var copy = verification && typeof verification.getStateCopy === 'function'
      ? verification.getStateCopy('VERIFIED')
      : null;
    return copy && copy.statusLabel || 'Route Verified';
  }

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

  function readCompleteWalletObservation(provider) {
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

    return provider.request({ method: 'eth_accounts' })
      .then(function (accounts) {
        var sender = accounts && accounts.length ? accounts[0] : null;
        if (!sender) throw new Error('account-unavailable');
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
                if (!nativeGasBalanceResult || nativeGasBalanceResult.status !== 'AVAILABLE') {
                  return makeUnavailableWalletObservation('native-gas-balance-unavailable');
                }
                state.observationGeneration += 1;
                var observation = {
                  senderAddress: sender,
                  observedChainId: observedChainId,
                  tokenBalanceAtomic: snapshot.balanceAtomic,
                  allowanceAtomic: snapshot.allowanceAtomic,
                  nativeGasBalanceAtomic: nativeGasBalanceResult.value,
                  gasReadiness: 'UNAVAILABLE',
                  providerReference: providerReference,
                  accountGeneration: String(state.accountGeneration),
                  chainGeneration: String(state.chainGeneration),
                  providerGeneration: String(state.providerGeneration),
                  observedAt: 'observation:' + state.observationGeneration,
                };
                return makeUnavailableWalletObservation('gas-readiness-policy-unavailable', observation);
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
    setStatus('verified', getRouteVerifiedStatusLabel());
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
  function applyAmount(amount, chainId) {
    var feeBps    = (state.registryRecord && state.registryRecord.feeBps != null)
                     ? state.registryRecord.feeBps : null;
    var rawAmount = window.IX_EXECUTION.toRawUsdc(amount);
    var feeResult = window.IX_EXECUTION.calculateFee(rawAmount, chainId, feeBps);
    var fee       = Number(feeResult.fee)   / 1e6;
    var total     = Number(feeResult.total) / 1e6;
    var min       = CHAIN_MIN_USDC[chainId] || 1;
    var max       = CHAIN_MAX_USDC[chainId] || 250;

    if (amount < min || amount > max) {
      clearFee();
      transition('VERIFIED');
      return;
    }

    state.amount   = amount;
    state.fee      = fee;
    state.total    = total;
    state.rawAmount = rawAmount;
    state.rawFee    = feeResult.fee;
    state.rawTotal  = feeResult.total;

    var token = (state.registryRecord && state.registryRecord.token || 'USDC').toUpperCase();
    setText('ccFeeValue',   fee.toFixed(2)   + ' ' + token);
    setText('ccTotalValue', total.toFixed(2) + ' ' + token);

    transition('AMOUNT_READY');
    buildIntent();
    emit('CC_AMOUNT_CHANGED', { amount: amount, fee: fee, total: total });
  }

  function clearFee() {
    state.amount    = null;
    state.fee       = null;
    state.total     = null;
    state.rawAmount = null;
    state.rawFee    = null;
    state.rawTotal  = null;
    state.intent    = null;
    setText('ccFeeValue',   '\u2014');
    setText('ccTotalValue', '\u2014');
    setChipState('cc-card-chip--waiting', true, 'Enter amount to continue');
  }

  /* ----------------------------------------------------------------
   * Intent construction
   * ---------------------------------------------------------------- */
  function buildIntent() {
    if (!state.registryRecord || state.amount == null) return;
    var m          = state.registryRecord;
    var chainParams = window.IX_EXECUTION ? window.IX_EXECUTION.getChainParams(m.chainId) : null;
    state.intent = {
      cardId:                   m.cardId,
      recipient:                m.recipient,
      amount:                   state.amount,
      fee:                      state.fee,
      total:                    state.total,
      chainId:                  m.chainId,
      token:                    m.token,
      owner:                    m.owner || null,
      /* Atomic string amounts for execution authorization. */
      recipientAmountAtomic:    state.rawAmount != null ? String(state.rawAmount) : null,
      platformFeeAtomic:        state.rawFee    != null ? String(state.rawFee)    : null,
      totalDebitAtomic:         state.rawTotal  != null ? String(state.rawTotal)  : null,
      /* Chain contract addresses for execution authorization. */
      tokenAddress:             chainParams ? chainParams.usdcAddress    : null,
      executionContractAddress: chainParams ? chainParams.contractAddress : null,
    };
    transition('TRANSFER_INTENT_READY');
    setChipState('cc-card-chip--ready', false, 'Connect wallet to send USDC');
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
      applyAmount(registryRecord.lockedAmount, chainId);
    } else {
      /* sender_input / suggested: user enters amount */
      var input = el('ccAmountInput');
      if (input) {
        input.addEventListener('input', function () {
          var raw = parseFloat(input.value);
          if (!isFinite(raw) || raw <= 0) {
            clearFee();
            transition('VERIFIED');
            return;
          }
          applyAmount(raw, chainId);
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
  function connectWallet() {
    if (!window.IX_EXECUTION) { renderError('Execution module unavailable'); return; }
    if (!verification || !verification.canExecuteTransfer(state.integrityManifestVerificationState)) {
      renderVerificationBlocked();
      return;
    }

    /* Resolve the active provider once at connect time. */
    var resolvedProvider = resolveProvider();

    transition('CONNECTING');
    setText('ccExecLabel', 'Connecting wallet\u2026');
    if (state.intent) setText('ccExecAmount', state.intent.amount.toFixed(2));
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
          transition('TRANSFER_INTENT_READY');
          setText('ccTxLabel', 'Send USDC');
          setStatus('verified', getRouteVerifiedStatusLabel());
          setChipState('cc-card-chip--ready', false, 'Connect wallet to send USDC');
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
          showConfirmPanel();
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
    if (state.intent) setText('ccExecAmount', state.intent.amount.toFixed(2));
    setChipState('cc-card-chip--active', true, 'Switching network\u2026');
    setStatus('pending', 'Switching');

    window.IX_EXECUTION.executeTransfer({
      action: 'switch-network',
      chainId: registryRecordChainId,
    })
      .then(function (result) {
        if (result.status === 'ready-to-send') {
          noteProvider(state.activeProvider);
          showConfirmPanel();
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
   * Review panel
   * ---------------------------------------------------------------- */
  function showConfirmPanel() {
    if (!state.intent || !state.sender || !state.registryRecord) {
      transition('TRANSFER_INTENT_READY');
      setText('ccTxLabel', 'Send USDC');
      setStatus('verified', getRouteVerifiedStatusLabel());
      setChipState('cc-card-chip--ready', false, 'Connect wallet to send USDC');
      return;
    }
    var intent = state.intent;
    var token  = (state.registryRecord.token || 'USDC').toUpperCase();
    var bps    = state.registryRecord.feeBps != null ? state.registryRecord.feeBps : 100;

    setText('ccReviewAmount',  intent.amount.toFixed(2));
    setText('ccReviewFee',     intent.fee.toFixed(2)   + ' ' + token);
    setText('ccReviewTotal',   intent.total.toFixed(2) + ' ' + token);
    setText('ccReviewFeePct',  'Fee ' + (bps / 100).toFixed(1) + '%');

    setStatus('verified', getRouteVerifiedStatusLabel());
    transition('READY_TO_SEND');
    setChipState('cc-card-chip--ready', false, 'Confirm transfer in wallet');
    emit('CC_READY_TO_SEND', { sender: state.sender, intent: intent });
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

  function startExecution() {
    if (!state.intent || !state.sender || !state.registryRecord || !window.IX_EXECUTION) return;
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

    var intent  = state.intent;
    var chainId = state.registryRecord.chainId;
    var token   = (state.registryRecord.token || 'USDC').toUpperCase();

    /* Freeze the transfer intent snapshot at commitment time. */
    var transferIntent = Object.freeze({
      cardId:                   intent.cardId || null,
      manifestId:               state.manifestId || null,
      tokenAddress:             intent.tokenAddress || null,
      executionContractAddress: intent.executionContractAddress || null,
      chainId:                  chainId,
      recipient:                intent.recipient,
      recipientAmountAtomic:    intent.recipientAmountAtomic || null,
      platformFeeAtomic:        intent.platformFeeAtomic || null,
      totalDebitAtomic:         intent.totalDebitAtomic || null,
    });

    /* Read live wallet state for the wallet snapshot input.
     * Pass the resolved provider so the snapshot and execution use the same session. */
    window.IX_EXECUTION.readWalletSnapshot(state.sender, chainId, state.activeProvider)
      .then(function (walletSnapshot) {
        if (!walletSnapshot) {
          renderTxError('Wallet state unavailable for authorization');
          return;
        }

        /* Request authorization — three-input gate. */
        var authResult = authModule.authorizeExecution(
          state.promotedPresentationResult,
          transferIntent,
          walletSnapshot
        );

        if (!authModule.isExecutionAuthorizedResult(authResult)) {
          renderTxError(describeAuthFailure(authResult));
          return;
        }

        /* Authorization proof obtained — proceed with execution. */
        var traceId = generateTraceId();

        /* Prime exec panel with amount (name+recipient populated by renderTrust). */
        setText('ccExecAmount', intent.amount.toFixed(2));
        transition('APPROVE_PENDING');
        setChipState('cc-card-chip--active', true, 'Confirm USDC approval in wallet\u2026');
        setText('ccExecLabel', 'Confirm USDC approval in wallet\u2026');
        setStatus('pending', 'Pending');

        window.IX_EXECUTION.executeTransfer({
          action:             'execute-authorized',
          authorizationProof: authResult,
          provider:           state.activeProvider,
          snapshotProvider:   state.activeProvider,
          token:              token,
          source:             'coincard',
          traceId:            traceId,
        }, {
          onApprovalSubmitted: function () {
            setText('ccExecLabel', 'Approval submitted. Awaiting confirmation\u2026');
          },
          onTransferRequested: function () {
            transition('EXECUTE_PENDING');
            setChipState('cc-card-chip--active', true, 'Confirm transfer in wallet\u2026');
            setText('ccExecLabel', 'Confirm transfer in wallet\u2026');
          },
          onTransferSubmitted: function () {
            setText('ccExecLabel', 'Transfer submitted. Awaiting on-chain confirmation\u2026');
            setStatus('submitted', 'Confirming');
          },
        })
          .then(function (result) {
            if (result.status === 'confirmed') {
              var receipt = result.receipt;
              setText('ccConfirmedAmount', intent.amount.toFixed(2));
              var txHashEl = el('ccTxHash');
              if (txHashEl && receipt) {
                txHashEl.href        = receipt.explorerUrl || '#';
                txHashEl.textContent = receipt.txHash.slice(0, 10) + '\u2026' + receipt.txHash.slice(-6);
                txHashEl.title       = receipt.txHash;
              }
              setStatus('confirmed', 'Confirmed');
              transition('CONFIRMED');
              setChipState('cc-card-chip--done', true, 'Transfer confirmed');
              emit('CC_CONFIRMED', { txHash: receipt && receipt.txHash, sender: state.sender, intent: intent, receipt: receipt });
              return;
            }
            if (result.status === 'wallet-rejected') {
              /* Proof is consumed — user must re-authorize on next attempt. */
              transition('READY_TO_SEND');
              setStatus('verified', getRouteVerifiedStatusLabel());
              setChipState('cc-card-chip--ready', false, 'Confirm transfer in wallet');
              return;
            }
            if (result.status === 'wallet-busy') {
              transition('READY_TO_SEND');
              setStatus('verified', getRouteVerifiedStatusLabel());
              setChipState('cc-card-chip--ready', false, 'Wallet busy — retry when ready');
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
              renderTxError(unknownMsg);
              return;
            }
            if (result.status === 'failed') {
              var msg = result.error && result.error.message || 'Transfer failed';
              renderTxError(msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg);
              return;
            }
            renderTxError('Unexpected execution result');
          })
          .catch(function (err) {
            var msg = err && err.message || 'Transfer failed';
            renderTxError(msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg);
          });
      })
      .catch(function () {
        renderTxError('Wallet state check failed');
      });
  }

  /* ----------------------------------------------------------------
   * Chip click dispatcher
   * ---------------------------------------------------------------- */
  function handleChipClick() {
    switch (state.current) {
      case 'TRANSFER_INTENT_READY': connectWallet();   break;
      case 'WRONG_NETWORK':         switchNetwork();   break;
      case 'READY_TO_SEND':         startExecution();  break;
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
        transition('VERIFIED');

        /* Load the QR rendering library after the UI state transitions to VERIFIED.
         * A failed load is a controlled product state (FAILED → "QR unavailable").
         * The rejection is handled inside loadQrLibrary via .catch() on the cached
         * promise; consume it explicitly here too so no unhandled rejection fires. */
        loadQrLibrary(state.qrLibraryAttestation).catch(function () {});
        setChipState('cc-card-chip--waiting', true, 'Enter amount to continue');

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
