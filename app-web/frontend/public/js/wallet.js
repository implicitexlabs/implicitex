/**
 * wallet.js — ImplicitEx wallet connection and transfer flow
 *
 * Current state: live Polygon transfer UI with local-only receipt persistence.
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Provider runtime — source of truth for the active wallet provider.
  // Before WalletConnect: getWalletProvider() falls back to window.ethereum.
  // After WalletConnect wiring: walletRuntime.provider is set on connect.
  // ----------------------------------------------------------------
  const walletRuntime = {
    provider: null,
    source: null, // 'injected' | 'walletconnect'
  };

  function getWalletProvider() {
    return walletRuntime.provider || window.ethereum || null;
  }

  // ----------------------------------------------------------------
  // Transfer flow lifecycle — re-entry guard + invalidation token + wallet cooldown.
  // activeTransferFlow:  prevents concurrent submitTransfer() calls.
  // activeFlowId:        Symbol per invocation. Set to null by account/network/disconnect
  //                      events to signal that the running flow should abort cleanly.
  // submitBlockedUntil:  timestamp (ms) set after -32002 wallet-busy errors.
  //                      Prevents rapid retries while MetaMask still has a pending request.
  // ----------------------------------------------------------------
  let activeTransferFlow = false;
  let activeFlowId = null;
  let submitBlockedUntil = 0;

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  const state = {
    connected: false,
    address:   null,
    provider:  null,
    chainId:   null,
    connecting: false,
    userDisconnected: false,
    txPhase:   'DRAFT',   // 'DRAFT' | 'SIMULATING' | 'REVIEW_READY'
    reviewDraft: null,    // frozen validated draft set by enterReview
    transferTimeline: { active: [], terminal: null },
    usdcBalanceRaw: null,
    networkPollTimer: null,
    walletChainPollTimer: null,
    recipientCodeWarning: null,
  };

  const DEMO_FEE_RATE = 0.01;
  const POLYGON_GAS_STATION_URL = 'https://gasstation.polygon.technology/v2';
  const POLYGON_MAINNET_CHAIN_ID = 137;
  const POLYGON_MAINNET_CHAIN_HEX = '0x89';
  const RECIPIENT_BOOK_KEY = 'ix.recipient.book';
  const TRANSFER_STATUS = window.IX && window.IX.transferStatus;
  const IX_TRANSFER_STATES = TRANSFER_STATUS && TRANSFER_STATUS.IX_TRANSFER_STATES;
  const ERROR_CLASSIFIER = window.IX && window.IX.errorClassifier;
  const RECEIPT_SCHEMA = window.IX && window.IX.receiptSchema;
  const OBSERVATION_SOURCES = RECEIPT_SCHEMA && RECEIPT_SCHEMA.OBSERVATION_SOURCES;
  const PURPOSE_TAGS = new Set([
    'invoice',
    'contractor',
    'refund',
    'family',
    'donation',
    'purchase',
    'subscription',
    'test',
    'other',
  ]);

  // Minimal ABIs — only the selectors this client calls.
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
  ];

  const IMPLICITEX_ABI = [
    'function minTransferAmount() view returns (uint256)',
    'function transferPrecision() view returns (uint256)',
    'function paused() view returns (bool)',
    'function previewTransfer(address sender,uint256 amount) view returns (uint256 fee,uint256 totalDebit,uint256 balance,uint256 allowance,bool canTransfer)',
    'function transferWithFee(address recipient, uint256 amount)',
  ];

  // ----------------------------------------------------------------
  // Companion helper — guards against load-order timing.
  // companion.js registers window.IX.companion after wallet.js runs,
  // but all calls happen on user interaction, so it is always available by then.
  // ----------------------------------------------------------------
  function companionState(stateKey, detail) {
    if (window.IX && window.IX.companion) {
      window.IX.companion.setState(stateKey, detail);
    }
    updateTelemetryFromTransferState(stateKey, detail);
  }

  // ----------------------------------------------------------------
  // Telemetry helper — drives TELEMETRY panel signal + rows.
  // Signal mapping: network/transfer state → level + rate + summary.
  // ----------------------------------------------------------------
  var TELEMETRY_SIGNAL_MAP = {
    'DISCONNECTED':        { level: 'dormant',   rate: 'low',  summary: 'Nominal' },
    'WALLET_CONNECTED':    { level: 'status',    rate: 'low',  summary: 'Connected' },
    'WRONG_NETWORK':       { level: 'elevated',  rate: 'avg',  summary: 'Wrong network' },
    'CONTRACT_UNAVAILABLE':{ level: 'elevated',  rate: 'avg',  summary: 'Contract unavailable' },
    'TRANSFERS_DISABLED':  { level: 'elevated',  rate: 'avg',  summary: 'Transfers disabled' },
    'ready':               { level: 'status',    rate: 'low',  summary: 'Ready' },
    'authorizing':         { level: 'status',    rate: 'avg',  summary: 'Awaiting approval' },
    'authorized':          { level: 'status',    rate: 'avg',  summary: 'Approved' },
    'submitting':          { level: 'status',    rate: 'avg',  summary: 'Submitting' },
    'submitted':           { level: 'status',    rate: 'avg',  summary: 'Submitted' },
    'confirmed':           { level: 'status',    rate: 'low',  summary: 'Confirmed' },
    'rejected':            { level: 'status',    rate: 'low',  summary: 'Rejected by wallet' },
    'failed':              { level: 'critical',  rate: 'avg',  summary: 'Transaction failed' },
    'interrupted':         { level: 'elevated',  rate: 'avg',  summary: 'Interrupted' },
    'outcome_unknown':     { level: 'elevated',  rate: 'high', summary: 'Outcome uncertain' },
  };

  var TELEMETRY_GUIDANCE_MAP = {
    'WRONG_NETWORK':        [{ key: 'Action',   value: 'Switch to Polygon to continue.' }],
    'CONTRACT_UNAVAILABLE': [{ key: 'Status',   value: 'Contract not deployed on this network.' }],
    'TRANSFERS_DISABLED':   [{ key: 'Status',   value: 'Transfers currently disabled on this network.' }],
    'failed':               [{ key: 'Recovery', value: 'Funds were not moved. Safe to retry.' }],
    'interrupted':          [{ key: 'Recovery', value: 'Session interrupted. Funds were not moved. Safe to retry.' }],
    'outcome_unknown':      [{ key: 'Recovery', value: 'Transaction status uncertain. Verify on the block explorer before retrying.' }],
  };

  function updateTelemetryFromTransferState(stateKey, detail) {
    if (!window.IX || !window.IX.telemetry) return;
    var tel = window.IX.telemetry;

    var sig = TELEMETRY_SIGNAL_MAP[stateKey] || { level: 'status', rate: 'low', summary: 'Active' };
    tel.setSignal(sig);

    // Status rows — wallet address + network
    var statusRows = [];
    if (state.address) {
      statusRows.push({ key: 'Wallet', value: state.address });
    }
    var chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    if (chainConfig && chainConfig.name) {
      statusRows.push({ key: 'Network', value: chainConfig.name });
    } else if (state.chainId) {
      statusRows.push({ key: 'Chain ID', value: String(state.chainId) });
    }
    tel.setRows('status', statusRows);

    // Details rows — contract, USDC, tx hash, explorer
    var detailRows = [];
    if (chainConfig) {
      if (chainConfig.contractAddress) {
        detailRows.push({ key: 'Contract', value: chainConfig.contractAddress });
      }
      if (chainConfig.usdcAddress) {
        detailRows.push({ key: 'USDC', value: chainConfig.usdcAddress });
      }
    }
    // txHash may arrive as detail.txHash or detail.eventVal (when eventVal is a 0x hash string)
    var txHashVal = (detail && detail.txHash)
      || (detail && detail.eventVal && /^0x[0-9a-fA-F]{64}$/.test(detail.eventVal) ? detail.eventVal : null);

    if (txHashVal) {
      detailRows.push({ key: 'Tx Hash', value: txHashVal });
      var explorerBase = chainConfig && chainConfig.explorerUrl
        ? chainConfig.explorerUrl.replace(/\/$/, '') + '/tx/'
        : null;
      if (explorerBase) {
        var url = explorerBase + txHashVal;
        detailRows.push({
          key: 'Explorer',
          value: '<a href="' + url + '" target="_blank" rel="noopener">View on explorer ↗</a>',
          html: true,
        });
      }
    }
    tel.setRows('details', detailRows);

    // Guidance rows — contextual, state-specific
    var guidance = TELEMETRY_GUIDANCE_MAP[stateKey] || [];
    tel.setRows('guidance', guidance);
  }

  // ----------------------------------------------------------------
  // Receipt store helpers — same guard pattern as companionState.
  //
  // storeReceipt(detail)         — create active receipt, return receipt
  // updateReceipt(id, patch)     — patch active receipt by id
  // resolveReceipt(id, patch)    — patch then move to archive (terminal state)
  //
  // wallet.js emits events only. receipt-store.js owns persistence.
  // ----------------------------------------------------------------
  function storeReceipt(detail) {
    if (window.IX && window.IX.receipts) {
      return window.IX.receipts.create(Object.assign({
        observationSource: OBSERVATION_SOURCES && OBSERVATION_SOURCES.LOCAL,
      }, detail));
    }
    return { id: '_noop' }; // storage unavailable — id is a harmless sentinel
  }

  function updateReceipt(id, patch) {
    if (window.IX && window.IX.receipts) {
      return window.IX.receipts.update(id, Object.assign({
        observationSource: OBSERVATION_SOURCES && OBSERVATION_SOURCES.WALLET,
      }, patch));
    }
    return false;
  }

  function updateReceiptFromSource(id, patch, source) {
    if (window.IX && window.IX.receipts) {
      return window.IX.receipts.update(id, Object.assign({
        observationSource: source,
      }, patch));
    }
    return false;
  }

  function resolveReceipt(id, patch) {
    // update fields first, then archive — always a terminal-state operation
    if (updateReceipt(id, patch) && window.IX && window.IX.receipts) {
      window.IX.receipts.clearActive();
    }
  }

  function preserveReceiptForRehydration(id, patch) {
    // Used for broadcast receipts whose final chain outcome is still unknown.
    // Keep them active so rehydrate.js can query by hash on the next load.
    updateReceipt(id, patch);
  }

  // ----------------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------------
  const els = {
    connectBtn:     document.getElementById('connectBtn'),
    switchAccountBtn: document.getElementById('switchAccountBtn'),
    disconnectBtn:  document.getElementById('disconnectBtn'),
    walletPill:     document.getElementById('walletPill'),
    walletAddr:     document.getElementById('walletAddr'),
    modules:        document.getElementById('modules'),
    portalControls: document.getElementById('portalControls'),
    howItWorks:     document.getElementById('howItWorks'),
    txStatus:    document.getElementById('txStatus'),
    txBtn:       document.getElementById('txBtn'),
    feeDisplay:  document.getElementById('feeDisplay'),
    amtIn:       document.getElementById('txAmount'),
    gweiDisplay:        document.getElementById('gweiDisplay'),
    blockDisplay:       document.getElementById('blockDisplay'),
    gasHeroVal:         document.getElementById('gasHeroVal'),
    networkBadge:       document.getElementById('networkBadge'),
    navStatus:          document.querySelector('.nav-status'),
    networkNameDisplay: document.getElementById('networkNameDisplay'),
    contractStatus:     document.getElementById('contractStatus'),
    networkStatus:      document.getElementById('networkStatus'),
    senderAddressDisplay: document.getElementById('senderAddressDisplay'),
    usdcBalance:        document.getElementById('usdcBalance'),
    transferStateNote:  document.getElementById('transferStateNote'),
    txRecipient:        document.getElementById('txRecipient'),
    txPreview:          document.getElementById('txPreview'),
    previewRecipient:   document.getElementById('previewRecipient'),
    previewAmount:      document.getElementById('previewAmount'),
    previewFee:         document.getElementById('previewFee'),
    previewTotal:       document.getElementById('previewTotal'),
    previewNetwork:     document.getElementById('previewNetwork'),
    previewContract:    document.getElementById('previewContract'),
    previewMode:        document.getElementById('previewMode'),
    previewPurpose:     document.getElementById('previewPurpose'),
    previewNote:        document.getElementById('previewNote'),
    txTimeline:         document.getElementById('txTimeline'),
    txConfirmWrap:      document.getElementById('txConfirmWrap'),
    txConfirmAck:       document.getElementById('txConfirmAck'),
    recipientError:     document.getElementById('recipientError'),
    recipientIntel:     document.getElementById('recipientIntel'),
    recipientIntelList: document.getElementById('recipientIntelList'),
    preflightList:      document.getElementById('preflightList'),
    txPurposeTag:       document.getElementById('txPurposeTag'),
    txReference:        document.getElementById('txReference'),
    txMemo:             document.getElementById('txMemo'),
    receiptHistory:     document.getElementById('receiptHistory'),
    txCancelReview:     document.getElementById('txCancelReview'),
    txPreviewLabel:     document.getElementById('txPreviewLabel'),
  };

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------
  function shortAddr(addr) {
    if (!addr || typeof addr !== 'string') return '';
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function fullStorageRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function fullStorageWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeAddress(value) {
    const v = String(value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
    if (typeof ethers !== 'undefined' && ethers.getAddress) {
      try {
        return ethers.getAddress(v);
      } catch (_) {
        return v;
      }
    }
    return v;
  }

  function getTransferMetadata() {
    const purposeTag = (els.txPurposeTag && els.txPurposeTag.value) || '';
    const referenceId = ((els.txReference && els.txReference.value) || '').trim().slice(0, 80);
    const memo = ((els.txMemo && els.txMemo.value) || '').trim().slice(0, 140);
    return {
      purposeTag: PURPOSE_TAGS.has(purposeTag) ? purposeTag : '',
      referenceId,
      memo,
    };
  }

  function purposeLabel(tag) {
    if (!tag) return 'Not tagged';
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }

  function setStatus(msg) {
    if (els.txStatus) els.txStatus.textContent = msg;
  }

  function setElementSeverity(el, severity) {
    if (!el) return;
    el.classList.remove('is-error', 'is-warning');
    if (severity) el.classList.add('is-' + severity);
  }

  function normalizeChainId(chainValue) {
    if (typeof chainValue === 'number') return chainValue;
    if (typeof chainValue !== 'string') return null;
    return parseInt(chainValue, chainValue.startsWith('0x') ? 16 : 10);
  }

  function providerErrorCode(err) {
    return err && (
      err.code ||
      (err.info && err.info.error && err.info.error.code) ||
      (err.data && err.data.originalError && err.data.originalError.code)
    );
  }

  function providerErrorMessage(err, fallback) {
    const code = providerErrorCode(err);
    if (code === 4001) return 'Wallet connection rejected.';
    if (code === -32002) return 'MetaMask already has a pending request. Open MetaMask and finish or cancel it.';
    if (code === 4100) return 'MetaMask has not authorized this site. Disconnect this site in MetaMask, then reconnect.';
    if (code === -32603) return 'MetaMask returned an internal error. Unlock MetaMask, check connected sites, then retry.';

    const message = err && (
      err.message ||
      (err.info && err.info.error && err.info.error.message) ||
      (err.data && err.data.message)
    );
    if (message) return `${fallback}: ${message}`;
    return fallback;
  }

  function providerErrorSeverity(err) {
    const code = providerErrorCode(err);
    if (code === -32002) return 'warning';
    if (code === 4001) return 'warning';
    return 'error';
  }

  function classifyTransferError(err, context) {
    if (ERROR_CLASSIFIER) {
      return ERROR_CLASSIFIER.classifyError(err, context);
    }
    return {
      code: 'UNKNOWN_ERROR',
      state: IX_TRANSFER_STATES.FAILED,
      title: 'Transfer could not continue',
      message: 'The transfer could not continue.',
      fundsMoved: false,
      broadcastKnown: false,
      retryGuidance: 'Review details, then retry if appropriate.',
      severity: 'blocking',
    };
  }

  // Persistent contextual note below the button — explains the current transfer gate.
  // Empty string clears it (element is invisible when empty).
  function setTransferNote(msg) {
    if (els.transferStateNote) els.transferStateNote.textContent = msg;
  }

  function resetReviewAcknowledgement() {
    if (els.txConfirmAck) els.txConfirmAck.checked = false;
    if (els.txConfirmWrap) els.txConfirmWrap.setAttribute('hidden', '');
    if (els.txBtn) els.txBtn.classList.remove('tx-btn--armed');
  }

  function setReviewAcknowledgementVisible(visible) {
    if (!els.txConfirmWrap) return;
    if (visible) {
      els.txConfirmWrap.removeAttribute('hidden');
    } else {
      els.txConfirmWrap.setAttribute('hidden', '');
    }
  }

  function updateReviewActionButton() {
    if (!els.txBtn || state.txPhase !== 'REVIEW_READY') return;
    const acknowledged = !!(els.txConfirmAck && els.txConfirmAck.checked);
    const armed = acknowledged && getNetworkState() === 'READY';

    els.txBtn.textContent = 'Execute Transfer';
    els.txBtn.disabled = !armed;
    els.txBtn.classList.toggle('tx-btn--armed', armed);
  }

  const TRANSFER_TIMELINE_LABELS = {
    review_ready: 'Review complete',
    authorization_requested: 'Wallet authorization requested',
    authorization_confirmed: 'Wallet authorization confirmed',
    transfer_requested: 'Transfer confirmation requested',
    broadcast: 'Transfer submitted to Polygon',
    confirmed: 'Transfer confirmed',
  };

  function renderTransferTimeline() {
    if (!els.txTimeline) return;
    const steps = state.transferTimeline && state.transferTimeline.active || [];
    const terminal = state.transferTimeline && state.transferTimeline.terminal;

    if (!steps.length) {
      els.txTimeline.replaceChildren();
      els.txTimeline.setAttribute('hidden', '');
      return;
    }

    const failedStep = terminal && terminal.step;
    const failedReason = terminal && terminal.reason;
    const currentStep = failedStep || steps[steps.length - 1];

    els.txTimeline.replaceChildren(...steps.map(step => {
      const item = document.createElement('div');
      const isFailed = failedStep === step;
      const isCurrent = !terminal && step === currentStep && step !== 'confirmed';
      const isComplete = !isFailed && !isCurrent;
      item.className = 'tx-timeline-item' +
        (isComplete ? ' is-complete' : '') +
        (isCurrent ? ' is-current' : '') +
        (isFailed ? ' is-failed' : '');

      const mark = document.createElement('span');
      mark.className = 'tx-timeline-mark';
      mark.textContent = isFailed ? '!' : isCurrent ? '●' : '✓';

      const label = document.createElement('span');
      label.textContent = isFailed && failedReason
        ? `${TRANSFER_TIMELINE_LABELS[step] || step}: ${failedReason}`
        : TRANSFER_TIMELINE_LABELS[step] || step;

      item.append(mark, label);
      return item;
    }));

    els.txTimeline.removeAttribute('hidden');
  }

  function markTransferStep(step) {
    if (!TRANSFER_TIMELINE_LABELS[step]) return;
    state.transferTimeline.terminal = null;
    if (!state.transferTimeline.active.includes(step)) {
      state.transferTimeline.active.push(step);
    }
    renderTransferTimeline();
  }

  function failTransferTimeline(step, reason) {
    if (!TRANSFER_TIMELINE_LABELS[step]) return;
    if (!state.transferTimeline.active.includes(step)) {
      state.transferTimeline.active.push(step);
    }
    state.transferTimeline.terminal = { step, reason: reason || 'Interrupted' };
    renderTransferTimeline();
  }

  function resetTransferTimeline() {
    state.transferTimeline = { active: [], terminal: null };
    renderTransferTimeline();
  }

  function resetTransferTimelineOnDraftEdit() {
    if (state.txPhase === 'DRAFT') resetTransferTimeline();
  }

  function resetBalanceDisplay() {
    state.usdcBalanceRaw = null;
    if (els.usdcBalance) els.usdcBalance.textContent = '—';
  }

  function updateSenderDisplay() {
    if (els.senderAddressDisplay) {
      els.senderAddressDisplay.textContent = state.address ? shortAddr(state.address) : '—';
      els.senderAddressDisplay.title = state.address || '';
    }
  }

  function clearTransferForm() {
    // Inline review reset — do not call exitReview() here to avoid calling
    // updatePreview() before inputs are cleared (prevents a preview flicker).
    state.reviewDraft = null;
    state.txPhase = 'DRAFT';
    if (els.txCancelReview) els.txCancelReview.setAttribute('hidden', '');
    if (els.txPreviewLabel) els.txPreviewLabel.textContent = 'Transfer Preview';
    resetReviewAcknowledgement();
    resetTransferTimeline();

    if (els.txRecipient) {
      els.txRecipient.value = '';
      els.txRecipient.disabled = false;
      els.txRecipient.classList.remove('tx-field--error');
    }
    if (els.amtIn) {
      els.amtIn.value = '';
      els.amtIn.disabled = false;
    }
    if (els.txPurposeTag) {
      els.txPurposeTag.value = '';
      els.txPurposeTag.disabled = false;
    }
    if (els.txReference) {
      els.txReference.value = '';
      els.txReference.disabled = false;
    }
    if (els.txMemo) {
      els.txMemo.value = '';
      els.txMemo.disabled = false;
    }
    if (els.recipientError) els.recipientError.textContent = '';
    if (els.feeDisplay) els.feeDisplay.textContent = '—';
    setStatus('');
    setTransferNote('');
    renderRecipientIntel();
    renderPreflight();
    hidePreview();
  }

  function clearTransferDraftPreservingStatus() {
    state.reviewDraft = null;
    state.txPhase = 'DRAFT';
    if (els.txCancelReview) els.txCancelReview.setAttribute('hidden', '');
    if (els.txPreviewLabel) els.txPreviewLabel.textContent = 'Transfer Preview';
    resetReviewAcknowledgement();
    resetTransferTimeline();
    if (els.txRecipient) {
      els.txRecipient.value = '';
      els.txRecipient.disabled = false;
      els.txRecipient.classList.remove('tx-field--error');
    }
    if (els.amtIn) {
      els.amtIn.value = '';
      els.amtIn.disabled = false;
    }
    if (els.txPurposeTag) {
      els.txPurposeTag.value = '';
      els.txPurposeTag.disabled = false;
    }
    if (els.txReference) {
      els.txReference.value = '';
      els.txReference.disabled = false;
    }
    if (els.txMemo) {
      els.txMemo.value = '';
      els.txMemo.disabled = false;
    }
    if (els.recipientError) els.recipientError.textContent = '';
    if (els.feeDisplay) els.feeDisplay.textContent = '—';
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.textContent = currentButtonLabel();
      els.txBtn.classList.remove('tx-btn--armed');
    }
    setTransferNote('');
    renderRecipientIntel();
    renderPreflight();
    hidePreview();
  }

  function clearDraftControlsAfterConfirmation() {
    state.reviewDraft = null;
    state.txPhase = 'DRAFT';

    if (els.txRecipient) {
      els.txRecipient.value = '';
      els.txRecipient.disabled = false;
      els.txRecipient.classList.remove('tx-field--error');
    }
    if (els.amtIn) {
      els.amtIn.value = '';
      els.amtIn.disabled = false;
    }
    if (els.txPurposeTag) {
      els.txPurposeTag.value = '';
      els.txPurposeTag.disabled = false;
    }
    if (els.txReference) {
      els.txReference.value = '';
      els.txReference.disabled = false;
    }
    if (els.txMemo) {
      els.txMemo.value = '';
      els.txMemo.disabled = false;
    }
    if (els.txCancelReview) els.txCancelReview.setAttribute('hidden', '');
    if (els.recipientError) els.recipientError.textContent = '';
    if (els.feeDisplay) els.feeDisplay.textContent = '—';
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.textContent = currentButtonLabel();
      els.txBtn.classList.remove('tx-btn--armed');
    }
    resetReviewAcknowledgement();
    renderRecipientIntel();
    renderPreflight();
  }

  function buildReceiptDetail({
    stateKey,
    sender,
    recipient,
    amount,
    fee,
    totalDebit,
    chainId,
    chainConfig,
    contractAddress,
    metadata,
    lastKnownMessage,
    fundsMoved = null,
  }) {
    return {
      state: stateKey,
      chainId,
      sender,
      recipient,
      amount: ethers.formatUnits(amount, 6),
      fee: ethers.formatUnits(fee, 6),
      totalDebit: ethers.formatUnits(totalDebit, 6),
      contractAddress,
      approvalHash: null,
      transferHash: null,
      hash: null, // legacy alias for rehydration compatibility
      fundsMoved,
      explorerUrl: null,
      lastKnownMessage,
      network: chainConfig.name,
      purposeTag: metadata && metadata.purposeTag || '',
      referenceId: metadata && metadata.referenceId || '',
      memo: metadata && metadata.memo || '',
    };
  }

  function showPreview() {
    if (els.txPreview) els.txPreview.removeAttribute('hidden');
  }

  function hidePreview() {
    if (els.txPreview) els.txPreview.setAttribute('hidden', '');
  }

  function formatUsdcRaw(raw, decimals = 2) {
    if (raw === null || raw === undefined) return '—';
    const sign = raw < 0n ? '-' : '';
    const value = raw < 0n ? -raw : raw;
    const whole = value / 1_000_000n;
    const frac = (value % 1_000_000n).toString().padStart(6, '0');
    if (decimals <= 0) return sign + whole.toString();
    return `${sign}${whole.toString()}.${frac.slice(0, decimals).padEnd(decimals, '0')}`;
  }

  function draftFeeBasisPoints(chainConfig) {
    return BigInt((chainConfig && chainConfig.feeBasisPoints) || 100);
  }

  function buildDraftSummary(recipient, amountStr, amountFloat, chainConfig) {
    const rawAmount = parseUsdcAmount(amountStr);
    const fee = (rawAmount * draftFeeBasisPoints(chainConfig)) / 10000n;
    const totalDebit = rawAmount + fee;
    const balance = state.usdcBalanceRaw;
    return {
      recipient,
      amountStr,
      amountFloat,
      rawAmount,
      fee,
      totalDebit,
      balance,
      chainConfig,
      balanceKnown: balance !== null && balance !== undefined,
      insufficientBalance: balance !== null && balance !== undefined && balance < totalDebit,
    };
  }

  function buildOnChainPreviewSummary(baseSummary, preview, chainConfig) {
    const fee = BigInt(preview[0]);
    const totalDebit = BigInt(preview[1]);
    const balance = BigInt(preview[2]);
    const allowance = BigInt(preview[3]);
    const canTransfer = Boolean(preview[4]);

    return Object.assign({}, baseSummary, {
      fee,
      totalDebit,
      balance,
      allowance,
      canTransfer,
      chainConfig,
      balanceKnown: true,
      insufficientBalance: balance < totalDebit,
    });
  }

  function recipientBookEntries() {
    const entries = fullStorageRead(RECIPIENT_BOOK_KEY, []);
    return Array.isArray(entries) ? entries : [];
  }

  function findRecipientBookEntry(address) {
    const normalized = normalizeAddress(address);
    if (!normalized) return null;
    return recipientBookEntries().find(entry =>
      entry.address && entry.address.toLowerCase() === normalized.toLowerCase()
    ) || null;
  }

  function upsertRecipientBook(address, metadata) {
    const normalized = normalizeAddress(address);
    if (!normalized) return;
    const now = new Date().toISOString();
    const entries = recipientBookEntries();
    const idx = entries.findIndex(entry =>
      entry.address && entry.address.toLowerCase() === normalized.toLowerCase()
    );
    const label = metadata && (metadata.referenceId || metadata.purposeTag || metadata.memo);
    if (idx >= 0) {
      entries[idx] = Object.assign({}, entries[idx], {
        label: entries[idx].label || label || '',
        lastUsedAt: now,
        transferCount: Number(entries[idx].transferCount || 0) + 1,
      });
    } else {
      entries.unshift({
        address: normalized,
        label: label || '',
        notes: '',
        createdAt: now,
        lastUsedAt: now,
        transferCount: 1,
      });
    }
    fullStorageWrite(RECIPIENT_BOOK_KEY, entries.slice(0, 50));
  }

  function localReceiptMatches(address) {
    const normalized = normalizeAddress(address);
    if (!normalized || !window.IX || !window.IX.receipts) return [];
    return window.IX.receipts.listAll().filter(receipt =>
      receipt.recipient && receipt.recipient.toLowerCase() === normalized.toLowerCase()
    );
  }

  function renderListItem(message, severity) {
    const li = document.createElement('li');
    li.textContent = message;
    if (severity) li.className = 'is-' + severity;
    return li;
  }

  function renderRecipientIntel() {
    if (!els.recipientIntel || !els.recipientIntelList) return;
    const recipient = (els.txRecipient && els.txRecipient.value.trim()) || '';
    const normalized = normalizeAddress(recipient);

    if (!recipient || !normalized) {
      els.recipientIntel.setAttribute('hidden', '');
      els.recipientIntelList.replaceChildren();
      return;
    }

    const matches = localReceiptMatches(normalized);
    const bookEntry = findRecipientBookEntry(normalized);
    const items = [
      renderListItem('Format valid', 'ok'),
      renderListItem('Confirm network with recipient', 'warning'),
    ];

    if (
      state.recipientCodeWarning &&
      state.recipientCodeWarning.address &&
      state.recipientCodeWarning.address.toLowerCase() === normalized.toLowerCase() &&
      state.recipientCodeWarning.chainId === state.chainId &&
      state.recipientCodeWarning.isContract
    ) {
      items.push(renderListItem('Smart contract address detected — continue only if it can receive and manage USDC', 'warning'));
    }

    if (matches.length > 0 || bookEntry) {
      const count = Math.max(matches.length, Number(bookEntry && bookEntry.transferCount || 0));
      items.splice(1, 0, renderListItem(`Known locally · ${count} prior transfer${count === 1 ? '' : 's'}`, 'ok'));
    } else {
      items.splice(1, 0, renderListItem('New to this browser history', 'warning'));
    }

    if (bookEntry && bookEntry.label) {
      items.push(renderListItem(`Label · ${bookEntry.label}`, 'ok'));
    }

    els.recipientIntelList.replaceChildren(...items);
    els.recipientIntel.removeAttribute('hidden');
  }

  async function refreshRecipientCodeWarning(address) {
    const normalized = normalizeAddress(address);
    const provider = getWalletProvider();
    const chainIdAtStart = state.chainId;

    state.recipientCodeWarning = null;
    renderRecipientIntel();

    if (!normalized || !provider || !provider.request || !state.connected) return;
    if (isConfiguredTokenAddress(normalized) || isConfiguredTransferContractAddress(normalized)) return;

    try {
      const code = await provider.request({
        method: 'eth_getCode',
        params: [normalized, 'latest'],
      });

      const currentRecipient = normalizeAddress((els.txRecipient && els.txRecipient.value) || '');
      if (
        state.chainId !== chainIdAtStart ||
        !currentRecipient ||
        currentRecipient.toLowerCase() !== normalized.toLowerCase()
      ) {
        return;
      }

      state.recipientCodeWarning = {
        address: normalized,
        chainId: chainIdAtStart,
        isContract: !!(code && code !== '0x'),
      };
      renderRecipientIntel();
    } catch (_) {
      state.recipientCodeWarning = null;
    }
  }

  function buildPreflightItems() {
    const recipient = (els.txRecipient && els.txRecipient.value.trim()) || '';
    const amountStr = (els.amtIn && els.amtIn.value.trim()) || '';
    const validRecipient = validateRecipient(recipient) === '';
    const amountFloat = parseFloat(amountStr);
    const validAmount = !!amountStr && !isNaN(amountFloat) && amountFloat > 0;
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const networkReady = getNetworkState() === 'READY';
    const summary = validRecipient && validAmount && chainConfig
      ? safeBuildDraftSummary(recipient, amountStr, amountFloat, chainConfig)
      : null;
    const aboveMinimum = validAmount && (!chainConfig || !chainConfig.minTransferUsdc || amountFloat >= chainConfig.minTransferUsdc);
    const minimumLabel = chainConfig && chainConfig.minTransferUsdc
      ? `Amount below ${chainConfig.minTransferUsdc} USDC minimum`
      : 'Amount must be above the configured minimum';

    return [
      { label: state.connected ? 'Wallet connected' : 'Wallet required', status: state.connected ? 'ok' : 'blocking' },
      { label: networkReady ? 'Polygon network' : 'Switch to Polygon', status: networkReady ? 'ok' : 'blocking' },
      { label: chainConfig && chainConfig.contractAddress ? 'Contract configured' : 'Contract unavailable', status: chainConfig && chainConfig.contractAddress ? 'ok' : 'blocking' },
      { label: validRecipient ? 'Recipient valid' : 'Recipient required', status: validRecipient ? 'ok' : 'blocking' },
      { label: validAmount ? 'Recipient amount entered' : 'Recipient amount required', status: validAmount ? 'ok' : 'blocking' },
      { label: aboveMinimum ? 'Above minimum' : minimumLabel, status: aboveMinimum ? 'ok' : 'blocking' },
      { label: summary && summary.balanceKnown ? 'Balance loaded' : 'Balance loading', status: summary && summary.balanceKnown ? 'ok' : 'warning' },
      { label: summary && !summary.insufficientBalance ? 'Balance covers total debit' : 'Balance must cover recipient amount plus fee', status: summary && !summary.insufficientBalance ? 'ok' : validAmount ? 'blocking' : 'warning' },
      { label: summary ? 'Amount preview ready' : 'Amount preview pending', status: summary ? 'ok' : 'warning' },
      { label: 'Execution checks run before wallet prompt', status: 'warning' },
    ];
  }

  function safeBuildDraftSummary(recipient, amountStr, amountFloat, chainConfig) {
    try {
      return buildDraftSummary(recipient, amountStr, amountFloat, chainConfig);
    } catch (_) {
      return null;
    }
  }

  function renderPreflight() {
    if (!els.preflightList) return;
    els.preflightList.replaceChildren(...buildPreflightItems().map(item =>
      renderListItem(item.label, item.status)
    ));
  }

  /**
   * Replace the preflight list with "Checking…" placeholder items
   * while runPreflight() is in progress.
   */
  function renderPreflightChecking() {
    if (!els.preflightList) return;
    els.preflightList.replaceChildren(
      renderListItem('Checking network state…', 'checking'),
      renderListItem('Checking contract state…', 'checking'),
      renderListItem('Reading balance and allowance…', 'checking'),
    );
  }

  /**
   * Replace the preflight list with the completed simulation results and
   * a verdict row at the bottom. Called after runPreflight() resolves.
   */
  function renderPreflightResult(result) {
    if (!els.preflightList) return;

    const items = [];

    // Network passed local validation before runPreflight was called.
    items.push(renderListItem('Network valid', 'ok'));

    if (result.isPaused === false) {
      items.push(renderListItem('Contract active', 'ok'));
    } else if (result.isPaused === true) {
      items.push(renderListItem('Transfers paused', 'blocking'));
    } else {
      items.push(renderListItem('Contract state unverified', 'warning'));
    }

    if (result.previewOk) {
      if (result.balance >= result.totalDebit) {
        items.push(renderListItem('Balance covers total debit', 'ok'));
      } else {
        items.push(renderListItem('Insufficient balance', 'blocking'));
      }

      if (result.needsApproval) {
        items.push(renderListItem('Allowance insufficient — approval required', 'warning'));
      } else if (result.allowance !== null) {
        items.push(renderListItem('Allowance sufficient', 'ok'));
      }

      if (result.gasOk === true) {
        items.push(renderListItem('Gas estimated', 'ok'));
      } else if (result.gasOk === false) {
        items.push(renderListItem('Gas estimate failed', 'warning'));
      }
      // gasOk === null: gas check skipped because approval is required first
    }

    // Verdict row — visually separated by CSS border-top
    const verdictStatus = (result.verdict === 'OK') ? 'ok'
      : (result.verdict === 'PAUSED' || result.verdict === 'INSUFFICIENT_BALANCE') ? 'blocking'
      : 'warning';

    const verdictItem = renderListItem(result.verdictText, verdictStatus);
    verdictItem.classList.add('is-verdict');
    items.push(verdictItem);

    els.preflightList.replaceChildren(...items);
  }

  /**
   * Read on-chain state and produce a readiness verdict before the wallet
   * prompt. Uses a read-only BrowserProvider — no signer, no wallet interaction.
   *
   * Verdict values:
   *   'OK'                   — No blocking issue detected
   *   'NEEDS_APPROVAL'       — Approval required before transfer
   *   'INSUFFICIENT_BALANCE' — Likely to fail: insufficient balance
   *   'PAUSED'               — Transfers unavailable: contract paused
   *   'GAS_FAILED'           — Unable to verify — likely to fail
   *   'UNABLE_TO_VERIFY'     — Unable to verify current chain state
   *
   * This result is UI guidance only. submitTransfer() performs its own
   * fresh checks immediately before prompting the wallet, regardless of
   * what runPreflight() returned.
   */
  async function runPreflight(sender, recipient, rawAmount, chainConfig) {
    const contractAddress = chainConfig.contractAddress;
    const result = {
      isPaused: null,
      previewOk: false,
      balance: null,
      allowance: null,
      fee: null,
      totalDebit: null,
      needsApproval: false,
      gasOk: null,
      verdict: 'UNABLE_TO_VERIFY',
      verdictText: 'Unable to verify current chain state',
    };

    let provider;
    let implicitex;
    try {
      provider = new ethers.BrowserProvider(getWalletProvider());
      implicitex = new ethers.Contract(contractAddress, IMPLICITEX_ABI, provider);
    } catch (_) {
      return result;
    }

    // Step 1 — pause state
    try {
      result.isPaused = await implicitex.paused();
    } catch (_) {
      return result; // RPC failure — unable to verify
    }

    if (result.isPaused) {
      result.verdict = 'PAUSED';
      result.verdictText = 'Transfers unavailable: contract paused';
      return result;
    }

    // Step 2 — previewTransfer (balance, allowance, fee, canTransfer)
    try {
      const preview = await implicitex.previewTransfer(sender, rawAmount);
      result.fee        = BigInt(preview[0]);
      result.totalDebit = BigInt(preview[1]);
      result.balance    = BigInt(preview[2]);
      result.allowance  = BigInt(preview[3]);
      result.previewOk  = true;
    } catch (_) {
      return result; // RPC failure — unable to verify
    }

    // Step 3 — classify balance
    if (result.balance < result.totalDebit) {
      result.verdict     = 'INSUFFICIENT_BALANCE';
      result.verdictText = 'Likely to fail: insufficient balance';
      return result;
    }

    // Step 4 — classify allowance
    result.needsApproval = result.allowance < result.totalDebit;

    if (result.needsApproval) {
      // Don't estimate gas for transferWithFee — allowance is too low so the
      // call would revert, making the gas failure misleading.
      result.verdict     = 'NEEDS_APPROVAL';
      result.verdictText = 'Approval required before transfer';
      return result;
    }

    // Step 5 — gas estimation (transfer-ready path only)
    try {
      const iface = new ethers.Interface(IMPLICITEX_ABI);
      await provider.estimateGas({
        from: sender,
        to: contractAddress,
        data: iface.encodeFunctionData('transferWithFee', [recipient, rawAmount]),
      });
      result.gasOk       = true;
      result.verdict     = 'OK';
      result.verdictText = 'No blocking issue detected';
    } catch (_) {
      result.gasOk       = false;
      result.verdict     = 'GAS_FAILED';
      result.verdictText = 'Unable to verify — likely to fail';
    }

    return result;
  }

  function renderTransferSummary(summary, options = {}) {
    const chainConfig = summary.chainConfig;
    const label = options.label || 'Transfer Preview';
    const mode = options.mode || 'Live';
    const note = options.note || 'Review recipient amount, platform fee, and total wallet debit before approval.';
    const metadata = getTransferMetadata();

    if (els.txPreviewLabel) els.txPreviewLabel.textContent = label;
    if (els.previewRecipient) els.previewRecipient.textContent = summary.recipient.slice(0, 10) + '…' + summary.recipient.slice(-6);
    if (els.previewAmount)    els.previewAmount.textContent    = formatUsdcRaw(summary.rawAmount, 2) + ' USDC';
    if (els.previewFee)       els.previewFee.textContent       = formatUsdcRaw(summary.fee, 6) + ' USDC';
    if (els.previewTotal)     els.previewTotal.textContent     = formatUsdcRaw(summary.totalDebit, 6) + ' USDC';
    if (els.previewNetwork)   els.previewNetwork.textContent   = chainConfig.name;
    if (els.previewContract)  els.previewContract.textContent  = chainConfig.contractAddress
      ? chainConfig.contractAddress.slice(0, 10) + '…'
      : 'Not deployed';
    if (els.previewMode)      els.previewMode.textContent      = mode;
    if (els.previewPurpose)   els.previewPurpose.textContent   = purposeLabel(metadata.purposeTag);
    if (els.previewNote)      els.previewNote.textContent      = note;

    showPreview();
  }

  function setDraftButton(label, disabled) {
    if (!els.txBtn || state.txPhase !== 'DRAFT') return;
    const acknowledged = !!(els.txConfirmAck && els.txConfirmAck.checked);
    const armed = !disabled && acknowledged;
    els.txBtn.textContent = label;
    els.txBtn.disabled = !armed;
    els.txBtn.classList.toggle('tx-btn--armed', armed);
  }

  function formatReceiptTime(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return value;
    }
  }

  function shortHash(hash) {
    if (!hash) return null;
    return hash.slice(0, 10) + '…' + hash.slice(-6);
  }

  function buildProofPacket(receipt) {
    if (window.IX && window.IX.proofPacket) {
      return window.IX.proofPacket.buildProofPacket(receipt);
    }
    return Object.assign({ schemaVersion: 'proof-packet.v1' }, receipt);
  }

  function downloadProofPacket(receipt) {
    const packet = buildProofPacket(receipt);
    const blob = new Blob([JSON.stringify(packet, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const hash = packet.transactionHash || receipt.id || 'local';
    const a = document.createElement('a');
    a.href = url;
    a.download = `implicitex-proof-${String(hash).slice(0, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function receiptExplorerUrl(chainConfig, txHash) {
    return chainConfig && chainConfig.explorerUrl && txHash
      ? chainConfig.explorerUrl + '/tx/' + txHash
      : null;
  }

  function canReconcileActiveReceipt(receipt) {
    if (!receipt || !window.IX || !window.IX.receipts) return false;
    const active = window.IX.receipts.getActive();
    const txHash = receipt.transferHash || receipt.hash;
    return !!(
      active &&
      active.id === receipt.id &&
      txHash &&
      (receipt.state === IX_TRANSFER_STATES.SUBMITTED || receipt.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN)
    );
  }

  async function reconcileActiveReceipt(receiptId) {
    if (!window.IX || !window.IX.receipts) return;

    const active = window.IX.receipts.getActive();
    if (!active || active.id !== receiptId || !canReconcileActiveReceipt(active)) return;

    const txHash = active.transferHash || active.hash;
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[active.chainId];
    const explorerUrl = active.explorerUrl || receiptExplorerUrl(chainConfig, txHash);
    const rpcSource = OBSERVATION_SOURCES && OBSERVATION_SOURCES.RPC;

    function preserveUnresolved(stateKey, message) {
      updateReceiptFromSource(active.id, {
        state: stateKey,
        transferHash: txHash,
        hash: txHash,
        explorerUrl,
        fundsMoved: null,
        lastKnownMessage: message,
      }, rpcSource);
    }

    updateReceiptFromSource(active.id, {
      lastKnownMessage: 'Checking transaction status. Do not retry yet.',
    }, rpcSource);

    if (!chainConfig || !chainConfig.rpcUrl || typeof ethers === 'undefined') {
      preserveUnresolved(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, 'App status check unavailable. Check the explorer before retrying.');
      companionState(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, {
        statusLine: 'Transaction outcome could not be verified locally.',
        stateVal:   'Outcome unknown',
        fundsVal:   'Unknown — check explorer',
        networkVal: active.network || (chainConfig && chainConfig.name) || '—',
        eventVal:   txHash,
        actionVal:  'Verify on explorer before retrying.',
        actionHref: explorerUrl || undefined,
        severity:   'warning',
        autoOpen:   true,
      });
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      const txReceipt = await provider.getTransactionReceipt(txHash);

      if (txReceipt === null) {
        const unresolvedState = active.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? IX_TRANSFER_STATES.OUTCOME_UNKNOWN : IX_TRANSFER_STATES.SUBMITTED;
        preserveUnresolved(unresolvedState, 'Transaction not yet confirmed. Check the explorer before retrying.');
        companionState(unresolvedState, {
          statusLine: unresolvedState === IX_TRANSFER_STATES.SUBMITTED
            ? 'Transaction submitted. Awaiting chain confirmation.'
            : 'Transaction outcome could not be verified locally.',
          stateVal:   unresolvedState === IX_TRANSFER_STATES.SUBMITTED ? 'Submitted' : 'Outcome unknown',
          fundsVal:   'Unknown — check explorer',
          networkVal: active.network || chainConfig.name,
          eventVal:   txHash,
          actionVal:  'View on ' + chainConfig.name + ' explorer',
          actionHref: explorerUrl || undefined,
          severity:   unresolvedState === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? 'warning' : undefined,
          autoOpen:   true,
        });
        return;
      }

      if (txReceipt.status === 1) {
        updateReceiptFromSource(active.id, {
          state: IX_TRANSFER_STATES.CONFIRMED,
          fundsMoved: true,
          transferHash: txHash,
          hash: txHash,
          explorerUrl,
          lastKnownMessage: 'Transfer confirmed. Funds moved on Polygon.',
        }, rpcSource);
        if (window.IX && window.IX.receipts) window.IX.receipts.clearActive();
        companionState(IX_TRANSFER_STATES.CONFIRMED, {
          statusLine: 'Transfer confirmed. Funds moved on Polygon.',
          stateVal:   'Confirmed',
          fundsVal:   'Yes — transfer complete',
          networkVal: active.network || chainConfig.name,
          eventVal:   txHash,
          actionVal:  explorerUrl ? 'View on ' + chainConfig.name + ' explorer' : 'Transfer confirmed.',
          actionHref: explorerUrl || undefined,
          autoOpen:   true,
        });
        return;
      }

      if (txReceipt.status === 0) {
        updateReceiptFromSource(active.id, {
          state: IX_TRANSFER_STATES.FAILED,
          fundsMoved: false,
          transferHash: txHash,
          hash: txHash,
          explorerUrl,
          lastKnownMessage: 'Transaction reverted on-chain. Funds were not moved.',
        }, rpcSource);
        if (window.IX && window.IX.receipts) window.IX.receipts.clearActive();
        companionState(IX_TRANSFER_STATES.FAILED, {
          statusLine: 'Transaction failed on-chain. Funds were not moved.',
          stateVal:   'Failed',
          fundsVal:   'No — gas may have been consumed',
          networkVal: active.network || chainConfig.name,
          eventVal:   txHash,
          actionVal:  explorerUrl ? 'View on ' + chainConfig.name + ' explorer' : 'Verify on explorer before retrying.',
          actionHref: explorerUrl || undefined,
          autoOpen:   true,
        });
        return;
      }

      preserveUnresolved(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, 'Network returned an unrecognised transaction status. Check the explorer before retrying.');
    } catch (_) {
      preserveUnresolved(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, 'App status check failed. Check the explorer before retrying.');
      companionState(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, {
        statusLine: 'Transaction outcome could not be verified locally.',
        stateVal:   'Outcome unknown',
        fundsVal:   'Unknown — check explorer',
        networkVal: active.network || (chainConfig && chainConfig.name) || '—',
        eventVal:   txHash,
        actionVal:  'Verify on explorer before retrying.',
        actionHref: explorerUrl || undefined,
        severity:   'warning',
        autoOpen:   true,
      });
    }
  }

  function renderReceiptHistory() {
    if (!els.receiptHistory) return;
    const receipts = window.IX && window.IX.receipts
      ? window.IX.receipts.listAll().slice(0, 5)
      : [];

    if (!receipts.length) {
      const empty = document.createElement('p');
      empty.className = 'receipt-empty';
      empty.textContent = 'No local receipts yet.';
      els.receiptHistory.replaceChildren(empty);
      return;
    }

    els.receiptHistory.replaceChildren(...receipts.map(receipt => {
      const item = document.createElement('div');
      item.className = 'receipt-item';

      const head = document.createElement('div');
      head.className = 'receipt-item-head';

      const stateLabel = document.createElement('span');
      stateLabel.className = 'receipt-state';
      stateLabel.textContent = receipt.state || 'UNKNOWN';

      const time = document.createElement('span');
      time.textContent = formatReceiptTime(receipt.createdAt || receipt.timestamp);

      head.append(stateLabel, time);

      const meta = document.createElement('p');
      meta.className = 'receipt-meta';
      const purpose = receipt.purposeTag ? ` · ${purposeLabel(receipt.purposeTag)}` : '';
      meta.textContent = `${receipt.amount || '—'} USDC → ${receipt.recipient ? shortAddr(receipt.recipient) : '—'}${purpose}`;

      const message = document.createElement('p');
      message.className = 'receipt-message';
      message.textContent = receipt.lastKnownMessage || (
        receipt.fundsMoved === true ? 'Funds moved.' :
        receipt.fundsMoved === false ? 'No funds moved.' :
        'Outcome not yet resolved.'
      );

      item.append(head, meta, message);

      const txHash = receipt.transferHash || receipt.hash;
      const receiptActions = document.createElement('div');
      receiptActions.className = 'receipt-actions';

      if (receipt.explorerUrl && txHash) {
        const link = document.createElement('a');
        link.className = 'receipt-link';
        link.href = receipt.explorerUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `Verify on explorer ${shortHash(txHash)}`;
        receiptActions.append(link);
      }

      const proofButton = document.createElement('button');
      proofButton.type = 'button';
      proofButton.className = 'receipt-proof-btn';
      proofButton.textContent = 'Export proof packet';
      proofButton.addEventListener('click', function () {
        downloadProofPacket(receipt);
      });
      receiptActions.append(proofButton);

      if (canReconcileActiveReceipt(receipt)) {
        const checkButton = document.createElement('button');
        checkButton.type = 'button';
        checkButton.className = 'receipt-check-btn';
        checkButton.textContent = 'Check status';
        checkButton.addEventListener('click', async function () {
          checkButton.disabled = true;
          checkButton.textContent = 'Checking…';
          await reconcileActiveReceipt(receipt.id);
          if (canReconcileActiveReceipt(receipt)) {
            checkButton.disabled = false;
            checkButton.textContent = 'Check status';
          }
        });
        receiptActions.append(checkButton);
      }

      if (receiptActions.children.length) {
        item.append(receiptActions);
      }

      return item;
    }));
  }

  /**
   * Render or hide the transfer preview panel.
   * Pure frontend math — no chain calls, no signing, no async.
   *
   * Shows when: recipient is a valid 0x address, amount > 0,
   * wallet connected, and chain is live for transfers.
   * Hides otherwise.
   */
  function updatePreview() {
    if (state.txPhase === 'REVIEW_READY' || state.txPhase === 'SIMULATING') return; // frozen during preflight check and review

    const recipient  = (els.txRecipient && els.txRecipient.value.trim()) || '';
    const amountStr  = (els.amtIn && els.amtIn.value.trim()) || '';
    const amountFloat = parseFloat(amountStr);
    renderRecipientIntel();
    renderPreflight();

    const validRecipient = validateRecipient(recipient) === '';
    const validAmount    = !isNaN(amountFloat) && amountFloat > 0;
    const validNetwork   = state.connected && isLiveTransferChain(state.chainId);

    if (!validRecipient || !validAmount || !validNetwork) {
      hidePreview();
      setReviewAcknowledgementVisible(false);
      setTransferNote('');
      setDraftButton(currentButtonLabel(), true);
      return;
    }

    const chainConfig = window.IX_CHAINS[state.chainId];
    let summary;
    try {
      summary = buildDraftSummary(recipient, amountStr, amountFloat, chainConfig);
    } catch (_) {
      hidePreview();
      setReviewAcknowledgementVisible(false);
      setDraftButton(currentButtonLabel(), true);
      return;
    }

    if (!summary.balanceKnown) {
      renderTransferSummary(summary, {
        mode: 'Checking balance',
        note: 'Checking USDC balance before review.',
      });
      setTransferNote('Checking USDC balance before review.');
      setReviewAcknowledgementVisible(false);
      setDraftButton('Checking Balance', true);
      return;
    }

    if (summary.insufficientBalance) {
      renderTransferSummary(summary, {
        label: 'Transfer Blocked',
        mode: 'Blocked',
        note: `Increase USDC balance or lower amount before review. Have ${formatUsdcRaw(summary.balance, 2)} USDC, need ${formatUsdcRaw(summary.totalDebit, 2)} USDC.`,
      });
      setStatus(`Insufficient balance. Have ${formatUsdcRaw(summary.balance, 2)} USDC, need ${formatUsdcRaw(summary.totalDebit, 2)} USDC.`);
      setTransferNote('Lower the amount or add USDC before reviewing this transfer.');
      setReviewAcknowledgementVisible(false);
      setDraftButton('Insufficient Balance', true);
      return;
    }

    renderTransferSummary(summary, {
      label: 'Transfer Preview',
      mode: 'Live',
      note: 'Amount preview only. Recipient, network, pause state, contract, USDC token, balance, and allowance are checked again before any wallet prompt.',
    });
    setStatus('');
    setTransferNote('');
    setReviewAcknowledgementVisible(true);
    setDraftButton('Execute Transfer', false);
  }

  function setNavStatus(msg) {
    if (els.navStatus) els.navStatus.textContent = msg;
  }

  function setConnectPending(isPending) {
    state.connecting = isPending;
    if (!els.connectBtn) return;

    els.connectBtn.disabled = isPending;
    if (isPending) {
      els.connectBtn.textContent = 'Connecting...';
    }
  }

  function resetConnectButton() {
    if (!els.connectBtn) return;

    els.connectBtn.hidden = false;
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'Connect Wallet';
    els.connectBtn.classList.remove('connected');
  }

  function setAccountSwitchVisible(isVisible) {
    if (!els.switchAccountBtn) return;
    if (isVisible) {
      els.switchAccountBtn.removeAttribute('hidden');
    } else {
      els.switchAccountBtn.setAttribute('hidden', '');
    }
  }

  function handleConnectFailure(message, severity = null) {
    state.connected = false;
    state.address = null;
    state.provider = null;
    state.chainId = null;
    state.connecting = false;
    walletRuntime.provider = null;
    walletRuntime.source = null;

    if (els.disconnectBtn) els.disconnectBtn.setAttribute('hidden', '');
    setAccountSwitchVisible(false);
    resetConnectButton();
    setNavStatus(message);
    setElementSeverity(els.navStatus, severity);
    setElementSeverity(els.networkBadge, null);
    setStatus(message);
    dispatchWalletStateChanged();
  }

  function isConfiguredChain(chainId) {
    return !!(chainId && window.IX_CHAINS && window.IX_CHAINS[chainId]);
  }

  function isLiveTransferChain(chainId) {
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[chainId];
    return !!(
      window.IX_CONFIG &&
      window.IX_CONFIG.transfersEnabled === true &&
      chainConfig &&
      chainConfig.contractAddress &&
      chainConfig.transfersEnabled === true
    );
  }

  function isConfiguredTokenAddress(address) {
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    return !!(
      address &&
      chainConfig &&
      chainConfig.usdcAddress &&
      address.toLowerCase() === chainConfig.usdcAddress.toLowerCase()
    );
  }

  function isConfiguredTransferContractAddress(address) {
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    return !!(
      address &&
      chainConfig &&
      chainConfig.contractAddress &&
      address.toLowerCase() === chainConfig.contractAddress.toLowerCase()
    );
  }

  /**
   * Classify current connection into one of five named states.
   * Used to route presentation functions and set button labels.
   *
   *   DISCONNECTED        — no wallet connected
   *   WRONG_NETWORK       — connected but chain not in IX_CHAINS
   *   CONTRACT_UNAVAILABLE — configured chain, but contractAddress is null
   *   TRANSFERS_DISABLED  — contract exists, transfersEnabled is false
   *   READY               — fully live
   */
  function getNetworkState() {
    if (!state.connected) return 'DISCONNECTED';
    if (!isConfiguredChain(state.chainId)) return 'WRONG_NETWORK';
    const chainConfig = window.IX_CHAINS[state.chainId];
    if (!chainConfig.contractAddress) return 'CONTRACT_UNAVAILABLE';
    if (!chainConfig.transfersEnabled) return 'TRANSFERS_DISABLED';
    if (!window.IX_CONFIG || window.IX_CONFIG.transfersEnabled !== true) return 'TRANSFERS_DISABLED';
    return 'READY';
  }

  /**
   * Update the Network module data rows from live chain config.
   * Called on every connect/chain-change to keep the module in sync.
   */
  function updateNetworkModuleRows(chainConfig) {
    if (els.networkNameDisplay) {
      els.networkNameDisplay.textContent = chainConfig ? chainConfig.name : '—';
    }
    if (els.contractStatus) {
      els.contractStatus.textContent = (chainConfig && chainConfig.contractAddress)
        ? chainConfig.contractAddress.slice(0, 10) + '…'
        : 'Not deployed';
    }
    if (els.networkStatus) {
      const live = chainConfig && chainConfig.transfersEnabled;
      els.networkStatus.textContent = live ? 'Live' : 'Preview only';
      els.networkStatus.className = 'data-v ' + (live ? 'status-ok' : 'status-warn');
    }
  }

  function updateUnsupportedNetworkRows() {
    if (els.networkNameDisplay) {
      els.networkNameDisplay.textContent = chainLabel(state.chainId);
    }
    if (els.contractStatus) {
      els.contractStatus.textContent = 'Unavailable';
    }
    if (els.networkStatus) {
      els.networkStatus.textContent = 'Unsupported network';
      els.networkStatus.className = 'data-v is-error';
    }
  }

  /**
   * Return the correct idle label for the transfer button based on current state.
   * Keeps setTxState() and presentation functions consistent.
   */
  function currentButtonLabel() {
    if (getNetworkState() !== 'READY') return 'Switch to Polygon';
    if (state.txPhase === 'SIMULATING') return 'Checking…';
    return 'Execute Transfer';
  }

  // ----------------------------------------------------------------
  // Pre-send review gate — DRAFT → REVIEW_READY → back to DRAFT
  // ----------------------------------------------------------------

  /**
   * Freeze the current form values, run a preflight readiness check against
   * the live contract, then enter REVIEW_READY.
   *
   * Phase flow:
   *   DRAFT → (local validation) → SIMULATING → (on-chain reads) → REVIEW_READY
   *                                                               ↘ DRAFT (on hard block)
   *
   * The preflight result is user-visible guidance only. submitTransfer() always
   * performs its own fresh checks immediately before prompting the wallet —
   * the preflight snapshot never replaces those execution-safety gates.
   */
  async function enterReview() {
    if (state.txPhase === 'REVIEW_READY' || state.txPhase === 'SIMULATING') return; // idempotent

    const recipient   = (els.txRecipient && els.txRecipient.value.trim()) || '';
    const amountStr   = (els.amtIn && els.amtIn.value.trim()) || '';
    const amountFloat = parseFloat(amountStr);

    // Validate before locking — show errors in DRAFT, do not transition if invalid.
    const recipientValid = applyRecipientValidation(recipient);
    if (!recipientValid) {
      setStatus('');
      return;
    }
    if (!amountStr || isNaN(amountFloat) || amountFloat <= 0) {
      setStatus('Enter a valid amount.');
      return;
    }
    if (!state.connected || !isLiveTransferChain(state.chainId)) {
      setStatus('Switch to Polygon Mainnet before reviewing this transfer.');
      applyWrongNetworkPresentation();
      return;
    }

    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    let summary;
    try {
      summary = buildDraftSummary(recipient, amountStr, amountFloat, chainConfig);
    } catch (_) {
      setStatus('Invalid amount format.');
      return;
    }
    if (!summary.balanceKnown) {
      setStatus('USDC balance is still loading. Wait for balance before reviewing this transfer.');
      setTransferNote('Checking USDC balance before review.');
      setDraftButton('Checking Balance', true);
      return;
    }
    if (summary.insufficientBalance) {
      setStatus(`Insufficient balance. Have ${formatUsdcRaw(summary.balance, 2)} USDC, need ${formatUsdcRaw(summary.totalDebit, 2)} USDC.`);
      setTransferNote('Lower the amount or add USDC before reviewing this transfer.');
      setDraftButton('Insufficient Balance', true);
      renderTransferSummary(summary, {
        label: 'Transfer Blocked',
        mode: 'Blocked',
        note: `Increase USDC balance or lower amount before review. Have ${formatUsdcRaw(summary.balance, 2)} USDC, need ${formatUsdcRaw(summary.totalDebit, 2)} USDC.`,
      });
      return;
    }

    // ---- Local validation passed. Enter SIMULATING. ----

    state.reviewDraft = summary;
    state.reviewDraft.metadata = getTransferMetadata();
    state.txPhase = 'SIMULATING';

    // Lock inputs so form values cannot drift during the async check.
    if (els.txRecipient) els.txRecipient.disabled = true;
    if (els.amtIn)       els.amtIn.disabled = true;
    if (els.txPurposeTag) els.txPurposeTag.disabled = true;
    if (els.txReference)  els.txReference.disabled = true;
    if (els.txMemo)       els.txMemo.disabled = true;

    // Show cancel path; primary button disabled while checking.
    // Hide the acknowledgement checkbox but preserve its checked state —
    // it was already confirmed by the user before the Execute click.
    if (els.txCancelReview) els.txCancelReview.removeAttribute('hidden');
    setReviewAcknowledgementVisible(false);
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.classList.remove('tx-btn--armed');
      els.txBtn.textContent = 'Checking…';
    }

    renderPreflightChecking();
    setTransferNote('Reading contract state…');
    setStatus('');

    // Run the on-chain preflight check.
    let preflightResult;
    try {
      const rawAmount = parseUsdcAmount(amountStr);
      preflightResult = await runPreflight(state.address, recipient, rawAmount, chainConfig);
    } catch (_) {
      preflightResult = {
        isPaused: null, previewOk: false, balance: null, allowance: null,
        fee: null, totalDebit: null, needsApproval: false, gasOk: null,
        verdict: 'UNABLE_TO_VERIFY', verdictText: 'Unable to verify current chain state',
      };
    }

    // If the phase was reset by an external event (account change, disconnect,
    // "Edit Details" click) while the async check was running, abort cleanly.
    if (state.txPhase !== 'SIMULATING') return;

    // Render the check results regardless of verdict.
    renderPreflightResult(preflightResult);

    // Hard blocks — return to DRAFT with a status message.
    // The preflight result remains visible in the list until next input change.
    const hardBlocks = ['PAUSED', 'INSUFFICIENT_BALANCE'];
    if (hardBlocks.includes(preflightResult.verdict)) {
      state.reviewDraft = null;
      state.txPhase = 'DRAFT';
      if (els.txRecipient) els.txRecipient.disabled = false;
      if (els.amtIn)       els.amtIn.disabled = false;
      if (els.txPurposeTag) els.txPurposeTag.disabled = false;
      if (els.txReference)  els.txReference.disabled = false;
      if (els.txMemo)       els.txMemo.disabled = false;
      if (els.txCancelReview) els.txCancelReview.setAttribute('hidden', '');
      resetReviewAcknowledgement();
      if (els.txBtn) {
        els.txBtn.disabled = true;
        els.txBtn.textContent = currentButtonLabel();
      }
      setStatus(preflightResult.verdictText);
      setTransferNote('');
      return;
    }

    // ---- Soft outcomes (OK, NEEDS_APPROVAL, GAS_FAILED, UNABLE_TO_VERIFY) ----
    // Proceed to REVIEW_READY. submitTransfer() will re-check everything before
    // prompting the wallet — the preflight result is guidance, not an authority.

    state.txPhase = 'REVIEW_READY';
    resetTransferTimeline();
    markTransferStep('review_ready');

    setTransferNote('');
    setStatus('');

    companionState(IX_TRANSFER_STATES.READY, {
      statusLine: 'Transfer acknowledged. Submitting wallet request.',
      stateVal:   'Executing',
      fundsVal:   'No — wallet action not yet requested',
      networkVal: chainLabel(state.chainId),
      eventVal:   'Transfer details validated and acknowledged.',
      actionVal:  'Wallet request incoming. If approval is needed, approve the full total wallet debit.',
    });

    await submitTransfer();
  }

  /**
   * Return to DRAFT from REVIEW_READY.
   * Unlocks inputs, hides cancel button, restores preview to live-update mode.
   * options.clearStatus — default true. Pass false to preserve a terminal
   * status message (e.g. "Transfer confirmed — View on explorer").
   */
  function exitReview(options = {}) {
    if (state.txPhase !== 'REVIEW_READY' && state.txPhase !== 'SIMULATING') return; // idempotent

    const clearStatus = options.clearStatus !== false;

    state.reviewDraft = null;
    state.txPhase = 'DRAFT';

    if (els.txRecipient) els.txRecipient.disabled = false;
    if (els.amtIn)       els.amtIn.disabled = false;
    if (els.txPurposeTag) els.txPurposeTag.disabled = false;
    if (els.txReference)  els.txReference.disabled = false;
    if (els.txMemo)       els.txMemo.disabled = false;
    if (els.txCancelReview) els.txCancelReview.setAttribute('hidden', '');
    if (els.txPreviewLabel) els.txPreviewLabel.textContent = 'Transfer Preview';
    resetReviewAcknowledgement();
    if (!options.preserveTimeline) resetTransferTimeline();
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.textContent = currentButtonLabel();
      els.txBtn.classList.remove('tx-btn--armed');
    }

    if (clearStatus) {
      setTransferNote('');
      setStatus('');
    } else {
      setTransferNote('');
    }

    updatePreview(); // resume live preview
  }

  /**
   * Primary button dispatcher.
   * DRAFT → enterReview(); REVIEW_READY → submitTransfer().
   */
  async function handleTxAction() {
    if (state.txPhase === 'DRAFT') {
      if (!els.txConfirmAck || !els.txConfirmAck.checked) {
        setStatus('Confirm the details and check the acknowledgement before executing.');
        return;
      }
      await enterReview();
    }
    // SIMULATING: no-op — button disabled during preflight
    // REVIEW_READY: unreachable in normal flow — enterReview() chains to submitTransfer()
  }

  function showTransferModules(shouldScroll) {
    if (!els.modules) return;

    // Hide How It Works — instrument activates in-place over the same geometry.
    if (els.howItWorks) els.howItWorks.setAttribute('hidden', '');

    // Portal controls (dismiss button) appear above the grid, outside the border.
    if (els.portalControls) els.portalControls.removeAttribute('hidden');

    // Signal the portal-active state — hero recedes, instrument asserts.
    document.body.classList.add('portal-active');

    els.modules.removeAttribute('hidden');
    if (shouldScroll) {
      setTimeout(() => {
        els.modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 280);
    }
  }

  function hideTransferModules() {
    if (els.modules) els.modules.setAttribute('hidden', '');
    if (els.portalControls) els.portalControls.setAttribute('hidden', '');
    // Restore How It Works and return to informational state.
    if (els.howItWorks) els.howItWorks.removeAttribute('hidden');
    document.body.classList.remove('portal-active');
  }

  function dismissModules() {
    hideTransferModules();
    // Scroll back to the how-it-works frame smoothly.
    if (els.howItWorks) {
      setTimeout(() => {
        els.howItWorks.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  // Open portal if already connected; otherwise initiate connect.
  // Wired to the connect button so it serves both states.
  async function openOrConnect() {
    if (state.connected && isLiveTransferChain(state.chainId)) {
      showTransferModules(true);
    } else if (state.connected) {
      await switchToPolygonMainnet();
    } else {
      connect({ forcePermission: state.userDisconnected });
    }
  }

  async function revokeWalletPermission() {
    const provider = getWalletProvider();
    if (!provider || !provider.request) return false;

    try {
      await provider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
      return true;
    } catch (err) {
      console.warn('[ImplicitEx] Wallet permission revoke unavailable or failed', err);
      return false;
    }
  }

  async function readAuthorizedAccounts() {
    const provider = getWalletProvider();
    if (!provider || !provider.request) return [];
    return provider.request({ method: 'eth_accounts' });
  }

  function setDisconnectedPresentation({ stillAuthorized = false, providerChecked = true } = {}) {
    const message = stillAuthorized
      ? 'Wallet hidden locally, but MetaMask still authorizes this site. Open MetaMask connected sites, disconnect this site, then lock MetaMask.'
      : providerChecked
        ? 'Wallet disconnected. Site permission removed. Lock MetaMask before leaving a shared device.'
        : 'Wallet disconnected. For shared computers, lock MetaMask or disconnect this site inside MetaMask.';

    setNavStatus(message);
    setElementSeverity(els.navStatus, stillAuthorized ? 'warning' : null);
    setStatus(message);

    companionState('DISCONNECTED', {
      statusLine: stillAuthorized
        ? 'Wallet hidden locally · MetaMask still authorizes this site'
        : 'Wallet disconnected',
      stateVal:   stillAuthorized ? 'Disconnected locally' : 'Wallet disconnected',
      fundsVal:   'No active transaction',
      networkVal: '—',
      eventVal:   stillAuthorized
        ? 'MetaMask returned an authorized account after disconnect.'
        : providerChecked
          ? 'MetaMask returned no authorized accounts for this site.'
          : 'Provider authorization could not be verified.',
      actionVal:  stillAuthorized
        ? 'Open MetaMask → Connected sites → disconnect this site, then lock MetaMask.'
        : 'For shared computers, also lock MetaMask.',
      severity:   stillAuthorized ? 'warning' : null,
      autoOpen:   stillAuthorized,
    });
  }

  // Disconnect — clears local session state and, for user-initiated disconnect,
  // asks MetaMask to revoke this site's account permission when supported.
  async function disconnect(options = {}) {
    const revokeProvider = options.revokeProvider === true;

    if (state.networkPollTimer) {
      clearInterval(state.networkPollTimer);
      state.networkPollTimer = null;
    }
    stopWalletChainWatcher();

    // Clear session state before any async so focus/visibility events that call
    // syncProviderState cannot re-render connected UI during the revoke wait.
    state.connected = false;
    state.address   = null;
    state.provider  = null;
    state.chainId   = null;
    state.connecting = false;
    state.userDisconnected = revokeProvider;
    walletRuntime.provider = null;
    walletRuntime.source = null;
    activeFlowId = null; // invalidate any running transfer flow

    let providerChecked = false;
    let stillAuthorized = false;
    if (revokeProvider) await revokeWalletPermission();

    if (els.walletPill) els.walletPill.classList.remove('visible');
    if (els.walletAddr) els.walletAddr.textContent = '';
    updateSenderDisplay();
    if (els.disconnectBtn) els.disconnectBtn.setAttribute('hidden', '');
    setAccountSwitchVisible(false);
    resetConnectButton();
    setNavStatus(revokeProvider
      ? 'Wallet disconnected. Connect Wallet will ask MetaMask for account permission.'
      : '');
    setElementSeverity(els.navStatus, null);
    if (els.networkBadge) {
      els.networkBadge.textContent = 'Polygon live';
      setElementSeverity(els.networkBadge, null);
    }
    resetBalanceDisplay();
    clearTransferForm();
    hidePreview();
    hideTransferModules();
    if (revokeProvider) {
      try {
        const accounts = await readAuthorizedAccounts();
        providerChecked = true;
        stillAuthorized = !!(accounts && accounts.length > 0);
      } catch (_) {
        providerChecked = false;
      }
    }

    if (revokeProvider) {
      setDisconnectedPresentation({ stillAuthorized, providerChecked });
    } else if (window.IX && window.IX.companion) {
      window.IX.companion.reset();
    }
    dispatchWalletStateChanged();
  }

  function applyConnectedPresentation(options = {}) {
    const shouldScroll = options.shouldScroll === true;
    const short = shortAddr(state.address);
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const transfersEnabled = chainConfig && chainConfig.transfersEnabled;
    const eventVal = options.eventVal || `Address: ${shortAddr(state.address)}`;

    if (els.walletAddr) els.walletAddr.textContent = short;
    updateSenderDisplay();
    if (els.walletPill) els.walletPill.classList.add('visible');
    if (els.connectBtn) {
      els.connectBtn.hidden = false;
      els.connectBtn.disabled = false;
      els.connectBtn.textContent = short;
      els.connectBtn.classList.add('connected');
    }
    if (els.disconnectBtn) els.disconnectBtn.removeAttribute('hidden');
    setAccountSwitchVisible(true);
    setNavStatus('Wallet connected');
    setElementSeverity(els.navStatus, null);
    if (els.networkBadge) {
      els.networkBadge.textContent = chainLabel(state.chainId);
      setElementSeverity(els.networkBadge, null);
    }
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.textContent = currentButtonLabel();
    }
    setStatus('');
    setTransferNote(transfersEnabled ? '' : 'Preview mode — live transfers not yet enabled.');
    updateNetworkModuleRows(chainConfig);
    showTransferModules(shouldScroll);

    companionState('WALLET_CONNECTED', {
      statusLine: transfersEnabled
        ? `Connected · ${chainLabel(state.chainId)}`
        : `Connected · ${chainLabel(state.chainId)} · Preview mode`,
      stateVal:   'Wallet connected',
      fundsVal:   'No active transaction',
      networkVal: chainLabel(state.chainId),
      eventVal,
      actionVal:  transfersEnabled
        ? 'Enter a recipient address and amount to begin.'
        : 'Preview mode — enter details to see fee calculation. Live transfers not yet enabled.',
    });
  }

  function applyWrongNetworkPresentation() {
    // Network is no longer valid for the frozen draft — exit review so inputs
    // are unlocked if the user switches back to a supported chain.
    exitReview();

    const short = shortAddr(state.address);
    const networkLabel = chainLabel(state.chainId);
    const configuredChain = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const stateVal = configuredChain ? 'Live transfers disabled' : 'Wrong network';
    const statusLine = configuredChain
      ? 'Live transfers disabled'
      : 'Wrong network · Switch to Polygon Mainnet';
    const eventVal = configuredChain
      ? 'Wallet connected on Polygon. Live transfers are currently disabled.'
      : 'Wallet connected on unsupported network.';

    if (els.walletAddr) els.walletAddr.textContent = short;
    updateSenderDisplay();
    if (els.walletPill) els.walletPill.classList.add('visible');
    if (els.connectBtn) {
      if (state.chainId === POLYGON_MAINNET_CHAIN_ID) {
        // Already on Polygon — "Switch to Polygon" is wrong; hide the action button.
        // Disconnect and account-switch remain available.
        els.connectBtn.hidden = true;
      } else {
        els.connectBtn.hidden = false;
        els.connectBtn.disabled = false;
        els.connectBtn.textContent = 'Switch to Polygon';
        els.connectBtn.classList.add('connected');
      }
    }
    if (els.disconnectBtn) els.disconnectBtn.removeAttribute('hidden');
    setAccountSwitchVisible(true);
    setNavStatus(stateVal);
    setElementSeverity(els.navStatus, 'error');
    if (els.networkBadge) {
      els.networkBadge.textContent = networkLabel;
      setElementSeverity(els.networkBadge, 'error');
    }
    updateUnsupportedNetworkRows();
    hideTransferModules();
    setTransferNote('');
    hidePreview();
    setStatus('Switch MetaMask to Polygon Mainnet before sending USDC.');

    companionState('WRONG_NETWORK', {
      statusLine,
      stateVal,
      fundsVal:   'No active transaction',
      networkVal: networkLabel,
      eventVal,
      actionVal:  'Use Switch to Polygon, or switch MetaMask to Polygon Mainnet before sending USDC.',
      severity:   'error',
      autoOpen:   true,
    });
  }

  async function switchToPolygonMainnet() {
    const provider = getWalletProvider();
    if (!provider || !provider.request) {
      setStatus('No wallet detected.');
      return;
    }

    if (els.connectBtn) {
      els.connectBtn.disabled = true;
      els.connectBtn.textContent = 'Switching...';
    }
    setStatus('Requesting Polygon Mainnet in MetaMask...');

    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: POLYGON_MAINNET_CHAIN_HEX }],
      });
    } catch (err) {
      const errorCode = err && (err.code || (err.data && err.data.originalError && err.data.originalError.code));

      if (errorCode === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: POLYGON_MAINNET_CHAIN_HEX,
              chainName: 'Polygon Mainnet',
              nativeCurrency: {
                name: 'POL',
                symbol: 'POL',
                decimals: 18,
              },
              rpcUrls: ['https://polygon-rpc.com'],
              blockExplorerUrls: ['https://polygonscan.com'],
            }],
          });
        } catch (addErr) {
          const rejectedAdd = addErr && addErr.code === 4001;
          setStatus(rejectedAdd
            ? 'Polygon network add request rejected. Switch MetaMask to Polygon Mainnet before sending USDC.'
            : 'Could not add Polygon Mainnet in MetaMask.');
          applyWrongNetworkPresentation();
          return;
        }
      } else {
        const rejectedSwitch = err && err.code === 4001;
        setStatus(rejectedSwitch
          ? 'Network switch rejected. Switch MetaMask to Polygon Mainnet before sending USDC.'
          : 'Could not switch MetaMask to Polygon Mainnet.');
        applyWrongNetworkPresentation();
        return;
      }
    }

    await syncProviderState({ force: true });
    if (state.chainId !== POLYGON_MAINNET_CHAIN_ID) {
      setStatus('MetaMask has not reported Polygon Mainnet to this site yet.');
      applyWrongNetworkPresentation();
    }
  }

  async function syncProviderAccounts(options = {}) {
    const provider = getWalletProvider();
    if (!state.connected || !provider || !provider.request) return false;

    let accounts;
    try {
      accounts = await provider.request({ method: 'eth_accounts' });
    } catch (_) {
      return false;
    }

    if (!accounts || !accounts[0]) {
      disconnect();
      return true;
    }

    const nextAddress = accounts[0];
    const changed = !state.address || nextAddress.toLowerCase() !== state.address.toLowerCase();
    state.address = nextAddress;
    updateSenderDisplay();

    if (changed) {
      clearTransferForm();
      resetBalanceDisplay();
    }

    if ((changed || options.force) && options.render !== false) {
      applyCurrentNetworkPresentation({
        shouldScroll: false,
        eventVal: changed ? `Wallet account changed to ${shortAddr(state.address)}.` : undefined,
      });
    }
    return changed;
  }

  async function requestAccountSelection() {
    const provider = getWalletProvider();
    if (!provider || !provider.request) {
      setStatus('No wallet detected.');
      return;
    }

    const previousAddress = state.address;

    if (els.switchAccountBtn) {
      els.switchAccountBtn.disabled = true;
      els.switchAccountBtn.textContent = 'Selecting...';
    }
    setStatus('Select the wallet account to use in MetaMask.');
    clearTransferForm();
    resetBalanceDisplay();

    try {
      await provider.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
      const accounts = await provider.request({ method: 'eth_accounts' });
      if (accounts && accounts[0]) {
        const nextAddress = accounts[0];
        state.connected = true;
        state.userDisconnected = false;
        state.address = nextAddress;
        updateSenderDisplay();
        await syncProviderState({ force: true });
        if (previousAddress && nextAddress.toLowerCase() === previousAddress.toLowerCase()) {
          setStatus('MetaMask returned the same authorized account. Open MetaMask connected sites, disconnect this site, then reconnect with the intended account.');
        } else {
          setStatus('');
        }
      } else {
        setStatus('No wallet account selected.');
      }
    } catch (err) {
      const rejected = err && err.code === 4001;
      if (rejected) {
        setStatus('Account selection rejected.');
      } else {
        try {
          const accounts = await provider.request({ method: 'eth_requestAccounts' });
          if (accounts && accounts[0]) {
            const nextAddress = accounts[0];
            state.connected = true;
            state.userDisconnected = false;
            state.address = nextAddress;
            updateSenderDisplay();
            await syncProviderState({ force: true });
            if (previousAddress && nextAddress.toLowerCase() === previousAddress.toLowerCase()) {
              setStatus('MetaMask returned the same authorized account. Open MetaMask connected sites, disconnect this site, then reconnect with the intended account.');
            } else {
              setStatus('');
            }
          } else {
            setStatus('No wallet account selected.');
          }
        } catch (_) {
          setStatus('Could not open MetaMask account selection.');
        }
      }
    } finally {
      if (els.switchAccountBtn) {
        els.switchAccountBtn.disabled = false;
        els.switchAccountBtn.textContent = 'Switch Account';
      }
    }
  }

  async function requestWalletAccounts(options = {}) {
    const provider = getWalletProvider();
    if (!provider || !provider.request) return [];

    if (options.forcePermission) {
      try {
        await provider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch (err) {
        const code = providerErrorCode(err);
        if (code === 4001 || code === -32002) throw err;
        console.warn('[ImplicitEx] Account permission request unavailable or failed', err);
      }
    }

    return provider.request({ method: 'eth_requestAccounts' });
  }

  function dispatchWalletStateChanged() {
    window.dispatchEvent(new CustomEvent('ix:wallet-state-changed'));
  }

  function applyCurrentNetworkPresentation(options = {}) {
    const netState = getNetworkState();
    if (netState !== 'READY') {
      applyWrongNetworkPresentation();
      resetBalanceDisplay();
      dispatchWalletStateChanged();
      return;
    }

    const eventVal = options.eventVal;
    applyConnectedPresentation({ shouldScroll: options.shouldScroll, eventVal });

    refreshUsdcBalance();
    updatePreview();
    const recipient = (els.txRecipient && els.txRecipient.value.trim()) || '';
    if (validateRecipient(recipient) === '') {
      refreshRecipientCodeWarning(recipient);
    } else {
      state.recipientCodeWarning = null;
    }
    dispatchWalletStateChanged();
  }

  async function syncProviderChain(options = {}) {
    const provider = getWalletProvider();
    if (!state.connected || !provider || !provider.request) return false;

    let chainHex;
    try {
      chainHex = await provider.request({ method: 'eth_chainId' });
    } catch (_) {
      return false;
    }

    const nextChainId = normalizeChainId(chainHex);
    if (!nextChainId) return false;

    const changed = nextChainId !== state.chainId;
    state.chainId = nextChainId;

    if ((changed || options.force) && options.render !== false) {
      applyCurrentNetworkPresentation({
        shouldScroll: false,
        eventVal: changed ? `Network changed to ${chainLabel(state.chainId)}.` : undefined,
      });
    }
    return changed;
  }

  async function syncProviderState(options = {}) {
    const chainChanged = await syncProviderChain({ render: false });
    const accountChanged = await syncProviderAccounts({ render: false });

    if (chainChanged || accountChanged || options.force) {
      const eventVal = accountChanged
        ? `Wallet account changed to ${shortAddr(state.address)}.`
        : chainChanged
          ? `Network changed to ${chainLabel(state.chainId)}.`
          : undefined;
      applyCurrentNetworkPresentation({ shouldScroll: false, eventVal });
    }
  }

  function startWalletChainWatcher() {
    if (state.walletChainPollTimer) return;
    state.walletChainPollTimer = setInterval(() => {
      syncProviderState();
    }, 1500);
  }

  function stopWalletChainWatcher() {
    if (!state.walletChainPollTimer) return;
    clearInterval(state.walletChainPollTimer);
    state.walletChainPollTimer = null;
  }

  // ----------------------------------------------------------------
  // Connect wallet
  // ----------------------------------------------------------------
  async function connect(options = {}) {
    if (state.connected || state.connecting) return;

    if (!getWalletProvider() || !getWalletProvider().request) {
      handleConnectFailure('No wallet detected');
      return;
    }

    setNavStatus('Connecting wallet');
    setConnectPending(true);

    try {
      const accounts = await requestWalletAccounts({
        forcePermission: options.forcePermission === true,
      });
      if (!accounts || !accounts[0]) {
        handleConnectFailure('No wallet account returned');
        return;
      }

      walletRuntime.provider = getWalletProvider();
      walletRuntime.source = 'injected';
      state.connected = true;
      state.address = accounts[0];
      state.provider = walletRuntime.provider;
      state.userDisconnected = false;

      const chainHex = await walletRuntime.provider.request({ method: 'eth_chainId' });
      state.chainId = normalizeChainId(chainHex);
    } catch (err) {
      console.warn('[ImplicitEx] Wallet connection failed', err);
      handleConnectFailure(
        providerErrorMessage(err, 'Wallet connection failed'),
        providerErrorSeverity(err)
      );
      return;
    }

    state.connecting = false;
    if (els.connectBtn) els.connectBtn.disabled = false;
    startWalletChainWatcher();
    onConnected();
  }

  function onConnected() {
    applyCurrentNetworkPresentation({ shouldScroll: true });

    pollNetworkData();
  }

  // ----------------------------------------------------------------
  // Fee calculation
  // ----------------------------------------------------------------
  function calcFee(amount) {
    // 1% flat fee, floored to 6 decimal places for USDC display.
    return Math.floor(amount * DEMO_FEE_RATE * 1_000_000) / 1_000_000;
  }

  if (els.amtIn) {
    els.amtIn.addEventListener('input', function () {
      resetTransferTimelineOnDraftEdit();
      const val = parseFloat(this.value);
      if (!isNaN(val) && val > 0) {
        const fee = calcFee(val);
        els.feeDisplay.textContent = fee.toFixed(6) + ' USDC';
      } else {
        els.feeDisplay.textContent = '—';
      }
      updatePreview();
    });
  }

  // ----------------------------------------------------------------
  // Recipient address validation — assertive, hard-state
  // ----------------------------------------------------------------
  function validateRecipient(value) {
    if (!value || value.trim() === '') return null; // empty — no error shown yet

    const v = value.trim();

    if (!/^0x/i.test(v))          return 'Invalid address format. Wallet addresses start with 0x.';
    if (v.length !== 42)           return 'Invalid address format. Must be 42 characters (0x + 40 hex digits).';
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return 'Invalid address format. Check for missing characters, extra spaces, or mistaken letters.';
    if (state.address && v.toLowerCase() === state.address.toLowerCase())
                                   return 'Recipient cannot be your own wallet.';
    if (isConfiguredTransferContractAddress(v)) return 'Recipient cannot be the configured ImplicitEx contract.';
    if (isConfiguredTokenAddress(v)) return 'Recipient cannot be the configured USDC token contract.';
    return ''; // valid
  }

  function applyRecipientValidation(value) {
    const result = validateRecipient(value);
    if (result === null) {
      // Empty field — clear error state silently
      if (els.recipientError) els.recipientError.textContent = '';
      if (els.txRecipient) els.txRecipient.classList.remove('tx-field--error');
    } else if (result === '') {
      // Valid
      if (els.recipientError) els.recipientError.textContent = '';
      if (els.txRecipient) els.txRecipient.classList.remove('tx-field--error');
    } else {
      // Invalid — show error
      if (els.recipientError) els.recipientError.textContent = result;
      if (els.txRecipient) els.txRecipient.classList.add('tx-field--error');
    }
    return result === '';
  }

  if (els.txRecipient) {
    els.txRecipient.addEventListener('input', function () {
      resetTransferTimelineOnDraftEdit();
      const valid = applyRecipientValidation(this.value);
      if (valid) {
        refreshRecipientCodeWarning(this.value);
      } else {
        state.recipientCodeWarning = null;
      }
      updatePreview();
    });
  }

  [els.txPurposeTag, els.txReference, els.txMemo].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      resetTransferTimelineOnDraftEdit();
      updatePreview();
    });
    el.addEventListener('change', function () {
      resetTransferTimelineOnDraftEdit();
      updatePreview();
    });
  });

  // ----------------------------------------------------------------
  // Transfer helpers
  // ----------------------------------------------------------------

  /**
   * Parse a decimal USDC string ("5.25") to raw uint256 units (6 decimals)
   * without floating-point rounding errors.
   */
  function parseUsdcAmount(str) {
    const s = String(str).trim();
    if (!/^(?:\d+|\d+\.\d{1,6}|\.\d{1,6})$/.test(s)) {
      throw new Error('INVALID_USDC_DECIMALS');
    }
    const dotIdx = s.indexOf('.');
    const whole = dotIdx === -1 ? s : s.slice(0, dotIdx);
    const frac  = dotIdx === -1 ? '' : s.slice(dotIdx + 1);
    const fracPadded = (frac + '000000').slice(0, 6);
    return BigInt(whole || '0') * 1_000_000n + BigInt(fracPadded);
  }

  /**
   * Set the submit button and status line atomically.
   * txState: 'idle' | 'pending'
   * message: string, or null to leave status unchanged.
   */
  function setTxState(txState, message, buttonLabel) {
    const isPending = txState === 'pending';
    if (els.txBtn) {
      const isUnavailable = getNetworkState() !== 'READY';
      els.txBtn.disabled = isPending || isUnavailable;
      if (isPending) {
        els.txBtn.textContent = buttonLabel || 'Processing…';
        els.txBtn.classList.add('tx-btn--pending');
      } else {
        els.txBtn.textContent = currentButtonLabel();
        els.txBtn.classList.remove('tx-btn--pending');
      }
      if (isPending || isUnavailable) els.txBtn.classList.remove('tx-btn--armed');
    }
    // Disable Edit Details while a wallet prompt is open — clicking it during
    // an active MetaMask request would leave the prompt orphaned.
    if (els.txCancelReview) {
      els.txCancelReview.disabled = isPending;
    }
    if (message !== null && message !== undefined) {
      setStatus(message);
    }
  }

  /**
   * Fetch the connected wallet's USDC balance and update #usdcBalance.
   * Silently no-ops if chain config or address is missing.
   */
  async function refreshUsdcBalance() {
    if (!state.address || !state.chainId || !window.IX_CHAINS) return;
    const chainConfig = window.IX_CHAINS[state.chainId];
    if (!chainConfig || !chainConfig.usdcAddress) return;

    try {
      const provider = new ethers.BrowserProvider(getWalletProvider());
      const usdc = new ethers.Contract(chainConfig.usdcAddress, ERC20_ABI, provider);
      const bal = await usdc.balanceOf(state.address);
      state.usdcBalanceRaw = BigInt(bal);
      if (els.usdcBalance) {
        els.usdcBalance.textContent = parseFloat(ethers.formatUnits(bal, 6)).toFixed(2) + ' USDC';
      }
      updatePreview();
    } catch (_) {
      state.usdcBalanceRaw = null;
      updatePreview();
    }
  }

  // ----------------------------------------------------------------
  // Submit transfer
  // ----------------------------------------------------------------
  async function submitTransfer() {
    // ---- Re-entry guard: prevents concurrent submitTransfer() calls ----
    if (activeTransferFlow) return;

    // ---- Wallet busy cooldown: prevents rapid retries after -32002 ----
    // MetaMask may still have a pending request for several seconds after -32002.
    // Retrying immediately just hits -32002 again. Block for a short window.
    if (Date.now() < submitBlockedUntil) {
      setStatus('Wallet request already pending. Open MetaMask and finish or cancel it, then retry.');
      return;
    }

    activeTransferFlow = true;

    // ---- Flow identity: each invocation gets a unique token.
    // assertFlowActive() throws FLOW_INVALIDATED if the token was cleared by
    // an account/network change or disconnect while we were awaiting. ----
    const flowId = Symbol('transfer-flow');
    activeFlowId = flowId;

    function assertFlowActive() {
      if (activeFlowId !== flowId) {
        const err = new Error('Transfer flow superseded by account or network change.');
        err.code = 'FLOW_INVALIDATED';
        throw err;
      }
    }

    // Must enter REVIEW_READY via enterReview() before wallet action begins.
    if (state.txPhase !== 'REVIEW_READY' || !state.reviewDraft) {
      setStatus('Review transfer details before confirming.');
      activeTransferFlow = false;
      return;
    }
    if (!els.txConfirmAck || !els.txConfirmAck.checked) {
      setStatus('Confirm the reviewed recipient, amount, fee, and total debit before executing.');
      activeTransferFlow = false;
      updateReviewActionButton();
      return;
    }

    // Capture frozen values before any async operations.
    const { recipient, amountStr, amountFloat } = state.reviewDraft;
    const metadata = state.reviewDraft.metadata || getTransferMetadata();

    // receiptId is hoisted so the outer catch can update it on FLOW_INVALIDATED.
    let receiptId = null;
    let transferConfirmed = false;

    try {

    const accountChanged = await syncProviderAccounts();
    if (accountChanged) {
      // clearTransferForm() already called by syncProviderAccounts on change.
      setStatus('Wallet account changed. Review the connected sender and re-enter transfer details.');
      return;
    }

    // --- ethers availability guard ---
    if (typeof ethers === 'undefined') {
      setStatus('ethers.js failed to load. Refresh the page and try again.');
      return;
    }

    const activeProvider = getWalletProvider();

    // --- Chain detection ---
    let chainHex;
    try {
      chainHex = await activeProvider.request({ method: 'eth_chainId' });
    } catch (_) {
      setStatus('Could not read chain ID from wallet.');
      return;
    }
    const chainId = normalizeChainId(chainHex);
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[chainId];
    state.chainId = chainId;

    if (!isLiveTransferChain(chainId)) {
      const supported = Object.values(window.IX_CHAINS || {})
        .filter(c => c.transfersEnabled && c.contractAddress)
        .map(c => c.name)
        .join(', ') || 'Polygon';
      setStatus(`Wrong network. Switch to ${supported} in your wallet.`);
      applyWrongNetworkPresentation();
      return;
    }

    // --- Contract address guard ---
    const contractAddress = chainConfig.contractAddress;
    const usdcAddress     = chainConfig.usdcAddress;

    if (!contractAddress) {
      setStatus('ImplicitEx contract not deployed on this network yet.');
      return;
    }
    if (!usdcAddress) {
      setStatus('USDC address not configured for this network.');
      return;
    }

    // Re-check sender immediately before signer use. This is the authority gate.
    let accountsBeforeSigner;
    try {
      accountsBeforeSigner = await activeProvider.request({ method: 'eth_accounts' });
    } catch (_) {
      setStatus('Could not verify connected sender before wallet action.');
      return;
    }
    const currentSender = accountsBeforeSigner && accountsBeforeSigner[0];
    if (!currentSender || currentSender.toLowerCase() !== state.address.toLowerCase()) {
      clearTransferForm();
      state.address = currentSender || null;
      updateSenderDisplay();
      setStatus('Wallet account changed. Review the connected sender and re-enter transfer details.');
      return;
    }

    // --- Build contracts ---
    let signer;
    try {
      const provider = new ethers.BrowserProvider(activeProvider);
      signer = await provider.getSigner(state.address);
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== state.address.toLowerCase()) {
        clearTransferForm();
        state.address = signerAddress;
        updateSenderDisplay();
        setStatus('Wallet signer changed. Review the connected sender and re-enter transfer details.');
        return;
      }
    } catch (_) {
      setStatus('Could not get wallet signer. Is your wallet unlocked?');
      return;
    }

    const usdc       = new ethers.Contract(usdcAddress,     ERC20_ABI,     signer);
    const implicitex = new ethers.Contract(contractAddress, IMPLICITEX_ABI, signer);

    // --- Amount validation ---
    let rawAmount;
    try {
      rawAmount = parseUsdcAmount(amountStr);
    } catch (err) {
      setStatus(err && err.message === 'INVALID_USDC_DECIMALS'
        ? 'Amount supports up to 6 decimal places for USDC.'
        : 'Invalid amount format.');
      return;
    }

    // --- Fresh on-chain preview and contract state ---
    // previewTransfer is an amount/balance/allowance helper only. Recipient,
    // network, configured addresses, and pause state remain separate UI gates.
    let minTransfer, precision, isPaused, onChainPreview;
    try {
      [minTransfer, precision, isPaused, onChainPreview] = await Promise.all([
        implicitex.minTransferAmount(),
        implicitex.transferPrecision(),
        implicitex.paused(),
        implicitex.previewTransfer(state.address, rawAmount),
      ]);
    } catch (_) {
      setStatus('Could not refresh contract preview data. Is the contract deployed and reachable?');
      return;
    }

    if (isPaused) {
      setStatus('Transfers are currently paused. No wallet action was requested.');
      setTransferNote('Contract pause state blocks transfer execution.');
      companionState('TRANSFERS_DISABLED', {
        statusLine: 'Transfers paused by contract.',
        stateVal:   'Transfers paused',
        fundsVal:   'No active transaction',
        networkVal: chainConfig.name,
        eventVal:   'Contract paused() returned true.',
        actionVal:  'Wait until transfers are unpaused before retrying.',
        severity:   'warning',
      });
      return;
    }

    // --- Fee math — mirrors contract integer division exactly ---
    const fee        = BigInt(onChainPreview[0]);
    const totalDebit = BigInt(onChainPreview[1]);

    if (rawAmount < minTransfer) {
      const minHuman = ethers.formatUnits(minTransfer, 6);
      setStatus(`Amount below contract minimum of ${minHuman} USDC.`);
      return;
    }

    if (rawAmount % precision !== 0n) {
      const precHuman = ethers.formatUnits(precision, 6);
      setStatus(`Amount must be a multiple of ${precHuman} USDC.`);
      return;
    }

    if (chainConfig.maxTransferUsdc && amountFloat > chainConfig.maxTransferUsdc) {
      setStatus(`Amount exceeds the ${chainConfig.maxTransferUsdc} USDC soft launch cap.`);
      return;
    }

    // --- Balance and allowance snapshot from previewTransfer ---
    const balance = BigInt(onChainPreview[2]);
    const allowance = BigInt(onChainPreview[3]);
    state.usdcBalanceRaw = balance;

    if (balance < totalDebit) {
      const have = ethers.formatUnits(balance, 6);
      const need = ethers.formatUnits(totalDebit, 6);
      setStatus(`Insufficient balance. Have ${have} USDC, need ${need} USDC (amount + fee).`);
      return;
    }

    const refreshedSummary = buildOnChainPreviewSummary(
      state.reviewDraft,
      onChainPreview,
      chainConfig
    );
    state.reviewDraft = refreshedSummary;
    state.reviewDraft.metadata = metadata;
    renderTransferSummary(refreshedSummary, {
      label: 'Review Transfer',
      mode: 'On-chain refreshed',
      note: 'Contract preview refreshed. Recipient, network, pause state, contract, and USDC token checks passed before wallet prompt.',
    });

    const storedReceipt = storeReceipt(buildReceiptDetail({
      stateKey: IX_TRANSFER_STATES.READY,
      sender: state.address,
      recipient,
      amount: rawAmount,
      fee,
      totalDebit,
      chainId,
      chainConfig,
      contractAddress,
      metadata,
      lastKnownMessage: 'Transfer details validated. No wallet action requested yet.',
    }));
    receiptId = storedReceipt.id;
    markTransferStep('review_ready');

    // --- Allowance check / approve ---
    const needsApproval = allowance < totalDebit;

    if (needsApproval) {
      const totalDebitHuman = ethers.formatUnits(totalDebit, 6);
      markTransferStep('authorization_requested');
      // ---- Step 1 of 2: Authorize USDC Access ----
      // Narrate BEFORE MetaMask fires. Three rails, three distinct roles:
      //   transferStateNote = primary action rail  (what step, what is required)
      //   txStatus          = contextual note      (what this action does NOT do)
      //   companionState    = state memory rail    (record for the tray)
      setTransferNote(`Step 1 of 2 — Approve ${totalDebitHuman} USDC total debit`);
      setStatus('Approval is permission only. Funds are not sent yet.');
      setTxState('pending', 'Wallet authorization required.', 'Approve in MetaMask…');
      if (els.previewNote) els.previewNote.textContent = `Wallet authorization requested for ${totalDebitHuman} USDC total debit. Funds are not sent yet.`;
      updateReceipt(receiptId, {
        state: IX_TRANSFER_STATES.AUTHORIZING,
        lastKnownMessage: `USDC authorization requested for ${totalDebitHuman} USDC total debit. Funds are not sent yet.`,
      });
      companionState(IX_TRANSFER_STATES.AUTHORIZING, {
        statusLine: `Approve ${totalDebitHuman} USDC total debit.`,
        stateVal:   'Awaiting authorization',
        fundsVal:   'Not yet — authorization only',
        networkVal: chainConfig.name,
        eventVal:   'USDC authorization requested',
        actionVal:  'Approve the full total debit. Approval alone does not send funds.',
      });
      try {
        const approveTx = await usdc.approve(contractAddress, totalDebit);
        updateReceipt(receiptId, {
          approvalHash: approveTx.hash,
          lastKnownMessage: `USDC authorization submitted for ${totalDebitHuman} USDC total debit. Funds are not sent yet.`,
        });
        setStatus('Step 2 of 2 — transfer confirmation follows.');
        setTxState('pending', 'Authorization submitted.', 'Confirming approval…');
        setTransferNote('Step 1 of 2 — Approval submitted — awaiting chain confirmation…');
        await approveTx.wait();
        // Check flow after the approval wait — account or network may have changed
        // while we were blocked on the confirmation.
        assertFlowActive();
        updateReceipt(receiptId, {
          state: IX_TRANSFER_STATES.AUTHORIZED,
          lastKnownMessage: 'USDC authorization confirmed. Transfer not submitted yet.',
        });
        markTransferStep('authorization_confirmed');
        setTransferNote('Approval confirmed — transfer confirmation opening in MetaMask…');
      } catch (err) {
        if (err.code === 'FLOW_INVALIDATED') throw err; // bubble to outer catch

        const errCode = providerErrorCode(err);

        if (errCode === -32002) {
          // MetaMask already has a pending request — not a transfer failure,
          // not user rejection. No authorization occurred. Deterministic interruption.
          // Set cooldown to block immediate retries while MetaMask clears the queue.
          submitBlockedUntil = Date.now() + 5000;
          setTransferNote('');
          setStatus('');
          resolveReceipt(receiptId, {
            state: IX_TRANSFER_STATES.INTERRUPTED,
            fundsMoved: false,
            lastKnownMessage: 'Wallet request already pending in MetaMask. No authorization occurred. No funds moved.',
          });
          failTransferTimeline('authorization_requested', 'Wallet request already pending');
          setTxState('idle', 'MetaMask already has a pending request. Open MetaMask and finish or cancel it, then retry.');
          companionState(IX_TRANSFER_STATES.REJECTED, {
            statusLine: 'Wallet request already pending in MetaMask.',
            stateVal:   'Interrupted',
            fundsVal:   'No — nothing was sent',
            networkVal: chainConfig.name,
            eventVal:   'MetaMask already has a pending request (-32002)',
            actionVal:  'Open MetaMask, finish or cancel the pending request, then retry.',
            autoOpen:   true,
          });
        } else {
          const rejected = errCode === 4001 ||
            (err.info && err.info.error && err.info.error.code === 4001);
          if (rejected) {
            setTransferNote('');
            setStatus('');
            resolveReceipt(receiptId, {
              state: IX_TRANSFER_STATES.REJECTED,
              fundsMoved: false,
              lastKnownMessage: 'USDC authorization declined in wallet. No funds moved.',
            });
            failTransferTimeline('authorization_requested', 'Authorization declined');
            setTxState('idle', 'Authorization declined. No funds moved.');
            companionState(IX_TRANSFER_STATES.REJECTED, {
              statusLine: 'Authorization rejected in wallet.',
              stateVal:   'Declined',
              fundsVal:   'No — nothing was sent',
              networkVal: chainConfig.name,
              eventVal:   'USDC authorization declined in wallet',
              actionVal:  'No funds moved. Retry when ready.',
              autoOpen:   true,
            });
          } else {
            const explained = classifyTransferError(err, { phase: 'authorization', broadcastKnown: false });
            setTransferNote('');
            setStatus('');
            resolveReceipt(receiptId, {
              state: IX_TRANSFER_STATES.INTERRUPTED,
              fundsMoved: explained.fundsMoved,
              lastKnownMessage: `${explained.title}. ${explained.message}`,
            });
            failTransferTimeline('authorization_requested', explained.title);
            setTxState('idle', `${explained.title}. ${explained.retryGuidance}`);
            companionState(IX_TRANSFER_STATES.INTERRUPTED, {
              statusLine: 'Authorization interrupted. Transfer cancelled.',
              stateVal:   explained.title,
              fundsVal:   'No — transfer did not proceed',
              networkVal: chainConfig.name,
              eventVal:   explained.code,
              actionVal:  explained.retryGuidance,
              autoOpen:   true,
            });
          }
        }
        return;
      }
    } else {
      updateReceipt(receiptId, {
        state: IX_TRANSFER_STATES.AUTHORIZING,
        lastKnownMessage: 'Existing USDC allowance is being checked. Transfer not submitted yet.',
      });
      updateReceipt(receiptId, {
        state: IX_TRANSFER_STATES.AUTHORIZED,
        lastKnownMessage: 'Existing USDC allowance is sufficient. Transfer not submitted yet.',
      });
    }

    // ---- Step 2 of 2 (or sole step when allowance already sufficient): Execute transfer ----
    // Check flow before the transfer step — the user may have changed account or network
    // during the approval confirmation wait.
    assertFlowActive();

    // Narrate BEFORE MetaMask fires.
    //   transferStateNote = primary action rail
    //   txStatus          = point-of-no-return signal
    //   companionState    = state memory
    const stepLabel = needsApproval ? 'Step 2 of 2 — Confirm the transfer in MetaMask' : 'Confirm the transfer in MetaMask';
    markTransferStep('transfer_requested');
    setTransferNote(stepLabel);
    setStatus(`This is the funds-moving request. Recipient gets ${ethers.formatUnits(rawAmount, 6)} USDC; total wallet debit is ${ethers.formatUnits(totalDebit, 6)} USDC.`);
    setTxState('pending', 'Wallet confirmation required.', 'Confirm transfer in MetaMask…');
    if (els.previewNote) els.previewNote.textContent = 'Transfer confirmation requested. Confirm in MetaMask only if recipient amount, platform fee, and total wallet debit match.';
    updateReceipt(receiptId, {
      state: IX_TRANSFER_STATES.SUBMITTING,
      lastKnownMessage: 'Transfer confirmation requested. Funds move only after on-chain confirmation.',
    });
    companionState(IX_TRANSFER_STATES.SUBMITTING, {
      statusLine: 'Confirm transfer.',
      stateVal:   'Awaiting confirmation',
      fundsVal:   'No — not until confirmed on-chain',
      networkVal: chainConfig.name,
      eventVal:   'Transfer signature requested',
      actionVal:  `Funds move only if confirmed on-chain. Recipient gets ${ethers.formatUnits(rawAmount, 6)} USDC; total wallet debit is ${ethers.formatUnits(totalDebit, 6)} USDC.`,
    });

    // txBroadcast: set true only after SUBMITTED is persisted to localStorage.
    // Any error in the catch with txBroadcast=true routes to OUTCOME_UNKNOWN —
    // do not set this flag until the hash is durably written.
    let txBroadcast = false;
    let broadcastHash = null;
    let broadcastUrl = null;
    try {
      const tx = await implicitex.transferWithFee(recipient, rawAmount);
      broadcastHash = tx.hash;
      broadcastUrl = `${chainConfig.explorerUrl}/tx/${broadcastHash}`;

      // Persist SUBMITTED + hash atomically before any UI update or flag change.
      // This is the durable broadcast checkpoint: if the page closes after this
      // write, rehydrate.js will find a SUBMITTED receipt with a hash and attempt
      // chain reconciliation on next load.
      updateReceipt(receiptId, {
        state: IX_TRANSFER_STATES.SUBMITTED,
        transferHash: broadcastHash,
        hash: broadcastHash,
        explorerUrl: broadcastUrl,
        lastKnownMessage: 'Transfer broadcast to network. Awaiting confirmation.',
      });

      // Flag set after persistence: catch block uses this to distinguish
      // post-broadcast errors (OUTCOME_UNKNOWN) from pre-broadcast errors (FAILED).
      txBroadcast = true;

      markTransferStep('broadcast');
      setTransferNote('Transfer submitted — awaiting Polygon confirmation…');
      setStatus('');
      setTxState('pending', 'Broadcast to network. Do not retry.', 'Awaiting Polygon…');
      companionState(IX_TRANSFER_STATES.SUBMITTED, {
        statusLine: 'Transaction submitted. Awaiting chain confirmation.',
        stateVal:   'Submitted',
        fundsVal:   'No — not until confirmed',
        networkVal: chainConfig.name,
        eventVal:   'Broadcast to network',
        actionVal:  'Wait for confirmation. Do not retry.',
      });
      const txReceipt = await tx.wait();

      const txHash     = txReceipt.hash;
      const receiptUrl = `${chainConfig.explorerUrl}/tx/${txHash}`;
      if (els.txStatus) {
        // explorerUrl is from our own config; txHash is a 0x-prefixed hex from the chain — safe.
        els.txStatus.innerHTML =
          `Transfer confirmed. ` +
          `<a href="${receiptUrl}" target="_blank" rel="noopener">` +
          `View on ${chainConfig.name} explorer</a>`;
      }
      setTransferNote('');
      setTxState('idle', null); // status already set above via innerHTML
      updateReceiptFromSource(receiptId, {
        state: IX_TRANSFER_STATES.CONFIRMED,
        fundsMoved: true,
        transferHash: txHash,
        hash: txHash,
        explorerUrl: receiptUrl,
        blockNumber: txReceipt.blockNumber || null,
        lastKnownMessage: 'Transfer confirmed. Funds moved on Polygon.',
      }, OBSERVATION_SOURCES && OBSERVATION_SOURCES.RPC);
      if (window.IX && window.IX.receipts) window.IX.receipts.clearActive();
      markTransferStep('confirmed');
      renderTransferSummary(refreshedSummary, {
        label: 'Transfer Confirmed',
        mode: 'Confirmed',
        note: `Tx ${shortHash(txHash)} confirmed on Polygon. Explorer link is visible above and in the receipt list.`,
      });
      companionState(IX_TRANSFER_STATES.CONFIRMED, {
        statusLine: 'Transfer confirmed. Funds moved on Polygon.',
        stateVal:   'Confirmed',
        fundsVal:   'Yes — transfer complete',
        networkVal: chainConfig.name,
        eventVal:   txHash,
        actionVal:  `View on ${chainConfig.name} explorer`,
        actionHref: receiptUrl,
        autoOpen:   true,
      });

      transferConfirmed = true;
      upsertRecipientBook(recipient, metadata);
      clearDraftControlsAfterConfirmation();
      refreshUsdcBalance();
    } catch (err) {
      if (err.code === 'FLOW_INVALIDATED') throw err; // bubble to outer catch

      if (txBroadcast) {
        // Transaction was broadcast before the error. Outcome is unknown —
        // we cannot assert fundsMoved either way. Surface the hash and direct
        // the user to the explorer rather than claiming funds were not moved.
        const explained = classifyTransferError(err, { phase: 'confirmation', broadcastKnown: true });
        setTransferNote('');
        const outcomeHash = err.receipt && err.receipt.hash
          ? err.receipt.hash
          : err.transactionHash || broadcastHash;
        const outcomeUrl = outcomeHash ? `${chainConfig.explorerUrl}/tx/${outcomeHash}` : broadcastUrl;
        preserveReceiptForRehydration(receiptId, {
          state: explained.state,
          fundsMoved: explained.fundsMoved,
          transferHash: outcomeHash,
          hash: outcomeHash,
          explorerUrl: outcomeUrl,
          lastKnownMessage: 'Transaction broadcast detected. Final confirmation could not be verified locally.',
        });
        failTransferTimeline('broadcast', 'Outcome unknown');
        if (els.txStatus && outcomeUrl) {
          els.txStatus.innerHTML =
            `Outcome unknown. ` +
            `<a href="${outcomeUrl}" target="_blank" rel="noopener">` +
            `Check on ${chainConfig.name} explorer</a>`;
        } else {
          setTxState('idle', 'Outcome unknown. Check the explorer before retrying.');
        }
        companionState(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, {
          statusLine: 'Transaction outcome could not be verified locally.',
          stateVal:   'Outcome unknown',
          fundsVal:   'Unknown — check explorer',
          networkVal: chainConfig.name,
          eventVal:   explained.code,
          actionVal:  explained.retryGuidance,
          severity:   'warning',
          autoOpen:   true,
        });
      } else {
        // Error before broadcast: wallet busy, user rejected, or pre-broadcast failure.
        const errCode = providerErrorCode(err);

        if (errCode === -32002) {
          // MetaMask already has a pending request — deterministic interruption.
          // No broadcast occurred. No funds moved.
          // Set cooldown to block immediate retries while MetaMask clears the queue.
          submitBlockedUntil = Date.now() + 5000;
          setTransferNote('');
          setStatus('');
          resolveReceipt(receiptId, {
            state: IX_TRANSFER_STATES.INTERRUPTED,
            fundsMoved: false,
            lastKnownMessage: 'Wallet request already pending in MetaMask. No transfer was submitted. No funds moved.',
          });
          failTransferTimeline('transfer_requested', 'Wallet request already pending');
          setTxState('idle', 'MetaMask already has a pending request. Open MetaMask and finish or cancel it, then retry.');
          companionState(IX_TRANSFER_STATES.REJECTED, {
            statusLine: 'Wallet request already pending in MetaMask.',
            stateVal:   'Interrupted',
            fundsVal:   'No — nothing was sent',
            networkVal: chainConfig.name,
            eventVal:   'MetaMask already has a pending request (-32002)',
            actionVal:  'Open MetaMask, finish or cancel the pending request, then retry.',
            autoOpen:   true,
          });
        } else {
          const rejected = errCode === 4001 ||
            (err.info && err.info.error && err.info.error.code === 4001);
          if (rejected) {
            setTransferNote('');
            setStatus('');
            resolveReceipt(receiptId, {
              state: IX_TRANSFER_STATES.REJECTED,
              fundsMoved: false,
              lastKnownMessage: 'Transfer rejected in wallet. No transfer was broadcast.',
            });
            failTransferTimeline('transfer_requested', 'Transfer declined');
            setTxState('idle', 'Transfer declined. No funds moved.');
            companionState(IX_TRANSFER_STATES.REJECTED, {
              statusLine: 'Transfer rejected in wallet.',
              stateVal:   'Rejected',
              fundsVal:   'No — nothing was sent',
              networkVal: chainConfig.name,
              eventVal:   'Transfer rejected in wallet',
              actionVal:  'No transfer was broadcast. Retry when ready.',
              autoOpen:   true,
            });
          } else {
            const explained = classifyTransferError(err, { phase: 'transfer', broadcastKnown: false });
            setTransferNote('');
            setStatus('');
            resolveReceipt(receiptId, {
              state: IX_TRANSFER_STATES.INTERRUPTED,
              fundsMoved: explained.fundsMoved,
              lastKnownMessage: `${explained.title}. ${explained.message}`,
            });
            failTransferTimeline('transfer_requested', explained.title);
            setTxState('idle', `${explained.title}. ${explained.retryGuidance}`);
            companionState(IX_TRANSFER_STATES.INTERRUPTED, {
              statusLine: 'Transfer interrupted before broadcast.',
              stateVal:   explained.title,
              fundsVal:   'No — transfer did not reach the network',
              networkVal: chainConfig.name,
              eventVal:   explained.code,
              actionVal:  explained.retryGuidance,
              autoOpen:   true,
            });
          }
        }
      }
    }

    } catch (err) {
      // ---- Flow invalidation handler ----
      // Account or network changed while an async wallet operation was in progress.
      // The UI was already reset by the change handler — do not update it here.
      // Update the receipt to INTERRUPTED if one was created and is still non-terminal.
      if (err.code === 'FLOW_INVALIDATED') {
        if (receiptId) {
          resolveReceipt(receiptId, {
            state: IX_TRANSFER_STATES.INTERRUPTED,
            fundsMoved: false,
            lastKnownMessage: 'Transfer interrupted. Account or network changed mid-flow. No funds moved.',
          });
        }
        // No UI changes — the account/network change handler already reset the UI.
      }
      // Other unexpected errors: let finally clean up without rethrowing.
    } finally {
      // Always release the flow lock and exit review.
      // Terminal states preserve the status message; errors unlock the form for editing.
      activeTransferFlow = false;
      if (!transferConfirmed) {
        const preserveTimeline = !!(state.transferTimeline && state.transferTimeline.terminal);
        exitReview({ clearStatus: false, preserveTimeline });
      }
    }
  }

  // ----------------------------------------------------------------
  // Network data polling (gas / block)
  // ----------------------------------------------------------------
  function formatGwei(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 100) return Math.round(n).toString();
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }

  function readGasTier(data, tier) {
    const entry = data && data[tier];
    return Number(entry && (entry.maxFee ?? entry.maxPriorityFee));
  }

  function renderHeroGas(tiers) {
    if (!els.gasHeroVal) return;

    const values = [
      formatGwei(tiers.standard),
      '|',
      formatGwei(tiers.fast),
      '|',
      formatGwei(tiers.rapid),
    ];

    els.gasHeroVal.replaceChildren(...values.map(value => {
      const span = document.createElement('span');
      span.className = value === '|' ? 'gas-tier-sep' : 'gas-tier-value';
      span.textContent = value;
      return span;
    }));
  }

  async function fetchGasData() {
    const res = await fetch(POLYGON_GAS_STATION_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Gas station returned ${res.status}`);
    }

    const data = await res.json();
    const standard = readGasTier(data, 'standard');
    const fast = readGasTier(data, 'fast');
    const spread = Number.isFinite(standard) && Number.isFinite(fast)
      ? Math.max(1, fast - standard)
      : 1;

    return {
      standard,
      fast,
      // Polygon Gas Station exposes standard and fast. Rapid is a display
      // premium over fast until a dedicated rapid oracle is wired.
      rapid: Number.isFinite(fast) ? fast + Math.max(1, spread * 0.5) : NaN,
      blockNumber: Number(data && data.blockNumber),
    };
  }

  function pollNetworkData() {
    if (state.networkPollTimer) return;

    async function update() {
      try {
        const tiers = await fetchGasData();
        renderHeroGas(tiers);

        if (els.gweiDisplay) {
          els.gweiDisplay.textContent =
            `${formatGwei(tiers.standard)} | ${formatGwei(tiers.fast)} | ${formatGwei(tiers.rapid)} Gwei`;
        }
        if (els.blockDisplay) {
          els.blockDisplay.textContent = tiers.blockNumber ? tiers.blockNumber.toLocaleString() : 'Pending';
        }
      } catch (err) {
        renderHeroGas({ standard: NaN, fast: NaN, rapid: NaN });
        if (els.gweiDisplay) els.gweiDisplay.textContent = 'Unavailable';
        if (els.blockDisplay) els.blockDisplay.textContent = 'Pending';
      }
    }

    update();
    state.networkPollTimer = setInterval(update, 30000);
  }

  // ----------------------------------------------------------------
  // Scroll helper
  // ----------------------------------------------------------------
  function scrollToModules() {
    if (!state.connected) {
      connect({ forcePermission: state.userDisconnected });
    } else if (!isLiveTransferChain(state.chainId)) {
      applyWrongNetworkPresentation();
    } else if (els.modules) {
      els.modules.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function chainLabel(chainId) {
    if (!chainId) return 'Wallet connected';
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[chainId];
    if (chainConfig) return chainConfig.name;

    const knownChains = {
      1: 'Ethereum Mainnet',
      11155111: 'Ethereum Sepolia',
      56: 'BNB Smart Chain',
      42161: 'Arbitrum One',
      10: 'Optimism',
      8453: 'Base',
      43114: 'Avalanche C-Chain',
    };
    return knownChains[chainId] || `Unsupported chain ${chainId}`;
  }

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', async accounts => {
      if (!accounts || !accounts[0]) {
        activeFlowId = null; // invalidate any running transfer flow
        state.connected = false;
        state.address = null;
        state.provider = null;
        state.chainId = null;
        state.connecting = false;
        state.userDisconnected = true;
        stopWalletChainWatcher();
        if (els.walletPill) els.walletPill.classList.remove('visible');
        if (els.walletAddr) els.walletAddr.textContent = '';
        updateSenderDisplay();
        if (els.disconnectBtn) els.disconnectBtn.setAttribute('hidden', '');
        setAccountSwitchVisible(false);
        resetConnectButton();
        setNavStatus('');
        setElementSeverity(els.navStatus, null);
        if (els.networkBadge) {
          els.networkBadge.textContent = 'Polygon live';
          setElementSeverity(els.networkBadge, null);
        }
        resetBalanceDisplay();
        clearTransferForm();
        hideTransferModules();
        if (window.IX && window.IX.companion) window.IX.companion.reset();
        return;
      }
      if (state.userDisconnected) {
        return;
      }
      activeFlowId = null; // account changed — invalidate any running transfer flow
      state.address = accounts[0];
      state.connected = true;
      state.userDisconnected = false;
      clearTransferForm();
      resetBalanceDisplay();
      try {
        const chainHex = await getWalletProvider().request({ method: 'eth_chainId' });
        state.chainId = normalizeChainId(chainHex);
      } catch (_) {
        // Keep existing chainId; onConnected will still render the best known state.
      }
      startWalletChainWatcher();
      onConnected();
    });

    window.ethereum.on('chainChanged', chainHex => {
      state.chainId = normalizeChainId(chainHex);
      if (!state.connected) {
        if (els.networkBadge) {
          els.networkBadge.textContent = chainLabel(state.chainId);
          setElementSeverity(els.networkBadge, isLiveTransferChain(state.chainId) ? null : 'error');
        }
        return;
      }
      activeFlowId = null; // network changed while connected — invalidate any running transfer flow
      applyCurrentNetworkPresentation({
        eventVal: `Network changed to ${chainLabel(state.chainId)}.`,
      });
    });
  }

  window.addEventListener('focus', () => {
    syncProviderState({ force: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncProviderState({ force: true });
    }
  });

  async function debugWalletProvider() {
    const provider = getWalletProvider();
    if (!provider || !provider.request) {
      return { available: false };
    }

    const result = { available: true, source: walletRuntime.source || 'injected' };
    try {
      result.chainId = await provider.request({ method: 'eth_chainId' });
    } catch (err) {
      result.chainError = {
        code: providerErrorCode(err),
        message: providerErrorMessage(err, 'Could not read chain ID'),
      };
    }

    try {
      result.accounts = await provider.request({ method: 'eth_accounts' });
    } catch (err) {
      result.accountsError = {
        code: providerErrorCode(err),
        message: providerErrorMessage(err, 'Could not read accounts'),
      };
    }

    result.localState = {
      connected: state.connected,
      address: state.address,
      chainId: state.chainId,
      connecting: state.connecting,
    };
    return result;
  }

  pollNetworkData();
  renderReceiptHistory();
  renderRecipientIntel();
  renderPreflight();
  window.addEventListener('ix:receipts-changed', function () {
    renderReceiptHistory();
    renderRecipientIntel();
    renderPreflight();
  });

  // ----------------------------------------------------------------
  // Public API on window.IX
  // Extend rather than replace — receipt-store.js and companion.js
  // register their own namespaces on window.IX before and after this runs.
  // ----------------------------------------------------------------
  window.IX = Object.assign(window.IX || {}, {
    connect,
    disconnect,
    requestAccountSelection,
    openOrConnect,
    handleTxAction,
    submitTransfer,
    exitReview,
    debugWalletProvider,
    scrollToModules,
    dismissModules,
    getState: () => ({ ...state }),
  });

  // Wire dismiss and wallet-session buttons
  const dismissBtn = document.getElementById('modulesDismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', dismissModules);

  if (els.disconnectBtn) {
    els.disconnectBtn.addEventListener('click', () => {
      disconnect({ revokeProvider: true });
    });
  }
  if (els.switchAccountBtn) els.switchAccountBtn.addEventListener('click', requestAccountSelection);
  if (els.txCancelReview)  els.txCancelReview.addEventListener('click', () => exitReview());
  if (els.txConfirmAck)    els.txConfirmAck.addEventListener('change', updatePreview);

})();
