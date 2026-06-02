(function (root, factory) {
  'use strict';

  const statusApi = root && root.IX && root.IX.transferStatus
    ? root.IX.transferStatus
    : (typeof require === 'function' ? require('./transfer-status.js') : null);
  const api = factory(statusApi);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.receiptSchema = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (statusApi) {
  'use strict';

  const RECEIPT_SCHEMA_VERSION = 'receipt.v1';
  const STATES = statusApi.IX_TRANSFER_STATES;

  // Latest-source provenance explains where a receipt fact came from. It does
  // not decide state strength or transition legality.
  const OBSERVATION_SOURCES = Object.freeze({
    LOCAL: 'local',
    WALLET: 'wallet',
    RPC: 'rpc',
    REHYDRATION: 'rehydration',
    MIGRATION: 'migration',
    IMPORT: 'import',
  });
  const OBSERVATION_SOURCE_VALUES = Object.freeze(Object.values(OBSERVATION_SOURCES));

  const DEFAULT_RECEIPT = Object.freeze({
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    id: null,
    state: STATES.READY,
    fundsMoved: null,
    sender: null,
    recipient: null,
    amount: null,
    fee: null,
    totalDebit: null,
    chainId: null,
    network: null,
    contractAddress: null,
    approvalHash: null,
    transferHash: null,
    hash: null,
    blockNumber: null,
    explorerUrl: null,
    purposeTag: '',
    referenceId: '',
    memo: '',
    createdAt: null,
    updatedAt: null,
    resolvedAt: null,
    lastKnownMessage: '',
    observationSource: OBSERVATION_SOURCES.LOCAL,
    lastObservedAt: null,
  });

  const NULLABLE_FIELDS = new Set([
    'id',
    'sender',
    'recipient',
    'amount',
    'fee',
    'totalDebit',
    'chainId',
    'network',
    'contractAddress',
    'approvalHash',
    'transferHash',
    'hash',
    'blockNumber',
    'explorerUrl',
    'createdAt',
    'updatedAt',
    'resolvedAt',
    'lastObservedAt',
  ]);

  function defaultReceipt(overrides) {
    return Object.assign({}, DEFAULT_RECEIPT, overrides || {});
  }

  function receiptObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function txHashOf(receipt) {
    return receipt && (receipt.transferHash || receipt.hash || receipt.transactionHash) || null;
  }

  function normalizeObservationSource(source, fallback) {
    if (OBSERVATION_SOURCE_VALUES.includes(source)) return source;
    return fallback || OBSERVATION_SOURCES.LOCAL;
  }

  function normalizeKnownFields(source) {
    const receipt = receiptObject(source);
    const normalized = defaultReceipt();

    Object.keys(DEFAULT_RECEIPT).forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(receipt, key)) return;
      const value = receipt[key];
      if (value === undefined) return;
      if (value === null && !NULLABLE_FIELDS.has(key)) return;
      normalized[key] = value;
    });

    // Normalize legacy/local records toward receipt.v1 without assuming that
    // missing facts are known.
    normalized.schemaVersion = RECEIPT_SCHEMA_VERSION;
    normalized.state = statusApi.normalizeState(receipt.state) || normalized.state;
    normalized.observationSource = Object.prototype.hasOwnProperty.call(receipt, 'observationSource')
      ? normalizeObservationSource(receipt.observationSource, OBSERVATION_SOURCES.LOCAL)
      : OBSERVATION_SOURCES.MIGRATION;
    normalized.lastObservedAt = normalized.lastObservedAt ||
      normalized.updatedAt ||
      normalized.resolvedAt ||
      normalized.createdAt ||
      null;

    const txHash = txHashOf(receipt);
    if (txHash) {
      normalized.transferHash = receipt.transferHash || txHash;
      normalized.hash = receipt.hash || txHash;
    }

    if (normalized.state === STATES.CONFIRMED) normalized.fundsMoved = true;
    if (
      normalized.state === STATES.SUBMITTED ||
      normalized.state === STATES.PENDING ||
      normalized.state === STATES.OUTCOME_UNKNOWN ||
      normalized.state === STATES.UNCLEAR
    ) {
      normalized.fundsMoved = normalized.fundsMoved === true ? true : null;
    }
    if (
      normalized.state === STATES.FAILED ||
      normalized.state === STATES.REJECTED ||
      normalized.state === STATES.EXPIRED ||
      normalized.state === STATES.INTERRUPTED
    ) {
      normalized.fundsMoved = normalized.fundsMoved === true ? true : false;
    }

    return normalized;
  }

  function migrateReceipt(receipt) {
    return normalizeKnownFields(receipt);
  }

  function normalizeReceipt(receipt) {
    return migrateReceipt(receipt);
  }

  function migrateReceiptCollection(receipts) {
    if (!Array.isArray(receipts)) return [];
    return receipts.map(migrateReceipt);
  }

  function stateStrength(state) {
    const normalized = statusApi.normalizeState(state);
    if (normalized === STATES.CONFIRMED) return 100;
    if (normalized === STATES.FAILED || normalized === STATES.REPLACED) return 80;
    if (normalized === STATES.PENDING) return 60;
    if (normalized === STATES.SUBMITTED || normalized === STATES.OUTCOME_UNKNOWN) return 50;
    if (normalized === STATES.UNCLEAR) return 30;
    if (normalized === STATES.REJECTED || normalized === STATES.EXPIRED || normalized === STATES.INTERRUPTED) return 25;
    if (normalized === STATES.AUTHORIZED || normalized === STATES.SUBMITTING) return 20;
    if (normalized === STATES.AUTHORIZING) return 15;
    if (normalized === STATES.READY) return 10;
    return 0;
  }

  function hasKnownValue(value) {
    return value !== null && value !== undefined && value !== '';
  }

  function isReceiptStronger(candidate, baseline) {
    const next = migrateReceipt(candidate);
    const current = migrateReceipt(baseline);

    if (current.fundsMoved === true && next.fundsMoved !== true) return false;
    if (current.state === STATES.CONFIRMED && next.state !== STATES.CONFIRMED) return false;
    if (hasKnownValue(current.blockNumber) && !hasKnownValue(next.blockNumber)) return false;
    if (hasKnownValue(current.transferHash) && !hasKnownValue(next.transferHash)) return false;
    if (hasKnownValue(current.explorerUrl) && !hasKnownValue(next.explorerUrl)) return false;
    if (hasKnownValue(current.createdAt) && next.createdAt !== current.createdAt) return false;

    return stateStrength(next.state) >= stateStrength(current.state);
  }

  function preserveKnown(current, next, key) {
    if (hasKnownValue(current[key]) && !hasKnownValue(next[key])) {
      next[key] = current[key];
    }
  }

  function mergeReceiptForward(existing, incoming) {
    const current = migrateReceipt(existing);
    const next = migrateReceipt(Object.assign({}, current, receiptObject(incoming)));

    // Strong facts can be enriched, but weaker observations cannot erase them.
    if (current.state === STATES.CONFIRMED) {
      next.state = STATES.CONFIRMED;
      next.fundsMoved = true;
    }
    if (current.fundsMoved === true) next.fundsMoved = true;

    [
      // Structural identity — never erase once set
      'id',
      'createdAt',
      'lastObservedAt',
      // Transfer attempt facts — set at receipt creation, must survive state transitions
      'sender',
      'recipient',
      'amount',
      'fee',
      'totalDebit',
      'chainId',
      'network',
      'contractAddress',
      'explorerUrl',
      // On-chain hashes — set when tx is broadcast, must survive later state updates
      'approvalHash',
      'transferHash',
      'hash',
      'blockNumber',
    ].forEach(function (key) {
      preserveKnown(current, next, key);
    });

    const txHash = txHashOf(next);
    if (txHash) {
      next.transferHash = next.transferHash || txHash;
      next.hash = next.hash || txHash;
    }

    if (!isReceiptStronger(next, current)) return current;
    return migrateReceipt(next);
  }

  return Object.freeze({
    RECEIPT_SCHEMA_VERSION,
    OBSERVATION_SOURCES,
    DEFAULT_RECEIPT,
    defaultReceipt,
    normalizeReceipt,
    migrateReceipt,
    migrateReceiptCollection,
    isReceiptStronger,
    mergeReceiptForward,
  });
});
