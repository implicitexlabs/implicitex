window.userAddress = null;

// Helper: Mask an address (e.g., 0xAb12...cD34)
function maskAddress(address) {
  if (!address || address.length < 10) return address || '';
  return address.slice(0, 6) + '...' + address.slice(-4);
}

// UI: update Connect Wallet button state
function updateConnectButton(address) {
  const connectBtn = document.getElementById('btn-connect');
  if (!connectBtn) return;
  if (address) {
    connectBtn.textContent = maskAddress(address);
    connectBtn.classList.add('connected');
  } else {
    connectBtn.textContent = "Connect Wallet";
    connectBtn.classList.remove('connected');
  }
}

// Set global state and update UI
function showWalletAddress(address) {
  window.userAddress = address;
  updateConnectButton(address);
  if (window.showWalletUI) window.showWalletUI(address);
}

// Connect Wallet Logic (MetaMask/EIP-1193)
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    openModal({content: 'No wallet detected. Please install MetaMask or another Web3 wallet.', disableConfirm: true});
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts && accounts.length > 0) {
      showWalletAddress(accounts[0]);
      closeModal();
    } else {
      openModal({content: 'No wallet address returned.', disableConfirm: true});
    }
  } catch (err) {
    openModal({content: `Failed to connect wallet: ${err.message || err}`, disableConfirm: true});
  }
}

window.connectWallet = connectWallet;

// Attach Connect Wallet button event
document.addEventListener('DOMContentLoaded', function () {
  const connectBtn = document.getElementById('btn-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', connectWallet);
  }
});

async function checkWalletOnLoad() {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts && accounts.length > 0) {
        showWalletAddress(accounts[0]);
      } else {
        showWalletAddress(null);
      }
    } catch (err) {
      showWalletAddress(null);
    }
  } else {
    showWalletAddress(null);
  }
}
document.addEventListener('DOMContentLoaded', checkWalletOnLoad);

if (typeof window.ethereum !== 'undefined' && window.ethereum.on) {
  window.ethereum.on('accountsChanged', function(accounts) {
    if (accounts && accounts.length > 0) {
      showWalletAddress(accounts[0]);
    } else {
      showWalletAddress(null);
    }
  });
}

// ===================== CHAIN CONFIG =====================

// Reads window.ImplicitExChains (set by /config/chains.js if loaded).
// Falls back to a disabled state if the config file is absent or malformed.
function getChainConfig() {
  if (window.ImplicitExChains && typeof window.ImplicitExChains === 'object') {
    return window.ImplicitExChains;
  }
  return { transfersEnabled: false, supportedChains: {} };
}

// ===================== NETWORK SWITCHING =====================

const POLYGON_CHAIN_ID = "0x89"; // Polygon mainnet (hex) — fallback only

async function requestSwitchToPolygon() {
  if (!window.ethereum) return alert("No wallet detected");

  const config = getChainConfig();
  const chainIds = Object.keys(config.supportedChains);
  if (chainIds.length === 0) {
    alert("No supported networks are configured in this build. Network switching is not available.");
    return;
  }

  // Use the first supported chain from config; fall back to hardcoded Polygon.
  const targetChainId = chainIds[0] || POLYGON_CHAIN_ID;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }]
    });
    // No alert needed—user will see MetaMask switch, modal updates after
  } catch (switchError) {
    if (switchError.code === 4902) {
      alert("This wallet does not have the required network configured.");
    } else {
      alert("Switching failed or was rejected.");
    }
  }
}

// ===================== GAS ESTIMATE =====================

