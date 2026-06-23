/**
 * consent.js — Analytics consent banner.
 *
 * Reads and writes a single localStorage key: 'implicitex-analytics-consent'
 * Values: 'accepted' | 'declined' | (absent = no decision yet)
 *
 * Behavior:
 *   - If consent is 'accepted': activate IX._analyticsEnabled and fire page_view.
 *   - If consent is 'declined': do nothing (IX._analyticsEnabled stays false).
 *   - If no stored decision: inject the consent banner and wait.
 *
 * This module owns the page_view call for the consent-driven path.
 * analytics.js fires page_view immediately but it is blocked by the
 * consent-denied default. This module fires page_view after enabling analytics,
 * ensuring exactly one page_view per page load for consenting users.
 *
 * No cookies are set. No data is sent before consent is granted.
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'implicitex-analytics-consent';

  function activateAnalytics() {
    if (window.IX) {
      window.IX._analyticsEnabled = true;
      if (typeof window.IX.track === 'function') {
        window.IX.track('page_view', { page: window.location.pathname });
      }
    }
  }

  function storeAndActivate() {
    try { localStorage.setItem(STORAGE_KEY, 'accepted'); } catch (_) {}
    activateAnalytics();
  }

  function storeDecline() {
    try { localStorage.setItem(STORAGE_KEY, 'declined'); } catch (_) {}
  }

  function removeBanner(banner) {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  }

  function showBanner() {
    var banner = document.createElement('div');
    banner.id = 'consentBanner';
    banner.className = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Analytics consent');
    banner.setAttribute('aria-live', 'polite');

    banner.innerHTML =
      '<p class="consent-text">' +
        'We use analytics to understand how the platform is used. ' +
        'No personal data is collected and no cookies are set until you accept. ' +
        '<a href="/privacy.html">Privacy Policy</a>' +
      '</p>' +
      '<div class="consent-actions">' +
        '<button class="consent-btn consent-btn--decline" id="consentDecline" type="button">Decline</button>' +
        '<button class="consent-btn consent-btn--accept" id="consentAccept" type="button">Accept</button>' +
      '</div>';

    document.body.appendChild(banner);

    document.getElementById('consentAccept').addEventListener('click', function () {
      storeAndActivate();
      removeBanner(banner);
    });

    document.getElementById('consentDecline').addEventListener('click', function () {
      storeDecline();
      removeBanner(banner);
    });
  }

  function init() {
    var stored;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) { stored = null; }

    if (stored === 'accepted') {
      activateAnalytics();
      return;
    }

    if (stored === 'declined') {
      return;
    }

    // No stored decision — show banner after DOM is ready.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

  init();

})();
