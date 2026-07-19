# Coin Card Origin Bootstrap and Signer Rotation Contract v1

Status: contract proposal

Purpose: define how canonical ImplicitEx-hosted Coin Card runtimes bootstrap
trusted signing keys, how signer rotation is authorized, and what the manifest
and lifecycle signatures do and do not prove.

## Bootstrap Authority

The canonical ImplicitEx HTTPS deployment origin is the initial release trust
boundary for the hosted Coin Card runtime.

`card/coin-card-trusted-keys.js` is trusted at initial load because it is served
by that canonical release origin. The browser loads this file before manifest
signature verification, and manifest verification uses the trusted-key records
from that file to resolve the manifest signer.

`card/coin-card-trusted-keys.js` is also listed as a protected manifest asset.
That listing detects package inconsistency after bootstrap, but it does not
independently authenticate the trusted-key source before the source is used.

There is no v1 cryptographic chain in which the old manifest signer authorizes a
new manifest signer unless a transition artifact is actually signed by the old
signer. A signer transition without the old private key is an origin-governed
release transition, not cryptographic succession from the old signer.

## Signature Scope

The manifest signature proves that a trusted manifest signer signed the exact
runtime package manifest, including protected asset paths, byte sizes, hashes,
build metadata, issuer, environment, and signer identity.

The lifecycle signature proves that a trusted lifecycle publication signer signed
the lifecycle record for a card, including the card identifier, manifest hash,
registry identity, registry version, lifecycle status, and publication timing.

Together, these signatures protect against asset mismatch, stale or partial
packages, unknown signers, invalid lifecycle binding, and accidental or
unauthorized package mutation short of compromise of the canonical release
origin.

They do not protect against an attacker who controls the canonical deployment
channel and can replace the trusted-key bootstrap, verifier, manifest, lifecycle
bundle, and runtime together.

## Hosting Boundary

Canonical ImplicitEx-hosted Coin Cards are authoritative under this model.
Third-party sites may link to or frame the canonical hosted card.

Hosts must not copy, alter, or locally reinterpret the trusted Coin Card runtime
and still represent it as currently ImplicitEx-verified. Arbitrarily self-hosted
copies cannot claim current ImplicitEx authority solely from a bundled trusted
key file.

Future self-hosted authority requires an independently authenticated external
trust source, such as a signed key registry or another verifiable distribution
mechanism. That design is deferred.

## Key Identity

One key ID permanently identifies one public-key identity. Public-key coordinates
must never be replaced under an existing key ID.

A new public key requires a new key ID. Manifest-signing and lifecycle-publication
usage remain distinct.

Manifest-signing and lifecycle-publication authority also require distinct
keypairs. Separate key IDs are not sufficient. The same P-256 public identity
must not be assigned to both usages under different labels.

The next routine rotation IDs are:

- `ix-coin-card-manifest-v2`
- `ix-lifecycle-pub-v2`

The v1 IDs remain:

- `ix-coin-card-manifest-v1`
- `ix-lifecycle-pub-v1`

## Transition Requirements

During a routine origin-governed transition, v1 and v2 public records coexist in
the protected trusted-key source for the rollback window.

New production artifacts use v2 signer IDs. v1 remains available for rollback
verification. The transition trusted-key source does not imply that v1
cryptographically authorized v2; deployment governance authorizes introducing
v2.

Removing, expiring, or revoking v1 is a later explicit milestone. Routine
rotation must not delete rollback roots by default.

Generator behavior must make preservation the safe default. When the trusted-key
output already exists, the generator must load and preserve its records
automatically. An additional preservation source may be supplied for controlled
transition fixtures, but conflicts between the existing output and the
preservation source must fail closed.

Fresh trust-set initialization is a governed exceptional action and requires an
explicit initialization flag. It must not be available accidentally through an
empty output path. The reserved production v1 IDs must never be initialized or
rebound to new public-key coordinates.

Acceptance evidence for a transition package requires actual cryptographic
verification of the generated manifest and lifecycle signatures. Resolving a
signer ID from a trusted-key source is necessary but not sufficient.

The generator must construct and validate the complete package in memory before
changing destination files. Its working-tree writes must be failure-atomic to the
documented extent for caught generator errors: trusted-key source, manifest, and
lifecycle bundle are prepared together, internally verified, and guarded against
stale source and destination inputs before promotion. Every existing package
destination and every separate preservation source is guarded by existence,
byte-size, and SHA-256 evidence. If a caught validation, write, or promotion
error occurs, the generator restores the captured prior destination bytes.

