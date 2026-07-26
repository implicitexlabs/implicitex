/**
 * mobile-menu.js — Mobile hamburger menu
 *
 * Provides the mobile navigation overlay:
 *   - Hamburger open/close
 *   - Transaction section: Open Transfer Portal
 *   - Links section: site navigation
 */

(function () {
  'use strict';

  const els = {
    hamburgerBtn:       document.getElementById('hamburgerBtn'),
    mobileMenu:         document.getElementById('mobileMenu'),
    mobileMenuClose:    document.getElementById('mobileMenuClose'),
    mobileMenuBackdrop: document.getElementById('mobileMenuBackdrop'),
    menuOpenPortalBtn:  document.getElementById('menuOpenPortalBtn'),
  };

  // ---------------------------------------------------------------------------
  // Menu open / close
  // ---------------------------------------------------------------------------

  function openMenu() {
    if (!els.mobileMenu) return;
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

})();
