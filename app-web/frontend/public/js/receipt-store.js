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
  const TERMINAL_STATES = ['CONFIRMED', 'FAILED', 'REJECTED', 'EXPIRED', 'REPLACED', 'INTERRUPTED'];

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
      const terminal = TERMINAL_STATES.includes(existing.state);
      _pushToArchive(Object.assign({}, existing, terminal ? {} : {
        state: 'UNCLEAR',
        fundsMoved: existing.fundsMoved === true ? true : null,
        lastKnownMessage: existing.lastKnownMessage || 'Replaced by a newer local transfer attempt.',
        resolvedAt: existing.resolvedAt || new Date().toISOString(),
      }));
    }

    const now = new Date().toISOString();
    const stored = Object.assign({}, receipt, {
      id:         receipt.id || makeId(now),
      createdAt:  receipt.createdAt || now,
      timestamp:  receipt.timestamp || receipt.createdAt || now, // legacy alias
      resolvedAt: receipt.resolvedAt || null,
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

    write(KEYS.active, Object.assign({}, active, patch, {
      updatedAt: new Date().toISOString(),
    }));
    notify();
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
    notify();
  }

  // ----------------------------------------------------------------
  // listRecent() — return archived receipts, newest first
  // Returns an empty array if no archive exists.
  // ----------------------------------------------------------------
  function listRecent() {
    return read(KEYS.archive) || [];
  }

  function listAll() {
    const active = read(KEYS.active);
    const archive = read(KEYS.archive) || [];
    return active ? [active, ...archive] : archive;
  }

  // ----------------------------------------------------------------
  // Internal — prepend to archive, trim to ARCHIVE_MAX
  // ----------------------------------------------------------------
  function _pushToArchive(receipt) {
    const archive = (read(KEYS.archive) || []).filter(function (item) {
      return !receipt.id || item.id !== receipt.id;
    });
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
  window.IX.receipts = { create, update, getActive, clearActive, listRecent, listAll };

})();
