# ImplicitEx Signed-Record Constitution

**Version 0.2 — July 29, 2026**
**Status: APPROVED — acceptance basis for CC-002**

---

## 1. Purpose

The Signed-Record Constitution defines the rules governing every cryptographically signed
record issued or verified by ImplicitEx.

Its purpose is to ensure that:

- a record has one unambiguous meaning;
- its contents cannot be altered without detection;
- its issuing authority can be verified independently;
- its validity does not depend solely on trusting a live server response;
- expiration, revocation, replacement, and key rotation behave predictably;
- future products use the same trust architecture rather than inventing incompatible systems.

This constitution is upstream of:

- Coin Card manifests;
- payment-request links;
- merchant charge records;
- card-verification attestations;
- API verification responses;
- future machine-readable payment records.

Every record type defined by ImplicitEx inherits this substrate. This is the trust protocol
for ImplicitEx — not merely the technical specification for one feature.

---

## 2. V1 Coin Card claim

A valid V1 Coin Card record establishes only that:

> **ImplicitEx issued a signed payment-route record, and control of the designated receiving
> wallet was demonstrated during issuance or the most recent reverification.**

The record does **not** establish that:

- ImplicitEx verified the cardholder's legal identity;
- the cardholder owns the displayed personal name;
- the cardholder owns or controls a displayed trademark;
- ImplicitEx endorses the cardholder;
- the recipient wallet remains uncompromised;
- the cardholder is entitled to represent any third party;
- a payment is safe merely because the record is cryptographically valid.

The interface must never label the V1 state **"Identity Verified"** or **"Owner Verified."**

Permitted display language includes:

```
ROUTE VERIFIED
WALLET CONTROL CONFIRMED
SIGNED RECORD VALID
VERIFIED ON [DATE]
VALID THROUGH [DATE]
```

The wallet-control verification date must be displayed visibly alongside the expiry. A
sender seeing "Wallet control confirmed July 29, 2026" during a November payment
receives accurate signal about what the record actually proves.

---

## 3. Record families

Every signed record must declare its record type.

Initial record family:

```
implicitex.coin-card.manifest
```

Planned future families:

```
implicitex.payment-request
implicitex.merchant-charge
implicitex.verification-attestation
implicitex.receipt
```

A verifier must never interpret one record type as another. A valid Coin Card manifest
signature cannot be reused as a payment request or merchant charge. Record type is part
of the signed domain object and therefore covered by the signature.

---

## 4. Domain separation

Every signed record binds itself to:

- ImplicitEx;
- its record family;
- schema version;
- deployment environment;
- intended verification domain;
- chain and asset where applicable.

The domain object is **inside the signed payload** — not a separate envelope wrapper.
If the domain object were outside the signature, a tampered wrapper could alter context
while leaving the signature intact. Including it in the payload removes that ambiguity.

Domain object (field name `domain`, required, signed):

```json
{
  "domain": {
    "name": "ImplicitEx",
    "recordType": "implicitex.coin-card.manifest",
    "schemaVersion": "1.0.0",
    "environment": "production",
    "verificationDomain": "coincard.click"
  }
}
```

Production records must not validate in staging merely because the same fields and key
format are used. The `environment` field and `verificationDomain` are part of the signed
payload and must match verifier expectations exactly.

---

## 5. Cryptographic stack

### 5.1 Signature algorithm

**Ed25519 (EdDSA over Curve25519), envelope format JWS JSON Serialization per
RFC 7515 and RFC 8037.**

Rationale:

- **Deterministic signing** — no random nonce is required, eliminating a class of
  implementation bugs present in non-deterministic ECDSA.
- **Architectural separation** — ImplicitEx uses Ed25519 for platform authority;
  Ethereum wallets use secp256k1 for wallet authority. These are distinct concepts.
  Using secp256k1 for platform signatures would blur that boundary.
- **KMS support** — AWS KMS and GCP KMS both support Ed25519. The signing key
  must live in a KMS or hardware security module, never on an application server.
- **Small, standard** — 64-byte signatures, 32-byte public keys, well-supported in
  Node.js `crypto`, Python `cryptography`, and all major languages.

JWS JSON Serialization provides a standard, widely-understood envelope without JWT's
historical baggage (`alg: none`, expiry footguns, key-confusion attacks).

### 5.2 Canonical serialization

