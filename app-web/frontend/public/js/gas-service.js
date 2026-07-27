/*
  gas-service.js — Shared Polygon gas-price fetch service.

  Exposes window.ImplicitExGas so multiple pages can drive gas displays
  without duplicating fetch logic.

  Public API:
    ImplicitExGas.fetchGasPrice()
      → Promise<{ standard, fast, rapid, blockNumber, blockTime }>
      All numeric fields in Gwei (Number). Rejects on network/parse failure.

    ImplicitExGas.formatGwei(value)
      → string  Formats a Gwei value for display.

    ImplicitExGas.startPolling(callback, intervalMs = 30000)
      → intervalId (pass to clearInterval to stop)
      Calls callback(err, tiers) immediately and on each interval.
      err is an Error on failure, null on success.
      tiers is { standard, fast, rapid, blockNumber, blockTime } on success,
      null on failure.
*/
(function (global) {
  'use strict';

  const GAS_STATION_URL  = 'https://gasstation.polygon.technology/v2';
  const DEFAULT_INTERVAL = 30000;

  function formatGwei(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 100) return Math.round(n).toString();
    if (n >= 10)  return n.toFixed(1);
    return n.toFixed(2);
  }

  function readGasTier(data, tier) {
    const entry = data && data[tier];
    return Number(entry && (entry.maxFee ?? entry.maxPriorityFee));
  }

  async function fetchGasPrice() {
    const res = await fetch(GAS_STATION_URL, {
      method:  'GET',
      headers: { Accept: 'application/json' },
      cache:   'no-store',
    });
    if (!res.ok) throw new Error(`Gas station returned ${res.status}`);

    const data     = await res.json();
    const standard = readGasTier(data, 'standard');
    const fast     = readGasTier(data, 'fast');
    const spread   = Number.isFinite(standard) && Number.isFinite(fast)
      ? Math.max(1, fast - standard) : 1;

    return {
      standard,
      fast,
      rapid:       Number.isFinite(fast) ? fast + Math.max(1, spread * 0.5) : NaN,
      blockNumber: Number(data && data.blockNumber),
      blockTime:   Number(data && data.blockTime),
    };
  }

  function startPolling(callback, intervalMs) {
    const interval = intervalMs || DEFAULT_INTERVAL;

    async function tick() {
      try {
        const tiers = await fetchGasPrice();
        callback(null, tiers);
      } catch (err) {
        callback(err, null);
      }
    }

    tick();
    return setInterval(tick, interval);
  }

  global.ImplicitExGas = { formatGwei, fetchGasPrice, startPolling };

}(typeof window !== 'undefined' ? window : globalThis));
