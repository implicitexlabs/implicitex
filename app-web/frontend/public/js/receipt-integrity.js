(function (root, factory) {
  'use strict';

  const statusApi = root && root.IX && root.IX.transferStatus
    ? root.IX.transferStatus
    : (typeof require === 'function' ? require('./transfer-status.js') : null);
  const schemaApi = root && root.IX && root.IX.receiptSchema
    ? root.IX.receiptSchema
    : (typeof require === 'function' ? require('./receipt-schema.js') : null);
  const api = factory(statusApi, schemaApi);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.receiptIntegrity = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (statusApi, schemaApi) {
  'use strict';

  const STATES = statusApi.IX_TRANSFER_STATES;

  function txHashOf(receipt) {
    return receipt && (receipt.transferHash || receipt.hash || receipt.transactionHash) || null;
  }

  function normalizeReceiptState(receipt) {
    return schemaApi ? schemaApi.migrateReceipt(receipt) : receipt;
  }

  function applyIntegrityUpdate(existing, patch) {
    const current = normalizeReceiptState(existing);
    const rawPatch = patch || {};
    const patchHasState = Object.prototype.hasOwnProperty.call(rawPatch, 'state');
    const patchHasObservationSource = Object.prototype.hasOwnProperty.call(rawPatch, 'observationSource');
    const nextPatch = normalizeReceiptState(rawPatch);
    const fromState = current && current.state;
    if (!patchHasState) nextPatch.state = fromState;
    if (!patchHasObservationSource) {
      nextPatch.observationSource = current.observationSource;
      nextPatch.lastObservedAt = current.lastObservedAt;
    }
    const toState = patchHasState ? nextPatch.state : fromState;

    if (fromState && toState && !statusApi.canTransition(fromState, toState)) {
      return {
        ok: false,
        reason: 'invalid_transition',
        receipt: current,
      };
    }

    if (nextPatch.transferHash && !nextPatch.hash) nextPatch.hash = nextPatch.transferHash;
    if (nextPatch.hash && !nextPatch.transferHash) nextPatch.transferHash = nextPatch.hash;

    if (nextPatch.state === STATES.CONFIRMED) nextPatch.fundsMoved = true;
    if (nextPatch.state === STATES.OUTCOME_UNKNOWN || nextPatch.state === STATES.UNCLEAR || nextPatch.state === STATES.SUBMITTED || nextPatch.state === STATES.PENDING) {
      nextPatch.fundsMoved = null;
    }

    return {
      ok: true,
      receipt: schemaApi
        ? schemaApi.mergeReceiptForward(current, nextPatch)
        : Object.assign({}, current, nextPatch),
    };
  }

  function findByTxHash(receipts, txHash) {
    if (!txHash) return null;
    return (receipts || []).find(function (receipt) {
      const existingHash = txHashOf(receipt);
      return existingHash && existingHash.toLowerCase() === txHash.toLowerCase();
    }) || null;
  }

  function mergeDuplicateByHash(existing, incoming) {
    const merged = applyIntegrityUpdate(existing, incoming);
    return merged.ok ? merged.receipt : existing;
  }

  return Object.freeze({
    txHashOf,
    normalizeReceiptState,
    applyIntegrityUpdate,
    findByTxHash,
    mergeDuplicateByHash,
  });
});
