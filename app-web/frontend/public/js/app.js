/**
 * app.js — ImplicitEx application init
 * Runs after all other scripts.
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Storage helpers
  // ----------------------------------------------------------------
  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {
      // Theme persistence is optional; the active page state still updates.
    }
  }

  // ----------------------------------------------------------------
  // Theme — shared across both toggles
  // ----------------------------------------------------------------

  // Returns 'light' or 'dark' based on local hour (7 AM–7 PM = light).
  function themeForTime() {
    var h = new Date().getHours();
    return (h >= 7 && h < 19) ? 'light' : 'dark';
  }

  // Applies theme to DOM, syncs both toggle button states, saves to localStorage.
  // Calling this records a user intent — do not call it for auto-detection.
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    safeStorageSet('implicitex-theme', theme);
    syncToggleStates(theme);
  }

  // Syncs aria attributes on both toggle buttons without touching localStorage.
  function syncToggleStates(theme) {
    var manualBtn = document.getElementById('themeToggle');
    if (manualBtn) {
      manualBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      manualBtn.setAttribute(
        'aria-label',
        theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
      );
    }
    // Clock button has no pressed state — aria-label stays static.
  }

  // ----------------------------------------------------------------
  // Manual theme toggle (split-circle icon)
  // ----------------------------------------------------------------
  function initThemeToggle() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;

    // Inline <head> script already applied the theme to <html>.
    // Sync the button's aria state to match without re-writing localStorage.
    syncToggleStates(document.documentElement.dataset.theme || 'dark');

    btn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
    });
  }

  // ----------------------------------------------------------------
  // Clock toggle — applies time-appropriate theme on click,
  // displays actual current time on the clock face.
  // ----------------------------------------------------------------
  function initClockToggle() {
    var btn = document.getElementById('clockToggle');
    if (!btn) return;

    var hourHand   = document.getElementById('clockHourHand');
    var minuteHand = document.getElementById('clockMinuteHand');

    function setClockHands() {
      var now = new Date();
      var h   = now.getHours() % 12;
      var m   = now.getMinutes();
      // Hour hand: 30° per hour + 0.5° per minute (smooth position between hours)
      var hourAngle   = h * 30 + m * 0.5;
      // Minute hand: 6° per minute
      var minuteAngle = m * 6;
      if (hourHand)   hourHand.setAttribute('transform',   'rotate(' + hourAngle   + ',7,7)');
      if (minuteHand) minuteHand.setAttribute('transform', 'rotate(' + minuteAngle + ',7,7)');
    }

    setClockHands();

    btn.addEventListener('click', function () {
      applyTheme(themeForTime());
    });
  }

  // ----------------------------------------------------------------
  // Reveal-on-scroll animation
  // ----------------------------------------------------------------
  function initRevealCopy() {
    var items = Array.from(document.querySelectorAll('.reveal-copy'));
    if (!items.length) return;

    if (!window.matchMedia('(max-width: 768px)').matches || !('IntersectionObserver' in window)) {
      items.forEach(function (item) { item.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    items.forEach(function (item) { observer.observe(item); });
  }

  // ----------------------------------------------------------------
  // Hero slide rotation — Identity → Utility → Verification
  // 6s per slide, 700ms crossfade. Locks to slide 1 for reduced-motion.
  // ----------------------------------------------------------------
  function initHeroSlides() {
    var slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var current = 0;

    function advance() {
      slides[current].classList.remove('is-active');
      slides[current].setAttribute('aria-hidden', 'true');
      current = (current + 1) % slides.length;
      slides[current].classList.add('is-active');
      slides[current].setAttribute('aria-hidden', 'false');
    }

    setInterval(advance, 14000);
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------
  function init() {
    initThemeToggle();
    initClockToggle();
    initRevealCopy();
    initHeroSlides();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
