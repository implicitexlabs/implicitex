'use strict';

/**
 * build-and-publish-artifact.js — orchestrated build + CAS publication
 *
 * Wraps build-artifact.js and publish-artifact.js with operation-level
 * idempotency: the operation fingerprint is computed from the domain state
 * before the builder runs, so a retry that executes at a different clock time
 * (and would therefore produce a different issued_at and artifact_hash) is
 * still recognized as a duplicate of an already-committed operation and returns
 * the existing publication without manufacturing a new artifact version.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FAILURE MODE THIS PREVENTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   T=0:  caller requests publication of unchanged V5 business state
 *           builder produces artifact with issued_at=T0, artifact_hash=AAA
 *           CAS commits: head advances to V5 (hash=AAA)
 *           HTTP response is lost
 *
 *   T=5:  caller retries
 *           without operation-level idempotency:
 *             builder runs again with issued_at=T5 → artifact_hash=BBB
 *             CAS check: predecessor (AAA) matches head ✓
 *             CAS commits: head advances to V6 (hash=BBB)
 *             V6 now exists from unchanged business state — WRONG
 *
 *           with operation-level idempotency (this module):
 *             operation fingerprint computed: same domain state → same fingerprint
 *             store.getPublicationByOperationFingerprint() → returns V5 publication
 *             builder never runs
 *             { ok: true, publication: V5, idempotent: true } returned
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EXECUTION FLOW
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. Compute operation_fingerprint from domainState (no clock, no signing).
 *  2. Check store for existing publication under that fingerprint.
 *       → found: return { ok: true, publication, idempotent: true }  (skip build)
 *  3. Build the artifact (10-step builder pipeline).
 *  4. Publish via CAS commit, passing operation_fingerprint.
 *       The store also checks the fingerprint at commit time to catch the case
 *       where two concurrent identical requests both passed step 2 before either
 *       committed — only one can commit, the other gets { idempotent: true }.
 *  5. Return the publication result.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   buildAndPublishArtifact(domainState, issuerInfrastructure, storeOptions)
 *
 *   domainState          — same shape as buildCoinCardArtifact's first argument
 *   issuerInfrastructure — same shape as buildCoinCardArtifact's second argument
 *   storeOptions:
 *     store              — InMemoryPublicationStore (or production equivalent)
 *     clock              — { now: () => string }
 *     allowUnsignedDev   — default false
 *
 * Returns:
 *   { ok: true,  publication, idempotent: false }  fresh commit
 *   { ok: true,  publication, idempotent: true  }  operation already committed
 *   { ok: false, code, message }                   build or CAS failure
 */

const path = require('node:path');

const { buildCoinCardArtifact } =
  require('./build-artifact.js');
const { publishArtifact } =
  require('./publish-artifact.js');
const { computePublicationOperationFingerprint } =
  require('./publication-operation-fingerprint.js');

// ─────────────────────────────────────────────────────────────────────────────
// buildAndPublishArtifact
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} domainState
 *   @param {object}      coinCard
 *   @param {object}      walletRoute
 *   @param {object}      lifecycle
 *   @param {object}      presentation
 *   @param {object|null} [previousArtifact=null]
 *
 * @param {object} issuerInfrastructure
 *   @param {object}   signer
 *   @param {object}   clock
 *   @param {object}   [freshnessPolicy]
 *
 * @param {object} storeOptions
 *   @param {object}  storeOptions.store
 *   @param {object}  storeOptions.clock
 *   @param {boolean} [storeOptions.allowUnsignedDev=false]
 *
 * @returns {Promise<
 *   | { ok: true, publication: object, idempotent: boolean }
 *   | { ok: false, code: string, message: string }
 * >}
 */
async function buildAndPublishArtifact(
  domainState,
  issuerInfrastructure,
  storeOptions,
) {
  const { store, clock, allowUnsignedDev = false } = storeOptions || {};

  // ─── Input guard ──────────────────────────────────────────────────────────
  if (!store || typeof store.commitPublication !== 'function') {
    return { ok: false, code: 'BUILD_PUBLISH_STORE_INVALID', message: 'store must implement commitPublication()' };
  }
  if (!clock || typeof clock.now !== 'function') {
    return { ok: false, code: 'BUILD_PUBLISH_CLOCK_INVALID', message: 'clock.now must be a function' };
  }

  const { coinCard, walletRoute, lifecycle, presentation, previousArtifact = null } = domainState || {};

  // ─── Step 1: Compute operation fingerprint ────────────────────────────────
  // Derived from domain state only — no clock, no signing, no artifact_hash.
  // Same domain state at any clock time → same fingerprint.

  let operationFingerprint;
  try {
    operationFingerprint = computePublicationOperationFingerprint({
      cardId:                  coinCard && coinCard.id,
      predecessorArtifactHash: previousArtifact ? previousArtifact.integrity.artifact_hash : null,
      walletRouteId:           walletRoute && walletRoute.id,
      lifecycleStatus:         lifecycle && lifecycle.status,
      displayName:             presentation && presentation.displayName,
      theme:                   presentation && (presentation.theme != null ? presentation.theme : null),
    });
  } catch (err) {
    return {
      ok:      false,
      code:    'BUILD_PUBLISH_FINGERPRINT_FAILED',
      message: 'computePublicationOperationFingerprint threw: ' + String(err),
    };
  }

  // ─── Step 2: Early idempotency check ─────────────────────────────────────
  // If this exact operation has already been committed, return the existing
  // publication without running the builder.  This is an optimization —
  // the store also checks at commit time to handle concurrent requests that
  // both pass this check before either commits.

  const existing = store.getPublicationByOperationFingerprint(operationFingerprint);
  if (existing) {
    return { ok: true, publication: existing, idempotent: true };
  }

  // ─── Step 3: Build ───────────────────────────────────────────────────────

  const buildResult = await buildCoinCardArtifact(domainState, issuerInfrastructure);
  if (!buildResult.ok) {
    return buildResult;
  }

  // ─── Step 4: Publish (CAS commit with operation fingerprint) ─────────────
  // The store checks the operation_fingerprint again at commit time, catching
  // the case where two concurrent identical requests both passed step 2 before
  // either committed.

  return publishArtifact(buildResult.artifact, {
    store,
    clock,
    allowUnsignedDev,
    operationFingerprint,
  });
}

module.exports = { buildAndPublishArtifact };
