/* coin-card-executable-registry-current-source.js
 *
 * Composes a detached authenticated executable head, an authenticated source
 * binding, protected monotonic acceptance, and a validated Registry V2 record
 * into read-only route authority. It never authorizes execution.
 */

(function () {
  'use strict';

  var CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;
  var NONCE_RE = /^[A-Za-z0-9_-]{43}$/;
  var AUTHORITATIVE = new WeakSet();
  var UNAVAILABLE = new WeakSet();

  function unavailable(reason) {
    var result = Object.freeze({
      outcome: 'EXECUTABLE_REGISTRY_CURRENT_AUTHORITY_UNAVAILABLE', reason: reason,
      authenticated: false, current: false, rollbackProtected: false,
      contentValidated: false, contentHashEstablished: false,
      presentationEligible: false, executionEligible: false,
    });
    UNAVAILABLE.add(result);
    return result;
  }

  function invalid(reason) {
    return Object.freeze({
      outcome: 'EXECUTABLE_REGISTRY_CURRENT_AUTHORITY_INVALID', reason: reason,
      authenticated: false, current: false, rollbackProtected: false,
      contentValidated: false, contentHashEstablished: false,
      presentationEligible: false, executionEligible: false,
    });
  }

  function nonce() {
    var cryptoApi = window.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') return null;
    var bytes = new Uint8Array(32);
    try { cryptoApi.getRandomValues(bytes); } catch (error) { return null; }
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    var encoded;
    try { encoded = window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
    catch (error) { return null; }
    return NONCE_RE.test(encoded) ? encoded : null;
  }

  function sourceShapeValid(source, cardId, requestNonce) {
    return !!(
      source && typeof source === 'object' && Object.isFrozen(source)
      && source.authenticated === true && source.current === true
      && source.cardId === cardId && source.nonce === requestNonce
      && source.head && source.record
      && typeof source.registryId === 'string' && typeof source.environment === 'string'
      && typeof source.executableRegistryHeadHash === 'string'
      && typeof source.sourceMechanism === 'string' && source.sourceMechanism.length > 0
    );
  }

  async function loadCurrentRoute(cardId) {
    if (typeof cardId !== 'string' || !CARD_ID_RE.test(cardId)) return invalid('card-id-invalid');
    var currentAuthority = window.IX_COIN_CARD_EXECUTABLE_REGISTRY_CURRENT_AUTHORITY;
    var headVerifier = window.IX_COIN_CARD_EXECUTABLE_REGISTRY_HEAD_VERIFICATION;
    var recordVerifier = window.IX_COIN_CARD_EXECUTABLE_REGISTRY_RECORD_VERIFICATION;
    var monotonicStore = window.IX_COIN_CARD_EXECUTABLE_REGISTRY_MONOTONIC_STORE;
    if (!currentAuthority || typeof currentAuthority.loadAuthenticatedCurrent !== 'function'
      || typeof currentAuthority.isAuthenticatedCurrentSourceResult !== 'function'
      || !headVerifier || typeof headVerifier.authenticateHead !== 'function'
      || !recordVerifier || typeof recordVerifier.validateAndHashRecord !== 'function'
      || !monotonicStore || typeof monotonicStore.acceptAuthenticatedHead !== 'function'
      || typeof monotonicStore.isAcceptedResult !== 'function') {
      return unavailable('current-authority-dependency-unavailable');
    }
    var requestNonce = nonce();
    if (!requestNonce) return unavailable('freshness-nonce-unavailable');
    var source;
    try { source = await currentAuthority.loadAuthenticatedCurrent(cardId, requestNonce); }
    catch (error) { return unavailable('authenticated-current-source-unavailable'); }
    var sourceBranded = false;
    try { sourceBranded = currentAuthority.isAuthenticatedCurrentSourceResult(source) === true; }
    catch (error) { return invalid('authenticated-source-brand-invalid'); }
    if (!sourceBranded || !sourceShapeValid(source, cardId, requestNonce)) {
      return invalid('authenticated-source-binding-invalid');
    }

    var headResult = await headVerifier.authenticateHead(source.head);
    var headBranded = false;
    try { headBranded = headVerifier.isAuthenticatedHeadResult(headResult) === true; }
    catch (error) { return invalid('head-brand-invalid'); }
    if (!headBranded || !headResult || headResult.authenticated !== true) return invalid('head-authentication-failed');
    var head = headResult.head;
    if (source.executableRegistryHeadHash !== headResult.headHash
      || source.registryId !== head.registryId || source.environment !== head.environment
      || source.cardId !== head.cardId) return invalid('authenticated-source-head-conjunction-failed');

    var recordResult = await recordVerifier.validateAndHashRecord(source.record);
    var recordBranded = false;
    try { recordBranded = recordVerifier.isValidatedRecordResult(recordResult) === true; }
    catch (error) { return invalid('record-brand-invalid'); }
    if (!recordBranded || !recordResult || recordResult.contentValidated !== true) return invalid('record-validation-failed');
    var record = recordResult.record;
    if (recordResult.recordHash !== head.coinCardRegistryRecordHash
      || record.registryId !== head.registryId || record.environment !== head.environment
      || record.cardId !== head.cardId || record.recordId !== head.coinCardRegistryRecordId
      || record.revision !== head.coinCardRegistryRecordRevision) {
      return invalid('head-record-conjunction-failed');
    }

    var acceptance;
    try {
      acceptance = await monotonicStore.acceptAuthenticatedHead(Object.freeze({
        scope: Object.freeze([head.registryId, head.environment, head.cardId]),
        headSequence: head.headSequence,
        executableRegistryHeadHash: headResult.headHash,
      }));
    } catch (error) { return unavailable('monotonic-store-unavailable'); }
    var accepted = false;
    try { accepted = monotonicStore.isAcceptedResult(acceptance) === true; }
    catch (error) { return invalid('monotonic-store-brand-invalid'); }
    if (!accepted || !acceptance || acceptance.persisted !== true) return invalid('head-rollback-or-equivocation-detected');

    var result = Object.freeze({
      outcome: 'EXECUTABLE_REGISTRY_CURRENT_ROUTE_AUTHENTICATED',
      reason: null, authenticated: true, current: true, rollbackProtected: true,
      contentValidated: true, contentHashEstablished: true,
      presentationEligible: true, executionEligible: false,
      cardId: record.cardId, revision: record.revision, recordHash: recordResult.recordHash,
      record: record, head: head, headHash: headResult.headHash,
      headSequence: head.headSequence, sourceMechanism: source.sourceMechanism,
      fixtureTrustBoundary: null,
    });
    AUTHORITATIVE.add(result);
    return result;
  }

  function isAuthoritativeRouteResult(value) {
    try { return AUTHORITATIVE.has(value); } catch (error) { return false; }
  }
  function isAuthorityUnavailableResult(value) {
    try { return UNAVAILABLE.has(value); } catch (error) { return false; }
  }

  Object.defineProperty(window, 'IX_COIN_CARD_READONLY_ROUTE_AUTHORITY', {
    value: Object.freeze({
      loadCurrentRoute: loadCurrentRoute,
      isAuthoritativeRouteResult: isAuthoritativeRouteResult,
      isAuthorityUnavailableResult: isAuthorityUnavailableResult,
    }),
    writable: false, enumerable: true, configurable: false,
  });
})();
