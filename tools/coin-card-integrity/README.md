# Coin Card Integrity Proof Tooling

Status: proof tooling, not production signing infrastructure.

These scripts establish the first deterministic Coin Card manifest and asset
hash verification flow. The goal is to prove the integrity boundary before
introducing key custody, release signing, registry publishing, or runtime UI
states.

The Python integrity layer answers one question:

> Is this exactly the Coin Card package ImplicitEx issued?

It does not execute wallet actions, submit transactions, poll receipts, or
replace `IX_EXECUTION`.

## Generate a Manifest

```bash
python tools/coin-card-integrity/generate_manifest.py \
  --root app-web/frontend/public \
  --asset js/ix-execution.js \
  --asset js/vendor/qrcode.min.js \
  --asset card/coin-card-trusted-keys.js \
  --asset card/coin-card-trusted-key-resolution.js \
  --asset card/coin-card-canonical-json-v1.js \
  --asset card/coin-card-lifecycle-registry.js \
  --asset card/coin-card-lifecycle-record-verification.js \
  --asset card/coin-card-lifecycle-bundle-verification.js \
  --asset card/coin-card-lifecycle-record-selection.js \
  --asset card/coin-card-lifecycle-resolution.js \
  --asset card/coin-card-lifecycle-presentation.js \
  --asset card/coin-card-execution-authorization.js \
  --asset card/coin-card-review-projection-contract.js \
  --asset card/coin-card-verification.js \
  --asset card/card.js \
  --asset card/card.css \
  --asset card/index.html \
  --out /tmp/coin-card-manifest.json \
  --card-id cc_demo_implicitex \
  --recipient 0x0000000000000000000000000000000000000000 \
  --network polygon-mainnet
```

The generator writes deterministic JSON containing protected asset paths,
SHA-256 hashes, byte sizes, manifest metadata, signature metadata, and a
canonical `manifestHash`.

## Verify a Manifest

```bash
python tools/coin-card-integrity/verify_manifest.py \
  --root app-web/frontend/public \
  /tmp/coin-card-manifest.json
```

The verifier checks:

- manifest schema version
- required manifest fields
- canonical `manifestHash`
- root-safe asset paths
- asset existence
- SHA-256 asset hashes
- asset byte sizes
- supported signature mode

Any asset byte change should cause verification to fail.

## Repeatable Repo Check

From `app-web`:

```bash
npm run test:coin-card-integrity
```

This check compiles the Python files, generates and verifies
`coin-card-manifest.json` against real Coin Card assets, confirms the generated
manifest filename matches the runtime `data-ix-manifest` pointer, confirms the
v1 protected asset list, then copies those assets to a temporary directory,
modifies `card/coin-card-trusted-keys.js`, and requires verification to fail.

## `unsigned-dev`

The proof manifest uses:

```json
{
  "mode": "unsigned-dev",
  "algorithm": null,
  "value": null
}
```

This is intentional. It gives the manifest a stable signature shape without
pretending production signing, private key custody, rotation, or trust policy
already exists.

## Production Signing Later

Production signing will need a separate design for:

- signing algorithm and canonical payload
- private key custody
- public verification keys
- key rotation and revocation
- registry publication
- card revocation checks
- build pipeline integration
- runtime mapping to verification states

Until that exists, `unsigned-dev` is the only accepted signature mode for these
proof scripts.
