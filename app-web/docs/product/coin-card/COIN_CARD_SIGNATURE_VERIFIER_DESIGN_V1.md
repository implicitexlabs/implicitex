# Coin Card Signature Verifier Design v1

Status: design contract

Purpose: define the first real signature verification design for Coin Card
Integrity Manifests. This document chooses the browser-verifiable signature
shape and the canonical data to verify. It does not introduce private keys or
production signing material.

## Design Goal

The runtime must be able to decide whether a supported signature is valid
without inventing trust in the browser. The verifier should be boring,
deterministic, and compatible with Web Crypto.

## Selected Algorithm

v1 should use `ECDSA` with `P-256` and `SHA-256`.

Reasoning:

- broadly supported in browser Web Crypto
- well understood and practical for client-side verification
- avoids the deployment friction of less universally supported schemes

## Signature Mode

The signature mode name for v1 should be:

```text
signed-p256-v1
```

This mode name identifies the algorithm family and the contract version.

## Canonical Signed Payload

The signed payload should be the Integrity Manifest body excluding:

- `signature`
- `manifestHash`

The signed payload must be canonical JSON, with stable key ordering and stable
string encoding before signing or verification.

The manifest hash may continue to cover the full manifest payload excluding only
`signature`, but the signature verifier must treat the canonical payload
explicitly and consistently.

## Public Key Shape

The manifest or registry should identify the public key by a `keyId`.

Required fields for v1 verifier support:

- `signature.mode`
- `signature.algorithm`
- `signature.keyId`
- `signature.value`

The browser verifier may use `keyId` to select a trusted public key from a
future key registry or embedded allowlist.

## Failure Mapping

| Condition | Result |
| --- | --- |
| Signature mode missing | `VERIFICATION_UNAVAILABLE` |
| Signature mode unsupported | `VERIFICATION_UNAVAILABLE` |
| Signature verifier unavailable | `VERIFICATION_UNAVAILABLE` |
| Signature present but invalid | `INTEGRITY_FAILED` |
| Signature valid with supported mode | `VERIFIED` |

`unsigned-dev` remains a non-production evidence mode and must never become
`VERIFIED`.

## Key Rotation

Key rotation is out of scope for the first implementation, but the verifier
design should assume it will eventually be needed. The `keyId` field exists so
the trust root can move without changing the manifest contract.

## Security Boundaries

- No private keys in the repo.
- No browser-side signing.
- No implicit trust from registry metadata.
- No promotion from hash consistency to trust without a real verifier.

## Next Implementation Target

Add a verifier function that can consume:

- a canonical payload
- a `signature.mode`
- a public key lookup by `keyId`
- a browser Web Crypto verification primitive

and return the policy result without changing the execution gate contract.
