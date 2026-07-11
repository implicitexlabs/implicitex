/* coin-card-lifecycle-record-selection.js — Coin Card lifecycle evidence selection
 *
 * This module selects coherent lifecycle evidence from an already authenticated
 * lifecycle bundle. It does not authenticate records, resolve lifecycle state,
 * promote presentation, or authorize execution.
 */

(function () {
  'use strict';

  var TOP_LEVEL_FACTS = Object.freeze({
    SELECTED: 'SELECTED',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
  });

  var OUTCOMES = Object.freeze({
    LIFECYCLE_EVIDENCE_SELECTED: 'LIFECYCLE_EVIDENCE_SELECTED',
    LIFECYCLE_EVIDENCE_CARD_NOT_FOUND: 'LIFECYCLE_EVIDENCE_CARD_NOT_FOUND',
    LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND: 'LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND',
    LIFECYCLE_EVIDENCE_INPUT_INVALID: 'LIFECYCLE_EVIDENCE_INPUT_INVALID',
    LIFECYCLE_EVIDENCE_DUPLICATE_POSITION: 'LIFECYCLE_EVIDENCE_DUPLICATE_POSITION',
    LIFECYCLE_EVIDENCE_LINEAGE_INVALID: 'LIFECYCLE_EVIDENCE_LINEAGE_INVALID',
    LIFECYCLE_EVIDENCE_INTERVAL_CONFLICT: 'LIFECYCLE_EVIDENCE_INTERVAL_CONFLICT',
    LIFECYCLE_EVIDENCE_STATUS_CONFLICT: 'LIFECYCLE_EVIDENCE_STATUS_CONFLICT',
    LIFECYCLE_EVIDENCE_AMBIGUOUS: 'LIFECYCLE_EVIDENCE_AMBIGUOUS',
  });

  var REASONS = Object.freeze({
    INPUT_INVALID: 'selection-input-invalid',
    CARD_NOT_FOUND: 'selection-card-not-found',
    MANIFEST_NOT_FOUND: 'selection-manifest-not-found',
    DUPLICATE_POSITION: 'selection-duplicate-position',
    LINEAGE_INVALID: 'selection-lineage-invalid',
    INTERVAL_CONFLICT: 'selection-interval-conflict',
    STATUS_CONFLICT: 'selection-status-conflict',
    AMBIGUOUS: 'selection-ambiguous',
    PROOF_UNAVAILABLE: 'selection-bundle-proof-unavailable',
    PROOF_INVALID: 'selection-bundle-proof-invalid',
    REQUEST_INVALID: 'selection-request-invalid',
  });

  var BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
  var BUNDLE_SIGNATURE = 'not-applicable-v1';
  var BUNDLE_REGISTRY_ID = 'implicitex-production';
  var BUNDLE_ENVIRONMENT = 'production';
  var BUNDLE_PROOF_FIELDS = Object.freeze([
    'authenticated',
    'bundle',
    'bundleIntegrityAuthenticated',
    'bundleSignature',
    'entryCount',
    'entries',
    'environment',
    'generatedAt',
    'outcome',
    'recordsAuthenticated',
    'registryId',
    'registryVersion',
    'rollbackProtected',
    'sourceValidated',
  ]);
  var BUNDLE_FIELDS = Object.freeze([
    'entries',
    'environment',
    'generatedAt',
    'registryId',
    'registrySchemaVersion',
    'registryVersion',
  ]);
  var ENTRY_RESULT_FIELDS = Object.freeze([
    'authenticated',
    'authorityId',
    'keyId',
    'outcome',
    'record',
    'recordId',
    'registryId',
    'registryVersion',
    'keyResolution',
  ]);
  var RECORD_FIELDS = Object.freeze([
    'administrationEvidenceHash',
    'authorityId',
    'cardId',
    'cardStatus',
    'effectiveFrom',
    'effectiveUntil',
    'environment',
    'manifestId',
    'manifestStatus',
    'previousManifestId',
    'publishedAt',
    'reasonCode',
    'recordId',
    'registryId',
    'registrySchemaVersion',
    'registryVersion',
    'revision',
    'signature',
    'supersededByManifestId',
  ]);

  function getBundleVerificationApi() {
    return window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION || null;
  }

  function getRegistryApi() {
    return window.IX_COIN_CARD_LIFECYCLE_REGISTRY || null;
  }

  function isPlainObjectContainer(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    if (prototype === null) return true;
    if (Object.getPrototypeOf(prototype) !== null) return false;
    if (Object.prototype.toString.call(value) !== '[object Object]') return false;
    if (!Object.prototype.hasOwnProperty.call(prototype, 'constructor')) return false;
    return typeof prototype.constructor === 'function' && prototype.constructor.name === 'Object';
  }

  function isPlainDataContainer(value) {
    if (Array.isArray(value)) return true;
    if (!value || typeof value !== 'object') return false;
    return Object.prototype.toString.call(value) === '[object Object]';
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

  function isDeepFrozenPlainData(value, activePath, validated) {
    if (!value || typeof value !== 'object') return true;
    if (!Object.isFrozen(value)) return false;
    if (!isPlainDataContainer(value)) return false;
    var keys = getOwnDataPropertyNames(value);
    if (!keys) return false;

    var active = activePath || [];
    var validatedValues = validated || [];
    if (validatedValues.indexOf(value) !== -1) return true;
    if (active.indexOf(value) !== -1) return false;
    active.push(value);

    for (var i = 0; i < keys.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[i]);
      if (!isDeepFrozenPlainData(descriptor.value, active, validatedValues)) return false;
    }
    active.pop();
    validatedValues.push(value);
    return true;
  }

  function snapshotPlainObject(value, seen) {
    if (
      value === null
      || typeof value === 'undefined'
      || typeof value === 'function'
      || typeof value === 'symbol'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || typeof value === 'string'
    ) {
      return value;
    }
    if (!isPlainObjectContainer(value)) return undefined;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);

    var keys = getOwnDataPropertyNames(value);
    if (!keys) return undefined;

    var snapshot = {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      var fieldValue = snapshotPlainObject(descriptor.value, visited);
      if (fieldValue === undefined) return undefined;
      snapshot[key] = fieldValue;
    }
    return Object.freeze(snapshot);
  }

  function parseStrictUtcTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
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

  function sameStringSet(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    var actualSorted = actual.slice().sort();
    var expectedSorted = expected.slice().sort();
    for (var i = 0; i < expectedSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) return false;
    }
    return true;
  }

  function hasExactFields(value, fields) {
    return sameStringSet(getOwnDataPropertyNames(value), fields);
  }

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) {
      freezeDeep(value[key]);
    });
    return Object.freeze(value);
  }

  function freezeStringArray(values) {
    return Object.freeze(values.slice());
  }

  function outcomeFactory(fact, outcome, reason, extra) {
    var result = {
      fact: fact,
      outcome: outcome,
      selected: fact === TOP_LEVEL_FACTS.SELECTED,
      operationallyResolved: false,
      presentationEligible: false,
      executionEligible: false,
      registryId: null,
      registryVersion: null,
      cardId: null,
      requestedManifestId: null,
      selectedRecordCount: 0,
      requestedRecord: null,
      selectedRecords: null,
      predecessorRecords: null,
      successorRecords: null,
      lineage: null,
      reason: reason || null,
    };

    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }

    return freezeDeep(result);
  }

  function buildTupleKey(registryApi, tuple) {
    try {
      return registryApi && typeof registryApi.canonicalizeJson === 'function'
        ? registryApi.canonicalizeJson(tuple)
        : null;
    } catch (error) {
      return null;
    }
  }

  function buildRegistryPositionKey(registryApi, registryId, registryVersion) {
    return buildTupleKey(registryApi, [registryId, registryVersion]);
  }

  function buildManifestIdentityKey(registryApi, cardId, manifestId) {
    return buildTupleKey(registryApi, [cardId, manifestId]);
  }

  function buildRecordPositionKey(registryApi, cardId, manifestId, revision) {
    return buildTupleKey(registryApi, [cardId, manifestId, revision]);
  }

  function getEntryRecords(proof) {
    var records = [];
    for (var i = 0; i < proof.entries.length; i++) {
      records.push(proof.entries[i].record);
    }
    return records;
  }

  function validateBundleProof(proof, bundleApi, registryApi) {
    if (
      !bundleApi
      || typeof bundleApi.isAuthenticatedBundleResult !== 'function'
      || typeof bundleApi.OUTCOMES !== 'object'
    ) {
      return {
        ok: false,
        reason: REASONS.PROOF_UNAVAILABLE,
      };
    }
    if (!registryApi || typeof registryApi.canonicalizeJson !== 'function') {
      return {
        ok: false,
        reason: REASONS.PROOF_UNAVAILABLE,
      };
    }
    if (!proof || typeof proof !== 'object' || Array.isArray(proof) || !Object.isFrozen(proof)) {
      return {
        ok: false,
        reason: REASONS.PROOF_INVALID,
      };
    }
    try {
      if (bundleApi.isAuthenticatedBundleResult(proof) !== true) {
        return {
          ok: false,
          reason: REASONS.PROOF_INVALID,
        };
      }
    } catch (error) {
      return {
        ok: false,
        reason: REASONS.PROOF_UNAVAILABLE,
      };
    }
    if (!hasExactFields(proof, BUNDLE_PROOF_FIELDS)) {
      return {
        ok: false,
        reason: REASONS.PROOF_INVALID,
      };
    }
    if (proof.outcome !== bundleApi.OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED) {
      return {
        ok: false,
        reason: REASONS.PROOF_INVALID,
      };
    }
    if (
      proof.authenticated !== true
      || proof.sourceValidated !== true
      || proof.recordsAuthenticated !== true
      || proof.bundleIntegrityAuthenticated !== false
      || proof.rollbackProtected !== false
      || proof.bundleSignature !== BUNDLE_SIGNATURE
      || proof.registryId !== BUNDLE_REGISTRY_ID
      || proof.environment !== BUNDLE_ENVIRONMENT
      || !isSafePositiveInteger(proof.registryVersion)
      || !isSafePositiveInteger(proof.entryCount)
      || parseStrictUtcTimestamp(proof.generatedAt) === null
      || !proof.bundle
      || !proof.entries
      || !Array.isArray(proof.entries)
      || !Array.isArray(proof.bundle.entries)
      || !Object.isFrozen(proof.bundle)
      || !Object.isFrozen(proof.bundle.entries)
      || !Object.isFrozen(proof.entries)
      || !isDeepFrozenPlainData(proof.bundle)
      || !isDeepFrozenPlainData(proof.bundle.entries)
      || !isDeepFrozenPlainData(proof.entries)
      || proof.bundle.registrySchemaVersion !== BUNDLE_SCHEMA_VERSION
      || proof.bundle.registryId !== proof.registryId
      || proof.bundle.environment !== proof.environment
      || proof.bundle.registryVersion !== proof.registryVersion
      || proof.bundle.generatedAt !== proof.generatedAt
      || proof.bundle.entries.length !== proof.entryCount
      || proof.bundle.entries.length !== proof.entries.length
      || proof.entries.length !== proof.entryCount
    ) {
      return {
        ok: false,
        reason: REASONS.PROOF_INVALID,
      };
    }

    var entryResults = proof.entries;
    var bundleRecords = proof.bundle.entries;
    var authenticatedRecords = getEntryRecords(proof);

    for (var i = 0; i < entryResults.length; i++) {
      var entryResult = entryResults[i];
      var bundleRecord = bundleRecords[i];
      var authenticatedRecord = authenticatedRecords[i];
      if (
        !entryResult
        || typeof entryResult !== 'object'
        || Array.isArray(entryResult)
        || !Object.isFrozen(entryResult)
        || !hasExactFields(entryResult, ENTRY_RESULT_FIELDS)
        || entryResult.outcome !== 'LIFECYCLE_RECORD_AUTHENTICATED'
        || entryResult.authenticated !== true
        || entryResult.registryId !== proof.registryId
        || !entryResult.record
        || !entryResult.keyResolution
        || !Object.isFrozen(entryResult.record)
        || !Object.isFrozen(entryResult.keyResolution)
        || !isDeepFrozenPlainData(entryResult.record)
        || !isDeepFrozenPlainData(entryResult.keyResolution)
        || !hasExactFields(entryResult.record, RECORD_FIELDS)
        || entryResult.recordId !== entryResult.record.recordId
        || entryResult.registryVersion !== entryResult.record.registryVersion
        || entryResult.authorityId !== entryResult.record.authorityId
        || entryResult.keyId !== entryResult.record.signature.keyId
      ) {
        return {
          ok: false,
          reason: REASONS.PROOF_INVALID,
        };
      }

      if (
        entryResult.record.registryId !== proof.registryId
        || entryResult.record.environment !== proof.environment
        || entryResult.record.registryVersion !== entryResult.registryVersion
        || entryResult.record.recordId !== entryResult.recordId
        || entryResult.record.authorityId !== entryResult.authorityId
        || entryResult.record.signature.keyId !== entryResult.keyId
      ) {
        return {
          ok: false,
          reason: REASONS.PROOF_INVALID,
        };
      }

      var bundleCanonical = registryApi.canonicalizeJson(bundleRecord);
      var authenticatedCanonical = registryApi.canonicalizeJson(authenticatedRecord);
      if (!bundleCanonical || !authenticatedCanonical || bundleCanonical !== authenticatedCanonical) {
        return {
          ok: false,
          reason: REASONS.PROOF_INVALID,
        };
      }

      var recordCanonical = registryApi.canonicalizeJson(entryResult.record);
      if (!recordCanonical || recordCanonical !== authenticatedCanonical) {
        return {
          ok: false,
          reason: REASONS.PROOF_INVALID,
        };
      }
    }

    return {
      ok: true,
      proof: proof,
      registryApi: registryApi,
      bundleApi: bundleApi,
      registryId: proof.registryId,
      registryVersion: proof.registryVersion,
      environment: proof.environment,
      generatedAt: proof.generatedAt,
      entryCount: proof.entryCount,
      entryResults: entryResults,
      records: authenticatedRecords,
    };
  }

  function validateSelectionRequest(request) {
    var snapshot = snapshotPlainObject(request, []);
    if (!snapshot) {
      return {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }

    var fields = getOwnDataPropertyNames(snapshot);
    if (!fields || (fields.length !== 1 && fields.length !== 2)) {
      return {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }
    if (fields.indexOf('cardId') === -1) {
      return {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }
    if (fields.length === 2 && fields.indexOf('manifestId') === -1) {
      return {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }
    if (!isNonemptyString(snapshot.cardId)) {
      return {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }
    if (
      Object.prototype.hasOwnProperty.call(snapshot, 'manifestId')
      && snapshot.manifestId !== null
      && !isNonemptyString(snapshot.manifestId)
    ) {
      return {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }

    return {
      ok: true,
      cardId: snapshot.cardId,
      requestedManifestId: Object.prototype.hasOwnProperty.call(snapshot, 'manifestId')
        ? snapshot.manifestId
        : null,
    };
  }

  function collectConnectedKeys(startKey, neighbors) {
    var queue = [startKey];
    var seen = Object.create(null);
    var orderedKeys = [];

    while (queue.length) {
      var key = queue.shift();
      if (seen[key]) continue;
      seen[key] = true;
      orderedKeys.push(key);

      var adjacency = neighbors[key] || [];
      for (var i = 0; i < adjacency.length; i++) {
        if (!seen[adjacency[i]]) {
          queue.push(adjacency[i]);
        }
      }
    }

    return orderedKeys;
  }

  function collectAllComponents(recordKeys, neighbors, recordMap) {
    var seen = Object.create(null);
    var components = [];

    for (var i = 0; i < recordKeys.length; i++) {
      var key = recordKeys[i];
      if (seen[key]) continue;

      var componentKeys = collectConnectedKeys(key, neighbors);
      var componentRecords = [];
      for (var j = 0; j < componentKeys.length; j++) {
        seen[componentKeys[j]] = true;
        componentRecords.push(recordMap[componentKeys[j]]);
      }
      components.push(componentRecords);
    }

    return components;
  }

  function orderLineageRecords(componentKeys, recordMap, predecessorByKey, successorByKey) {
    var componentSet = Object.create(null);
    var heads = [];
    var orderedKeys = [];
    var visited = Object.create(null);

    for (var i = 0; i < componentKeys.length; i++) {
      componentSet[componentKeys[i]] = true;
    }

    for (var j = 0; j < componentKeys.length; j++) {
      var key = componentKeys[j];
      var predecessor = predecessorByKey[key];
      if (!predecessor || !componentSet[predecessor]) {
        heads.push(key);
      }
    }

    if (heads.length !== 1) {
      return {
        ok: false,
        reason: heads.length === 0 ? REASONS.LINEAGE_INVALID : REASONS.AMBIGUOUS,
      };
    }

    var current = heads[0];
    while (current) {
      if (visited[current]) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      visited[current] = true;
      orderedKeys.push(current);

      var next = successorByKey[current];
      if (next && !componentSet[next]) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      current = next || null;
    }

    if (orderedKeys.length !== componentKeys.length) {
      return {
        ok: false,
        reason: REASONS.AMBIGUOUS,
      };
    }

    var orderedRecords = [];
    for (var k = 0; k < orderedKeys.length; k++) {
      orderedRecords.push(recordMap[orderedKeys[k]]);
    }

    return {
      ok: true,
      orderedKeys: orderedKeys,
      orderedRecords: orderedRecords,
    };
  }

  function buildComponent(records, startRecord, registryApi) {
    var recordMap = Object.create(null);
    var positionMap = Object.create(null);
    var predecessorByKey = Object.create(null);
    var successorByKey = Object.create(null);
    var neighbors = Object.create(null);
    var cardId = records.length ? records[0].cardId : null;
    var environment = records.length ? records[0].environment : null;
    var registryId = records.length ? records[0].registryId : null;

    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var positionKey = buildRecordPositionKey(registryApi, record.cardId, record.manifestId, record.revision);
      var manifestKey = buildManifestIdentityKey(registryApi, record.cardId, record.manifestId);

      if (!positionKey || !manifestKey) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      if (positionMap[positionKey]) {
        return {
          ok: false,
          reason: REASONS.DUPLICATE_POSITION,
        };
      }
      if (recordMap[manifestKey]) {
        return {
          ok: false,
          reason: REASONS.AMBIGUOUS,
        };
      }
      if (record.cardId !== cardId || record.environment !== environment || record.registryId !== registryId) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      if (record.revision === 1 ? record.previousManifestId !== null : !isNonemptyString(record.previousManifestId)) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      if (record.supersededByManifestId !== null && !isNonemptyString(record.supersededByManifestId)) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }

      positionMap[positionKey] = true;
      recordMap[manifestKey] = record;
      neighbors[manifestKey] = neighbors[manifestKey] || [];
    }

    var manifestKeys = Object.keys(recordMap);
    for (var j = 0; j < manifestKeys.length; j++) {
      var key = manifestKeys[j];
      var current = recordMap[key];

      if (current.previousManifestId !== null) {
        var predecessorKey = buildManifestIdentityKey(registryApi, current.cardId, current.previousManifestId);
        var predecessor = recordMap[predecessorKey];
        if (
          !predecessor
          || predecessor.environment !== current.environment
          || predecessor.registryId !== current.registryId
          || predecessor.cardId !== current.cardId
          || predecessor.revision + 1 !== current.revision
          || predecessor.supersededByManifestId !== current.manifestId
        ) {
          return {
            ok: false,
            reason: REASONS.LINEAGE_INVALID,
          };
        }
        predecessorByKey[key] = predecessorKey;
        if (successorByKey[predecessorKey] && successorByKey[predecessorKey] !== key) {
          return {
            ok: false,
            reason: REASONS.AMBIGUOUS,
          };
        }
        successorByKey[predecessorKey] = key;
        neighbors[key].push(predecessorKey);
        neighbors[predecessorKey] = neighbors[predecessorKey] || [];
        neighbors[predecessorKey].push(key);
      }

      if (current.supersededByManifestId !== null) {
        var successorKey = buildManifestIdentityKey(registryApi, current.cardId, current.supersededByManifestId);
        var successor = recordMap[successorKey];
        if (
          !successor
          || successor.environment !== current.environment
          || successor.registryId !== current.registryId
          || successor.cardId !== current.cardId
          || successor.revision !== current.revision + 1
          || successor.previousManifestId !== current.manifestId
        ) {
          return {
            ok: false,
            reason: REASONS.LINEAGE_INVALID,
          };
        }
        if (predecessorByKey[successorKey] && predecessorByKey[successorKey] !== key) {
          return {
            ok: false,
            reason: REASONS.AMBIGUOUS,
          };
        }
        predecessorByKey[successorKey] = key;
        if (successorByKey[key] && successorByKey[key] !== successorKey) {
          return {
            ok: false,
            reason: REASONS.AMBIGUOUS,
          };
        }
        successorByKey[key] = successorKey;
        neighbors[key].push(successorKey);
        neighbors[successorKey] = neighbors[successorKey] || [];
        neighbors[successorKey].push(key);
      }
    }

    var visiting = Object.create(null);
    var visited = Object.create(null);
    function walkDirected(key) {
      if (visiting[key]) {
        return false;
      }
      if (visited[key]) {
        return true;
      }
      visiting[key] = true;
      var next = successorByKey[key];
      if (next && !walkDirected(next)) {
        return false;
      }
      visiting[key] = false;
      visited[key] = true;
      return true;
    }

    for (var k = 0; k < manifestKeys.length; k++) {
      if (!visited[manifestKeys[k]] && !walkDirected(manifestKeys[k])) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
    }

    var selectedKeys;
    var components = [];
    if (startRecord === null) {
      components = collectAllComponents(manifestKeys, neighbors, recordMap);
      if (components.length !== 1) {
        return {
          ok: false,
          reason: REASONS.AMBIGUOUS,
        };
      }
      selectedKeys = [];
      for (var m = 0; m < components[0].length; m++) {
        selectedKeys.push(buildManifestIdentityKey(registryApi, components[0][m].cardId, components[0][m].manifestId));
      }
    } else {
      var startKey = buildManifestIdentityKey(registryApi, startRecord.cardId, startRecord.manifestId);
      if (!recordMap[startKey]) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      selectedKeys = collectConnectedKeys(startKey, neighbors);
    }

    var ordering = orderLineageRecords(selectedKeys, recordMap, predecessorByKey, successorByKey);
    if (!ordering.ok) {
      return {
        ok: false,
        reason: ordering.reason,
      };
    }

    var selectedComponentRecords = [];
    for (var n = 0; n < selectedKeys.length; n++) {
      selectedComponentRecords.push(recordMap[selectedKeys[n]]);
    }

    return {
      ok: true,
      componentCount: startRecord === null ? components.length : 1,
      selectedComponentRecords: selectedComponentRecords,
      lineageOrderedRecords: ordering.orderedRecords,
      lineageOrderedKeys: ordering.orderedKeys,
      registryOrderedRecords: sortRecordsByRegistryVersion(selectedComponentRecords),
      registryId: registryId,
      environment: environment,
      cardId: cardId,
      recordMap: recordMap,
      predecessorByKey: predecessorByKey,
      successorByKey: successorByKey,
    };
  }

  function analyzeIntervalsAndStatuses(selectedRecords) {
    var observedCardStatuses = [];
    var observedManifestStatuses = [];
    var seenCardStatuses = Object.create(null);
    var seenManifestStatuses = Object.create(null);

    for (var i = 0; i < selectedRecords.length; i++) {
      var current = selectedRecords[i];
      var currentFrom = parseStrictUtcTimestamp(current.effectiveFrom);
      var currentUntil = current.effectiveUntil === null ? null : parseStrictUtcTimestamp(current.effectiveUntil);

      if (currentFrom === null || (current.effectiveUntil !== null && currentUntil === null)) {
        return {
          ok: false,
          reason: REASONS.LINEAGE_INVALID,
        };
      }
      if (currentUntil !== null && currentUntil <= currentFrom) {
        return {
          ok: false,
          reason: REASONS.INTERVAL_CONFLICT,
        };
      }

      if (!seenCardStatuses[current.cardStatus]) {
        seenCardStatuses[current.cardStatus] = true;
        observedCardStatuses.push(current.cardStatus);
      }
      if (!seenManifestStatuses[current.manifestStatus]) {
        seenManifestStatuses[current.manifestStatus] = true;
        observedManifestStatuses.push(current.manifestStatus);
      }
    }

    for (var leftIndex = 0; leftIndex < selectedRecords.length; leftIndex++) {
      for (var rightIndex = leftIndex + 1; rightIndex < selectedRecords.length; rightIndex++) {
        var left = selectedRecords[leftIndex];
        var right = selectedRecords[rightIndex];
        var leftFrom = parseStrictUtcTimestamp(left.effectiveFrom);
        var leftUntil = left.effectiveUntil === null ? null : parseStrictUtcTimestamp(left.effectiveUntil);
        var rightFrom = parseStrictUtcTimestamp(right.effectiveFrom);
        var rightUntil = right.effectiveUntil === null ? null : parseStrictUtcTimestamp(right.effectiveUntil);

        if (leftFrom === null || rightFrom === null || (left.effectiveUntil !== null && leftUntil === null) || (right.effectiveUntil !== null && rightUntil === null)) {
          return {
            ok: false,
            reason: REASONS.LINEAGE_INVALID,
          };
        }

        var leftEnd = leftUntil === null ? Number.POSITIVE_INFINITY : leftUntil;
        var rightEnd = rightUntil === null ? Number.POSITIVE_INFINITY : rightUntil;
        var sameInterval = leftFrom === rightFrom && leftEnd === rightEnd;
        var overlaps = leftFrom < rightEnd && rightFrom < leftEnd;

        if (sameInterval) {
          if (left.recordId !== right.recordId) {
            if (left.cardStatus !== right.cardStatus || left.manifestStatus !== right.manifestStatus) {
              return {
                ok: false,
                reason: REASONS.STATUS_CONFLICT,
              };
            }
            return {
              ok: false,
              reason: REASONS.AMBIGUOUS,
            };
          }
        } else if (overlaps) {
          return {
            ok: false,
            reason: REASONS.INTERVAL_CONFLICT,
          };
        }
      }
    }

    return {
      ok: true,
      observedCardStatuses: freezeStringArray(observedCardStatuses),
      observedManifestStatuses: freezeStringArray(observedManifestStatuses),
    };
  }

  function uniqueStrings(values) {
    var seen = Object.create(null);
    var unique = [];
    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (!seen[value]) {
        seen[value] = true;
        unique.push(value);
      }
    }
    return unique;
  }

  function sortRecordsByRegistryVersion(records) {
    return records.slice().sort(function (left, right) {
      return left.registryVersion - right.registryVersion;
    });
  }

  function buildSelectionResult(proof, request, componentInfo, requestedRecord, registryApi) {
    var lineageOrderedRecords = componentInfo.lineageOrderedRecords;
    var registryOrderedRecords = componentInfo.registryOrderedRecords;
    var recordPositionKeys = [];
    var manifestIdentityKeys = [];
    var highestRegistryVersion = 0;
    var highestRevision = 0;
    var requestIndex = -1;

    for (var i = 0; i < lineageOrderedRecords.length; i++) {
      var record = lineageOrderedRecords[i];
      recordPositionKeys.push(buildRecordPositionKey(registryApi, record.cardId, record.manifestId, record.revision));
      manifestIdentityKeys.push(buildManifestIdentityKey(registryApi, record.cardId, record.manifestId));
      if (record.registryVersion > highestRegistryVersion) highestRegistryVersion = record.registryVersion;
      if (record.revision > highestRevision) highestRevision = record.revision;
      if (requestedRecord && record === requestedRecord) {
        requestIndex = i;
      }
    }

    if (requestedRecord && requestIndex < 0) {
      return makeConflict(
        OUTCOMES.LIFECYCLE_EVIDENCE_LINEAGE_INVALID,
        REASONS.LINEAGE_INVALID,
        request,
        proof
      );
    }

    var intervalStatusAnalysis = analyzeIntervalsAndStatuses(lineageOrderedRecords);
    if (!intervalStatusAnalysis.ok) {
      var conflictIds = freezeStringArray(lineageOrderedRecords.map(function (item) {
        return item.recordId;
      }));
      var conflictManifestIds = freezeStringArray(lineageOrderedRecords.map(function (item) {
        return item.manifestId;
      }));
      return makeConflict(
        intervalStatusAnalysis.reason === REASONS.STATUS_CONFLICT
          ? OUTCOMES.LIFECYCLE_EVIDENCE_STATUS_CONFLICT
          : intervalStatusAnalysis.reason === REASONS.INTERVAL_CONFLICT
            ? OUTCOMES.LIFECYCLE_EVIDENCE_INTERVAL_CONFLICT
            : OUTCOMES.LIFECYCLE_EVIDENCE_AMBIGUOUS,
        intervalStatusAnalysis.reason,
        request,
        proof,
        {
          conflictRecordIds: conflictIds,
          conflictManifestIds: conflictManifestIds,
          observedCardStatuses: freezeStringArray(uniqueStrings(lineageOrderedRecords.map(function (item) {
            return item.cardStatus;
          }))),
          observedManifestStatuses: freezeStringArray(uniqueStrings(lineageOrderedRecords.map(function (item) {
            return item.manifestStatus;
          }))),
        }
      );
    }

    var predecessorRecords = requestedRecord ? lineageOrderedRecords.slice(0, requestIndex) : [];
    var successorRecords = requestedRecord ? lineageOrderedRecords.slice(requestIndex + 1) : [];

    var lineage = freezeDeep({
      cardId: request.cardId,
      requestedManifestId: request.requestedManifestId,
      registryId: proof.registryId,
      registryVersion: proof.registryVersion,
      connectedComponentCount: componentInfo.componentCount,
      selectedRecordCount: lineageOrderedRecords.length,
      rootManifestId: lineageOrderedRecords.length ? lineageOrderedRecords[0].manifestId : null,
      tipManifestId: lineageOrderedRecords.length ? lineageOrderedRecords[lineageOrderedRecords.length - 1].manifestId : null,
      highestRegistryVersion: highestRegistryVersion,
      highestRevision: highestRevision,
      lineageDepth: lineageOrderedRecords.length,
      hasPredecessor: lineageOrderedRecords.length ? lineageOrderedRecords[0].previousManifestId !== null : false,
      hasSuccessor: lineageOrderedRecords.length ? lineageOrderedRecords[lineageOrderedRecords.length - 1].supersededByManifestId !== null : false,
      effectiveIntervalCount: lineageOrderedRecords.length,
      observedCardStatuses: intervalStatusAnalysis.observedCardStatuses,
      observedManifestStatuses: intervalStatusAnalysis.observedManifestStatuses,
      recordPositionKeys: freezeStringArray(recordPositionKeys),
      manifestIdentityKeys: freezeStringArray(manifestIdentityKeys),
      registryPositionKey: buildRegistryPositionKey(registryApi, proof.registryId, proof.registryVersion),
      registryOrderedRecordIds: freezeStringArray(registryOrderedRecords.map(function (item) {
        return item.recordId;
      })),
      lineageOrderedRecordIds: freezeStringArray(lineageOrderedRecords.map(function (item) {
        return item.recordId;
      })),
    });

    return freezeDeep({
      fact: TOP_LEVEL_FACTS.SELECTED,
      outcome: OUTCOMES.LIFECYCLE_EVIDENCE_SELECTED,
      selected: true,
      operationallyResolved: false,
      presentationEligible: false,
      executionEligible: false,
      registryId: proof.registryId,
      registryVersion: proof.registryVersion,
      cardId: request.cardId,
      requestedManifestId: request.requestedManifestId,
      selectedRecordCount: lineageOrderedRecords.length,
      requestedRecord: requestedRecord || null,
      selectedRecords: freezeDeep(lineageOrderedRecords.slice()),
      lineageOrderedRecords: freezeDeep(lineageOrderedRecords.slice()),
      registryOrderedRecords: freezeDeep(registryOrderedRecords.slice()),
      predecessorRecords: freezeDeep(predecessorRecords.slice()),
      successorRecords: freezeDeep(successorRecords.slice()),
      lineage: lineage,
    });
  }

  function makeNotFound(outcome, reason, request, proof) {
    return outcomeFactory(TOP_LEVEL_FACTS.NOT_FOUND, outcome, reason, {
      registryId: proof.registryId,
      registryVersion: proof.registryVersion,
      cardId: request.cardId,
      requestedManifestId: request.requestedManifestId,
      selectedRecordCount: 0,
    });
  }

  function makeConflict(outcome, reason, request, proof, extra) {
    var payload = {
      registryId: proof.registryId,
      registryVersion: proof.registryVersion,
      cardId: request.cardId,
      requestedManifestId: request.requestedManifestId,
      selectedRecordCount: 0,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        payload[key] = extra[key];
      });
    }
    return outcomeFactory(TOP_LEVEL_FACTS.CONFLICT, outcome, reason, payload);
  }

  function selectLifecycleEvidence(bundleProof, request) {
    var bundleApi = getBundleVerificationApi();
    var registryApi = getRegistryApi();
    var proofValidation = validateBundleProof(bundleProof, bundleApi, registryApi);
    if (!proofValidation.ok) {
      return makeConflict(
        OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID,
        proofValidation.reason,
        { cardId: null, requestedManifestId: null },
        { registryId: null, registryVersion: null }
      );
    }

    var requestValidation;
    try {
      requestValidation = validateSelectionRequest(request);
    } catch (error) {
      requestValidation = {
        ok: false,
        reason: REASONS.REQUEST_INVALID,
      };
    }
    if (!requestValidation.ok) {
      return makeConflict(
        OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID,
        requestValidation.reason,
        { cardId: null, requestedManifestId: null },
        { registryId: proofValidation.registryId, registryVersion: proofValidation.registryVersion }
      );
    }

    var cardRecords = [];
    for (var i = 0; i < proofValidation.records.length; i++) {
      if (proofValidation.records[i].cardId === requestValidation.cardId) {
        cardRecords.push(proofValidation.records[i]);
      }
    }

    if (!cardRecords.length) {
      return makeNotFound(
        OUTCOMES.LIFECYCLE_EVIDENCE_CARD_NOT_FOUND,
        REASONS.CARD_NOT_FOUND,
        requestValidation,
        proofValidation
      );
    }

    if (requestValidation.requestedManifestId === null) {
      var componentAnalysis = buildComponent(cardRecords, null, registryApi);
      if (!componentAnalysis.ok) {
        return makeConflict(
          componentAnalysis.reason === REASONS.DUPLICATE_POSITION
            ? OUTCOMES.LIFECYCLE_EVIDENCE_DUPLICATE_POSITION
            : componentAnalysis.reason === REASONS.LINEAGE_INVALID
              ? OUTCOMES.LIFECYCLE_EVIDENCE_LINEAGE_INVALID
              : OUTCOMES.LIFECYCLE_EVIDENCE_AMBIGUOUS,
          componentAnalysis.reason,
          requestValidation,
          proofValidation
        );
      }
      return buildSelectionResult(
        proofValidation,
        requestValidation,
        componentAnalysis,
        null,
        registryApi
      );
    }

    var manifestMatches = [];
    for (var j = 0; j < cardRecords.length; j++) {
      if (cardRecords[j].manifestId === requestValidation.requestedManifestId) {
        manifestMatches.push(cardRecords[j]);
      }
    }

    if (!manifestMatches.length) {
      return makeNotFound(
        OUTCOMES.LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND,
        REASONS.MANIFEST_NOT_FOUND,
        requestValidation,
        proofValidation
      );
    }

    if (manifestMatches.length !== 1) {
      var manifestPositionMap = Object.create(null);
      for (var positionIndex = 0; positionIndex < manifestMatches.length; positionIndex++) {
        var manifestMatch = manifestMatches[positionIndex];
        var duplicatePositionKey = buildRecordPositionKey(
          registryApi,
          manifestMatch.cardId,
          manifestMatch.manifestId,
          manifestMatch.revision
        );
        if (manifestPositionMap[duplicatePositionKey]) {
          return makeConflict(
            OUTCOMES.LIFECYCLE_EVIDENCE_DUPLICATE_POSITION,
            REASONS.DUPLICATE_POSITION,
            requestValidation,
            proofValidation,
            {
              conflictRecordIds: freezeStringArray([
                manifestPositionMap[duplicatePositionKey].recordId,
                manifestMatch.recordId,
              ]),
            }
          );
        }
        manifestPositionMap[duplicatePositionKey] = manifestMatch;
      }
      return makeConflict(
        OUTCOMES.LIFECYCLE_EVIDENCE_AMBIGUOUS,
        REASONS.AMBIGUOUS,
        requestValidation,
        proofValidation,
        {
          conflictRecordIds: freezeStringArray(manifestMatches.map(function (item) {
            return item.recordId;
          })),
        }
      );
    }

    var requestedRecord = manifestMatches[0];
    var manifestComponentAnalysis = buildComponent(cardRecords, requestedRecord, registryApi);
    if (!manifestComponentAnalysis.ok) {
      return makeConflict(
        manifestComponentAnalysis.reason === REASONS.DUPLICATE_POSITION
          ? OUTCOMES.LIFECYCLE_EVIDENCE_DUPLICATE_POSITION
          : manifestComponentAnalysis.reason === REASONS.LINEAGE_INVALID
            ? OUTCOMES.LIFECYCLE_EVIDENCE_LINEAGE_INVALID
            : OUTCOMES.LIFECYCLE_EVIDENCE_AMBIGUOUS,
        manifestComponentAnalysis.reason,
        requestValidation,
        proofValidation
      );
    }

    return buildSelectionResult(
      proofValidation,
      requestValidation,
      manifestComponentAnalysis,
      requestedRecord,
      registryApi
    );
  }

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION', {
    value: Object.freeze({
      TOP_LEVEL_FACTS: TOP_LEVEL_FACTS,
      OUTCOMES: OUTCOMES,
      selectLifecycleEvidence: selectLifecycleEvidence,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
