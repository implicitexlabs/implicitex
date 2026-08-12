/* NON_PRODUCTION_TEST_FIXTURE: local holder-management authority adapters.
 * No object in this file is production authority or execution capability.
 */

(function () {
  'use strict';

  var USERNAME = 'antoinedennison';
  var ACCOUNT_ID = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8';
  var CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';
  var RECIPIENT = '0x2489587c9da6eab970a5479ba70273ba37961221';
  var TOKEN = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
  var query = new window.URL(window.location.href).searchParams;
  var scenario = query.get('scenario') || 'new';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function brandedApi() {
    var values = new WeakSet();
    return {
      make: function (value) {
        var result = freeze(value);
        values.add(result);
        return result;
      },
      has: function (value) {
        try { return values.has(value); } catch (error) { return false; }
      },
    };
  }

  var accountResults = brandedApi();
  var reservationResults = brandedApi();
  var identityResults = brandedApi();
  var routeIntentResults = brandedApi();
  var challengeResults = brandedApi();
  var evidenceResults = brandedApi();
  var entitlementResults = brandedApi();
  var publicResolutionResults = brandedApi();
  var routeAuthorityResults = brandedApi();

  var existing = scenario !== 'new';
  var accountRecord = accountResults.make({
    schemaVersion: 'coin-card-holder-account-source.non-production.v1',
    environment: 'NON_PRODUCTION',
    accountId: ACCOUNT_ID,
    username: existing ? USERNAME : null,
    cardId: existing ? CARD_ID : null,
    originalHolder: true,
    entitlementState: existing ? 'NON_PRODUCTION_ELIGIBLE' : 'ENTITLEMENT_REQUIRED',
    route: existing ? {
      recipientAddress: RECIPIENT,
      network: 'Polygon',
      chainId: 137,
      asset: 'USDC',
      tokenContractAddress: TOKEN,
      revision: '7',
      lastAuthorizedUpdate: '2026-08-11T12:00:00.000Z',
      walletControlState: 'WALLET_CONTROL_VERIFIED',
    } : null,
  });

  var accountSourceApi = freeze({
    loadForSession: async function () { return accountRecord; },
    isAccountSourceResult: accountResults.has,
  });

  var reservationApi = freeze({
    reserve: async function (input) {
      return reservationResults.make({
        status: 'RESERVED',
        authoritative: false,
        reservationId: 'reservation-non-production-antoine',
        accountId: input.accountId,
        username: input.username,
        expiresAt: '2026-08-11T12:30:00.000Z',
      });
    },
    isReservationResult: reservationResults.has,
  });

  var identityIntentApi = freeze({
    allocate: async function (input) {
      return identityResults.make({
        authoritative: false,
        accountId: input.accountId,
        username: input.username,
        cardId: CARD_ID,
        reservationId: input.reservationId,
        writeDisposition: 'LOCAL_NON_PRODUCTION_INTENT',
      });
    },
    isIdentityIntentResult: identityResults.has,
  });

  var routeIntentApi = freeze({
    stage: async function (input) {
      return routeIntentResults.make(Object.assign({}, clone(input), {
        authoritative: false,
        intentId: 'route-intent-non-production-r1',
        proposedRevision: '1',
        writeDisposition: 'LOCAL_NON_PRODUCTION_INTENT',
      }));
    },
    isRouteIntentResult: routeIntentResults.has,
  });

  var issuedChallenge = null;
  var walletChallengeApi = freeze({
    issue: async function (input) {
      issuedChallenge = challengeResults.make(Object.assign({}, clone(input), {
        schemaVersion: 'implicitex.coincard.wallet-challenge.v1',
        challengeId: 'non_production_holder_challenge',
        requestId: '0198a5f7-0700-4000-8000-000000000001',
        message: 'NON-PRODUCTION wallet-control challenge for ' + input.username,
        issuedAt: '2026-08-11T12:00:00.000Z',
        expiresAt: '2026-08-11T12:10:00.000Z',
      }));
      return issuedChallenge;
    },
    verify: async function (input) {
      if (!issuedChallenge || input.challengeId !== issuedChallenge.challengeId) {
        throw new Error('fixture challenge unavailable');
      }
      var status = scenario === 'expired-evidence' ? 'EXPIRED' : 'VERIFIED';
      return evidenceResults.make({
        schemaVersion: 'implicitex.coincard.wallet-proof.v1',
        status: status,
        accountId: input.accountId,
        username: input.username,
        cardId: input.cardId,
        walletAddress: input.walletAddress,
        chainId: input.chainId,
        proofId: issuedChallenge.challengeId,
        verifiedAt: '2026-08-11T12:01:00.000Z',
        authorityClaimed: false,
      });
    },
    isChallengeResult: challengeResults.has,
    isEvidenceResult: evidenceResults.has,
  });

  var entitlementApi = freeze({
    assess: async function (input) {
      return entitlementResults.make({
        status: 'NON_PRODUCTION_ELIGIBLE',
        accountId: input.accountId,
        cardId: input.cardId,
        authorityClaimed: false,
      });
    },
    isEntitlementResult: entitlementResults.has,
  });

  function publicResolution(outcome) {
    var active = outcome === 'PUBLIC_RESOLUTION_ACTIVE';
    return publicResolutionResults.make({
      outcome: outcome,
      canonicalUsername: USERNAME,
      canonicalUrl: 'https://' + USERNAME + '.coincard.click/',
      redirectUrl: null,
      cardId: active ? CARD_ID : null,
      lifecycleOutcome: active ? 'LIFECYCLE_ACTIVE' : null,
      presentationEligible: active,
      executionEligible: false,
      paymentControlEnabled: false,
    });
  }

  var resolutionApi = freeze({
    resolvePublicCard: async function () {
      if (scenario === 'authority-unavailable') {
        return publicResolution('PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE');
      }
      if (scenario === 'invalid') return freeze({ outcome: 'forged' });
      if (scenario === 'revoked') return publicResolution('PUBLIC_RESOLUTION_CARD_REVOKED');
      if (scenario === 'tombstoned') return publicResolution('PUBLIC_RESOLUTION_HANDLE_TOMBSTONED');
      if (scenario === 'expired') return publicResolution('PUBLIC_RESOLUTION_CARD_EXPIRED');
      if (!existing) return publicResolution('PUBLIC_RESOLUTION_HANDLE_NOT_FOUND');
      return publicResolution('PUBLIC_RESOLUTION_ACTIVE');
    },
    isActivePublicResolution: function (value) {
      return publicResolutionResults.has(value) && value.outcome === 'PUBLIC_RESOLUTION_ACTIVE';
    },
  });

  var routeAuthority = freeze({
    loadCurrentRoute: async function (cardId) {
      return routeAuthorityResults.make({
        outcome: 'COIN_CARD_ROUTE_AUTHENTICATED',
        authenticated: true,
        current: true,
        rollbackProtected: true,
        contentValidated: true,
        contentHashEstablished: true,
        presentationEligible: true,
        executionEligible: false,
        cardId: cardId,
        recordHash: 'sha256:' + 'a'.repeat(64),
        revision: '7',
        fixtureTrustBoundary: 'NON_PRODUCTION_TEST_FIXTURE',
        record: freeze({ cardId: cardId, revision: '7' }),
      });
    },
    isAuthoritativeRouteResult: routeAuthorityResults.has,
    isAuthorityUnavailableResult: function () { return false; },
  });

  var readonly = window.IX_COIN_CARD_READONLY_BROWSER;
  var readonlyAdapter = freeze({
    resolveReadOnlyCard: function (publicUrl) {
      return readonly.resolveReadOnlyCard(publicUrl, {
        resolutionApi: resolutionApi,
        routeAuthority: routeAuthority,
      });
    },
    isReadOnlyViewResult: readonly.isReadOnlyViewResult,
  });

  function normalizeWalletAddress(value) {
    if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value)) {
      throw new Error('fixture accepts the lowercase canonical EVM subset only');
    }
    return value;
  }

  Object.defineProperty(window, 'IX_COIN_CARD_HOLDER_NON_PRODUCTION_RUNTIME', {
    value: freeze({
      fixtureTrustBoundary: 'NON_PRODUCTION_TEST_FIXTURE',
      productionAuthorityClaimed: false,
      scenario: scenario,
      session: freeze({
        schemaVersion: 'coin-card-holder-session.non-production.v1',
        environment: 'NON_PRODUCTION',
        origin: 'https://app.coincard.click',
        audience: 'coin-card-holder',
        sessionBoundary: 'HOST_ONLY_APP_COINCARD_CLICK',
        authenticated: true,
        accountId: ACCOUNT_ID,
      }),
      dependencies: freeze({
        usernameApi: window.IX_COIN_CARD_CANONICAL_USERNAME,
        accountSourceApi: accountSourceApi,
        reservationApi: reservationApi,
        identityIntentApi: identityIntentApi,
        routeIntentApi: routeIntentApi,
        walletChallengeApi: walletChallengeApi,
        entitlementApi: entitlementApi,
        readonlyBrowser: readonlyAdapter,
        normalizeWalletAddress: normalizeWalletAddress,
        clock: function () { return new Date('2026-08-11T12:02:00.000Z'); },
      }),
      fixture: freeze({
        username: USERNAME,
        cardId: CARD_ID,
        accountId: ACCOUNT_ID,
        recipientAddress: RECIPIENT,
      }),
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
