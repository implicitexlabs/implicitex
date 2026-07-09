# Coin Card Manifest Runtime Contract v1

Status: contract proposal

Purpose: define how a Coin Card runtime is allowed to use manifest integrity
evidence. This document does not implement runtime verification. It defines the
product boundary that future runtime verification must satisfy.

## Core Rule

A Coin Card may display degraded informational content when verification fails,
but it must not initiate `IX_EXECUTION.executeTransfer(...)` unless its manifest
state is `VERIFIED`.

The Python integrity tooling proves whether the package matches the issued
version. The runtime contract decides what the Coin Card is allowed to do with
that proof.

## Manifest Placement

For v1, a generated Coin Card package should publish its manifest at:

```text
coin-card-manifest.json
```

The manifest path is relative to the Coin Card package root.

Example package shape:

```text
coin-card-package/
  coin-card-manifest.json
  card/
    card.js
    card.css
  js/
    ix-execution.js
```

This placement keeps the manifest portable with the card package and avoids
binding v1 verification to a specific host, CDN, or application route.

## Manifest Reference

The Coin Card runtime must be able to locate the manifest before enabling
transfer execution.

The preferred v1 reference is a declarative manifest pointer on the card root:

```html
<div
  data-ix-coin-card
  data-ix-manifest="coin-card-manifest.json"
></div>
```

If the pointer is missing, empty, malformed, or unreachable, the runtime state
is `VERIFICATION_UNAVAILABLE`.

The runtime must not infer trust from filenames, timestamps, script URLs, or UI
appearance.

## Protected Assets v1

The v1 protected asset set is:

```text
card/card.js
card/card.css
js/ix-execution.js
```

These are protected because they control the rendered Coin Card surface, the
visible trust and interaction layer, and the shared transaction execution
boundary.

Future versions may add protected images, SVGs, generated artifacts, token CSS,
or receipt/proof wiring. Adding protected assets is a schema-compatible policy
change as long as the manifest lists exact paths, byte sizes, and SHA-256
hashes.

## Verification States

The runtime must eventually support these states:

| State | Meaning | Transfer execution |
| --- | --- | --- |
| `VERIFIED` | Manifest, protected assets, registry status, and signature checks pass. | Enabled |
| `INTEGRITY_FAILED` | A protected asset differs from the issued manifest. | Disabled |
| `CARD_REVOKED` | Registry status marks the card revoked. | Disabled |
| `VERIFICATION_UNAVAILABLE` | The manifest, protected assets, registry status, or signature cannot be validated. | Disabled |

Any state other than `VERIFIED` is non-executable.

## Verification Unavailable

`VERIFICATION_UNAVAILABLE` is not success with a warning. It means the runtime
cannot prove the Coin Card is the issued package.

Examples:

- manifest pointer missing
- manifest fetch failed
- manifest JSON invalid
- manifest schema unsupported
- required protected asset unavailable
- signature verifier unavailable
- registry status unavailable
- verification timed out

In this state, the Coin Card may show non-transactional information, but must
not call `IX_EXECUTION.executeTransfer(...)`.

## Runtime Gate

Before any transfer attempt, the Coin Card must check the current manifest
state:

```text
if manifestState !== VERIFIED:
    disable transfer execution
else:
    allow IX_EXECUTION.executeTransfer(...)
```

This gate applies to every path that can initiate wallet execution, including
primary buttons, alternate actions, keyboard shortcuts, embedded handlers, and
future agent-driven flows.

## Boundary With IX_EXECUTION

`IX_EXECUTION` owns wallet readiness, network switching, approval, transfer,
receipt polling, execution outcomes, and execution receipts.

The Coin Card owns whether it is allowed to submit a verified intent into
`IX_EXECUTION`.

Manifest verification must happen before the Coin Card submits an execution
request. `IX_EXECUTION` should not become responsible for proving Coin Card
package integrity.

## Boundary With Python Integrity Tooling

The Python integrity layer generates manifests, hashes protected assets,
validates card packages, and eventually signs or verifies integrity evidence.

The Python layer must not execute wallet actions or initiate blockchain
transactions.

## Non-Goals For v1

This contract does not define:

- production signing key custody
- browser-side signature implementation
- registry transport
- CDN deployment mechanics
- UI copy or visual badge design
- receipt/proof packet export
- paid customization policy

Those decisions can evolve without weakening the core execution rule:

```text
Only VERIFIED Coin Cards may initiate IX_EXECUTION.executeTransfer(...)
```
