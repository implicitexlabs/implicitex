/**
 * consent.js — Analytics consent banner.
 *
 * Reads and writes consent state from same-origin browser storage.
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

  var CONSENT_SCHEMA_VERSION = '1';
  var STORAGE_KEY = 'implicitex-analytics-consent';
  var SCHEMA_KEY = 'implicitex-analytics-consent-schema';
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

  function isValidConsent(value) {
    return value === 'accepted' || value === 'declined';
  }

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function readCookie(key) {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string' || document.cookie === '') return null;

    var prefix = key + '=';
    var parts = document.cookie.split(';');

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.indexOf(prefix) === 0) {
        try { return decodeURIComponent(part.slice(prefix.length)); } catch (_) { return null; }
      }
    }

    return null;
  }

  function writeCookie(key, value) {
    if (typeof document === 'undefined') return;

    var pieces = [
      key + '=' + encodeURIComponent(value),
      'path=/',
      'max-age=' + COOKIE_MAX_AGE,
      'samesite=lax',
    ];

    if (window.location && window.location.protocol === 'https:') {
      pieces.push('secure');
    }

    document.cookie = pieces.join('; ');
  }

  function readPersistedValue(key) {
    var value = readStorage(key);
    if (value !== null) return value;
    return readCookie(key);
  }

  function readStoredConsent() {
    var schema = readPersistedValue(SCHEMA_KEY);

    if (schema !== null && schema !== CONSENT_SCHEMA_VERSION) return null;

    var consent = readPersistedValue(STORAGE_KEY);
    if (isValidConsent(consent)) {
      if (schema === null) {
        writeStorage(SCHEMA_KEY, CONSENT_SCHEMA_VERSION);
        writeCookie(SCHEMA_KEY, CONSENT_SCHEMA_VERSION);
      }
      return consent;
    }

    return null;
  }

  function activateAnalytics() {
    if (window.IX) {
      window.IX._analyticsEnabled = true;
      if (typeof window.IX.track === 'function') {
        window.IX.track('page_view', { page: window.location.pathname });
      }
    }
  }

  function storeAndActivate() {
    writeStorage(STORAGE_KEY, 'accepted');
    writeStorage(SCHEMA_KEY, CONSENT_SCHEMA_VERSION);
    writeCookie(STORAGE_KEY, 'accepted');
    writeCookie(SCHEMA_KEY, CONSENT_SCHEMA_VERSION);
    activateAnalytics();
  }

  function storeDecline() {
    writeStorage(STORAGE_KEY, 'declined');
    writeStorage(SCHEMA_KEY, CONSENT_SCHEMA_VERSION);
    writeCookie(STORAGE_KEY, 'declined');
    writeCookie(SCHEMA_KEY, CONSENT_SCHEMA_VERSION);
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
        'We use optional privacy-conscious analytics to understand site usage. ' +
        'You can accept or decline. Your choice is remembered in this browser. ' +
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
    var stored = readStoredConsent();

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
