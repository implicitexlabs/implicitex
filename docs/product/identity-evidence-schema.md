# Identity Evidence Schema

## Status: SEMANTICS RESOLVED — implementation sequence next

Semantic review completed 2026-07-19 via worked wallet-control example.
The three-layer vocabulary survives. The causal direction is now fixed.
Storage syntax and renderer implementation may proceed against this document.

---

## Two Invariants — Apply Before Any Renderer Is Written

**Invariant 1: A renderer may omit evidence. It may never invent it.**

A Coin Card may display `Wallet Control: Verified` — that is omission of detail.
It may not display `Wallet Control: Verified` unless that claim can be
reconstructed from the underlying Evidence Events. This applies to every consumer:
card, Commitment Review, Transfer Intelligence, API, PDF, CLI. Each may choose
its level of detail. None may create facts that do not exist in the evidence
model.

**Invariant 2: The schema knows nothing about Coin Card.**

The schema knows about evidence, claims, events, provenance, and authority.
Coin Card is one consumer. Designing the schema to fit the card's current layout
produces a Coin Card Schema, not an Identity Evidence Schema. One survives product
evolution. The other becomes technical debt when the second consumer arrives.

---

## Resolved: Evidence Event is the Primitive

**The watch item is closed. The inversion is correct.**

Evidence Events are the append-only source records. Evidence Items and Evidence
Blocks are deterministic, reproducible projections over those records.

The correct causal direction:

```
Immutable Evidence Events
        ↓ project
Evidence Item (current claim state)
        ↓ group
Evidence Block (navigation for consumers)
        ↓ render
Coin Card / Commitment Review / API / PDF
```

This should not be understood as:
```
Block owns Items → Items own Events
```

It must be understood as:
```
Events support claims → Claims project into Items → Items group into Blocks
```

The three layers retain distinct jobs:

| Layer          | Role                                                    |
| -------------- | ------------------------------------------------------- |
| Evidence Event | Historical observation or authoritative lifecycle act   |
| Evidence Item  | Current claim state projected from relevant events      |
| Evidence Block | Rendering-neutral grouping of related items by domain   |

---

## Two Semantic Amendments (from worked example)

**Amendment 1: Append-only events, deterministic projections**

> Evidence Events are append-only source records. Evidence Items and Evidence
> Blocks are deterministic, reproducible projections over those records. Neither
> projection may contain an assertion that cannot be traced to one or more
> authoritative events.

**Amendment 2: Deterministic reconstruction property**

> Rebuilding the projections from the same valid event set and projection version
> must produce the same Item and Block state.

This is a testable property. A projection engine that produces different output
from the same event set is incorrect. Tests for projection correctness follow from
this directly.

---

## Next Unresolved Boundary: Authority Policy

The worked example exposed that not every lifecycle event has equal authority.

A cryptographic signature can demonstrate wallet control. A revocation might be
issued by:
- the subject (authenticated instruction)
- ImplicitEx (platform policy)
- an automatic expiration policy
- an administrator acting under support procedures
- future: registry authority, legal process

The presence of an event is not by itself sufficient. The projector must ask:

> Was this issuer authorized to produce this kind of transition?

Without an explicit authority policy, anyone capable of submitting an event could
revoke another subject's evidence.

**The next semantic question to resolve:**

> For every wallet-control event type, which authorities may issue it, and what
> evidence authenticates that authority?

This must be answered before the projection engine is implemented. Authority
validation belongs in the projector, not in the renderer.

**Candidate authority policy (wallet-control, initial):**

| Event type                              | Authorized issuers             |
| --------------------------------------- | ------------------------------ |
| `wallet_control_verification_completed` | implicitex (verifier service)  |
| `wallet_control_association_superseded` | subject (authenticated)        |
| `wallet_control_association_revoked`    | subject, implicitex (platform) |

---

## Three Layers — Precise Separation

**Evidence Event** — what actually occurred.

An append-only record of a historical fact or authoritative lifecycle act. Never
mutated. The signature was evaluated against the challenge and recovered this
address at this time. That fact does not change when the association is later
superseded or revoked.

**Evidence Item** — what the accumulated events currently support.

The current interpretation of all applicable events for a specific claim. Its
state changes as events accumulate (current → superseded → revoked). It is not
authoritative independently — it is the output of projecting events.

**Evidence Block** — how related claims are organized for consumers.

Groups related items by domain (wallet control, domain ownership, business
registration). Adds no new facts. Provides a derived summary for renderers.

---

## Worked Example — Wallet Control

### Claim boundary

```
did:implicitex:coincard:antoine
controls
0x71aB...9F20 on eip155:137
```

This establishes: control was demonstrated via signature for the purpose of
associating the wallet with this identity at a specific time.

It does NOT establish: legal identity, beneficial ownership, continued exclusive
control, honesty, reputation, or safety of future payments.

### Event 1 — verification_completed (initial)

