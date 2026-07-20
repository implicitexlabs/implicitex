# Wallet-Control Authority Matrix

## Status: ADVERSARIAL REVIEW COMPLETE — ready to freeze

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

---

## Adversarial Review

Six governance questions evaluated before freeze. Each must be answered by the
matrix without inventing new rules. If any question requires a new rule, the
matrix is incomplete.

---

### Q1: Two valid supersession events arrive nearly simultaneously

**Scenario:** Subject signs a supersession, and a second supersession request is
also submitted before the first is accepted.

**Resolution:** The canonical acceptance coordinate (`acceptedAt` + `sequence`)
is monotonic — no two events share the same sequence number. The first accepted
event wins. The second is rejected because its precondition "old item is
`current`" is violated: the old item was already `superseded` by the first event.

**Governance answer:** No new rule required. Canonical sequence is sufficient.
The log design must guarantee sequence monotonicity. That is a storage
requirement, not a governance requirement.

---

### Q2: Verifier key compromised after 10,000 verification events

**Scenario:** A verifier signing key is compromised. All events attested by that
key are now untrustworthy.

**Resolution:** ImplicitEx emits `wallet_control_reliance_suspended` events for
all Items whose authority chain includes the compromised key. Items become
`suspended`, not `revoked` — this is ImplicitEx's reliance decision, not a
subject's revocation. The 10,000 historical events remain in the log; the
platform has decided not to rely on them.

**Consequence:** The projection engine must be able to query "which Items were
attested by verifier key X?" This is a storage indexing requirement. The
governance rule is already present: platform reliance decisions use `suspended`,
not `revoked`.

**Governance answer:** No new rule required. Verifier-key rotation and
compromise handling are explicitly in the "not yet covered" section; the
event type (`wallet_control_reliance_suspended`) and state (`suspended`) are
already defined.

---

### Q3: Subject revokes while supersession is in flight

**Scenario:** A supersession is partially complete — old wallet has signed the
request, but the new wallet's verification event has not been accepted yet.
Before the supersession completes, a revocation arrives for the old wallet.

**Resolution:** Whichever event has a lower sequence number is accepted first.

- If revocation is accepted first: old item becomes `revoked`. The supersession
  fails because its precondition "old item is `current`" is violated. The new
  wallet's verification event is still accepted independently — it creates a
  valid `current` Item without superseding anything. The subject ends up with
  one `revoked` Item (old wallet) and one `current` Item (new wallet, if the
  verification event was accepted). No wallet-control gap exists.

- If supersession completes first: old item becomes `superseded`, new item
  becomes `current`. A subsequent revocation would apply to the new item.

**Governance answer:** No new rule required. Canonical sequence resolves
ordering. Verification events are independent of supersession events — a new
wallet's verification event remains valid even if the supersession it was
intended for fails.

---

### Q4: An event references another event that is later suspended

**Scenario:** A supersession event references an old Item. Later, the old
Item's verification event is suspended due to verifier-key compromise. Does
the supersession itself become invalid?

**Resolution:** The supersession's authority chain is: the old wallet's
signature on the supersession request, plus the new wallet's verification event.
The old verification event's suspension affects the *claim* (wallet control is
now suspended for that wallet) — it does not retroactively invalidate the
supersession, which was authenticated by the wallet's own signature, not by the
old verification event's attestor key.

The supersession records a fact: the subject, as proven by control of the old
wallet, chose to retire that wallet's association. That fact remains true
regardless of whether the verifier key that attested the original verification
is later suspended.

**Governance answer:** No new rule required. Event authority chains are evaluated
at acceptance time. Later suspension of a referenced event affects the Item's
current state, not the authority of events that referenced it historically.

---

### Q5: Can a projection depend on a suspended event?

**Scenario:** An Item's `currentAuthorityEventId` points to an event that has
since been suspended. Can the projection engine still use that event to derive
`current` state?

**Resolution:** No. Suspended events must not be used to support `current` Item
state. When ImplicitEx emits a suspension, the Item transitions to `suspended`.
The event is preserved in the log — the historical fact is not erased — but it
no longer supports an active claim.

**Rule addition:** The projection engine applies `wallet_control_reliance_suspended`
events with higher precedence than `currentAuthorityEventId`. A `suspended` Item
state overrides any Item state that would otherwise be derived from the suspended
event.

**Governance answer:** One explicit rule added: suspension overrides derived Item
state. This is the expected behavior given the definition of `suspended`, but it
must be stated explicitly for the projection engine.

---

### Q6: Can a suspended Item be reinstated, or must a new attestation event exist?

**Scenario:** ImplicitEx suspended an Item due to verifier-key compromise. The
key compromise is resolved and a new verifier key is established. Can the
suspended Item be reinstated, or must the subject re-verify?

**Resolution:** A new verification event is required. Reinstatement-by-policy
would require a `wallet_control_reliance_reinstated` event type, which would
mean the projection engine must handle a state transition from `suspended` back
to `current` without a new cryptographic proof.

That is weaker evidence than re-verification. The suspension existed because the
platform could not rely on the prior cryptographic proof. Reinstating reliance on
the same underlying proof because the platform decides to trust it again does not
strengthen the evidence — it merely reverses the platform's reliance decision
without additional subject input.

**Rule addition:** `suspended` Items are not reinstated. Reinstatement requires
a new `wallet_control_verification_completed` event, which creates a new Item
state. The old Item remains `suspended` in the log permanently.

**Governance answer:** One explicit rule added: no reinstatement event type.
Re-verification is the only path from `suspended` to `current`. This is the
more conservative and auditable position.

---

## Rules Added by Adversarial Review

Two rules added to existing conflict resolution:

**Rule 8: Suspension overrides derived Item state.**
When a `wallet_control_reliance_suspended` event is accepted, the affected Item
transitions to `suspended` regardless of its current derived state. The
projection engine applies this before other state derivation.

**Rule 9: No reinstatement. Re-verification is the only path.**
Suspended Items cannot be reinstated by platform policy reversal. A new
`wallet_control_verification_completed` event creating a new Item is required.
The suspended Item remains suspended in the log permanently.

---

## Matrix Freeze Criteria

The matrix is ready to freeze when:
- [x] All six adversarial questions answered without requiring undefined behavior
- [x] Rules 8 and 9 added and consistent with existing rules 1–7
- [ ] Reviewed by at least one additional reader
- [ ] Explicit disagreements recorded and resolved

After freeze: storage syntax may be designed. The projection engine must
implement authority validation as a first-class gate, not an afterthought.
