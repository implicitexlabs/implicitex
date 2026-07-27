/*
  gas-service.js — Shared Polygon gas-price fetch service.

  Exposes window.ImplicitExGas so multiple pages can drive gas displays
  without duplicating fetch logic.

  Public API:
    ImplicitExGas.fetchGasPrice(timeoutMs = 10000)
      → Promise<{ standard, fast, rapid, blockNumber, blockTime }>
      All numeric fields in Gwei (Number). Rejects on:
        - network failure or HTTP error
        - missing, null, zero, negative, or non-numeric standard/fast tiers
        - request exceeding timeoutMs

    ImplicitExGas.formatGwei(value)
      → string  Formats a Gwei value for display. Returns '—' for any
        non-finite input including null, undefined, NaN, ±Infinity.

    ImplicitExGas.startPolling(callback, intervalMs = 30000, timeoutMs = 10000)
      → intervalId (pass to clearInterval to stop)
      Calls callback(err, tiers) immediately and on each interval.
      err is an Error on failure, null on success.
      tiers is { standard, fast, rapid, blockNumber, blockTime } on success,
      null on failure.
      In-flight guard: if a tick has not resolved, the next interval is skipped
      rather than starting a second concurrent request.
*/
(function (global) {
  'use strict';

  const GAS_STATION_URL  = 'https://gasstation.polygon.technology/v2';
  const DEFAULT_INTERVAL = 30000;
  const DEFAULT_TIMEOUT  = 10000;

  function formatGwei(value) {
    if (value == null) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 100) return Math.round(n).toString();
    if (n >= 10)  return n.toFixed(1);
    return n.toFixed(2);
  }

  /*
    Safe tier parser. Returns NaN for any malformed, missing, zero, or negative
    entry so that fetchGasPrice can reject rather than emit a 0-Gwei reading.
  */
  function readGasTier(data, tier) {
    const entry = data && data[tier];
    if (!entry || typeof entry !== 'object') return NaN;
    const raw   = entry.maxFee ?? entry.maxPriorityFee;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : NaN;
  }

  async function fetchGasPrice(timeoutMs) {
    const timeout    = (typeof timeoutMs === 'number' && timeoutMs > 0)
      ? timeoutMs : DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timerId    = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(GAS_STATION_URL, {
        method:  'GET',
        headers: { Accept: 'application/json' },
        cache:   'no-store',
        signal:  controller.signal,
      });
      if (!res.ok) throw new Error(`Gas station returned ${res.status}`);

      const data     = await res.json();
      const standard = readGasTier(data, 'standard');
      const fast     = readGasTier(data, 'fast');

      if (!Number.isFinite(standard) || !Number.isFinite(fast)) {
        throw new Error(
          'Gas station response missing required tier data (standard or fast)'
        );
      }

      const spread = Math.max(1, fast - standard);

      return {
        standard,
        fast,
        rapid:       fast + Math.max(1, spread * 0.5),
        blockNumber: Number(data && data.blockNumber),
        blockTime:   Number(data && data.blockTime),
      };
    } finally {
      clearTimeout(timerId);
    }
  }

  function startPolling(callback, intervalMs, timeoutMs) {
    const interval = (typeof intervalMs === 'number' && intervalMs > 0)
      ? intervalMs : DEFAULT_INTERVAL;
    let inFlight = false;

    async function tick() {
      if (inFlight) return;
      inFlight = true;
      try {
        const tiers = await fetchGasPrice(timeoutMs);
        callback(null, tiers);
      } catch (err) {
        callback(err, null);
      } finally {
        inFlight = false;
      }
    }

    tick();
    return setInterval(tick, interval);
  }

  global.ImplicitExGas = { formatGwei, fetchGasPrice, startPolling };

}(typeof window !== 'undefined' ? window : globalThis));
