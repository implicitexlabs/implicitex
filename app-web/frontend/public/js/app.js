/**
 * app.js — ImplicitEx application init
 * Runs after all other scripts.
 */

(function () {
  'use strict';

  function initThemeToggle() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;

    const saved = safeStorageGet('implicitex-theme');
    const initial = saved === 'light' || saved === 'dark' ? saved : 'dark';

    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
      );
      btn.textContent = theme === 'light' ? 'Dark' : 'Light';
      safeStorageSet('implicitex-theme', theme);
    }

    applyTheme(initial);
    btn.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      applyTheme(current === 'light' ? 'dark' : 'light');
    });
  }

  function initRevealCopy() {
    const items = Array.from(document.querySelectorAll('.reveal-copy'));
    if (!items.length) return;

    if (!window.matchMedia('(max-width: 768px)').matches || !('IntersectionObserver' in window)) {
      items.forEach(item => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    items.forEach(item => observer.observe(item));
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      // Theme persistence is optional; the active page state still updates.
    }
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------
  function init() {
    initThemeToggle();
    initRevealCopy();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
