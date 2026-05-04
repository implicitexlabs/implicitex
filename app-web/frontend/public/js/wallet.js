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
    networkPollTimer: null,
  };

  const DEMO_FEE_RATE = 0.01;
  const POLYGON_GAS_STATION_URL = 'https://gasstation.polygon.technology/v2';

  // ----------------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------------
  const els = {
    connectBtn:  document.getElementById('connectBtn'),
    walletPill:  document.getElementById('walletPill'),
    walletAddr:  document.getElementById('walletAddr'),
    modules:     document.getElementById('modules'),
    txStatus:    document.getElementById('txStatus'),
    txBtn:       document.getElementById('txBtn'),
    feeDisplay:  document.getElementById('feeDisplay'),
    amtIn:       document.getElementById('txAmount'),
    gweiDisplay: document.getElementById('gweiDisplay'),
    blockDisplay:document.getElementById('blockDisplay'),
    gasHeroVal:  document.getElementById('gasHeroVal'),
    networkBadge:document.getElementById('networkBadge'),
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

  // ----------------------------------------------------------------
  // Connect wallet
  // ----------------------------------------------------------------
  async function connect() {
    if (state.connected) return;

    if (!window.ethereum || !window.ethereum.request) {
      setStatus('No injected wallet detected. Install MetaMask or another EIP-1193 wallet.');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) {
        setStatus('No wallet account returned.');
        return;
      }

      state.connected = true;
      state.address = accounts[0];
      state.provider = window.ethereum;

      const chainHex = await window.ethereum.request({ method: 'eth_chainId' });
      state.chainId = parseInt(chainHex, 16);
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Wallet connection rejected.');
      return;
    }

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
  // Submit transfer
  // ----------------------------------------------------------------
  async function submitTransfer() {
    const recipient = document.getElementById('txRecipient')?.value?.trim();
    const amount    = parseFloat(els.amtIn?.value);

    if (!recipient || !recipient.startsWith('0x')) {
      setStatus('Enter a valid recipient address.');
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      setStatus('Enter a valid amount.');
      return;
    }

    if (!window.IX_CONFIG || window.IX_CONFIG.transfersEnabled !== true) {
      const fee = calcFee(amount);
      const total = amount + fee;
      setStatus(`Preview only. Fee ${fee.toFixed(6)} USDC; total debit ${total.toFixed(6)} USDC. Live transfers disabled.`);
      return;
    }

    // TODO (production): wire real transferWithFee flow here
    // Full production flow:
    //
    // 1. Detect active chain — reject if unsupported
    // 2. Read config from IX_CHAINS[chainId]
    // 3. Instantiate USDC contract (ERC-20)
    // 4. Instantiate ImplicitExTransfer contract
    // 5. Read fee, min, precision from contract
    // 6. Validate amount >= min transfer
    // 7. Check USDC balance
    // 8. Check USDC allowance
    // 9. If allowance insufficient: request approve()
    //    - setStatus('Approval pending…')
    //    - await approveTx.wait()
    // 10. Call transferWithFee(recipient, rawAmount)
    //    - setStatus('Transfer pending…')
    //    - await transferTx.wait()
    // 11. Show explorer receipt link
    //
    setStatus('Live transfer path is intentionally blocked in this build.');
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
          els.connectBtn.textContent = 'Connect Wallet';
          els.connectBtn.classList.remove('connected');
        }
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
