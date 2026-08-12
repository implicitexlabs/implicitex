# Holder control-plane persistence

This module persists Coin Card holder intent and activation prerequisites. It is a local/non-production control plane, not Coin Card public or execution authority.

## Storage layout

All direct Firestore client reads and writes are denied. Backend-mediated transactions use these documents:

| Collection | Document key | Purpose |
| --- | --- | --- |
| `coinCardHolderAccounts` | opaque `accountId` | One account's nullable username/card binding and readiness summary |
| `coinCardHolderUsernameClaims` | canonical username | Reservation and permanent-allocation uniqueness lock |
| `coinCardHolderReservations` | opaque `reservationId` | Short-lived reservation history and allocation result |
| `coinCardHolderCards` | opaque `cardId` | Presentation draft, route intent, evidence reference, entitlement, and readiness |
| `coinCardHolderOperations` | SHA-256 of account + operation ID | Canonical request fingerprint and immutable idempotent result |
| `coinCardHolderEvidenceUses` | wallet proof ID | Single-use binding of a genuine wallet proof to one route revision |

No collection stores or writes a public username Current Head, executable-registry Current Head, signed lifecycle state, Transaction Evidence, or execution capability.

`coinCardHolderUsernameClaims` may contain a backend-maintained `TOMBSTONED` or `PERMANENTLY_HELD` availability projection, but this module exposes no operation that creates either state. A later integration must derive those terminal claims from genuine read-only public authority; holder input cannot manufacture them.

## Transaction rules

- Username reservation reads the account, username claim, and operation record in one transaction. A username-keyed document permits at most one live winner.
- A live reservation is idempotent for its owning account. An expired, unallocated reservation can be replaced. Allocated, tombstoned, and permanently held claims never expire through the reservation API.
- Identity allocation consumes the exact owned reservation and atomically writes the account, username claim, reservation, and opaque card record.
- Presentation and route writes require expected prior revisions inside the transaction.
- Route changes clear any attached wallet-evidence reference. Evidence must be freshly rebound to the exact new route revision.
- A wallet verifier result is privately branded by the existing challenge service, then bound to the current card/token/route revision. Its proof ID can be attached only once, so evidence from an earlier route revision cannot be rebound after a route change.
- Every mutation is bound to a strict Coin Card holder principal and a canonical request fingerprint. Reusing an operation ID with different input is a conflict.

## Readiness boundary

The service derives `ACTIVATION_READY` only when the persisted account/card conjunction, presentation, fixed Polygon USDC route, exact current wallet evidence, and injected commercial entitlement are complete.

It deliberately stores:

```text
authoritativeLifecycleState: null
authoritativeStateSource: EXTERNAL_READ_ONLY_NOT_STORED
executionEligible: false
```

Public status is still loaded by the existing public read-only adapter. It is valid for the control plane to be `ACTIVATION_READY` while public resolution remains `UNKNOWN`.

## Authentication and deployment boundary

The current service accepts an injected, authenticated non-production principal with an opaque account ID, `coin-card-holder` audience, `https://app.coincard.click` origin, and host-only session boundary. It does not share the ImplicitEx Transfer Portal audience or session.

No Firebase callable is exported and no production Functions deployment is authorized by this slice. A later production authentication milestone must establish the durable Firebase-auth-to-opaque-account mapping and expose reviewed backend-mediated callable boundaries without weakening the principal contract.
