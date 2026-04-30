// main.js

function showError(message, container = document.body) {
  const errorEl = document.createElement('p');
  errorEl.className = 'error';
  errorEl.textContent = message;
  container.appendChild(errorEl);
  setTimeout(() => errorEl.remove(), 5000);
}

// Dynamically load header/footer if needed
function loadComponents() {
  const headerPlaceholder = document.getElementById('header-placeholder');
  const footerPlaceholder = document.getElementById('footer-placeholder');

  if (headerPlaceholder) {
    fetch('components/header.html')
      .then(res => res.ok ? res.text() : Promise.reject('Failed to load header'))
      .then(data => {
        headerPlaceholder.innerHTML = data;
      })
      .catch(err => {
        showError(err, headerPlaceholder);
      });
  }

  if (footerPlaceholder) {
    fetch('components/footer.html')
      .then(res => res.ok ? res.text() : Promise.reject('Failed to load footer'))
      .then(data => {
        footerPlaceholder.innerHTML = data;
        const yearEl = document.getElementById('year');
        if (yearEl) {
          yearEl.textContent = new Date().getFullYear();
        }
      })
      .catch(err => {
        showError(err, footerPlaceholder);
      });
  }
}

// Show Connect/Create Transfer, handle state
function initWalletUI() {
  const connectBtn = document.getElementById('btn-connect');
  let transferBtn = document.getElementById('btn-create-transfer');

  if (transferBtn) transferBtn.remove();

  window.showWalletUI = function(address) {
    if (address) {
      connectBtn.textContent = 'Disconnect Wallet';
      connectBtn.classList.add('connected');
      if (!document.getElementById('btn-create-transfer')) {
        transferBtn = document.createElement('button');
        transferBtn.id = 'btn-create-transfer';
        transferBtn.className = 'cta-button';
        transferBtn.textContent = 'Create Transfer';
        connectBtn.parentNode.insertBefore(transferBtn, connectBtn.nextSibling);
        transferBtn.addEventListener('click', () => {
          if (window.openSendModal) window.openSendModal();
        });
      }
    } else {
      connectBtn.textContent = 'Connect Wallet';
      connectBtn.classList.remove('connected');
      const btn = document.getElementById('btn-create-transfer');
      if (btn) btn.remove();
    }
  };

  connectBtn.addEventListener('click', () => {
    if (window.userAddress) {
      window.userAddress = null;
      window.showWalletUI(null);
    } else {
      if (window.connectWallet) window.connectWallet();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadComponents();
  initWalletUI();
});

fetch('components/header/header.html')
  .then(res => res.ok ? res.text() : Promise.reject('Failed to load header'))
  .then(data => { document.getElementById('header-placeholder').innerHTML = data; })
  .catch(err => { document.getElementById('header-placeholder').innerHTML = '<p>Error loading header. Please refresh.</p>'; });