async function estimateGas(recipient, amount) {
  const gasEl = document.getElementById('gas-display');
  if (!gasEl) return;

  if (!window.ethereum || !window.userAddress) {
    gasEl.textContent = '—';
    return;
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();

    // Resolve USDC address from chain config; bail if this chain is not configured.
    const chainHex = '0x' + network.chainId.toString(16);
    const chainEntry = getChainConfig().supportedChains[chainHex];
    if (!chainEntry || !chainEntry.usdcAddress) {
      gasEl.textContent = '—';
      return;
    }
    const USDC_ADDRESS = chainEntry.usdcAddress;
    const gasUnit = chainEntry.name || chainHex;

    const ERC20_ABI = [
      "function transfer(address to, uint256 value) public returns (bool)",
      "function decimals() view returns (uint8)"
    ];
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
    const decimals = await usdc.decimals();

    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient) || isNaN(amount) || amount <= 0) {
      gasEl.textContent = '—';
      return;
    }

    const value = ethers.parseUnits(amount.toString(), decimals);
    const txReq = await usdc.populateTransaction.transfer(recipient, value);

    const gas = await provider.estimateGas({
      ...txReq,
      from: await signer.getAddress(),
      to: USDC_ADDRESS
    });

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
    if (!gasPrice) {
      gasEl.textContent = 'n/a';
      return;
    }
    // Gas * gasPrice = total cost in wei
    const gasCost = ethers.formatUnits(gas * gasPrice, 'ether');
    gasEl.textContent = `${parseFloat(gasCost).toFixed(6)} ${gasUnit}`;
  } catch (e) {
    gasEl.textContent = 'n/a';
  }
}

// ===================== SEND MODAL LOGIC =====================

