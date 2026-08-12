(function () {
  'use strict';

  var root = document.getElementById('holderApp');
  var runtime = window.IX_COIN_CARD_HOLDER_NON_PRODUCTION_RUNTIME;
  var model = window.IX_COIN_CARD_HOLDER_MODEL;
  var management = null;
  var state = null;
  var busy = false;

  var stepStates = [
    'ACCOUNT_READY',
    'USERNAME_SELECTED',
    'USERNAME_RESERVED',
    'PRESENTATION_REQUIRED',
    'ROUTING_REQUIRED',
    'WALLET_EVIDENCE_REQUIRED',
    'ENTITLEMENT_REQUIRED',
    'REVIEW_REQUIRED',
    'ACTIVATION_READY',
  ];
  var stepLabels = [
    'Account', 'Username', 'Reservation', 'Identity & profile', 'Route',
    'Wallet evidence', 'Entitlement', 'Review', 'Activation ready',
  ];

  function byId(id) { return document.getElementById(id); }
  function action(name) { return document.querySelector('[data-action="' + name + '"]'); }

  function setText(id, value) {
    var node = byId(id);
    if (node) node.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  }

  function abbreviate(value) {
    if (typeof value !== 'string' || value.length < 16) return value || 'Not configured';
    return value.slice(0, 8) + '…' + value.slice(-6);
  }

  function workflowRank(workflow) {
    var index = stepStates.indexOf(workflow);
    return index === -1 ? stepStates.length : index;
  }

  function renderSteps() {
    var list = byId('activationSteps');
    list.textContent = '';
    var current = workflowRank(state.workflowState);
    stepLabels.forEach(function (label, index) {
      var item = document.createElement('li');
      item.textContent = label;
      if (index < current || state.workflowState === 'ACTIVATION_READY') item.className = 'is-complete';
      if (index === current && state.workflowState !== 'ACTIVATION_READY') item.className = 'is-current';
      list.appendChild(item);
    });
  }

  function setButton(name, enabled) {
    var button = action(name);
    if (button) button.disabled = busy || enabled !== true;
  }

  function renderButtons() {
    var workflow = state.workflowState;
    var isNew = !state.account.cardId;
    setButton('select-username', isNew && workflow === 'ACCOUNT_READY');
    setButton('reserve-username', isNew && workflow === 'USERNAME_SELECTED');
    setButton('allocate-card', isNew && workflow === 'USERNAME_RESERVED');
    setButton('save-presentation', !!state.draft.cardId || !!state.account.cardId);
    setButton('save-route', !!state.draft.cardId || !!state.account.cardId);
    setButton('request-challenge', !!state.draft.route);
    setButton('verify-wallet', state.walletControlState === model.WALLET_CONTROL_STATES.CHALLENGE_REQUIRED);
    setButton('assess-entitlement', state.walletControlState === model.WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED);
    setButton('review-activation', isNew && state.entitlementState === 'NON_PRODUCTION_ELIGIBLE');
    setButton('refresh-preview', !!state.canonicalUrl);
  }

  function lifecycleTone(value) {
    if (value === 'ACTIVE') return 'positive';
    if (value === 'UNKNOWN' || value === 'EXPIRED') return 'warning';
    if (value === 'INVALID' || value === 'AUTHORITY_UNAVAILABLE' || value === 'REVOKED' || value === 'TOMBSTONED') return 'danger';
    return 'neutral';
  }

  function renderPreview() {
    var panel = byId('publicPreview');
    var preview = state.authoritative.preview;
    panel.textContent = '';
    panel.dataset.previewState = preview ? state.lifecycleState : 'NOT_LOADED';
    var badge = document.createElement('span');
    badge.className = 'preview-state';
    badge.textContent = preview ? state.lifecycleState : 'NOT_LOADED';
    panel.appendChild(badge);
    var copy = document.createElement('p');
    if (!preview) {
      copy.textContent = state.lifecycleState === 'AUTHORITY_UNAVAILABLE'
        ? 'The public authority source could not be established. The holder app fails closed.'
        : 'The preview is loaded through the public read-only adapter, not from these form fields.';
    } else if (state.lifecycleState === 'ACTIVE') {
      copy.textContent = 'The public adapter authenticated the same card identity and current route revision '
        + (preview.routeRevision || '—') + '. Payment execution remains unavailable.';
    } else {
      copy.textContent = 'The public adapter reports ' + state.lifecycleState
        + '. Local drafts do not override this authoritative outcome.';
    }
    panel.appendChild(copy);
  }

  function render() {
    if (!state) return;
    var route = state.draft.route || state.authoritative.route;
    root.dataset.ready = 'true';
    root.dataset.workflow = state.workflowState;
    root.dataset.lifecycle = state.lifecycleState;
    root.dataset.executionEligible = String(state.executionEligible);
    root.dataset.authorityMode = state.writeDisposition;
    setText('workflowBadge', state.workflowState);
    byId('workflowBadge').dataset.tone = lifecycleTone(state.lifecycleState);
    setText('summaryUsername', state.canonicalUsername || 'Not selected');
    var url = byId('summaryCanonicalUrl');
    if (state.canonicalUrl) {
      url.hidden = false;
      url.href = state.canonicalUrl;
      url.textContent = state.canonicalUrl;
    } else {
      url.hidden = true;
      url.removeAttribute('href');
      url.textContent = '';
    }
    setText('summaryLifecycle', state.lifecycleState);
    setText('summaryEntitlement', state.entitlementState);
    setText('summaryWalletControl', state.walletControlState);
    setText('summaryWriteState', state.writeDisposition);
    setText('summaryNetwork', route ? 'Polygon' : model.ROUTE_POLICY.network);
    setText('summaryAsset', route ? route.asset : model.ROUTE_POLICY.asset);
    setText('summaryWallet', abbreviate(route && route.recipientAddress));
    setText('summaryRevision', state.authoritative.routeRevision || (route && route.proposedRevision) || '—');
    setText('summaryLastUpdate', state.authoritative.lastAuthorizedUpdate || '—');
    setText('evidenceBadge', state.walletControlState);
    setText('evidenceHeading', state.walletControlState.replaceAll('_', ' ').toLowerCase());
    setText('evidenceCopy', state.walletControlState === 'WALLET_CONTROL_VERIFIED'
      ? 'Fixture evidence is bound to this username, opaque card ID, chain, and wallet. It is not production evidence.'
      : state.walletControlState === 'EVIDENCE_EXPIRED'
        ? 'The evidence is expired. Route publication remains unavailable until fresh evidence exists.'
        : 'A local challenge is required before this route intent can become activation-ready.');
    setText('accountId', state.account.accountId);
    setText('sessionOrigin', state.session.origin);
    setText('sessionAudience', state.session.audience);
    setText('sessionBoundary', state.session.sessionBoundary);
    renderSteps();
    renderPreview();
    renderButtons();
  }

  function showError(error) {
    var banner = byId('errorBanner');
    banner.hidden = false;
    banner.textContent = error && error.message ? error.message : String(error);
  }

  function clearError() {
    var banner = byId('errorBanner');
    banner.hidden = true;
    banner.textContent = '';
  }

  async function transition(fn) {
    if (busy) return;
    busy = true;
    clearError();
    renderButtons();
    try {
      state = await fn(state);
      render();
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      renderButtons();
    }
  }

  function bindNavigation() {
    document.querySelectorAll('[data-section-target]').forEach(function (button) {
      button.addEventListener('click', function () {
        document.querySelectorAll('[data-section-target]').forEach(function (item) {
          item.classList.toggle('is-active', item === button);
        });
        document.querySelectorAll('[data-section]').forEach(function (section) {
          var selected = section.dataset.section === button.dataset.sectionTarget;
          section.hidden = !selected;
          section.classList.toggle('is-active', selected);
        });
      });
    });
  }

  function bindActions() {
    action('select-username').addEventListener('click', function () {
      transition(function (current) { return management.selectUsername(current, byId('usernameInput').value); });
    });
    action('reserve-username').addEventListener('click', function () {
      transition(function (current) { return management.reserveUsername(current); });
    });
    action('allocate-card').addEventListener('click', function () {
      transition(function (current) { return management.establishCardIdentity(current); });
    });
    byId('presentationForm').addEventListener('submit', function (event) {
      event.preventDefault();
      transition(function (current) {
        return management.updatePresentation(current, {
          avatarUrl: byId('avatarUrl').value,
          bannerUrl: byId('bannerUrl').value,
          bio: byId('bio').value,
          externalUrl: byId('externalUrl').value,
        });
      });
    });
    byId('routeForm').addEventListener('submit', function (event) {
      event.preventDefault();
      transition(function (current) {
        return management.configureRoute(current, {
          chainId: Number(byId('chainId').value),
          asset: byId('asset').value,
          tokenContractAddress: byId('tokenContract').value,
          recipientAddress: byId('recipientAddress').value,
        });
      });
    });
    action('request-challenge').addEventListener('click', function () {
      transition(function (current) { return management.requestWalletChallenge(current); });
    });
    action('verify-wallet').addEventListener('click', function () {
      transition(function (current) { return management.verifyWalletChallenge(current, 'non-production-fixture-signature'); });
    });
    action('assess-entitlement').addEventListener('click', function () {
      transition(function (current) { return management.assessEntitlement(current); });
    });
    action('review-activation').addEventListener('click', function () {
      transition(function (current) { return management.reviewActivation(current); });
    });
    action('refresh-preview').addEventListener('click', function () {
      transition(function (current) { return management.refreshPublicPreview(current); });
    });
    byId('bio').addEventListener('input', function () { setText('bioCount', byId('bio').value.length); });
  }

  var ready = (async function () {
    if (!runtime || !model) throw new Error('holder non-production runtime unavailable');
    management = model.createHolderManagement(runtime.dependencies);
    state = await management.start(runtime.session);
    if (state.account.cardId) state = await management.refreshPublicPreview(state);
    bindNavigation();
    bindActions();
    setText('bioCount', byId('bio').value.length);
    render();
    return state;
  })().catch(function (error) {
    showError(error);
    root.dataset.ready = 'error';
    throw error;
  });

  Object.defineProperty(window, '__COIN_CARD_HOLDER_TEST', {
    value: Object.freeze({
      ready: ready,
      getState: function () { return state; },
      getManagement: function () { return management; },
      fixtureTrustBoundary: 'NON_PRODUCTION_TEST_FIXTURE',
    }),
    writable: false,
    enumerable: false,
    configurable: false,
  });
})();
