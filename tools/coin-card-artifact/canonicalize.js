'use strict';

/**
 * coin-card-canonical-json.v1 — Node.js adapter
 *
 * Thin consumer of the protocol primitive at:
 *   app-web/frontend/public/card/coin-card-canonical-json-v1.js
 *
 * That module is the single implementation of the coin-card-canonical-json.v1
 * algorithm.  This file adds computeArtifactHash() on top of it.
 *
 * No vm.  No cross-realm prototype handling.  Direct CommonJS require.
 */

const { createHash } = require('node:crypto');
const path = require('node:path');

const { canonicalizeJson } = require(
  path.resolve(__dirname, '../../app-web/frontend/public/card/coin-card-canonical-json-v1.js'),
);

/**
 * Compute artifact_hash for a CoinCardArtifact V1.
 *
 * Excludes integrity.artifact_hash and verification.value from the hash input,
 * per the schema $comment signing rule.
 *
 * @param {object} artifact - A full artifact object (integrity.artifact_hash and
 *                            verification.value may be present or absent; both are excluded).
 * @returns {string} "sha256:<64-char-hex>"
 */
function computeArtifactHash(artifact) {
  const input = JSON.parse(JSON.stringify(artifact));
  delete input.integrity.artifact_hash;
  delete input.verification.value;
  const canonical = canonicalizeJson(input);
  if (canonical === null) {
    throw new Error(
      'computeArtifactHash: canonicalization returned null — input contains non-canonical data',
    );
  }
  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = { canonicalizeJson, computeArtifactHash };
