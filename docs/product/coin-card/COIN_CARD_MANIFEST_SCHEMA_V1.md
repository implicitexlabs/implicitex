# Coin Card Manifest Schema v1

Status: proof schema

Purpose: define the first deterministic Integrity Manifest format for Coin Card integrity tooling. This schema is intentionally boring: it proves asset hashing and Integrity Manifest verification before production signing is introduced.

## Terminology

`coin-card-manifest.json` is the Coin Card **Integrity Manifest**. It describes
the issued package, protected assets, asset hashes, signature metadata, and
manifest hash.

`/registry/coincards/<id>.json` is the **Coin Card Registry Record**. It carries
runtime card facts such as recipient, display name, chain, token, card status,
and other registry-backed configuration.

Do not treat a Registry Record as cryptographic package integrity evidence.
Do not treat a loaded Integrity Manifest as execution permission until
verification marks the card `VERIFIED`.

## Boundary

The Python integrity layer answers:

> Is this exactly the Coin Card package ImplicitEx issued?

It does not execute wallet actions, submit transactions, poll receipts, or replace `IX_EXECUTION`.

## Integrity Manifest Object

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `schemaVersion` | string | Must be `coin-card-manifest.v1`. |
| `cardId` | string | Stable Coin Card identifier. |
| `coinCardVersion` | string | Coin Card runtime/version label. |
| `recipient` | string | Recipient wallet address declared by the approved generation workflow. |
| `network` | string | Network label for the card package. |
| `registryStatus` | string | Registry status, initially `active` or `revoked`. |
| `layoutVersion` | string | Canonical layout version. |
| `buildVersion` | string | Build label or release identifier. |
| `assets` | array | Protected asset entries. |
| `signature` | object | Signature metadata. Proof tooling accepts only `unsigned-dev`. |
| `manifestHash` | string | SHA-256 hash of the canonical manifest body excluding `manifestHash`. |

## Asset Entry

Each asset entry contains:

| Field | Type | Description |
| --- | --- | --- |
| `path` | string | Asset path relative to the verification root. Must not escape root. |
| `sha256` | string | `sha256:<hex>` digest of the exact asset bytes. |
| `bytes` | integer | Asset byte size. |

Asset entries are sorted by `path` by the generator.

## Signature Object

Proof tooling uses:

```json
{
  "mode": "unsigned-dev",
  "algorithm": null,
  "value": null
}
```

This is not production signing. It exists so the manifest shape has a stable place for future signature verification without pretending key custody already exists.

Future production manifests should replace this with a real signature mode and verifier-owned key policy.

## Canonical Hashing

`manifestHash` is computed by:

1. Copying the manifest object.
2. Removing `manifestHash`.
3. Serializing JSON with sorted keys and compact separators.
4. Hashing the UTF-8 bytes with SHA-256.
5. Prefixing the digest with `sha256:`.

Protected asset hashes are SHA-256 digests of raw file bytes, also prefixed with `sha256:`.

## Tooling

Generate:

```bash
python tools/coin-card-integrity/generate_manifest.py \
  --root app-web/frontend/public \
  --asset js/ix-execution.js \
  --asset card/coin-card-trusted-keys.js \
  --asset card/coin-card-verification.js \
  --asset card/card.js \
  --asset card/card.css \
  --out /tmp/coin-card-manifest.json \
  --card-id cc_demo_implicitex \
  --recipient 0x0000000000000000000000000000000000000000 \
  --network polygon-mainnet
```

Verify:

```bash
python tools/coin-card-integrity/verify_manifest.py \
  --root app-web/frontend/public \
  /tmp/coin-card-manifest.json
```

## Verification States

The runtime architecture reserves these states:

- `VERIFIED`: all checks pass.
- `INTEGRITY_FAILED`: protected assets changed.
- `CARD_REVOKED`: registry marks card revoked.
- `VERIFICATION_UNAVAILABLE`: manifest, assets, or signature cannot be validated.

The proof scripts currently report process success or failure. Runtime mapping to these states is future work.
