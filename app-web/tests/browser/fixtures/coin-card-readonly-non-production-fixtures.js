/* NON-PRODUCTION TEST FIXTURE.
 *
 * The private key in this file is deliberately test-only, is not trusted by
 * any deployable Coin Card key source, and must never be promoted into public
 * artifacts. The fixtures use the production wire contracts so replacing the
 * sources—not the browser adapter or renderer—is the production migration.
 */

(function () {
  'use strict';

  var FIXTURE_BOUNDARY = 'NON_PRODUCTION_TEST_FIXTURE';
  var FIXED_NOW = '2026-08-11T12:00:00.000Z';
  var KEY_ID = 'coin-card-readonly-non-production-test-key';
  var ACCOUNT_ID = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8';
  var CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';
  var USERNAME = 'antoinedennison';
  var HEAD_URL = 'https://coincard.click/.well-known/coin-card-public-username-registry-head.v1.json';
  var SNAPSHOT_PREFIX = 'https://coincard.click/.well-known/coin-card-public-username-registry-snapshots/sha256/';
  var PUBLIC_JWK = {
    key_ops: ['verify'],
    ext: true,
    kty: 'EC',
    x: '2DrsX9sKdp7YYrKhrC44Eo7RQ6xVr065yZSFKeUVc38',
    y: 'ywcMQfr-xR1ykoGT6WB5hzWCktW8FTEID1PzjM9h4RU',
    crv: 'P-256',
  };
  var PRIVATE_JWK = {
    key_ops: ['sign'],
    ext: true,
    kty: 'EC',
    x: '2DrsX9sKdp7YYrKhrC44Eo7RQ6xVr065yZSFKeUVc38',
    y: 'ywcMQfr-xR1ykoGT6WB5hzWCktW8FTEID1PzjM9h4RU',
    crv: 'P-256',
    d: 'QsZb-tTs2adalg_DUQJSSOYpoghb6Vv7ufa9NTk2ZfU',
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function toBase64Url(value) {
    var bytes = new Uint8Array(value);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromBase64Url(value) {
    var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var binary = window.atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function concatDomainPayload(domain, canonical) {
    var encoder = new window.TextEncoder();
    var domainBytes = encoder.encode(domain);
    var payloadBytes = encoder.encode(canonical);
    var combined = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
    combined.set(domainBytes, 0);
    combined[domainBytes.length] = 0;
    combined.set(payloadBytes, domainBytes.length + 1);
    return combined;
  }

  function signaturePayload(value) {
    var payload = clone(value);
    delete payload.signature.value;
    return payload;
  }

  function canonicalize(value) {
    return window.IX_COIN_CARD_CANONICAL_JSON_V1.canonicalizeJson(value);
  }

  async function importPrivateKey() {
    return window.crypto.subtle.importKey(
      'jwk',
      PRIVATE_JWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  }

  async function signArtifact(privateKey, domain, artifact) {
    var canonical = canonicalize(signaturePayload(artifact));
    var signature = await window.crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      privateKey,
      concatDomainPayload(domain, canonical)
    );
    artifact.signature.value = toBase64Url(signature);
    return artifact;
  }

  async function domainHash(domain, value) {
    var digest = await window.crypto.subtle.digest(
      'SHA-256',
      concatDomainPayload(domain, canonicalize(value))
    );
    var bytes = new Uint8Array(digest);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return 'sha256:' + hex;
  }

  function flipSignature(value) {
    return (value[0] === 'A' ? 'B' : 'A') + value.slice(1);
  }

  function installFixedClock() {
    var RealDate = window.Date;
    function FixedDate() {
      var args = Array.prototype.slice.call(arguments);
      if (!(this instanceof FixedDate)) return new RealDate(FIXED_NOW).toString();
      return new (Function.prototype.bind.apply(
        RealDate,
        [null].concat(args.length ? args : [FIXED_NOW])
      ))();
    }
    FixedDate.prototype = RealDate.prototype;
    FixedDate.now = function () { return RealDate.parse(FIXED_NOW); };
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    window.Date = FixedDate;
  }

  function installTestTrustSource() {
    var record = deepFreeze({
      schemaVersion: 'coin-card-trusted-key-record.v1',
      keyId: KEY_ID,
      algorithm: 'ECDSA_P256_SHA256',
      publicKey: clone(PUBLIC_JWK),
      issuerId: 'implicitex-registry',
      usage: ['coin-card-registry-publication'],
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      revokedAt: null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId: null,
      environment: 'production',
    });
    var source = Object.create(null);
    source[KEY_ID] = record;
    Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', {
      value: deepFreeze(source),
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  function makeSnapshot(status) {
    return {
      registrySchemaVersion: 'coin-card-public-username-registry.v2',
      registryId: 'implicitex-public-usernames',
      environment: 'production',
      registryRevision: 7,
      issuedAt: '2026-08-11T11:50:00.000Z',
      expiresAt: '2026-08-12T11:49:00.000Z',
      authorityId: 'implicitex-registry',
      entries: [{
        username: USERNAME,
        accountId: ACCOUNT_ID,
        cardId: CARD_ID,
        status: status,
      }],
      signature: {
        mode: 'signed-p256-v1',
        algorithm: 'ECDSA_P256_SHA256',
        signatureEncoding: 'ieee-p1363',
        signatureLengthBytes: 64,
        signatureValueEncoding: 'base64url-unpadded',
        keyId: KEY_ID,
        keyUsage: 'coin-card-registry-publication',
        authorityId: 'implicitex-registry',
        signedAt: '2026-08-11T11:50:00.000Z',
        value: '',
      },
    };
  }

  function makeHead(snapshotHash, revision) {
    return {
      headSchemaVersion: 'coin-card-public-username-registry-head.v1',
      registryId: 'implicitex-public-usernames',
      environment: 'production',
      currentRevision: revision,
      currentSnapshotHash: snapshotHash,
      issuedAt: '2026-08-11T11:58:00.000Z',
      expiresAt: '2026-08-11T12:10:00.000Z',
      authorityId: 'implicitex-registry',
      signature: {
        mode: 'signed-p256-v1',
        algorithm: 'ECDSA_P256_SHA256',
        signatureEncoding: 'ieee-p1363',
        signatureLengthBytes: 64,
        signatureValueEncoding: 'base64url-unpadded',
        keyId: KEY_ID,
        keyUsage: 'coin-card-registry-publication',
        authorityId: 'implicitex-registry',
        signedAt: '2026-08-11T11:58:00.000Z',
        value: '',
      },
    };
  }

  function makeLifecycleRecord(scenario) {
    return {
      registryId: 'implicitex-production',
      registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
      environment: 'production',
      registryVersion: 1,
      recordId: 'non-production-fixture-r1-antoinedennison',
      publishedAt: '2026-08-11T11:55:00.000Z',
      cardId: CARD_ID,
      manifestId: 'non-production-fixture-manifest-antoinedennison-v1',
      revision: 1,
      previousManifestId: null,
      cardStatus: scenario === 'revoked' ? 'CARD_REVOKED' : 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
      effectiveFrom: '2026-08-11T11:00:00.000Z',
      effectiveUntil: scenario === 'expired' ? '2026-08-11T11:59:00.000Z' : null,
      supersededByManifestId: null,
      reasonCode: scenario === 'revoked' ? 'NON_PRODUCTION_TEST_REVOCATION' : null,
      authorityId: 'implicitex-registry',
      administrationEvidenceHash: null,
      signature: {
        mode: 'signed-p256-v1',
        algorithm: 'ECDSA_P256_SHA256',
        signatureEncoding: 'ieee-p1363',
        signatureLengthBytes: 64,
        signatureValueEncoding: 'base64url-unpadded',
        keyId: KEY_ID,
        authorityId: 'implicitex-registry',
        signedAt: '2026-08-11T11:55:00.000Z',
        value: '',
      },
    };
  }

  function makeExecutableRouteRecord() {
    return {
      registrySchemaVersion: 'coin-card-registry-record.v2',
      registryId: 'implicitex-production',
      environment: 'production',
      recordId: 'non-production-fixture-route-antoinedennison-r1',
      revision: '1',
      cardId: CARD_ID,
      recipientAddress: '0x2489587c9da6eab970a5479ba70273ba37961221',
      chainId: '137',
      tokenContractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
      executionContractAddress: '0x1111111111111111111111111111111111111111',
      executionContractInterfaceId: 'implicitex-coin-card-execution-v1',
      executionInterfaceDescriptorHash: 'sha256:' + 'a'.repeat(64),
      feePolicy: {
        policyVersion: 'coin-card-fee-policy-v1',
        feeBasisPoints: '100',
        feeCapAtomic: null,
        minimumTransferAtomic: '1000000',
        maximumTransferAtomic: '1000000000',
        transferPrecisionAtomic: '1000000',
        roundingRule: 'FLOOR_BPS_THEN_CAP',
        feeRecipientAddress: '0xa7ce4232811021d2dd01f4f0f264df2427ab3919',
      },
    };
  }

  function makeRouteHead(recordHash) {
    return {
      fixtureSchemaVersion: 'coin-card-readonly-route-head.non-production-test.v1',
      fixtureTrustBoundary: FIXTURE_BOUNDARY,
      wireEnvironment: 'production',
      cardId: CARD_ID,
      revision: '1',
      recordHash: recordHash,
      issuedAt: '2026-08-11T11:58:00.000Z',
      expiresAt: '2026-08-11T12:10:00.000Z',
      signature: {
        algorithm: 'ECDSA_P256_SHA256',
        keyId: KEY_ID,
        value: '',
      },
    };
  }

  function makeJsonResponse(url, value, immutable) {
    return {
      ok: true,
      status: 200,
      redirected: false,
      url: url,
      type: 'basic',
      headers: {
        get: function (name) {
          var lower = String(name).toLowerCase();
          if (lower === 'content-type') return 'application/json; charset=utf-8';
          if (lower === 'cache-control') {
            return immutable ? 'public, max-age=31536000, immutable' : 'no-store';
          }
          return null;
        },
      },
      json: async function () { return clone(value); },
    };
  }

  function installFixtureFetch(scenario, head, snapshot) {
    window.fetch = async function (url) {
      if (scenario === 'authority-unavailable') throw new TypeError('non-production simulated outage');
      if (url === HEAD_URL) return makeJsonResponse(url, head, false);
      if (typeof url === 'string' && url.indexOf(SNAPSHOT_PREFIX) === 0) {
        return makeJsonResponse(url, snapshot, true);
      }
      throw new TypeError('non-production fixture URL not permitted');
    };
  }

  function sameFields(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var names = Object.keys(value).sort();
    var expected = fields.slice().sort();
    if (names.length !== expected.length) return false;
    for (var i = 0; i < names.length; i++) if (names[i] !== expected[i]) return false;
    return true;
  }

  async function verifyRouteHead(head, publicKey) {
    if (!sameFields(head, [
      'cardId', 'expiresAt', 'fixtureSchemaVersion', 'fixtureTrustBoundary',
      'issuedAt', 'recordHash', 'revision', 'signature', 'wireEnvironment',
    ])) return false;
    if (!sameFields(head.signature, ['algorithm', 'keyId', 'value'])) return false;
    if (
      head.fixtureSchemaVersion !== 'coin-card-readonly-route-head.non-production-test.v1'
      || head.fixtureTrustBoundary !== FIXTURE_BOUNDARY
      || head.wireEnvironment !== 'production'
      || head.cardId !== CARD_ID
      || head.revision !== '1'
      || !/^sha256:[0-9a-f]{64}$/.test(head.recordHash)
      || head.signature.algorithm !== 'ECDSA_P256_SHA256'
      || head.signature.keyId !== KEY_ID
      || !/^[A-Za-z0-9_-]{86}$/.test(head.signature.value)
      || window.Date.parse(head.issuedAt) > window.Date.now() + 5 * 60 * 1000
      || window.Date.now() >= window.Date.parse(head.expiresAt)
      || window.Date.parse(head.expiresAt) - window.Date.parse(head.issuedAt) > 15 * 60 * 1000
    ) return false;
    var canonical = canonicalize(signaturePayload(head));
    return window.crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      fromBase64Url(head.signature.value),
      concatDomainPayload('ImplicitEx.CoinCard.ReadOnlyRouteHead.NonProductionTest.v1', canonical)
    );
  }

  async function installRouteAuthority(scenario, privateKey) {
    var authoritative = new WeakSet();
    var unavailable = new WeakSet();
    var record = makeExecutableRouteRecord();
    var validated = await window.IX_COIN_CARD_EXECUTABLE_REGISTRY_RECORD_VERIFICATION
      .validateAndHashRecord(record);
    if (!window.IX_COIN_CARD_EXECUTABLE_REGISTRY_RECORD_VERIFICATION.isValidatedRecordResult(validated)) {
      throw new Error('non-production-route-record-validation-failed');
    }
    var head = makeRouteHead(validated.recordHash);
    if (scenario === 'route-current-revision-mismatch') head.revision = '2';
    if (scenario === 'route-current-hash-mismatch') head.recordHash = 'sha256:' + '0'.repeat(64);
    await signArtifact(
      privateKey,
      'ImplicitEx.CoinCard.ReadOnlyRouteHead.NonProductionTest.v1',
      head
    );
    if (scenario === 'route-signature-failure') {
      head.signature.value = flipSignature(head.signature.value);
    }
    var publicKey = await window.crypto.subtle.importKey(
      'jwk',
      PUBLIC_JWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    var api = Object.freeze({
      OUTCOMES: Object.freeze({
        CURRENT: 'COIN_CARD_ROUTE_AUTHORITY_CURRENT',
        UNAVAILABLE: 'COIN_CARD_ROUTE_AUTHORITY_UNAVAILABLE',
        INVALID: 'COIN_CARD_ROUTE_AUTHORITY_INVALID',
      }),
      async loadCurrentRoute(cardId) {
        if (scenario === 'route-authority-unavailable') {
          var unavailableResult = Object.freeze({
            outcome: 'COIN_CARD_ROUTE_AUTHORITY_UNAVAILABLE',
            authenticated: false,
            current: false,
            rollbackProtected: false,
            contentValidated: false,
            contentHashEstablished: false,
            presentationEligible: false,
            executionEligible: false,
          });
          unavailable.add(unavailableResult);
          return unavailableResult;
        }
        var signatureValid = await verifyRouteHead(head, publicKey);
        if (
          cardId !== CARD_ID
          || signatureValid !== true
          || validated.record.cardId !== head.cardId
          || validated.record.revision !== head.revision
          || validated.recordHash !== head.recordHash
        ) {
          return Object.freeze({
            outcome: 'COIN_CARD_ROUTE_AUTHORITY_INVALID',
            authenticated: false,
            current: false,
            rollbackProtected: false,
            contentValidated: false,
            contentHashEstablished: false,
            presentationEligible: false,
            executionEligible: false,
          });
        }
        var result = Object.freeze({
          outcome: 'COIN_CARD_ROUTE_AUTHORITY_CURRENT',
          fixtureTrustBoundary: FIXTURE_BOUNDARY,
          wireEnvironment: 'production',
          cardId: CARD_ID,
          revision: validated.record.revision,
          recordHash: validated.recordHash,
          record: validated.record,
          authenticated: true,
          current: true,
          rollbackProtected: true,
          contentValidated: true,
          contentHashEstablished: true,
          presentationEligible: true,
          executionEligible: false,
        });
        authoritative.add(result);
        return result;
      },
      isAuthoritativeRouteResult(value) {
        try { return authoritative.has(value); } catch (error) { return false; }
      },
      isAuthorityUnavailableResult(value) {
        try { return unavailable.has(value); } catch (error) { return false; }
      },
    });
    Object.defineProperty(window, 'IX_COIN_CARD_READONLY_ROUTE_AUTHORITY', {
      value: api,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  function publicUrlForScenario(scenario) {
    if (scenario === 'active-alias') return 'https://coincard.click/antoinedennison';
    if (scenario === 'exact-match-legacy-handle') return 'https://coincard.click/antoine';
    if (scenario === 'unknown') return 'https://unknownperson.coincard.click/';
    return 'https://antoinedennison.coincard.click/';
  }

  async function buildAndStart() {
    installFixedClock();
    installTestTrustSource();
    var scenario = new window.URL(window.location.href).searchParams.get('scenario') || 'active';
    var privateKey = await importPrivateKey();

    var snapshotStatus = scenario === 'tombstoned' ? 'TOMBSTONED' : 'ACTIVE';
    var snapshot = makeSnapshot(snapshotStatus);
    if (scenario === 'malformed-snapshot') snapshot.unexpectedField = true;
    await signArtifact(privateKey, 'ImplicitEx.CoinCard.PublicUsernameRegistry.v2', snapshot);
    if (scenario === 'snapshot-signature-failure') {
      snapshot.signature.value = flipSignature(snapshot.signature.value);
    }
    var snapshotHash = await domainHash(
      'ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v2',
      snapshot
    );
    var headSnapshotHash = scenario === 'snapshot-hash-failure'
      ? 'sha256:' + '0'.repeat(64)
      : snapshotHash;
    var headRevision = scenario === 'stale-current-revision' ? 8 : snapshot.registryRevision;
    var head = makeHead(headSnapshotHash, headRevision);
    await signArtifact(privateKey, 'ImplicitEx.CoinCard.PublicUsernameRegistryHead.v1', head);
    if (scenario === 'invalid-head-signature') head.signature.value = flipSignature(head.signature.value);
    if (scenario === 'malformed-head') delete head.expiresAt;

    var lifecycleRecord = makeLifecycleRecord(scenario);
    await signArtifact(
      privateKey,
      'ImplicitEx Coin Card Lifecycle Registry Record v1',
      lifecycleRecord
    );
    var lifecycleBundle = deepFreeze({
      registrySchemaVersion: 'coin-card-lifecycle-registry-bundle.v1',
      registryId: 'implicitex-production',
      environment: 'production',
      registryVersion: 1,
      generatedAt: '2026-08-11T11:56:00.000Z',
      entries: [lifecycleRecord],
    });
    window.__COIN_CARD_NON_PRODUCTION_LIFECYCLE_BUNDLE = lifecycleBundle;

    installFixtureFetch(scenario, head, snapshot);
    await installRouteAuthority(scenario, privateKey);

    var view = await window.IX_COIN_CARD_READONLY_BROWSER.start({
      publicUrl: publicUrlForScenario(scenario),
    });
    window.__COIN_CARD_FIXTURE_METADATA = deepFreeze({
      fixtureTrustBoundary: FIXTURE_BOUNDARY,
      scenario: scenario,
      wireEnvironment: 'production',
      testKeyId: KEY_ID,
      productionKeyTrusted: false,
      productionAuthorityClaimed: false,
    });
    window.__COIN_CARD_TEST_RESULT = view;
    window.__COIN_CARD_TEST_READY = true;
  }

  buildAndStart().catch(function (error) {
    window.__COIN_CARD_TEST_ERROR = String(error && error.stack || error);
    window.__COIN_CARD_TEST_READY = true;
  });
})();
