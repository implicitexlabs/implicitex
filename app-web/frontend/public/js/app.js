/**
 * app.js — ImplicitEx application init
 * Runs after all other scripts.
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Logo mark
  // Builds a pixel grid from a pattern until the real logomark SVG
  // is dropped into assets/logomark.svg and the <img> tag is
  // uncommented in index.html.
  // ----------------------------------------------------------------
  function buildLogoMark() {
    const el = document.getElementById('logoMark');
    if (!el) return;

    // 5×4 pixel pattern — replace with actual logomark geometry
    // 1 = filled pixel, 0 = empty
    const pattern = [
      1, 0, 1, 0, 1,
      1, 1, 0, 1, 0,
      0, 1, 1, 0, 1,
      1, 0, 1, 1, 0,
    ];

    el.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(5,4px)',
      'grid-template-rows:repeat(4,4px)',
      'gap:2px',
      'width:26px',
      'height:22px',
      'align-content:center',
    ].join(';');

    pattern.forEach(on => {
      const px = document.createElement('span');
      px.style.cssText = [
        'display:block',
        on
          ? 'background:var(--logo-pixel)'
          : 'background:transparent',
      ].join(';');
      el.appendChild(px);
    });
  }

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
    buildLogoMark();
    initThemeToggle();

    // Swap logo placeholder for real logomark when asset exists
    // Uncomment the lines below and comment out buildLogoMark() above:
    //
    // const placeholder = document.getElementById('logoMark');
    // const img = document.createElement('img');
    // img.src = 'assets/logomark.svg';
    // img.className = 'logo-mark';
    // img.alt = '';
    // img.setAttribute('aria-hidden', 'true');
    // placeholder.replaceWith(img);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
