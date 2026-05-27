/**
 * companion.js — Transaction Companion Tray
 *
 * State vocabulary: docs/product/transaction-states.md
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // DOM refs
  // ----------------------------------------------------------------
  const els = {
    companion:   document.getElementById('companion'),
    bar:         document.getElementById('companionBar'),
    detail:      document.getElementById('companionDetail'),
    status:      document.getElementById('companionStatus'),
    stateVal:    document.getElementById('companionStateVal'),
    fundsVal:    document.getElementById('companionFundsVal'),
    networkVal:  document.getElementById('companionNetworkVal'),
    eventVal:    document.getElementById('companionEventVal'),
    actionVal:   document.getElementById('companionActionVal'),
  };

  if (!els.companion || !els.bar) return;

  function normalizeSeverity(severity) {
    if (!severity) return null;
    if (severity === 'error' || severity === 'critical') return 'critical';
    if (severity === 'warning' || severity === 'advisory' || severity === 'blocking') return 'advisory';
    if (severity === 'pending' || severity === 'neutral' || severity === 'ok') return severity;
    return null;
  }

  function companionClassForSeverity(severity) {
    if (severity === 'critical') return 'error';
    if (severity === 'advisory' || severity === 'blocking') return 'warning';
    return null;
  }

  function valueClassForSeverity(severity) {
    if (severity === 'critical') return 'error';
    if (severity === 'advisory' || severity === 'blocking') return 'warning';
    return null;
  }

  function applySeverity(severity) {
    const normalized = normalizeSeverity(severity);
    const companionClass = companionClassForSeverity(normalized);
    const valueClass = valueClassForSeverity(normalized);

    els.companion.classList.remove('companion--error', 'companion--warning');
    [els.stateVal, els.networkVal, els.actionVal].forEach(function (el) {
      if (!el) return;
      el.classList.remove('is-error', 'is-warning');
    });

    if (!companionClass) return;
    els.companion.classList.add('companion--' + companionClass);
    [els.stateVal, els.networkVal, els.actionVal].forEach(function (el) {
      if (!el) return;
      if (valueClass) el.classList.add('is-' + valueClass);
    });
  }

  // ----------------------------------------------------------------
  // Toggle
  // ----------------------------------------------------------------
  function open() {
    els.companion.classList.add('is-open');
    els.bar.setAttribute('aria-expanded', 'true');
    if (els.detail) els.detail.removeAttribute('aria-hidden');
  }

  function close() {
    els.companion.classList.remove('is-open');
    els.bar.setAttribute('aria-expanded', 'false');
    if (els.detail) els.detail.setAttribute('aria-hidden', 'true');
  }

  function toggle() {
    if (els.companion.classList.contains('is-open')) {
      close();
    } else {
      open();
    }
  }

  // ----------------------------------------------------------------
  // Event listeners
  // ----------------------------------------------------------------
  els.bar.addEventListener('click', toggle);

  els.bar.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  // ----------------------------------------------------------------
  // Public API
  // Exposed on window.IX.companion for wallet.js status updates.
  //
  // setState(state, detail) — updates companion display.
  //   state:  string key from transaction-states.md
  //           e.g. 'SUBMITTED' | 'CONFIRMED' | 'OUTCOME_UNKNOWN' | 'UNCLEAR' etc.
  //   detail: object {
  //     statusLine: string,   // collapsed bar text
  //     stateVal:   string,   // expanded Status row
  //     fundsVal:   string,   // expanded Funds Moved row
  //     networkVal: string,   // expanded Network row
  //     eventVal:   string,   // expanded Last Event row
  //     actionVal:  string,   // expanded Next Step row
  //     autoOpen:   boolean,  // open tray automatically for states that need user attention
  //   }
  // ----------------------------------------------------------------
  function setState(state, detail) {
    if (!detail) return;
    applySeverity(detail.severity);

    if (els.status && detail.statusLine)     els.status.textContent    = detail.statusLine;
    if (els.stateVal && detail.stateVal)     els.stateVal.textContent  = detail.stateVal;
    if (els.fundsVal && detail.fundsVal)     els.fundsVal.textContent  = detail.fundsVal;
    if (els.networkVal && detail.networkVal) els.networkVal.textContent = detail.networkVal;
    if (els.eventVal && detail.eventVal)     els.eventVal.textContent  = detail.eventVal;

    // actionVal may carry a link for external chain verification.
    // actionHref is always from our own chain config + a chain-produced 0x hex — safe.
    if (els.actionVal && detail.actionVal) {
      if (detail.actionHref) {
        const a = document.createElement('a');
        a.href    = detail.actionHref;
        a.target  = '_blank';
        a.rel     = 'noopener';
        a.textContent = detail.actionVal;
        a.className   = 'companion-action-link';
        els.actionVal.textContent = '';
        els.actionVal.appendChild(a);
      } else {
        els.actionVal.textContent = detail.actionVal;
      }
    }

    els.companion.classList.add('is-active');

    // Auto-open only for states where user most needs context.
    if (detail.autoOpen) open();
  }

  function reset() {
    applySeverity(null);
    if (els.status)     els.status.textContent    = 'Ready · No active transaction';
    if (els.stateVal)   els.stateVal.textContent  = 'Ready';
    if (els.fundsVal)   els.fundsVal.textContent  = 'No active transaction';
    if (els.networkVal) els.networkVal.textContent = '—';
    if (els.eventVal)   els.eventVal.textContent  = '—';
    if (els.actionVal)  els.actionVal.textContent = 'Connect wallet to begin.';
    els.companion.classList.remove('is-active');
    close();
  }

  // ----------------------------------------------------------------
  // Register on window.IX
  // wallet.js initialises window.IX before this script runs.
  // If IX doesn't exist yet, create a minimal shell.
  // ----------------------------------------------------------------
  window.IX = window.IX || {};
  window.IX.companion = { setState, reset, open, close, toggle };

})();