**JCS — JSON Canonicalization Scheme, RFC 8785.**

JCS is an IETF RFC designed specifically for cryptographic signing of JSON. It specifies:

- deterministic Unicode property ordering;
- integer-only numeric values (no floating-point — required for monetary amounts);
- UTC timestamp normalization;
- whitespace removal;
- defined handling for all JSON value types.

The complete signing stack for one record:

```
Logical record (JSON object)
  → Apply JCS (RFC 8785) → canonical UTF-8 bytes
  → base64url encode
  → use as JWS payload
  → sign with Ed25519 private key (in KMS)
  → produce JWS JSON Serialization envelope
```

Verification reverses the stack: extract payload, base64url decode, verify signature
against the published Ed25519 public key identified by `signingKeyId`.

---

## 6. V1 manifest fields

### 6.1 Signed payload

```json
{
  "domain": {
    "name": "ImplicitEx",
    "recordType": "implicitex.coin-card.manifest",
    "schemaVersion": "1.0.0",
    "environment": "production",
    "verificationDomain": "coincard.click"
  },
  "cardId": "cc_...",
  "manifestVersion": 1,
  "handle": "antoine",
  "recipientAddress": "0x...",
  "chainId": 137,
  "assetContract": "0x...",
  "assetSymbol": "USDC",
  "assetDecimals": 6,
  "feePolicyId": "implicitex-standard-1pct-v1",
  "entitlementType": "pilot",
  "walletControlVerifiedAt": "2026-07-29T18:00:00Z",
  "issuedAt": "2026-07-29T18:05:00Z",
  "notBefore": "2026-07-29T18:05:00Z",
  "expiresAt": "2026-10-27T18:05:00Z",
  "signingKeyId": "ix-signing-2026-01"
}
```

### 6.2 Envelope

The signature is stored outside the signed payload:

```json
{
  "payload": "<base64url-encoded JCS-canonical payload>",
  "signature": "<base64url-encoded Ed25519 signature>",
  "signatureAlgorithm": "EdDSA",
  "canonicalization": "JCS-RFC8785"
}
```

---

## 7. Field principles

### `domain`

The domain object is the first field in the canonical record. It binds the signature
to a specific ImplicitEx record type, schema version, environment, and verification
domain. Any mismatch between the signed domain object and the verifier's expected
context must produce `INVALID_SIGNATURE` or `UNKNOWN_SCHEMA`.

### `cardId`

The permanent internal identity of the Coin Card.

Must:

- be globally unique;
- never be reassigned;
- remain stable if the handle changes, is renamed, or is revoked;
- remain usable when reviewing historical records;
- not encode personal information.

### `manifestVersion`

A monotonically increasing integer scoped to one `cardId`.

A new manifest version is required when any signed field changes, including:

- handle;
- recipient wallet;
- chain;
- asset;
- fee policy;
- entitlement type;
- expiration;
- wallet-control verification date.

Old manifests remain historically authentic but are no longer current. The registry's
`currentManifestVersion` determines which version is authoritative.

### `handle`

The handle in the signed manifest records the routing alias assigned at the time this
manifest version was issued.

Whether that alias currently routes to this card is governed by the registry, not by
the manifest. Verifiers must confirm both: the manifest's handle field and the
registry's current active alias for this card.

This distinction matters because:

- old manifests remain truthful after a handle rename;
- historical receipts reference a handle that was valid at payment time;
- a revoked alias may be reassigned to a different card without invalidating the
  prior holder's payment history.

Handles are revocable routing aliases licensed for use by the account holder. They are
not domains, permanent property, trademarks, or proof of identity.

### `recipientAddress`

The exact wallet address to which the card routes payment.

Must be normalized according to the target chain's rules before signing. EVM addresses
must be stored in their checksum form (EIP-55). The verifier must display the address
derived from the signed payload, not from a separate database response.

### `chainId`

The numeric chain identifier. Network names may be displayed for humans but must not
replace the signed numeric identifier in verification or execution logic.

### `assetContract`

The exact token contract authorized for the route.

A symbol such as `USDC` is descriptive only. Verification and execution must rely on
`chainId` plus `assetContract` together. A matching symbol with a different contract
address is not the same asset.

### `assetSymbol` and `assetDecimals`

Descriptive fields only. The verifier must confirm the claimed symbol and decimals
match the on-chain asset contract before displaying them, or display them as
"unverified" if the check cannot be performed.

