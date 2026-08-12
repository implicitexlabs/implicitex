/* Coin Card holder-management state model.
 *
 * This module stages local, non-production holder intent. It never signs or
 * publishes authority, classifies lifecycle records, or enables execution.
 */

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') {
    Object.defineProperty(root, 'IX_COIN_CARD_HOLDER_MODEL', {
      value: api,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
})(typeof window === 'object' ? window : null, function () {
  'use strict';

  var MODEL_SCHEMA = 'coin-card-holder-management-state.v1';
  var SESSION_SCHEMA = 'coin-card-holder-session.non-production.v1';
  var ACCOUNT_SOURCE_SCHEMA = 'coin-card-holder-account-source.non-production.v1';
  var CANONICAL_HOST = 'coincard.click';
  var HOLDER_ORIGIN = 'https://app.coincard.click';
  var HOLDER_AUDIENCE = 'coin-card-holder';
  var SESSION_BOUNDARY = 'HOST_ONLY_APP_COINCARD_CLICK';
  var ACCOUNT_ID_RE = /^acct_[0-9A-HJKMNP-TV-Z]{26}$/;
  var CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;
  var HTTPS_URL_RE = /^https:\/\/[^\s]+$/;

  var ROUTE_POLICY = Object.freeze({
    network: 'Polygon',
    chainId: 137,
    asset: 'USDC',
    tokenContractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    assetDecimals: 6,
  });
  var PRESENTATION_POLICY = Object.freeze({
    avatarUrlMaxLength: 2048,
    bannerUrlMaxLength: 2048,
    bioMaxLength: 160,
    externalUrlMaxLength: 2048,
  });
  var WALLET_CONTROL_STATES = Object.freeze({
    WALLET_NOT_CONFIGURED: 'WALLET_NOT_CONFIGURED',
    WALLET_CONTROL_UNVERIFIED: 'WALLET_CONTROL_UNVERIFIED',
    CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
    WALLET_CONTROL_VERIFIED: 'WALLET_CONTROL_VERIFIED',
    EVIDENCE_EXPIRED: 'EVIDENCE_EXPIRED',
    ROUTE_UPDATE_REQUIRES_EVIDENCE: 'ROUTE_UPDATE_REQUIRES_EVIDENCE',
  });
  var LIFECYCLE_STATES = Object.freeze({
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    REVOKED: 'REVOKED',
    TOMBSTONED: 'TOMBSTONED',
    UNKNOWN: 'UNKNOWN',
    INVALID: 'INVALID',
    AUTHORITY_UNAVAILABLE: 'AUTHORITY_UNAVAILABLE',
  });
  var STATE_RESULTS = new WeakSet();

  function clone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function assertPlainObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be an object');
    }
  }

  function canonicalUrl(username) {
    return username ? 'https://' + username + '.' + CANONICAL_HOST + '/' : null;
  }

  function currentUsername(state) {
    return state.account.username || state.draft.username;
  }

  function currentCardId(state) {
    return state.account.cardId || state.draft.cardId;
  }

  function holderAction(lifecycleState, originalHolder) {
    if (lifecycleState === LIFECYCLE_STATES.ACTIVE) return 'NORMAL_MANAGEMENT';
    if (lifecycleState === LIFECYCLE_STATES.EXPIRED) return 'RENEWAL_OR_RESTORATION_REVIEW';
    if (lifecycleState === LIFECYCLE_STATES.TOMBSTONED && originalHolder === true) {
      return 'ORIGINAL_HOLDER_RESTORATION_ONLY';
    }
    if (lifecycleState === LIFECYCLE_STATES.UNKNOWN) return 'COMPLETE_ACTIVATION_PREREQUISITES';
    return 'NO_HOLDER_MUTATION_AVAILABLE';
  }

  function deriveWorkflow(raw) {
    if (raw.account.cardId) {
      if (raw.lifecycleState === LIFECYCLE_STATES.ACTIVE && !raw.draft.route) {
        return 'ACTIVE_MANAGEMENT';
      }
      if (raw.lifecycleState === LIFECYCLE_STATES.INVALID) return 'AUTHORITY_INVALID';
      if (raw.lifecycleState === LIFECYCLE_STATES.AUTHORITY_UNAVAILABLE) {
        return 'AUTHORITY_UNAVAILABLE';
      }
      if (raw.draft.route && raw.walletControlState !== WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED) {
        return 'ROUTE_UPDATE_REQUIRES_EVIDENCE';
      }
      return 'LIFECYCLE_' + raw.lifecycleState;
    }
    if (!raw.draft.username) return 'ACCOUNT_READY';
    if (!raw.draft.reservation) return 'USERNAME_SELECTED';
    if (!raw.draft.cardId) return 'USERNAME_RESERVED';
    if (!raw.draft.presentation) return 'PRESENTATION_REQUIRED';
    if (!raw.draft.route) return 'ROUTING_REQUIRED';
    if (raw.walletControlState !== WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED) {
      return 'WALLET_EVIDENCE_REQUIRED';
    }
    if (raw.entitlementState !== 'NON_PRODUCTION_ELIGIBLE') return 'ENTITLEMENT_REQUIRED';
    if (raw.reviewed !== true) return 'REVIEW_REQUIRED';
    return 'ACTIVATION_READY';
  }

  function sealState(raw) {
    var value = {
      schemaVersion: MODEL_SCHEMA,
      environment: 'NON_PRODUCTION',
      session: clone(raw.session),
      account: clone(raw.account),
      draft: clone(raw.draft),
      authoritative: clone(raw.authoritative),
      lifecycleState: raw.lifecycleState,
      holderAction: holderAction(raw.lifecycleState, raw.account.originalHolder),
      walletControlState: raw.walletControlState,
      entitlementState: raw.entitlementState,
      reviewed: raw.reviewed === true,
      workflowState: null,
      canonicalUsername: raw.account.username || raw.draft.username,
      canonicalUrl: canonicalUrl(raw.account.username || raw.draft.username),
      writeDisposition: raw.authoritative.preview
        ? 'AUTHORITATIVE_READ_ONLY_WITH_LOCAL_DRAFTS'
        : 'LOCAL_NON_PRODUCTION_DRAFT',
      executionEligible: false,
      paymentControlEnabled: false,
      authoritativePublicationAdvanced: false,
    };
    value.workflowState = deriveWorkflow(value);
    freeze(value);
    STATE_RESULTS.add(value);
    return value;
  }

  function isHolderState(value) {
    try { return STATE_RESULTS.has(value); } catch (error) { return false; }
  }

  function assertState(value) {
    if (!isHolderState(value)) throw new TypeError('genuine holder-management state required');
  }

  function rawFrom(state) {
    return {
      session: state.session,
      account: state.account,
      draft: state.draft,
      authoritative: state.authoritative,
      lifecycleState: state.lifecycleState,
      walletControlState: state.walletControlState,
      entitlementState: state.entitlementState,
      reviewed: state.reviewed,
    };
  }

  function replace(state, changes) {
    assertState(state);
    var raw = rawFrom(state);
    Object.keys(changes || {}).forEach(function (key) { raw[key] = changes[key]; });
    return sealState(raw);
  }

  function validateSession(session) {
    assertPlainObject(session, 'holder session');
    if (
      session.schemaVersion !== SESSION_SCHEMA
      || session.environment !== 'NON_PRODUCTION'
      || session.origin !== HOLDER_ORIGIN
      || session.audience !== HOLDER_AUDIENCE
      || session.sessionBoundary !== SESSION_BOUNDARY
      || session.authenticated !== true
      || !ACCOUNT_ID_RE.test(session.accountId)
    ) throw new Error('holder session boundary invalid');
    return clone(session);
  }

  function validateAccountRecord(record, session, usernameApi) {
    assertPlainObject(record, 'holder account source');
    if (
      record.schemaVersion !== ACCOUNT_SOURCE_SCHEMA
      || record.environment !== 'NON_PRODUCTION'
      || record.accountId !== session.accountId
      || !ACCOUNT_ID_RE.test(record.accountId)
      || typeof record.originalHolder !== 'boolean'
    ) throw new Error('holder account source invalid');
    var hasUsername = typeof record.username === 'string';
    var hasCard = typeof record.cardId === 'string';
    if (hasUsername !== hasCard) throw new Error('username/card identity disagreement');
    if (hasUsername && usernameApi.validateCurrentUsername(record.username).valid !== true) {
      throw new Error('account username is not current-policy eligible');
    }
    if (hasCard && !CARD_ID_RE.test(record.cardId)) throw new Error('account card identity invalid');
    if (record.route !== null && !hasCard) throw new Error('route exists without Coin Card identity');
    return clone(record);
  }

  function normalizeOptionalUrl(value, maximum, label) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > maximum || !HTTPS_URL_RE.test(value)) {
      throw new Error(label + ' must be a bounded HTTPS URL');
    }
    return value;
  }

  function validatePresentation(input) {
    assertPlainObject(input, 'presentation');
    var bio = input.bio === undefined || input.bio === null ? '' : input.bio;
    if (typeof bio !== 'string' || bio.length > PRESENTATION_POLICY.bioMaxLength) {
      throw new Error('bio exceeds the local product-policy limit');
    }
    return freeze({
      avatarUrl: normalizeOptionalUrl(
        input.avatarUrl || null,
        PRESENTATION_POLICY.avatarUrlMaxLength,
        'avatar URL'
      ),
      bannerUrl: normalizeOptionalUrl(
        input.bannerUrl || null,
        PRESENTATION_POLICY.bannerUrlMaxLength,
        'banner URL'
      ),
      bio: bio,
      externalUrl: normalizeOptionalUrl(
        input.externalUrl || null,
        PRESENTATION_POLICY.externalUrlMaxLength,
        'external link'
      ),
      policyClassification: 'LOCAL_PRODUCT_POLICY_NOT_CRYPTOGRAPHIC_AUTHORITY',
    });
  }

  function createHolderManagement(options) {
    assertPlainObject(options, 'holder management dependencies');
    var usernameApi = options.usernameApi;
    var accountSourceApi = options.accountSourceApi;
    var reservationApi = options.reservationApi;
    var identityIntentApi = options.identityIntentApi;
    var routeIntentApi = options.routeIntentApi;
    var walletChallengeApi = options.walletChallengeApi;
    var entitlementApi = options.entitlementApi;
    var readonlyBrowser = options.readonlyBrowser;
    var normalizeWalletAddress = options.normalizeWalletAddress;
    var clock = typeof options.clock === 'function' ? options.clock : function () { return new Date(); };
    if (!usernameApi || typeof usernameApi.validateCurrentUsername !== 'function') {
      throw new TypeError('canonical username authority required');
    }
    if (!accountSourceApi || typeof accountSourceApi.loadForSession !== 'function'
      || typeof accountSourceApi.isAccountSourceResult !== 'function') {
      throw new TypeError('holder account source required');
    }
    if (!readonlyBrowser || typeof readonlyBrowser.resolveReadOnlyCard !== 'function'
      || typeof readonlyBrowser.isReadOnlyViewResult !== 'function') {
      throw new TypeError('public read-only browser adapter required');
    }
    if (typeof normalizeWalletAddress !== 'function') {
      throw new TypeError('canonical EVM address normalizer required');
    }

    async function start(sessionInput) {
      var session = validateSession(sessionInput);
      var accountResult = await accountSourceApi.loadForSession(session);
      if (accountSourceApi.isAccountSourceResult(accountResult) !== true) {
        throw new Error('holder account authority unavailable');
      }
      var account = validateAccountRecord(accountResult, session, usernameApi);
      var route = account.route ? clone(account.route) : null;
      return sealState({
        session: session,
        account: {
          accountId: account.accountId,
          username: account.username,
          cardId: account.cardId,
          originalHolder: account.originalHolder,
        },
        draft: {
          username: account.username,
          reservation: null,
          cardId: account.cardId,
          presentation: null,
          route: null,
          walletChallenge: null,
          walletEvidence: null,
        },
        authoritative: {
          preview: null,
          route: route,
          routeRevision: route && route.revision || null,
          lastAuthorizedUpdate: route && route.lastAuthorizedUpdate || null,
        },
        lifecycleState: LIFECYCLE_STATES.UNKNOWN,
        walletControlState: route
          ? (route.walletControlState || WALLET_CONTROL_STATES.WALLET_CONTROL_UNVERIFIED)
          : WALLET_CONTROL_STATES.WALLET_NOT_CONFIGURED,
        entitlementState: account.entitlementState || 'ENTITLEMENT_REQUIRED',
        reviewed: false,
      });
    }

    function selectUsername(state, username) {
      assertState(state);
      if (state.account.username || state.account.cardId) {
        throw new Error('account already has one canonical username and Coin Card');
      }
      var validation = usernameApi.validateCurrentUsername(username);
      if (validation.valid !== true) throw new Error('current canonical username invalid');
      if (state.draft.username && state.draft.username !== validation.username) {
        throw new Error('second username for one account denied');
      }
      var draft = clone(state.draft);
      draft.username = validation.username;
      return replace(state, { draft: draft, reviewed: false });
    }

    async function reserveUsername(state) {
      assertState(state);
      if (!state.draft.username || state.account.username) throw new Error('reservable username required');
      if (!reservationApi || typeof reservationApi.reserve !== 'function'
        || typeof reservationApi.isReservationResult !== 'function') {
        throw new Error('username reservation boundary unavailable');
      }
      var result = await reservationApi.reserve({
        accountId: state.account.accountId,
        username: state.draft.username,
      });
      if (reservationApi.isReservationResult(result) !== true
        || result.status !== 'RESERVED'
        || result.accountId !== state.account.accountId
        || result.username !== state.draft.username
        || !Number.isFinite(Date.parse(result.expiresAt))
        || Date.parse(result.expiresAt) <= clock().getTime()) {
        throw new Error('username reservation invalid or expired');
      }
      var draft = clone(state.draft);
      draft.reservation = clone(result);
      return replace(state, { draft: draft, reviewed: false });
    }

    async function establishCardIdentity(state) {
      assertState(state);
      if (state.account.cardId || state.draft.cardId) throw new Error('account already has one Coin Card');
      if (!state.draft.reservation || Date.parse(state.draft.reservation.expiresAt) <= clock().getTime()) {
        throw new Error('current username reservation required');
      }
      if (!identityIntentApi || typeof identityIntentApi.allocate !== 'function'
        || typeof identityIntentApi.isIdentityIntentResult !== 'function') {
        throw new Error('identity intent boundary unavailable');
      }
      var result = await identityIntentApi.allocate({
        accountId: state.account.accountId,
        username: state.draft.username,
        reservationId: state.draft.reservation.reservationId,
      });
      if (identityIntentApi.isIdentityIntentResult(result) !== true
        || result.accountId !== state.account.accountId
        || result.username !== state.draft.username
        || !CARD_ID_RE.test(result.cardId)
        || result.authoritative !== false) {
        throw new Error('local Coin Card identity intent invalid');
      }
      var draft = clone(state.draft);
      draft.cardId = result.cardId;
      return replace(state, { draft: draft, reviewed: false });
    }

    function updatePresentation(state, input) {
      assertState(state);
      if (!currentCardId(state)) throw new Error('Coin Card identity required before presentation');
      var draft = clone(state.draft);
      draft.presentation = validatePresentation(input);
      return replace(state, { draft: draft, reviewed: false });
    }

    async function configureRoute(state, input) {
      assertState(state);
      if (!currentCardId(state) || !currentUsername(state)) throw new Error('Coin Card identity required');
      assertPlainObject(input, 'route intent');
      if (
        input.chainId !== ROUTE_POLICY.chainId
        || input.asset !== ROUTE_POLICY.asset
        || typeof input.tokenContractAddress !== 'string'
        || input.tokenContractAddress.toLowerCase() !== ROUTE_POLICY.tokenContractAddress
      ) throw new Error('unsupported Coin Card route');
      var wallet;
      try { wallet = normalizeWalletAddress(input.recipientAddress); } catch (error) { wallet = null; }
      if (typeof wallet !== 'string' || !/^0x[0-9A-Fa-f]{40}$/.test(wallet)) {
        throw new Error('recipient wallet invalid');
      }
      if (!routeIntentApi || typeof routeIntentApi.stage !== 'function'
        || typeof routeIntentApi.isRouteIntentResult !== 'function') {
        throw new Error('route intent boundary unavailable');
      }
      var result = await routeIntentApi.stage({
        accountId: state.account.accountId,
        username: currentUsername(state),
        cardId: currentCardId(state),
        chainId: ROUTE_POLICY.chainId,
        asset: ROUTE_POLICY.asset,
        tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
        recipientAddress: wallet,
      });
      if (routeIntentApi.isRouteIntentResult(result) !== true
        || result.authoritative !== false
        || result.accountId !== state.account.accountId
        || result.username !== currentUsername(state)
        || result.cardId !== currentCardId(state)
        || result.chainId !== ROUTE_POLICY.chainId
        || result.asset !== ROUTE_POLICY.asset
        || result.tokenContractAddress !== ROUTE_POLICY.tokenContractAddress
        || result.recipientAddress !== wallet) {
        throw new Error('route intent binding invalid');
      }
      var draft = clone(state.draft);
      draft.route = clone(result);
      draft.walletChallenge = null;
      draft.walletEvidence = null;
      return replace(state, {
        draft: draft,
        walletControlState: state.account.cardId
          ? WALLET_CONTROL_STATES.ROUTE_UPDATE_REQUIRES_EVIDENCE
          : WALLET_CONTROL_STATES.WALLET_CONTROL_UNVERIFIED,
        reviewed: false,
      });
    }

    async function requestWalletChallenge(state) {
      assertState(state);
      if (!state.draft.route) throw new Error('configured route required before wallet challenge');
      if (!walletChallengeApi || typeof walletChallengeApi.issue !== 'function'
        || typeof walletChallengeApi.isChallengeResult !== 'function') {
        throw new Error('wallet challenge transport unavailable');
      }
      var challenge = await walletChallengeApi.issue({
        accountId: state.account.accountId,
        username: currentUsername(state),
        cardId: currentCardId(state),
        walletAddress: state.draft.route.recipientAddress,
        chainId: ROUTE_POLICY.chainId,
        purpose: 'claim_coin_card',
      });
      if (walletChallengeApi.isChallengeResult(challenge) !== true
        || challenge.accountId !== state.account.accountId
        || challenge.username !== currentUsername(state)
        || challenge.cardId !== currentCardId(state)
        || challenge.walletAddress !== state.draft.route.recipientAddress
        || challenge.chainId !== ROUTE_POLICY.chainId
        || Date.parse(challenge.expiresAt) <= clock().getTime()) {
        throw new Error('wallet challenge binding invalid');
      }
      var draft = clone(state.draft);
      draft.walletChallenge = clone(challenge);
      draft.walletEvidence = null;
      return replace(state, {
        draft: draft,
        walletControlState: WALLET_CONTROL_STATES.CHALLENGE_REQUIRED,
        reviewed: false,
      });
    }

    async function verifyWalletChallenge(state, signature) {
      assertState(state);
      if (!state.draft.walletChallenge || !state.draft.route) {
        throw new Error('wallet challenge required');
      }
      if (typeof signature !== 'string' || signature.length === 0) {
        throw new Error('wallet signature required');
      }
      var result = await walletChallengeApi.verify({
        challengeId: state.draft.walletChallenge.challengeId,
        signature: signature,
        accountId: state.account.accountId,
        username: currentUsername(state),
        cardId: currentCardId(state),
        walletAddress: state.draft.route.recipientAddress,
        chainId: ROUTE_POLICY.chainId,
      });
      if (walletChallengeApi.isEvidenceResult(result) !== true) {
        throw new Error('wallet evidence authority invalid');
      }
      if (result.status === 'EXPIRED') {
        var expiredDraft = clone(state.draft);
        expiredDraft.walletEvidence = clone(result);
        return replace(state, {
          draft: expiredDraft,
          walletControlState: WALLET_CONTROL_STATES.EVIDENCE_EXPIRED,
          reviewed: false,
        });
      }
      if (result.status !== 'VERIFIED'
        || result.accountId !== state.account.accountId
        || result.username !== currentUsername(state)
        || result.cardId !== currentCardId(state)
        || result.walletAddress !== state.draft.route.recipientAddress
        || result.chainId !== ROUTE_POLICY.chainId) {
        throw new Error('wallet evidence binding mismatch');
      }
      var draft = clone(state.draft);
      draft.walletEvidence = clone(result);
      return replace(state, {
        draft: draft,
        walletControlState: WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED,
        reviewed: false,
      });
    }

    async function assessEntitlement(state) {
      assertState(state);
      if (!entitlementApi || typeof entitlementApi.assess !== 'function'
        || typeof entitlementApi.isEntitlementResult !== 'function') {
        throw new Error('entitlement boundary unavailable');
      }
      var result = await entitlementApi.assess({
        accountId: state.account.accountId,
        username: currentUsername(state),
        cardId: currentCardId(state),
      });
      if (entitlementApi.isEntitlementResult(result) !== true
        || result.accountId !== state.account.accountId
        || result.cardId !== currentCardId(state)
        || ['ENTITLEMENT_REQUIRED', 'NON_PRODUCTION_ELIGIBLE'].indexOf(result.status) === -1) {
        throw new Error('entitlement result invalid');
      }
      return replace(state, { entitlementState: result.status, reviewed: false });
    }

    function reviewActivation(state) {
      assertState(state);
      var ready = !!(
        !state.account.cardId
        && state.draft.username
        && state.draft.reservation
        && state.draft.cardId
        && state.draft.presentation
        && state.draft.route
        && state.walletControlState === WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED
        && state.entitlementState === 'NON_PRODUCTION_ELIGIBLE'
      );
      return replace(state, { reviewed: ready });
    }

    async function refreshPublicPreview(state) {
      assertState(state);
      if (!state.canonicalUrl) throw new Error('canonical username required for public preview');
      var view;
      try { view = await readonlyBrowser.resolveReadOnlyCard(state.canonicalUrl); } catch (error) {
        view = null;
      }
      var valid = false;
      try { valid = readonlyBrowser.isReadOnlyViewResult(view) === true; } catch (error) { valid = false; }
      var lifecycle = LIFECYCLE_STATES.AUTHORITY_UNAVAILABLE;
      if (valid && Object.prototype.hasOwnProperty.call(LIFECYCLE_STATES, view.viewState)
        && view.executionEligible === false && view.paymentControlEnabled === false) {
        lifecycle = view.viewState;
      } else if (view !== null) {
        lifecycle = LIFECYCLE_STATES.INVALID;
      }
      var expectedCardId = currentCardId(state);
      var agreement = !valid || (
        view.cardId === null
        || expectedCardId === null
        || view.cardId === expectedCardId
      );
      if (valid && !agreement) lifecycle = LIFECYCLE_STATES.INVALID;
      var authoritative = clone(state.authoritative);
      authoritative.preview = valid ? clone(view) : null;
      if (valid && view.routeRevision) authoritative.routeRevision = view.routeRevision;
      return replace(state, {
        authoritative: authoritative,
        lifecycleState: lifecycle,
      });
    }

    function rejectAuthoritativeWrite(state) {
      assertState(state);
      return freeze({
        outcome: 'AUTHORITATIVE_WRITE_NOT_AVAILABLE',
        stateUnchanged: true,
        authoritativePublicationAdvanced: false,
        executionEligible: false,
      });
    }

    function rejectExecution(state) {
      assertState(state);
      return freeze({
        outcome: 'HOLDER_EXECUTION_UNAVAILABLE',
        stateUnchanged: true,
        executionEligible: false,
        paymentControlEnabled: false,
      });
    }

    return freeze({
      start: start,
      selectUsername: selectUsername,
      reserveUsername: reserveUsername,
      establishCardIdentity: establishCardIdentity,
      updatePresentation: updatePresentation,
      configureRoute: configureRoute,
      requestWalletChallenge: requestWalletChallenge,
      verifyWalletChallenge: verifyWalletChallenge,
      assessEntitlement: assessEntitlement,
      reviewActivation: reviewActivation,
      refreshPublicPreview: refreshPublicPreview,
      rejectAuthoritativeWrite: rejectAuthoritativeWrite,
      rejectExecution: rejectExecution,
      isHolderState: isHolderState,
    });
  }

  return freeze({
    MODEL_SCHEMA: MODEL_SCHEMA,
    SESSION_SCHEMA: SESSION_SCHEMA,
    ACCOUNT_SOURCE_SCHEMA: ACCOUNT_SOURCE_SCHEMA,
    HOLDER_ORIGIN: HOLDER_ORIGIN,
    HOLDER_AUDIENCE: HOLDER_AUDIENCE,
    SESSION_BOUNDARY: SESSION_BOUNDARY,
    ROUTE_POLICY: ROUTE_POLICY,
    PRESENTATION_POLICY: PRESENTATION_POLICY,
    WALLET_CONTROL_STATES: WALLET_CONTROL_STATES,
    LIFECYCLE_STATES: LIFECYCLE_STATES,
    createHolderManagement: createHolderManagement,
    isHolderState: isHolderState,
  });
});
