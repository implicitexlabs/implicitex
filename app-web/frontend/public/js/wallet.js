/**
 * wallet.js — ImplicitEx wallet connection and transfer flow
 *
 * Current state: wallet connect UI + disabled transfer preview.
 * Production TODOs are marked clearly below.
 * Do not enable transfersEnabled until testnet smoke passes.
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
  // storeReceipt(detail)         — create active receipt, return {id}
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
      window.IX.receipts.update(id, patch);
    }
  }

  function resolveReceipt(id, patch) {
    // update fields first, then archive — always a terminal-state operation
    updateReceipt(id, patch);
    if (window.IX && window.IX.receipts) {
      window.IX.receipts.clearActive();
    }
  }

  // ----------------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------------
  const els = {
    connectBtn:  document.getElementById('connectBtn'),
    walletPill:  document.getElementById('walletPill'),
    walletAddr:  document.getElementById('walletAddr'),
    modules:     document.getElementById('modules'),
    howItWorks:  document.getElementById('howItWorks'),
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

  function showPreview() {
    if (els.txPreview) els.txPreview.removeAttribute('hidden');
  }

  function hidePreview() {
    if (els.txPreview) els.txPreview.setAttribute('hidden', '');
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

    resetConnectButton();
    setNavStatus(message);
    setStatus(message);
  }

  function isConfiguredChain(chainId) {
    return !!(chainId && window.IX_CHAINS && window.IX_CHAINS[chainId]);
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

    els.modules.removeAttribute('hidden');
    if (shouldScroll) {
      setTimeout(() => {
        els.modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 280);
    }
  }

  function hideTransferModules() {
    if (els.modules) els.modules.setAttribute('hidden', '');
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

  if (els.txRecipient) {
    els.txRecipient.addEventListener('input', updatePreview);
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
    if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      setStatus('Enter a valid recipient address (0x… 42 characters).');
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
    } catch (_) {
      setStatus('Invalid amount format.');
      return;
    }

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

    // --- Fee math — mirrors contract integer division exactly ---
    const fee        = (rawAmount * BigInt(feeBps)) / 10000n;
    const totalDebit = rawAmount + fee;

    // --- Balance check ---
    let balance;
    try {
      balance = await usdc.balanceOf(state.address);
    } catch (_) {
      setStatus('Could not read USDC balance.');
      return;
    }

    if (balance < totalDebit) {
      const have = ethers.formatUnits(balance, 6);
      const need = ethers.formatUnits(totalDebit, 6);
      setStatus(`Insufficient balance. Have ${have} USDC, need ${need} USDC (amount + fee).`);
      return;
    }

    // --- Allowance check / approve ---
    let allowance;
    try {
      allowance = await usdc.allowance(state.address, contractAddress);
    } catch (_) {
      setStatus('Could not read USDC allowance.');
      return;
    }

    if (allowance < totalDebit) {
      setTxState('pending', 'Waiting for approval in wallet…');
      companionState('AWAITING_APPROVAL', {
        statusLine: 'Waiting for USDC approval in wallet…',
        stateVal:   'Awaiting approval',
        fundsVal:   'No — not until transfer confirms',
        networkVal: chainConfig.name,
        eventVal:   'USDC allowance approval requested',
        actionVal:  'Approve the USDC allowance in your wallet to continue.',
      });
      try {
        const approveTx = await usdc.approve(contractAddress, totalDebit);
        setTxState('pending', 'Approval submitted — waiting for confirmation…');
        await approveTx.wait();
      } catch (err) {
        const rejected = err.code === 4001 ||
          (err.info && err.info.error && err.info.error.code === 4001);
        if (rejected) {
          setTxState('idle', 'Approval rejected. Transfer cancelled.');
          companionState('REJECTED', {
            statusLine: 'Approval rejected. Nothing was sent.',
            stateVal:   'Rejected',
            fundsVal:   'No — nothing was sent',
            networkVal: chainConfig.name,
            eventVal:   'USDC approval rejected in wallet',
            actionVal:  'Retry when ready.',
            autoOpen:   true,
          });
        } else {
          setTxState('idle', 'Approval failed: ' + (err.shortMessage || err.message || 'Unknown error'));
          companionState('FAILED', {
            statusLine: 'Approval failed. Transfer cancelled.',
            stateVal:   'Failed',
            fundsVal:   'No — transfer did not proceed',
            networkVal: chainConfig.name,
            eventVal:   err.shortMessage || err.message || 'Unknown error',
            actionVal:  'Check reason above and retry if appropriate.',
            autoOpen:   true,
          });
        }
        return;
      }
    }

    // --- Transfer ---
    setTxState('pending', 'Waiting for transfer confirmation in wallet…');
    companionState('AWAITING_APPROVAL', {
      statusLine: 'Waiting for transfer confirmation in wallet…',
      stateVal:   'Awaiting confirmation',
      fundsVal:   'No — not until confirmed on-chain',
      networkVal: chainConfig.name,
      eventVal:   'Transfer signature requested',
      actionVal:  'Confirm the transfer in your wallet.',
    });

    // Create receipt — tracks this transfer from signature request through resolution.
    // The receipt represents the transfer transaction only, not the approve step.
    const { id: receiptId } = storeReceipt({
      state:       'AWAITING_APPROVAL',
      hash:        null,
      amount:      amountStr,
      fee:         ethers.formatUnits(fee, 6),
      recipient,
      sender:      state.address,
      network:     chainConfig.name,
      chainId,
      explorerUrl: null,
      fundsMoved:  null,
    });

    try {
      const tx = await implicitex.transferWithFee(recipient, rawAmount);

      // Hash is available immediately after broadcast, before confirmation.
      updateReceipt(receiptId, { state: 'SUBMITTED', hash: tx.hash });

      setTxState('pending', 'Transfer submitted — waiting for on-chain confirmation…');
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
      setTxState('idle', null); // status already set above via innerHTML
      resolveReceipt(receiptId, { state: 'CONFIRMED', fundsMoved: true, explorerUrl: receiptUrl });
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
        resolveReceipt(receiptId, { state: 'REJECTED', fundsMoved: false });
        setTxState('idle', 'Transfer rejected in wallet.');
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
        resolveReceipt(receiptId, { state: 'FAILED', fundsMoved: false });
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
        if (els.connectBtn) {
          resetConnectButton();
        }
        setNavStatus('Testnet prep');
        resetBalanceDisplay();
        setTransferNote('');
        hidePreview();
        if (els.modules) els.modules.setAttribute('hidden', '');
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

  // ----------------------------------------------------------------
  // Public API on window.IX
  // Extend rather than replace — receipt-store.js and companion.js
  // register their own namespaces on window.IX before and after this runs.
  // ----------------------------------------------------------------
  window.IX = Object.assign(window.IX || {}, {
    connect,
    submitTransfer,
    scrollToModules,
    getState: () => ({ ...state }),
  });

})();
