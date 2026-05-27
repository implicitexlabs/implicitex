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
 *   null (not found)    → SUBMITTED / OUTCOME_UNKNOWN (remains active)
 *   RPC error           → OUTCOME_UNKNOWN (remains active)
 *   no hash / no RPC    → UNCLEAR   (remains active)
 *
 * Spec: docs/product/receipt-store.md — Rehydration Rules
 */

(function () {
  'use strict';

  const TRANSFER_STATUS = window.IX && window.IX.transferStatus;
  const IX_TRANSFER_STATES = TRANSFER_STATUS && TRANSFER_STATUS.IX_TRANSFER_STATES;
  const RECEIPT_SCHEMA = window.IX && window.IX.receiptSchema;
  const OBSERVATION_SOURCES = RECEIPT_SCHEMA && RECEIPT_SCHEMA.OBSERVATION_SOURCES;
  const REHYDRATION_SOURCE = OBSERVATION_SOURCES && OBSERVATION_SOURCES.REHYDRATION;
  // Terminal states that should have been archived but weren't (e.g. crash mid-resolve).
  // OUTCOME_UNKNOWN is intentionally absent: it has a transferHash and should be re-queried.
  const TERMINAL_STATES = TRANSFER_STATUS ? TRANSFER_STATUS.TERMINAL_STATES : ['confirmed', 'failed', 'rejected', 'expired', 'replaced'];
  // SUBMITTING without a hash: MetaMask had the transfer confirmation dialog open
  // but the page closed before the wallet returned a tx object. The transaction
  // was never broadcast — semantically identical to AUTHORIZING or AUTHORIZED.
  // Keeping it in PRE_BROADCAST_STATES prevents a false UNCLEAR promotion on reload.
  const PRE_BROADCAST_STATES = TRANSFER_STATUS ? TRANSFER_STATUS.PRE_BROADCAST_STATES : ['draft', 'ready', 'authorizing', 'authorized', 'submitting'];

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

    const transferHash = active.transferHash || active.hash;

    // READY and AUTHORIZING with no hash: the previous session made zero chain impact.
    //   READY      — on-chain preview completed, MetaMask was never prompted.
    //   AUTHORIZING — MetaMask approval dialog was open; page closed before user acted.
    // Neither state produced a transaction. There is nothing to surface or recover.
    // Clear silently so no stale receipt shell appears in the history list or
    // gets archived as "Replaced by newer attempt" when the user retries.
    if (!transferHash && (
      active.state === IX_TRANSFER_STATES.READY ||
      active.state === IX_TRANSFER_STATES.AUTHORIZING
    )) {
      window.IX.receipts.clearActive();
      return;
    }

    // Pre-broadcast receipts: no hash, no chain record, no funds moved.
    // AUTHORIZED — USDC approve() was confirmed on-chain; transfer was never submitted.
    //              Surface so user knows the allowance was granted even though no funds moved.
    // SUBMITTING  — MetaMask transfer dialog was open; wallet closed before returning a tx.
    //              Surface so user knows to verify before retrying.
    if (!transferHash && PRE_BROADCAST_STATES.includes(active.state)) {
      const walletClosedBeforeBroadcast = active.state === IX_TRANSFER_STATES.SUBMITTING;
      showCompanion(active.state, {
        statusLine: active.lastKnownMessage || 'Transfer attempt saved locally.',
        stateVal:   active.state,
        fundsVal:   'No — transfer not broadcast',
        networkVal: active.network || '—',
        eventVal:   'Created: ' + formatTime(active.createdAt || active.timestamp),
        actionVal:  walletClosedBeforeBroadcast
          ? 'Wallet closed before broadcast. No network transaction exists; you can start again.'
          : 'Review the saved attempt before retrying.',
        autoOpen:   true,
      });
      return;
    }

    // No hash in any other state: cannot determine outcome, do not fabricate failure.
    if (!transferHash) {
      window.IX.receipts.update(active.id, {
        state: IX_TRANSFER_STATES.UNCLEAR,
        fundsMoved: null,
        observationSource: REHYDRATION_SOURCE,
        lastKnownMessage: 'Transaction was not broadcast. No network record to verify.',
      });
      showUnclear(active, 'Transaction was not broadcast. No network record to verify.');
      return;
    }

    // Non-queriable state with a hash (e.g. AWAITING_APPROVAL where broadcast
    // happened but state wasn't updated) — attempt the re-query anyway.
    const chainConfig = window.IX_CHAINS && window.IX_CHAINS[active.chainId];
    const rpcUrl = chainConfig && chainConfig.rpcUrl;

    if (!rpcUrl) {
      markOutcomeUnknown(active, transferHash, chainConfig, 'No RPC configured for this network. Verify on explorer manually.');
      return;
    }

    if (typeof ethers === 'undefined') {
      markOutcomeUnknown(active, transferHash, chainConfig, 'Network library unavailable. Verify on explorer manually.');
      return;
    }

    // Show the stored hash-bearing state immediately. The companion updates
    // again if the chain query resolves to confirmed, failed, or unknown.
    showCompanion(active.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? IX_TRANSFER_STATES.OUTCOME_UNKNOWN : IX_TRANSFER_STATES.SUBMITTED, {
      statusLine: active.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN
        ? 'Outcome unknown. Checking network…'
        : 'Transaction submitted. Checking network…',
      stateVal:   active.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? 'Outcome unknown' : 'Submitted',
      fundsVal:   'Unknown — checking now',
      networkVal: active.network || '—',
      eventVal:   transferHash,
      actionVal:  'Checking transaction status. Do not retry yet.',
      actionHref: active.explorerUrl || explorerUrlFor(chainConfig, transferHash) || undefined,
      severity:   active.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? 'advisory' : undefined,
      autoOpen:   true,
    });

    // One re-query attempt — no retries.
    try {
      const provider  = new ethers.JsonRpcProvider(rpcUrl);
      const txReceipt = await provider.getTransactionReceipt(transferHash);

      if (txReceipt === null) {
        // Not found: still in mempool, dropped, or RPC sync lag.
        // Cannot distinguish without mempool access — keep hash evidence active.
        const unresolvedState = active.state === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? IX_TRANSFER_STATES.OUTCOME_UNKNOWN : IX_TRANSFER_STATES.SUBMITTED;
        window.IX.receipts.update(active.id, {
          state: unresolvedState,
          transferHash,
          hash: transferHash,
          explorerUrl: active.explorerUrl || explorerUrlFor(chainConfig, transferHash),
          fundsMoved: null,
          observationSource: REHYDRATION_SOURCE,
          lastKnownMessage: 'Transaction not yet confirmed. Verify on explorer before retrying.',
        });
        showHashUnresolved(unresolvedState, active, transferHash, chainConfig, 'Transaction not yet confirmed. Verify on explorer before retrying.');
        return;
      }

      if (txReceipt.status === 1) {
        // Confirmed on-chain.
        const explorerUrl = chainConfig.explorerUrl
          ? chainConfig.explorerUrl + '/tx/' + transferHash
          : null;

        window.IX.receipts.update(active.id, {
          state:       IX_TRANSFER_STATES.CONFIRMED,
          fundsMoved:  true,
          transferHash,
          hash:        transferHash,
          explorerUrl,
          blockNumber: txReceipt.blockNumber || null,
          observationSource: REHYDRATION_SOURCE,
          lastKnownMessage: 'Transfer confirmed. Funds moved.',
        });
        window.IX.receipts.clearActive();

        showCompanion(IX_TRANSFER_STATES.CONFIRMED, {
          statusLine: 'Transfer confirmed. Funds have moved.',
          stateVal:   'Confirmed',
          fundsVal:   'Yes — transfer complete',
          networkVal: active.network,
          eventVal:   transferHash,
          actionVal:  explorerUrl ? 'View on ' + chainConfig.name + ' explorer \u2197' : 'Transfer confirmed.',
          actionHref: explorerUrl || undefined,
          autoOpen:   true,
        });
        return;
      }

      if (txReceipt.status === 0) {
        // Reverted on-chain. Gas was consumed. Funds did not move.
        window.IX.receipts.update(active.id, {
          state: IX_TRANSFER_STATES.FAILED,
          fundsMoved: false,
          transferHash,
          hash: transferHash,
          observationSource: REHYDRATION_SOURCE,
          lastKnownMessage: 'Transaction reverted on-chain. Funds were not moved.',
        });
        window.IX.receipts.clearActive();

        showCompanion(IX_TRANSFER_STATES.FAILED, {
          statusLine: 'Transaction failed on-chain. Funds were not moved.',
          stateVal:   'Failed',
          fundsVal:   'No — gas may have been consumed',
          networkVal: active.network,
          eventVal:   transferHash,
          actionVal:  'Transaction reverted on-chain. Verify on Polygonscan before retrying.',
          autoOpen:   true,
        });
        return;
      }

      // Unknown status code — do not fabricate a terminal state.
      markOutcomeUnknown(active, transferHash, chainConfig, 'Network returned an unrecognised transaction status.');

    } catch (_) {
      // RPC error — cannot determine outcome. Keep receipt active for next load.
      markOutcomeUnknown(active, transferHash, chainConfig, 'Network query failed. Verify on explorer before retrying.');
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
    showCompanion(IX_TRANSFER_STATES.UNCLEAR, {
      statusLine: 'Transaction status is unclear.',
      stateVal:   'Unclear',
      fundsVal:   'Unknown — verify before retrying',
      networkVal: (receipt && receipt.network) || '—',
      eventVal:   reason,
      // No dramatization. No "may be lost." Factual direction only.
      actionVal:  'Verify on explorer before retrying. Do not assume the transfer failed.',
      autoOpen:   true,
    });
  }

  function markOutcomeUnknown(receipt, transferHash, chainConfig, reason) {
    const explorerUrl = (receipt && receipt.explorerUrl) || explorerUrlFor(chainConfig, transferHash);
    if (receipt && receipt.id) {
      window.IX.receipts.update(receipt.id, {
        state: IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
        transferHash,
        hash: transferHash,
        explorerUrl,
        fundsMoved: null,
        observationSource: REHYDRATION_SOURCE,
        lastKnownMessage: reason,
      });
    }
    showHashUnresolved(IX_TRANSFER_STATES.OUTCOME_UNKNOWN, receipt, transferHash, chainConfig, reason);
  }

  function showHashUnresolved(stateKey, receipt, transferHash, chainConfig, reason) {
    const explorerUrl = (receipt && receipt.explorerUrl) || explorerUrlFor(chainConfig, transferHash);
    showCompanion(stateKey, {
      statusLine: stateKey === IX_TRANSFER_STATES.SUBMITTED
        ? 'Transaction submitted. Verify on explorer before retrying.'
        : 'Outcome unknown. Verify on explorer before retrying.',
      stateVal:   stateKey === IX_TRANSFER_STATES.SUBMITTED ? 'Submitted' : 'Outcome unknown',
      fundsVal:   'Unknown — check explorer',
      networkVal: (receipt && receipt.network) || (chainConfig && chainConfig.name) || '—',
      eventVal:   transferHash,
      actionVal:  explorerUrl
        ? 'Check on ' + ((chainConfig && chainConfig.name) || 'network') + ' explorer \u2197'
        : reason,
      actionHref: explorerUrl || undefined,
      severity:   stateKey === IX_TRANSFER_STATES.OUTCOME_UNKNOWN ? 'advisory' : undefined,
      autoOpen:   true,
    });
  }

  function explorerUrlFor(chainConfig, transferHash) {
    return chainConfig && chainConfig.explorerUrl && transferHash
      ? chainConfig.explorerUrl + '/tx/' + transferHash
      : null;
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
