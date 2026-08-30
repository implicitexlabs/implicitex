(function startIxIdOnboarding(root) {
  'use strict';

  let api = null;
  let domainStatusLoaded = false;
  let paymentRouteLoaded = false;

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
    const ixIdBlock = document.getElementById('ix-id-block');
    const workspaceNoId = document.getElementById('workspace-no-id');
    if (ixId) {
      ixIdBlock.hidden = false;
      workspaceNoId.hidden = true;
      document.getElementById('workspace-identity').textContent = '@' + ixId;
      const viewLink = document.getElementById('view-ix-id');
      viewLink.href = 'https://' + ixId + '.ixid.me';
    } else {
      ixIdBlock.hidden = true;
      workspaceNoId.hidden = false;
      workspaceNoId.textContent = snapshot.suspended
        ? 'Your account is under review. No IX ID registered.'
        : 'Your account is active.';
    }

    // Show profile and domain sections when an IX ID is active
    var profileSection = document.getElementById('profile-section');
    var domainSection = document.getElementById('domain-section');
    var paymentRouteSection = document.getElementById('payment-route-section');
    if (ixId) {
      if (profileSection && profileSection.hidden && snapshot.workspace) {
        var ix = snapshot.workspace.ix_ids && snapshot.workspace.ix_ids[0];
        if (ix && ix.profile) showProfileSection(ix.profile);
      }
      if (domainSection) domainSection.hidden = false;
      if (paymentRouteSection && paymentRouteSection.hidden && !paymentRouteLoaded) {
        paymentRouteSection.hidden = false;
        paymentRouteLoaded = true;
        if (api && controller) {
          controller.getToken().then(function onGotRouteToken(token) {
            if (!token) return;
            return api.getPaymentRoute(token).then(function onRouteLoaded(result) {
              if (result.status === 200) showPaymentRouteSection(result.body);
            });
          }).catch(function ignoreRouteLoadError() { /* non-fatal */ });
        }
      }
    } else {
      if (profileSection) profileSection.hidden = true;
      if (domainSection) domainSection.hidden = true;
      if (paymentRouteSection) paymentRouteSection.hidden = true;
    }

    if ((snapshot.state === states.ACTIVE || snapshot.state === states.WALLET_PENDING || snapshot.state === states.WALLET_CONNECTED) && !domainStatusLoaded) {
      domainStatusLoaded = true;
      if (api && controller) {
        controller.getToken().then(function onGotToken(token) {
          if (!token) return;
          return api.getDomainStatus(token).then(function onDomainStatus(result) {
            if (result.status === 200) {
              showDomainSection(result.body.domain, result.body.pending_challenge);
            }
          });
        }).catch(function ignoreDomainStatusError() { /* non-fatal */ });
      }
    }

    // Track connected wallet address for in-browser payment route signing.
    currentRouteWalletAddress = snapshot.walletAddress || null;

    // Wallet section — only rendered when workspace panel is visible.
    const walletPending = snapshot.state === states.WALLET_PENDING;
    const walletConnected = snapshot.state === states.WALLET_CONNECTED;
    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.hidden = walletConnected || walletPending;
    connectBtn.disabled = walletPending;
    connectBtn.textContent = walletPending ? 'Connecting…' : 'Connect Wallet';
    const walletAddressEl = document.getElementById('wallet-address');
    walletAddressEl.hidden = !walletConnected;
    if (walletConnected && snapshot.walletAddress) {
      const addr = snapshot.walletAddress;
      const truncated = addr.length > 14
        ? addr.slice(0, 8) + '…' + addr.slice(-6)
        : addr;
      walletAddressEl.textContent = truncated + ' (Polygon)';
      walletAddressEl.title = addr;
    } else {
      walletAddressEl.textContent = '';
      walletAddressEl.removeAttribute('title');
    }
    document.getElementById('disconnect-wallet').hidden = !walletConnected;

    if (lastState !== snapshot.state) {
      lastState = snapshot.state;
      const visible = Object.keys(panels).map(function mapPanel(key) { return panels[key]; })
        .find(function findPanel(panel) { return !panel.hidden; });
      if (visible) focusPanel(visible);
    }
  }

  // ---------------------------------------------------------------------------
  // Profile editor
  // ---------------------------------------------------------------------------

  var savedProfile = { display_name: null, bio: null, website_url: null };

  function loadProfileIntoEditor(profile) {
    if (!profile) return;
    savedProfile = Object.assign({}, profile);
    var nameEl = document.getElementById('profile-display-name');
    var bioEl = document.getElementById('profile-bio');
    var siteEl = document.getElementById('profile-website');
    if (nameEl) nameEl.value = profile.display_name || '';
    if (bioEl) bioEl.value = profile.bio || '';
    if (siteEl) siteEl.value = profile.website_url || '';
  }

  function showProfileSection(profile) {
    var section = document.getElementById('profile-section');
    if (!section) return;
    section.hidden = false;
    loadProfileIntoEditor(profile);
    document.getElementById('profile-status').textContent = '';
    document.getElementById('profile-website-error').textContent = '';
  }

  function bindProfileEvents(apiClient) {
    var form = document.getElementById('profile-form');
    if (!form) return;

    form.addEventListener('submit', function submitProfile(event) {
      event.preventDefault();
      var nameEl = document.getElementById('profile-display-name');
      var bioEl = document.getElementById('profile-bio');
      var siteEl = document.getElementById('profile-website');
      var statusEl = document.getElementById('profile-status');
      var siteErrorEl = document.getElementById('profile-website-error');
      var saveBtn = document.getElementById('profile-save');

      siteErrorEl.textContent = '';
      statusEl.textContent = 'Saving\u2026';
      saveBtn.disabled = true;

      var updates = {
        display_name: nameEl ? nameEl.value : '',
        bio: bioEl ? bioEl.value : '',
        website_url: siteEl ? siteEl.value : '',
      };

      controller.getToken().then(function onGotProfileToken(token) {
        if (!token) {
          statusEl.textContent = 'Sign in required.';
          saveBtn.disabled = false;
          return;
        }
        return apiClient.updateProfile(token, updates).then(function onProfileSave(result) {
          if (result.status === 200) {
            savedProfile = Object.assign({}, result.body);
            statusEl.textContent = 'Profile saved.';
          } else if (result.status === 422 && result.body && result.body.detail) {
            siteErrorEl.textContent = result.body.detail;
            statusEl.textContent = '';
          } else {
            statusEl.textContent = 'Could not save. Try again.';
          }
        }).catch(function onProfileSaveError() {
          statusEl.textContent = 'Could not save. Try again.';
        }).then(function enableSaveBtn() {
          saveBtn.disabled = false;
        });
      });
    });

    var cancelBtn = document.getElementById('profile-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function cancelProfile() {
        loadProfileIntoEditor(savedProfile);
        document.getElementById('profile-status').textContent = '';
        document.getElementById('profile-website-error').textContent = '';
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Domain verification
  // ---------------------------------------------------------------------------

  var currentChallengeId = null;

  function showDomainSection(domainStatus, pendingChallenge) {
    var section = document.getElementById('domain-section');
    if (!section) return;
    section.hidden = false;

    var verifiedBlock = document.getElementById('domain-verified-block');
    var challengeBlock = document.getElementById('domain-challenge-block');
    var startBlock = document.getElementById('domain-start-block');

    var isVerified = domainStatus &&
      (domainStatus.status === 'ACTIVE' || domainStatus.status === 'RECHECK_REQUIRED');

    verifiedBlock.hidden = !isVerified;
    if (isVerified) {
      var subjectEl = document.getElementById('domain-verified-subject');
      var expiresEl = document.getElementById('domain-verified-expires');
      if (subjectEl) subjectEl.textContent = domainStatus.subject || '';
      if (expiresEl && domainStatus.expires_at) {
        try {
          var d = new Date(domainStatus.expires_at);
          expiresEl.textContent = 'Verified until ' + d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (_) { expiresEl.textContent = ''; }
      }
    }

    if (pendingChallenge && !isVerified) {
      currentChallengeId = pendingChallenge.challenge_id;
      challengeBlock.hidden = false;
      startBlock.hidden = true;
      var txtEl = document.getElementById('domain-txt-value');
      var domainEl = document.getElementById('domain-challenge-domain');
      if (txtEl) txtEl.textContent = pendingChallenge.txt_record || '';
      if (domainEl) domainEl.textContent = pendingChallenge.domain || '';
    } else if (!isVerified) {
      challengeBlock.hidden = true;
      startBlock.hidden = false;
    } else {
      challengeBlock.hidden = true;
      startBlock.hidden = true;
    }

    document.getElementById('domain-verify-status').textContent = '';
  }

  function bindDomainEvents(apiClient) {
    var startForm = document.getElementById('domain-start-form');
    if (startForm) {
      startForm.addEventListener('submit', function startVerification(event) {
        event.preventDefault();
        var domainInput = document.getElementById('domain-input');
        var errorEl = document.getElementById('domain-start-error');
        var startBtn = document.getElementById('domain-start-btn');
        errorEl.textContent = '';
        startBtn.disabled = true;

        controller.getToken().then(function onGotChallengeToken(token) {
          if (!token) { errorEl.textContent = 'Sign in required.'; startBtn.disabled = false; return; }
          return apiClient.issueDomainChallenge(token, domainInput ? domainInput.value : '').then(function onChallengeIssued(result) {
            if (result.status === 201) {
              currentChallengeId = result.body.challenge_id;
              document.getElementById('domain-challenge-block').hidden = false;
              document.getElementById('domain-start-block').hidden = true;
              var txtEl = document.getElementById('domain-txt-value');
              var domEl = document.getElementById('domain-challenge-domain');
              if (txtEl) txtEl.textContent = result.body.txt_record || '';
              if (domEl) domEl.textContent = result.body.domain || '';
            } else {
              errorEl.textContent = (result.body && result.body.detail) ? result.body.detail : 'Could not start verification. Try again.';
            }
          }).catch(function onChallengeError() {
            errorEl.textContent = 'Could not start verification. Try again.';
          }).then(function enableStartBtn() {
            startBtn.disabled = false;
          });
        });
      });
    }

    var verifyBtn = document.getElementById('domain-verify-btn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', function verifyDomain() {
        var statusEl = document.getElementById('domain-verify-status');
        if (!currentChallengeId) { statusEl.textContent = 'No active challenge.'; return; }
        statusEl.textContent = 'Checking DNS\u2026';
        verifyBtn.disabled = true;

        controller.getToken().then(function onGotVerifyToken(token) {
          if (!token) { statusEl.textContent = 'Sign in required.'; verifyBtn.disabled = false; return; }
          return apiClient.verifyDomain(token, currentChallengeId).then(function onVerifyResult(result) {
            if (result.status === 200 && result.body.verified) {
              statusEl.textContent = 'Verified! Refreshing\u2026';
              setTimeout(function reloadPage() { root.location.reload(); }, 1200);
            } else {
              var code = result.body && result.body.error_code;
              if (code === 'CHALLENGE_NOT_FOUND') {
                statusEl.textContent = 'Challenge not found. Start a new one.';
              } else {
                statusEl.textContent = 'TXT record not found yet. Wait a few minutes and try again.';
              }
            }
          }).catch(function onVerifyError() {
            statusEl.textContent = 'Could not check. Try again.';
          }).then(function enableVerifyBtn() {
            verifyBtn.disabled = false;
          });
        });
      });
    }

    var copyBtn = document.getElementById('domain-copy-txt');
    if (copyBtn) {
      copyBtn.addEventListener('click', function copyTxt() {
        var val = document.getElementById('domain-txt-value');
        if (val && root.navigator && root.navigator.clipboard) {
          root.navigator.clipboard.writeText(val.textContent).then(function onCopied() {
            copyBtn.textContent = 'Copied!';
            setTimeout(function resetCopyBtn() { copyBtn.textContent = 'Copy'; }, 2000);
          });
        }
      });
    }

    var cancelChallenge = document.getElementById('domain-cancel-challenge');
    if (cancelChallenge) {
      cancelChallenge.addEventListener('click', function cancelCurrentChallenge() {
        currentChallengeId = null;
        document.getElementById('domain-challenge-block').hidden = true;
        document.getElementById('domain-start-block').hidden = false;
        document.getElementById('domain-verify-status').textContent = '';
        var domainInput = document.getElementById('domain-input');
        if (domainInput) domainInput.value = '';
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Payment route
  // ---------------------------------------------------------------------------

  // Tracks the wallet address from the most recent render snapshot.
  // Set by render(); read by bindPaymentRouteEvents signing handler.
  var currentRouteWalletAddress = null;

  function showPaymentRouteSection(routeStatus) {
    var section = document.getElementById('payment-route-section');
    if (!section) return;
    section.hidden = false;

    var activeBlock = document.getElementById('route-active-block');
    var noneBlock = document.getElementById('route-none-block');
    var statusMsg = document.getElementById('route-status-msg');
    var signError = document.getElementById('route-sign-error');

    if (statusMsg) { statusMsg.hidden = true; statusMsg.textContent = ''; }
    if (signError) { signError.textContent = ''; signError.hidden = true; }

    var hasRoute = routeStatus && routeStatus.destination_address;
    if (activeBlock) activeBlock.hidden = !hasRoute;
    if (noneBlock) noneBlock.hidden = !!hasRoute;

    if (hasRoute) {
      var addrEl = document.getElementById('route-address');
      if (addrEl) addrEl.textContent = routeStatus.destination_address;
    }
  }

  // Thin UX shell around IXIDPaymentRouteFlow.doSignAndPublish.
  // Handles button state, progress messages, and route reload on success.
  // All orchestration logic (account-change detection, signing, verification)
  // lives in payment-route-flow.js for independent testability.
  function _triggerSignAndPublish(apiClient, wallet, statusMsg, signError, doneBtn) {
    if (statusMsg) { statusMsg.textContent = ''; statusMsg.hidden = true; }
    if (signError) { signError.textContent = ''; signError.hidden = true; }
    if (doneBtn) doneBtn.disabled = true;
    if (statusMsg) { statusMsg.textContent = 'Requesting signature\u2026'; statusMsg.hidden = false; }

    var flow = root.IXIDPaymentRouteFlow;
    if (!flow) {
      if (signError) { signError.textContent = 'Payment route flow module not loaded.'; signError.hidden = false; }
      if (statusMsg) { statusMsg.hidden = true; }
      if (doneBtn) doneBtn.disabled = false;
      return;
    }

    flow.doSignAndPublish({
      api: apiClient,
      wallet: wallet,
      getToken: function getToken() { return controller.getToken(); },
      address: currentRouteWalletAddress,
    }).then(function onFlowResult(result) {
      if (result.ok) {
        // Reload route state to update the UI
        controller.getToken().then(function onGotReloadToken(token) {
          if (!token) {
            if (statusMsg) { statusMsg.textContent = 'Payment route published.'; statusMsg.hidden = false; }
            return;
          }
          return apiClient.getPaymentRoute(token).then(function onRouteReloaded(r) {
            if (r.status === 200) showPaymentRouteSection(r.body);
            if (statusMsg) { statusMsg.textContent = 'Payment route published.'; statusMsg.hidden = false; }
          }).catch(function ignoreReloadError() {
            if (statusMsg) { statusMsg.textContent = 'Payment route published.'; statusMsg.hidden = false; }
          });
        });
      } else {
        if (signError) { signError.textContent = result.message; signError.hidden = false; }
        if (statusMsg) { statusMsg.hidden = true; }
      }
    }).catch(function onFlowError() {
      if (signError) { signError.textContent = 'Could not complete signing. Try again.'; signError.hidden = false; }
      if (statusMsg) { statusMsg.hidden = true; }
    }).then(function reenableBtn() {
      if (doneBtn) doneBtn.disabled = false;
    });
  }

  function bindPaymentRouteEvents(apiClient, wallet) {
    var statusMsg = document.getElementById('route-status-msg');
    var signError = document.getElementById('route-sign-error');

    // "Sign and publish" — no active route, wallet connected
    var signBtn = document.getElementById('route-sign-btn');
    if (signBtn) {
      signBtn.addEventListener('click', function signAndPublish() {
        _triggerSignAndPublish(apiClient, wallet, statusMsg, signError, signBtn);
      });
    }

    // "Replace wallet" — active route, replace with connected wallet
    var replaceBtn = document.getElementById('route-replace-btn');
    if (replaceBtn) {
      replaceBtn.addEventListener('click', function replaceRoute() {
        _triggerSignAndPublish(apiClient, wallet, statusMsg, signError, replaceBtn);
      });
    }

    // Disable route
    var disableBtn = document.getElementById('route-disable-btn');
    if (disableBtn) {
      disableBtn.addEventListener('click', function disableRoute() {
        if (statusMsg) { statusMsg.textContent = 'Removing route\u2026'; statusMsg.hidden = false; }
        if (signError) { signError.textContent = ''; signError.hidden = true; }
        disableBtn.disabled = true;

        controller.getToken().then(function onGotDisableToken(token) {
          if (!token) {
            if (statusMsg) statusMsg.textContent = 'Sign in required.';
            disableBtn.disabled = false;
            return;
          }
          return apiClient.disablePaymentRoute(token).then(function onDisabled(result) {
            if (result.status === 200) {
              showPaymentRouteSection(result.body);
              if (statusMsg) { statusMsg.textContent = 'Payment route removed.'; statusMsg.hidden = false; }
            } else if (result.status === 429) {
              if (statusMsg) { statusMsg.textContent = 'Too many attempts. Try again later.'; statusMsg.hidden = false; }
            } else {
              var msg = (result.body && result.body.detail) ? result.body.detail : 'Could not remove route. Try again.';
              if (statusMsg) { statusMsg.textContent = msg; statusMsg.hidden = false; }
            }
          }).catch(function onDisableError() {
            if (statusMsg) { statusMsg.textContent = 'Could not remove route. Try again.'; statusMsg.hidden = false; }
          }).then(function enableDisableBtn() {
            disableBtn.disabled = false;
          });
        });
      });
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
      api = root.IXIDHolderApi.createHolderApiClient({ baseUrl: config.holderApiBase });
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
      bindProfileEvents(api);
      bindDomainEvents(api);
      bindPaymentRouteEvents(api, wallet);
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
