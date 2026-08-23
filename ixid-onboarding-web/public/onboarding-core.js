(function exposeOnboardingCore(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IXIDOnboardingCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildOnboardingCore() {
  'use strict';

  const STATES = Object.freeze({
    UNAUTHENTICATED: 'UNAUTHENTICATED',
    EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
    EMAIL_VERIFIED: 'EMAIL_VERIFIED',
    CREATE_ACCOUNT_PENDING: 'CREATE_ACCOUNT_PENDING',
    HANDLE_SELECTION: 'HANDLE_SELECTION',
    REGISTER_IX_ID_PENDING: 'REGISTER_IX_ID_PENDING',
    ACCESS_DENIED_ERROR: 'ACCESS_DENIED_ERROR',
    ACTIVE: 'ACTIVE',
  });

  const HANDLE_ERRORS = Object.freeze({
    TOO_SHORT: 'At least 3 characters.',
    TOO_LONG: '30 characters maximum.',
    INVALID_CHARACTER: 'Letters, numbers, and hyphens only.',
    LEADING_HYPHEN: 'Cannot start with a hyphen.',
    TRAILING_HYPHEN: 'Cannot end with a hyphen.',
    CONSECUTIVE_HYPHENS: 'No consecutive hyphens.',
  });

  const RATE_LIMIT_MESSAGE = 'Too many attempts. Please try again later.';
  const UNCERTAIN_MESSAGE = 'The result could not be confirmed. Try again safely.';

  function validateHandle(input) {
    const canonical = String(input == null ? '' : input).toLowerCase();
    let code = null;
    if (canonical.length < 3) code = 'TOO_SHORT';
    else if (canonical.length > 30) code = 'TOO_LONG';
    else if (!/^[a-z0-9-]+$/.test(canonical)) code = 'INVALID_CHARACTER';
    else if (canonical.startsWith('-')) code = 'LEADING_HYPHEN';
    else if (canonical.endsWith('-')) code = 'TRAILING_HYPHEN';
    else if (canonical.includes('--')) code = 'CONSECUTIVE_HYPHENS';
    return Object.freeze({
      canonical: canonical,
      valid: code === null,
      code: code,
      message: code ? HANDLE_ERRORS[code] : '',
    });
  }

  function defaultOperationId() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto
        && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    throw new Error('Secure UUID generation is unavailable');
  }

  function isSuccess(response) {
    return response && (response.status === 200 || response.status === 201);
  }

  class OnboardingController {
    constructor(dependencies) {
      const deps = dependencies || {};
      if (!deps.auth || !deps.api || typeof deps.render !== 'function') {
        throw new Error('auth, api, and render dependencies are required');
      }
      this.auth = deps.auth;
      this.api = deps.api;
      this.render = deps.render;
      this.makeOperationId = deps.makeOperationId || defaultOperationId;
      this.now = deps.now || Date.now;
      this.currentUser = null;
      this.unsubscribe = null;
      this.resolutionGeneration = 0;
      this.pendingMutation = null;
      this.lastVerificationSendAt = null;
      this.snapshot = Object.freeze({
        state: STATES.UNAUTHENTICATED,
        busy: false,
        message: '',
        retryAvailable: false,
        email: '',
        handle: '',
        handleError: '',
        workspace: null,
        suspended: false,
      });
      this.render(this.snapshot);
    }

    getSnapshot() {
      return this.snapshot;
    }

    transition(state, patch) {
      this.snapshot = Object.freeze(Object.assign({}, this.snapshot, {
        state: state,
        busy: false,
        message: '',
        retryAvailable: false,
      }, patch || {}));
      this.render(this.snapshot);
      return this.snapshot;
    }

    start() {
      if (this.unsubscribe) return this.unsubscribe;
      this.unsubscribe = this.auth.subscribe((user) => {
        void this.handleAuthState(user);
      });
      return this.unsubscribe;
    }

    stop() {
      if (typeof this.unsubscribe === 'function') this.unsubscribe();
      this.unsubscribe = null;
      this.resolutionGeneration += 1;
    }

    async signUp(email, password) {
      if (String(password || '').length < 12) {
        return this.transition(STATES.UNAUTHENTICATED, {
          message: 'Use at least 12 characters for your password.',
        });
      }
      let user;
      try {
        user = await this.auth.signUp(String(email || '').trim(), password);
      } catch (_error) {
        return this.transition(STATES.UNAUTHENTICATED, {
          message: 'Unable to create the account. Check your details and try again.',
        });
      }

      this.currentUser = user;
      try {
        // Initial verification mail is sent only from this explicit new-registration
        // path. Auth listener re-entry never sends mail automatically.
        await this.auth.sendVerification(user);
        this.lastVerificationSendAt = this.now();
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(user),
          message: 'Check your email to verify your address.',
        });
      } catch (_error) {
        // Firebase account creation already succeeded. Preserve the truthful
        // unverified state and let the user invoke the throttled Resend action.
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(user),
          message: 'Your account was created, but the verification email could not be sent. Try Resend.',
        });
      }
    }

    async signIn(email, password) {
      try {
        await this.auth.signIn(String(email || '').trim(), password);
        return this.snapshot;
      } catch (_error) {
        return this.transition(STATES.UNAUTHENTICATED, {
          message: 'Unable to sign in. Check your details and try again.',
        });
      }
    }

    async signOut() {
      this.resolutionGeneration += 1;
      this.currentUser = null;
      this.pendingMutation = null;
      await this.auth.signOut();
      return this.transition(STATES.UNAUTHENTICATED, {
        email: '', handle: '', handleError: '', workspace: null, suspended: false,
      });
    }

    async expireSession() {
      this.resolutionGeneration += 1;
      this.currentUser = null;
      this.pendingMutation = null;
      try {
        await this.auth.signOut();
      } catch (_error) {
        // Local authorization state still fails closed if Firebase sign-out itself
        // cannot be confirmed. The next action must be an explicit sign-in.
      }
      return this.transition(STATES.UNAUTHENTICATED, {
        email: '', handle: '', handleError: '', workspace: null, suspended: false,
        message: 'Session expired. Please sign in again.',
      });
    }

    async requestPasswordReset(email) {
      try {
        await this.auth.sendPasswordReset(String(email || '').trim());
      } catch (_error) {
        // Enumeration protection: the external response is deliberately identical.
      }
      return this.transition(STATES.UNAUTHENTICATED, {
        message: 'If an account exists for that email, a reset link has been sent.',
      });
    }

    async resendVerification() {
      if (!this.currentUser || this.auth.isEmailVerified(this.currentUser)) {
        return this.snapshot;
      }
      const elapsed = this.lastVerificationSendAt == null
        ? Infinity
        : this.now() - this.lastVerificationSendAt;
      if (elapsed < 60000) {
        const seconds = Math.ceil((60000 - elapsed) / 1000);
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(this.currentUser),
          message: 'You can resend in ' + seconds + ' seconds.',
        });
      }
      try {
        await this.auth.sendVerification(this.currentUser);
        this.lastVerificationSendAt = this.now();
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(this.currentUser),
          message: 'Verification email sent.',
        });
      } catch (_error) {
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(this.currentUser),
          message: 'Unable to resend right now. Please try again later.',
        });
      }
    }

    async checkVerification() {
      return this.handleAuthState(this.currentUser);
    }

    async handleAuthState(user) {
      const generation = ++this.resolutionGeneration;
      this.currentUser = user || null;
      this.pendingMutation = null;

      if (!user) {
        return this.transition(STATES.UNAUTHENTICATED, {
          email: '', handle: '', handleError: '', workspace: null, suspended: false,
        });
      }
      if (!this.auth.isEmailVerified(user)) {
        try {
          // Frozen §4.2: every unverified auth-state entry refreshes the user and
          // token before deciding that verification is still outstanding.
          await this.auth.reload(user);
          await this.auth.getIdToken(user, true);
        } catch (_error) {
          if (generation !== this.resolutionGeneration) return this.snapshot;
          return this.transition(STATES.EMAIL_UNVERIFIED, {
            email: this.auth.getEmail(user), workspace: null, suspended: false,
            message: 'Verification could not be refreshed. Try again.',
            retryAvailable: true,
          });
        }
        if (generation !== this.resolutionGeneration) return this.snapshot;
      }
      if (!this.auth.isEmailVerified(user)) {
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(user), workspace: null, suspended: false,
          message: 'Check your email to verify your address.',
        });
      }

      this.transition(STATES.EMAIL_VERIFIED, {
        busy: true,
        email: this.auth.getEmail(user),
        message: 'Setting up your account…',
      });
      return this.resolveWorkspace(user, generation);
    }

    async resolveWorkspace(user, generation) {
      const activeGeneration = generation || this.resolutionGeneration;
      let token;
      let response;
      try {
        token = await this.auth.getIdToken(user, false);
        response = await this.api.getWorkspace(token);
      } catch (_error) {
        if (activeGeneration !== this.resolutionGeneration) return this.snapshot;
        return this.transition(STATES.EMAIL_VERIFIED, {
          message: 'Workspace state could not be confirmed. Try again.',
          retryAvailable: true,
        });
      }
      if (activeGeneration !== this.resolutionGeneration) return this.snapshot;
      if (response.status !== 401) return this.resolveWorkspaceResponse(response, user);

      // Integration invariant: the first 401 can only trigger a forced token
      // refresh and a repeat of the original workspace request. It cannot create.
      try {
        token = await this.auth.getIdToken(user, true);
        response = await this.api.getWorkspace(token);
      } catch (_error) {
        return this.transition(STATES.EMAIL_VERIFIED, {
          message: 'Workspace state could not be confirmed. Try again.',
          retryAvailable: true,
        });
      }
      if (activeGeneration !== this.resolutionGeneration) return this.snapshot;
      if (response.status !== 401) return this.resolveWorkspaceResponse(response, user);

      if (!this.auth.isEmailVerified(user)) {
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(user),
          message: 'Check your email to verify your address.',
        });
      }
      return this.beginCreateAccount(token);
    }

    resolveWorkspaceResponse(response, user) {
      if (response.status === 200) return this.resolveWorkspaceBody(response.body, user);
      if (response.status === 403) return this.transition(STATES.ACCESS_DENIED_ERROR);
      if (response.status === 429) {
        return this.transition(STATES.EMAIL_VERIFIED, {
          message: RATE_LIMIT_MESSAGE,
          retryAvailable: true,
        });
      }
      return this.transition(STATES.EMAIL_VERIFIED, {
        message: 'Workspace state could not be confirmed. Contact support if this continues.',
        retryAvailable: true,
      });
    }

    resolveWorkspaceBody(body, user) {
      const workspace = body || {};
      if (workspace.account_state === 'SUSPENDED') {
        return this.transition(STATES.ACTIVE, {
          workspace: workspace,
          suspended: true,
          message: 'Your account is under review. Handle registration is unavailable.',
        });
      }
      if (workspace.account_state !== 'ACTIVE') {
        return this.transition(STATES.ACCESS_DENIED_ERROR);
      }
      const ixIds = Array.isArray(workspace.ix_ids) ? workspace.ix_ids : [];
      if (ixIds.length > 0) {
        return this.transition(STATES.ACTIVE, {
          workspace: workspace, suspended: false,
        });
      }
      if (!this.auth.isEmailVerified(user)) {
        return this.transition(STATES.EMAIL_UNVERIFIED, {
          email: this.auth.getEmail(user), workspace: workspace,
        });
      }
      return this.transition(STATES.HANDLE_SELECTION, {
        workspace: workspace, suspended: false, handle: '', handleError: '',
      });
    }

    async beginCreateAccount(token) {
      if (!this.pendingMutation || this.pendingMutation.kind !== 'create') {
        this.pendingMutation = {
          kind: 'create',
          operationId: this.makeOperationId(),
        };
      }
      this.transition(STATES.CREATE_ACCOUNT_PENDING, {
        busy: true,
        message: 'Setting up your account…',
      });
      return this.performCreateAccount(token);
    }

    async performCreateAccount(token) {
      const pending = this.pendingMutation;
      let response;
      try {
        response = await this.api.createAccount(token, pending.operationId);
      } catch (_error) {
        return this.transition(STATES.CREATE_ACCOUNT_PENDING, {
          busy: false, message: UNCERTAIN_MESSAGE, retryAvailable: true,
        });
      }

      if (response.status === 401) {
        try {
          const freshToken = await this.auth.getIdToken(this.currentUser, true);
          response = await this.api.createAccount(freshToken, pending.operationId);
        } catch (_error) {
          return this.transition(STATES.CREATE_ACCOUNT_PENDING, {
            busy: false, message: UNCERTAIN_MESSAGE, retryAvailable: true,
          });
        }
      }

      if (isSuccess(response)) {
        this.pendingMutation = null;
        if (response.body && response.body.owned_ix_id) {
          return this.transition(STATES.ACTIVE, {
            workspace: {
              account_id: response.body.account_id,
              account_state: response.body.account_state,
              ix_ids: [{ ix_id: response.body.owned_ix_id }],
            },
          });
        }
        return this.transition(STATES.HANDLE_SELECTION, {
          workspace: response.body || null, handle: '', handleError: '',
        });
      }
      if (response.status === 401) {
        return this.expireSession();
      }
      if (response.status === 403) {
        this.pendingMutation = null;
        return this.transition(STATES.ACCESS_DENIED_ERROR);
      }
      if (response.status === 429) {
        return this.transition(STATES.CREATE_ACCOUNT_PENDING, {
          message: RATE_LIMIT_MESSAGE, retryAvailable: true,
        });
      }
      return this.transition(STATES.CREATE_ACCOUNT_PENDING, {
        message: 'Account setup could not be confirmed. Contact support if this continues.',
        retryAvailable: true,
      });
    }

    setHandleInput(input) {
      const validation = validateHandle(input);
      if (this.pendingMutation && this.pendingMutation.kind === 'register'
          && this.pendingMutation.handle !== validation.canonical) {
        this.pendingMutation = null;
      }
      return this.transition(STATES.HANDLE_SELECTION, {
        handle: validation.canonical,
        handleError: validation.message,
      });
    }

    async submitHandle(input) {
      const validation = validateHandle(input);
      if (!validation.valid) {
        return this.transition(STATES.HANDLE_SELECTION, {
          handle: validation.canonical,
          handleError: validation.message,
        });
      }
      if (!this.pendingMutation || this.pendingMutation.kind !== 'register'
          || this.pendingMutation.handle !== validation.canonical) {
        this.pendingMutation = {
          kind: 'register',
          operationId: this.makeOperationId(),
          handle: validation.canonical,
        };
      }
      this.transition(STATES.REGISTER_IX_ID_PENDING, {
        busy: true,
        handle: validation.canonical,
        handleError: '',
        message: 'Claiming your IX ID…',
      });
      let token;
      try {
        token = await this.auth.getIdToken(this.currentUser, false);
      } catch (_error) {
        return this.expireSession();
      }
      return this.performRegisterIxId(token);
    }

    async performRegisterIxId(token) {
      const pending = this.pendingMutation;
      let response;
      try {
        response = await this.api.registerIxId(token, pending.operationId, pending.handle);
      } catch (_error) {
        return this.transition(STATES.REGISTER_IX_ID_PENDING, {
          busy: false, message: UNCERTAIN_MESSAGE, retryAvailable: true,
        });
      }

      if (isSuccess(response)) {
        this.pendingMutation = null;
        const ixId = response.body && response.body.ix_id
          ? response.body.ix_id : pending.handle;
        return this.transition(STATES.ACTIVE, {
          workspace: {
            account_state: 'ACTIVE',
            ix_ids: [{
              ix_id: ixId,
              ix_id_state: response.body && response.body.ix_id_state,
            }],
          },
          handle: ixId,
        });
      }
      if (response.status === 409) {
        this.pendingMutation = null;
        return this.transition(STATES.HANDLE_SELECTION, {
          handle: pending.handle,
          handleError: 'That handle is not available. Try another.',
        });
      }
      if (response.status === 422) {
        this.pendingMutation = null;
        const code = response.body && response.body.error;
        const message = code === 'HANDLE_RESERVED'
          ? 'That handle is reserved and cannot be registered.'
          : (code === 'HANDLE_INVALID'
            ? 'That handle does not meet the required format.'
            : 'The handle could not be registered. Review it and try again.');
        return this.transition(STATES.HANDLE_SELECTION, {
          handle: pending.handle,
          handleError: message,
        });
      }
      if (response.status === 403) {
        this.pendingMutation = null;
        return this.transition(STATES.ACCESS_DENIED_ERROR);
      }
      if (response.status === 401) {
        return this.expireSession();
      }
      if (response.status === 429) {
        return this.transition(STATES.REGISTER_IX_ID_PENDING, {
          busy: false, message: RATE_LIMIT_MESSAGE, retryAvailable: true,
        });
      }
      return this.transition(STATES.REGISTER_IX_ID_PENDING, {
        busy: false,
        message: 'Registration could not be confirmed. Contact support if this continues.',
        retryAvailable: true,
      });
    }

    async retry() {
      if (!this.currentUser) return this.transition(STATES.UNAUTHENTICATED);
      if (!this.pendingMutation) return this.handleAuthState(this.currentUser);
      let token;
      try {
        token = await this.auth.getIdToken(this.currentUser, false);
      } catch (_error) {
        return this.expireSession();
      }
      if (this.pendingMutation.kind === 'create') {
        this.transition(STATES.CREATE_ACCOUNT_PENDING, {
          busy: true, message: 'Setting up your account…',
        });
        return this.performCreateAccount(token);
      }
      this.transition(STATES.REGISTER_IX_ID_PENDING, {
        busy: true, message: 'Claiming your IX ID…',
      });
      return this.performRegisterIxId(token);
    }

  }

  function createOnboardingController(dependencies) {
    return new OnboardingController(dependencies);
  }

  return Object.freeze({
    HANDLE_ERRORS: HANDLE_ERRORS,
    RATE_LIMIT_MESSAGE: RATE_LIMIT_MESSAGE,
    STATES: STATES,
    createOnboardingController: createOnboardingController,
    validateHandle: validateHandle,
  });
}));
