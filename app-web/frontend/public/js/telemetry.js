/*
  telemetry.js — TELEMETRY panel
  Manages the collapsed signal bar and expandable instrumentation panel.

  Public API: window.IX.telemetry
    setSignal({ level, rate, summary })
      level:   'dormant' | 'status' | 'elevated' | 'critical'
      rate:    'low' | 'avg' | 'high'
      summary: string shown in collapsed bar

    setRows(section, rows)
      section: 'status' | 'details' | 'guidance'
      rows:    [{ key, value, level?, html? }]
               level: 'elevated' | 'critical' — tints the value
               html:  true — value is rendered as raw HTML (use only for trusted content e.g. explorer links)

    clearRows(section)
    open() / close() / toggle()

  wallet.js drives this via telemetrySignal() — same guard pattern as companionState().
  telemetry.js must load after companion.js in the script order.
*/
(function (global, factory) {
  global.IX = global.IX || {};
  factory(global);
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  'use strict';

  // ---- DOM refs ---- (guarded; panel may not exist on non-index pages)
  var root       = document.getElementById('telemetry');
  var bar        = document.getElementById('telemetryBar');
  var dot        = document.getElementById('telemetryDot');
  var summaryEl  = document.getElementById('telemetrySummary');
  var panel      = document.getElementById('telemetryPanel');

  var sectionEls = {
    status:   document.getElementById('telemetrySectionStatus'),
    details:  document.getElementById('telemetrySectionDetails'),
    guidance: document.getElementById('telemetrySectionGuidance'),
  };
  var rowContainers = {
    status:   document.getElementById('telemetryStatusRows'),
    details:  document.getElementById('telemetryDetailsRows'),
    guidance: document.getElementById('telemetryGuidanceRows'),
  };

  if (!root || !bar || !panel) {
    // Not on a page that has the TELEMETRY panel — expose no-op API and exit.
    global.IX.telemetry = {
      setSignal: function () {},
      setRows:   function () {},
      clearRows: function () {},
      open:      function () {},
      close:     function () {},
      toggle:    function () {},
    };
    return;
  }

  // ---- Internal state ----
  var isOpen        = false;
  var currentLevel  = 'dormant';
  var currentRate   = 'low';

  var LEVELS = ['dormant', 'status', 'elevated', 'critical'];
  var RATES  = ['low', 'avg', 'high'];

  // ---- Open / close ----
  function open() {
    if (isOpen) return;
    isOpen = true;
    root.classList.add('is-open');
    bar.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('hidden');
    panel.style.visibility = 'visible';
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    bar.setAttribute('aria-expanded', 'false');
    panel.setAttribute('hidden', '');
  }

  function toggle() {
    isOpen ? close() : open();
  }

  bar.addEventListener('click', toggle);
  bar.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  // ---- Signal ----
  function setSignal(opts) {
    var level   = (opts && opts.level)   || 'dormant';
    var rate    = (opts && opts.rate)    || 'low';
    var summary = (opts && opts.summary) || 'Nominal';

    // Clear previous level + rate classes
    LEVELS.forEach(function (l) { root.classList.remove('telemetry--' + l); });
    RATES.forEach(function  (r) { root.classList.remove('telemetry--pulse-' + r); });

    currentLevel = level;
    currentRate  = rate;

    root.classList.add('telemetry--' + level);

    if (level !== 'dormant') {
      root.classList.add('telemetry--pulse-' + rate);
    }

    if (summaryEl) summaryEl.textContent = summary;
  }

  // ---- Rows ----
  function escapeHtml(str) {
    return String(str == null ? '—' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setRows(section, rows) {
    var container = rowContainers[section];
    var sectionEl = sectionEls[section];
    if (!container || !sectionEl) return;

    if (!rows || rows.length === 0) {
      container.innerHTML = '';
      sectionEl.hidden = true;
      return;
    }

    sectionEl.hidden = false;
    container.innerHTML = rows.map(function (row) {
      var levelClass = row.level ? ' telemetry-v--' + row.level : '';
      var valueHtml  = row.html ? String(row.value) : escapeHtml(row.value);
      return '<div class="telemetry-row">'
        + '<span class="telemetry-k">' + escapeHtml(row.key) + '</span>'
        + '<span class="telemetry-v' + levelClass + '">' + valueHtml + '</span>'
        + '</div>';
    }).join('');
  }

  function clearRows(section) {
    setRows(section, []);
  }

  // ---- Init: hide all sections until populated ----
  Object.keys(sectionEls).forEach(function (s) {
    if (sectionEls[s]) sectionEls[s].hidden = true;
  });

  // Start dormant
  setSignal({ level: 'dormant', rate: 'low', summary: 'Nominal' });

  // ---- Public API ----
  global.IX.telemetry = {
    setSignal: setSignal,
    setRows:   setRows,
    clearRows: clearRows,
    open:      open,
    close:     close,
    toggle:    toggle,
  };
});