window.openSendModal = function () {
  let fullAddressShown = false;
  let copiedShown = false;
  let currentUsdcBalance = 100; // Demo value
  let currentEthBalance = 0.1; // Demo value

  let recipientValue = '';
  let amountValue = '';
  let validRecipient = false;
  let validAmount = false;
  let inConfirmStep = false;

  function validateEthAddress(addr) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }

  function renderModalContent() {
    const transferFee = amountValue && !isNaN(amountValue) ? (parseFloat(amountValue) * 0.01) : 0;
    const transferTotal = amountValue && !isNaN(amountValue) ? (parseFloat(amountValue) + transferFee) : 0;
    validAmount = !!amountValue && !isNaN(amountValue) && parseFloat(amountValue) > 0 && parseFloat(amountValue) + transferFee <= currentUsdcBalance;
    validRecipient = validateEthAddress(recipientValue);

    let addressDisplay = fullAddressShown ? window.userAddress : maskAddress(window.userAddress);
    let copyNotice = copiedShown ? '<span class="status-success">Copied!</span>' : 'Click to reveal. Double-click to copy.';

    let recipientValidation = '';
    if (recipientValue.length > 0) {
      if (/^0x[a-fA-F0-9]*$/.test(recipientValue)) {
        if (recipientValue.length === 42) {
          recipientValidation = validateEthAddress(recipientValue)
            ? '<span class="status-success">Valid address ✔</span>'
            : '<span class="status-error">Invalid address</span>';
        } else {
          recipientValidation = '';
        }
      } else {
        recipientValidation = '<span class="status-error">Invalid character</span>';
      }
    }

    let amountWarning = '';
    if (amountValue && !isNaN(amountValue)) {
      const val = parseFloat(amountValue);
      if (val + (val * 0.01) > currentUsdcBalance) {
        amountWarning = '<span class="status-error">Amount exceeds balance.</span>';
      }
    }

    let gasSection = `
      <div style="margin-top:0.6em;font-size:0.97em;">
        <b>Network Fees</b><br>
        Gas (ETH): <span id="eth-gas-display">—</span> | Gas (Polygon): <span id="polygon-gas-display">—</span><br>
        <button id="switch-network" class="switch-network-btn">Switch Network</button>
      </div>
    `;

    const transfersEnabled = getChainConfig().transfersEnabled;
    const disabledBanner = !transfersEnabled
      ? `<div class="config-disabled-banner">Live transfers are not yet enabled in this build. This is a demo only.</div>`
      : '';

    if (!inConfirmStep) {
      return `
        <form id="send-usdc-form" autocomplete="off" style="display:flex;flex-direction:column;gap:1.13em;">
          ${disabledBanner}
          <div>
            <label style="font-weight:600;">Address</label>
            <div id="user-address-display" class="modal-address${fullAddressShown ? ' expanded' : ''}" tabindex="0">
              ${addressDisplay}
            </div>
            <div style="font-size:0.92em;opacity:0.77;margin-top:4px;" id="user-address-copy-notice">${copyNotice}</div>
          </div>
          <div>
            <label style="font-weight:600;">Balance(s)</label>
            <div class="output-field">
              USDC: ${currentUsdcBalance} &nbsp;|&nbsp; ETH: ${currentEthBalance}
            </div>
          </div>
          <hr style="opacity:0.1;margin:1em 0;">
          <div>
            <label style="font-weight:600;">Recipient Address</label>
            <input id="recipient-address-input" type="text" placeholder="0x..." maxlength="42" value="${recipientValue || ''}" autocomplete="off" autocorrect="off" spellcheck="false">
            <div id="recipient-validation-msg" style="font-size:0.92em;margin-top:2px;">${recipientValidation}</div>
          </div>
          <div>
            <label style="font-weight:600;">Amount (USDC)</label>
            <input id="amount-input" type="number" min="0" step="0.01" placeholder="0.00" value="${amountValue || ''}" inputmode="decimal" autocomplete="off">
            <div id="amount-warning-msg" style="font-size:0.92em;margin-top:2px;${amountWarning ? '' : 'display:none;'}">${amountWarning}</div>
          </div>
          <div>
            <div style="font-size:0.97em; color:var(--color-light-gray); margin-top:0.2em;">
            <span>Transfer Fee (USDC): <span id="fee-output">${transferFee.toFixed(2)}</span></span><br></div>
            <span>Transfer Total (USDC): <span id="total-output" class="total-highlight">${transferTotal.toFixed(2)}</span></span>
            <div>Estimated Gas (ETH/MATIC): <span id="gas-display">—</span></div>
          </div>
          ${gasSection}
        </form>
      `;
    } else {
      return `
        <div style="text-align:center;">
          <h2>Review Demo Transfer</h2>
          <div style="font-size:1.07em;margin-bottom:1.2em;">
            You are sending <b>${amountValue} USDC</b> to<br>
            <span style="font-family:var(--font-mono);color:var(--color-light-gray);word-break:break-all;">${maskAddress(recipientValue)}</span>
          </div>
          <div style="margin:0.6em 0 0.2em 0;">
            <span>1% platform fee: <b>${(parseFloat(amountValue) * 0.01).toFixed(2)} USDC</b></span><br>
            <span>Estimated gas fees (see above for details).</span>
          </div>
          <div style="margin-top:1em;">
            <span class="total-highlight">Demo estimate: ${(parseFloat(amountValue)+parseFloat(amountValue)*0.01).toFixed(2)} USDC + gas fees</span>
          </div>
        </div>
      `;
    }
  }

  function openModalAndSetup() {
    openModal({
      content: renderModalContent(),
      confirmText: inConfirmStep ? "Complete Demo" : "Continue",
      cancelText: "Cancel",
      disableConfirm: (!inConfirmStep && !(validRecipient && validAmount)),
      onConfirm: () => {
        if (!inConfirmStep) {
          inConfirmStep = true;
          openModalAndSetup();
        } else {
          closeModal();
          setTimeout(() => {
            openModal({
              content: `<h2>Demo Complete</h2><p>No on-chain transfer was executed in this build.<br>Demo amount: ${amountValue} USDC to ${maskAddress(recipientValue)}.<br>Demo fee: ${(parseFloat(amountValue)*0.01).toFixed(2)} USDC.</p>`,
              confirmText: "OK",
              cancelText: "",
              disableConfirm: false,
              onConfirm: () => closeModal()
            });
          }, 220);
        }
      },
      onCancel: () => {
        closeModal();
      }
    });

    setTimeout(() => {
      // Address reveal/copy
      const addressDiv = document.getElementById('user-address-display');
      if (addressDiv) {
        addressDiv.onclick = () => {
          fullAddressShown = !fullAddressShown;
          copiedShown = false;
          openModalAndSetup();
        };
        addressDiv.ondblclick = () => {
          if (window.userAddress) {
            navigator.clipboard.writeText(window.userAddress).then(() => {
              copiedShown = true;
              fullAddressShown = true;
              openModalAndSetup();
            });
          }
        };
      }

      // Recipient input
      const recipientInput = document.getElementById('recipient-address-input');
      const recipientMsg = document.getElementById('recipient-validation-msg');
      if (recipientInput) {
        recipientInput.value = recipientValue;
        recipientInput.addEventListener('input', (e) => {
          recipientValue = e.target.value.trim();
          if (recipientValue === '' || recipientValue === '0' || recipientValue === '0x') {
            recipientInput.classList.remove('input-valid', 'input-invalid');
            recipientMsg.textContent = '';
            estimateGas('', amountValue);
            if (window.estimateGasBothNetworks) {
              window.estimateGasBothNetworks('', amountValue);
            }
            return;
          }
          if (/^0x[a-fA-F0-9]*$/.test(recipientValue)) {
            if (recipientValue.length === 42) {
              if (validateEthAddress(recipientValue)) {
                recipientInput.classList.add('input-valid');
                recipientInput.classList.remove('input-invalid');
                recipientMsg.innerHTML = '<span class="status-success">Valid address ✔</span>';
              } else {
                recipientInput.classList.add('input-invalid');
                recipientInput.classList.remove('input-valid');
                recipientMsg.innerHTML = '<span class="status-error">Invalid address</span>';
              }
            } else {
              recipientInput.classList.remove('input-valid', 'input-invalid');
              recipientMsg.textContent = '';
            }
          } else {
            recipientInput.classList.remove('input-valid');
            recipientInput.classList.add('input-invalid');
            recipientMsg.innerHTML = '<span class="status-error">Invalid character</span>';
          }
          estimateGas(recipientValue, amountValue);
          if (window.estimateGasBothNetworks) {
            window.estimateGasBothNetworks(recipientValue, amountValue);
          }
        });
      }

      // Amount input
      const amountInput = document.getElementById('amount-input');
      const feeOutput = document.getElementById('fee-output');
      const totalOutput = document.getElementById('total-output');
      const warningMsg = document.getElementById('amount-warning-msg');
      if (amountInput) {
        amountInput.value = amountValue;
        amountInput.addEventListener('keydown', (e) => {
          if (
            !/[0-9.]/.test(e.key) &&
            !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key)
          ) {
            e.preventDefault();
          }
        });
        amountInput.addEventListener('input', (e) => {
          amountValue = e.target.value;
          const val = parseFloat(amountValue);
          const fee = isNaN(val) ? 0 : val * 0.01;
          const total = isNaN(val) ? 0 : val + fee;
          feeOutput.textContent = fee.toFixed(2);
          totalOutput.textContent = total.toFixed(2);

          if (!/^\d*\.?\d*$/.test(amountValue) || isNaN(val) || val <= 0) {
            amountInput.classList.remove('input-valid');
            amountInput.classList.add('input-invalid');
            warningMsg.style.display = 'block';
            warningMsg.textContent = 'Only positive numbers allowed.';
            estimateGas(recipientValue, '');
            if (window.estimateGasBothNetworks) {
              window.estimateGasBothNetworks(recipientValue, '');
            }
            return;
          }
          if (val + fee > currentUsdcBalance) {
            amountInput.classList.remove('input-valid');
            amountInput.classList.add('input-invalid');
            warningMsg.style.display = 'block';
            warningMsg.textContent = 'Amount exceeds balance.';
            estimateGas(recipientValue, amountValue);
            if (window.estimateGasBothNetworks) {
              window.estimateGasBothNetworks(recipientValue, amountValue);
            }
            return;
          }
          amountInput.classList.remove('input-invalid');
          amountInput.classList.add('input-valid');
          warningMsg.style.display = 'none';
          estimateGas(recipientValue, amountValue);
          if (window.estimateGasBothNetworks) {
            window.estimateGasBothNetworks(recipientValue, amountValue);
          }
        });
      }

      // --- Network Switch: Actually switch network and update gas estimate ---
      const switchNetBtn = document.getElementById('switch-network');
      if (switchNetBtn) {
        switchNetBtn.onclick = async () => {
          await requestSwitchToPolygon();
          estimateGas(recipientValue, amountValue);
          if (window.estimateGasBothNetworks) {
            window.estimateGasBothNetworks(recipientValue, amountValue);
          }
        };
      }
    }, 10);
  }

  openModalAndSetup();
};
