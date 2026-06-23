/**
 * analytics.js — ImplicitEx event tracking abstraction layer.
 *
 * Exposes IX.track(event, props) at each product touch point.
 * No backend is active by default — this file is inert until one is wired.
 *
 * To activate a backend, assign IX._analyticsBackend before this script
 * executes, or at runtime before any events fire:
 *
 *   // GA4 example (after gtag is loaded and consent granted):
 *   window.IX._analyticsBackend = (event, props) => gtag('event', event, props);
 *
 *   // Firebase example:
 *   window.IX._analyticsBackend = (event, props) => logEvent(analytics, event, props);
 *
 * Consent gate:
 *   IX.track() is a no-op until IX._analyticsEnabled is set to true.
 *   Default state is denied — no data leaves the browser unless the user
 *   explicitly accepts analytics. Set IX._analyticsEnabled = true only after
 *   confirmed consent.
 *
 * Event model (7 events):
 *   page_view          — fires on every page load
 *   portal_opened      — transfer portal revealed
 *   wallet_connected   — wallet successfully connected { chain }
 *   amount_entered     — valid amount entered before review { amount_bucket }
 *   review_reached     — review state entered (REVIEW_READY)
 *   transfer_submitted — contract call initiated
 *   transfer_confirmed — on-chain receipt confirmed
 *
 * Amount bucketing:
 *   Exact transfer amounts are not tracked. The amount_entered event carries
 *   a bucketed range (e.g. "11-50") to preserve user privacy while providing
 *   actionable funnel data.
 */

(function () {
  'use strict';

  window.IX = window.IX || {};

  // Default: consent denied. Flip to true only after explicit user acceptance.
  // Preserve any value pre-wired before this script ran (e.g. by consent logic).
  window.IX._analyticsEnabled = window.IX._analyticsEnabled || false;

  // Backend slot — assign to activate a tracking provider.
  window.IX._analyticsBackend = window.IX._analyticsBackend || null;

  /**
   * track(event, props)
   * Fires an event to the configured backend if analytics is enabled.
   * Swallows all errors — analytics must never interrupt product flow.
   */
  function track(event, props) {
    if (!window.IX._analyticsEnabled) return;
    if (typeof window.IX._analyticsBackend !== 'function') return;
    try {
      window.IX._analyticsBackend(event, Object.assign({ timestamp: Date.now() }, props || {}));
    } catch (_) {
      // intentionally silent
    }
  }

  /**
   * bucketAmount(n)
   * Maps a USDC transfer amount to a privacy-safe range string.
   * Exact amounts are never tracked.
   */
  function bucketAmount(n) {
    if (n <= 10)  return '1-10';
    if (n <= 50)  return '11-50';
    if (n <= 100) return '51-100';
    if (n <= 250) return '101-250';
    return '250+';
  }

  window.IX.track        = track;
  window.IX._bucketAmount = bucketAmount;

  // page_view fires immediately on load, before any user interaction.
  track('page_view', { page: window.location.pathname });

})();
