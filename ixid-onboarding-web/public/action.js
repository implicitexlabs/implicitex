(function exposeIxIdActionHandler(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IXIDActionHandler = api;

  if (root.document && root.location && root.history) {
    api.startActionPage({
      root: root,
      document: root.document,
      location: root.location,
      history: root.history,
      config: root.IXID_ONBOARDING_CONFIG,
      adapter: root.IXID_ACTION_ADAPTER,
    });
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildIxIdActionHandler() {
  'use strict';

  const ALLOWED_CONTINUE_URL = 'https://app.ixid.me/register';
  const GENERIC_LINK_ERROR = 'This action link is invalid or has expired.';
  const GENERIC_RESET_ERROR = 'The password could not be reset. Request a new link and try again.';

  function captureAndClean(location, history) {
    const actionUrl = new URL(String(location.href));
    const captured = {
      modes: actionUrl.searchParams.getAll('mode'),
      oobCodes: actionUrl.searchParams.getAll('oobCode'),
      apiKeys: actionUrl.searchParams.getAll('apiKey'),
      continueUrls: actionUrl.searchParams.getAll('continueUrl'),
    };

    // This must remain the first observable side effect. No validation, DOM
    // update, adapter invocation, or asynchronous work precedes it.
    history.replaceState(null, '', actionUrl.pathname || '/');
    return captured;
  }

  function clearCaptured(captured) {
    if (!captured) return;
    Object.keys(captured).forEach(function clearValues(key) {
      if (!Array.isArray(captured[key])) return;
      captured[key].fill('');
      captured[key].length = 0;
    });
  }

  function trustedApiKey(config) {
    const options = config && config.firebase && config.firebase.options;
    return options && typeof options.apiKey === 'string' && options.apiKey
      ? options.apiKey : null;
  }

  function validateCaptured(captured, config) {
    if (!captured || captured.modes.length !== 1 || captured.oobCodes.length !== 1
        || captured.continueUrls.length !== 1 || captured.apiKeys.length > 1) {
      return { ok: false };
    }

    const mode = captured.modes[0];
    const oobCode = captured.oobCodes[0];
    const continueUrl = captured.continueUrls[0];
    if (mode !== 'verifyEmail' && mode !== 'resetPassword') return { ok: false };
    if (!oobCode || oobCode.length > 4096 || oobCode !== oobCode.trim() || /\s/.test(oobCode)) {
      return { ok: false };
    }
    if (continueUrl !== ALLOWED_CONTINUE_URL
        || !config || config.actionContinueUrl !== ALLOWED_CONTINUE_URL) {
      return { ok: false };
    }
    if (captured.apiKeys.length === 1) {
      const expectedKey = trustedApiKey(config);
      if (!expectedKey || captured.apiKeys[0] !== expectedKey) return { ok: false };
    }
    return { ok: true, mode: mode, oobCode: oobCode };
  }

  function focusLater(root, element) {
    if (!element || typeof element.focus !== 'function') return;
    if (root && typeof root.requestAnimationFrame === 'function') {
      root.requestAnimationFrame(function focusElement() { element.focus(); });
      return;
    }
    element.focus();
  }

  function createUi(document, root) {
    if (!document || typeof document.getElementById !== 'function') return null;
    const ui = {
      heading: document.getElementById('action-heading'),
      status: document.getElementById('action-status'),
      error: document.getElementById('action-error'),
      form: document.getElementById('reset-password-form'),
      password: document.getElementById('reset-password'),
      submit: document.getElementById('reset-submit'),
      cancel: document.getElementById('reset-cancel'),
    };
    if (Object.keys(ui).some(function missing(key) { return !ui[key]; })) return null;

    ui.showLinkFailure = function showLinkFailure() {
      ui.form.hidden = true;
      ui.heading.textContent = 'Action unavailable';
      ui.status.textContent = '';
      ui.error.textContent = GENERIC_LINK_ERROR;
      focusLater(root, ui.heading);
    };
    ui.showPending = function showPending(message) {
      ui.form.hidden = true;
      ui.error.textContent = '';
      ui.status.textContent = message;
    };
    ui.showResetReady = function showResetReady() {
      ui.heading.textContent = 'Reset your password';
      ui.error.textContent = '';
      ui.status.textContent = 'Enter a new password.';
      ui.form.hidden = false;
      focusLater(root, ui.password);
    };
    ui.showPasswordValidation = function showPasswordValidation() {
      ui.status.textContent = '';
      ui.error.textContent = 'Use at least 12 characters for your new password.';
      focusLater(root, ui.password);
    };
    ui.showConfirmationFailure = function showConfirmationFailure() {
      ui.status.textContent = '';
      ui.error.textContent = GENERIC_RESET_ERROR;
      focusLater(root, ui.password);
    };
    ui.showSuccess = function showSuccess(message) {
      ui.error.textContent = '';
      ui.status.textContent = message;
      focusLater(root, ui.heading);
    };
    ui.showCancelled = function showCancelled() {
      ui.heading.textContent = 'Password reset cancelled';
      ui.status.textContent = 'No password change was attempted.';
      ui.error.textContent = '';
      focusLater(root, ui.heading);
    };
    return ui;
  }

  function navigateToAllowed(settings) {
    if (typeof settings.navigate === 'function') {
      settings.navigate(ALLOWED_CONTINUE_URL);
    } else if (settings.location && typeof settings.location.assign === 'function') {
      settings.location.assign(ALLOWED_CONTINUE_URL);
    }
  }

  function createResetFlow(settings, ui, adapter, actionCode) {
    let resetCode = actionCode;
    let transientPassword = null;
    let busy = false;
    let abandoned = false;
    let generation = 0;

    function clearPassword() {
      transientPassword = null;
      ui.password.value = '';
    }

    function clearSensitiveState() {
      generation += 1;
      resetCode = '';
      clearPassword();
      busy = false;
      ui.submit.disabled = false;
      ui.form.setAttribute('aria-busy', 'false');
    }

    function abandon(render) {
      abandoned = true;
      clearSensitiveState();
      ui.form.hidden = true;
      if (render !== false) ui.showCancelled();
      return { status: 'abandoned' };
    }

    async function submit() {
      if (abandoned || busy || !resetCode) return { status: 'unavailable' };
      if ((typeof ui.form.reportValidity === 'function' && !ui.form.reportValidity())
          || String(ui.password.value || '').length < 12) {
        ui.showPasswordValidation();
        return { status: 'invalid-password' };
      }

      busy = true;
      const attempt = ++generation;
      transientPassword = String(ui.password.value);
      ui.submit.disabled = true;
      ui.form.setAttribute('aria-busy', 'true');
      ui.error.textContent = '';
      ui.status.textContent = 'Resetting your password…';
      let confirmed = false;
      try {
        await adapter.confirmPasswordReset(resetCode, transientPassword);
        confirmed = true;
      } catch (_error) {
        confirmed = false;
      } finally {
        clearPassword();
        busy = false;
        ui.submit.disabled = false;
        ui.form.setAttribute('aria-busy', 'false');
      }

      if (abandoned || attempt !== generation) return { status: 'abandoned' };
      if (!confirmed) {
        ui.showConfirmationFailure();
        return { status: 'failed' };
      }

      resetCode = '';
      ui.form.hidden = true;
      ui.showSuccess('Your password has been reset. Continuing…');
      navigateToAllowed(settings);
      return { status: 'success' };
    }

    ui.form.addEventListener('submit', function submitReset(event) {
      event.preventDefault();
      submit();
    });
    ui.form.addEventListener('reset', function resetForm() { abandon(true); });
    ui.cancel.addEventListener('click', function cancelReset(event) {
      event.preventDefault();
      abandon(true);
    });
    if (settings.root && typeof settings.root.addEventListener === 'function') {
      settings.root.addEventListener('pagehide', function abandonPage() { abandon(false); });
      settings.root.addEventListener('beforeunload', function abandonWindow() { abandon(false); });
    }

    return Object.freeze({ submit: submit, abandon: abandon });
  }

  async function handleCaptured(settings, captured) {
    const ui = createUi(settings.document, settings.root);
    const validation = validateCaptured(captured, settings.config);
    if (!ui || !validation.ok) {
      clearCaptured(captured);
      if (ui) ui.showLinkFailure();
      return { status: 'rejected' };
    }

    const adapter = settings.adapter;
    const requiredMethods = validation.mode === 'verifyEmail'
      ? ['applyActionCode'] : ['verifyPasswordResetCode', 'confirmPasswordReset'];
    if (!adapter || requiredMethods.some(function missing(name) {
      return typeof adapter[name] !== 'function';
    })) {
      validation.oobCode = '';
      clearCaptured(captured);
      ui.showLinkFailure();
      return { status: 'rejected' };
    }

    let actionCode = validation.oobCode;
    validation.oobCode = '';
    clearCaptured(captured);

    if (validation.mode === 'verifyEmail') {
      ui.showPending('Verifying your email…');
      let verified = false;
      try {
        await adapter.applyActionCode(actionCode);
        verified = true;
      } catch (_error) {
        verified = false;
      } finally {
        actionCode = '';
      }
      if (!verified) {
        ui.showLinkFailure();
        return { status: 'failed' };
      }
      ui.showSuccess('Your email has been verified. Continuing…');
      navigateToAllowed(settings);
      return { status: 'success' };
    }

    ui.showPending('Checking your reset link…');
    let preverified = false;
    try {
      await adapter.verifyPasswordResetCode(actionCode);
      preverified = true;
    } catch (_error) {
      preverified = false;
    }
    if (!preverified) {
      actionCode = '';
      ui.showLinkFailure();
      return { status: 'failed' };
    }

    const flow = createResetFlow(settings, ui, adapter, actionCode);
    actionCode = '';
    ui.showResetReady();
    return { status: 'awaiting-reset', flow: flow };
  }

  function startActionPage(dependencies) {
    const settings = dependencies || {};
    let captured;
    try {
      captured = captureAndClean(settings.location, settings.history);
    } catch (_error) {
      clearCaptured(captured);
      return Promise.resolve({ status: 'blocked' });
    }

    // Deferring the remaining work makes the cleanup boundary explicit: the
    // history replacement above settles before validation or any async action.
    return Promise.resolve().then(function beginAction() {
      return handleCaptured(settings, captured);
    }).catch(function failSafely() {
      clearCaptured(captured);
      const ui = createUi(settings.document, settings.root);
      if (ui) ui.showLinkFailure();
      return { status: 'failed' };
    });
  }

  return Object.freeze({
    ALLOWED_CONTINUE_URL: ALLOWED_CONTINUE_URL,
    startActionPage: startActionPage,
    validateCaptured: validateCaptured,
  });
}));