```json
{
  "eventId": "evt_wallet_01J2X7VERIFY",
  "eventType": "wallet_control_verification_completed",
  "schemaVersion": 1,
  "subject": {
    "subjectType": "implicitex_identity",
    "subjectId": "did:implicitex:coincard:antoine"
  },
  "claim": {
    "claimType": "wallet_control",
    "walletAddress": "0x71aB...9F20",
    "chainFamily": "eip155",
    "chainId": 137
  },
  "provenance": {
    "issuer": "implicitex",
    "verificationMethod": "eip191_personal_sign",
    "verifierVersion": "implicitex-wallet-verifier/1"
  },
  "challenge": {
    "challengeId": "chl_01J2X7",
    "nonce": "b7f34c...",
    "audience": "implicitex.com",
    "purpose": "bind_wallet_to_identity",
    "subjectId": "did:implicitex:coincard:antoine",
    "walletAddress": "0x71aB...9F20",
    "issuedAt": "2026-07-19T20:00:00Z",
    "expiresAt": "2026-07-19T20:10:00Z"
  },
  "observation": {
    "canonicalMessageHash": "0x82c4...",
    "signature": "0xa911...",
    "recoveredAddress": "0x71aB...9F20",
    "addressMatch": true,
    "challengeExpiredAtVerification": false,
    "challengePreviouslyConsumed": false
  },
  "occurredAt": "2026-07-19T20:02:14Z",
  "integrity": {
    "eventDigest": "sha256:97c2...",
    "previousEventDigest": null
  }
}
```

### Item projection after Event 1

```json
{
  "itemId": "wallet-control:eip155:137:0x71ab...9f20",
  "claimType": "wallet_control",
  "subjectId": "did:implicitex:coincard:antoine",
  "target": {
    "walletAddress": "0x71aB...9F20",
    "chainFamily": "eip155",
    "chainId": 137
  },
  "currentState": "current",
  "effectiveFrom": "2026-07-19T20:02:14Z",
  "effectiveUntil": null,
  "supportingEventIds": ["evt_wallet_01J2X7VERIFY"],
  "currentAuthorityEventId": "evt_wallet_01J2X7VERIFY",
  "derivedAt": "2026-07-19T20:02:15Z",
  "projectionVersion": 1
}
```

Renderer may summarize as `Wallet control: Confirmed` — only because it traces to
the event.

### Block projection after Event 1

```json
{
  "blockId": "wallet-control",
  "blockType": "wallet_control",
  "subjectId": "did:implicitex:coincard:antoine",
  "itemIds": ["wallet-control:eip155:137:0x71ab...9f20"],
  "derivedSummary": {
    "currentClaims": 1,
    "expiredClaims": 0,
    "revokedClaims": 0,
    "unresolvedClaims": 0
  },
  "derivedAt": "2026-07-19T20:02:15Z",
  "projectionVersion": 1
}
```

### Transition 1 — supersession (replacement wallet)

Two events appended. The original event is never modified.

Event: `wallet_control_verification_completed` for `0x92C4...11A8`
Event: `wallet_control_association_superseded` for `0x71aB...9F20`

Old item state after these events:
```json
{
  "itemId": "wallet-control:eip155:137:0x71ab...9f20",
  "currentState": "superseded",
  "currentAuthorityEventId": "evt_wallet_01K0SUPERSEDE",
  "supersededByItemId": "wallet-control:eip155:137:0x92c4...11a8"
}
```

The original verification event remains true. What changes is the current
interpretation. This is why Item cannot be the immutable primitive.

### Transition 2 — revocation (compromised wallet)

Event: `wallet_control_association_revoked` for `0x92C4...11A8`

```json
{
  "itemId": "wallet-control:eip155:137:0x92c4...11a8",
  "currentState": "revoked",
  "currentAuthorityEventId": "evt_wallet_01K4REVOKE",
  "revokedAt": "2027-03-03T07:12:00Z",
  "reasonCode": "suspected_wallet_compromise"
}
```

Block summary:
```json
{
  "derivedSummary": {
    "currentClaims": 0,
    "supersededClaims": 1,
    "revokedClaims": 1
  }
}
```

Renderer must not display `Wallet control: Verified`. It may display:

```
Wallet control
No current wallet-control evidence

Previous wallet      Superseded January 19, 2027
Replacement wallet   Revoked March 3, 2027
Reason               Suspected wallet compromise
```

---

## Completion Requirements — Wallet-Control Event

An event is complete when a consumer who does not trust the portal can answer:

> What exactly was proven, by which method, at what time, against which challenge,
> for which identity, and is that proof still authoritative now?

Seven fields required:

1. **Precise subject** — `did:implicitex:coincard:{id}`
2. **Precise wallet identity** — checksummed address, chainFamily, chainId
3. **Reproducible verification method** — named signing standard (eip191, eip712)
4. **Bound challenge** — nonce, subject, wallet, audience, issuedAt, expiresAt
5. **Observation record** — canonicalMessageHash, signature, recoveredAddress, addressMatch, expiry/replay checks
6. **Lifecycle semantics** — current / superseded / revoked / expired / failed
7. **Independent inspectability** — enough data to audit without trusting the portal

---

## Implementation Sequence

Semantics are now frozen. Proceed in order:

1. ~~Freeze semantics~~ — **DONE**
2. ~~Worked wallet-control example~~ — **DONE** (2026-07-19)
3. ~~Walk two lifecycle transitions~~ — **DONE** (supersession + revocation)
4. **Resolve authority policy** — which issuers may produce which event types
5. **Choose storage syntax** — JSON manifest, database tables, or both
6. **Implement projection engine** — events → items → blocks, with authority validation
7. **First card renderer** — Coin Card as first consumer of the projection output
8. **Commitment Review integration** — second consumer, reads same projection output

---

## Evidence Block Types (planned)

| Block Type         | Answers                                       |
| ------------------ | --------------------------------------------- |
| Identity           | Who is this entity?                           |
| Wallet Control     | Do they control this wallet?                  |
| Domain             | Do they control this domain?                  |
| Business           | Are they a registered business?               |
| Payment Capability | Can they receive this token on this network?  |
| Verification Log   | What has been verified, when, and by whom?    |

Payment Capability is first-class: it answers "can this identity receive what I
am about to send?" directly relevant to transfer decisions.