### `feePolicyId`

A reference to a separately versioned fee-policy definition.

The verifier must be able to determine the fee behavior associated with the identifier.
A change to the fee policy requires a new immutable fee-policy version. Existing policy
definitions must never be silently rewritten. A card adopting a new fee policy requires
a new manifest version.

### `entitlementType`

Governs the issuance basis of the card.

Initial values:

```
pilot    — manually issued, time-limited, not commercially acquired
paid     — acquired through a payment flow (Stripe or USDC)
internal — issued for testing or administrative purposes
```

There is no `free` public entitlement. A pilot card is not a permanently free tier.
It is a waived-fee entitlement that remains subject to all verification, namespace,
revocation, and expiration rules that govern paid cards.

### `walletControlVerifiedAt`

The time at which the recipient demonstrated control of the designated wallet through
the approved challenge procedure. Not the same as `issuedAt`.

This field must be displayed on the card. It tells a sender what was proven and when.

### `issuedAt` and `notBefore`

The time the manifest was created and signed, and the earliest time at which it is
valid for verification and payment routing.

### `expiresAt`

The end of the period during which ImplicitEx asserts that the record remains current.

A cryptographically authentic but expired record is not currently verified.

**Pilot validity period: 90 days from `issuedAt`.**

When paid subscriptions are introduced, `expiresAt` aligns with the subscription
period end. The field governs both cases; no schema change is required.

### `signingKeyId`

Identifies the public key required to verify the signature, without embedding the full
key in every payload. The verifier resolves the public key by this identifier from the
published key registry.

---

## 8. Verification states

The verifier must return exactly one of the following states. No ambiguous, composite,
or implementation-defined states are permitted.

### `VALID_CURRENT`

All conditions pass:

- schema version and record type recognized;
- signature valid;
- signing key trusted for the issuance period;
- card status is `active` in the registry;
- `currentManifestVersion` in the registry matches this manifest's version;
- `notBefore ≤ now < expiresAt`;
- not within the EXPIRING_SOON window;
- registry data is within the freshness tolerance.

Viewing: permitted
Payment execution: permitted

### `EXPIRING_SOON`

Technically `VALID_CURRENT` by all other criteria, but within **14 days of `expiresAt`**.

The interface must display a visible notice prompting reverification. The notice must
not be dismissible in a way that prevents the cardholder from seeing it.

Viewing: permitted with notice
Payment execution: permitted

### `EXPIRED`

The signature remains authentic, but `now ≥ expiresAt`.

Viewing: permitted in a visibly degraded historical state
Payment execution: blocked

### `REVOKED`

The registry status for this card or manifest version is `revoked`.

Viewing: degraded revocation notice, including public reason code if available
Payment execution: blocked

### `REPLACED`

A newer manifest version supersedes this one, or a replacement card has been issued.

Viewing: historical state; replacement route displayed if registry permits
Payment execution: blocked through the superseded version

### `SUSPENDED`

The registry status is `suspended`. This indicates a temporary hold pending review,
billing resolution, security investigation, or policy enforcement.

Viewing: degraded suspension state
Payment execution: blocked

### `REGISTRY_UNAVAILABLE`

The signature may be locally valid, but current revocation and manifest-version status
cannot be established within the freshness tolerance (see Section 10).

Viewing: degraded unavailable state with explicit notice
Payment execution: blocked

### `UNKNOWN_SCHEMA`

The verifier does not recognize the declared `schemaVersion` or `recordType`.

Viewing: error state
Payment execution: blocked

### `INVALID_SIGNATURE`

The payload or signature cannot be authenticated.

Viewing: critical failure state
Payment execution: blocked

### `CONTENT_MISMATCH`

The visible card content — address, handle, asset, chain — does not match the verified
signed payload.

Viewing: critical failure state
Payment execution: blocked

---

## 9. Fail-closed rule

For payment execution:

> **Anything other than `VALID_CURRENT` or an explicitly permitted `EXPIRING_SOON`
> state must block execution.**

The system must never convert any of the following into an assumed-valid result:

- network failure;
- timeout;
- unavailable registry;
- unknown schema version;
- ambiguous or indeterminate state;
- malformed payload;
- verification exception;
- missing or expired signing key.

An exception during verification is a failure, not a success.

