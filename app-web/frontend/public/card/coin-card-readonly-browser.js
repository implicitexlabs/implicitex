/* coin-card-readonly-browser.js — read-only public Coin Card browser adapter
 *
 * This adapter connects the authenticated public-resolution pipeline to a
 * deliberately non-executable browser presentation. It consumes verified,
 * branded results; it does not fetch raw registry JSON, verify signatures,
 * select lifecycle evidence, establish route currentness, or authorize a
 * payment.
 *
 * Route authority is injected behind IX_COIN_CARD_READONLY_ROUTE_AUTHORITY.
 * A production implementation must authenticate an executable-registry
 * Current Head before returning a branded current-route result. The browser
 * adapter remains unchanged when that production source replaces the test
 * fixture source.
 */

(function () {
  'use strict';

  var CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;
  var SHA256_RE = /^sha256:[0-9a-f]{64}$/;
  var POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;

  var VIEW_STATES = Object.freeze({
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    REVOKED: 'REVOKED',
    TOMBSTONED: 'TOMBSTONED',
    UNKNOWN: 'UNKNOWN',
    INVALID: 'INVALID',
    AUTHORITY_UNAVAILABLE: 'AUTHORITY_UNAVAILABLE',
  });

  var VIEW_RESULTS = new WeakSet();

  function isReadOnlyViewResult(value) {
    try { return VIEW_RESULTS.has(value); } catch (error) { return false; }
  }

  function getResolutionApi(options) {
    if (options && options.resolutionApi) return options.resolutionApi;
    return window.IX_COIN_CARD_PUBLIC_RESOLUTION || null;
  }

  function getRouteAuthority(options) {
    if (options && options.routeAuthority) return options.routeAuthority;
    return window.IX_COIN_CARD_READONLY_ROUTE_AUTHORITY || null;
  }

  function safeString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  function makeView(state, resolution, extra) {
    var details = extra || {};
    var result = Object.freeze({
      viewState: state,
      canonicalUsername: resolution && safeString(resolution.canonicalUsername),
      canonicalUrl: resolution && safeString(resolution.canonicalUrl),
      redirectUrl: resolution && safeString(resolution.redirectUrl),
      cardId: resolution && safeString(resolution.cardId),
      lifecycleOutcome: resolution && safeString(resolution.lifecycleOutcome),
      publicResolutionOutcome: resolution && safeString(resolution.outcome),
      routeRecordHash: safeString(details.routeRecordHash),
      routeRevision: safeString(details.routeRevision),
      fixtureTrustBoundary: safeString(details.fixtureTrustBoundary),
      presentationEligible: state === VIEW_STATES.ACTIVE,
      executionEligible: false,
      paymentControlEnabled: false,
    });
    VIEW_RESULTS.add(result);
    return result;
  }

  function makeUnavailable(resolution) {
    return makeView(VIEW_STATES.AUTHORITY_UNAVAILABLE, resolution);
  }

  function makeInvalid(resolution) {
    return makeView(VIEW_STATES.INVALID, resolution);
  }

  function resolutionShapeValid(result) {
    return !!(
      result
      && typeof result === 'object'
      && Object.isFrozen(result)
      && result.executionEligible === false
      && result.paymentControlEnabled !== true
      && typeof result.outcome === 'string'
    );
  }

  function stateForTerminalResolution(outcome) {
    if (
      outcome === 'PUBLIC_RESOLUTION_HANDLE_EXPIRED'
      || outcome === 'PUBLIC_RESOLUTION_CARD_EXPIRED'
      || outcome === 'PUBLIC_RESOLUTION_CARD_SUPERSEDED'
    ) return VIEW_STATES.EXPIRED;
    if (outcome === 'PUBLIC_RESOLUTION_CARD_REVOKED') return VIEW_STATES.REVOKED;
    if (outcome === 'PUBLIC_RESOLUTION_HANDLE_TOMBSTONED') return VIEW_STATES.TOMBSTONED;
    if (outcome === 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND') return VIEW_STATES.UNKNOWN;
    if (outcome === 'PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE') {
      return VIEW_STATES.AUTHORITY_UNAVAILABLE;
    }
    return VIEW_STATES.INVALID;
  }

  function routeAuthorityAvailable(api) {
    return !!(
      api
      && typeof api.loadCurrentRoute === 'function'
      && typeof api.isAuthoritativeRouteResult === 'function'
      && typeof api.isAuthorityUnavailableResult === 'function'
    );
  }

  function validRouteResult(route, cardId, routeApi) {
    var branded = false;
    try { branded = routeApi.isAuthoritativeRouteResult(route) === true; } catch (error) { return false; }
    if (!branded || !route || typeof route !== 'object' || !Object.isFrozen(route)) return false;
    if (
      route.authenticated !== true
      || route.current !== true
      || route.rollbackProtected !== true
      || route.contentValidated !== true
      || route.contentHashEstablished !== true
      || route.presentationEligible !== true
      || route.executionEligible !== false
      || route.cardId !== cardId
      || !CARD_ID_RE.test(route.cardId)
      || !SHA256_RE.test(route.recordHash)
      || typeof route.revision !== 'string'
      || !POSITIVE_INTEGER_RE.test(route.revision)
      || !route.record
      || typeof route.record !== 'object'
      || !Object.isFrozen(route.record)
      || route.record.cardId !== cardId
      || route.record.revision !== route.revision
    ) return false;
    return true;
  }

  async function resolveReadOnlyCard(publicUrl, options) {
    var resolutionApi = getResolutionApi(options);
    if (
      !resolutionApi
      || typeof resolutionApi.resolvePublicCard !== 'function'
      || typeof resolutionApi.isActivePublicResolution !== 'function'
    ) return makeUnavailable(null);

    var resolution;
    try {
      resolution = await resolutionApi.resolvePublicCard(publicUrl);
    } catch (error) {
      return makeUnavailable(null);
    }
    if (!resolutionShapeValid(resolution)) return makeInvalid(null);

    if (resolution.outcome !== 'PUBLIC_RESOLUTION_ACTIVE') {
      return makeView(stateForTerminalResolution(resolution.outcome), resolution);
    }

    var isGenuinelyActive = false;
    try {
      isGenuinelyActive = resolutionApi.isActivePublicResolution(resolution) === true;
    } catch (error) {
      return makeUnavailable(resolution);
    }
    if (
      !isGenuinelyActive
      || resolution.presentationEligible !== true
      || resolution.executionEligible !== false
      || typeof resolution.cardId !== 'string'
      || !CARD_ID_RE.test(resolution.cardId)
    ) return makeInvalid(resolution);

    var routeApi = getRouteAuthority(options);
    if (!routeAuthorityAvailable(routeApi)) return makeUnavailable(resolution);

    var route;
    try {
      route = await routeApi.loadCurrentRoute(resolution.cardId);
    } catch (error) {
      return makeUnavailable(resolution);
    }
    var routeUnavailable = false;
    try { routeUnavailable = routeApi.isAuthorityUnavailableResult(route) === true; } catch (error) {
      return makeUnavailable(resolution);
    }
    if (routeUnavailable) return makeUnavailable(resolution);
    if (!validRouteResult(route, resolution.cardId, routeApi)) return makeInvalid(resolution);

    return makeView(VIEW_STATES.ACTIVE, resolution, {
      routeRecordHash: route.recordHash,
      routeRevision: route.revision,
      fixtureTrustBoundary: route.fixtureTrustBoundary,
    });
  }

  var COPY = Object.freeze({
    ACTIVE: Object.freeze({
      title: 'Active Coin Card',
      message: 'Identity, lifecycle, and current route are verified. Payment execution remains disabled.',
      status: 'Active',
    }),
    EXPIRED: Object.freeze({
      title: 'Coin Card expired',
      message: 'This Coin Card is no longer effective. No payment can be started.',
      status: 'Expired',
    }),
    REVOKED: Object.freeze({
      title: 'Coin Card revoked',
      message: 'This Coin Card has been revoked. No payment can be started.',
      status: 'Revoked',
    }),
    TOMBSTONED: Object.freeze({
      title: 'Coin Card unavailable',
      message: 'This username is permanently unavailable and does not resolve to a payable card.',
      status: 'Tombstoned',
    }),
    UNKNOWN: Object.freeze({
      title: 'Coin Card not found',
      message: 'No exact Coin Card username matches this request.',
      status: 'Unknown',
    }),
    INVALID: Object.freeze({
      title: 'Coin Card could not be verified',
      message: 'The published state failed verification. No payment can be started.',
      status: 'Invalid',
    }),
    AUTHORITY_UNAVAILABLE: Object.freeze({
      title: 'Coin Card authority unavailable',
      message: 'Current authoritative state cannot be established. No payment can be started.',
      status: 'Unavailable',
    }),
  });

  function setText(documentRef, id, value) {
    var element = documentRef.getElementById(id);
    if (element) element.textContent = value;
  }

  function abbreviateHash(value) {
    if (!value) return '';
    return value.slice(0, 14) + '\u2026' + value.slice(-8);
  }

  function renderReadOnlyCard(view, documentRef) {
    if (!isReadOnlyViewResult(view)) throw new TypeError('read-only-view-result-required');
    var doc = documentRef || window.document;
    if (!doc || typeof doc.getElementById !== 'function') {
      throw new TypeError('read-only-document-required');
    }

    var copy = COPY[view.viewState] || COPY.INVALID;
    var root = doc.getElementById('coinCardReadonly');
    if (root) {
      root.dataset.state = view.viewState;
      root.dataset.executionEligible = 'false';
      root.dataset.paymentControlEnabled = 'false';
    }
    if (doc.body) doc.body.dataset.coinCardState = view.viewState;

    setText(doc, 'coinCardState', copy.status);
    setText(doc, 'coinCardTitle', copy.title);
    setText(doc, 'coinCardMessage', copy.message);
    setText(
      doc,
      'coinCardCanonical',
      view.canonicalUsername ? '@' + view.canonicalUsername + ' \u00b7 ' + view.canonicalUrl : 'No canonical identity established'
    );
    setText(
      doc,
      'coinCardRoute',
      view.routeRecordHash
        ? 'Current route revision ' + view.routeRevision + ' \u00b7 ' + abbreviateHash(view.routeRecordHash)
        : 'No executable route is exposed'
    );
    setText(
      doc,
      'coinCardTrust',
      view.fixtureTrustBoundary
        ? view.fixtureTrustBoundary + ' \u00b7 production-shaped verification interfaces'
        : 'Authoritative read-only verification'
    );
    setText(doc, 'coinCardPayment', 'Payment execution unavailable in this read-only milestone');

    var controls = typeof doc.querySelectorAll === 'function'
      ? doc.querySelectorAll('[data-coin-card-payment-action]')
      : [];
    for (var i = 0; i < controls.length; i++) {
      controls[i].disabled = true;
      controls[i].hidden = true;
      controls[i].setAttribute('aria-disabled', 'true');
    }
    return view;
  }

  async function start(options) {
    var settings = options || {};
    var publicUrl = typeof settings.publicUrl === 'string'
      ? settings.publicUrl
      : window.location.href;
    var view = await resolveReadOnlyCard(publicUrl, settings);
    renderReadOnlyCard(view, settings.document || window.document);
    return view;
  }

  Object.defineProperty(window, 'IX_COIN_CARD_READONLY_BROWSER', {
    value: Object.freeze({
      VIEW_STATES: VIEW_STATES,
      resolveReadOnlyCard: resolveReadOnlyCard,
      renderReadOnlyCard: renderReadOnlyCard,
      isReadOnlyViewResult: isReadOnlyViewResult,
      start: start,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
