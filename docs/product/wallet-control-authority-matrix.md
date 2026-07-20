# Wallet-Control Authority Matrix

## Status: DRAFT — freeze before projection engine is implemented

This document defines the authority policy for all wallet-control event types.
It must be frozen before storage syntax is chosen or projection code is written.
Governance rules discovered after implementation are expensive to enforce correctly.

---

## Three-Part Authority Model

Every event must distinguish three roles. `issuer` is insufficient alone.

**Actor** — who requested or performed the act.
**Authenticator** — what proves that actor's authority to act.
**Attestor** — who records that the event satisfied the defined policy.

```json
{
  "actor": {
    "type": "identity_subject",
    "subjectId": "did:implicitex:coincard:antoine"
  },
  "authenticator": {
    "type": "eip191_signature",
    "walletAddress": "0x71aB...9F20",
    "signature": "0x..."
  },
  "attestor": {
    "type": "implicitex_verifier",
    "keyId": "ix-verifier-2026-01",
    "signature": "0x..."
  }
}
```

The subject authorizes the transition. The wallet signature authenticates the
subject's authority. ImplicitEx attests that the event satisfied policy. These
are three distinct claims and must not be collapsed into one.

---

## Expanded Lifecycle States

```
current           — active authoritative basis for the claim
superseded        — replaced by a newer verified wallet
revoked           — explicitly invalidated by the subject
expired           — validity period ended without renewal
failed            — verification attempt did not establish control
suspended         — platform has suspended reliance (not subject revocation)
revocation_pending — recovery revocation requested; recovery procedure incomplete
```

`suspended` is a platform reliance decision. It is not the same as subject
revocation and must not share the same event type. ImplicitEx may not unilaterally
rewrite what a subject did.

Invalid signature attempts do not change Item state. They are archived as
observation events only.

---

## Canonical Acceptance Coordinate

Client-provided `occurredAt` timestamps cannot safely determine event precedence.
Clocks may be incorrect; events may be backdated by an attacker.

Every accepted event must carry a canonical acceptance coordinate:

```json
{
  "acceptedAt": "2026-07-19T20:02:15Z",
  "sequence": 1842,
  "logDigest": "sha256:..."
}
```

`occurredAt` remains evidence about when the act allegedly occurred.
`acceptedAt` and `sequence` determine projection order.

---

## Authority Matrix

### Event: `wallet_control_verification_completed`

| Field                | Value |
| -------------------- | ----- |
| **Actor**            | ImplicitEx verifier service |
| **Authenticator**    | Verifier signature over event envelope using current verifier key |
| **Attestor**         | Same as actor (verifier is both actor and attestor here) |
| **Preconditions**    | Valid unexpired unused challenge; challenge bound to subject+wallet+audience+purpose; valid EIP-191 or EIP-712 signature; recoveredAddress equals claimed wallet |
| **Projection effect**| Creates support for a `current` wallet-control Item |
| **Conflict rule**    | Multiple `current` Items for different wallets may coexist unless product policy prohibits it; multiple for the same wallet+chain are rejected |
| **Failure behavior** | Failed verification is archived as observation event only; does not change Item state |
| **What it asserts**  | Cryptographic verification procedure succeeded. Not: legal ownership, exclusive control, honesty, or safety of future payments. |

---

### Event: `wallet_control_association_superseded`

| Field                | Value |
| -------------------- | ----- |
| **Actor**            | Identity subject |
| **Authenticator**    | Signature from the currently authoritative wallet AND a valid verification event for the replacement wallet |
| **Attestor**         | ImplicitEx (attests both signatures and preconditions were satisfied) |
| **Preconditions**    | Old Item is `current`; replacement Item has a valid verification event; subjectIds match; transition not previously consumed; old and replacement wallets differ |
| **Projection effect**| Old Item → `superseded`; replacement Item → `current` |
| **Conflict rule**    | Supersession requires old wallet's own signature. A compromised session or password reset alone is insufficient. |
| **Failure behavior** | Reject if any precondition fails; archive rejection as observation |
| **Rationale**        | Continuity: old wallet authorizes its own retirement; new wallet has already proven control. Prevents normal account session from rewriting payment identity. |