---

## 10. Registry relationship and cache policy

A signature proves that ImplicitEx issued a particular historical record.

It does not, by itself, prove that the record is still authorized.

Current validity requires both conditions:

```
Authentic signed manifest
  +
Current registry authorization
```

### 10.1 Registry record

The public registry record for a card:

```json
{
  "cardId": "cc_...",
  "status": "active",
  "currentManifestVersion": 1,
  "activeHandle": "antoine",
  "replacementCardId": null,
  "revocationReasonCode": null,
  "statusEffectiveAt": "2026-07-29T18:05:00Z",
  "updatedAt": "2026-07-29T18:05:00Z"
}
```

Public responses must expose only information necessary for verification. Internal
notes, billing identifiers, complaint evidence, administrative details, and cardholder
PII must not appear in the public registry record.

### 10.2 `statusEffectiveAt`

`statusEffectiveAt` records the time at which the current status became authoritative.

This is distinct from `updatedAt`, which may reflect administrative edits unrelated to
authorization status.

Example: a revocation enacted at 14:05 following a complaint received at 14:00 should
record `statusEffectiveAt: 14:05` even if the registry row was last written at 14:32
during follow-up processing.

`statusEffectiveAt` is a reserved constitutional concept. It is not a required signed
manifest field in V1, but the registry must maintain it from initial deployment.
It becomes essential for audit and dispute resolution: determining whether a payment
occurred before or after a suspension or revocation took effect.

### 10.3 Cache tolerances

| Context | Cache tolerance | Failure behavior |
|---|---|---|
| Viewing (display only) | 10 minutes | Degrade to `REGISTRY_UNAVAILABLE` |
| Payment execution | Registry response must be ≤ 5 minutes old | Block; `REGISTRY_UNAVAILABLE` state |
| Signed manifest itself | Indefinite | Self-verifying; no registry needed for signature check |

If the registry is unreachable for more than 5 minutes continuously, all payment
execution through affected cards is blocked. This is the correct trade-off. Allowing
stale revocation data to authorize payments is the failure mode this policy prevents.

---

## 11. Mutation rule

A signed record is immutable.

Changing any signed field requires:

1. creation of a new manifest with an incremented `manifestVersion`;
2. signing the complete new payload;
3. updating the registry's `currentManifestVersion`;
4. preserving all prior manifests for historical verification;
5. blocking payment execution through superseded manifest versions.

No system may edit a signed manifest in place.

---

## 12. Revocation and suspension

Revocation must not delete the historical signed record.

The registry records:

- affected `cardId`;
- affected manifest version, or whole-card scope;
- `statusEffectiveAt` — when the status became authoritative;
- `updatedAt` — when the registry was written;
- public reason code;
- internal case reference (not in public response);
- replacement card ID, where applicable;
- administrative authority responsible for the action.

### 12.1 Public reason codes

```
cardholder-request
wallet-compromise
route-replaced
impersonation
trademark-complaint
fraud-risk
terms-violation
billing-termination
security-incident
pilot-expired
administrative-error
```

Public reason codes must be factual and restrained. Detailed accusations, private
evidence, and internal case notes remain outside the public registry record.

`pilot-expired` is distinct from `billing-termination`. Pilot cards expire by design;
the reason code should reflect that rather than implying a payment failure.

---

## 13. Key rotation

Signing keys are versioned and independently discoverable.

The system must support:

- an active signing key used for new issuances;
- previously trusted keys retained indefinitely for historical verification;
- activation and retirement timestamps per key;
- emergency revocation of a compromised key;
- documented rotation procedures;
- an offline or hardware-protected root of trust;
- no silent replacement of a public key under an existing `signingKeyId`.

### Historical authenticity after retirement

A record signed while a key was legitimately active remains historically authentic
after routine key retirement. The key registry must retain retired public keys
alongside their active period.

### Compromised key procedure

A compromised key is distinct from a retired key. Records signed during the affected
period may require reissuance, notification to affected cardholders, and explicit
distrust of that key for the compromised window. This requires a separate incident
procedure beyond normal rotation.

---

## 14. Registry authority and recovery model

This section governs who may alter card status and what happens when authority
itself is at risk.

### 14.1 Write authority

The following parties may alter registry state:

