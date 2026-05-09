/**
 * companion.js — Transaction Companion Tray
 *
 * Current scope: static shell only. Toggle open/close. One hardcoded READY state.
 * Not wired to wallet flow yet. No localStorage. No transaction events.
 *
 * Future: wire to wallet.js via window.IX.companion.setState(state, detail)
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
  // Exposed on window.IX.companion for future wallet.js wiring.
  //
  // setState(state, detail) — updates companion display.
  //   state:  string key from transaction-states.md
  //           e.g. 'SUBMITTED' | 'CONFIRMED' | 'UNCLEAR' etc.
  //   detail: object {
  //     statusLine: string,   // collapsed bar text
  //     stateVal:   string,   // expanded Status row
  //     fundsVal:   string,   // expanded Funds Moved row
  //     networkVal: string,   // expanded Network row
  //     eventVal:   string,   // expanded Last Event row
  //     actionVal:  string,   // expanded Next Step row
  //     autoOpen:   boolean,  // open tray automatically (use for UNCLEAR, FAILED, REPLACED)
  //   }
  // ----------------------------------------------------------------
  function setState(state, detail) {
    if (!detail) return;

    if (els.status && detail.statusLine)     els.status.textContent    = detail.statusLine;
    if (els.stateVal && detail.stateVal)     els.stateVal.textContent  = detail.stateVal;
    if (els.fundsVal && detail.fundsVal)     els.fundsVal.textContent  = detail.fundsVal;
    if (els.networkVal && detail.networkVal) els.networkVal.textContent = detail.networkVal;
    if (els.eventVal && detail.eventVal)     els.eventVal.textContent  = detail.eventVal;

    // actionVal may carry a link (e.g. Polygonscan receipt on CONFIRMED).
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

    // Auto-open only for high-priority states where user most needs context:
    // WRONG_NETWORK, REJECTED, FAILED, CONFIRMED, UNCLEAR.
    if (detail.autoOpen) open();
  }

  function reset() {
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
