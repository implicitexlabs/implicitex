/**
 * wallet.js — ImplicitEx wallet connection and transfer flow
 *
 * Current state: live Polygon transfer UI with local-only receipt persistence.
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  const state = {
    connected: false,
    address:   null,
    provider:  null,
    signer:    null,
    chainId:   null,
    connecting: false,
    networkPollTimer: null,
  };

  const DEMO_FEE_RATE = 0.01;
  const POLYGON_GAS_STATION_URL = 'https://gasstation.polygon.technology/v2';

  // Minimal ABIs — only the selectors this client calls.
  const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
  ];

  const IMPLICITEX_ABI = [
    'function feeBasisPoints() view returns (uint16)',
    'function minTransferAmount() view returns (uint256)',
    'function transferPrecision() view returns (uint256)',
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
      return window.IX.receipts.create(detail);
    }
    return { id: '_noop' }; // storage unavailable — id is a harmless sentinel
  }

  function updateReceipt(id, patch) {
    if (window.IX && window.IX.receipts) {
      return window.IX.receipts.update(id, patch);
    }
    return false;
  }

  function resolveReceipt(id, patch) {
    // update fields first, then archive — always a terminal-state operation
    if (updateReceipt(id, patch) && window.IX && window.IX.receipts) {
      window.IX.receipts.clearActive();
    }
  }

  // ----------------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------------
  const els = {
    connectBtn:     document.getElementById('connectBtn'),
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
    previewNote:        document.getElementById('previewNote'),
    recipientError:     document.getElementById('recipientError'),
    receiptHistory:     document.getElementById('receiptHistory'),
  };

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------
  function shortAddr(addr) {
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function setStatus(msg) {
    if (els.txStatus) els.txStatus.textContent = msg;
  }

  // Persistent contextual note below the button — explains the current transfer gate.
  // Empty string clears it (element is invisible when empty).
  function setTransferNote(msg) {
    if (els.transferStateNote) els.transferStateNote.textContent = msg;
  }

  function resetBalanceDisplay() {
    if (els.usdcBalance) els.usdcBalance.textContent = '—';
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
    };
  }

  function showPreview() {
    if (els.txPreview) els.txPreview.removeAttribute('hidden');
  }

  function hidePreview() {
    if (els.txPreview) els.txPreview.setAttribute('hidden', '');
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
      meta.textContent = `${receipt.amount || '—'} USDC → ${receipt.recipient ? shortAddr(receipt.recipient) : '—'}`;

      const message = document.createElement('p');
      message.className = 'receipt-message';
      message.textContent = receipt.lastKnownMessage || (
        receipt.fundsMoved === true ? 'Funds moved.' :
        receipt.fundsMoved === false ? 'No funds moved.' :
        'Outcome not yet resolved.'
      );

      item.append(head, meta, message);

      const txHash = receipt.transferHash || receipt.hash;
      if (receipt.explorerUrl && txHash) {
        const link = document.createElement('a');
        link.className = 'receipt-link';
        link.href = receipt.explorerUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `View ${shortHash(txHash)}`;
        item.append(link);
      }

      return item;
    }));
  }

  /**
   * Render or hide the transfer preview panel.
   * Pure frontend math — no chain calls, no signing, no async.
   *
   * Shows when: recipient is a valid 0x address, amount > 0,
   * wallet connected, and chain is configured.
   * Hides otherwise.
   */
  function updatePreview() {
    const recipient  = (els.txRecipient && els.txRecipient.value.trim()) || '';
    const amountStr  = (els.amtIn && els.amtIn.value.trim()) || '';
    const amountFloat = parseFloat(amountStr);

    const validRecipient = /^0x[0-9a-fA-F]{40}$/.test(recipient);
    const validAmount    = !isNaN(amountFloat) && amountFloat > 0;
    const validNetwork   = state.connected && isConfiguredChain(state.chainId);

    if (!validRecipient || !validAmount || !validNetwork) {
      hidePreview();
      return;
    }

    const chainConfig = window.IX_CHAINS[state.chainId];
    const fee         = calcFee(amountFloat);
    const total       = amountFloat + fee;
    const netState    = getNetworkState();

    const modeLabel = netState === 'CONTRACT_UNAVAILABLE' ? 'Preview · Contract not deployed'
                    : netState === 'TRANSFERS_DISABLED'   ? 'Preview · Transfers disabled'
                    : 'Live';

    if (els.previewRecipient) els.previewRecipient.textContent = recipient.slice(0, 10) + '…' + recipient.slice(-6);
    if (els.previewAmount)    els.previewAmount.textContent    = amountFloat.toFixed(2) + ' USDC';
    if (els.previewFee)       els.previewFee.textContent       = fee.toFixed(6) + ' USDC';
    if (els.previewTotal)     els.previewTotal.textContent     = total.toFixed(2) + ' USDC';
    if (els.previewNetwork)   els.previewNetwork.textContent   = chainConfig.name;
    if (els.previewContract)  els.previewContract.textContent  = chainConfig.contractAddress
      ? chainConfig.contractAddress.slice(0, 10) + '…'
      : 'Not deployed';
    if (els.previewMode)      els.previewMode.textContent      = modeLabel;
    if (els.previewNote)      els.previewNote.textContent      = (netState === 'READY')
      ? 'Two wallet confirmations required. Funds will move.'
      : 'Preview only — no funds will move.';

    showPreview();
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

    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'Connect Wallet';
    els.connectBtn.classList.remove('connected');
  }

  function handleConnectFailure(message) {
    state.connected = false;
    state.address = null;
    state.provider = null;
    state.signer = null;
    state.chainId = null;
    state.connecting = false;

    if (els.disconnectBtn) els.disconnectBtn.setAttribute('hidden', '');
    resetConnectButton();
    setNavStatus(message);
    setStatus(message);
  }

  function isConfiguredChain(chainId) {
    return !!(chainId && window.IX_CHAINS && window.IX_CHAINS[chainId]);
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

  /**
   * Return the correct idle label for the transfer button based on current state.
   * Keeps setTxState() and presentation functions consistent.
   */
  function currentButtonLabel() {
    const netState = getNetworkState();
    if (netState === 'CONTRACT_UNAVAILABLE') return 'Contract not deployed';
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const live = (window.IX_CONFIG && window.IX_CONFIG.transfersEnabled) &&
                 (chainConfig && chainConfig.transfersEnabled);
    return live ? 'Send USDC' : 'Preview Transfer';
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
  function openOrConnect() {
    if (state.connected && isConfiguredChain(state.chainId)) {
      showTransferModules(true);
    } else if (state.connected) {
      applyWrongNetworkPresentation();
    } else {
      connect();
    }
  }

  // Disconnect — clears local session state and resets UI.
  // MetaMask retains site permission internally; user must revoke via wallet settings.
  // This gives the dapp a clean disconnected state without requiring wallet cooperation.
  function disconnect() {
    if (state.networkPollTimer) {
      clearInterval(state.networkPollTimer);
      state.networkPollTimer = null;
    }

    state.connected = false;
    state.address   = null;
    state.provider  = null;
    state.signer    = null;
    state.chainId   = null;
    state.connecting = false;

    if (els.walletPill) els.walletPill.classList.remove('visible');
    if (els.walletAddr) els.walletAddr.textContent = '';
    if (els.disconnectBtn) els.disconnectBtn.setAttribute('hidden', '');
    resetConnectButton();
    setNavStatus('');
    resetBalanceDisplay();
    setTransferNote('');
    setStatus('');
    hidePreview();
    hideTransferModules();

    if (window.IX && window.IX.companion) window.IX.companion.reset();
  }

  function applyConnectedPresentation(options = {}) {
    const shouldScroll = options.shouldScroll === true;
    const short = shortAddr(state.address);
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];
    const transfersEnabled = chainConfig && chainConfig.transfersEnabled;

    if (els.walletAddr) els.walletAddr.textContent = short;
    if (els.walletPill) els.walletPill.classList.add('visible');
    if (els.connectBtn) {
      els.connectBtn.disabled = false;
      els.connectBtn.textContent = short;
      els.connectBtn.classList.add('connected');
    }
    if (els.disconnectBtn) els.disconnectBtn.removeAttribute('hidden');
    setNavStatus('Wallet connected');
    if (els.networkBadge) {
      els.networkBadge.textContent = chainLabel(state.chainId);
    }
    if (els.txBtn) {
      els.txBtn.disabled = false;
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
      eventVal:   `Address: ${shortAddr(state.address)}`,
      actionVal:  transfersEnabled
        ? 'Enter a recipient address and amount to begin.'
        : 'Preview mode — enter details to see fee calculation. Live transfers not yet enabled.',
    });
  }

  function applyContractUnavailablePresentation(options = {}) {
    const shouldScroll = options.shouldScroll === true;
    const short = shortAddr(state.address);
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[state.chainId];

    if (els.walletAddr) els.walletAddr.textContent = short;
    if (els.walletPill) els.walletPill.classList.add('visible');
    if (els.connectBtn) {
      els.connectBtn.disabled = false;
      els.connectBtn.textContent = short;
      els.connectBtn.classList.add('connected');
    }
    if (els.disconnectBtn) els.disconnectBtn.removeAttribute('hidden');
    setNavStatus('Wallet connected');
    if (els.networkBadge) {
      els.networkBadge.textContent = chainLabel(state.chainId);
    }
    if (els.txBtn) {
      els.txBtn.disabled = true;
      els.txBtn.textContent = 'Contract not deployed';
    }
    setStatus('');
    setTransferNote('Contract not deployed on this network. Transfers unavailable.');
    updateNetworkModuleRows(chainConfig);
    showTransferModules(shouldScroll);

    companionState('WALLET_CONNECTED', {
      statusLine: `Connected · ${chainLabel(state.chainId)} · Contract not deployed`,
      stateVal:   'Wallet connected',
      fundsVal:   'No active transaction',
      networkVal: chainLabel(state.chainId),
      eventVal:   `Address: ${shortAddr(state.address)}`,
      actionVal:  'Contract not yet deployed on this network. Transfers unavailable.',
    });
  }

  function applyWrongNetworkPresentation() {
    const short = shortAddr(state.address);

    if (els.walletAddr) els.walletAddr.textContent = short;
    if (els.walletPill) els.walletPill.classList.add('visible');
    if (els.connectBtn) {
      els.connectBtn.disabled = false;
      els.connectBtn.textContent = 'Wrong Network';
      els.connectBtn.classList.add('connected');
    }
    if (els.disconnectBtn) els.disconnectBtn.removeAttribute('hidden');
    setNavStatus('Wrong network');
    if (els.networkBadge) {
      els.networkBadge.textContent = chainLabel(state.chainId);
    }
    hideTransferModules();
    setTransferNote('');
    hidePreview();
    setStatus('Switch to Polygon or Polygon Amoy to continue.');

    companionState('WRONG_NETWORK', {
      statusLine: 'Wrong network · Switch to Polygon or Polygon Amoy',
      stateVal:   'Wrong network',
      fundsVal:   'No active transaction',
      networkVal: chainLabel(state.chainId),
      eventVal:   'Unsupported network detected',
      actionVal:  'Switch to Polygon or Polygon Amoy in your wallet.',
      autoOpen:   true,
    });
  }

  // ----------------------------------------------------------------
  // Connect wallet
  // ----------------------------------------------------------------
  async function connect() {
    if (state.connected || state.connecting) return;

    if (!window.ethereum || !window.ethereum.request) {
      handleConnectFailure('No wallet detected');
      return;
    }

    setNavStatus('Connecting wallet');
    setConnectPending(true);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        handleConnectFailure('No wallet account returned');
        return;
      }

      state.connected = true;
      state.address = accounts[0];
      state.provider = window.ethereum;

      const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
      state.chainId = parseInt(chainHex, 16);
    } catch (err) {
      const rejected = err && (err.code === 4001 ||
        (err.info && err.info.error && err.info.error.code === 4001));
      handleConnectFailure(rejected ? 'Wallet connection rejected' : 'Wallet connection failed');
      return;
    }

    state.connecting = false;
    if (els.connectBtn) els.connectBtn.disabled = false;
    onConnected();
  }

  function onConnected() {
    const netState = getNetworkState();
    if (netState === 'WRONG_NETWORK') {
      applyWrongNetworkPresentation();
    } else if (netState === 'CONTRACT_UNAVAILABLE') {
      applyContractUnavailablePresentation({ shouldScroll: true });
    } else {
      applyConnectedPresentation({ shouldScroll: true });
    }

    // Start gas polling
    pollNetworkData();

    // Populate USDC balance when usdcAddress is configured (even before contract deploy).
    refreshUsdcBalance();
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
      const val = parseFloat(this.value);
      if (!isNaN(val) && val > 0) {
        const fee = calcFee(val);
        els.feeDisplay.textContent = '$' + fee.toFixed(6) + ' USDC';
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

    if (!/^0x/i.test(v))          return 'Address must start with 0x.';
    if (v.length !== 42)           return 'Address must be 42 characters (0x + 40 hex).';
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return 'Invalid characters in address.';
    if (state.address && v.toLowerCase() === state.address.toLowerCase())
                                   return 'Recipient cannot be your own wallet.';
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
      applyRecipientValidation(this.value);
      updatePreview();
    });
  }

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
  function setTxState(txState, message) {
    if (els.txBtn) {
      const isPending = txState === 'pending';
      const isUnavailable = getNetworkState() === 'CONTRACT_UNAVAILABLE';
      els.txBtn.disabled = isPending || isUnavailable;
      els.txBtn.textContent = isPending ? 'Processing…' : currentButtonLabel();
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
      const provider = new ethers.BrowserProvider(window.ethereum);
      const usdc = new ethers.Contract(chainConfig.usdcAddress, ERC20_ABI, provider);
      const bal = await usdc.balanceOf(state.address);
      if (els.usdcBalance) {
        els.usdcBalance.textContent = parseFloat(ethers.formatUnits(bal, 6)).toFixed(2) + ' USDC';
      }
    } catch (_) {
      // Non-critical — balance display stays at previous value.
    }
  }

  // ----------------------------------------------------------------
  // Submit transfer
  // ----------------------------------------------------------------
  async function submitTransfer() {
    const recipient = document.getElementById('txRecipient')?.value?.trim();
    const amountStr = els.amtIn?.value?.trim();
    const amountFloat = parseFloat(amountStr);

    // --- Basic input validation ---
    // Run inline validator so the red error state appears on submit attempt too.
    applyRecipientValidation(recipient || '');
    if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      setStatus('');
      return;
    }

    if (!amountStr || isNaN(amountFloat) || amountFloat <= 0) {
      setStatus('Enter a valid amount.');
      return;
    }

    // --- Gate: show preview when transfers are not yet enabled ---
    if (!window.IX_CONFIG || window.IX_CONFIG.transfersEnabled !== true) {
      const fee = calcFee(amountFloat);
      const total = amountFloat + fee;
      setStatus(
        `Preview — fee ${fee.toFixed(6)} USDC · total debit ${total.toFixed(6)} USDC. ` +
        `Live transfers not yet enabled.`
      );
      return;
    }

    // --- ethers availability guard ---
    if (typeof ethers === 'undefined') {
      setStatus('ethers.js failed to load. Refresh the page and try again.');
      return;
    }

    // --- Chain detection ---
    let chainHex;
    try {
      chainHex = await window.ethereum.request({ method: 'eth_chainId' });
    } catch (_) {
      setStatus('Could not read chain ID from wallet.');
      return;
    }
    const chainId = parseInt(chainHex, 16);
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[chainId];

    if (!chainConfig || !chainConfig.transfersEnabled) {
      const supported = Object.values(window.IX_CHAINS || {})
        .filter(c => c.transfersEnabled)
        .map(c => c.name)
        .join(', ') || 'Polygon Amoy';
      setStatus(`Wrong network. Switch to ${supported} in your wallet.`);
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

    // --- Build contracts ---
    let signer;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
    } catch (_) {
      setStatus('Could not get wallet signer. Is your wallet unlocked?');
      return;
    }

    const usdc       = new ethers.Contract(usdcAddress,     ERC20_ABI,     signer);
    const implicitex = new ethers.Contract(contractAddress, IMPLICITEX_ABI, signer);

    // --- Read on-chain contract parameters ---
    let feeBps, minTransfer, precision;
    try {
      [feeBps, minTransfer, precision] = await Promise.all([
        implicitex.feeBasisPoints(),
        implicitex.minTransferAmount(),
        implicitex.transferPrecision(),
      ]);
    } catch (_) {
      setStatus('Could not read contract parameters. Is the contract deployed and reachable?');
      return;
    }

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

    // --- Fee math — mirrors contract integer division exactly ---
    const fee        = (rawAmount * BigInt(feeBps)) / 10000n;
    const totalDebit = rawAmount + fee;
    const receipt = storeReceipt(buildReceiptDetail({
      stateKey: 'READY',
      sender: state.address,
      recipient,
      amount: rawAmount,
      fee,
      totalDebit,
      chainId,
      chainConfig,
      contractAddress,
      lastKnownMessage: 'Transfer details validated. No wallet action requested yet.',
    }));
    const receiptId = receipt.id;

    if (rawAmount < minTransfer) {
      const minHuman = ethers.formatUnits(minTransfer, 6);
      resolveReceipt(receiptId, {
        state: 'FAILED',
        fundsMoved: false,
        lastKnownMessage: `Amount below contract minimum of ${minHuman} USDC. No funds moved.`,
      });
      setStatus(`Amount below contract minimum of ${minHuman} USDC.`);
      return;
    }

    if (rawAmount % precision !== 0n) {
      const precHuman = ethers.formatUnits(precision, 6);
      resolveReceipt(receiptId, {
        state: 'FAILED',
        fundsMoved: false,
        lastKnownMessage: `Amount must be a multiple of ${precHuman} USDC. No funds moved.`,
      });
      setStatus(`Amount must be a multiple of ${precHuman} USDC.`);
      return;
    }

    if (chainConfig.maxTransferUsdc && amountFloat > chainConfig.maxTransferUsdc) {
      resolveReceipt(receiptId, {
        state: 'FAILED',
        fundsMoved: false,
        lastKnownMessage: `Amount exceeds the ${chainConfig.maxTransferUsdc} USDC soft launch cap. No funds moved.`,
      });
      setStatus(`Amount exceeds the ${chainConfig.maxTransferUsdc} USDC soft launch cap.`);
      return;
    }

    // --- Balance check ---
    let balance;
    try {
      balance = await usdc.balanceOf(state.address);
    } catch (_) {
      resolveReceipt(receiptId, {
        state: 'FAILED',
        fundsMoved: false,
        lastKnownMessage: 'Could not read USDC balance. No funds moved.',
      });
      setStatus('Could not read USDC balance.');
      return;
    }

    if (balance < totalDebit) {
      const have = ethers.formatUnits(balance, 6);
      const need = ethers.formatUnits(totalDebit, 6);
      resolveReceipt(receiptId, {
        state: 'FAILED',
        fundsMoved: false,
        lastKnownMessage: `Insufficient balance. Have ${have} USDC, need ${need} USDC.`,
      });
      setStatus(`Insufficient balance. Have ${have} USDC, need ${need} USDC (amount + fee).`);
      return;
    }

    // --- Allowance check / approve ---
    let allowance;
    try {
      allowance = await usdc.allowance(state.address, contractAddress);
    } catch (_) {
      resolveReceipt(receiptId, {
        state: 'FAILED',
        fundsMoved: false,
        lastKnownMessage: 'Could not read USDC allowance. No funds moved.',
      });
      setStatus('Could not read USDC allowance.');
      return;
    }

    const needsApproval = allowance < totalDebit;

    if (needsApproval) {
      // ---- Step 1 of 2: Authorize USDC Access ----
      // Narrate BEFORE MetaMask fires. Three rails, three distinct roles:
      //   transferStateNote = primary action rail  (what step, what is required)
      //   txStatus          = contextual note      (what this action does NOT do)
      //   companionState    = state memory rail    (record for the tray)
      setTransferNote('Step 1 of 2 — Authorize USDC Access');
      setStatus('Funds are not sent yet.');
      setTxState('pending', 'Wallet authorization required.');
      updateReceipt(receiptId, {
        state: 'AUTHORIZING',
        lastKnownMessage: 'USDC authorization requested. Funds are not sent yet.',
      });
      companionState('AWAITING_APPROVAL', {
        statusLine: 'Step 1 of 2 — Authorize USDC access',
        stateVal:   'Awaiting authorization',
        fundsVal:   'Not yet — authorization only',
        networkVal: chainConfig.name,
        eventVal:   'USDC authorization requested',
        actionVal:  'Authorizes the contract to prepare the transfer. Funds are not sent yet.',
      });
      try {
        const approveTx = await usdc.approve(contractAddress, totalDebit);
        updateReceipt(receiptId, {
          approvalHash: approveTx.hash,
          lastKnownMessage: 'USDC authorization submitted. Funds are not sent yet.',
        });
        setStatus('');
        setTxState('pending', 'Authorization submitted.');
        setTransferNote('Step 1 of 2 — Confirming authorization…');
        await approveTx.wait();
        updateReceipt(receiptId, {
          state: 'AUTHORIZED',
          lastKnownMessage: 'USDC authorization confirmed. Transfer not submitted yet.',
        });
        setTransferNote('Authorization confirmed — preparing transfer…');
      } catch (err) {
        const rejected = err.code === 4001 ||
          (err.info && err.info.error && err.info.error.code === 4001);
        if (rejected) {
          setTransferNote('');
          setStatus('');
          resolveReceipt(receiptId, {
            state: 'REJECTED',
            fundsMoved: false,
            lastKnownMessage: 'USDC authorization declined in wallet. No funds moved.',
          });
          setTxState('idle', 'Authorization declined. No funds moved.');
          companionState('REJECTED', {
            statusLine: 'Authorization declined. Transfer cancelled.',
            stateVal:   'Declined',
            fundsVal:   'No — nothing was sent',
            networkVal: chainConfig.name,
            eventVal:   'USDC authorization declined in wallet',
            actionVal:  'No funds moved. Retry when ready.',
            autoOpen:   true,
          });
        } else {
          setTransferNote('');
          setStatus('');
          resolveReceipt(receiptId, {
            state: 'FAILED',
            fundsMoved: false,
            lastKnownMessage: 'USDC authorization failed. No transfer was submitted.',
          });
          setTxState('idle', 'Authorization failed: ' + (err.shortMessage || err.message || 'Unknown error'));
          companionState('FAILED', {
            statusLine: 'Authorization failed. Transfer cancelled.',
            stateVal:   'Failed',
            fundsVal:   'No — transfer did not proceed',
            networkVal: chainConfig.name,
            eventVal:   err.shortMessage || err.message || 'Unknown error',
            actionVal:  'No funds moved. Check reason and retry if appropriate.',
            autoOpen:   true,
          });
        }
        return;
      }
    } else {
      updateReceipt(receiptId, {
        state: 'AUTHORIZED',
        lastKnownMessage: 'Existing USDC allowance is sufficient. Transfer not submitted yet.',
      });
    }

    // ---- Step 2 of 2 (or sole step when allowance already sufficient): Execute transfer ----
    // Narrate BEFORE MetaMask fires.
    //   transferStateNote = primary action rail
    //   txStatus          = point-of-no-return signal
    //   companionState    = state memory
    const stepLabel = needsApproval ? 'Step 2 of 2 — Confirm Transfer' : 'Confirm Transfer';
    setTransferNote(stepLabel);
    setStatus('This sends funds on-chain.');
    setTxState('pending', 'Wallet confirmation required.');
    updateReceipt(receiptId, {
      state: 'SUBMITTING',
      lastKnownMessage: 'Transfer confirmation requested. Funds move only after on-chain confirmation.',
    });
    companionState('AWAITING_APPROVAL', {
      statusLine: needsApproval ? 'Step 2 of 2 — Confirm transfer' : 'Confirm transfer',
      stateVal:   'Awaiting confirmation',
      fundsVal:   'No — not until confirmed on-chain',
      networkVal: chainConfig.name,
      eventVal:   'Transfer signature requested',
      actionVal:  'This is the final step. Confirming sends the funds on-chain.',
    });

    try {
      const tx = await implicitex.transferWithFee(recipient, rawAmount);

      // Hash is available immediately after broadcast, before confirmation.
      updateReceipt(receiptId, {
        state: 'SUBMITTED',
        transferHash: tx.hash,
        hash: tx.hash,
        explorerUrl: `${chainConfig.explorerUrl}/tx/${tx.hash}`,
        lastKnownMessage: 'Transfer broadcast to network. Awaiting confirmation.',
      });

      setTransferNote('Transfer submitted — awaiting confirmation…');
      setStatus('');
      setTxState('pending', 'Broadcast to network. Do not retry.');
      companionState('SUBMITTED', {
        statusLine: 'Transaction submitted. Awaiting network confirmation…',
        stateVal:   'Submitted',
        fundsVal:   'No — not until confirmed',
        networkVal: chainConfig.name,
        eventVal:   'Broadcast to network',
        actionVal:  'Wait for confirmation. Do not retry.',
      });
      const receipt = await tx.wait();

      const txHash     = receipt.hash;
      const receiptUrl = `${chainConfig.explorerUrl}/tx/${txHash}`;
      if (els.txStatus) {
        // explorerUrl is from our own config; txHash is a 0x-prefixed hex from the chain — safe.
        els.txStatus.innerHTML =
          `Transfer confirmed — ` +
          `<a href="${receiptUrl}" target="_blank" rel="noopener">` +
          `View on ${chainConfig.name} explorer</a>`;
      }
      setTransferNote('');
      setTxState('idle', null); // status already set above via innerHTML
      resolveReceipt(receiptId, {
        state: 'CONFIRMED',
        fundsMoved: true,
        transferHash: txHash,
        hash: txHash,
        explorerUrl: receiptUrl,
        lastKnownMessage: 'Transfer confirmed. Funds moved.',
      });
      companionState('CONFIRMED', {
        statusLine: 'Transfer confirmed. Funds have moved.',
        stateVal:   'Confirmed',
        fundsVal:   'Yes — transfer complete',
        networkVal: chainConfig.name,
        eventVal:   txHash,
        actionVal:  `View on ${chainConfig.name} explorer ↗`,
        actionHref: receiptUrl,
        autoOpen:   true,
      });

      refreshUsdcBalance();
    } catch (err) {
      const rejected = err.code === 4001 ||
        (err.info && err.info.error && err.info.error.code === 4001);
      if (rejected) {
        setTransferNote('');
        setStatus('');
        resolveReceipt(receiptId, {
          state: 'REJECTED',
          fundsMoved: false,
          lastKnownMessage: 'Transfer rejected in wallet. No funds moved.',
        });
        setTxState('idle', 'Transfer declined. No funds moved.');
        companionState('REJECTED', {
          statusLine: 'Transfer rejected. Nothing was sent.',
          stateVal:   'Rejected',
          fundsVal:   'No — nothing was sent',
          networkVal: chainConfig.name,
          eventVal:   'Transfer rejected in wallet',
          actionVal:  'Retry when ready, or do nothing.',
          autoOpen:   true,
        });
      } else {
        setTransferNote('');
        setStatus('');
        const failedHash = err.receipt && err.receipt.hash
          ? err.receipt.hash
          : err.transactionHash || null;
        resolveReceipt(receiptId, {
          state: 'FAILED',
          fundsMoved: false,
          transferHash: failedHash,
          hash: failedHash,
          explorerUrl: failedHash ? `${chainConfig.explorerUrl}/tx/${failedHash}` : null,
          lastKnownMessage: 'Transfer failed. Funds were not moved.',
        });
        setTxState('idle', 'Transfer failed: ' + (err.reason || err.shortMessage || err.message || 'Unknown error'));
        companionState('FAILED', {
          statusLine: 'Transaction failed. Funds were not moved.',
          stateVal:   'Failed',
          fundsVal:   'No — gas may have been consumed',
          networkVal: chainConfig.name,
          eventVal:   err.reason || err.shortMessage || err.message || 'Unknown error',
          actionVal:  'Check reason above. Verify on Polygonscan before retrying.',
          autoOpen:   true,
        });
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
      connect();
    } else if (!isConfiguredChain(state.chainId)) {
      applyWrongNetworkPresentation();
    } else if (els.modules) {
      els.modules.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function chainLabel(chainId) {
    if (!chainId) return 'Wallet connected';
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[chainId];
    return chainConfig ? chainConfig.name : `Unsupported chain ${chainId}`;
  }

  if (window.ethereum && window.ethereum.on) {
    window.ethereum.on('accountsChanged', accounts => {
      if (!accounts || !accounts[0]) {
        state.connected = false;
        state.address = null;
        if (els.walletPill) els.walletPill.classList.remove('visible');
        if (els.walletAddr) els.walletAddr.textContent = '';
        if (els.disconnectBtn) els.disconnectBtn.setAttribute('hidden', '');
        resetConnectButton();
        setNavStatus('');
        resetBalanceDisplay();
        setTransferNote('');
        hidePreview();
        hideTransferModules();
        if (window.IX && window.IX.companion) window.IX.companion.reset();
        return;
      }
      state.address = accounts[0];
      state.connected = true;
      onConnected();
    });

    window.ethereum.on('chainChanged', chainHex => {
      state.chainId = parseInt(chainHex, 16);
      if (!state.connected) {
        if (els.networkBadge) els.networkBadge.textContent = chainLabel(state.chainId);
        return;
      }
      const netState = getNetworkState();
      if (netState === 'WRONG_NETWORK') {
        applyWrongNetworkPresentation();
        resetBalanceDisplay();
      } else if (netState === 'CONTRACT_UNAVAILABLE') {
        applyContractUnavailablePresentation();
        refreshUsdcBalance();
        updatePreview();
      } else {
        applyConnectedPresentation();
        refreshUsdcBalance();
        updatePreview();
      }
    });
  }

  pollNetworkData();
  renderReceiptHistory();
  window.addEventListener('ix:receipts-changed', renderReceiptHistory);

  // ----------------------------------------------------------------
  // Public API on window.IX
  // Extend rather than replace — receipt-store.js and companion.js
  // register their own namespaces on window.IX before and after this runs.
  // ----------------------------------------------------------------
  window.IX = Object.assign(window.IX || {}, {
    connect,
    disconnect,
    openOrConnect,
    submitTransfer,
    scrollToModules,
    dismissModules,
    getState: () => ({ ...state }),
  });

  // Wire dismiss and disconnect buttons
  const dismissBtn = document.getElementById('modulesDismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', dismissModules);

  if (els.disconnectBtn) els.disconnectBtn.addEventListener('click', disconnect);

})();
