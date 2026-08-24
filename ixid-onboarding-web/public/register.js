(function startIxIdOnboarding(root) {
  'use strict';

  const panels = {
    setup: document.getElementById('setup-panel'),
    auth: document.getElementById('auth-panel'),
    verification: document.getElementById('verification-panel'),
    pending: document.getElementById('pending-panel'),
    handle: document.getElementById('handle-panel'),
    denied: document.getElementById('denied-panel'),
    workspace: document.getElementById('workspace-panel'),
  };
  const status = document.getElementById('global-status');
  let controller = null;
  let lastState = null;

  function showOnly(name) {
    Object.keys(panels).forEach(function togglePanel(key) {
      panels[key].hidden = key !== name;
    });
  }

  function focusPanel(panel) {
    const heading = panel.querySelector('h1[tabindex="-1"]');
    if (heading) root.requestAnimationFrame(function focusHeading() { heading.focus(); });
  }

  function firstIxId(workspace) {
    const ixIds = workspace && Array.isArray(workspace.ix_ids) ? workspace.ix_ids : [];
    return ixIds.length && ixIds[0] ? ixIds[0].ix_id : null;
  }

  function render(snapshot) {
    const states = root.IXIDOnboardingCore.STATES;
    status.textContent = snapshot.message || '';

    if (snapshot.state === states.UNAUTHENTICATED) showOnly('auth');
    else if (snapshot.state === states.EMAIL_UNVERIFIED) showOnly('verification');
    else if (snapshot.state === states.EMAIL_VERIFIED
        || snapshot.state === states.CREATE_ACCOUNT_PENDING
        || snapshot.state === states.REGISTER_IX_ID_PENDING) showOnly('pending');
    else if (snapshot.state === states.HANDLE_SELECTION) showOnly('handle');
    else if (snapshot.state === states.ACCESS_DENIED_ERROR) showOnly('denied');
    else if (snapshot.state === states.ACTIVE
        || snapshot.state === states.WALLET_PENDING
        || snapshot.state === states.WALLET_CONNECTED) showOnly('workspace');

    document.getElementById('verification-email').textContent = snapshot.email || '';

    const pendingHeading = document.getElementById('pending-heading');
    const pendingCopy = document.getElementById('pending-copy');
    pendingHeading.textContent = snapshot.state === states.REGISTER_IX_ID_PENDING
      ? 'Claiming your IX ID…' : 'Setting up your account…';
    pendingCopy.textContent = snapshot.message || 'Waiting for an authoritative result.';
    document.getElementById('pending-panel').setAttribute('aria-busy', snapshot.busy ? 'true' : 'false');
    document.getElementById('retry-pending').hidden = !snapshot.retryAvailable;

    const handleInput = document.getElementById('handle-input');
    if (handleInput.value !== snapshot.handle) handleInput.value = snapshot.handle || '';
    handleInput.setAttribute('aria-invalid', snapshot.handleError ? 'true' : 'false');
    document.getElementById('handle-error').textContent = snapshot.handleError || '';
    document.getElementById('claim-handle').disabled = Boolean(snapshot.handleError) || !snapshot.handle;

    document.getElementById('suspended-banner').hidden = !snapshot.suspended;
    const ixId = firstIxId(snapshot.workspace);
    document.getElementById('workspace-identity').textContent = ixId
      ? 'Your IX ID: @' + ixId
      : (snapshot.suspended ? 'No active IX ID is available.' : 'Your account is active.');

    // Wallet section — only rendered when workspace panel is visible.
    const walletPending = snapshot.state === states.WALLET_PENDING;
    const walletConnected = snapshot.state === states.WALLET_CONNECTED;
    document.getElementById('connect-wallet').hidden = walletConnected || walletPending;
    document.getElementById('connect-wallet').disabled = walletPending;
    document.getElementById('wallet-address').hidden = !walletConnected;
    document.getElementById('wallet-address').textContent = walletConnected
      ? snapshot.walletAddress || ''
      : '';
    document.getElementById('disconnect-wallet').hidden = !walletConnected;

    if (lastState !== snapshot.state) {
      lastState = snapshot.state;
      const visible = Object.keys(panels).map(function mapPanel(key) { return panels[key]; })
        .find(function findPanel(panel) { return !panel.hidden; });
      if (visible) focusPanel(visible);
    }
  }

  function formValues(form) {
    const data = new FormData(form);
    return {
      email: String(data.get('email') || '').trim(),
      password: String(data.get('password') || ''),
    };
  }

  function bindEvents() {
    document.getElementById('signup-form').addEventListener('submit', function submitSignup(event) {
      event.preventDefault();
      const values = formValues(event.currentTarget);
      if (!event.currentTarget.reportValidity()) return;
      void controller.signUp(values.email, values.password).then(function showSignupError(snapshot) {
        document.getElementById('signup-error').textContent =
          snapshot.state === root.IXIDOnboardingCore.STATES.UNAUTHENTICATED ? snapshot.message : '';
      });
    });
    document.getElementById('signin-form').addEventListener('submit', function submitSignin(event) {
      event.preventDefault();
      const values = formValues(event.currentTarget);
      if (!event.currentTarget.reportValidity()) return;
      void controller.signIn(values.email, values.password).then(function showSigninError(snapshot) {
        document.getElementById('signin-error').textContent =
          snapshot.state === root.IXIDOnboardingCore.STATES.UNAUTHENTICATED ? snapshot.message : '';
      });
    });
    document.getElementById('reset-form').addEventListener('submit', function submitReset(event) {
      event.preventDefault();
      const values = formValues(event.currentTarget);
      if (!event.currentTarget.reportValidity()) return;
      void controller.requestPasswordReset(values.email).then(function showResetStatus(snapshot) {
        document.getElementById('reset-status').textContent = snapshot.message;
      });
    });

    document.getElementById('check-verification').addEventListener('click', function checkVerification() {
      void controller.checkVerification();
    });
    document.getElementById('resend-verification').addEventListener('click', function resendVerification() {
      void controller.resendVerification();
    });
    ['verification-signout', 'denied-signout', 'workspace-signout'].forEach(function bindSignout(id) {
      document.getElementById(id).addEventListener('click', function signout() { void controller.signOut(); });
    });
    document.getElementById('retry-pending').addEventListener('click', function retryPending() {
      void controller.retry();
    });

    const handleInput = document.getElementById('handle-input');
    handleInput.addEventListener('input', function updateHandle() {
      controller.setHandleInput(handleInput.value);
    });
    document.getElementById('handle-form').addEventListener('submit', function submitHandle(event) {
      event.preventDefault();
      void controller.submitHandle(handleInput.value);
    });

    document.getElementById('connect-wallet').addEventListener('click', function connectWallet() {
      void controller.connectWallet();
    });
    document.getElementById('disconnect-wallet').addEventListener('click', function disconnectWallet() {
      controller.disconnectWallet();
    });
  }

  async function bootstrap() {
    const config = root.IXID_ONBOARDING_CONFIG;
    if (!config || config.enabled !== true) {
      showOnly('setup');
      focusPanel(panels.setup);
      return;
    }

    try {
      const auth = await root.IXIDFirebaseAuth.createFirebaseAuthAdapter(config);
      const api = root.IXIDHolderApi.createHolderApiClient({ baseUrl: config.holderApiBase });
      const wallet = root.IXIDWalletConnector
        ? root.IXIDWalletConnector.createWalletConnector()
        : null;
      controller = root.IXIDOnboardingCore.createOnboardingController({
        auth: auth,
        api: api,
        render: render,
        wallet: wallet,
      });
      bindEvents();
      controller.start();
    } catch (_error) {
      showOnly('setup');
      document.getElementById('setup-panel').querySelector('p').textContent =
        'Registration configuration could not be validated. No account action was attempted.';
      focusPanel(panels.setup);
    }
  }

  void bootstrap();
}(typeof globalThis !== 'undefined' ? globalThis : window));
