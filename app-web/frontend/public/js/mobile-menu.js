/**
 * mobile-menu.js — Mobile hamburger menu
 *
 * Provides the mobile navigation overlay:
 *   - Hamburger open/close
 *   - Wallet section: status, sender, network, connect/switch/disconnect
 *   - Transaction section: Open Transfer Portal
 *   - Links section: site navigation
 *
 * Wallet state is read from window.IX.getState() on menu open and
 * updated via the ix:wallet-state-changed custom event while the menu
 * is open. Does not duplicate wallet.js logic — it calls window.IX.*
 * functions for all wallet actions.
 */

(function () {
  'use strict';

  const els = {
    hamburgerBtn:      document.getElementById('hamburgerBtn'),
    mobileMenu:        document.getElementById('mobileMenu'),
    mobileMenuClose:   document.getElementById('mobileMenuClose'),
    mobileMenuBackdrop:document.getElementById('mobileMenuBackdrop'),
    menuWalletStatus:  document.getElementById('menuWalletStatus'),
    menuSenderDisplay: document.getElementById('menuSenderDisplay'),
    menuNetworkDisplay:document.getElementById('menuNetworkDisplay'),
    menuConnectBtn:    document.getElementById('menuConnectBtn'),
    menuSwitchBtn:     document.getElementById('menuSwitchBtn'),
    menuDisconnectBtn: document.getElementById('menuDisconnectBtn'),
    menuOpenPortalBtn: document.getElementById('menuOpenPortalBtn'),
  };

  // ----------------------------------------------------------------
  // Open / close
  // ----------------------------------------------------------------
  function openMenu() {
    if (!els.mobileMenu) return;
    els.mobileMenu.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    if (els.hamburgerBtn) els.hamburgerBtn.setAttribute('aria-expanded', 'true');
    updateMenuWalletState();
  }

  function closeMenu() {
    if (!els.mobileMenu) return;
    els.mobileMenu.setAttribute('hidden', '');
    document.body.style.overflow = '';
    if (els.hamburgerBtn) els.hamburgerBtn.setAttribute('aria-expanded', 'false');
  }

  // ----------------------------------------------------------------
  // Wallet state display — reads from window.IX.getState()
  // ----------------------------------------------------------------
  function shortAddr(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function chainLabel(chainId) {
    if (!chainId) return '';
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[chainId];
    if (chainConfig) return chainConfig.name;
    const known = {
      1: 'Ethereum Mainnet', 137: 'Polygon Mainnet',
      11155111: 'Sepolia', 80002: 'Polygon Amoy',
    };
    return known[chainId] || 'Chain ' + chainId;
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute('hidden', ''); else el.removeAttribute('hidden');
  }

  function updateMenuWalletState() {
    if (!window.IX || typeof window.IX.getState !== 'function') return;
    const s = window.IX.getState();

    const connected = s.connected && s.address;

    if (els.menuWalletStatus) {
      if (s.connecting) {
        els.menuWalletStatus.textContent = 'Connecting…';
      } else if (connected) {
        const isLive = window.IX_CHAINS &&
          window.IX_CHAINS[s.chainId] &&
          window.IX_CHAINS[s.chainId].transfersEnabled &&
          window.IX_CONFIG && window.IX_CONFIG.transfersEnabled;

        if (!window.IX_CHAINS || !window.IX_CHAINS[s.chainId]) {
          els.menuWalletStatus.textContent = 'Wrong network — switch to Polygon.';
        } else if (!isLive) {
          els.menuWalletStatus.textContent = 'Unsupported transfer network.';
        } else {
          els.menuWalletStatus.textContent = 'Connected · ' + chainLabel(s.chainId);
        }
      } else {
        els.menuWalletStatus.textContent = s.userDisconnected
          ? 'Wallet disconnected.'
          : 'No wallet connected.';
      }
    }

    if (els.menuSenderDisplay) {
      if (connected) {
        els.menuSenderDisplay.textContent = 'Sender: ' + shortAddr(s.address);
      }
      setHidden(els.menuSenderDisplay, !connected);
    }

    if (els.menuNetworkDisplay) {
      if (connected && s.chainId) {
        els.menuNetworkDisplay.textContent = 'Network: ' + chainLabel(s.chainId);
      }
      setHidden(els.menuNetworkDisplay, !connected || !s.chainId);
    }

    // Button visibility
    if (els.menuConnectBtn) {
      els.menuConnectBtn.textContent = connected ? 'Switch to Polygon' : 'Connect Wallet';
      // Show connect when disconnected; show switch-to-polygon when connected on wrong network
      const isLive = connected && window.IX_CHAINS &&
        window.IX_CHAINS[s.chainId] &&
        window.IX_CHAINS[s.chainId].transfersEnabled &&
        window.IX_CONFIG && window.IX_CONFIG.transfersEnabled;
      setHidden(els.menuConnectBtn, isLive);
    }
    setHidden(els.menuSwitchBtn, !connected);
    setHidden(els.menuDisconnectBtn, !connected);
  }

  // ----------------------------------------------------------------
  // Button actions
  // ----------------------------------------------------------------
  if (els.hamburgerBtn) {
    els.hamburgerBtn.addEventListener('click', openMenu);
  }

  if (els.mobileMenuClose) {
    els.mobileMenuClose.addEventListener('click', closeMenu);
  }

  if (els.mobileMenuBackdrop) {
    els.mobileMenuBackdrop.addEventListener('click', closeMenu);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && els.mobileMenu && !els.mobileMenu.hidden) {
      closeMenu();
    }
  });

  if (els.menuConnectBtn) {
    els.menuConnectBtn.addEventListener('click', () => {
      closeMenu();
      if (window.IX && window.IX.openOrConnect) window.IX.openOrConnect();
    });
  }

  if (els.menuSwitchBtn) {
    els.menuSwitchBtn.addEventListener('click', () => {
      closeMenu();
      if (window.IX && window.IX.requestAccountSelection) window.IX.requestAccountSelection();
    });
  }

  if (els.menuDisconnectBtn) {
    els.menuDisconnectBtn.addEventListener('click', () => {
      closeMenu();
      if (window.IX && window.IX.disconnect) window.IX.disconnect({ revokeProvider: true });
    });
  }

  if (els.menuOpenPortalBtn) {
    els.menuOpenPortalBtn.addEventListener('click', () => {
      closeMenu();
      if (window.IX && window.IX.openOrConnect) window.IX.openOrConnect();
    });
  }

  // ----------------------------------------------------------------
  // Keep menu wallet state in sync while open
  // ----------------------------------------------------------------
  window.addEventListener('ix:wallet-state-changed', () => {
    if (els.mobileMenu && !els.mobileMenu.hidden) {
      updateMenuWalletState();
    }
  });

})();
