/* coin-card-executable-registry-record-verification.js
 *
 * Closed-schema validation and content hashing for executable Coin Card
 * Registry V2 records. This module establishes record content only. It does
 * not authenticate Transaction Evidence, establish publication currentness,
 * compare an authority, promote presentation, or authorize execution.
 */

(function () {
  'use strict';

  var RECORD_SCHEMA_VERSION = 'coin-card-registry-record.v2';
  var RECORD_HASH_DOMAIN = 'ImplicitEx.CoinCard.ExecutableRegistryRecord.v2';
  var UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

  var RECORD_FIELDS = Object.freeze([
    'registrySchemaVersion',
    'registryId',
    'environment',
    'recordId',
    'revision',
    'cardId',
    'recipientAddress',
    'chainId',
    'tokenContractAddress',
    'executionContractAddress',
    'executionContractInterfaceId',
    'executionInterfaceDescriptorHash',
    'feePolicy',
  ]);

  var FEE_POLICY_FIELDS = Object.freeze([
    'policyVersion',
    'feeBasisPoints',
    'feeCapAtomic',
    'minimumTransferAtomic',
    'maximumTransferAtomic',
    'transferPrecisionAtomic',
    'roundingRule',
    'feeRecipientAddress',
  ]);

  var OUTCOMES = Object.freeze({
    EXECUTABLE_REGISTRY_RECORD_VALIDATED: 'EXECUTABLE_REGISTRY_RECORD_VALIDATED',
    LEGACY_REGISTRY_NOT_EXECUTABLE: 'LEGACY_REGISTRY_NOT_EXECUTABLE',
    COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED: 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
    EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE:
      'EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE',
    EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE: 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE',
  });

  var ADDRESS_RE = /^0x[0-9a-f]{40}$/;
  var ZERO_ADDRESS_RE = /^0x0{40}$/;
  var ATOMIC_RE = /^(0|[1-9][0-9]*)$/;
  var SHA256_RE = /^sha256:[0-9a-f]{64}$/;
  var VALIDATED_RESULTS = new WeakSet();

  function isValidatedRecordResult(value) {
    try {
      return VALIDATED_RESULTS.has(value);
    } catch (error) {
      return false;
    }
  }

  function getOwnDataPropertyNames(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length !== 0) return null;

    var names;
    try {
      names = Object.getOwnPropertyNames(value);
    } catch (error) {
      return null;
    }
    for (var i = 0; i < names.length; i++) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
      } catch (error) {
        return null;
      }
      if (
        !descriptor
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || descriptor.enumerable !== true
        || typeof descriptor.value === 'function'
      ) {
        return null;
      }
    }
    return names;
  }

  function sameStringSet(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    var actualSorted = actual.slice().sort();
    var expectedSorted = expected.slice().sort();
    for (var i = 0; i < expectedSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) return false;
    }
    return true;
  }

  function hasExactFields(value, expected) {
    return sameStringSet(getOwnDataPropertyNames(value), expected);
  }

  function snapshotPlainRecord(value, seen) {
    if (value === null || typeof value === 'string') return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);

    var names = getOwnDataPropertyNames(value);
    if (!names) return undefined;
    var snapshot = {};
    for (var i = 0; i < names.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
      var fieldValue = snapshotPlainRecord(descriptor.value, visited);
      if (fieldValue === undefined) return undefined;
      snapshot[names[i]] = fieldValue;
    }
    visited.pop();
    return Object.freeze(snapshot);
  }

  function containsOnlyUnicodeScalars(value) {
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 >= value.length) return false;
        var next = value.charCodeAt(i + 1);
        if (next < 0xdc00 || next > 0xdfff) return false;
        i += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return false;
      }
    }
    return true;
  }

  function isIdentifier(value) {
    return (
      typeof value === 'string'
      && value.length > 0
      && value.trim() === value
      && containsOnlyUnicodeScalars(value)
      && typeof value.normalize === 'function'
      && value.normalize('NFC') === value
    );
  }

  function isAtomic(value) {
    if (typeof value !== 'string' || !ATOMIC_RE.test(value)) return false;
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch (error) {
      return false;
    }
  }

  function isAddress(value) {
    return typeof value === 'string' && ADDRESS_RE.test(value) && !ZERO_ADDRESS_RE.test(value);
  }

  function validateRecordShape(record) {
    if (record && record.schema === 'implicitex.coincard.v1') {
      return OUTCOMES.LEGACY_REGISTRY_NOT_EXECUTABLE;
    }
    if (record && record.registrySchemaVersion === 'coin-card-registry-record.v1') {
      return OUTCOMES.LEGACY_REGISTRY_NOT_EXECUTABLE;
    }
    if (!record || record.registrySchemaVersion !== RECORD_SCHEMA_VERSION) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }
    if (
      !hasExactFields(record, RECORD_FIELDS)
      || !hasExactFields(record.feePolicy, FEE_POLICY_FIELDS)
    ) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }

    var identifiers = [
      'registryId',
      'environment',
      'recordId',
      'cardId',
      'executionContractInterfaceId',
    ];
    for (var i = 0; i < identifiers.length; i++) {
      if (!isIdentifier(record[identifiers[i]])) {
        return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
      }
    }
    if (!isIdentifier(record.feePolicy.policyVersion)) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }

    if (!isAtomic(record.revision) || !isAtomic(record.chainId)) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }

    var addresses = [
      record.recipientAddress,
      record.tokenContractAddress,
      record.executionContractAddress,
      record.feePolicy.feeRecipientAddress,
    ];
    for (var j = 0; j < addresses.length; j++) {
      if (!isAddress(addresses[j])) return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }

    if (!SHA256_RE.test(record.executionInterfaceDescriptorHash)) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }

    var atomicPolicyFields = [
      'feeBasisPoints',
      'minimumTransferAtomic',
      'maximumTransferAtomic',
      'transferPrecisionAtomic',
    ];
    for (var k = 0; k < atomicPolicyFields.length; k++) {
      if (!isAtomic(record.feePolicy[atomicPolicyFields[k]])) {
        return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
      }
    }
    if (record.feePolicy.feeCapAtomic !== null && !isAtomic(record.feePolicy.feeCapAtomic)) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }
    if (
      BigInt(record.feePolicy.feeBasisPoints) > BigInt(10000)
      || BigInt(record.feePolicy.minimumTransferAtomic) === BigInt(0)
      || BigInt(record.feePolicy.transferPrecisionAtomic) === BigInt(0)
      || BigInt(record.feePolicy.maximumTransferAtomic) < BigInt(record.feePolicy.minimumTransferAtomic)
      || record.feePolicy.roundingRule !== 'FLOOR_BPS_THEN_CAP'
    ) {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }
    return null;
  }

  function getCanonicalizer() {
    var api = window.IX_COIN_CARD_LIFECYCLE_REGISTRY;
    return api && typeof api.canonicalizeJson === 'function'
      ? api.canonicalizeJson
      : null;
  }

  function getDigest() {
    return window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function'
      ? window.crypto.subtle.digest.bind(window.crypto.subtle)
      : null;
  }

  function encodeUtf8(value) {
    var Encoder = window.TextEncoder || (typeof TextEncoder === 'function' ? TextEncoder : null);
    if (!Encoder) return null;
    try {
      var encoded = new Encoder().encode(value);
      return encoded instanceof Uint8Array ? encoded : null;
    } catch (error) {
      return null;
    }
  }

  function concatDomainBytes(domainBytes, canonicalBytes) {
    var bytes = new Uint8Array(domainBytes.length + 1 + canonicalBytes.length);
    bytes.set(domainBytes, 0);
    bytes[domainBytes.length] = 0;
    bytes.set(canonicalBytes, domainBytes.length + 1);
    return bytes;
  }

  function digestToHash(digest) {
    var bytes = new Uint8Array(digest);
    if (bytes.length !== 32) return null;
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return 'sha256:' + hex;
  }

  function failure(outcome) {
    return Object.freeze({
      outcome: outcome,
      contentValidated: false,
      contentHashEstablished: false,
      authenticated: false,
      current: false,
      executionEligible: false,
      record: null,
      canonicalJson: null,
      recordHash: null,
    });
  }

  function success(record, canonicalJson, recordHash) {
    var result = Object.freeze({
      outcome: OUTCOMES.EXECUTABLE_REGISTRY_RECORD_VALIDATED,
      contentValidated: true,
      contentHashEstablished: true,
      authenticated: false,
      current: false,
      executionEligible: false,
      record: record,
      canonicalJson: canonicalJson,
      recordHash: recordHash,
    });
    VALIDATED_RESULTS.add(result);
    return result;
  }

  function validateAndHashRecord(input) {
    var record;
    try {
      record = snapshotPlainRecord(input);
    } catch (error) {
      record = undefined;
    }
    if (!record) {
      return Promise.resolve(failure(OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED));
    }
    var shapeOutcome = validateRecordShape(record);
    if (shapeOutcome !== null) {
      return Promise.resolve(failure(shapeOutcome));
    }

    var canonicalize;
    try {
      canonicalize = getCanonicalizer();
    } catch (error) {
      canonicalize = null;
    }
    if (!canonicalize) {
      return Promise.resolve(failure(OUTCOMES.EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE));
    }

    var canonicalJson;
    try {
      canonicalJson = canonicalize(record);
    } catch (error) {
      canonicalJson = undefined;
    }
    if (typeof canonicalJson !== 'string' || canonicalJson.length === 0) {
      return Promise.resolve(failure(OUTCOMES.EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE));
    }

    var digest;
    var domainBytes;
    var canonicalBytes;
    try {
      digest = getDigest();
      domainBytes = encodeUtf8(RECORD_HASH_DOMAIN);
      canonicalBytes = encodeUtf8(canonicalJson);
    } catch (error) {
      digest = null;
    }
    if (!digest || !domainBytes || !canonicalBytes) {
      return Promise.resolve(failure(OUTCOMES.EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE));
    }

    var digestResult;
    try {
      digestResult = digest('SHA-256', concatDomainBytes(domainBytes, canonicalBytes));
    } catch (error) {
      return Promise.resolve(failure(OUTCOMES.EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE));
    }

    return Promise.resolve(digestResult)
      .then(function (value) {
        var recordHash = digestToHash(value);
        return recordHash
          ? success(record, canonicalJson, recordHash)
          : failure(OUTCOMES.EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE);
      })
      .catch(function () {
        return failure(OUTCOMES.EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE);
      });
  }

  Object.defineProperty(window, 'IX_COIN_CARD_EXECUTABLE_REGISTRY_RECORD_VERIFICATION', {
    value: Object.freeze({
      RECORD_SCHEMA_VERSION: RECORD_SCHEMA_VERSION,
      RECORD_HASH_DOMAIN: RECORD_HASH_DOMAIN,
      OUTCOMES: OUTCOMES,
      validateAndHashRecord: validateAndHashRecord,
      isValidatedRecordResult: isValidatedRecordResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
