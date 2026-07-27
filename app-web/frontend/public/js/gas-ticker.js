/*
  gas-ticker.js — Main-site gas-price ticker adapter.

  Drives id="gasHeroVal" on implicitex.com.
  Depends on gas-service.js (must load first).

  States:
    Loading   →  gas-loading CSS pulse on the initial child span (set in HTML)
    Success   →  three-tier: standard | fast | rapid Gwei
    Error     →  gas-unavail: "Unavailable"
*/
(function () {
  'use strict';

  const el      = document.getElementById('gasHeroVal');
  const service = window.ImplicitExGas;

  // Not on a page with this element, or service failed to load.
  if (!el || !service) return;

  function renderSuccess(tiers) {
    const values = [
      service.formatGwei(tiers.standard),
      '|',
      service.formatGwei(tiers.fast),
      '|',
      service.formatGwei(tiers.rapid),
    ];
    el.replaceChildren(...values.map(value => {
      const span = document.createElement('span');
      span.className = value === '|' ? 'gas-tier-sep' : 'gas-tier-value';
      span.textContent = value;
      return span;
    }));
  }

  function renderError() {
    const span = document.createElement('span');
    span.className = 'gas-tier-value gas-unavail';
    span.textContent = 'Unavailable';
    el.replaceChildren(span);
  }

  service.startPolling(function (err, tiers) {
    if (err) { renderError(); return; }
    renderSuccess(tiers);
  });

}());
