/**
 * receipt-store.js — ImplicitEx transaction receipt persistence
 *
 * Owns localStorage reads and writes only.
 * No rendering. No wallet events. No UI.
 *
 * Separation of concerns:
 *   receipt-store.js  — persistence
 *   companion.js      — rendering
 *   wallet.js         — transaction events
 *
 * Storage keys:
 *   ix.receipt.active   — object | null — the receipt currently being tracked
 *   ix.receipt.archive  — array — resolved receipts, newest first, max 20
 *
 * Spec: docs/product/receipt-store.md
 */

(function () {
  'use strict';

  const KEYS = {
    active:  'ix.receipt.active',
    archive: 'ix.receipt.archive',
  };

  const ARCHIVE_MAX = 20;
  const RECEIPT_EVENT = 'ix:receipts-changed';
  const statusApi = window.IX && window.IX.transferStatus;
  const schemaApi = window.IX && window.IX.receiptSchema;
  const integrity = window.IX && window.IX.receiptIntegrity;
  const STATES = statusApi && statusApi.IX_TRANSFER_STATES;
  const OBSERVATION_SOURCES = schemaApi && schemaApi.OBSERVATION_SOURCES;
  const TERMINAL_STATES = statusApi ? statusApi.TERMINAL_STATES : ['confirmed', 'failed', 'rejected', 'expired', 'replaced'];

  // ----------------------------------------------------------------
  // Storage primitives — isolated so every caller gets null on error
  // ----------------------------------------------------------------
  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (_) {
      // localStorage unavailable (private mode, quota exceeded).
      // Silently degrade — the interface still works, receipts just won't persist.
      return false;
    }
  }

  function notify() {
    try {
      window.dispatchEvent(new CustomEvent(RECEIPT_EVENT));
    } catch (_) {
      // Receipt rendering is best-effort; persistence remains authoritative.
    }
  }

  function makeId(createdAt) {
    return `${createdAt}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function normalizeReceipt(receipt) {
    if (schemaApi) return schemaApi.migrateReceipt(receipt);
    return integrity ? integrity.normalizeReceiptState(receipt) : receipt;
  }

  function txHashOf(receipt) {
    return integrity ? integrity.txHashOf(receipt) : (receipt && (receipt.transferHash || receipt.hash));
  }

  function findArchivedByHash(txHash) {
    if (!txHash || !integrity) return null;
    return integrity.findByTxHash(read(KEYS.archive) || [], txHash);
  }

  function stampObservation(record, fallbackSource) {
    const source = record && record.observationSource
      ? record.observationSource
      : fallbackSource;
    if (!source) return record;
    return Object.assign({}, record, {
      observationSource: source,
      lastObservedAt: record.lastObservedAt || new Date().toISOString(),
    });
  }

  // ----------------------------------------------------------------
  // create(receipt) — write a new active receipt
  //
  // If an active receipt already exists, it is archived before the
  // new one is created. Per spec rule 4: one active receipt at a time.
  //
  // receipt: object — caller provides all fields from the schema.
  //   id and timestamp are assigned here and cannot be overridden by caller.
  //
  // Returns the stored receipt object with assigned id.
  // ----------------------------------------------------------------
  function create(receipt) {
    const sourceReceipt = receipt && typeof receipt === 'object' ? receipt : {};
    const normalizedReceipt = normalizeReceipt(stampObservation(Object.assign({}, sourceReceipt, {
      state: sourceReceipt.state || (STATES && STATES.READY) || 'ready',
    }), OBSERVATION_SOURCES && OBSERVATION_SOURCES.LOCAL));
    const incomingHash = txHashOf(normalizedReceipt);
    const existing = read(KEYS.active);
    if (existing) {
      const normalizedExisting = normalizeReceipt(existing);
      const existingHash = txHashOf(normalizedExisting);
      if (incomingHash && existingHash && incomingHash.toLowerCase() === existingHash.toLowerCase()) {
        const merged = integrity
          ? integrity.mergeDuplicateByHash(normalizedExisting, normalizedReceipt)
          : Object.assign({}, normalizedExisting, normalizedReceipt);
        write(KEYS.active, Object.assign({}, merged, {
          id: normalizedExisting.id,
          createdAt: normalizedExisting.createdAt,
          timestamp: normalizedExisting.timestamp,
          updatedAt: new Date().toISOString(),
        }));
        notify();
        return getActive();
      }

      _pushToArchive(Object.assign({}, normalizedExisting, statusApi && statusApi.isTerminalState(normalizedExisting.state) ? {} : {
        fundsMoved: normalizedExisting.fundsMoved === true ? true : null,
        lastKnownMessage: normalizedExisting.lastKnownMessage || 'Replaced by a newer local transfer attempt.',
        resolvedAt: existing.resolvedAt || new Date().toISOString(),
      }));
    }

    const archivedDuplicate = findArchivedByHash(incomingHash);
    if (archivedDuplicate) {
      const mergedArchive = integrity
        ? integrity.mergeDuplicateByHash(archivedDuplicate, normalizedReceipt)
        : Object.assign({}, archivedDuplicate, normalizedReceipt);
      _pushToArchive(mergedArchive);
      notify();
      return mergedArchive;
    }

    const now = new Date().toISOString();
    const stored = Object.assign({}, normalizedReceipt, {
      id:         normalizedReceipt.id || makeId(now),
      createdAt:  normalizedReceipt.createdAt || now,
      timestamp:  normalizedReceipt.timestamp || normalizedReceipt.createdAt || now, // legacy alias
      resolvedAt: normalizedReceipt.resolvedAt || null,
    });

    write(KEYS.active, stored);
    notify();
    return stored;
  }

  // ----------------------------------------------------------------
  // update(id, patch) — apply a partial patch to the active receipt
  //
  // Guards against stale updates: only writes if the active receipt's
  // id matches the provided id. Prevents a race where the active receipt
  // was replaced before an async update arrives.
  //
  // Returns true if updated, false if id mismatch or no active receipt.
  // ----------------------------------------------------------------
  function update(id, patch) {
    const active = read(KEYS.active);
    if (!active || active.id !== id) return false;

    const stampedPatch = patch && patch.observationSource
      ? stampObservation(patch)
      : patch;
    const result = integrity
      ? integrity.applyIntegrityUpdate(active, stampedPatch)
      : { ok: true, receipt: Object.assign({}, active, stampedPatch) };
    if (!result.ok) return false;

    write(KEYS.active, Object.assign({}, result.receipt, {
      updatedAt: new Date().toISOString(),
    }));
    notify();
    return true;
  }

  // ----------------------------------------------------------------
  // getActive() — return the active receipt or null
  //
  // Returns null if:
  //   - localStorage has no ix.receipt.active
  //   - the stored value migrates to a receipt with no id (schema skeleton)
  // In the latter case the stale/corrupt entry is removed immediately.
  // ----------------------------------------------------------------
  function getActive() {
    const raw = read(KEYS.active);
    if (!raw) return null;
    const active = normalizeReceipt(raw);
    if (!active || !active.id) {
      write(KEYS.active, null);
      return null;
    }
    return active;
  }

  // ----------------------------------------------------------------
  // clearActive() — move active receipt to archive, then clear the slot
  //
  // Call when a terminal state is reached (CONFIRMED, FAILED, REJECTED,
  // EXPIRED, REPLACED, UNCLEAR-resolved). Stamps resolvedAt if not already set.
  // ----------------------------------------------------------------
  function clearActive() {
    const active = read(KEYS.active);
    if (active) {
      _pushToArchive(Object.assign({}, normalizeReceipt(active), {
        resolvedAt: active.resolvedAt || new Date().toISOString(),
      }));
    }
    write(KEYS.active, null);
    notify();
  }

  // ----------------------------------------------------------------
  // listRecent() — return archived receipts, newest first
  // Returns an empty array if no archive exists.
  // ----------------------------------------------------------------
  function listRecent() {
    const archive = schemaApi
      ? schemaApi.migrateReceiptCollection(read(KEYS.archive) || [])
      : (read(KEYS.archive) || []).map(normalizeReceipt);
    return archive;
  }

  function listAll() {
    const active = getActive();
    const archive = schemaApi
      ? schemaApi.migrateReceiptCollection(read(KEYS.archive) || [])
      : (read(KEYS.archive) || []).map(normalizeReceipt);
    return active ? [active, ...archive] : archive;
  }

  // ----------------------------------------------------------------
  // Internal — prepend to archive, trim to ARCHIVE_MAX
  // ----------------------------------------------------------------
  function _pushToArchive(receipt) {
    const normalized = normalizeReceipt(receipt);
    const receiptHash = txHashOf(normalized);
    const archive = (read(KEYS.archive) || []).map(normalizeReceipt).filter(function (item) {
      const itemHash = txHashOf(item);
      if (receiptHash && itemHash && itemHash.toLowerCase() === receiptHash.toLowerCase()) return false;
      return !normalized.id || item.id !== normalized.id;
    });
    archive.unshift(normalized);
    if (archive.length > ARCHIVE_MAX) {
      archive.length = ARCHIVE_MAX;
    }
    write(KEYS.archive, archive);
  }

  // ----------------------------------------------------------------
  // Public API on window.IX
  // wallet.js initialises window.IX before this script runs,
  // but receipt-store.js loads first, so we seed the namespace here.
  // ----------------------------------------------------------------
  window.IX = window.IX || {};
  window.IX.receipts = { create, update, getActive, clearActive, listRecent, listAll };

})();
