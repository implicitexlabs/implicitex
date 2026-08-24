(function exposeIxIdActionAdapter(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;

  // In a browser context, self-initialize from the pre-loaded configuration
  // and wire the adapter onto root before action.js reads root.IXID_ACTION_ADAPTER.
  // action-adapter.js must load after config.js and before action.js.
  if (root.document && root.location && root.IXID_ONBOARDING_CONFIG) {
    const fetchFn = (typeof root.fetch === 'function') ? root.fetch.bind(root) : null;
    const adapter = api(root.IXID_ONBOARDING_CONFIG, fetchFn);
    if (adapter) root.IXID_ACTION_ADAPTER = adapter;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildIxIdActionAdapterFactory() {
  'use strict';

  // Firebase Auth REST API base. identitytoolkit.googleapis.com is already
  // permitted by the action page connect-src; no CSP change is required.
  const REST_BASE = 'https://identitytoolkit.googleapis.com/v1';

  function apiKeyFrom(config) {
    const opts = config && config.firebase && config.firebase.options;
    return (opts && typeof opts.apiKey === 'string' && opts.apiKey) ? opts.apiKey : null;
  }

  // apiKey appears in the query string per Firebase REST API documented usage.
  // oobCode and newPassword travel only in the JSON request body, never in the URL.
  // Error messages are generic: raw Firebase response bodies and request URLs
  // containing the key must never reach logs, console output, or callers.
  async function restPost(endpoint, apiKey, body, fetchFn) {
    const url = REST_BASE + endpoint + '?key=' + encodeURIComponent(apiKey);
    let response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_networkError) {
      throw new Error('Action code request could not be sent.');
    }
    if (!response.ok) {
      throw new Error('Action code operation failed.');
    }
  }

  // Factory: returns the adapter object, or null if config/fetch are not ready.
  // Returns null rather than throwing so that action.js can treat an absent
  // adapter as a rejected link (fail-closed) rather than an uncaught exception.
  return function createIxIdActionAdapter(config, fetchFn) {
    const apiKey = apiKeyFrom(config);
    if (!apiKey || typeof fetchFn !== 'function') return null;

    return Object.freeze({
      // Email verification: applyActionCode marks the Firebase account as verified.
      // Corresponds to POST /v1/accounts:update with { oobCode }.
      applyActionCode: function applyActionCode(oobCode) {
        return restPost('/accounts:update', apiKey, { oobCode: oobCode }, fetchFn);
      },

      // Password-reset pre-verification: confirms the oobCode is valid and unused
      // before the password form is shown. action.js calls this as a security gate.
      // Corresponds to POST /v1/accounts:resetPassword with { oobCode }.
      verifyPasswordResetCode: function verifyPasswordResetCode(oobCode) {
        return restPost('/accounts:resetPassword', apiKey, { oobCode: oobCode }, fetchFn);
      },

      // Password-reset confirmation: finalizes the reset with the new password.
      // Called only after verifyPasswordResetCode succeeds and the user submits.
      // Corresponds to POST /v1/accounts:resetPassword with { oobCode, newPassword }.
      confirmPasswordReset: function confirmPasswordReset(oobCode, newPassword) {
        return restPost('/accounts:resetPassword', apiKey,
          { oobCode: oobCode, newPassword: newPassword }, fetchFn);
      },
    });
  };
}));
