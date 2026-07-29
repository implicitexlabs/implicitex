'use strict';

/**
 * GCP KMS-backed Ed25519 signer for production use.
 *
 * Conforms to the signer interface required by buildJws():
 *   { keyId: string, algorithm: 'EdDSA', sign(Buffer): Promise<Buffer> }
 *
 * Prerequisites:
 *   - GCP KMS key version configured with:
 *       purpose:   ASYMMETRIC_SIGN
 *       algorithm: EC_SIGN_ED25519
 *   - @google-cloud/kms installed (production dependency, not required for CC-002.2 tests)
 *   - The signing key private key material never leaves GCP KMS hardware.
 *
 * Key version name format:
 *   projects/{project}/locations/{location}/keyRings/{ring}/cryptoKeys/{key}/cryptoKeyVersions/{version}
 *
 * GCP KMS Ed25519 behavior:
 *   - Pass raw signing-input bytes in the `data` field (not `digest`).
 *   - GCP KMS handles the Ed25519 algorithm internally.
 *   - The returned signature is a raw 64-byte Ed25519 signature.
 *   - Per Constitution Section 13 (signing key security): private key material
 *     never reaches application memory; only the 64-byte signature is returned.
 *
 * KMS adapter maintenance note:
 *   Upgrade review required if the Functions project changes GCP project,
 *   region, KMS key ring, Node runtime, or @google-cloud/kms major version.
 */

/**
 * Create a production signer backed by a GCP KMS Ed25519 key version.
 *
 * @param {object} options
 * @param {object} options.client           - Initialized @google-cloud/kms KeyManagementServiceClient.
 * @param {string} options.keyVersionName   - Fully-qualified KMS key version resource name.
 * @param {string} options.keyId            - Short identifier matching signingKeyId in manifests.
 * @returns {Readonly<object>}  Signer conforming to the buildJws signer interface.
 */
function createGcpKmsEd25519Signer({ client, keyVersionName, keyId }) {
  if (client === null || typeof client !== 'object' || typeof client.asymmetricSign !== 'function') {
    throw new TypeError(
      'client must be an initialized @google-cloud/kms KeyManagementServiceClient',
    );
  }
  if (typeof keyVersionName !== 'string' || keyVersionName.length === 0) {
    throw new TypeError('keyVersionName must be a non-empty string');
  }
  if (typeof keyId !== 'string' || keyId.length === 0) {
    throw new TypeError('keyId must be a non-empty string');
  }

  return Object.freeze({
    keyId,
    algorithm: 'EdDSA',

    /**
     * Sign the JWS signing input bytes via GCP KMS EC_SIGN_ED25519.
     *
     * @param {Buffer} signingInput  - ASCII bytes of `<protected>.<payload>`.
     * @returns {Promise<Buffer>}    64-byte raw Ed25519 signature.
     * @throws                       On KMS API error or missing/malformed response.
     */
    async sign(signingInput) {
      const [result] = await client.asymmetricSign({
        name: keyVersionName,
        data: signingInput,
      });

      if (!result || !result.signature) {
        throw new Error(
          `GCP KMS asymmetricSign for key "${keyId}" returned no signature`,
        );
      }

      const sig = Buffer.isBuffer(result.signature)
        ? result.signature
        : Buffer.from(result.signature);

      if (sig.length !== 64) {
        throw new Error(
          `GCP KMS returned ${sig.length} signature bytes for Ed25519 key "${keyId}"; expected 64`,
        );
      }

      return sig;
    },
  });
}

module.exports = Object.freeze({ createGcpKmsEd25519Signer });
