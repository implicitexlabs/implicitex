/* coin-card-lifecycle-resolution.js — Coin Card lifecycle resolution
 *
 * This module interprets one selected lifecycle-evidence result from the
 * protected selector authority. It does not authenticate records, validate raw
 * bundles, select evidence, authorize presentation, or authorize execution.
 */

(function () {
  'use strict';

  var TOP_LEVEL_FACTS = Object.freeze({
    SELECTED: 'SELECTED',
    RESOLVED: 'RESOLVED',
    NOT_EFFECTIVE: 'NOT_EFFECTIVE',
    TERMINAL: 'TERMINAL',
    UNAVAILABLE: 'UNAVAILABLE',
  });

  var OUTCOMES = Object.freeze({
    LIFECYCLE_ACTIVE: 'LIFECYCLE_ACTIVE',
    LIFECYCLE_CARD_SUSPENDED: 'LIFECYCLE_CARD_SUSPENDED',
    LIFECYCLE_NOT_YET_EFFECTIVE: 'LIFECYCLE_NOT_YET_EFFECTIVE',
    LIFECYCLE_EXPIRED: 'LIFECYCLE_EXPIRED',
    LIFECYCLE_TEMPORAL_GAP: 'LIFECYCLE_TEMPORAL_GAP',
    LIFECYCLE_CARD_REVOKED: 'LIFECYCLE_CARD_REVOKED',
    LIFECYCLE_MANIFEST_REVOKED: 'LIFECYCLE_MANIFEST_REVOKED',
    LIFECYCLE_MANIFEST_SUPERSEDED: 'LIFECYCLE_MANIFEST_SUPERSEDED',
    LIFECYCLE_RESOLUTION_INPUT_INVALID: 'LIFECYCLE_RESOLUTION_INPUT_INVALID',
    LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE: 'LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE',
    LIFECYCLE_RESOLUTION_TIME_INVALID: 'LIFECYCLE_RESOLUTION_TIME_INVALID',
    LIFECYCLE_RESOLUTION_AMBIGUOUS: 'LIFECYCLE_RESOLUTION_AMBIGUOUS',
    LIFECYCLE_RESOLUTION_STATUS_INVALID: 'LIFECYCLE_RESOLUTION_STATUS_INVALID',
  });

  var REASONS = Object.freeze({
    AUTHORITY_UNAVAILABLE: 'resolution-authority-unavailable',
    INPUT_INVALID: 'resolution-input-invalid',
    TIME_INVALID: 'resolution-time-invalid',
    AMBIGUOUS: 'resolution-ambiguous',
    STATUS_INVALID: 'resolution-status-invalid',
  });

  var RESOLUTION_REGISTRY_ID = 'implicitex-production';
  var RESOLUTION_CARD_STATUS = Object.freeze({
    CARD_ACTIVE: true,
    CARD_SUSPENDED: true,
    CARD_REVOKED: true,
  });
  var RESOLUTION_MANIFEST_STATUS = Object.freeze({
    MANIFEST_CURRENT: true,
    MANIFEST_REVOKED: true,
    MANIFEST_SUPERSEDED: true,
  });

  var SELECTED_RESULT_FIELDS = Object.freeze([
    'fact',
    'outcome',
    'selected',
    'operationallyResolved',
    'presentationEligible',
    'executionEligible',
    'registryId',
    'registryVersion',
    'cardId',
    'requestedManifestId',
    'selectedRecordCount',
    'requestedRecord',
    'selectedRecords',
    'lineageOrderedRecords',
    'registryOrderedRecords',
    'predecessorRecords',
    'successorRecords',
    'lineage',
  ]);

  var RESOLVED_RESULT_FIELDS = Object.freeze([
    'fact',
    'outcome',
    'operationallyResolved',
    'presentationEligible',
    'executionEligible',
    'resolutionTime',
    'registryId',
    'registryVersion',
    'cardId',
    'requestedManifestId',
    'resolvedRecord',
    'resolvedRecordId',
    'resolvedManifestId',
    'resolvedRevision',
    'temporalState',
    'cardStatus',
    'manifestStatus',
    'supportingLineage',
    'reason',
  ]);

  var RESOLUTION_RESULTS = new WeakSet();

  function getSelectionApi() {
    return window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION || null;
  }

  function isPlainObjectContainer(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function isArrayIndexName(name, length) {
    if (!/^(0|[1-9]\d*)$/.test(name)) return false;
    var index = Number(name);
    return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === name;
  }

  function getOwnDataPropertyNames(value) {
    try {
      if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;
    } catch (error) {
      return null;
    }

    var names;
    try {
      names = Object.getOwnPropertyNames(value);
    } catch (error) {
      return null;
    }

    if (Array.isArray(value)) {
      var lengthDescriptor;
      try {
        lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      } catch (error) {
        return null;
      }
      if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')) return null;

      var indexNames = [];
      for (var i = 0; i < names.length; i++) {
        var arrayName = names[i];
        if (arrayName === 'length') continue;

        var arrayDescriptor;
        try {
          arrayDescriptor = Object.getOwnPropertyDescriptor(value, arrayName);
        } catch (error) {
          return null;
        }

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
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, name);
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

  function isDeepFrozenPlainData(value, activePath, validated) {
    if (!value || typeof value !== 'object') return true;
    if (!Object.isFrozen(value)) return false;
    if (!isPlainObjectContainer(value) && !Array.isArray(value)) return false;

    var keys = getOwnDataPropertyNames(value);
    if (!keys) return false;

    var active = activePath || [];
    var validatedValues = validated || [];
    if (validatedValues.indexOf(value) !== -1) return true;
    if (active.indexOf(value) !== -1) return false;
    active.push(value);

    for (var i = 0; i < keys.length; i++) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, keys[i]);
      } catch (error) {
        return false;
      }
      if (!descriptor || !isDeepFrozenPlainData(descriptor.value, active, validatedValues)) return false;
    }

    active.pop();
    validatedValues.push(value);
    return true;
  }

  function freezeDeep(value, seen) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return value;
    visited.push(value);

    Object.getOwnPropertyNames(value).forEach(function (key) {
      freezeDeep(value[key], visited);
    });
    return Object.freeze(value);
  }

  function isSafePositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0);
  }

  function isNonemptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function parseStrictUtcTimestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    if (new Date(milliseconds).toISOString() !== value) return null;
    return milliseconds;
  }

  function hasExactFields(value, fields) {
    var ownFields = getOwnDataPropertyNames(value);
    if (!ownFields || ownFields.length !== fields.length) return false;
    var actualSorted = ownFields.slice().sort();
    var expectedSorted = fields.slice().sort();
    for (var i = 0; i < expectedSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) return false;
    }
    return true;
  }

  function cloneArray(values) {
    return values.slice();
  }

  function isResolvedLifecycleResult(value) {
    try {
      return RESOLUTION_RESULTS.has(value);
    } catch (error) {
      return false;
    }
  }

  function makeBaseResult(fact, outcome, reason, extra) {
    var result = {
      fact: fact,
      outcome: outcome,
      operationallyResolved: false,
      presentationEligible: false,
      executionEligible: false,
      resolutionTime: null,
      registryId: null,
      registryVersion: null,
      cardId: null,
      requestedManifestId: null,
      resolvedRecord: null,
      resolvedRecordId: null,
      resolvedManifestId: null,
      resolvedRevision: null,
      temporalState: null,
      cardStatus: null,
      manifestStatus: null,
      supportingLineage: null,
      reason: reason || null,
    };

    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }

    return freezeDeep(result);
  }

  function makeUnavailable(outcome, reason, extra) {
    return makeBaseResult(TOP_LEVEL_FACTS.UNAVAILABLE, outcome, reason, extra);
  }

  function makeResolved(fact, outcome, temporalState, resolutionTime, proof, resolvedRecord, supportingLineage) {
    var result = {
      fact: fact,
      outcome: outcome,
      operationallyResolved: true,
      presentationEligible: false,
      executionEligible: false,
      resolutionTime: resolutionTime,
      registryId: proof.registryId,
      registryVersion: proof.registryVersion,
      cardId: proof.cardId,
      requestedManifestId: proof.requestedManifestId,
      resolvedRecord: resolvedRecord || null,
      resolvedRecordId: resolvedRecord ? resolvedRecord.recordId : null,
      resolvedManifestId: resolvedRecord ? resolvedRecord.manifestId : null,
      resolvedRevision: resolvedRecord ? resolvedRecord.revision : null,
      temporalState: temporalState,
      cardStatus: resolvedRecord ? resolvedRecord.cardStatus : null,
      manifestStatus: resolvedRecord ? resolvedRecord.manifestStatus : null,
      supportingLineage: supportingLineage,
      reason: null,
    };

    var frozenResult = freezeDeep(result);
    RESOLUTION_RESULTS.add(frozenResult);
    return frozenResult;
  }

  function buildSupportingLineage(selectionProof) {
    return freezeDeep({
      selectedRecordCount: selectionProof.selectedRecordCount,
      requestedRecord: selectionProof.requestedManifestId === null ? null : selectionProof.requestedRecord,
      selectedRecords: cloneArray(selectionProof.selectedRecords),
      lineageOrderedRecords: cloneArray(selectionProof.lineageOrderedRecords),
      registryOrderedRecords: cloneArray(selectionProof.registryOrderedRecords),
      predecessorRecords: cloneArray(selectionProof.predecessorRecords),
      successorRecords: cloneArray(selectionProof.successorRecords),
      lineage: selectionProof.lineage,
    });
  }

  function validateSelectedEvidence(selectedEvidence, selectorApi) {
    if (
      !selectorApi
      || typeof selectorApi.isSelectedLifecycleEvidenceResult !== 'function'
    ) {
      return {
        ok: false,
        reason: REASONS.AUTHORITY_UNAVAILABLE,
      };
    }

    try {
      if (selectorApi.isSelectedLifecycleEvidenceResult(selectedEvidence) !== true) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
    } catch (error) {
      return {
        ok: false,
        reason: REASONS.AUTHORITY_UNAVAILABLE,
      };
    }

    try {
      if (
        !selectedEvidence
        || typeof selectedEvidence !== 'object'
        || Array.isArray(selectedEvidence)
        || !Object.isFrozen(selectedEvidence)
        || !hasExactFields(selectedEvidence, SELECTED_RESULT_FIELDS)
        || selectedEvidence.fact !== TOP_LEVEL_FACTS.SELECTED
        || selectedEvidence.outcome !== 'LIFECYCLE_EVIDENCE_SELECTED'
        || selectedEvidence.selected !== true
        || selectedEvidence.operationallyResolved !== false
        || selectedEvidence.presentationEligible !== false
        || selectedEvidence.executionEligible !== false
        || selectedEvidence.registryId !== RESOLUTION_REGISTRY_ID
        || !isSafePositiveInteger(selectedEvidence.registryVersion)
        || !isNonemptyString(selectedEvidence.cardId)
        || (
          selectedEvidence.requestedManifestId !== null
          && !isNonemptyString(selectedEvidence.requestedManifestId)
        )
        || !isSafePositiveInteger(selectedEvidence.selectedRecordCount)
        || !Object.isFrozen(selectedEvidence.selectedRecords)
        || !Object.isFrozen(selectedEvidence.lineageOrderedRecords)
        || !Object.isFrozen(selectedEvidence.registryOrderedRecords)
        || !Object.isFrozen(selectedEvidence.predecessorRecords)
        || !Object.isFrozen(selectedEvidence.successorRecords)
        || !Object.isFrozen(selectedEvidence.lineage)
        || !Array.isArray(selectedEvidence.selectedRecords)
        || !Array.isArray(selectedEvidence.lineageOrderedRecords)
        || !Array.isArray(selectedEvidence.registryOrderedRecords)
        || !Array.isArray(selectedEvidence.predecessorRecords)
        || !Array.isArray(selectedEvidence.successorRecords)
        || !isDeepFrozenPlainData(selectedEvidence.selectedRecords)
        || !isDeepFrozenPlainData(selectedEvidence.lineageOrderedRecords)
        || !isDeepFrozenPlainData(selectedEvidence.registryOrderedRecords)
        || !isDeepFrozenPlainData(selectedEvidence.predecessorRecords)
        || !isDeepFrozenPlainData(selectedEvidence.successorRecords)
        || !isDeepFrozenPlainData(selectedEvidence.lineage)
        || selectedEvidence.selectedRecords.length !== selectedEvidence.selectedRecordCount
        || selectedEvidence.lineageOrderedRecords.length !== selectedEvidence.selectedRecordCount
        || selectedEvidence.registryOrderedRecords.length !== selectedEvidence.selectedRecordCount
        || selectedEvidence.selectedRecords.length !== selectedEvidence.lineageOrderedRecords.length
      ) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
    } catch (error) {
      return {
        ok: false,
        reason: REASONS.INPUT_INVALID,
      };
    }

    for (var i = 0; i < selectedEvidence.selectedRecords.length; i++) {
      var selectedRecord = selectedEvidence.selectedRecords[i];
      var lineageRecord = selectedEvidence.lineageOrderedRecords[i];
      if (selectedRecord !== lineageRecord) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      if (
        !selectedRecord
        || typeof selectedRecord !== 'object'
        || Array.isArray(selectedRecord)
        || !Object.isFrozen(selectedRecord)
        || !isDeepFrozenPlainData(selectedRecord)
      ) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      if (
        !hasExactFields(selectedRecord, [
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
        ])
        || selectedRecord.registryId !== selectedEvidence.registryId
        || selectedRecord.cardId !== selectedEvidence.cardId
        || selectedRecord.environment !== 'production'
        || !isNonemptyString(selectedRecord.recordId)
        || !isSafePositiveInteger(selectedRecord.registryVersion)
        || !isSafePositiveInteger(selectedRecord.revision)
      ) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
    }

    var selectedRecordIds = Object.create(null);
    var registryRecordIds = Object.create(null);
    for (var j = 0; j < selectedEvidence.registryOrderedRecords.length; j++) {
      var registryRecord = selectedEvidence.registryOrderedRecords[j];
      if (
        !registryRecord
        || typeof registryRecord !== 'object'
        || Array.isArray(registryRecord)
        || !Object.isFrozen(registryRecord)
        || !isDeepFrozenPlainData(registryRecord)
        || registryRecord.registryId !== selectedEvidence.registryId
        || registryRecord.cardId !== selectedEvidence.cardId
        || registryRecord.environment !== 'production'
        || !isNonemptyString(registryRecord.recordId)
      ) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      if (registryRecordIds[registryRecord.recordId]) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      registryRecordIds[registryRecord.recordId] = true;
    }

    if (selectedEvidence.requestedManifestId === null) {
      if (selectedEvidence.requestedRecord !== null) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      if (
        selectedEvidence.predecessorRecords.length !== 0
        || selectedEvidence.successorRecords.length !== 0
      ) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
    } else {
      var requestIndex = -1;
      for (var k = 0; k < selectedEvidence.lineageOrderedRecords.length; k++) {
        if (selectedEvidence.lineageOrderedRecords[k] === selectedEvidence.requestedRecord) {
          requestIndex = k;
          break;
        }
      }
      if (requestIndex < 0) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      if (
        selectedEvidence.predecessorRecords.length !== requestIndex
        || selectedEvidence.successorRecords.length !== selectedEvidence.lineageOrderedRecords.length - requestIndex - 1
      ) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      for (var p = 0; p < selectedEvidence.predecessorRecords.length; p++) {
        if (selectedEvidence.predecessorRecords[p] !== selectedEvidence.lineageOrderedRecords[p]) {
          return {
            ok: false,
            reason: REASONS.INPUT_INVALID,
          };
        }
      }
      for (var q = 0; q < selectedEvidence.successorRecords.length; q++) {
        if (
          selectedEvidence.successorRecords[q]
          !== selectedEvidence.lineageOrderedRecords[requestIndex + q + 1]
        ) {
          return {
            ok: false,
            reason: REASONS.INPUT_INVALID,
          };
        }
      }
    }

    var recordIds = Object.create(null);
    for (var r = 0; r < selectedEvidence.selectedRecords.length; r++) {
      var recordId = selectedEvidence.selectedRecords[r].recordId;
      if (recordIds[recordId]) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
      recordIds[recordId] = true;
      selectedRecordIds[recordId] = true;
    }

    for (var s = 0; s < selectedEvidence.selectedRecords.length; s++) {
      var selectedRecordId = selectedEvidence.selectedRecords[s].recordId;
      if (!registryRecordIds[selectedRecordId]) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
    }
    for (var t = 0; t < selectedEvidence.registryOrderedRecords.length; t++) {
      var registryOrderedRecordId = selectedEvidence.registryOrderedRecords[t].recordId;
      if (!selectedRecordIds[registryOrderedRecordId]) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }
    }

    if (selectedEvidence.requestedManifestId !== null && !selectedEvidence.requestedRecord) {
      return {
        ok: false,
        reason: REASONS.INPUT_INVALID,
      };
    }

    return {
      ok: true,
      proof: selectedEvidence,
      registryId: selectedEvidence.registryId,
      registryVersion: selectedEvidence.registryVersion,
      cardId: selectedEvidence.cardId,
      requestedManifestId: selectedEvidence.requestedManifestId,
      requestedRecord: selectedEvidence.requestedRecord,
      selectedRecords: selectedEvidence.selectedRecords,
      lineageOrderedRecords: selectedEvidence.lineageOrderedRecords,
      registryOrderedRecords: selectedEvidence.registryOrderedRecords,
      predecessorRecords: selectedEvidence.predecessorRecords,
      successorRecords: selectedEvidence.successorRecords,
      lineage: selectedEvidence.lineage,
    };
  }

  function analyzeTemporalCoverage(records, resolutionMs) {
    var effectiveRecords = [];
    var earliestStart = Number.POSITIVE_INFINITY;
    var latestEnd = Number.NEGATIVE_INFINITY;
    var hasUnboundedEnd = false;

    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      var start = parseStrictUtcTimestamp(record.effectiveFrom);
      var end = record.effectiveUntil === null ? null : parseStrictUtcTimestamp(record.effectiveUntil);
      if (start === null || (record.effectiveUntil !== null && end === null) || (end !== null && end <= start)) {
        return {
          ok: false,
          reason: REASONS.INPUT_INVALID,
        };
      }

      if (start < earliestStart) earliestStart = start;
      if (end === null) {
        hasUnboundedEnd = true;
      } else if (end > latestEnd) {
        latestEnd = end;
      }

      if (start <= resolutionMs && (end === null || resolutionMs < end)) {
        effectiveRecords.push(record);
      }
    }

    if (effectiveRecords.length > 1) {
      return {
        ok: false,
        reason: REASONS.AMBIGUOUS,
      };
    }

    if (effectiveRecords.length === 1) {
      return {
        ok: true,
        temporalState: 'EFFECTIVE',
        resolvedRecord: effectiveRecords[0],
      };
    }

    if (resolutionMs < earliestStart) {
      return {
        ok: true,
        temporalState: 'NOT_YET_EFFECTIVE',
        resolvedRecord: null,
      };
    }

    if (!hasUnboundedEnd && resolutionMs >= latestEnd) {
      return {
        ok: true,
        temporalState: 'EXPIRED',
        resolvedRecord: null,
      };
    }

    return {
      ok: true,
      temporalState: 'TEMPORAL_GAP',
      resolvedRecord: null,
    };
  }

  function interpretStatus(record) {
    if (RESOLUTION_CARD_STATUS[record.cardStatus] !== true || RESOLUTION_MANIFEST_STATUS[record.manifestStatus] !== true) {
      if (record.cardStatus === 'CARD_REVOKED') {
        return {
          ok: true,
          fact: TOP_LEVEL_FACTS.TERMINAL,
          outcome: OUTCOMES.LIFECYCLE_CARD_REVOKED,
        };
      }
      if (record.cardStatus === 'CARD_SUSPENDED') {
        return {
          ok: true,
          fact: TOP_LEVEL_FACTS.RESOLVED,
          outcome: OUTCOMES.LIFECYCLE_CARD_SUSPENDED,
        };
      }
      if (record.manifestStatus === 'MANIFEST_REVOKED') {
        return {
          ok: true,
          fact: TOP_LEVEL_FACTS.TERMINAL,
          outcome: OUTCOMES.LIFECYCLE_MANIFEST_REVOKED,
        };
      }
      if (record.manifestStatus === 'MANIFEST_SUPERSEDED') {
        return {
          ok: true,
          fact: TOP_LEVEL_FACTS.TERMINAL,
          outcome: OUTCOMES.LIFECYCLE_MANIFEST_SUPERSEDED,
        };
      }
      if (record.cardStatus === 'CARD_ACTIVE' && record.manifestStatus === 'MANIFEST_CURRENT') {
        return {
          ok: true,
          fact: TOP_LEVEL_FACTS.RESOLVED,
          outcome: OUTCOMES.LIFECYCLE_ACTIVE,
        };
      }
      return {
        ok: false,
        reason: REASONS.STATUS_INVALID,
      };
    }

    if (record.cardStatus === 'CARD_REVOKED') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.TERMINAL,
        outcome: OUTCOMES.LIFECYCLE_CARD_REVOKED,
      };
    }
    if (record.cardStatus === 'CARD_SUSPENDED') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.RESOLVED,
        outcome: OUTCOMES.LIFECYCLE_CARD_SUSPENDED,
      };
    }
    if (record.manifestStatus === 'MANIFEST_REVOKED') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.TERMINAL,
        outcome: OUTCOMES.LIFECYCLE_MANIFEST_REVOKED,
      };
    }
    if (record.manifestStatus === 'MANIFEST_SUPERSEDED') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.TERMINAL,
        outcome: OUTCOMES.LIFECYCLE_MANIFEST_SUPERSEDED,
      };
    }
    if (record.cardStatus === 'CARD_ACTIVE' && record.manifestStatus === 'MANIFEST_CURRENT') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.RESOLVED,
        outcome: OUTCOMES.LIFECYCLE_ACTIVE,
      };
    }

    return {
      ok: false,
      reason: REASONS.STATUS_INVALID,
    };
  }

  function resolutionFromTemporalState(temporalState) {
    if (temporalState === 'NOT_YET_EFFECTIVE') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.NOT_EFFECTIVE,
        outcome: OUTCOMES.LIFECYCLE_NOT_YET_EFFECTIVE,
      };
    }
    if (temporalState === 'EXPIRED') {
      return {
        ok: true,
        fact: TOP_LEVEL_FACTS.TERMINAL,
        outcome: OUTCOMES.LIFECYCLE_EXPIRED,
      };
    }
    return {
      ok: true,
      fact: TOP_LEVEL_FACTS.NOT_EFFECTIVE,
      outcome: OUTCOMES.LIFECYCLE_TEMPORAL_GAP,
    };
  }

  function chooseCardOnlyResolvedRecord(records, resolutionMs) {
    var temporalCoverage = analyzeTemporalCoverage(records, resolutionMs);
    if (!temporalCoverage.ok) {
      return temporalCoverage;
    }

    if (temporalCoverage.temporalState === 'EFFECTIVE') {
      return {
        ok: true,
        temporalState: 'EFFECTIVE',
        resolvedRecord: temporalCoverage.resolvedRecord,
      };
    }

    return temporalCoverage;
  }

  function resolveLifecycle(selectedEvidence) {
    var selectorApi = getSelectionApi();
    var selectedValidation = validateSelectedEvidence(selectedEvidence, selectorApi);
    if (!selectedValidation.ok) {
      if (selectedValidation.reason === REASONS.AUTHORITY_UNAVAILABLE) {
        return makeUnavailable(
          OUTCOMES.LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE,
          REASONS.AUTHORITY_UNAVAILABLE
        );
      }
      return makeUnavailable(
        OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID,
        REASONS.INPUT_INVALID
      );
    }

    var resolutionTime;
    try {
      resolutionTime = new Date().toISOString();
    } catch (error) {
      return makeUnavailable(
        OUTCOMES.LIFECYCLE_RESOLUTION_TIME_INVALID,
        REASONS.TIME_INVALID
      );
    }

    var resolutionMs = parseStrictUtcTimestamp(resolutionTime);
    if (resolutionMs === null) {
      return makeUnavailable(
        OUTCOMES.LIFECYCLE_RESOLUTION_TIME_INVALID,
        REASONS.TIME_INVALID
      );
    }

    var supportingLineage = buildSupportingLineage(selectedValidation.proof);
    var requestedRecord = selectedValidation.requestedRecord;
    var resolvedRecord = null;
    var temporalState = null;
    var terminalOrResolved;

    if (selectedValidation.requestedManifestId !== null) {
      var requestedStart = parseStrictUtcTimestamp(requestedRecord.effectiveFrom);
      var requestedEnd = requestedRecord.effectiveUntil === null ? null : parseStrictUtcTimestamp(requestedRecord.effectiveUntil);
      if (
        requestedStart === null
        || (requestedRecord.effectiveUntil !== null && requestedEnd === null)
        || (requestedEnd !== null && requestedEnd <= requestedStart)
      ) {
        return makeUnavailable(
          OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID,
          REASONS.INPUT_INVALID
        );
      }
      if (resolutionMs < requestedStart) {
        terminalOrResolved = resolutionFromTemporalState('NOT_YET_EFFECTIVE');
      } else if (requestedEnd !== null && resolutionMs >= requestedEnd) {
        terminalOrResolved = resolutionFromTemporalState('EXPIRED');
      } else {
        resolvedRecord = requestedRecord;
        temporalState = 'EFFECTIVE';
        terminalOrResolved = interpretStatus(requestedRecord);
      }
      if (!terminalOrResolved.ok) {
        return makeUnavailable(
          OUTCOMES.LIFECYCLE_RESOLUTION_STATUS_INVALID,
          REASONS.STATUS_INVALID
        );
      }

      return makeResolved(
        terminalOrResolved.fact,
        terminalOrResolved.outcome,
        temporalState || (terminalOrResolved.outcome === OUTCOMES.LIFECYCLE_NOT_YET_EFFECTIVE ? 'NOT_YET_EFFECTIVE' : terminalOrResolved.outcome === OUTCOMES.LIFECYCLE_EXPIRED ? 'EXPIRED' : 'EFFECTIVE'),
        resolutionTime,
        selectedValidation.proof,
        resolvedRecord || requestedRecord,
        supportingLineage
      );
    }

    var cardOnlyCoverage = chooseCardOnlyResolvedRecord(selectedValidation.lineageOrderedRecords, resolutionMs);
    if (!cardOnlyCoverage.ok) {
      if (cardOnlyCoverage.reason === REASONS.AMBIGUOUS) {
        return makeUnavailable(
          OUTCOMES.LIFECYCLE_RESOLUTION_AMBIGUOUS,
          REASONS.AMBIGUOUS,
          {
            supportingLineage: supportingLineage,
          }
        );
      }
      if (cardOnlyCoverage.reason === REASONS.INPUT_INVALID) {
        return makeUnavailable(
          OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID,
          REASONS.INPUT_INVALID
        );
      }
      return makeUnavailable(
        OUTCOMES.LIFECYCLE_RESOLUTION_AMBIGUOUS,
        REASONS.AMBIGUOUS
      );
    }

    if (cardOnlyCoverage.temporalState !== 'EFFECTIVE') {
      terminalOrResolved = resolutionFromTemporalState(cardOnlyCoverage.temporalState);
      return makeResolved(
        terminalOrResolved.fact,
        terminalOrResolved.outcome,
        cardOnlyCoverage.temporalState,
        resolutionTime,
        selectedValidation.proof,
        null,
        supportingLineage
      );
    }

    resolvedRecord = cardOnlyCoverage.resolvedRecord;
    terminalOrResolved = interpretStatus(resolvedRecord);
    if (!terminalOrResolved.ok) {
      return makeUnavailable(
        OUTCOMES.LIFECYCLE_RESOLUTION_STATUS_INVALID,
        REASONS.STATUS_INVALID
      );
    }

    return makeResolved(
      terminalOrResolved.fact,
      terminalOrResolved.outcome,
      'EFFECTIVE',
      resolutionTime,
      selectedValidation.proof,
      resolvedRecord,
      supportingLineage
    );
  }

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_RESOLUTION', {
    value: Object.freeze({
      TOP_LEVEL_FACTS: TOP_LEVEL_FACTS,
      OUTCOMES: OUTCOMES,
      resolveLifecycle: resolveLifecycle,
      isResolvedLifecycleResult: isResolvedLifecycleResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
