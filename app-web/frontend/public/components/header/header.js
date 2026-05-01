document.addEventListener('DOMContentLoaded', () => {
  // Wallet connect
  const connectButton = document.getElementById('btn-connect');
  if (connectButton) {
    connectButton.addEventListener('click', () => {
      if (typeof window.connectWallet === 'function') {
        window.connectWallet();
        return;
      }
      console.warn('connectWallet is not available on window; wallet runtime is not initialized.');
    });
  }

  // Theme toggle
  const themeToggle = document.getElementById('btn-theme-toggle');
  if (!themeToggle) return;

  function updateToggleLabel() {
    const current = document.documentElement.dataset.theme || 'dark';
    if (current === 'dark') {
      themeToggle.textContent = '☀ LIGHT';
      themeToggle.setAttribute('aria-label', 'Switch to light mode');
    } else {
      themeToggle.textContent = '☾ DARK';
      themeToggle.setAttribute('aria-label', 'Switch to dark mode');
    }
  }

  updateToggleLabel();

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('implicitex-theme', next);
    updateToggleLabel();
  });
});