| Action | Authorized by |
|---|---|
| Issue new manifest | Platform signing key (KMS) |
| Activate / update entitlement | Billing processor (Stripe webhook, USDC watcher) via validated server-side processor |
| Suspend card | Platform administrative authority |
| Revoke card | Platform administrative authority |
| Reinstate after suspension | Platform administrative authority |
| Cardholder-initiated revocation | Cardholder, after identity challenge, through an authenticated interface |

No client-side request may directly alter card status without server-side validation.
Stripe webhooks must be validated by signature before any registry write.

### 14.2 Registry is not Stripe

Card validity must remain determinable even if Stripe is temporarily unavailable.
The entitlement state and registry state are maintained by ImplicitEx. Stripe is an
event source, not the source of truth. No verifier should query Stripe directly to
determine whether a card is valid.

### 14.3 Administrative key compromise

If the administrative key or signing KMS is compromised:

- all newly issued records from that point are untrusted;
- a new key pair is generated;
- affected cards are reissued under the new key;
- the compromised key's active period is explicitly bounded in the key registry;
- affected cardholders are notified through the incident channel.

### 14.4 Incorrect revocation

An incorrectly revoked card must be restorable without creating a new `cardId`.
The registry must support a `reinstated` status transition and must record both the
erroneous revocation and the reinstatement with their respective `statusEffectiveAt`
timestamps. The `administrative-error` reason code applies.

---

## 15. Display contract

The interface must display values derived directly from the successfully verified payload.

The interface must not show:

- one wallet address while verifying another;
- a friendly token symbol without verifying its contract;
- a current verification badge based only on cached presentation data;
- an active handle that differs from the registry-authorized alias;
- a paid-tier badge based solely on browser state;
- a verification date reconstructed from metadata rather than the signed `walletControlVerifiedAt` field.

Before payment authorization, the interface must visibly present at minimum:

- recipient handle;
- recipient wallet in abbreviated form with full-address accessible on demand;
- chain;
- asset;
- record status;
- `walletControlVerifiedAt` (human-readable date);
- expiry or freshness status;
- amount, platform fee, and total debit.

---

## 16. V1 issuance sequence

A pilot Coin Card may be issued only after completing all of the following steps in order:

1. Applicant is manually approved.
2. Handle passes namespace review and is reserved.
3. Pilot entitlement type and `expiresAt` are assigned.
4. Applicant completes the wallet-control challenge; `walletControlVerifiedAt` is recorded.
5. The exact route (address, chain, asset) is frozen.
6. The manifest payload is constructed and JCS-canonicalized.
7. The canonical payload is signed via KMS.
8. The signature is independently verified before publication.
9. The registry is updated with `status: active` and `currentManifestVersion: 1`.
10. The live card is verified from the public route, producing `VALID_CURRENT`.
11. An issuance evidence record is retained internally.

---

## 17. V1 non-goals

CC-002 does not need to implement:

- public self-service signup;
- Stripe billing;
- automatic subscription renewal;
- legal identity verification;
- business KYB;
- multiple assets;
- multiple chains;
- payment-request signatures;
- merchant APIs;
- handle ownership transfer;
- decentralized registry governance.

The schema and verifier must not create dead ends for those future record families.
Specifically: the `domain.recordType` field allows future families to use the same
constitutional substrate without schema changes to the manifest.

---

## 18. Locked decisions

The following decisions are locked as of v0.2. Changes require a new constitution
version approved through the same process as this document.

| Decision | Value |
|---|---|
| Signature algorithm | Ed25519 (EdDSA) |
| Envelope format | JWS JSON Serialization — RFC 7515 + RFC 8037 |
| Canonical serialization | JCS — RFC 8785 |
| Pilot manifest validity | 90 days from `issuedAt` |
| EXPIRING_SOON threshold | T − 14 days |
| Viewing cache tolerance | 10 minutes |
| Payment execution freshness | Registry response ≤ 5 minutes old |
| Registry unavailability behavior | Fail closed — block execution |
| Platform signing key type | Ed25519 via KMS |
| Domain object location | Inside the signed payload |
| Free public entitlement | Does not exist |
| `statusEffectiveAt` | Reserved constitutional concept; required in registry from V1 |

---

*This constitution is the acceptance basis for CC-002. The CC-002 implementation
must be judged against this document. Implementation details discovered during
CC-002 that appear to conflict with this constitution must surface as proposed
amendments, not silent deviations.*
