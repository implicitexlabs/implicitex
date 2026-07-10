/* coin-card-lifecycle-bundle-verification.js — Coin Card lifecycle bundle validation
 *
 * This module validates non-empty lifecycle record collections. It does not
 * resolve card lifecycle state, promote presentation state, or authorize
 * execution.
 */

(function () {
  'use strict';

  var BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
  var BUNDLE_REGISTRY_ID = 'implicitex-production';
  var BUNDLE_ENVIRONMENT = 'production';
  var BUNDLE_SIGNATURE = 'not-applicable-v1';
  var STRICT_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var BUNDLE_CLOCK_SKEW_MS = 5 * 60 * 1000;
  var BUNDLE_FIELDS = Object.freeze([
    'entries',
    'environment',
    'generatedAt',
    'registryId',
    'registrySchemaVersion',
    'registryVersion',
  ]);
  var OUTCOMES = Object.freeze({
    LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED: 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED',
    LIFECYCLE_BUNDLE_STRUCTURE_INVALID: 'LIFECYCLE_BUNDLE_STRUCTURE_INVALID',
    LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED: 'LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED',
    LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID: 'LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID',
    LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE: 'LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE',
  });

  function isPlainDataContainer(value) {
    if (Array.isArray(value)) return true;

    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isArrayIndexName(name, length) {
    if (!/^(0|[1-9]\d*)$/.test(name)) return false;
    var index = Number(name);
    return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === name;
  }

  function getOwnDataPropertyNames(value) {
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;

    var names = Object.getOwnPropertyNames(value);
    if (Array.isArray(value)) {
      var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')) return null;

      var indexNames = [];
      for (var i = 0; i < names.length; i++) {
        var arrayName = names[i];
        if (arrayName === 'length') continue;
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, arrayName);
        if (
          !arrayDescriptor
          || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')
          || arrayDescriptor.enumerable !== true
          || !isArrayIndexName(arrayName, value.length)
          || typeof arrayDescriptor.value === 'function'
        ) {
          return null;
        }
        indexNames.push(arrayName);
      }
      if (indexNames.length !== value.length) return null;
      return indexNames.sort(function (left, right) { return Number(left) - Number(right); });
    }

    for (var j = 0; j < names.length; j++) {
      var name = names[j];
      var descriptor = Object.getOwnPropertyDescriptor(value, name);
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

  function isDeepFrozenPlainData(value, seen) {
    if (!value || typeof value !== 'object') return true;
    if (!Object.isFrozen(value)) return false;
    if (!isPlainDataContainer(value)) return false;
    var keys = getOwnDataPropertyNames(value);
    if (!keys) return false;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return false;
    visited.push(value);

    for (var i = 0; i < keys.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[i]);
      if (!isDeepFrozenPlainData(descriptor.value, visited)) return false;
    }
    return true;
  }

  function snapshotPlainData(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      return value;
    }
    if (
      typeof value === 'undefined'
      || typeof value === 'function'
      || typeof value === 'symbol'
      || !value
      || typeof value !== 'object'
      || !isPlainDataContainer(value)
    ) {
      return undefined;
    }

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);

    var keys = getOwnDataPropertyNames(value);
    if (!keys) return undefined;

    if (Array.isArray(value)) {
      var array = [];
      for (var i = 0; i < value.length; i++) {
        var item = snapshotPlainData(value[i], visited);
        if (item === undefined) return undefined;
        array.push(item);
      }
      return Object.freeze(array);
    }

    var snapshot = {};
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      var fieldValue = snapshotPlainData(descriptor.value, visited);
      if (fieldValue === undefined) return undefined;
      snapshot[key] = fieldValue;
    }
    return Object.freeze(snapshot);
  }

  function parseStrictUtcTimestamp(value) {
    if (typeof value !== 'string' || !STRICT_UTC_TIMESTAMP_RE.test(value)) return null;
    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    if (new Date(milliseconds).toISOString() !== value) return null;
    return milliseconds;
  }

  function isNonemptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function isSafePositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0);
  }

  function getRegistryApi() {
    return window.IX_COIN_CARD_LIFECYCLE_REGISTRY || null;
  }

  function getRecordVerifierApi() {
    return window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION || null;
  }

  function readExactDataProperty(options, field) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      return {
        present: false,
        value: undefined,
      };
    }
    if (!Object.prototype.hasOwnProperty.call(options, field)) {
      return {
        present: false,
        value: undefined,
      };
    }

    var descriptor = Object.getOwnPropertyDescriptor(options, field);
    if (
      !descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true
    ) {
      return undefined;
    }

    return {
      present: true,
      value: descriptor.value,
    };
  }

  function failure(outcome, extra) {
    var result = {
      outcome: outcome,
      authenticated: false,
      sourceValidated: false,
      recordsAuthenticated: false,
      bundleIntegrityAuthenticated: false,
      rollbackProtected: false,
      bundleSignature: BUNDLE_SIGNATURE,
      bundle: null,
      entries: null,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }
    return Object.freeze(result);
  }

  function success(bundle, authenticatedEntries) {
    return Object.freeze({
      outcome: OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED,
      authenticated: true,
      sourceValidated: true,
      recordsAuthenticated: true,
      bundleIntegrityAuthenticated: false,
      rollbackProtected: false,
      bundleSignature: BUNDLE_SIGNATURE,
      registryId: bundle.registryId,
      environment: bundle.environment,
      registryVersion: bundle.registryVersion,
      generatedAt: bundle.generatedAt,
      entryCount: authenticatedEntries.length,
      bundle: bundle,
      entries: Object.freeze(authenticatedEntries.slice()),
    });
  }

  function hasExactFields(value, fields) {
    var names = getOwnDataPropertyNames(value);
    if (!Array.isArray(names) || names.length !== fields.length) return false;
    var actualSorted = names.slice().sort();
    var expectedSorted = fields.slice().sort();
    for (var i = 0; i < expectedSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) return false;
    }
    return true;
  }

  function validateBundleShape(bundle) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false;
    if (!isDeepFrozenPlainData(bundle)) return false;
    if (!hasExactFields(bundle, BUNDLE_FIELDS)) return false;
    if (bundle.registrySchemaVersion !== BUNDLE_SCHEMA_VERSION) return false;
    if (bundle.registryId !== BUNDLE_REGISTRY_ID) return false;
    if (bundle.environment !== BUNDLE_ENVIRONMENT) return false;
    if (!isSafePositiveInteger(bundle.registryVersion)) return false;
    if (!isNonemptyString(bundle.generatedAt) || parseStrictUtcTimestamp(bundle.generatedAt) === null) return false;
    if (!Array.isArray(bundle.entries) || bundle.entries.length < 1) return false;
    if (!Object.isFrozen(bundle.entries)) return false;
    return true;
  }

  async function authenticateLifecycleRegistryBundle(bundle, options) {
    var registryApi = getRegistryApi();
    var recordVerifierApiOption = readExactDataProperty(options, 'recordVerifierApi');
    var now = new Date().toISOString();
    var verificationTime = now;
    var verificationTimeOption = readExactDataProperty(options, 'verificationTime');
    var verificationTimeMs;

    if (!registryApi || typeof registryApi.canonicalizeJson !== 'function') {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE, {
        sourceValidated: false,
        reason: 'lifecycle-registry-canonicalizer-unavailable',
      }));
    }
    if (verificationTimeOption === undefined) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID, {
        sourceValidated: false,
        reason: 'bundle-verification-time-not-enumerable',
      }));
    }
    if (verificationTimeOption.present) {
      verificationTime = verificationTimeOption.value;
      verificationTimeMs = parseStrictUtcTimestamp(verificationTime);
      if (verificationTimeMs === null) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID, {
          sourceValidated: false,
          reason: 'bundle-verification-time-invalid',
        }));
      }
    }
    if (typeof verificationTimeMs === 'undefined') {
      verificationTimeMs = parseStrictUtcTimestamp(verificationTime);
    }
    var recordVerifierApi = null;
    if (recordVerifierApiOption && recordVerifierApiOption.present) {
      recordVerifierApi = recordVerifierApiOption.value;
    }
    if (!recordVerifierApi || typeof recordVerifierApi.authenticateLifecycleRecord !== 'function') {
      recordVerifierApi = getRecordVerifierApi();
    }
    if (!recordVerifierApi || typeof recordVerifierApi.authenticateLifecycleRecord !== 'function') {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE, {
        sourceValidated: false,
        reason: 'lifecycle-record-verifier-unavailable',
      }));
    }

    var snapshot = snapshotPlainData(bundle, []);
    if (!snapshot || !validateBundleShape(snapshot)) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID));
    }

    if (parseStrictUtcTimestamp(snapshot.generatedAt) > verificationTimeMs + BUNDLE_CLOCK_SKEW_MS) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID));
    }

    if (registryApi.canonicalizeJson(snapshot) === null) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID));
    }

    var generatedAtMs = parseStrictUtcTimestamp(snapshot.generatedAt);
    var authenticatedEntries = [];
    var previousRegistryVersion = 0;
    var highestRegistryVersion = 0;
    var seenRecordIds = Object.create(null);
    var seenRegistryVersions = Object.create(null);
    var seenPublicationIds = Object.create(null);

    for (var i = 0; i < snapshot.entries.length; i++) {
      var entry = snapshot.entries[i];
      var entryResult;

      try {
        entryResult = await recordVerifierApi.authenticateLifecycleRecord(entry, {
          verificationTime: verificationTime,
        });
      } catch (error) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE, {
          failedEntryIndex: i,
          failedRecordId: entry && entry.recordId || null,
          reason: 'lifecycle-record-verifier-rejected',
          sourceValidated: true,
        }));
      }

      if (
        !entryResult
        || entryResult.outcome !== recordVerifierApi.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED
        || !entryResult.record
      ) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED, {
          failedEntryIndex: i,
          failedRecordId: entry && entry.recordId || null,
          entryOutcome: entryResult && entryResult.outcome || null,
          sourceValidated: true,
        }));
      }

      var record = entryResult.record;
      if (record.registryId !== snapshot.registryId || record.environment !== snapshot.environment) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }
      if (record.registryVersion <= previousRegistryVersion) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }
      if (seenRegistryVersions[record.registryVersion]) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }
      if (seenRecordIds[record.recordId]) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }

      var publicationIdentity = registryApi.canonicalizeJson([
        record.cardId,
        record.manifestId,
        record.revision,
      ]);
      if (publicationIdentity === null) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }
      if (seenPublicationIds[publicationIdentity]) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }

      if (parseStrictUtcTimestamp(record.publishedAt) > generatedAtMs) {
        return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
          sourceValidated: true,
        }));
      }

      seenRegistryVersions[record.registryVersion] = true;
      seenRecordIds[record.recordId] = true;
      seenPublicationIds[publicationIdentity] = true;
      previousRegistryVersion = record.registryVersion;
      highestRegistryVersion = record.registryVersion;
      authenticatedEntries.push(entryResult);
    }

    if (highestRegistryVersion !== snapshot.registryVersion) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, {
        sourceValidated: true,
      }));
    }

    return Promise.resolve(success(snapshot, authenticatedEntries));
  }

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: Object.freeze({
      BUNDLE_SCHEMA_VERSION: BUNDLE_SCHEMA_VERSION,
      OUTCOMES: OUTCOMES,
      authenticateLifecycleRegistryBundle: authenticateLifecycleRegistryBundle,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
