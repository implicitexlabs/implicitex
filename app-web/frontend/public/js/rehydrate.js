/**
 * rehydrate.js — Receipt rehydration on page load
 *
 * Runs once after all scripts have loaded.
 * Checks for an active receipt left from a previous session.
 * If the receipt has a hash and is in a non-terminal state,
 * attempts one chain re-query to resolve it.
 *
 * No polling. No live watchers. One query per page load.
 *
 * Resolution outcomes:
 *   status 1 on-chain   → CONFIRMED (archived)
 *   status 0 on-chain   → FAILED    (archived)
 *   null (not found)    → UNCLEAR   (remains active, re-queried next load)
 *   RPC error           → UNCLEAR   (remains active)
 *   no hash / no RPC    → UNCLEAR   (remains active)
 *
 * Spec: docs/product/receipt-store.md — Rehydration Rules
 */

(function () {
  'use strict';

  // Non-terminal states that warrant a chain re-query when a hash is present.
  const REQUERY_STATES = ['SUBMITTED', 'PENDING', 'UNCLEAR'];

  // Terminal states that should have been archived but weren't (e.g. crash mid-resolve).
  const TERMINAL_STATES = ['CONFIRMED', 'FAILED', 'REJECTED', 'EXPIRED', 'REPLACED'];

  // ----------------------------------------------------------------
  // Main rehydration entry point
  // ----------------------------------------------------------------
  async function rehydrate() {
    if (!window.IX || !window.IX.receipts) return;

    const active = window.IX.receipts.getActive();
    if (!active) return;

    // Terminal state stored but never archived — clean up silently.
    if (TERMINAL_STATES.includes(active.state)) {
      window.IX.receipts.clearActive();
      return;
    }

    // No hash means no broadcast reached the network — pre-broadcast interrupted.
    // Show UNCLEAR: we know an attempt was made but have nothing to re-query.
    if (!active.hash) {
      showUnclear(active, 'Transaction was not broadcast. No network record to verify.');
      return;
    }

    // Non-queriable state with a hash (e.g. AWAITING_APPROVAL where broadcast
    // happened but state wasn't updated) — attempt the re-query anyway.
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[active.chainId];
    const rpcUrl = chainConfig && chainConfig.rpcUrl;

    if (!rpcUrl) {
      showUnclear(active, 'No RPC configured for this network. Check Polygonscan manually.');
      return;
    }

    if (typeof ethers === 'undefined') {
      showUnclear(active, 'Network library unavailable. Check Polygonscan manually.');
      return;
    }

    // Show UNCLEAR immediately — companion updates again when query resolves.
    // This prevents a blank tray while the RPC call is in flight.
    showCompanion('UNCLEAR', {
      statusLine: 'Transaction status unclear. Checking network…',
      stateVal:   'Unclear',
      fundsVal:   'Unknown — checking now',
      networkVal: active.network || '—',
      eventVal:   'Submitted: ' + formatTime(active.timestamp),
      actionVal:  'Checking transaction status. Do not retry yet.',
      autoOpen:   true,
    });

    // One re-query attempt — no retries.
    try {
      const provider  = new ethers.JsonRpcProvider(rpcUrl);
      const txReceipt = await provider.getTransactionReceipt(active.hash);

      if (txReceipt === null) {
        // Not found: still in mempool, dropped, or RPC sync lag.
        // Cannot distinguish without mempool access — leave as UNCLEAR.
        window.IX.receipts.update(active.id, { state: 'UNCLEAR' });
        showUnclear(active, 'Transaction not yet confirmed. Check Polygonscan before retrying.');
        return;
      }

      if (txReceipt.status === 1) {
        // Confirmed on-chain.
        const explorerUrl = chainConfig.explorerUrl
          ? chainConfig.explorerUrl + '/tx/' + active.hash
          : null;

        window.IX.receipts.update(active.id, {
          state:       'CONFIRMED',
          fundsMoved:  true,
          explorerUrl,
        });
        window.IX.receipts.clearActive();

        showCompanion('CONFIRMED', {
          statusLine: 'Transfer confirmed. Funds have moved.',
          stateVal:   'Confirmed',
          fundsVal:   'Yes — transfer complete',
          networkVal: active.network,
          eventVal:   active.hash,
          actionVal:  explorerUrl ? 'View on ' + chainConfig.name + ' explorer \u2197' : 'Transfer confirmed.',
          actionHref: explorerUrl || undefined,
          autoOpen:   true,
        });
        return;
      }

      if (txReceipt.status === 0) {
        // Reverted on-chain. Gas was consumed. Funds did not move.
        window.IX.receipts.update(active.id, { state: 'FAILED', fundsMoved: false });
        window.IX.receipts.clearActive();

        showCompanion('FAILED', {
          statusLine: 'Transaction failed on-chain. Funds were not moved.',
          stateVal:   'Failed',
          fundsVal:   'No — gas may have been consumed',
          networkVal: active.network,
          eventVal:   active.hash,
          actionVal:  'Transaction reverted on-chain. Verify on Polygonscan before retrying.',
          autoOpen:   true,
        });
        return;
      }

      // Unknown status code — do not fabricate a terminal state.
      window.IX.receipts.update(active.id, { state: 'UNCLEAR' });
      showUnclear(active, 'Network returned an unrecognised transaction status.');

    } catch (_) {
      // RPC error — cannot determine outcome. Keep receipt active for next load.
      window.IX.receipts.update(active.id, { state: 'UNCLEAR' });
      showUnclear(active, 'Network query failed. Check Polygonscan before retrying.');
    }
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  function showCompanion(stateKey, detail) {
    if (window.IX && window.IX.companion) {
      window.IX.companion.setState(stateKey, detail);
    }
  }

  function showUnclear(receipt, reason) {
    showCompanion('UNCLEAR', {
      statusLine: 'Transaction status is unclear.',
      stateVal:   'Unclear',
      fundsVal:   'Unknown — verify before retrying',
      networkVal: (receipt && receipt.network) || '—',
      eventVal:   reason,
      // No dramatization. No "may be lost." Factual direction only.
      actionVal:  'Check Polygonscan before retrying. Do not assume the transfer failed.',
      autoOpen:   true,
    });
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return iso;
    }
  }

  // ----------------------------------------------------------------
  // Run once — all scripts loaded synchronously at bottom of <body>,
  // DOM is already parsed by the time this executes.
  // ----------------------------------------------------------------
  rehydrate();

})();
