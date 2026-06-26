/**
 * wallet.js — ImplicitEx wallet connection and transfer flow
 *
 * Current state: live Polygon transfer UI with local-only receipt persistence.
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Provider runtime — source of truth for the active wallet provider.
  //
  // walletRuntime.provider is null until the user connects. Pre-connect
  // reads fall back to window.ethereum via getWalletProvider() so that
  // chain-changed events are observed before the user clicks Connect.
  //
  // On connect, setActiveProvider() is called explicitly:
  //   - injected MetaMask:  setActiveProvider(window.ethereum, 'injected')
  //   - WalletConnect:      setActiveProvider(wcProvider,      'walletconnect')
  //
  // The WalletConnect provider must be EIP-1193 compatible. Any async
  // operation started through it must capture the session identity at
  // start and verify it has not changed before mutating UI or receipts.
  // ----------------------------------------------------------------
  const walletRuntime = {
    provider: null,
    source: null, // 'injected' | 'walletconnect'
  };

  // Returns true when MetaMask or another injected EIP-1193 provider is
  // available. False on mobile browsers without the MetaMask extension.
  // connect() uses this to branch between injected and WalletConnect paths.
  function hasInjectedProvider() {
    return !!(window.ethereum && typeof window.ethereum.request === 'function');
  }

  function getWalletProvider() {
    return walletRuntime.provider || window.ethereum || null;
  }

  let activeProviderEventTarget = null;

  function setActiveProvider(provider, source) {
    if (walletRuntime.provider && walletRuntime.provider !== provider) {
      unbindActiveProviderEvents(walletRuntime.provider);
    }

    walletRuntime.provider = provider || null;
    walletRuntime.source = provider ? source : null;

    if (provider) {
      bindActiveProviderEvents(provider);
    }
  }

  function clearActiveProvider() {
    unbindActiveProviderEvents();
    walletRuntime.provider = null;
    walletRuntime.source = null;
  }

  async function handleActiveProviderAccountsChanged(accounts) {
    if (!accounts || !accounts[0]) {
      activeFlowId = null; // invalidate any running transfer flow
      state.connected = false;
      state.address = null;
      state.provider = null;
      state.chainId = null;
      state.connecting = false;
      state.userDisconnected = true;
      stopWalletChainWatcher();
      closeWalletMenu();
      hideWalletMenuEl();
      updateSenderDisplay();
      setNavStatus('');
      setElementSeverity(els.navStatus, null);
      if (els.networkBadge) {
        els.networkBadge.textContent = 'Polygon · Preview only';
        setElementSeverity(els.networkBadge, null);
      }
      resetBalanceDisplay();
      clearTransferForm();
      hideTransferModules();
      if (window.IX && window.IX.companion) window.IX.companion.reset();
      dispatchWalletStateChanged();
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
  }

  function handleActiveProviderChainChanged(chainHex) {
    state.chainId = normalizeChainId(chainHex);
    if (!state.connected) {
      if (els.networkBadge) {
        els.networkBadge.textContent = chainLabel(state.chainId);
        // Only mark the badge as error if the chain is entirely unknown (WRONG_NETWORK).
        // A known/configured chain in pre-live is not an error condition.
        setElementSeverity(els.networkBadge, isConfiguredChain(state.chainId) ? null : 'error');
      }
      return;
    }
    activeFlowId = null; // network changed while connected — invalidate any running transfer flow
    applyCurrentNetworkPresentation({
      eventVal: `Network changed to ${chainLabel(state.chainId)}.`,
    });
  }

  function bindActiveProviderEvents(provider) {
    if (!provider || typeof provider.on !== 'function') return;
    if (provider === activeProviderEventTarget) return;

    unbindActiveProviderEvents();
    provider.on('accountsChanged', handleActiveProviderAccountsChanged);
    provider.on('chainChanged', handleActiveProviderChainChanged);
    activeProviderEventTarget = provider;
  }

  function unbindActiveProviderEvents(provider = activeProviderEventTarget) {
    if (!provider || typeof provider.removeListener !== 'function') {
      if (provider === activeProviderEventTarget) {
        activeProviderEventTarget = null;
      }
      return;
    }

    provider.removeListener('accountsChanged', handleActiveProviderAccountsChanged);
    provider.removeListener('chainChanged', handleActiveProviderChainChanged);
    if (provider === activeProviderEventTarget) {
      activeProviderEventTarget = null;
    }
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
  const WALLET_LOCAL_DISCONNECT_KEY = 'ix.wallet.localDisconnect';
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
    'event TransferExecuted(address indexed sender,address indexed recipient,uint256 amountSent,uint256 feeAmount,uint256 totalDebited)',
  ];

  // ----------------------------------------------------------------
  // Companion helper — guards against load-order timing.
  // companion.js registers window.IX.companion after wallet.js runs,
  // but all calls happen on user interaction, so it is always available by then.
  // ----------------------------------------------------------------
  const CONFIDENCE_BY_STATE = {
    'confirmed':       'confirmed',
    'failed':          'confirmed',
    'submitted':       'probable',
    'pending':         'probable',
    'outcome_unknown': 'uncertain',
    'unclear':         'uncertain',
  };

  function normalizeSemanticSeverity(severity) {
    if (!severity) return null;
    if (severity === 'error' || severity === 'critical') return 'critical';
    if (severity === 'warning' || severity === 'advisory') return 'advisory';
    if (severity === 'blocking') return 'blocking';
    if (severity === 'pending') return 'pending';
    if (severity === 'neutral' || severity === 'ok') return severity;
    return null;
  }

  function confidenceForState(stateKey, detail) {
    if (detail && detail.confidence) return detail.confidence;
    return CONFIDENCE_BY_STATE[stateKey] || null;
  }

  function normalizeCompanionDetail(stateKey, detail) {
    if (!detail) return detail;
    const normalized = Object.assign({}, detail);
    normalized.severity = normalizeSemanticSeverity(detail.severity);
    normalized.confidence = confidenceForState(stateKey, detail);
    return normalized;
  }

  function companionState(stateKey, detail) {
    const normalizedDetail = normalizeCompanionDetail(stateKey, detail);
    if (window.IX && window.IX.companion) {
      window.IX.companion.setState(stateKey, normalizedDetail);
    }
    updateTelemetryFromTransferState(stateKey, normalizedDetail);
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
    'TRANSFERS_DISABLED':  { level: 'status',    rate: 'low',  summary: 'Standby' },
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
    'TRANSFERS_DISABLED':   [{ key: 'Status',   value: 'Contract transfers are paused. No wallet action required.' }],
    'failed':               [{ key: 'Recovery', value: 'Funds were not moved. Safe to retry.' }],
    'interrupted':          [{ key: 'Recovery', value: 'Session interrupted. Funds were not moved. Safe to retry.' }],
    'outcome_unknown':      [{ key: 'Recovery', value: 'Transaction status uncertain. Verify on the block explorer before retrying.' }],
  };

  function updateTelemetryFromTransferState(stateKey, detail) {
    if (!window.IX || !window.IX.telemetry) return;
    var tel = window.IX.telemetry;

    var sig = TELEMETRY_SIGNAL_MAP[stateKey] || { level: 'status', rate: 'low', summary: 'Active' };
    if (detail && detail.severity === 'critical') {
      sig = Object.assign({}, sig, { level: 'critical', rate: sig.rate || 'avg' });
    }
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
    if (detail && detail.confidence) {
      statusRows.push({
        key: 'Confidence',
        value: detail.confidence,
        level: detail.confidence === 'untrusted' ? 'critical'
          : detail.confidence === 'uncertain' ? 'elevated'
          : undefined,
      });
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
    walletMenu:     document.getElementById('walletMenu'),
    walletMenuTrigger: document.getElementById('walletMenuTrigger'),
    walletMenuPanel: document.getElementById('walletMenuPanel'),
    walletFullAddress: document.getElementById('walletFullAddress'),
    copyAddressBtn: document.getElementById('copyAddressBtn'),
    switchNetworkBtn: document.getElementById('switchNetworkBtn'),
    modulesMinimize: document.getElementById('modulesMinimize'),
    modulesClose:   document.getElementById('modulesClose'),
    portalMinimizedTray: document.getElementById('portalMinimizedTray'),
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
    networkNameDisplay:  document.getElementById('networkNameDisplay'),
    contractStatus:      document.getElementById('contractStatus'),
    networkStatus:       document.getElementById('networkStatus'),
    confirmTimeDisplay:  document.getElementById('confirmTimeDisplay'),
    rpcLatencyDisplay:   document.getElementById('rpcLatencyDisplay'),
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
    gasRow:       document.getElementById('gasRow'),
    gasRowToggle: document.getElementById('gasRowToggle'),
    gasRowDetail: document.getElementById('gasRowDetail'),
    gasLow:       document.getElementById('gasLow'),
    gasAvg:       document.getElementById('gasAvg'),
    gasHigh:      document.getElementById('gasHigh'),
    gasTrend:     document.getElementById('gasTrend'),
    gasSamples:   document.getElementById('gasSamples'),
    walletChoiceOverlay:      document.getElementById('walletChoiceOverlay'),
    walletChoiceClose:        document.getElementById('walletChoiceClose'),
    walletChoiceBackdrop:     document.getElementById('walletChoiceBackdrop'),
    walletChoiceMetaMask:     document.getElementById('walletChoiceMetaMask'),
    walletChoiceWalletConnect: document.getElementById('walletChoiceWalletConnect'),
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

  function isLocalWalletDisconnectRemembered() {
    return fullStorageRead(WALLET_LOCAL_DISCONNECT_KEY, false) === true;
  }

  function rememberLocalWalletDisconnect() {
    fullStorageWrite(WALLET_LOCAL_DISCONNECT_KEY, true);
  }

  function clearLocalWalletDisconnect() {
    try {
      localStorage.removeItem(WALLET_LOCAL_DISCONNECT_KEY);
    } catch (_) {
      // Storage persistence is optional; visible state still updates.
    }
  }

  function normalizeAddress(value) {
    const v = String(value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
    if (typeof ethers !== 'undefined' && ethers.getAddress) {
      try {
        return ethers.getAddress(v);
      } catch (_) {
        return null; // invalid EIP-55 checksum — treat as unresolvable
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

  function setStatus(msg, severity) {
    if (els.txStatus) els.txStatus.textContent = msg;
    setElementSeverity(els.txStatus, severity || null);
  }

  function setElementSeverity(el, severity) {
    if (!el) return;
    el.classList.remove('is-error', 'is-warning', 'is-advisory', 'is-blocking', 'is-critical', 'is-pending', 'is-live');
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

  // QA diagnostic helper: extract serializable fields from a wallet/provider error.
  // Used to surface raw error detail on mobile where console is not accessible.
  function serializeWalletError(err) {
    if (!err) return { empty: true };
    var safe = {};
    // Allowlist: capture known provider/ethers error fields by name.
    ['name', 'code', 'message', 'shortMessage', 'reason', 'data', 'info', 'cause', 'error', 'payload'].forEach(function (key) {
      try { if (err[key] !== undefined) safe[key] = String(err[key]); } catch (_) {}
    });
    // Enumerable own keys (may be empty for native Error objects).
    try { safe.keys = Object.keys(err); } catch (_) { safe.keys = []; }
    // All own property names including non-enumerable (catches Error.message, .stack, etc.).
    try {
      var ownNames = Object.getOwnPropertyNames(err);
      safe.ownPropertyNames = ownNames;
      ownNames.forEach(function (key) {
        if (safe[key] === undefined) {
          try {
            var val = err[key];
            if (val !== undefined && val !== null) {
              safe[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
            }
          } catch (_) {}
        }
      });
    } catch (_) {}
    // String coercions — catch toString() overrides and prototype tag.
    try { safe.errString       = String(err); } catch (_) {}
    try { safe.toStringTag     = Object.prototype.toString.call(err); } catch (_) {}
    return safe;
  }

  // QA: render a fixed-position overlay with the raw wallet error.
  // Fires on every pre-broadcast transferWithFee() failure so the error is
  // visible regardless of panel state, scroll position, or exitReview timing.
  // Remove by reloading the page.
  function renderPreBroadcastDiag(err, label) {
    var walletDiag = serializeWalletError(err);
    var diagText = [
      'QA WALLET ERROR — ' + (label || 'pre-broadcast'),
      'build: 71f429d / qa-overlay: 699a081 / ' + new Date().toISOString(),
      '',
      JSON.stringify(walletDiag, null, 2),
    ].join('\n');

    var existing = document.getElementById('ix-qa-diag');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ix-qa-diag';
    overlay.setAttribute('aria-live', 'assertive');
    overlay.style.cssText = [
      'position:fixed',
      'bottom:0',
      'left:0',
      'right:0',
      'max-height:55vh',
      'overflow-y:auto',
      'background:#1a0000',
      'border-top:3px solid #f33',
      'z-index:2147483647',
      'padding:0.75rem 1rem',
      'box-sizing:border-box',
    ].join(';');

    var pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;font-size:10px;line-height:1.4;color:#f77;margin:0;';
    pre.textContent = diagText;
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
  }

  // Query the ImplicitEx contract for a matching TransferExecuted event in the
  // last ~10 minutes of Polygon blocks, using a fresh read-only RPC provider
  // independent of the wallet provider (which may be in a bad state).
  // Returns { found:true, txHash, explorerUrl, blockNumber } or { found:false }.
  async function reconcileInterruptedTransfer(sender, recipient, rawAmount, contractAddress, chainConfig) {
    try {
      const rpcProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      const currentBlock = await rpcProvider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1200); // ~30 min at 1.5s/block; wider window reduces false negatives from RPC lag or delayed mobile callback
      const contract = new ethers.Contract(contractAddress, IMPLICITEX_ABI, rpcProvider);
      const events = await contract.queryFilter(
        contract.filters.TransferExecuted(sender, recipient),
        fromBlock,
        currentBlock
      );
      const senderLc    = sender.toLowerCase();
      const recipientLc = recipient.toLowerCase();
      const rawAmountBn = BigInt(rawAmount);
      const match = events.find(function (ev) {
        return ev.args.sender.toLowerCase()    === senderLc    &&
               ev.args.recipient.toLowerCase() === recipientLc &&
               BigInt(ev.args.amountSent)      === rawAmountBn;
      });
      if (match) {
        return {
          found:       true,
          txHash:      match.transactionHash,
          explorerUrl: chainConfig.explorerUrl + '/tx/' + match.transactionHash,
          blockNumber: match.blockNumber,
        };
      }
      return { found: false };
    } catch (err) {
      return { found: false, reconError: err && err.message };
    }
  }

  var IX_QA_BUILD = 'd34d5e2';
  var IX_QA_LS_KEY = 'ix_qa_last_wallet_error';

  // Write a diagnostic snapshot to localStorage before UI cleanup can remove it.
  // Survives page reload and form reset — readable even if the overlay flickers away.
  function persistWalletDiag(stage, err, extra) {
    try {
      var snapshot = {
        build:            IX_QA_BUILD,
        timestamp:        new Date().toISOString(),
        stage:            stage,
        account:          state && state.address,
        chainId:          state && state.chainId,
        timeline:         state && state.transferTimeline && JSON.parse(JSON.stringify(state.transferTimeline)),
        err:              err ? serializeWalletError(err) : null,
      };
      if (extra) {
        Object.keys(extra).forEach(function (k) { snapshot[k] = extra[k]; });
      }
      localStorage.setItem(IX_QA_LS_KEY, JSON.stringify(snapshot, null, 2));
    } catch (_) { /* localStorage unavailable — silently skip */ }
  }

  // On page load: if a persisted diagnostic exists, render a fixed overlay with
  // Copy and Clear buttons so it can be captured even after a page reload.
  function renderPersistedWalletDiag() {
    var raw;
    try { raw = localStorage.getItem(IX_QA_LS_KEY); } catch (_) { return; }
    if (!raw) return;

    var existing = document.getElementById('ix-qa-diag');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ix-qa-diag';
    overlay.style.cssText = [
      'position:fixed',
      'bottom:0',
      'left:0',
      'right:0',
      'max-height:55vh',
      'overflow-y:auto',
      'background:#1a0000',
      'border-top:3px solid #f33',
      'z-index:2147483647',
      'padding:0.75rem 1rem 1rem',
      'box-sizing:border-box',
    ].join(';');

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;flex-wrap:wrap;';

    var label = document.createElement('span');
    label.style.cssText = 'color:#f77;font-size:11px;font-weight:bold;flex:1 1 auto;';
    label.textContent = 'QA WALLET DIAGNOSTIC (persisted)';

    var copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.style.cssText = 'font-size:10px;padding:2px 8px;background:#333;color:#f77;border:1px solid #f33;border-radius:3px;cursor:pointer;flex-shrink:0;';
    copyBtn.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(raw).then(function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
        });
      } catch (_) {}
    });

    var clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = 'font-size:10px;padding:2px 8px;background:#333;color:#aaa;border:1px solid #555;border-radius:3px;cursor:pointer;flex-shrink:0;';
    clearBtn.addEventListener('click', function () {
      try { localStorage.removeItem(IX_QA_LS_KEY); } catch (_) {}
      overlay.remove();
    });

    header.appendChild(label);
    header.appendChild(copyBtn);
    header.appendChild(clearBtn);

    var pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-all;font-size:10px;line-height:1.4;color:#f77;margin:0;';
    pre.textContent = raw;

    overlay.appendChild(header);
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
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
    const armed = acknowledged && isLiveTransferChain(state.chainId);

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

  function setBalanceDisplay(text) {
    if (els.usdcBalance) els.usdcBalance.textContent = text;
  }

  function resetBalanceDisplay(label = 'Not connected') {
    state.usdcBalanceRaw = null;
    setBalanceDisplay(label);
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
    if (els.txPreview) {
      els.txPreview.setAttribute('hidden', '');
      els.txPreview.classList.remove('tx-preview--blocked');
    }
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
      renderListItem('Confirm network with recipient', 'advisory'),
    ];

    if (
      state.recipientCodeWarning &&
      state.recipientCodeWarning.address &&
      state.recipientCodeWarning.address.toLowerCase() === normalized.toLowerCase() &&
      state.recipientCodeWarning.chainId === state.chainId &&
      state.recipientCodeWarning.isContract
    ) {
      items.push(renderListItem('Smart contract address detected — continue only if it can receive and manage USDC', 'advisory'));
    }

    if (matches.length > 0 || bookEntry) {
      const count = Math.max(matches.length, Number(bookEntry && bookEntry.transferCount || 0));
      items.splice(1, 0, renderListItem(`Known locally · ${count} prior transfer${count === 1 ? '' : 's'}`, 'ok'));
    } else {
      items.splice(1, 0, renderListItem('New to this browser history', 'advisory'));
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
    const draftStarted = !!recipient || !!amountStr;
    const walletConnected = !!(state.connected || state.address);
    const validRecipient = validateRecipient(recipient) === '';
    const amountFloat = parseFloat(amountStr);
    const validAmount = !!amountStr && !isNaN(amountFloat) && amountFloat > 0;
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const networkState = getNetworkState();
    const polygonConnected = walletConnected && isPolygonMainnet(state.chainId);
    const transfersDisabled = networkState === 'TRANSFERS_DISABLED';
    const contractConfigured = !!(chainConfig && chainConfig.contractAddress);
    const summary = validRecipient && validAmount && chainConfig
      ? safeBuildDraftSummary(recipient, amountStr, amountFloat, chainConfig)
      : null;
    const aboveMinimum = validAmount && (!chainConfig || !chainConfig.minTransferUsdc || amountFloat >= chainConfig.minTransferUsdc);
    const minimumLabel = chainConfig && chainConfig.minTransferUsdc
      ? `Amount below ${chainConfig.minTransferUsdc} USDC minimum`
      : 'Amount must be above the configured minimum';

    const items = [
      { label: walletConnected ? 'Wallet connected' : 'Wallet not connected', status: walletConnected ? 'ok' : 'neutral' },
      { label: !walletConnected ? 'Network pending' : polygonConnected ? 'Polygon connected' : 'Switch to Polygon', status: !walletConnected ? 'neutral' : polygonConnected ? 'ok' : 'advisory' },
      { label: !walletConnected ? 'Contract pending' : contractConfigured ? 'Contract configured' : 'Contract unavailable', status: !walletConnected ? 'neutral' : contractConfigured ? 'ok' : 'critical' },
      { label: transfersDisabled ? 'Transfers paused by launch gate' : networkState === 'READY' ? 'Transfers enabled' : 'Transfer gate pending', status: transfersDisabled ? 'advisory' : networkState === 'READY' ? 'ok' : 'neutral' },
    ];

    if (!draftStarted) return items;

    items.push(
      { label: validRecipient ? 'Recipient valid' : 'Recipient not entered', status: validRecipient ? 'ok' : 'neutral' },
      { label: validAmount ? 'Recipient amount entered' : 'Recipient amount not entered', status: validAmount ? 'ok' : 'neutral' },
    );

    if (amountStr) {
      items.push({ label: aboveMinimum ? 'Above minimum' : minimumLabel, status: validAmount ? 'blocking' : 'neutral' });
    }

    if (validRecipient && validAmount) {
      items.push(
        { label: summary && summary.balanceKnown ? 'Balance loaded' : 'Balance loading', status: summary && summary.balanceKnown ? 'ok' : 'pending' },
        { label: summary && !summary.insufficientBalance ? 'Balance covers total debit' : 'Balance must cover recipient amount plus fee', status: summary && !summary.insufficientBalance ? 'ok' : 'blocking' },
        { label: summary ? 'Amount preview ready' : 'Amount preview pending', status: summary ? 'ok' : 'pending' },
      );
      if (networkState === 'READY') {
        items.push({ label: 'Execution checks run before wallet prompt', status: 'advisory' });
      }
    }

    return items;
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
      items.push(renderListItem('Transfers paused', 'advisory'));
    } else {
      items.push(renderListItem('Contract state unverified', 'advisory'));
    }

    if (result.previewOk) {
      if (result.balance >= result.totalDebit) {
        items.push(renderListItem('Balance covers total debit', 'ok'));
      } else {
        items.push(renderListItem('Insufficient balance', 'critical'));
      }

      if (result.needsApproval) {
        items.push(renderListItem('Allowance insufficient — approval required', 'advisory'));
      } else if (result.allowance !== null) {
        items.push(renderListItem('Allowance sufficient', 'ok'));
      }

      if (result.gasOk === true) {
        items.push(renderListItem('Gas estimated', 'ok'));
      } else if (result.gasOk === false) {
        items.push(renderListItem('Gas estimate failed', 'critical'));
      }
      // gasOk === null: gas check skipped because approval is required first
    }

    // Verdict row — visually separated by CSS border-top
    const verdictStatus = (result.verdict === 'OK') ? 'ok'
      : (result.verdict === 'INSUFFICIENT_BALANCE' || result.verdict === 'GAS_FAILED') ? 'critical'
      : (result.verdict === 'PAUSED') ? 'advisory'
      : 'advisory';

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

    if (els.txPreview) els.txPreview.classList.toggle('tx-preview--blocked', mode === 'Blocked');
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
    const json = JSON.stringify(packet, null, 2) + '\n';
    const hash = packet.transactionHash || receipt.id || 'local';
    const filename = `implicitex-proof-${String(hash).slice(0, 12)}.json`;

    // Attempt blob download (desktop browsers + some mobile)
    let downloaded = false;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      downloaded = true;
    } catch (_) {
      downloaded = false;
    }

    if (downloaded) return;

    // Fallback — copy JSON to clipboard (MetaMask in-app browser, iOS WebViews)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        setStatus('Proof packet copied to clipboard.');
      }).catch(function () {
        setStatus('Download unavailable. Open in a browser to export the proof packet.');
      });
    } else {
      setStatus('Download unavailable. Open in a browser to export the proof packet.');
    }
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
        severity:   'advisory',
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
          severity:   unresolvedState === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? 'advisory' : undefined,
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
        severity:   'advisory',
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
    const validNetwork   = state.connected && isConfiguredChain(state.chainId);

    if (!validRecipient || !validAmount || !validNetwork) {
      hidePreview();
      // resetReviewAcknowledgement unchecks the checkbox — stale ack must not
      // persist across blocked states and re-arm the button on the next valid input.
      resetReviewAcknowledgement();
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
      resetReviewAcknowledgement();
      setDraftButton(currentButtonLabel(), true);
      return;
    }

    if (!summary.balanceKnown) {
      renderTransferSummary(summary, {
        mode: 'Checking balance',
        note: 'Checking USDC balance before review.',
      });
      setTransferNote('Checking USDC balance before review.');
      resetReviewAcknowledgement();
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
      resetReviewAcknowledgement();
      setDraftButton('Insufficient Balance', true);
      return;
    }

    const minUsdc = chainConfig && chainConfig.minTransferUsdc;
    if (minUsdc && amountFloat < minUsdc) {
      renderTransferSummary(summary, {
        label: 'Transfer Blocked',
        mode: 'Blocked',
        note: `Minimum transfer is ${minUsdc} USDC.`,
      });
      setStatus(`Minimum transfer is ${minUsdc} USDC.`);
      setTransferNote(`Enter ${minUsdc} USDC or more to continue.`);
      resetReviewAcknowledgement();
      setDraftButton('Below Minimum', true);
      return;
    }

    renderTransferSummary(summary, {
      label: 'Transfer Preview',
      mode: 'Live',
      note: 'Amount preview only. Recipient, network, pause state, contract, USDC token, balance, and allowance are checked again before any wallet prompt.',
    });
    setStatus('');
    setTransferNote('');

    // Gate guard: preview renders so the user can see the transfer summary,
    // but the ack checkbox and armed button are suppressed while transfers are
    // disabled. The click-time guard in enterReview() is a second layer — this
    // prevents the visual contradiction of an armed button alongside an amber
    // "Transfers paused by launch gate" preflight bullet.
    if (getNetworkState() === 'TRANSFERS_DISABLED') {
      setReviewAcknowledgementVisible(false);
      setDraftButton(currentButtonLabel(), true);
      return;
    }

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

  // ----------------------------------------------------------------
  // Wallet menu (connected dropdown) — open/close helpers
  // ----------------------------------------------------------------
  function openWalletMenu() {
    if (!els.walletMenu || !els.walletMenuPanel || !els.walletMenuTrigger) return;
    els.walletMenu.classList.add('is-open');
    els.walletMenuTrigger.setAttribute('aria-expanded', 'true');
    els.walletMenuPanel.removeAttribute('hidden');
  }

  function closeWalletMenu() {
    if (!els.walletMenu || !els.walletMenuPanel || !els.walletMenuTrigger) return;
    els.walletMenu.classList.remove('is-open');
    els.walletMenuTrigger.setAttribute('aria-expanded', 'false');
    els.walletMenuPanel.setAttribute('hidden', '');
  }

  function showWalletMenu(address) {
    if (!els.walletMenu) return;
    if (els.walletAddr) els.walletAddr.textContent = shortAddr(address || state.address);
    if (els.walletFullAddress) els.walletFullAddress.textContent = address || state.address || '';
    els.walletMenu.removeAttribute('hidden');
    if (els.connectBtn) els.connectBtn.hidden = true;
  }

  function hideWalletMenuEl() {
    if (!els.walletMenu) return;
    closeWalletMenu();
    els.walletMenu.setAttribute('hidden', '');
    if (els.connectBtn) {
      els.connectBtn.hidden = false;
      els.connectBtn.disabled = false;
      els.connectBtn.textContent = 'Connect Wallet';
      els.connectBtn.classList.remove('connected');
    }
  }

  // Show/hide the "Switch to Polygon" recovery button inside the dropdown.
  function setWalletMenuNetworkRecovery(show) {
    if (els.switchNetworkBtn) {
      if (show) {
        els.switchNetworkBtn.removeAttribute('hidden');
      } else {
        els.switchNetworkBtn.setAttribute('hidden', '');
      }
    }
  }

  // ----------------------------------------------------------------
  // Portal minimize/restore helpers
  // ----------------------------------------------------------------
  function minimizePortal() {
    if (!els.modules) return;
    els.modules.classList.add('is-minimized');
    if (els.portalMinimizedTray) els.portalMinimizedTray.removeAttribute('hidden');
    if (els.modulesMinimize) {
      els.modulesMinimize.setAttribute('aria-expanded', 'false');
      els.modulesMinimize.setAttribute('aria-label', 'Expand transfer portal');
    }
  }

  function restorePortal() {
    if (!els.modules) return;
    // If portal was mounted minimized (default state), first expansion triggers
    // full page activation — hero recedes, portal-active asserts.
    // Portal is above the hero; no need to hide other sections.
    if (!document.body.classList.contains('portal-active')) {
      document.body.classList.add('portal-active');
    }
    els.modules.classList.remove('is-minimized');
    if (els.portalMinimizedTray) els.portalMinimizedTray.setAttribute('hidden', '');
    if (els.modulesMinimize) {
      els.modulesMinimize.setAttribute('aria-expanded', 'true');
      els.modulesMinimize.setAttribute('aria-label', 'Collapse transfer portal');
    }
  }

  // Mount portal visible but collapsed — default page-load state.
  // howItWorks stays visible; portal-active NOT set until user expands.
  // Passive wallet reconnect does not auto-expand.
  function mountPortalMinimized() {
    if (!els.modules) return;
    if (els.portalControls) els.portalControls.removeAttribute('hidden');
    els.modules.removeAttribute('hidden');
    minimizePortal();
  }

  function closePortalWithAnimation() {
    if (!els.modules) return;
    restorePortal();
    els.modules.classList.add('is-closing');
    setTimeout(() => {
      if (els.modules) {
        els.modules.classList.remove('is-closing');
        hideTransferModules();
      }
    }, 220);
  }

  function handleConnectFailure(message, severity = null) {
    state.connected = false;
    state.address = null;
    state.provider = null;
    state.chainId = null;
    state.connecting = false;
    walletRuntime.provider = null;
    walletRuntime.source = null;

    closeWalletMenu();
    hideWalletMenuEl();
    setNavStatus(message);
    setElementSeverity(els.navStatus, severity);
    setElementSeverity(els.networkBadge, null);
    setStatus(message);
    dispatchWalletStateChanged();

    // User-cancellation messages carry no actionable information after a few
    // seconds. Clear them so the first-time visitor doesn't read a permanent
    // "Wallet connection rejected." and conclude something is broken.
    if (message === 'Wallet connection rejected.') {
      setTimeout(function() {
        if (els.txStatus && els.txStatus.textContent === 'Wallet connection rejected.') {
          setStatus('');
        }
      }, 4000);
    }
  }

  // ----------------------------------------------------------------
  // Wallet choice overlay — shown when Connect is tapped without an
  // injected provider. Presents MetaMask and WalletConnect options.
  // ----------------------------------------------------------------
  function showWalletChoice() {
    if (els.walletChoiceOverlay) els.walletChoiceOverlay.removeAttribute('hidden');
    resetConnectButton();
  }

  function hideWalletChoice() {
    if (els.walletChoiceOverlay) els.walletChoiceOverlay.setAttribute('hidden', '');
  }

  function isConfiguredChain(chainId) {
    return !!(chainId && window.IX_CHAINS && window.IX_CHAINS[chainId]);
  }

  function isPolygonMainnet(chainId) {
    return normalizeChainId(chainId) === POLYGON_MAINNET_CHAIN_ID;
  }

  function isConnectedToPolygon() {
    return !!(state.connected && isPolygonMainnet(state.chainId));
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
    if (!state.connected) return 'Connect Wallet to Continue';
    const netState = getNetworkState();
    if (netState === 'WRONG_NETWORK' || netState === 'CONTRACT_UNAVAILABLE') return 'Switch to Polygon';
    if (netState === 'TRANSFERS_DISABLED') return 'Transfers disabled';
    if (state.txPhase === 'SIMULATING') return 'Checking…';
    return 'Review Transfer';
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
    if (!state.connected) {
      setStatus('Connect a wallet before reviewing this transfer.');
      return;
    }
    if (!isLiveTransferChain(state.chainId)) {
      // TRANSFERS_DISABLED: on a configured chain but transfers are paused.
      // Standby — do not show wrong-network error or prompt to switch networks.
      if (isConfiguredChain(state.chainId)) {
        setStatus('Transfers are currently paused on this network.');
        return;
      }
      // Genuinely wrong network — guide the user to switch.
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
      resetReviewAcknowledgement();
      setDraftButton('Insufficient Balance', true);
      renderTransferSummary(summary, {
        label: 'Transfer Blocked',
        mode: 'Blocked',
        note: `Increase USDC balance or lower amount before review. Have ${formatUsdcRaw(summary.balance, 2)} USDC, need ${formatUsdcRaw(summary.totalDebit, 2)} USDC.`,
      });
      return;
    }

    const minUsdc = chainConfig && chainConfig.minTransferUsdc;
    if (minUsdc && amountFloat < minUsdc) {
      setStatus(`Minimum transfer is ${minUsdc} USDC.`);
      setTransferNote(`Enter ${minUsdc} USDC or more to continue.`);
      resetReviewAcknowledgement();
      setDraftButton('Below Minimum', true);
      renderTransferSummary(summary, {
        label: 'Transfer Blocked',
        mode: 'Blocked',
        note: `Minimum transfer is ${minUsdc} USDC.`,
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
    if (window.IX && window.IX.track) {
      window.IX.track('amount_entered', { amount_bucket: window.IX._bucketAmount(amountFloat) });
      window.IX.track('review_reached');
    }
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
   * No wallet → connect(); DRAFT → enterReview(); REVIEW_READY → submitTransfer().
   */
  async function handleTxAction() {
    if (!state.connected) {
      connect();
      return;
    }
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
    if (window.IX && window.IX.track) window.IX.track('portal_opened');

    // Portal is always above the hero — no geometry conflict, no need to hide other sections.
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

  function openTransferPortal() {
    showTransferModules(true);
  }

  // Nav button action: expand the already-loaded portal.
  // If collapsed → expand. If dismissed → restore and expand. If expanded → scroll to it.
  function focusTransferPortal() {
    if (!els.modules) return;
    if (els.modules.hasAttribute('hidden')) {
      // Portal was dismissed — restore and expand fully
      if (els.portalControls) els.portalControls.removeAttribute('hidden');
      els.modules.removeAttribute('hidden');
      document.body.classList.add('portal-active');
      if (els.modulesMinimize) {
        els.modulesMinimize.setAttribute('aria-expanded', 'true');
        els.modulesMinimize.setAttribute('aria-label', 'Collapse transfer portal');
      }
    } else if (els.modules.classList.contains('is-minimized')) {
      // Portal is collapsed — expand it
      restorePortal();
    }
    // In all cases, scroll portal into view
    setTimeout(() => {
      els.modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function hideTransferModules() {
    if (els.modules) els.modules.setAttribute('hidden', '');
    if (els.portalControls) els.portalControls.setAttribute('hidden', '');
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
    } else if (state.connected && isConfiguredChain(state.chainId)) {
      // Connected on a known chain (e.g. Polygon pre-live) — scroll to the standby panel.
      showTransferModules(true);
    } else if (state.connected) {
      await switchToPolygonMainnet();
    } else {
      showTransferModules(true);
      connect({ forcePermission: state.userDisconnected });
    }
  }

  async function revokeWalletPermission(provider) {
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

  async function readAuthorizedAccounts(provider) {
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
      severity:   stillAuthorized ? 'advisory' : null,
      autoOpen:   stillAuthorized,
    });
  }

  // Disconnect — clears local session state and, for user-initiated disconnect,
  // asks MetaMask to revoke this site's account permission when supported.
  async function disconnect(options = {}) {
    const revokeProvider = options.revokeProvider === true;
    const activeProvider = getWalletProvider();

    if (state.networkPollTimer) {
      clearInterval(state.networkPollTimer);
      state.networkPollTimer = null;
    }
    stopWalletChainWatcher();

    if (activeProvider) {
      unbindActiveProviderEvents(activeProvider);
    }

    // Clear session state before any async so focus/visibility events that call
    // syncProviderState cannot re-render connected UI during the revoke wait.
    state.connected = false;
    state.address   = null;
    state.provider  = null;
    state.chainId   = null;
    state.connecting = false;
    state.userDisconnected = revokeProvider;
    activeFlowId = null; // invalidate any running transfer flow

    if (revokeProvider) {
      rememberLocalWalletDisconnect();
    }

    // Capture source before clearActiveProvider() nulls it.
    const wasWalletConnect = walletRuntime.source === 'walletconnect';

    // Terminate WalletConnect relay session before local cleanup.
    // Clearing walletRuntime.provider alone is not sufficient — the relay
    // session remains alive on the WC side until explicitly closed.
    // Failure here must not block local UI reset.
    if (wasWalletConnect && window.IX_WC) {
      try {
        await window.IX_WC.disconnect();
      } catch (err) {
        console.warn('[ImplicitEx] WalletConnect relay disconnect failed', err);
      }
    }

    let providerChecked = false;
    let stillAuthorized = false;
    if (revokeProvider && !wasWalletConnect) await revokeWalletPermission(activeProvider);

    closeWalletMenu();
    hideWalletMenuEl();
    updateSenderDisplay();
    setNavStatus('');
    setElementSeverity(els.navStatus, null);
    if (els.networkBadge) {
      els.networkBadge.textContent = 'Polygon live';
      setElementSeverity(els.networkBadge, null);
    }
    resetBalanceDisplay();
    clearTransferForm();
    hidePreview();
    hideTransferModules();
    if (revokeProvider && !wasWalletConnect) {
      try {
        const accounts = await readAuthorizedAccounts(activeProvider);
        providerChecked = true;
        stillAuthorized = !!(accounts && accounts.length > 0);
      } catch (_) {
        providerChecked = false;
      }
    }

    clearActiveProvider();

    if (wasWalletConnect) {
      // WalletConnect disconnect: calm neutral state, no MetaMask-specific copy.
      setStatus('');
      setNavStatus('');
      if (window.IX && window.IX.companion) window.IX.companion.reset();
    } else if (revokeProvider) {
      setDisconnectedPresentation({ stillAuthorized, providerChecked });
    } else if (window.IX && window.IX.companion) {
      window.IX.companion.reset();
    }
    dispatchWalletStateChanged();
  }

  function applyConnectedPresentation(options = {}) {
    const shouldScroll = options.shouldScroll === true;
    // shouldOpen: only open the portal when the user explicitly requested it
    // (Connect Wallet click, Transfer Portal click, #transfer hash route).
    // Passive reconnection on page load must NOT force the portal open.
    const shouldOpen = options.shouldOpen === true;
    const short = shortAddr(state.address);
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const transfersEnabled = chainConfig && chainConfig.transfersEnabled;
    const eventVal = options.eventVal || `Address: ${shortAddr(state.address)}`;

    showWalletMenu(state.address);
    setWalletMenuNetworkRecovery(false);
    updateSenderDisplay();
    setNavStatus(chainLabel(state.chainId));
    setElementSeverity(els.navStatus, transfersEnabled ? 'live' : null);
    if (els.networkBadge) {
      els.networkBadge.textContent = chainLabel(state.chainId);
      setElementSeverity(els.networkBadge, transfersEnabled ? 'live' : null);
    }
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.textContent = currentButtonLabel();
    }
    setStatus('');
    setTransferNote(transfersEnabled ? '' : 'Preview mode — live transfers not yet enabled.');
    updateNetworkModuleRows(chainConfig);
    if (shouldOpen) showTransferModules(shouldScroll);

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
    const stateVal = configuredChain ? 'Contract unavailable' : 'Wrong network';
    const statusLine = configuredChain
      ? 'Contract not deployed on this network'
      : 'Wrong network · Switch to Polygon Mainnet';
    const eventVal = configuredChain
      ? 'Contract not deployed on this network.'
      : 'Wallet connected on unsupported network.';

    showWalletMenu(state.address);
    // Show "Switch to Polygon" recovery in the dropdown only when on wrong network.
    setWalletMenuNetworkRecovery(state.chainId !== POLYGON_MAINNET_CHAIN_ID);
    updateSenderDisplay();
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
    if (state.chainId !== POLYGON_MAINNET_CHAIN_ID) {
      setStatus('Switch MetaMask to Polygon Mainnet before sending USDC.');
    } else {
      setStatus('');
    }

    companionState('WRONG_NETWORK', {
      statusLine,
      stateVal,
      fundsVal:   'No active transaction',
      networkVal: networkLabel,
      eventVal,
      actionVal:  state.chainId !== POLYGON_MAINNET_CHAIN_ID
        ? 'Use Switch to Polygon, or switch MetaMask to Polygon Mainnet before sending USDC.'
        : 'No wallet action required.',
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

    // No wallet connected — nothing to render. Return early so focus/visibility
    // sync events do not overwrite the correct disconnected UI with connected state.
    if (netState === 'DISCONNECTED') return;

    // Wrong network or no contract — hide the transfer panel, show guidance.
    if (netState === 'WRONG_NETWORK' || netState === 'CONTRACT_UNAVAILABLE') {
      applyWrongNetworkPresentation();
      resetBalanceDisplay(netState === 'WRONG_NETWORK' ? 'Switch to Polygon' : 'Unavailable on this network');
      dispatchWalletStateChanged();
      return;
    }

    // TRANSFERS_DISABLED or READY — update the connected-state UI.
    // shouldOpen propagates only from explicit user actions (Connect Wallet click).
    // Passive reconnection on page load must NOT force the portal open.
    const eventVal = options.eventVal;
    applyConnectedPresentation({ shouldScroll: options.shouldScroll, shouldOpen: options.shouldOpen, eventVal });

    refreshUsdcBalance();

    if (netState === 'READY') {
      updatePreview();
      const recipient = (els.txRecipient && els.txRecipient.value.trim()) || '';
      if (validateRecipient(recipient) === '') {
        refreshRecipientCodeWarning(recipient);
      } else {
        state.recipientCodeWarning = null;
      }
    } else {
      // TRANSFERS_DISABLED — balance readback is allowed, execution remains disabled.
      updatePreview();
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

    if (!hasInjectedProvider()) {
      // No injected provider — MetaMask extension absent or mobile browser.
      // Show wallet-choice overlay. WalletConnect button calls IX_WC.init().
      showWalletChoice();
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

      // Injected path: provider is window.ethereum, confirmed present above.
      setActiveProvider(window.ethereum, 'injected');
      state.connected = true;
      state.address = accounts[0];
      state.provider = walletRuntime.provider;
      state.userDisconnected = false;
      clearLocalWalletDisconnect();

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
    if (window.IX && window.IX.track) window.IX.track('wallet_connected', { chain: state.chainId });
    // User explicitly clicked Connect Wallet — open the portal.
    applyCurrentNetworkPresentation({ shouldScroll: true, shouldOpen: true });

    pollNetworkData();
  }

  async function hydrateAuthorizedInjectedWallet() {
    if (!hasInjectedProvider()) return false;
    if (isLocalWalletDisconnectRemembered()) {
      state.userDisconnected = true;
      return false;
    }

    let accounts;
    try {
      accounts = await window.ethereum.request({ method: 'eth_accounts' });
    } catch (_) {
      return false;
    }

    if (!accounts || !accounts[0]) return false;

    setActiveProvider(window.ethereum, 'injected');
    state.connected = true;
    state.address = accounts[0];
    state.provider = walletRuntime.provider;
    state.userDisconnected = false;
    clearLocalWalletDisconnect();

    try {
      const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
      state.chainId = normalizeChainId(chainHex);
    } catch (_) {
      state.chainId = null;
    }

    startWalletChainWatcher();
    applyCurrentNetworkPresentation({
      shouldScroll: false,
      eventVal: `Authorized wallet restored: ${shortAddr(state.address)}.`,
    });
    pollNetworkData();
    return true;
  }

  // ----------------------------------------------------------------
  // Fee calculation
  // ----------------------------------------------------------------
  function calcFee(amount) {
    // 1% platform fee, floored to 6 decimal places for USDC display.
    return Math.floor(amount * DEMO_FEE_RATE * 1_000_000) / 1_000_000;
  }

  if (els.amtIn) {
    els.amtIn.addEventListener('input', function () {
      resetTransferTimelineOnDraftEdit();
      const val = parseFloat(this.value);
      if (!isNaN(val) && val > 0) {
        const fee = calcFee(val);
        if (els.feeDisplay) els.feeDisplay.textContent = fee.toFixed(6) + ' USDC';
      } else {
        if (els.feeDisplay) els.feeDisplay.textContent = '—';
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
    if (typeof ethers !== 'undefined' && ethers.getAddress) {
      try {
        ethers.getAddress(v);
      } catch (_) {
        return 'Invalid address checksum. Try copying the address again from its original source.';
      }
    }
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
      // Checksum error: explain the mixed-case issue and offer one-tap lowercase fix.
      if (result.indexOf('checksum') !== -1 && value && /^0x[0-9a-fA-F]{40}$/.test(value.trim())) {
        const lowercase = value.trim().toLowerCase();
        if (els.recipientError) {
          els.recipientError.textContent = '';
          const msg = document.createElement('span');
          msg.style.cssText = 'display:block;';
          msg.textContent = 'Invalid checksum. This address uses mixed uppercase and lowercase letters with an invalid capitalization pattern. Most wallet addresses can be safely entered in lowercase.';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Use lowercase address';
          btn.style.cssText = 'display:block;margin-top:0.35rem;background:none;border:none;padding:0;color:var(--accent);font:inherit;font-size:var(--size-sm);text-decoration:underline;cursor:pointer;letter-spacing:0.04em;';
          btn.addEventListener('click', function () {
            if (els.txRecipient) {
              els.txRecipient.value = lowercase;
              els.txRecipient.dispatchEvent(new Event('input', { bubbles: true }));
              els.txRecipient.focus();
            }
          });
          els.recipientError.appendChild(msg);
          els.recipientError.appendChild(btn);
        }
      } else {
        // All other errors — plain text
        if (els.recipientError) els.recipientError.textContent = result;
      }
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
    // Strip thousands-separator commas before validating (e.g. "10,000" → "10000").
    // Commas used as decimal separators (European locales) are not normalized —
    // the regex below will reject them, which is the safe default.
    const s = String(str).trim().replace(/,(?=\d{3}(?:[^,]|$))/g, '');
    if (!/^(?:\d+|\d+\.\d{1,6}|\.\d{1,6})$/.test(s)) {
      throw new Error(s.includes('.') && s.split('.')[1].length > 6
        ? 'INVALID_USDC_DECIMALS'
        : 'INVALID_AMOUNT_FORMAT');
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
   * Balance visibility is independent of transfer enablement. The row should
   * always show either a balance or the reason a balance cannot be read yet.
   */
  async function refreshUsdcBalance() {
    if (!state.address) {
      resetBalanceDisplay('Not connected');
      return;
    }
    if (!state.chainId || !window.IX_CHAINS) {
      resetBalanceDisplay('Network pending');
      return;
    }
    const chainConfig = window.IX_CHAINS[state.chainId];
    if (!chainConfig || !chainConfig.usdcAddress) {
      resetBalanceDisplay('Switch to Polygon');
      return;
    }
    if (typeof ethers === 'undefined') {
      resetBalanceDisplay('Balance unavailable');
      return;
    }

    setBalanceDisplay('Checking…');

    try {
      const provider = new ethers.BrowserProvider(getWalletProvider());
      const usdc = new ethers.Contract(chainConfig.usdcAddress, ERC20_ABI, provider);
      const bal = await usdc.balanceOf(state.address);
      state.usdcBalanceRaw = BigInt(bal);
      setBalanceDisplay(parseFloat(ethers.formatUnits(bal, 6)).toFixed(2) + ' USDC');
      updatePreview();
    } catch (_) {
      // First attempt failed (RPC hiccup on connect). Schedule one retry after 4 s.
      // If the retry also fails, leave balanceRaw null and show a visible
      // unavailable state. Do not spin — one retry is sufficient.
      state.usdcBalanceRaw = null;
      updatePreview();
      const expectedAddress     = state.address;
      const expectedChainConfig = chainConfig;
      setTimeout(async () => {
        // Guard: only retry if still on the same account and chain.
        if (!state.address || !state.chainId) return;
        if (state.address !== expectedAddress) return;
        const currentChainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
        if (currentChainConfig !== expectedChainConfig) return;
        try {
          const retryProvider = new ethers.BrowserProvider(getWalletProvider());
          const retryUsdc = new ethers.Contract(chainConfig.usdcAddress, ERC20_ABI, retryProvider);
          const retryBal = await retryUsdc.balanceOf(state.address);
          state.usdcBalanceRaw = BigInt(retryBal);
          setBalanceDisplay(parseFloat(ethers.formatUnits(retryBal, 6)).toFixed(2) + ' USDC');
          updatePreview();
        } catch (_retryErr) {
          resetBalanceDisplay('Balance unavailable');
        }
      }, 4000);
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
    if (window.IX && window.IX.track) window.IX.track('transfer_submitted');

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

    // receiptId, txBroadcast, broadcastHash, and diagnosticHold are hoisted above
    // the outer try so the inner catch and finally share the same binding.
    // (let declarations inside try {} are not accessible in finally {}.)
    let receiptId = null;
    let transferConfirmed = false;
    let txBroadcast = false;
    let broadcastHash = null;
    let diagnosticHold = false;

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
      if (isConfiguredChain(chainId)) {
        // On a known chain but transfers are paused — Standby, not a network error.
        setStatus('Transfers are currently paused on this network. No wallet action required.');
        applyCurrentNetworkPresentation();
      } else {
        // Genuinely wrong network — direct the user to switch.
        const supported = Object.values(window.IX_CHAINS || {})
          .filter(c => c.transfersEnabled && c.contractAddress)
          .map(c => c.name)
          .join(', ') || 'Polygon';
        setStatus(`Wrong network. Switch to ${supported} in your wallet.`);
        applyWrongNetworkPresentation();
      }
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
      if (err && err.message === 'INVALID_USDC_DECIMALS') {
        setStatus('USDC supports up to 6 decimal places. Example: 10.00');
      } else {
        setStatus('Use numbers only. Example: 10.00');
      }
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
        severity:   'advisory',
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
        // On mobile MetaMask's in-app browser the provider's internal state may
        // not have settled immediately after the approval receipt. A short pause
        // reduces the chance of -32603 on the next wallet prompt.
        if (/mobile/i.test(navigator.userAgent) && activeProvider && activeProvider.isMetaMask) {
          await new Promise(function (resolve) { setTimeout(resolve, 900); });
        }
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
          companionState(IX_TRANSFER_STATES.INTERRUPTED, {
            statusLine: 'Wallet request already pending in MetaMask.',
            stateVal:   'Interrupted',
            fundsVal:   'No — nothing was sent',
            networkVal: chainConfig.name,
            eventVal:   'MetaMask already has a pending request (-32002)',
            actionVal:  'Open MetaMask, finish or cancel the pending request, then retry.',
            autoOpen:   true,
          });
        } else {
          const rejected = errCode === 4001 || errCode === 5000 ||
            err.code === 'ACTION_REJECTED' ||
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

    // After approval confirms, poll the on-chain allowance before submitting
    // the transfer. This is inherently more reliable than a fixed sleep because
    // it gates on the actual condition the transfer requires. On mobile MetaMask's
    // in-app browser the provider's internal state may not have settled immediately
    // after the approval receipt, causing the next eth_sendTransaction to fail with
    // -32603. Polling the allowance gives the provider and chain state time to
    // propagate without overfitting to a particular hardware or network latency.
    if (needsApproval) {
      const ALLOWANCE_POLL_MS    = 500;
      const ALLOWANCE_TIMEOUT_MS = 10000;
      const pollStart = Date.now();
      let allowanceReady = false;
      while (!allowanceReady) {
        try {
          const currentAllowance = await usdc.allowance(state.address, contractAddress);
          if (BigInt(currentAllowance) >= totalDebit) {
            allowanceReady = true;
            break;
          }
        } catch (_) {
          // RPC read failure — keep polling
        }
        if (Date.now() - pollStart >= ALLOWANCE_TIMEOUT_MS) {
          // Allowance did not confirm within 10 s. Proceed anyway; if the
          // allowance truly hasn't propagated the contract will revert on-chain
          // with a classified error rather than a silent provider failure.
          break;
        }
        await new Promise(function (resolve) { setTimeout(resolve, ALLOWANCE_POLL_MS); });
      }
      assertFlowActive(); // account or network may have changed during the wait
    }

    // ---- Final wallet readiness gate ----
    // Runs after approval (if any) and allowance polling, before the funds-moving
    // prompt narrates or fires. Rehydrates the provider/signer so that any
    // provider state drift on mobile MetaMask is caught here rather than at
    // transferWithFee(). Each check returns early on failure; the outer finally
    // resets activeTransferFlow and exits review.
    {
      // 1. Confirm wallet account has not changed.
      let gateAccounts;
      try { gateAccounts = await activeProvider.request({ method: 'eth_accounts' }); } catch (_) { gateAccounts = null; }
      const gateSender = gateAccounts && gateAccounts[0];
      if (!gateSender || gateSender.toLowerCase() !== state.address.toLowerCase()) {
        clearTransferForm();
        state.address = gateSender || null;
        updateSenderDisplay();
        setTransferNote('');
        setStatus('Wallet account changed before transfer prompt. No funds moved. Reconnect and retry.');
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.INTERRUPTED,
          fundsMoved: false,
          lastKnownMessage: 'Wallet account changed before transfer prompt. No funds moved.',
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          'Account changed before transfer prompt'
        );
        companionState(IX_TRANSFER_STATES.INTERRUPTED, {
          statusLine: 'Wallet account changed before transfer prompt.',
          stateVal:   'Interrupted',
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   'Account mismatch at final readiness gate',
          actionVal:  'Reconnect wallet and re-enter transfer details.',
          autoOpen:   true,
        });
        return;
      }

      // 2. Confirm chain has not changed.
      let gateChainHex;
      try { gateChainHex = await activeProvider.request({ method: 'eth_chainId' }); } catch (_) { gateChainHex = null; }
      const gateChainId = gateChainHex ? normalizeChainId(gateChainHex) : null;
      if (!gateChainId || !isLiveTransferChain(gateChainId)) {
        setTransferNote('');
        setStatus('Network changed before transfer prompt. Switch back to Polygon and retry.');
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.INTERRUPTED,
          fundsMoved: false,
          lastKnownMessage: 'Network changed before transfer prompt. No funds moved.',
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          'Network changed before transfer prompt'
        );
        companionState(IX_TRANSFER_STATES.INTERRUPTED, {
          statusLine: 'Network changed before transfer prompt.',
          stateVal:   'Interrupted',
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   'Chain mismatch at final readiness gate',
          actionVal:  'Switch wallet back to Polygon and retry.',
          autoOpen:   true,
        });
        return;
      }

      // 3. Fresh signer + contracts for remaining checks and dry-run.
      //    On mobile MetaMask the original signer may reference stale provider state.
      //    If the fresh signer cannot be obtained, the provider is not ready —
      //    treat as INTERRUPTED rather than continuing with possibly stale state.
      let gateSigner;
      try {
        const gateProvider = new ethers.BrowserProvider(activeProvider);
        gateSigner = await gateProvider.getSigner(state.address);
      } catch (_) {
        setTransferNote('');
        setStatus('Wallet provider was not ready for the final confirmation. Reopen MetaMask and retry.');
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.INTERRUPTED,
          fundsMoved: false,
          lastKnownMessage: 'Wallet provider was not ready for the final confirmation. No funds moved.',
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          'Provider not ready at final readiness gate'
        );
        companionState(IX_TRANSFER_STATES.INTERRUPTED, {
          statusLine: 'Wallet provider was not ready for the final confirmation.',
          stateVal:   'Interrupted',
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   'Fresh signer unavailable at final gate',
          actionVal:  'Reopen MetaMask and retry.',
          autoOpen:   true,
        });
        return;
      }
      const gateUsdc       = new ethers.Contract(usdcAddress,     ERC20_ABI,     gateSigner);
      const gateImplicitex = new ethers.Contract(contractAddress, IMPLICITEX_ABI, gateSigner);

      // 4. Recheck on-chain allowance and balance.
      let gateAllowance = null;
      let gateBalance   = null;
      try {
        [gateAllowance, gateBalance] = await Promise.all([
          gateUsdc.allowance(state.address, contractAddress),
          gateUsdc.balanceOf(state.address),
        ]);
      } catch (_) { /* RPC read failure — proceed; contract will catch mismatch */ }

      if (gateAllowance !== null && BigInt(gateAllowance) < totalDebit) {
        setTransferNote('');
        setStatus('USDC allowance dropped before transfer prompt. Retry to re-authorize the correct amount.');
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.INTERRUPTED,
          fundsMoved: false,
          lastKnownMessage: 'USDC allowance insufficient at final readiness gate. No funds moved.',
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          'Allowance dropped before transfer prompt'
        );
        companionState(IX_TRANSFER_STATES.INTERRUPTED, {
          statusLine: 'USDC allowance insufficient at final readiness gate.',
          stateVal:   'Interrupted',
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   'Allowance below totalDebit at final gate',
          actionVal:  'Retry to authorize the correct amount.',
          autoOpen:   true,
        });
        return;
      }

      if (gateBalance !== null && BigInt(gateBalance) < totalDebit) {
        setTransferNote('');
        setStatus('USDC balance insufficient before transfer prompt. No funds moved.');
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.INTERRUPTED,
          fundsMoved: false,
          lastKnownMessage: 'USDC balance insufficient at final readiness gate. No funds moved.',
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          'Balance insufficient before transfer prompt'
        );
        companionState(IX_TRANSFER_STATES.INTERRUPTED, {
          statusLine: 'USDC balance insufficient at final readiness gate.',
          stateVal:   'Interrupted',
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   'Balance below totalDebit at final gate',
          actionVal:  'Top up your USDC balance before retrying.',
          autoOpen:   true,
        });
        return;
      }

      // QA: log gate allowance/balance values before dry-run (visible on desktop; use companion on mobile).
      console.log('[IX] final-gate allowance:', gateAllowance !== null ? ethers.formatUnits(BigInt(gateAllowance), 6) : 'unread', 'totalDebit:', ethers.formatUnits(totalDebit, 6));

      // 5. Dry-run via staticCall — catches contract revert before wallet prompt fires.
      try {
        await gateImplicitex.transferWithFee.staticCall(recipient, rawAmount);
      } catch (staticErr) {
        const explained = classifyTransferError(staticErr, { phase: 'preflight', broadcastKnown: false });
        setTransferNote('');
        setStatus(`${explained.title}. ${explained.retryGuidance}`);
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.FAILED,
          fundsMoved: false,
          lastKnownMessage: `Preflight check failed: ${explained.title}. ${explained.message}`,
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          explained.title
        );
        companionState(IX_TRANSFER_STATES.FAILED, {
          statusLine: 'Transfer dry-run failed before wallet prompt.',
          stateVal:   explained.title,
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   explained.code,
          actionVal:  explained.retryGuidance,
          autoOpen:   true,
        });
        persistWalletDiag('staticCall_catch', staticErr, { broadcastHash: broadcastHash, txBroadcast: txBroadcast });
        renderPreBroadcastDiag(staticErr, 'staticCall preflight');
        diagnosticHold = true;
        return;
      }

      console.log('[IX] final-gate: staticCall passed');

      // 6. estimateGas — catches RPC and mobile provider failures before the prompt.
      try {
        await gateImplicitex.transferWithFee.estimateGas(recipient, rawAmount);
      } catch (gasErr) {
        const explained = classifyTransferError(gasErr, { phase: 'preflight', broadcastKnown: false });
        setTransferNote('');
        setStatus(`${explained.title}. ${explained.retryGuidance}`);
        resolveReceipt(receiptId, {
          state: IX_TRANSFER_STATES.INTERRUPTED,
          fundsMoved: false,
          lastKnownMessage: `Gas estimate failed before wallet prompt: ${explained.title}. ${explained.message}`,
        });
        failTransferTimeline(
          needsApproval ? 'authorization_confirmed' : 'review_ready',
          explained.title
        );
        companionState(IX_TRANSFER_STATES.INTERRUPTED, {
          statusLine: 'Gas estimate failed before wallet prompt.',
          stateVal:   explained.title,
          fundsVal:   'No — transfer did not proceed',
          networkVal: chainConfig.name,
          eventVal:   explained.code,
          actionVal:  explained.retryGuidance,
          autoOpen:   true,
        });
        persistWalletDiag('estimateGas_catch', gasErr, { broadcastHash: broadcastHash, txBroadcast: txBroadcast });
        renderPreBroadcastDiag(gasErr, 'estimateGas preflight');
        diagnosticHold = true;
        return;
      }

      console.log('[IX] final-gate: estimateGas passed — all gate checks cleared');
    }

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
    // (txBroadcast, broadcastHash, diagnosticHold are hoisted above the outer try.)
    let broadcastUrl = null;
    try {
      persistWalletDiag('before_transferWithFee', null, {
        recipient:    recipient,
        rawAmount:    rawAmount.toString(),
        totalDebit:   totalDebit.toString(),
        broadcastHash: broadcastHash,
        txBroadcast:  txBroadcast,
      });
      console.log('[IX] invoking transferWithFee — recipient:', recipient, 'rawAmount:', rawAmount.toString());
      setStatus('Opening final MetaMask transfer confirmation…');
      const tx = await implicitex.transferWithFee(recipient, rawAmount);
      console.log('[IX] transferWithFee returned — hash:', tx && tx.hash);
      setStatus('Transfer submitted to network: ' + (tx && tx.hash ? tx.hash.slice(0, 12) + '…' : 'no hash'));
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
      if (window.IX && window.IX.track) window.IX.track('transfer_confirmed');
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
          severity:   'advisory',
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
          companionState(IX_TRANSFER_STATES.INTERRUPTED, {
            statusLine: 'Wallet request already pending in MetaMask.',
            stateVal:   'Interrupted',
            fundsVal:   'No — nothing was sent',
            networkVal: chainConfig.name,
            eventVal:   'MetaMask already has a pending request (-32002)',
            actionVal:  'Open MetaMask, finish or cancel the pending request, then retry.',
            autoOpen:   true,
          });
          persistWalletDiag('transferWithFee_catch_-32002', err, { broadcastHash: broadcastHash, txBroadcast: txBroadcast });
          renderPreBroadcastDiag(err, '-32002 pending request');
          diagnosticHold = true;
        } else {
          const rejected = errCode === 4001 || errCode === 5000 ||
            err.code === 'ACTION_REJECTED' ||
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
            persistWalletDiag('transferWithFee_catch_rejected', err, { broadcastHash: broadcastHash, txBroadcast: txBroadcast });
            renderPreBroadcastDiag(err, 'rejected 4001/5000/ACTION_REJECTED');
            diagnosticHold = true;
          } else {
            const rawCode = providerErrorCode(err);
            const rawDetail = ERROR_CLASSIFIER ? ERROR_CLASSIFIER.cleanDetail(err) : (err && err.message || '');
            const walletDiag = serializeWalletError(err);
            console.error('[IX] transferWithFee error (pre-broadcast):', err);
            console.error('[IX] error breakdown:', {
              code:         err && err.code,
              providerCode: rawCode,
              message:      err && err.message,
              shortMessage: err && err.shortMessage,
              reason:       err && err.reason,
              data:         err && err.data,
              info:         err && err.info,
            });
            const explained = classifyTransferError(err, { phase: 'transfer', broadcastKnown: false });
            setTransferNote('');
            // Safer copy: on mobile the tx may have reached the chain despite the local failure.
            setStatus('Transfer status unknown. Do not retry yet. Checking Polygon for a matching transaction\u2026');
            // Keep receipt active (updateReceipt not resolveReceipt) so reconciliation can patch it.
            updateReceipt(receiptId, {
              state: IX_TRANSFER_STATES.INTERRUPTED,
              fundsMoved: explained.fundsMoved,
              lastKnownMessage: 'Transfer status unknown. Checking chain for a matching transaction.',
            });
            failTransferTimeline('transfer_requested', explained.title);
            setTxState('idle', 'Transfer status unknown. Do not retry yet. Checking Polygon for a matching transaction\u2026');
            // eventVal includes raw error fields so they are visible in companion on mobile.
            const eventParts = [explained.code];
            if (rawCode != null) eventParts.push('code:' + rawCode);
            if (err && err.shortMessage) eventParts.push('short:' + String(err.shortMessage).slice(0, 80));
            if (rawDetail) eventParts.push(rawDetail);
            if (err && err.data) eventParts.push('data:' + String(err.data).slice(0, 60));
            const eventVal = eventParts.join(' — ');
            companionState(IX_TRANSFER_STATES.INTERRUPTED, {
              statusLine: 'Transfer status unknown \u2014 checking chain.',
              stateVal:   'Checking Polygon\u2026',
              fundsVal:   'Unknown \u2014 verifying on-chain',
              networkVal: chainConfig.name,
              eventVal:   eventVal,
              actionVal:  'Do not retry. Checking Polygon for a matching transaction.',
              autoOpen:   true,
            });
            persistWalletDiag('transferWithFee_catch_unclassified', err, { broadcastHash: broadcastHash, txBroadcast: txBroadcast });
            renderPreBroadcastDiag(err, 'unclassified pre-broadcast');
            diagnosticHold = true;

            // ---- Chain reconciliation ----
            // Query TransferExecuted events on Polygon via RPC to check whether the
            // transaction reached the chain despite the local provider failure.
            const reconResult = await reconcileInterruptedTransfer(
              state.address, recipient, rawAmount, contractAddress, chainConfig
            );
            if (reconResult.found) {
              // Transfer confirmed on-chain — repair receipt from INTERRUPTED to CONFIRMED.
              updateReceiptFromSource(receiptId, {
                state:            IX_TRANSFER_STATES.CONFIRMED,
                fundsMoved:       true,
                txHash:           reconResult.txHash,
                explorerUrl:      reconResult.explorerUrl,
                blockNumber:      reconResult.blockNumber,
                lastKnownMessage: 'Transfer confirmed on-chain (recovered from interrupted state).',
              }, OBSERVATION_SOURCES && OBSERVATION_SOURCES.RPC);
              if (window.IX && window.IX.receipts) window.IX.receipts.clearActive();
              setStatus('Transfer confirmed on Polygon. Funds moved.');
              setTxState('idle', 'Transfer confirmed on-chain. No further action needed.');
              companionState(IX_TRANSFER_STATES.CONFIRMED, {
                statusLine: 'Transfer confirmed on Polygon.',
                stateVal:   'Confirmed',
                fundsVal:   'Yes \u2014 confirmed on-chain',
                networkVal: chainConfig.name,
                eventVal:   'TransferExecuted event found: ' + reconResult.txHash.slice(0, 12) + '\u2026',
                actionVal:  'Save or export the proof packet.',
                autoOpen:   true,
              });
            } else {
              // No matching event — keep INTERRUPTED and archive.
              if (window.IX && window.IX.receipts) window.IX.receipts.clearActive();
              const reconNote = reconResult.reconError
                ? ' (query error: ' + String(reconResult.reconError).slice(0, 60) + ')'
                : '';
              setStatus('No matching transfer found on Polygon. No funds moved.' + reconNote);
              setTxState('idle', 'No matching transfer found. Safe to retry when ready.');
              companionState(IX_TRANSFER_STATES.INTERRUPTED, {
                statusLine: 'No matching transfer found on Polygon.',
                stateVal:   'Interrupted',
                fundsVal:   'No \u2014 no matching event found on-chain',
                networkVal: chainConfig.name,
                eventVal:   'Reconciliation complete' + reconNote,
                actionVal:  'No funds moved. Safe to retry when ready.',
                autoOpen:   true,
              });
            }
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
      // Always release the flow lock.
      activeTransferFlow = false;
      // If the flow exited without broadcast and without a diagnostic already
      // written, persist a breadcrumb so unexpected exit paths are capturable.
      if (!transferConfirmed && !txBroadcast && !diagnosticHold) {
        persistWalletDiag('finally_no_broadcast', null, {
          broadcastHash: broadcastHash,
          txBroadcast:   txBroadcast,
        });
      }
      // diagnosticHold: a QA diagnostic block is rendered in-page after an
      // unclassified pre-broadcast failure. Leave the review panel open so the
      // user can screenshot the raw error. exitReview collapses the panel.
      if (!transferConfirmed && !diagnosticHold) {
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
      blockTime:   Number(data && data.blockTime),
    };
  }

  // Probe the chain RPC directly — separate from Gas Station health.
  // Gas Station could be healthy while polygon-rpc.com is degraded; this
  // indicator targets the RPC path that wallet/contract reads actually use.
  async function probeRpcLatency(rpcUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const t0 = Date.now();
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`RPC ${res.status}`);
      await res.json(); // consume body so timing reflects full round-trip
      return Date.now() - t0;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // Gas sample accumulator — session-local only, no persistence.
  // Feeds the expandable Gas price detail row.
  // ----------------------------------------------------------------
  const GAS_SAMPLE_MAX = 20;
  const gasSampleBuffer = []; // { standard: number, ts: number }

  function pushGasSample(standard) {
    if (!Number.isFinite(standard)) return;
    gasSampleBuffer.push({ standard, ts: Date.now() });
    if (gasSampleBuffer.length > GAS_SAMPLE_MAX) gasSampleBuffer.shift();
  }

  function calcGasTrend() {
    if (gasSampleBuffer.length < 2) return 'Collecting';
    const first = gasSampleBuffer[0].standard;
    const last  = gasSampleBuffer[gasSampleBuffer.length - 1].standard;
    const threshold = 5; // Gwei — below this delta is noise, not trend
    if (last > first + threshold) return 'Rising';
    if (last < first - threshold) return 'Falling';
    return 'Stable';
  }

  function renderGasDetail() {
    if (!gasSampleBuffer.length) return;
    const vals = gasSampleBuffer.map(s => s.standard);
    const low  = Math.min(...vals);
    const high = Math.max(...vals);
    const avg  = vals.reduce((a, b) => a + b, 0) / vals.length;

    if (els.gasLow)     els.gasLow.textContent     = formatGwei(low)  + ' Gwei';
    if (els.gasAvg)     els.gasAvg.textContent     = formatGwei(avg)  + ' Gwei';
    if (els.gasHigh)    els.gasHigh.textContent    = formatGwei(high) + ' Gwei';
    if (els.gasTrend)   els.gasTrend.textContent   = calcGasTrend();
    if (els.gasSamples) els.gasSamples.textContent = gasSampleBuffer.length + ' / ' + GAS_SAMPLE_MAX;
  }

  function pollNetworkData() {
    if (state.networkPollTimer) return;

    async function update() {
      // Reset rpcLatencyDisplay at the start of every cycle so a stale reading
      // from a previous poll is never left visible while the new probe is in-flight.
      if (els.rpcLatencyDisplay) {
        els.rpcLatencyDisplay.textContent = '—';
        els.rpcLatencyDisplay.className = 'data-v';
      }

      // Probe chain RPC independently — parallel to Gas Station fetch.
      // Fires without awaiting so Gas Station latency does not inflate the reading.
      const chainCfg = window.IX_CHAINS && window.IX_CHAINS[POLYGON_MAINNET_CHAIN_ID];
      if (chainCfg && chainCfg.rpcUrl && els.rpcLatencyDisplay) {
        probeRpcLatency(chainCfg.rpcUrl).then(ms => {
          els.rpcLatencyDisplay.textContent = ms + ' ms';
          els.rpcLatencyDisplay.className = 'data-v';
        }).catch(() => {
          els.rpcLatencyDisplay.textContent = 'Unavailable';
          els.rpcLatencyDisplay.className = 'data-v is-error';
        });
      }

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
        if (els.confirmTimeDisplay && Number.isFinite(tiers.blockTime)) {
          els.confirmTimeDisplay.textContent = '~' + (tiers.blockTime * 2).toFixed(1) + ' sec';
        }

        pushGasSample(tiers.standard);
        renderGasDetail();
      } catch (err) {
        renderHeroGas({ standard: NaN, fast: NaN, rapid: NaN });
        if (els.gweiDisplay)        els.gweiDisplay.textContent        = 'Unavailable';
        if (els.blockDisplay)       els.blockDisplay.textContent       = 'Pending';
        if (els.confirmTimeDisplay) els.confirmTimeDisplay.textContent = '—';
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
    } else if (isConfiguredChain(state.chainId)) {
      // On a known chain (live or pre-live) — scroll to the panel, which may be in standby.
      if (els.modules) els.modules.scrollIntoView({ behavior: 'smooth' });
    } else {
      applyWrongNetworkPresentation();
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

  // Bind to the injected provider on startup so chain/account events are
  // observed before the user clicks Connect. Guarded so mobile browsers
  // without window.ethereum do not attempt to bind a missing provider.
  if (hasInjectedProvider()) {
    bindActiveProviderEvents(window.ethereum);
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
  resetBalanceDisplay('Not connected');
  renderReceiptHistory();
  renderRecipientIntel();
  renderPreflight();
  if (window.location.hash === '#transfer') {
    setTimeout(openTransferPortal, 60);
  } else {
    mountPortalMinimized();
  }
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
    openTransferPortal,
    focusTransferPortal,
    openOrConnect,
    handleTxAction,
    submitTransfer,
    exitReview,
    debugWalletProvider,
    scrollToModules,
    dismissModules,
    getState: () => ({ ...state }),
  });

  // Portal controls — Minimize and Close
  if (els.modulesMinimize) {
    els.modulesMinimize.addEventListener('click', function () {
      if (els.modules && els.modules.classList.contains('is-minimized')) {
        restorePortal();
      } else {
        minimizePortal();
      }
    });
  }
  if (els.modulesClose) {
    els.modulesClose.addEventListener('click', function () {
      closePortalWithAnimation();
      // Portal is above the hero — dismiss in place, no forced scroll.
    });
  }
  if (els.portalMinimizedTray) {
    els.portalMinimizedTray.addEventListener('click', restorePortal);
  }

  // Wallet menu — toggle open/close
  if (els.walletMenuTrigger) {
    els.walletMenuTrigger.addEventListener('click', function () {
      if (els.walletMenu && els.walletMenu.classList.contains('is-open')) {
        closeWalletMenu();
      } else {
        openWalletMenu();
      }
    });
  }

  // Wallet menu — close on outside click
  document.addEventListener('click', function (e) {
    if (!els.walletMenu || !els.walletMenu.classList.contains('is-open')) return;
    if (!els.walletMenu.contains(e.target)) {
      closeWalletMenu();
    }
  });

  // Wallet menu — keyboard close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && els.walletMenu && els.walletMenu.classList.contains('is-open')) {
      closeWalletMenu();
      if (els.walletMenuTrigger) els.walletMenuTrigger.focus();
    }
  });

  // Copy address button
  if (els.copyAddressBtn) {
    els.copyAddressBtn.addEventListener('click', function () {
      if (!state.address) return;
      navigator.clipboard.writeText(state.address).then(function () {
        const original = els.copyAddressBtn.textContent;
        els.copyAddressBtn.textContent = 'Copied';
        setTimeout(function () {
          if (els.copyAddressBtn) els.copyAddressBtn.textContent = original;
        }, 1400);
      }).catch(function () {
        // Clipboard unavailable — silently no-op.
      });
    });
  }

  // Switch to Polygon recovery button (inside wallet menu, shown on wrong network)
  if (els.switchNetworkBtn) {
    els.switchNetworkBtn.addEventListener('click', function () {
      closeWalletMenu();
      switchToPolygonMainnet();
    });
  }

  // Wallet menu action buttons — wire disconnect and switch account
  if (els.disconnectBtn) {
    els.disconnectBtn.addEventListener('click', () => {
      closeWalletMenu();
      disconnect({ revokeProvider: true });
    });
  }
  if (els.switchAccountBtn) {
    els.switchAccountBtn.addEventListener('click', function () {
      closeWalletMenu();
      requestAccountSelection();
    });
  }
  if (els.txCancelReview)  els.txCancelReview.addEventListener('click', () => exitReview());
  if (els.txConfirmAck)    els.txConfirmAck.addEventListener('change', updatePreview);

  hydrateAuthorizedInjectedWallet();
  renderPersistedWalletDiag(); // show any diagnostic from a previous failed transfer

  // Gas price row — expand / collapse toggle
  if (els.gasRowToggle) {
    els.gasRowToggle.addEventListener('click', function () {
      const isOpen = els.gasRow && els.gasRow.classList.toggle('is-open');
      if (els.gasRowToggle) els.gasRowToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (els.gasRowDetail) {
        if (isOpen) {
          els.gasRowDetail.removeAttribute('hidden');
        } else {
          els.gasRowDetail.setAttribute('hidden', '');
        }
      }
    });
  }

  // Wallet choice overlay — close paths
  if (els.walletChoiceClose)    els.walletChoiceClose.addEventListener('click', hideWalletChoice);
  if (els.walletChoiceBackdrop) els.walletChoiceBackdrop.addEventListener('click', hideWalletChoice);

  // Wallet choice overlay — WalletConnect connect flow
  if (els.walletChoiceWalletConnect) {
    els.walletChoiceWalletConnect.addEventListener('click', async function () {
      if (state.connected || state.connecting) return;

      // Disable button and show pending state while the QR/modal is open.
      if (els.walletChoiceWalletConnect) {
        els.walletChoiceWalletConnect.disabled = true;
        els.walletChoiceWalletConnect.textContent = 'Connecting…';
      }
      setConnectPending(true);
      hideWalletChoice();
      setStatus('Opening WalletConnect…');

      let wcProvider;
      try {
        const chainId = 137; // Polygon Mainnet
        wcProvider = await window.IX_WC.init({ chainId });
        setActiveProvider(wcProvider, 'walletconnect');

        // enable() opens the QR modal and establishes the WalletConnect session.
        // requestWalletAccounts() uses eth_requestAccounts which requires an
        // active session — for WC providers, enable() must come first.
        // enable() resolves with the accounts array once the user connects.
        const accounts = await wcProvider.enable();
        if (!accounts || !accounts[0]) {
          handleConnectFailure('No account returned from WalletConnect.');
          return;
        }

        state.connected = true;
        state.address = accounts[0];
        state.provider = walletRuntime.provider;
        state.userDisconnected = false;
        clearLocalWalletDisconnect();

        const chainHex = await walletRuntime.provider.request({ method: 'eth_chainId' });
        state.chainId = normalizeChainId(chainHex);

      } catch (err) {
        // User cancelled QR scan, session rejected, SDK error, etc.
        // Clear any partially set provider before resetting UI.
        if (walletRuntime.source === 'walletconnect') {
          try { await window.IX_WC.disconnect(); } catch (_) {}
          clearActiveProvider();
        }
        const code = providerErrorCode(err);
        const msg = (err && err.message) ? err.message.toLowerCase() : '';
        // WalletConnect v2 rejects modal close / QR dismiss with non-4001 errors:
        // "Connection request reset", "User rejected methods", "User rejected", etc.
        // Treat all of these as user-initiated cancellations, not failures.
        const isCancelled = code === 4001 ||
          msg.includes('user rejected') ||
          msg.includes('connection request reset') ||
          msg.includes('user closed') ||
          msg.includes('user cancelled');
        if (isCancelled) {
          handleConnectFailure('WalletConnect connection cancelled.');
        } else {
          handleConnectFailure('WalletConnect connection failed. Try again.');
          console.warn('[ImplicitEx] WalletConnect init/connect error', err);
        }
        return;

      } finally {
        // Always re-enable the WalletConnect button — no stuck state.
        if (els.walletChoiceWalletConnect) {
          els.walletChoiceWalletConnect.disabled = false;
          els.walletChoiceWalletConnect.textContent = 'Connect with WalletConnect';
        }
        setConnectPending(false);
      }

      // Account and chain are set — mirror injected post-connect sequence exactly.
      bindActiveProviderEvents(walletRuntime.provider);
      state.connecting = false;
      startWalletChainWatcher();
      onConnected();
    });
  }

})();
