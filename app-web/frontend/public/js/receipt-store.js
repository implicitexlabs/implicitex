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
    const existing = read(KEYS.active);
    if (existing) {
      _pushToArchive(existing);
    }

    const now = new Date().toISOString();
    const stored = Object.assign({}, receipt, {
      id:         now,   // stable identifier; ISO timestamp of creation
      timestamp:  now,   // moment of first event
      resolvedAt: null,  // populated by clearActive()
    });

    write(KEYS.active, stored);
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

    write(KEYS.active, Object.assign({}, active, patch));
    return true;
  }

  // ----------------------------------------------------------------
  // getActive() — return the active receipt or null
  // ----------------------------------------------------------------
  function getActive() {
    return read(KEYS.active);
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
      _pushToArchive(Object.assign({}, active, {
        resolvedAt: active.resolvedAt || new Date().toISOString(),
      }));
    }
    write(KEYS.active, null);
  }

  // ----------------------------------------------------------------
  // listRecent() — return archived receipts, newest first
  // Returns an empty array if no archive exists.
  // ----------------------------------------------------------------
  function listRecent() {
    return read(KEYS.archive) || [];
  }

  // ----------------------------------------------------------------
  // Internal — prepend to archive, trim to ARCHIVE_MAX
  // ----------------------------------------------------------------
  function _pushToArchive(receipt) {
    const archive = read(KEYS.archive) || [];
    archive.unshift(receipt);
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
  window.IX.receipts = { create, update, getActive, clearActive, listRecent };

})();
