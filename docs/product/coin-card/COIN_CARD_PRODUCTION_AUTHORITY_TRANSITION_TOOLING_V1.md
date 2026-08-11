# Coin Card Production Authority Transition Tooling v1

Date: 2026-08-11

Status: repository implementation complete; production ceremony not authorized.

## Authority roles

Production signing entrypoints are bound to four independent roles:

| Role | Trusted usage | Planned key ID |
| --- | --- | --- |
| Protected manifest | `coin-card-manifest-signing` | `ix-coin-card-manifest-kms-v1` |
| Registry publication | `coin-card-registry-publication` | `ix-coin-card-registry-publication-kms-v1` |
| Executable Current Head | `coin-card-executable-registry-head` | `ix-coin-card-executable-head-kms-v1` |
| Transaction Evidence | `coin-card-transaction-evidence` | `ix-coin-card-transaction-evidence-kms-v1` |

Each role accepts only its existing domain-separated wire contract. The
manifest role alone may sign the raw canonical manifest payload. Key IDs and
full CryptoKeyVersion resources must be one-to-one across the signer set.

Lifecycle and username publication remain one registry-publication authority
class. The cryptographic primitive is reusable, but the role-bound wrapper
prevents an artifact generator from asking it to sign another role's domain.

## Publication order

Authority publishers preserve this transaction order:

```text
construct and sign immutable artifact
→ persist immutable bytes
→ read back
→ independently verify signature, hash, and bindings
→ construct/sign Current Head when applicable
→ persist and independently verify the head
→ enforce monotonic revision/sequence
→ compare-and-swap current pointer
→ read back current pointer
```

Transaction Evidence is immutable and has no standalone Current Head. Before
signing, its lifecycle and executable inputs must pass an injected independent
verifier. Their artifact hashes are recomputed, and publication reads back and
verifies the complete evidence envelope.

## Non-publishing KMS smoke driver

`app-web/scripts/coin-card-authority/kms-nonpublishing-smoke.js` is the only
live-KMS smoke entrypoint in this milestone. It requires an explicit project,
full CryptoKeyVersion resource, key ID, exact authority usage, reviewed UTC
time, empty system-temporary output directory, and `--no-publish`.

It verifies the exact KMS resource and `EC_SIGN_P256_SHA256` algorithm, obtains
the public key, derives its public coordinates/fingerprint, builds a temporary
v3 trusted-key candidate, signs a domain-appropriate non-published artifact,
converts KMS DER to strict 64-byte IEEE-P1363, verifies it, and proves tampering
fails. It has no publisher or Current Head capability and guards the checked-in
manifest, trusted-key source, and lifecycle bundle against modification.

Smoke output is permitted only beneath the system temporary directory. Its
markers and filenames are forbidden by both deployable-root leakage gates.

## Transition proof

Tests model the two separately signed releases using only generated test keys:

- BRIDGE retains legacy public records, adds four v3 KMS candidates, and signs
  the manifest/lifecycle state with modeled legacy authorities.
- ACTIVATION signs the manifest, registry publication, executable Current Head,
  and Transaction Evidence with four distinct modeled KMS roles and verifies
  the complete hash/identity conjunction.

Legacy public keys remain in the overlap set. No test invokes recovered
production signers, Cloud KMS, publication, deployment, DNS, or execution.
