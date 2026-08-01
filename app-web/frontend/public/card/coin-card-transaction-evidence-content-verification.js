/* coin-card-transaction-evidence-content-verification.js
 *
 * Closed-schema validation and authority hashing for transaction-evidence.v1.
 * This module validates content only. It does not verify the P-256 signature,
 * resolve a trusted issuer key, reconcile Registry V2 or lifecycle evidence,
 * establish currentness, promote presentation, or authorize execution.
 */

(function () {
  'use strict';

  var EVIDENCE_DOMAIN = 'ImplicitEx.CoinCard.TransactionEvidence';
  var EVIDENCE_SCHEMA_VERSION = 'transaction-evidence.v1';
  var LIFECYCLE_REGISTRY_SCHEMA_VERSION = 'coin-card-lifecycle-registry-record.v1';
  var AUTHORITY_HASH_DOMAIN = 'ImplicitEx.CoinCard.TransactionEvidence.v1';
  var SIGNATURE_ALGORITHM = 'ECDSA_P256_SHA256_P1363';
  var UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

  var ENVELOPE_FIELDS = Object.freeze([
    'authority',
    'authorityHash',
    'keyId',
    'signature',
    'signatureAlgorithm',
  ]);

  var AUTHORITY_FIELDS = Object.freeze([
    'evidenceDomain',
    'evidenceSchemaVersion',
    'issuerId',
    'environment',
    'cardId',
    'runtimeManifestId',
    'lifecycleRegistryId',
    'lifecycleRegistrySchemaVersion',
    'lifecycleRecordId',
    'lifecycleRecordRevision',
    'lifecycleRecordHash',
    'coinCardRegistryId',
    'coinCardRegistrySchemaVersion',
    'coinCardRegistryRecordId',
    'coinCardRegistryRecordRevision',
    'coinCardRegistryRecordHash',
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
    TRANSACTION_EVIDENCE_CONTENT_VALIDATED: 'TRANSACTION_EVIDENCE_CONTENT_VALIDATED',
    EVIDENCE_CANONICALIZATION_INVALID: 'EVIDENCE_CANONICALIZATION_INVALID',
    EVIDENCE_DOMAIN_MISMATCH: 'EVIDENCE_DOMAIN_MISMATCH',
    EVIDENCE_SCHEMA_UNSUPPORTED: 'EVIDENCE_SCHEMA_UNSUPPORTED',
    EVIDENCE_HASH_MISMATCH: 'EVIDENCE_HASH_MISMATCH',
    EVIDENCE_SIGNATURE_INVALID: 'EVIDENCE_SIGNATURE_INVALID',
    ADDRESS_ENCODING_INVALID: 'ADDRESS_ENCODING_INVALID',
    INTEGER_ENCODING_INVALID: 'INTEGER_ENCODING_INVALID',
    LIFECYCLE_SCHEMA_MISMATCH: 'LIFECYCLE_SCHEMA_MISMATCH',
    FEE_POLICY_MISMATCH: 'FEE_POLICY_MISMATCH',
    COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED: 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
    TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE:
      'TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE',
    TRANSACTION_EVIDENCE_HASH_UNAVAILABLE: 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE',
  });

  var ADDRESS_RE = /^0x[0-9a-f]{40}$/;
  var ZERO_ADDRESS_RE = /^0x0{40}$/;
  var ATOMIC_RE = /^(0|[1-9][0-9]*)$/;
  var SHA256_RE = /^sha256:[0-9a-f]{64}$/;
  var P256_P1363_BASE64URL_RE = /^[A-Za-z0-9_-]{85}[AQgw]$/;
  var VALIDATED_RESULTS = new WeakSet();

  function isValidatedEvidenceContentResult(value) {
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

  function snapshotPlainData(value, seen) {
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
      var fieldValue = snapshotPlainData(descriptor.value, visited);
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

  function isAddress(value) {
    return typeof value === 'string' && ADDRESS_RE.test(value) && !ZERO_ADDRESS_RE.test(value);
  }

  function isAtomic(value) {
    if (typeof value !== 'string' || !ATOMIC_RE.test(value)) return false;
    try {
      return BigInt(value) <= UINT256_MAX;
    } catch (error) {
      return false;
    }
  }

  function validateFeePolicy(policy) {
    if (!hasExactFields(policy, FEE_POLICY_FIELDS)) {
      return OUTCOMES.EVIDENCE_CANONICALIZATION_INVALID;
    }
    if (!isIdentifier(policy.policyVersion) || policy.roundingRule !== 'FLOOR_BPS_THEN_CAP') {
      return OUTCOMES.FEE_POLICY_MISMATCH;
    }
    if (!isAddress(policy.feeRecipientAddress)) return OUTCOMES.ADDRESS_ENCODING_INVALID;

    var atomicFields = [
      'feeBasisPoints',
      'minimumTransferAtomic',
      'maximumTransferAtomic',
      'transferPrecisionAtomic',
    ];
    for (var i = 0; i < atomicFields.length; i++) {
      if (!isAtomic(policy[atomicFields[i]])) return OUTCOMES.INTEGER_ENCODING_INVALID;
    }
    if (policy.feeCapAtomic !== null && !isAtomic(policy.feeCapAtomic)) {
      return OUTCOMES.INTEGER_ENCODING_INVALID;
    }
    if (BigInt(policy.feeBasisPoints) > BigInt(10000)) return OUTCOMES.FEE_POLICY_MISMATCH;
    if (
      BigInt(policy.minimumTransferAtomic) === BigInt(0)
      || BigInt(policy.transferPrecisionAtomic) === BigInt(0)
      || BigInt(policy.maximumTransferAtomic) < BigInt(policy.minimumTransferAtomic)
    ) {
      return OUTCOMES.INTEGER_ENCODING_INVALID;
    }
    return null;
  }

  function validateEnvelopeShape(envelope) {
    if (
      !hasExactFields(envelope, ENVELOPE_FIELDS)
      || !hasExactFields(envelope.authority, AUTHORITY_FIELDS)
    ) {
      return OUTCOMES.EVIDENCE_CANONICALIZATION_INVALID;
    }

    var authority = envelope.authority;
    if (authority.evidenceDomain !== EVIDENCE_DOMAIN) return OUTCOMES.EVIDENCE_DOMAIN_MISMATCH;
    if (authority.evidenceSchemaVersion !== EVIDENCE_SCHEMA_VERSION) {
      return OUTCOMES.EVIDENCE_SCHEMA_UNSUPPORTED;
    }

    var identifiers = [
      'issuerId',
      'environment',
      'cardId',
      'lifecycleRegistryId',
      'lifecycleRegistrySchemaVersion',
      'lifecycleRecordId',
      'coinCardRegistryId',
      'coinCardRegistrySchemaVersion',
      'coinCardRegistryRecordId',
      'executionContractInterfaceId',
    ];
    for (var i = 0; i < identifiers.length; i++) {
      if (!isIdentifier(authority[identifiers[i]])) {
        return OUTCOMES.EVIDENCE_CANONICALIZATION_INVALID;
      }
    }
    if (authority.lifecycleRegistrySchemaVersion !== LIFECYCLE_REGISTRY_SCHEMA_VERSION) {
      return OUTCOMES.LIFECYCLE_SCHEMA_MISMATCH;
    }
    if (authority.coinCardRegistrySchemaVersion !== 'coin-card-registry-record.v2') {
      return OUTCOMES.COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED;
    }

    var addresses = [
      authority.recipientAddress,
      authority.tokenContractAddress,
      authority.executionContractAddress,
    ];
    for (var j = 0; j < addresses.length; j++) {
      if (!isAddress(addresses[j])) return OUTCOMES.ADDRESS_ENCODING_INVALID;
    }

    var atomics = [
      authority.lifecycleRecordRevision,
      authority.coinCardRegistryRecordRevision,
      authority.chainId,
    ];
    for (var k = 0; k < atomics.length; k++) {
      if (!isAtomic(atomics[k])) return OUTCOMES.INTEGER_ENCODING_INVALID;
    }

    var hashes = [
      authority.runtimeManifestId,
      authority.lifecycleRecordHash,
      authority.coinCardRegistryRecordHash,
      authority.executionInterfaceDescriptorHash,
      envelope.authorityHash,
    ];
    for (var h = 0; h < hashes.length; h++) {
      if (typeof hashes[h] !== 'string' || !SHA256_RE.test(hashes[h])) {
        return OUTCOMES.EVIDENCE_CANONICALIZATION_INVALID;
      }
    }

    var policyOutcome = validateFeePolicy(authority.feePolicy);
    if (policyOutcome !== null) return policyOutcome;

    if (!isIdentifier(envelope.keyId)) return OUTCOMES.EVIDENCE_CANONICALIZATION_INVALID;
    if (envelope.signatureAlgorithm !== SIGNATURE_ALGORITHM) {
      return OUTCOMES.EVIDENCE_SCHEMA_UNSUPPORTED;
    }
    if (
      typeof envelope.signature !== 'string'
      || !P256_P1363_BASE64URL_RE.test(envelope.signature)
    ) {
      return OUTCOMES.EVIDENCE_SIGNATURE_INVALID;
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
    var bytes;
    try {
      bytes = new Uint8Array(digest);
    } catch (error) {
      return null;
    }
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
      authorityHashEstablished: false,
      signatureEncodingValidated: false,
      signatureVerified: false,
      authenticated: false,
      current: false,
      executionEligible: false,
      envelope: null,
      authority: null,
      canonicalAuthority: null,
      authorityHash: null,
    });
  }

  function success(envelope, canonicalAuthority, authorityHash) {
    var result = Object.freeze({
      outcome: OUTCOMES.TRANSACTION_EVIDENCE_CONTENT_VALIDATED,
      contentValidated: true,
      authorityHashEstablished: true,
      signatureEncodingValidated: true,
      signatureVerified: false,
      authenticated: false,
      current: false,
      executionEligible: false,
      envelope: envelope,
      authority: envelope.authority,
      canonicalAuthority: canonicalAuthority,
      authorityHash: authorityHash,
    });
    VALIDATED_RESULTS.add(result);
    return result;
  }

  function validateAndHashEvidence(input) {
    var envelope;
    try {
      envelope = snapshotPlainData(input);
    } catch (error) {
      envelope = undefined;
    }
    if (!envelope) {
      return Promise.resolve(failure(OUTCOMES.EVIDENCE_CANONICALIZATION_INVALID));
    }

    var shapeOutcome = validateEnvelopeShape(envelope);
    if (shapeOutcome !== null) return Promise.resolve(failure(shapeOutcome));

    var canonicalize;
    try {
      canonicalize = getCanonicalizer();
    } catch (error) {
      canonicalize = null;
    }
    if (!canonicalize) {
      return Promise.resolve(failure(OUTCOMES.TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE));
    }

    var canonicalAuthority;
    try {
      canonicalAuthority = canonicalize(envelope.authority);
    } catch (error) {
      canonicalAuthority = undefined;
    }
    if (typeof canonicalAuthority !== 'string' || canonicalAuthority.length === 0) {
      return Promise.resolve(failure(OUTCOMES.TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE));
    }

    var digest;
    var domainBytes;
    var canonicalBytes;
    try {
      digest = getDigest();
      domainBytes = encodeUtf8(AUTHORITY_HASH_DOMAIN);
      canonicalBytes = encodeUtf8(canonicalAuthority);
    } catch (error) {
      digest = null;
    }
    if (!digest || !domainBytes || !canonicalBytes) {
      return Promise.resolve(failure(OUTCOMES.TRANSACTION_EVIDENCE_HASH_UNAVAILABLE));
    }

    var digestResult;
    try {
      digestResult = digest('SHA-256', concatDomainBytes(domainBytes, canonicalBytes));
    } catch (error) {
      return Promise.resolve(failure(OUTCOMES.TRANSACTION_EVIDENCE_HASH_UNAVAILABLE));
    }

    return Promise.resolve(digestResult)
      .then(function (value) {
        var authorityHash = digestToHash(value);
        if (!authorityHash) return failure(OUTCOMES.TRANSACTION_EVIDENCE_HASH_UNAVAILABLE);
        if (authorityHash !== envelope.authorityHash) {
          return failure(OUTCOMES.EVIDENCE_HASH_MISMATCH);
        }
        return success(envelope, canonicalAuthority, authorityHash);
      })
      .catch(function () {
        return failure(OUTCOMES.TRANSACTION_EVIDENCE_HASH_UNAVAILABLE);
      });
  }

  Object.defineProperty(window, 'IX_COIN_CARD_TRANSACTION_EVIDENCE_CONTENT_VERIFICATION', {
    value: Object.freeze({
      EVIDENCE_DOMAIN: EVIDENCE_DOMAIN,
      EVIDENCE_SCHEMA_VERSION: EVIDENCE_SCHEMA_VERSION,
      LIFECYCLE_REGISTRY_SCHEMA_VERSION: LIFECYCLE_REGISTRY_SCHEMA_VERSION,
      AUTHORITY_HASH_DOMAIN: AUTHORITY_HASH_DOMAIN,
      SIGNATURE_ALGORITHM: SIGNATURE_ALGORITHM,
      OUTCOMES: OUTCOMES,
      validateAndHashEvidence: validateAndHashEvidence,
      isValidatedEvidenceContentResult: isValidatedEvidenceContentResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
