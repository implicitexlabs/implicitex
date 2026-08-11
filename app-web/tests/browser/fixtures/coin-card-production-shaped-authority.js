/* NON_PRODUCTION_TEST_FIXTURE: production-shaped published artifacts and
 * authenticated-source interfaces, never production authority or key custody. */
(function () {
  'use strict';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function installClock(iso) {
    var RealDate = window.Date;
    function FixedDate() {
      var args = Array.prototype.slice.call(arguments);
      if (!(this instanceof FixedDate)) return new RealDate(iso).toString();
      return new (Function.prototype.bind.apply(RealDate, [null].concat(args.length ? args : [iso])))();
    }
    FixedDate.prototype = RealDate.prototype;
    FixedDate.now = function () { return RealDate.parse(iso); };
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    window.Date = FixedDate;
  }

  function installTrust(publicKey) {
    var outcomes = freeze({
      TRUSTED_KEY_ACTIVE: 'TRUSTED_KEY_ACTIVE',
      TRUSTED_KEY_SOURCE_UNAVAILABLE: 'TRUSTED_KEY_SOURCE_UNAVAILABLE',
      TRUSTED_KEY_UNKNOWN: 'TRUSTED_KEY_UNKNOWN',
      TRUSTED_KEY_USAGE_DENIED: 'TRUSTED_KEY_USAGE_DENIED',
      TRUSTED_KEY_ENVIRONMENT_MISMATCH: 'TRUSTED_KEY_ENVIRONMENT_MISMATCH',
      TRUSTED_KEY_NOT_YET_ACTIVE: 'TRUSTED_KEY_NOT_YET_ACTIVE',
      TRUSTED_KEY_EXPIRED: 'TRUSTED_KEY_EXPIRED',
      TRUSTED_KEY_REVOKED: 'TRUSTED_KEY_REVOKED',
      TRUSTED_KEY_RECORD_INVALID: 'TRUSTED_KEY_RECORD_INVALID',
    });
    Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_KEY_RESOLUTION', {
      value: freeze({
        TRUSTED_KEY_OUTCOMES: outcomes,
        resolveTrustedKeyRecord: function (keyId, context) {
          var allowed = context && (
            context.usage === 'coin-card-registry-publication'
            || context.usage === 'coin-card-executable-registry-head'
          );
          if (!allowed || keyId !== publicKey.keyId) {
            return freeze({ outcome: outcomes.TRUSTED_KEY_USAGE_DENIED, publicKey: null });
          }
          return freeze({ outcome: outcomes.TRUSTED_KEY_ACTIVE, publicKey: clone(publicKey.jwk) });
        },
      }),
      writable: false, enumerable: true, configurable: false,
    });
  }

  function installPublishedSources(data) {
    Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE', {
      value: freeze({ loadCurrentHead: async function () { return clone(data.usernameHead); } }),
      writable: false, enumerable: true, configurable: false,
    });
    Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE', {
      value: freeze({
        loadSnapshotByHash: async function (hash) {
          if (hash !== data.usernameSnapshotHash) throw new Error('snapshot-hash-not-published');
          return clone(data.usernameSnapshot);
        },
      }),
      writable: false, enumerable: true, configurable: false,
    });
    window.__PRODUCTION_SHAPED_LIFECYCLE_BUNDLE = freeze(clone(data.lifecycleBundle));
  }

  function installAuthenticatedExecutableSource(data, scenario) {
    var sourceResults = new WeakSet();
    var acceptedResults = new WeakSet();
    var highest = null;
    Object.defineProperty(window, 'IX_COIN_CARD_EXECUTABLE_REGISTRY_CURRENT_AUTHORITY', {
      value: freeze({
        loadAuthenticatedCurrent: async function (cardId, nonce) {
          if (scenario === 'source-outage') throw new Error('non-production-source-outage');
          var head = clone(data.executableHead);
          var record = clone(data.executableRecord);
          if (scenario === 'head-wrong-algorithm') head.signature.algorithm = 'ECDSA_P384_SHA384';
          if (scenario === 'head-tampered-signature') {
            head.signature.value = (head.signature.value[0] === 'A' ? 'B' : 'A') + head.signature.value.slice(1);
          }
          if (scenario === 'record-hash-mismatch') record.recipientAddress = '0x7777777777777777777777777777777777777777';
          var result = freeze({
            authenticated: true, current: true,
            nonce: nonce, registryId: data.executableHead.registryId,
            environment: data.executableHead.environment, cardId: cardId,
            executableRegistryHeadHash: data.executableHeadHash,
            sourceMechanism: 'nonce-bound-test-authority-interface',
            head: head, record: record,
          });
          if (scenario !== 'unbranded-source') sourceResults.add(result);
          return result;
        },
        isAuthenticatedCurrentSourceResult: function (value) {
          try { return sourceResults.has(value); } catch (error) { return false; }
        },
      }),
      writable: false, enumerable: true, configurable: false,
    });
    Object.defineProperty(window, 'IX_COIN_CARD_EXECUTABLE_REGISTRY_MONOTONIC_STORE', {
      value: freeze({
        acceptAuthenticatedHead: async function (candidate) {
          var sequence = BigInt(candidate.headSequence);
          var permitted = highest === null
            || sequence > highest.sequence
            || (sequence === highest.sequence && candidate.executableRegistryHeadHash === highest.hash);
          if (!permitted) return freeze({ persisted: false });
          highest = { sequence: sequence, hash: candidate.executableRegistryHeadHash };
          var result = freeze({ persisted: true });
          acceptedResults.add(result);
          return result;
        },
        isAcceptedResult: function (value) {
          try { return acceptedResults.has(value); } catch (error) { return false; }
        },
      }),
      writable: false, enumerable: true, configurable: false,
    });
  }

  async function start() {
    var response = await window.fetch('/__coin_card_authority.json', { cache: 'no-store' });
    var data = await response.json();
    installClock(data.verificationTime);
    installTrust(data.publicKey);
    installPublishedSources(data);
    var query = new window.URL(window.location.href).searchParams;
    var scenario = query.get('scenario') || 'active';
    installAuthenticatedExecutableSource(data, scenario);
    var alias = query.get('alias') === '1';
    var publicUrl = alias
      ? 'https://coincard.click/antoinedennison'
      : 'https://antoinedennison.coincard.click/';
    var view = await window.IX_COIN_CARD_READONLY_BROWSER.start({ publicUrl: publicUrl });
    var route = await window.IX_COIN_CARD_READONLY_ROUTE_AUTHORITY.loadCurrentRoute(data.cardId);
    window.__COIN_CARD_AUTHORITY_TEST = freeze({ view: view, route: route });
    window.__COIN_CARD_AUTHORITY_READY = true;
  }

  start().catch(function (error) {
    window.__COIN_CARD_AUTHORITY_ERROR = String(error && error.stack || error);
    window.__COIN_CARD_AUTHORITY_READY = true;
  });
})();
