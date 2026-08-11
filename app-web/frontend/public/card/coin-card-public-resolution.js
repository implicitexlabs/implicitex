/* coin-card-public-resolution.js — public Coin Card resolution orchestration
 *
 * The public URL identifies one normalized username. It is not payment
 * authority. The established V1 `handle` wire field means that username; it is
 * not an alias or a second identity. This module accepts a username-to-card
 * mapping only from the dedicated registry
 * authority, then delegates lifecycle authentication, selection, resolution,
 * and presentation promotion to the existing authorities.
 *
 * This module does not verify signatures, interpret raw lifecycle records,
 * establish recipient/route facts, or authorize execution.
 */

(function () {
  'use strict';

  var PUBLIC_DOMAIN = 'coincard.click';
  var ACCOUNT_ID_RE = /^acct_[0-9A-HJKMNP-TV-Z]{26}$/;
  var CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;

  var HANDLE_STATUSES = Object.freeze({
    AVAILABLE: 'AVAILABLE',
    ACTIVE: 'ACTIVE',
    GRACE: 'GRACE',
    EXPIRED: 'EXPIRED',
    TOMBSTONED: 'TOMBSTONED',
    RESERVED: 'RESERVED',
    SYSTEM: 'SYSTEM',
  });

  var OUTCOMES = Object.freeze({
    PUBLIC_RESOLUTION_ACTIVE: 'PUBLIC_RESOLUTION_ACTIVE',

    PUBLIC_RESOLUTION_HANDLE_NOT_FOUND: 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND',
    PUBLIC_RESOLUTION_HANDLE_TOMBSTONED: 'PUBLIC_RESOLUTION_HANDLE_TOMBSTONED',
    PUBLIC_RESOLUTION_HANDLE_EXPIRED: 'PUBLIC_RESOLUTION_HANDLE_EXPIRED',
    PUBLIC_RESOLUTION_HANDLE_UNAVAILABLE: 'PUBLIC_RESOLUTION_HANDLE_UNAVAILABLE',

    PUBLIC_RESOLUTION_CARD_SUSPENDED: 'PUBLIC_RESOLUTION_CARD_SUSPENDED',
    PUBLIC_RESOLUTION_CARD_REVOKED: 'PUBLIC_RESOLUTION_CARD_REVOKED',
    PUBLIC_RESOLUTION_CARD_SUPERSEDED: 'PUBLIC_RESOLUTION_CARD_SUPERSEDED',
    PUBLIC_RESOLUTION_CARD_EXPIRED: 'PUBLIC_RESOLUTION_CARD_EXPIRED',

    PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE: 'PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE',
    PUBLIC_RESOLUTION_VERIFICATION_FAILED: 'PUBLIC_RESOLUTION_VERIFICATION_FAILED',
    PUBLIC_RESOLUTION_ROUTE_UNSUPPORTED: 'PUBLIC_RESOLUTION_ROUTE_UNSUPPORTED',
  });

  var ACTIVE_RESULTS = new WeakSet();

  function isActivePublicResolution(value) {
    try {
      return ACTIVE_RESULTS.has(value);
    } catch (error) {
      return false;
    }
  }

  function getUrlConstructor() {
    if (window && typeof window.URL === 'function') return window.URL;
    return typeof URL === 'function' ? URL : null;
  }

  function rawAuthorityFromUrl(value) {
    var match = value.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/);
    return match ? match[1] : null;
  }

  function getUsernameApi() {
    return window.IX_COIN_CARD_CANONICAL_USERNAME || null;
  }

  function makeCanonicalization(ok, username, canonicalUrl, redirectUrl, error) {
    return Object.freeze({
      ok: ok,
      username: username,
      canonicalUrl: canonicalUrl,
      redirectUrl: redirectUrl,
      error: error,
    });
  }

  /* Query strings and fragments are intentionally excluded from the returned
   * canonical URL and never participate in username or card identity. */
  function canonicalizePublicUrl(value) {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
      return makeCanonicalization(false, null, null, null, 'PUBLIC_URL_INVALID');
    }

    var Url = getUrlConstructor();
    if (!Url) {
      return makeCanonicalization(false, null, null, null, 'PUBLIC_URL_AUTHORITY_UNAVAILABLE');
    }

    var parsed;
    try {
      parsed = new Url(value);
    } catch (error) {
      return makeCanonicalization(false, null, null, null, 'PUBLIC_URL_INVALID');
    }

    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      || parsed.username
      || parsed.password
      || parsed.port
    ) {
      return makeCanonicalization(false, null, null, null, 'PUBLIC_ROUTE_UNSUPPORTED');
    }

    var usernameApi = getUsernameApi();
    if (!usernameApi || typeof usernameApi.canonicalizePublicRouteUsername !== 'function') {
      return makeCanonicalization(false, null, null, null, 'PUBLIC_URL_AUTHORITY_UNAVAILABLE');
    }

    var hostname = parsed.hostname.toLowerCase();
    var username = null;
    var subdomainSuffix = '.' + PUBLIC_DOMAIN;
    var isBaseHost = hostname === PUBLIC_DOMAIN || hostname === 'www.' + PUBLIC_DOMAIN;

    if (isBaseHost) {
      var pathMatch = parsed.pathname.match(/^\/([^/]+)\/?$/);
      if (!pathMatch) {
        return makeCanonicalization(false, null, null, null, 'PUBLIC_HANDLE_INVALID');
      }
      username = usernameApi.canonicalizePublicRouteUsername(pathMatch[1]);
      if (!username) {
        return makeCanonicalization(false, null, null, null, 'PUBLIC_HANDLE_INVALID');
      }
    } else if (hostname.endsWith(subdomainSuffix)) {
      var label = hostname.slice(0, -subdomainSuffix.length);
      if (!label || label.indexOf('.') !== -1) {
        return makeCanonicalization(false, null, null, null, 'PUBLIC_ROUTE_UNSUPPORTED');
      }
      username = usernameApi.canonicalizePublicRouteUsername(label);
      if (!username) {
        return makeCanonicalization(false, null, null, null, 'PUBLIC_HANDLE_INVALID');
      }
      if (parsed.pathname !== '/' && parsed.pathname !== '/index.html') {
        return makeCanonicalization(false, null, null, null, 'PUBLIC_ROUTE_UNSUPPORTED');
      }
    } else {
      return makeCanonicalization(false, null, null, null, 'PUBLIC_ROUTE_UNSUPPORTED');
    }

    var canonicalUrl = 'https://' + username + '.' + PUBLIC_DOMAIN + '/';
    var rawAuthority = rawAuthorityFromUrl(value);
    var alreadyCanonical = (
      parsed.protocol === 'https:'
      && rawAuthority === username + '.' + PUBLIC_DOMAIN
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
    );

    return makeCanonicalization(
      true,
      username,
      canonicalUrl,
      alreadyCanonical ? null : canonicalUrl,
      null
    );
  }

  function getAuthorities() {
    return {
      handleRegistry: window.IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY || null,
      bundleVerification: window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION || null,
      selection: window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION || null,
      resolution: window.IX_COIN_CARD_LIFECYCLE_RESOLUTION || null,
      presentation: window.IX_COIN_CARD_LIFECYCLE_PRESENTATION || null,
      bundle: window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE || null,
    };
  }

  function authoritiesAvailable(authorities) {
    return !!(
      authorities.handleRegistry
      && typeof authorities.handleRegistry.lookupHandle === 'function'
      && typeof authorities.handleRegistry.isAuthoritativeHandleResult === 'function'
      && typeof authorities.handleRegistry.isHandleNotFoundResult === 'function'
      && typeof authorities.handleRegistry.isAuthorityUnavailableResult === 'function'
      && authorities.bundleVerification
      && typeof authorities.bundleVerification.authenticateLifecycleRegistryBundle === 'function'
      && typeof authorities.bundleVerification.isAuthenticatedBundleResult === 'function'
      && authorities.selection
      && typeof authorities.selection.selectLifecycleEvidence === 'function'
      && authorities.resolution
      && typeof authorities.resolution.resolveLifecycle === 'function'
      && typeof authorities.resolution.isResolvedLifecycleResult === 'function'
      && authorities.presentation
      && typeof authorities.presentation.promotePresentation === 'function'
      && typeof authorities.presentation.isPromotedPresentationResult === 'function'
      && authorities.bundle
    );
  }

  function makeResult(outcome, canonical, details) {
    var extra = details || {};
    var result = Object.freeze({
      outcome: outcome,
      canonicalUsername: canonical && canonical.username || null,
      canonicalUrl: canonical && canonical.canonicalUrl || null,
      redirectUrl: canonical && canonical.redirectUrl || null,
      handleStatus: extra.handleStatus || null,
      cardId: extra.cardId || null,
      lifecycleOutcome: extra.lifecycleOutcome || null,
      presentationOutcome: extra.presentationOutcome || null,
      lifecycleResolution: extra.lifecycleResolution || null,
      promotedPresentation: extra.promotedPresentation || null,
      presentationEligible: extra.presentationEligible === true,
      executionEligible: false,
    });
    if (
      outcome === OUTCOMES.PUBLIC_RESOLUTION_ACTIVE
      && result.presentationEligible === true
      && result.executionEligible === false
    ) {
      ACTIVE_RESULTS.add(result);
    }
    return result;
  }

  function resultForCanonicalizationFailure(canonical) {
    var outcome = canonical.error === 'PUBLIC_ROUTE_UNSUPPORTED'
      ? OUTCOMES.PUBLIC_RESOLUTION_ROUTE_UNSUPPORTED
      : canonical.error === 'PUBLIC_URL_AUTHORITY_UNAVAILABLE'
        ? OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE
        : OUTCOMES.PUBLIC_RESOLUTION_HANDLE_NOT_FOUND;
    return makeResult(outcome, canonical);
  }

  function validateAuthoritativeHandleResult(result, canonical) {
    if (!result || typeof result !== 'object' || !Object.isFrozen(result)) return false;
    var hasValidCardId = (
      result.cardId == null
      || (typeof result.cardId === 'string' && CARD_ID_RE.test(result.cardId))
    );
    var hasValidAccountId = (
      result.accountId == null
      || (typeof result.accountId === 'string' && ACCOUNT_ID_RE.test(result.accountId))
    );
    return (
      result.username === canonical.username
      && Object.prototype.hasOwnProperty.call(HANDLE_STATUSES, result.status)
      && result.authenticated === true
      && result.current === true
      && result.currentHeadAuthenticated === true
      && result.rollbackProtected === true
      && result.executionEligible === false
      && hasValidCardId
      && hasValidAccountId
      && (
        result.status !== HANDLE_STATUSES.ACTIVE
        || (
          typeof result.accountId === 'string'
          && ACCOUNT_ID_RE.test(result.accountId)
          && typeof result.cardId === 'string'
          && CARD_ID_RE.test(result.cardId)
        )
      )
    );
  }

  function handleTerminalResult(handleResult, canonical) {
    var details = {
      handleStatus: handleResult.status,
      cardId: typeof handleResult.cardId === 'string' ? handleResult.cardId : null,
    };
    if (handleResult.status === HANDLE_STATUSES.TOMBSTONED) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_HANDLE_TOMBSTONED, canonical, details);
    }
    if (handleResult.status === HANDLE_STATUSES.GRACE || handleResult.status === HANDLE_STATUSES.EXPIRED) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_HANDLE_EXPIRED, canonical, details);
    }
    if (handleResult.status === HANDLE_STATUSES.AVAILABLE) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_HANDLE_NOT_FOUND, canonical, details);
    }
    return makeResult(OUTCOMES.PUBLIC_RESOLUTION_HANDLE_UNAVAILABLE, canonical, details);
  }

  function outcomeForLifecycle(lifecycleOutcome) {
    if (lifecycleOutcome === 'LIFECYCLE_CARD_SUSPENDED') {
      return OUTCOMES.PUBLIC_RESOLUTION_CARD_SUSPENDED;
    }
    if (
      lifecycleOutcome === 'LIFECYCLE_CARD_REVOKED'
      || lifecycleOutcome === 'LIFECYCLE_MANIFEST_REVOKED'
    ) {
      return OUTCOMES.PUBLIC_RESOLUTION_CARD_REVOKED;
    }
    if (lifecycleOutcome === 'LIFECYCLE_MANIFEST_SUPERSEDED') {
      return OUTCOMES.PUBLIC_RESOLUTION_CARD_SUPERSEDED;
    }
    if (lifecycleOutcome === 'LIFECYCLE_EXPIRED') {
      return OUTCOMES.PUBLIC_RESOLUTION_CARD_EXPIRED;
    }
    return OUTCOMES.PUBLIC_RESOLUTION_VERIFICATION_FAILED;
  }

  async function resolvePublicCard(publicUrl) {
    var canonical = canonicalizePublicUrl(publicUrl);
    if (!canonical.ok) return resultForCanonicalizationFailure(canonical);

    var authorities = getAuthorities();
    if (!authoritiesAvailable(authorities)) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical);
    }

    var handleResult;
    try {
      handleResult = await authorities.handleRegistry.lookupHandle(canonical.username);
    } catch (error) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical);
    }

    var isNotFound = false;
    var isAuthoritative = false;
    var isAuthorityUnavailable = false;
    try {
      isNotFound = authorities.handleRegistry.isHandleNotFoundResult(handleResult) === true;
      isAuthoritative = authorities.handleRegistry.isAuthoritativeHandleResult(handleResult) === true;
      isAuthorityUnavailable = authorities.handleRegistry
        .isAuthorityUnavailableResult(handleResult) === true;
    } catch (error) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical);
    }

    if (isAuthorityUnavailable) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical);
    }
    if (isNotFound) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_HANDLE_NOT_FOUND, canonical);
    }
    if (!isAuthoritative || !validateAuthoritativeHandleResult(handleResult, canonical)) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_VERIFICATION_FAILED, canonical);
    }
    if (handleResult.status !== HANDLE_STATUSES.ACTIVE) {
      return handleTerminalResult(handleResult, canonical);
    }

    var bundleProof;
    try {
      bundleProof = await authorities.bundleVerification
        .authenticateLifecycleRegistryBundle(authorities.bundle);
    } catch (error) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical, {
        handleStatus: handleResult.status,
        cardId: handleResult.cardId,
      });
    }

    var authenticated;
    try {
      authenticated = authorities.bundleVerification.isAuthenticatedBundleResult(bundleProof) === true;
    } catch (error) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical, {
        handleStatus: handleResult.status,
        cardId: handleResult.cardId,
      });
    }
    if (!authenticated) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_VERIFICATION_FAILED, canonical, {
        handleStatus: handleResult.status,
        cardId: handleResult.cardId,
      });
    }

    var selected;
    var resolved;
    var promoted;
    try {
      selected = authorities.selection.selectLifecycleEvidence(bundleProof, {
        cardId: handleResult.cardId,
      });
      resolved = authorities.resolution.resolveLifecycle(selected);
      if (authorities.resolution.isResolvedLifecycleResult(resolved) !== true) {
        return makeResult(OUTCOMES.PUBLIC_RESOLUTION_VERIFICATION_FAILED, canonical, {
          handleStatus: handleResult.status,
          cardId: handleResult.cardId,
          lifecycleOutcome: resolved && resolved.outcome || null,
        });
      }
      promoted = authorities.presentation.promotePresentation(resolved);
    } catch (error) {
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical, {
        handleStatus: handleResult.status,
        cardId: handleResult.cardId,
      });
    }

    var details = {
      handleStatus: handleResult.status,
      cardId: handleResult.cardId,
      lifecycleOutcome: resolved.outcome,
      presentationOutcome: promoted && promoted.outcome || null,
      lifecycleResolution: resolved,
      promotedPresentation: promoted || null,
      presentationEligible: false,
    };

    if (resolved.outcome === 'LIFECYCLE_ACTIVE') {
      var genuinelyPromoted = false;
      try {
        genuinelyPromoted = (
          authorities.presentation.isPromotedPresentationResult(promoted) === true
          && promoted.outcome === 'PRESENTATION_PROMOTED'
          && promoted.presentationEligible === true
          && promoted.executionEligible === false
        );
      } catch (error) {
        return makeResult(OUTCOMES.PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE, canonical, details);
      }
      if (!genuinelyPromoted) {
        return makeResult(OUTCOMES.PUBLIC_RESOLUTION_VERIFICATION_FAILED, canonical, details);
      }
      details.presentationEligible = true;
      return makeResult(OUTCOMES.PUBLIC_RESOLUTION_ACTIVE, canonical, details);
    }

    return makeResult(outcomeForLifecycle(resolved.outcome), canonical, details);
  }

  Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_RESOLUTION', {
    value: Object.freeze({
      PUBLIC_DOMAIN: PUBLIC_DOMAIN,
      HANDLE_STATUSES: HANDLE_STATUSES,
      OUTCOMES: OUTCOMES,
      canonicalizePublicUrl: canonicalizePublicUrl,
      resolvePublicCard: resolvePublicCard,
      isActivePublicResolution: isActivePublicResolution,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