---

### Event: `wallet_control_association_revoked` (subject path)

| Field                | Value |
| -------------------- | ----- |
| **Actor**            | Identity subject |
| **Authenticator**    | Signed revocation statement from the wallet being revoked (direct path) OR recovery authority (recovery path — see below) |
| **Attestor**         | ImplicitEx |
| **Preconditions**    | Item is `current` or `superseded`; signed statement includes subjectId, walletAddress, reasonCode, nonce, audience, timestamp, expiration |
| **Projection effect**| Item → `revoked` (direct path) OR `revocation_pending` (recovery path) |
| **Conflict rule**    | Terminal. A `revoked` Item may not be reactivated by a later verification event. Reactivation requires a new Item identity. |
| **Failure behavior** | Reject without signed statement satisfying preconditions |

**Direct revocation:** the current wallet signs its own revocation. Immediately produces `revoked`.

**Recovery revocation:** wallet is unavailable or compromised; subject uses a pre-established recovery authority. Produces `revocation_pending` until recovery procedure completes. A support agent passing an ordinary account-recovery flow must not directly emit a final `revoked` event — that would make the support system more authoritative than the cryptographic evidence.

---

### Event: `wallet_control_reliance_suspended`

**ImplicitEx does not share the subject's revocation authority.**

A subject says: *"This association is no longer authorized by me."*
ImplicitEx says: *"The platform will not currently rely on or present this evidence."*

These are different claims and must be different event types.

| Field                | Value |
| -------------------- | ----- |
| **Actor**            | ImplicitEx platform |
| **Authenticator**    | ImplicitEx platform signature + reason policy code |
| **Attestor**         | ImplicitEx |
| **Preconditions**    | Platform has documented grounds: evidence integrity failure, verifier-key compromise, challenge replay discovered, malformed or fraudulent event, legal restraint, emergency policy |
| **Projection effect**| Item → `suspended` (not `revoked`) |
| **Conflict rule**    | Does not prevent subject from revoking independently. Does not overwrite subject-revoked state. |
| **Failure behavior** | Platform must document grounds; suspension without grounds is rejected by audit |
| **Rationale**        | Preserves history accurately. ImplicitEx records its own reliance decision, not a claim about what the subject did. |

---

## Conflict Resolution Rules

The projector applies these in order. Rules are applied to canonically ordered
events (`acceptedAt` + `sequence`), never to `occurredAt` alone.

1. **Reject events with invalid issuer authority.** An event from an unauthorized actor is not admitted to the log.
2. **Reject events with invalid cryptographic evidence.** Signature does not verify, challenge expired, challenge previously consumed, addresses do not match.
3. **Reject events violating transition preconditions.** Attempting to supersede a non-current Item, for example.
4. **Order accepted events by canonical acceptance sequence.** `occurredAt` is evidence, not ordering.
5. **Apply terminal states authoritatively.** A `revoked` Item is not reactivated by a later verification event. Reactivation requires a new Item identity (new `itemId`).
6. **`suspended` does not override subject revocation.** If an Item is `revoked` by the subject, a subsequent platform suspension is redundant but not in conflict.
7. **`revocation_pending` blocks reliance until resolved.** Renderers must not present `revocation_pending` as `current`. Resolution events are: recovery procedure completed → `revoked`, or recovery procedure failed/withdrawn → return to previous state with audit record.

---

## What This Matrix Does Not Yet Cover

These questions are deferred until product scope requires them:

- Multi-wallet identity: can one identity have multiple simultaneous `current` wallet-control Items? (Tentatively: yes, unless prohibited by product policy.)
- Organizational approval: threshold or multi-party authorization for supersession or revocation.
- Legal process: external authority demanding revocation or suspension.
- Verifier-key rotation: how existing events are treated when the verifier key that signed them is retired.
- Cross-chain: same wallet address on different chains as separate Items or linked Items.

---

## Next Step

Freeze this matrix or record explicit disagreements.

Once frozen, the projection engine may be implemented with authority validation
as a first-class gate — not an afterthought added when a governance violation
is discovered in production.
