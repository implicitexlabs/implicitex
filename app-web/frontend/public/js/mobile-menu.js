/**
 * mobile-menu.js — Mobile hamburger menu
 *
 * Provides the mobile navigation overlay:
 *   - Hamburger open/close
 *   - Transaction section: Open Transfer Portal
 *   - Links section: site navigation
 *   - Wallet controls: connect/disconnect + status sync
 *
 * The homepage menu is launch-only. It does not read transaction state or
 * initialize transaction runtime.
 */

(function () {
  'use strict';

  const els = {
    hamburgerBtn:       document.getElementById('hamburgerBtn'),
    mobileMenu:         document.getElementById('mobileMenu'),
    mobileMenuClose:    document.getElementById('mobileMenuClose'),
    mobileMenuBackdrop: document.getElementById('mobileMenuBackdrop'),
    menuOpenPortalBtn:  document.getElementById('menuOpenPortalBtn'),
    menuConnectBtn:     document.getElementById('menuConnectBtn'),
    menuDisconnectBtn:  document.getElementById('menuDisconnectBtn'),
    menuWalletStatus:   document.getElementById('menuWalletStatus'),
  };

  // ---------------------------------------------------------------------------
  // Wallet state sync
  // ---------------------------------------------------------------------------

  function syncMobileWalletState() {
    if (!els.menuConnectBtn && !els.menuDisconnectBtn && !els.menuWalletStatus) return;

    if (!window.IX || typeof window.IX.getState !== 'function') {
      if (els.menuWalletStatus)   els.menuWalletStatus.textContent = 'Wallet unavailable.';
      if (els.menuConnectBtn)     els.menuConnectBtn.removeAttribute('hidden');
      if (els.menuDisconnectBtn)  els.menuDisconnectBtn.setAttribute('hidden', '');
      return;
    }

    const state = window.IX.getState();
    const addr  = state && state.address;

    if (addr) {
      if (els.menuWalletStatus)   els.menuWalletStatus.textContent = addr.slice(0, 6) + '\u2026' + addr.slice(-4);
      if (els.menuConnectBtn)     els.menuConnectBtn.setAttribute('hidden', '');
      if (els.menuDisconnectBtn)  els.menuDisconnectBtn.removeAttribute('hidden');
    } else {
      if (els.menuWalletStatus)   els.menuWalletStatus.textContent = 'No wallet connected.';
      if (els.menuConnectBtn)     els.menuConnectBtn.removeAttribute('hidden');
      if (els.menuDisconnectBtn)  els.menuDisconnectBtn.setAttribute('hidden', '');
    }
  }

  window.addEventListener('ix:wallet-state-changed', syncMobileWalletState);

  // Run once on load so the menu reflects current state before it is opened.
  syncMobileWalletState();

  // ---------------------------------------------------------------------------
  // Menu open / close
  // ---------------------------------------------------------------------------

  function openMenu() {
    if (!els.mobileMenu) return;
    syncMobileWalletState();
    els.mobileMenu.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    if (els.hamburgerBtn) els.hamburgerBtn.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!els.mobileMenu) return;
    els.mobileMenu.setAttribute('hidden', '');
    document.body.style.overflow = '';
    if (els.hamburgerBtn) els.hamburgerBtn.setAttribute('aria-expanded', 'false');
  }

  if (els.hamburgerBtn) {
    els.hamburgerBtn.addEventListener('click', openMenu);
  }

  if (els.mobileMenuClose) {
    els.mobileMenuClose.addEventListener('click', closeMenu);
  }

  if (els.mobileMenuBackdrop) {
    els.mobileMenuBackdrop.addEventListener('click', closeMenu);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.mobileMenu && !els.mobileMenu.hidden) {
      closeMenu();
    }
  });

  if (els.menuOpenPortalBtn) {
    els.menuOpenPortalBtn.addEventListener('click', () => {
      closeMenu();
      window.location.href = 'https://portal.implicitex.com/';
    });
  }

  // ---------------------------------------------------------------------------
  // Wallet connect button
  // ---------------------------------------------------------------------------

  if (els.menuConnectBtn) {
    els.menuConnectBtn.addEventListener('click', async () => {
      if (!window.IX) return;
      els.menuConnectBtn.disabled = true;
      els.menuConnectBtn.textContent = 'Connecting\u2026';
      try {
        await window.IX.connect();
      } catch (e) {
        // wallet.js surfaces its own errors; swallow here.
      }
      els.menuConnectBtn.disabled = false;
      els.menuConnectBtn.textContent = 'CONNECT WALLET';
    });
  }

  // ---------------------------------------------------------------------------
  // Wallet disconnect button
  // ---------------------------------------------------------------------------

  if (els.menuDisconnectBtn) {
    els.menuDisconnectBtn.addEventListener('click', async () => {
      if (!window.IX) return;
      els.menuDisconnectBtn.disabled = true;
      try {
        await window.IX.disconnect();
      } catch (e) {
        // wallet.js surfaces its own errors; swallow here.
      }
      els.menuDisconnectBtn.disabled = false;
    });
  }

})();
