/**
 * coincard-registry-read-spike.js
 *
 * Minimal registryRead HTTP Function for the Hosting rewrite routing proof.
 *
 * PURPOSE: Proves that Firebase Hosting routes /registry/coincards/<handle>.json
 * correctly — serving exact static files without invoking this function, and
 * falling through to this function for handles that have no static file.
 *
 * THIS IS NOT THE PRODUCTION FUNCTION. It proves routing behavior only.
 * It does not:
 *   - Use Cloud KMS-signed artifacts
 *   - Enforce full lifecycle record schema
 *   - Apply rate limiting or authentication
 *   - Implement cache policies for production use
 *
 * What it DOES do, to make routing proof meaningful:
 *   - Reads from the spike_registry Firestore collection (isolated from production)
 *   - Handles all 6 lifecycle states the production function must handle
 *   - Verifies artifact hash matches Firestore record (catches Storage/Firestore split-brain)
 *   - Sets X-Spike-Source: function header so the verify script can distinguish
 *     function responses from static-file responses without ambiguity
 *   - Logs each invocation to spike_invocations (structured evidence)
 *
 * MUST REMAIN UNCHANGED (do not modify these to make spike tests pass):
 *   - Production Hosting channels and firebase.json
 *   - Existing static registry JSON files
 *   - coin-card-lifecycle-record-verification.js and related browser modules
 *
 * Run with: firebase emulators:start --config firebase.routing-spike.json --project demo-spike
 * Seed fixtures: node backend/scripts/spikes/hosting-rewrite/seed-fixtures.js
 * Verify: node backend/scripts/spikes/hosting-rewrite/verify.js
 */

'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('node:crypto');

// Spike-specific Firestore collection. Never collides with any production collection.
const SPIKE_REGISTRY_COLLECTION = 'spike_registry';
// Spike-specific invocation log. Used by verify.js to confirm function was/was not called.
const SPIKE_INVOCATIONS_COLLECTION = 'spike_invocations';

// Handle path pattern: /registry/coincards/<handle>.json
const HANDLE_RE = /^\/registry\/coincards\/([A-Za-z0-9_-]+)\.json$/;

exports.spikeRegistryRead = onRequest(
  { region: 'us-central1', cors: false },
  async (req, res) => {
    const match = req.path.match(HANDLE_RE);
    if (!match) {
      await logInvocation(null, null, 400);
      res.status(400).json({ error: 'invalid_path' });
      return;
    }
    const handle = match[1];

    const db = admin.firestore();

    // Read the registry record from the spike collection.
    let doc;
    try {
      doc = await db.collection(SPIKE_REGISTRY_COLLECTION).doc(handle).get();
    } catch (err) {
      console.error('spike:firestore_read_error', { handle, err: err.message });
      await logInvocation(handle, null, 503);
      res.status(503).json({ error: 'internal_error' });
      return;
    }

    if (!doc.exists) {
      console.log('spike:not_found', { handle });
      await logInvocation(handle, null, 404);
      res.setHeader('X-Spike-Source', 'function');
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const record = doc.data();
    const registryStatus = record.registry_status;
    console.log('spike:record_found', { handle, registry_status: registryStatus });

    // Fail closed on in-progress publication — do not serve partial state.
    if (registryStatus === 'PENDING_PUBLICATION') {
      await logInvocation(handle, registryStatus, 503);
      res.setHeader('X-Spike-Source', 'function');
      res.status(503).json({ error: 'pending_publication' });
      return;
    }

    // All other states (ACTIVE, REVOKED, PAUSED) require a verified artifact.
    const artifactUri = record.artifact_uri;
    const expectedHash = record.artifact_hash; // sha256:<base64url>

    if (!artifactUri || !expectedHash) {
      console.error('spike:missing_artifact_metadata', { handle, registryStatus });
      await logInvocation(handle, registryStatus, 503);
      res.setHeader('X-Spike-Source', 'function');
      res.status(503).json({ error: 'internal_inconsistency' });
      return;
    }

    // Read the artifact from Storage and verify its hash.
    let artifactBytes;
    try {
      const bucket = admin.storage().bucket();
      const [contents] = await bucket.file(artifactUri).download();
      artifactBytes = contents;
    } catch (err) {
      console.error('spike:storage_read_error', { handle, artifactUri, err: err.message });
      await logInvocation(handle, registryStatus, 503);
      res.setHeader('X-Spike-Source', 'function');
      res.status(503).json({ error: 'internal_inconsistency' });
      return;
    }

    // Hash verification: proves the artifact in Storage matches the Firestore record.
    // If these disagree, fail closed — do not serve potentially stale or mismatched data.
    const actualHash = 'sha256:' + crypto
      .createHash('sha256')
      .update(artifactBytes)
      .digest('base64url');

    if (actualHash !== expectedHash) {
      console.error('spike:hash_mismatch', {
        handle,
        expected: expectedHash,
        actual: actualHash,
      });
      await logInvocation(handle, registryStatus, 503);
      res.setHeader('X-Spike-Source', 'function');
      res.status(503).json({ error: 'internal_inconsistency' });
      return;
    }

    // Serve the artifact. The content-type and cache headers are set to match
    // what the production function will use.
    await logInvocation(handle, registryStatus, 200);
    res.setHeader('X-Spike-Source', 'function');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Short cache for production; immediate for the spike so tests see fresh state.
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.status(200).send(artifactBytes);
  }
);

// Write an invocation record to Firestore so the verify script can query
// which handles were routed to this function vs. served as static files.
async function logInvocation(handle, registryStatus, responseStatus) {
  try {
    const db = admin.firestore();
    await db.collection(SPIKE_INVOCATIONS_COLLECTION).add({
      handle,
      registry_status: registryStatus,
      response_status: responseStatus,
      invoked_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Best-effort only — invocation logging must not affect the response.
    console.warn('spike:invocation_log_failed', { handle, err: err.message });
  }
}
