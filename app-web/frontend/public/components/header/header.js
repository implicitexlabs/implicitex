document.addEventListener('DOMContentLoaded', () => {
  const connectButton = document.getElementById('btn-connect');
  if (!connectButton) return;

  connectButton.addEventListener('click', () => {
    if (typeof window.connectWallet === 'function') {
      window.connectWallet();
      return;
    }

    console.warn('connectWallet is not available on window; wallet runtime is not initialized.');
  });
});
