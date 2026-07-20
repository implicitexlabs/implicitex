# Identity Evidence Schema

## Status: DRAFT — semantics under review, not yet implemented

This document freezes the semantic boundaries of the evidence model before any
storage syntax, database schema, or rendering decisions are made. The shape here
is conceptual. JSON structure, table design, and manifest format follow after
these semantics survive review.

---

## Two Invariants — Apply Before Any Renderer Is Written

**Invariant 1: A renderer may omit evidence. It may never invent it.**

A Coin Card may display `Wallet Control: Verified` — that is omission of detail.
It may not display `Wallet Control: Verified` unless that claim can be
reconstructed from the underlying Evidence Block. This applies to every consumer:
card, Commitment Review, Transfer Intelligence, API, PDF, CLI. Each may choose
its level of detail. None may create facts that do not exist in the evidence
model.

**Invariant 2: The schema knows nothing about Coin Card.**

The schema knows about evidence, claims, events, provenance, and authority.
Coin Card is one consumer. Designing the schema to fit the card's current layout
produces a Coin Card Schema, not an Identity Evidence Schema. One survives product
evolution. The other becomes technical debt when the second consumer arrives.

---

## Watch Item — Evidence Event as the Real Primitive

Before committing to the Block → Item → Event hierarchy, examine whether Event
is the only fundamentally immutable object and Block/Item are projections:

```
Evidence Event          (immutable — the act that occurred)
  → Evidence Item       (current interpretation of events for a claim)
  → Evidence Block      (grouping of items for human navigation)
```

This may be the correct inversion. Semantic-first design is likely to surface
this before storage is chosen. Resolve it during the worked-example review, not
after schema is implemented.

---

## Three Layers — Precise Separation

**Evidence Block** — the domain of the claim.

Who or what is the subject? What category of evidence is this? The block does not
describe how to render itself. It does not say "verified" or "failed." It
identifies the domain.

**Evidence Item** — the current assertion being presented.

What is being claimed right now, for which specific subject within that domain?
Points to the event that currently supports the claim. Does not store `verified:
true`. Derives presentable status from the current evidence event.

**Evidence Event** — the historical act or observation that created, changed,
renewed, or invalidated an item's status.

Events are never overwritten. A renewal creates a new event. A revocation creates
a new event. History is preserved.

---

## Conceptual Shape (wallet-control example)

```json
{
  "block": {
    "id": "wallet-control",
    "subject": "coin-card:antoine",
    "type": "wallet_control"
  },
  "items": [
    {
      "id": "wallet-control:polygon:0x1234",
      "claim": {
        "walletAddress": "0x1234...",
        "network": "polygon",
        "controlStatus": "verified"
      },
      "currentEvidenceEventId": "evt_2026_07_19_001"
    }
  ],
  "events": [
    {
      "id": "evt_2026_07_19_001",
      "eventType": "verification_completed",
      "method": "eip191_signature",
      "issuer": "implicitex",
      "occurredAt": "2026-07-19T18:00:00Z",
      "evidence": {
        "challengeId": "challenge_abc",
        "challengeDigest": "0x...",
        "signature": "0x...",
        "recoveredAddress": "0x1234..."
      }
    }
  ]
}
```

This shape is illustrative, not final. It is here to make the boundary between
the three layers visible and debatable before any implementation begins.

---

## Completion Requirements — Wallet-Control Block

A wallet-control block is not complete because the UI displays "Verified." It is
complete when the record can answer the completion question below without
trusting a badge or a portal string.

### 1. Precise subject

Which Coin Card or identity does this evidence belong to?

### 2. Precise wallet identity

- Address (checksummed)
- Chain or chain family
- Token or payment capability, where relevant

### 3. Reproducible verification method

One of:
- EIP-191 personal sign
- EIP-712 typed-data signature
- Contract-wallet verification path (if supported)

Method must be named explicitly in the event. "Wallet signature" is not
sufficient — it must identify which signing standard was used.

### 4. Bound challenge

The challenge must bind:
- Unique nonce (replay protection)
- Intended subject (which Coin Card)
- Intended wallet (which address)
- Domain or application context
- Issued-at timestamp
- Expiration timestamp

A challenge that does not bind subject and wallet can be replayed against a
different identity. A challenge without expiration cannot be considered revoked.

### 5. Durable verification event

The event must preserve:
- What was signed (or a digest of it)
- Which address was recovered from the signature
- When verification occurred
- Who or what issued the challenge
- Whether this event is still the current authoritative event

### 6. Lifecycle semantics

Every evidence item must have an explicit lifecycle state:

- `current` — this event is the authoritative basis for the claim
- `superseded` — a newer event replaced this one (renewal, re-verification)
- `revoked` — explicitly invalidated before expiration
- `expired` — validity period ended without renewal
- `failed` — verification attempt completed but did not establish control

### 7. Independent inspectability

A consumer who does not trust the portal must be able to verify:

> What exactly was proven, by which method, at what time, against which
> challenge, for which identity, and is that proof still authoritative now?

If the record cannot answer this question independently, the block is incomplete
regardless of what the UI displays.

---

## Lifecycle Transition Example

Wallet verified July 2026. Renewed October 2026.

```
Event 1: evt_2026_07_19_001
  type:    verification_completed
  status:  superseded (after Event 2)
  method:  eip191_signature
  issued:  2026-07-19

Event 2: evt_2026_10_15_001
  type:    verification_renewed
  status:  current
  method:  eip191_signature
  issued:  2026-10-15
```

Item `currentEvidenceEventId` updates to point to Event 2.
Event 1 is preserved. History is complete.

---

## Engineering Session Opening Sequence

1. Freeze these semantics (debate, modify, reject — but decide)
2. Produce one fully worked wallet-control example with all seven fields present
3. Walk the example through at least two lifecycle transitions (renewal, revocation)
4. Only then: choose storage syntax (JSON manifest, database tables, or both)
5. Only then: write the first card renderer against the frozen schema
6. Only then: write the Commitment Review integration as a second consumer

The dangerous move is designing the schema around the current card layout. That
produces a model that works for the card and fails everywhere else. The card
should be the first renderer of a schema that was designed to outlast it.

---

## Evidence Block Types (planned)

| Block Type           | Answers                                          |
| -------------------- | ------------------------------------------------ |
| Identity             | Who is this entity?                              |
| Wallet Control       | Do they control this wallet?                     |
| Domain               | Do they control this domain?                     |
| Business             | Are they a registered business?                  |
| Payment Capability   | Can they receive this token on this network?     |
| Verification History | What has been verified, when, and by whom?       |

Payment Capability is first-class. It answers "can this identity receive what I
am about to send?" — which is directly relevant to transfer decisions.
