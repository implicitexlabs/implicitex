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
    gweiDisplay: document.getElementById('gweiDisplay'),
    blockDisplay:document.getElementById('blockDisplay'),
    gasHeroVal:  document.getElementById('gasHeroVal'),
    networkBadge:document.getElementById('networkBadge'),
    navStatus:   document.querySelector('.nav-status'),
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
    const short = shortAddr(state.address);

    // Update nav
    if (els.walletAddr)  els.walletAddr.textContent = short;
    if (els.walletPill)  els.walletPill.classList.add('visible');
    if (els.connectBtn) {
      els.connectBtn.textContent = short;
      els.connectBtn.classList.add('connected');
    }
    setNavStatus('Wallet connected');
    if (els.networkBadge) {
      els.networkBadge.textContent = chainLabel(state.chainId);
    }

    // Reveal modules
    if (els.modules) {
      els.modules.removeAttribute('hidden');
      setTimeout(() => {
        els.modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 280);
    }

    // Start gas polling
    pollNetworkData();

    // Populate USDC balance if contract is already configured for this chain.
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
      els.txBtn.disabled = txState === 'pending';
      els.txBtn.textContent = txState === 'pending'
        ? 'Processing…'
        : (window.IX_CONFIG && window.IX_CONFIG.transfersEnabled ? 'Send USDC' : 'Preview Transfer');
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
      const balDisplay = document.getElementById('usdcBalance');
      if (balDisplay) {
        balDisplay.textContent = parseFloat(ethers.formatUnits(bal, 6)).toFixed(2) + ' USDC';
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
      try {
        const approveTx = await usdc.approve(contractAddress, totalDebit);
        setTxState('pending', 'Approval submitted — waiting for confirmation…');
        await approveTx.wait();
      } catch (err) {
        const rejected = err.code === 4001 ||
          (err.info && err.info.error && err.info.error.code === 4001);
        setTxState('idle', rejected
          ? 'Approval rejected. Transfer cancelled.'
          : 'Approval failed: ' + (err.shortMessage || err.message || 'Unknown error'));
        return;
      }
    }

    // --- Transfer ---
    setTxState('pending', 'Waiting for transfer confirmation in wallet…');
    try {
      const tx      = await implicitex.transferWithFee(recipient, rawAmount);
      setTxState('pending', 'Transfer submitted — waiting for on-chain confirmation…');
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

      refreshUsdcBalance();
    } catch (err) {
      const rejected = err.code === 4001 ||
        (err.info && err.info.error && err.info.error.code === 4001);
      setTxState('idle', rejected
        ? 'Transfer rejected in wallet.'
        : 'Transfer failed: ' + (err.reason || err.shortMessage || err.message || 'Unknown error'));
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
        if (els.modules) els.modules.setAttribute('hidden', '');
        return;
      }
      state.address = accounts[0];
      state.connected = true;
      onConnected();
    });

    window.ethereum.on('chainChanged', chainHex => {
      state.chainId = parseInt(chainHex, 16);
      if (els.networkBadge) els.networkBadge.textContent = chainLabel(state.chainId);
      refreshUsdcBalance();
    });
  }

  pollNetworkData();

  // ----------------------------------------------------------------
  // Public API on window.IX
  // ----------------------------------------------------------------
  window.IX = {
    connect,
    submitTransfer,
    scrollToModules,
    getState: () => ({ ...state }),
  };

})();