This is caught-error package rollback, not global filesystem transactionality.
It does not guarantee recovery from process termination, host crash, power loss,
filesystem corruption, or concurrent external writers after the final guard
check. Release and deployment atomicity remain the responsibility of the
canonical hosting process.

The generator must reject output path aliasing before reading signing secrets or
creating output files. Path identity is derived by resolving the nearest
existing filesystem ancestor and appending remaining path components, so aliases
through symlinked ancestors, relative components, and nonexistent child
directories are detected. Manifest, trusted-key, and lifecycle outputs must be
pairwise distinct and must not overwrite private-key inputs. Preservation sources
must not collide with private-key inputs or with manifest/lifecycle outputs. The
trusted-key output may serve as its own preservation source; that is the intended
automatic preservation path.

Trusted-key preservation sources are parsed as restricted data. The loader runs
in a minimal VM context, disables string and Wasm code generation, applies an
execution timeout, and then validates the exported trusted-key source through
descriptor inspection. Symbol keys, accessors, functions, custom prototypes,
sparse arrays, cycles, excessive depth, excessive object counts, and private JWK
material are rejected before semantic key-record fields are read.

## Deployment Sequence

1. Generate v2 manifest and lifecycle keypairs in a controlled environment.
2. Record public fingerprints and custody metadata without recording private key
   material.
3. Add v2 public records while preserving v1 records.
4. Generate a transition trusted-key bootstrap containing v1 and v2.
5. Generate the final manifest including the corrected runtime source, the
   review-projection contract asset, and the transition trusted-key source.
6. Sign the manifest with the v2 manifest key.
7. Generate and sign the lifecycle record with the v2 lifecycle key, bound to the
   exact v2 manifest hash.
8. Validate the complete package offline.
9. Deploy trusted keys, manifest, lifecycle bundle, and protected assets as one
   release.
10. Use immutable or cache-busted release URLs, or an equivalent release-atomic
    deployment mechanism.
11. Verify the canonical hosted surface.
12. Preserve the previous complete v1 release for rollback.
13. Do not remove v1 public records during the initial transition.
14. Retire v1 only in a later governed milestone.

## Cache and Partial Deployment Behavior

A stale v1 trusted-key bootstrap with a v2-signed manifest must fail closed with
an unknown or unavailable signer outcome.

A transition trusted-key bootstrap containing v1 and v2 can verify either v1 or
v2 artifacts, subject to matching asset hashes and lifecycle binding.

A v2-only bootstrap breaks rollback to v1 artifacts and must not be deployed
until rollback through v1 is no longer required.

A stale manifest with a transition bootstrap remains valid only if the stale
manifest's signer is still trusted and all protected asset hashes match the
served assets. Otherwise verification fails closed.

Mixed packages must fail closed. A manifest signed for one trusted-key source
does not authenticate a different trusted-key source, and a lifecycle record
bound to one manifest hash does not authenticate another manifest.

## Failure and Incident Classes

Unavailable key: the key is not present in the current environment, but custody
may still exist. Do not rotate until custody is audited or recovery is ruled out.

Lost key: custody cannot be recovered. Use an origin-governed rotation with new
key IDs and a transition trust set.

Compromised key: use governed revocation. Compromised-key response may require
`INVALIDATE_ALL_SIGNATURES` and removal from rollback trust after evidence is
preserved.

Suspected compromise: preserve evidence, stop signing with the suspected key,
publish a transition or revocation plan, and choose revocation policy based on
incident severity.

Compromised canonical deployment origin: outside the protection offered by an
in-package trusted-key bootstrap. Recovery requires deployment-channel incident
response, not only key rotation.

## Prohibitions

- Do not replace public-key coordinates under an existing key ID.
- Do not claim v1 cryptographically authorized v2 without a v1-signed transition
  artifact.
- Do not add a bootstrap key in another mutable file in the same package and
  call it independent trust.
- Do not generate production private keys through the production generator.
- Do not remove rollback trust roots during the initial transition.
- Do not initialize a fresh production trust set without an explicit governed
  action.
- Do not accept signer lookup alone as proof of artifact authenticity.
- Do not treat self-hosted copied runtimes as currently ImplicitEx-authoritative.
