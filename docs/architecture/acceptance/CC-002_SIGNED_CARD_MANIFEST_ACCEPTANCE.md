# CC-002 — Signed Card Manifest Acceptance Criteria

**Drafted: July 29, 2026**
**Status: APPROVED — governs CC-002 implementation and completion**
**Constitution: Signed-Record Constitution v0.2 (31579af)**

---

## 1. Change claim

> CC-002 is complete when ImplicitEx can issue, store, publish, retrieve, and
> independently verify a Coin Card manifest that conforms to Signed-Record Constitution
> v0.2, and when all invalid, stale, revoked, replaced, or unavailable states fail
> closed before payment execution.

This document defines observable proof. Implementation detail is not acceptance
evidence. The code is not done because it runs — it is done when every criterion
below is demonstrably satisfied and the evidence is captured in the completion record.

---

## 2. In scope

- Canonical manifest generation conforming to Constitution Section 6
- Ed25519 signing (Section 5.1)
- JWS JSON Serialization envelope (Section 5.1)
- JCS canonicalization (Section 5.2)
- KMS-backed signing path (signing key never in source, env, or runtime)
- Registry publication and registry record format (Section 10.1)
- `statusEffectiveAt` maintained from first write (Section 10.2)
- Manifest retrieval from public route
- Client-side independent verification (no live-server trust required)
- Freshness and cache rules (Section 10.3)
- All verification states (Section 8)
- Revocation, suspension, replacement, and expiry handling (Sections 12, 8)
- Test vectors covering all verification states (AC-14)
- Evidence artifacts for the completion record (Section 5)
- At least one live pilot card issued and independently verified (AC-15)

---

## 3. Explicitly out of scope

The following are not part of CC-002 and must not be implemented as part of this
change. Any such addition requires a separate scoped change.

- Stripe billing or subscription management
- Public self-service card issuance
- Paid renewal flows
- Multiple chains or assets beyond `chainId: 137` (Polygon) and USDC
- Payment-request link signatures (`implicitex.payment-request` record family)
- Card analytics or view counting
- Business or identity verification
- Public card directory
- Automated abuse review

---

## 4. Acceptance gates

### AC-01 — Schema conformance

**Claim:** A generated manifest contains every required field defined in Constitution
Section 6.1, rejects payloads with missing required fields, uses integer-only numeric
values throughout, and includes the domain object inside the signed payload.

**Evidence:**
- Fixture file containing a conforming signed manifest
- Test asserting each required field is present and correctly typed
- Test asserting that a payload without the `domain` field fails verification
- Test asserting that floating-point numeric values are rejected at generation time

---

### AC-02 — JCS canonicalization

**Claim:** The same logical payload produces byte-identical JCS output across repeated
runs, independent of property insertion order or input whitespace.

**Evidence:**
- Test asserting that two invocations with identical logical content produce identical
  canonical bytes
- Test asserting that a payload with properties in a different insertion order produces
  the same canonical bytes as the reference
- Test asserting that a payload serialized with extra whitespace produces the same
  canonical bytes as the reference
- Canonical byte hex or base64 fixture for the reference test vector (AC-14)

---

### AC-03 — Signature creation via KMS

**Claim:** The canonical payload is signed with the approved Ed25519 key through the
KMS or approved signing service. The private key is not present in source code,
environment files, deployment artifacts, CI configuration, or application runtime
storage.

**Evidence:**
- Signing function calls the KMS API, not an in-process key
- Code review confirms no private key material in any tracked file
- `git log --all --full-history -- '*.pem' '*.key' '*private*' '*.env'` returns nothing
  relevant
- The signing key ID in the produced manifest matches the expected KMS key identifier

---

### AC-04 — JWS envelope

**Claim:** The output is a valid JWS JSON Serialization envelope (RFC 7515) using
algorithm `EdDSA` (RFC 8037) and the locked `signingKeyId`. An envelope declaring any
other algorithm is rejected by the verifier.

**Evidence:**
- Test parsing the JWS envelope and asserting `signatureAlgorithm: "EdDSA"`
- Test asserting that an envelope with `signatureAlgorithm: "RS256"` or any other
  value is rejected with `INVALID_SIGNATURE`
- Test asserting that an envelope with a missing or unknown `signingKeyId` is rejected
- Fixture containing a valid complete JWS envelope for the reference test vector

---

### AC-05 — Independent client-side verification

**Claim:** A verifier that holds only the published public key and the JWS envelope —
with no access to the issuance server's live response — can:

- retrieve the manifest from the public card route;
- retrieve the authorized public key by `signingKeyId` from the published key registry;
- JCS-canonicalize the payload bytes;
- verify the Ed25519 signature;
- validate `domain.name`, `domain.recordType`, `domain.schemaVersion`,
  `domain.environment`, and `domain.verificationDomain`;
- validate `notBefore ≤ now < expiresAt`;
- validate `chainId`, `assetContract`, `recipientAddress`, `feePolicyId`;
- confirm the signing key was active at `issuedAt`.

**Evidence:**
- A standalone verification script or function that accepts only the JWS envelope and
  published public key as inputs, with no database or server call
- Test running that verifier against the reference fixture and asserting `VALID_CURRENT`
- The verifier is distinct from the issuance path; they share no runtime state

---

### AC-06 — Registry authorization

**Claim:** A cryptographically valid manifest is treated as authorized for payment
execution only when the registry confirms all of the following simultaneously:

- `status: active`
- `currentManifestVersion` matches the manifest's `manifestVersion`
- `activeHandle` matches the manifest's `handle` (or the registry explicitly routes
  the handle to this `cardId`)
- Registry data is within the freshness tolerance (AC-07)
- No suspension, revocation, or replacement is recorded

Any single condition failing must block execution.

**Evidence:**
- Test with valid signature but `status: suspended` → `SUSPENDED`, execution blocked
- Test with valid signature but `currentManifestVersion` mismatch → `REPLACED`,
  execution blocked
- Test with valid signature but `activeHandle` not routing to this card → `REPLACED`
  or `REVOKED` as appropriate, execution blocked

---

### AC-07 — Cache behavior

**Claim:**
- Viewing may use registry data no older than 10 minutes.
- Payment execution requires registry data no older than 5 minutes.
- Registry data older than the applicable tolerance, or a registry fetch failure, returns
  `REGISTRY_UNAVAILABLE` and blocks execution.
- The signed manifest itself may be cached indefinitely; it is self-verifying.

**Evidence:**
- Test simulating a viewing request with an 11-minute-old cached registry response →
  `REGISTRY_UNAVAILABLE`
- Test simulating a payment execution request with a 6-minute-old cached registry
  response → `REGISTRY_UNAVAILABLE`, execution blocked
- Test simulating a payment execution request with a 4-minute-old cached registry
  response and otherwise valid state → `VALID_CURRENT`, execution permitted
- Test simulating a registry fetch timeout → `REGISTRY_UNAVAILABLE`, execution blocked

---

### AC-08 — Expiration

**Claim:**
- A manifest is `EXPIRING_SOON` when `now ≥ expiresAt − 14 days` and `now < expiresAt`.
- A manifest is `EXPIRED` when `now ≥ expiresAt`.
- `EXPIRING_SOON` permits viewing with notice and permits payment execution.
- `EXPIRED` permits viewing in a degraded historical state and blocks payment execution.
- An expired record remains historically verifiable; signature verification still passes.

**Evidence:**
- Test with `now = expiresAt − 13 days` → `EXPIRING_SOON`
- Test with `now = expiresAt − 15 days` → `VALID_CURRENT`
- Test with `now = expiresAt + 1 second` → `EXPIRED`, execution blocked
- Test asserting that the signature of an expired manifest still verifies correctly
  (signature verification is independent of expiration)

---

### AC-09 — Revocation

**Claim:** Revocation:
- preserves the signed historical record (the manifest is not deleted or altered);
- records `statusEffectiveAt` at the time the revocation takes effect;
- causes subsequent verification to return `REVOKED`;
- blocks payment execution;
- returns a public reason code where recorded.

**Evidence:**
- Test: issue a valid manifest, revoke it, verify → `REVOKED`, execution blocked
- Test: verify the manifest payload still passes signature check after revocation
  (historical authenticity is preserved)
- Registry record after revocation includes `statusEffectiveAt` and `revocationReasonCode`
- The signed manifest bytes are unchanged after revocation

---

### AC-10 — Replacement

**Claim:** When a card is replaced by a new `cardId`, or when a new manifest version
supersedes the current one:
- the prior manifest remains historically authentic;
- verification of the prior version returns `REPLACED`;
- `REPLACED` blocks payment execution;
- the registry record identifies the replacement where permitted.

**Evidence:**
- Test: issue manifest v1, issue manifest v2 for the same card, verify v1 →
  `REPLACED`, execution blocked
- Test: registry `replacementCardId` is set when a card is replaced
- Test: the v1 manifest payload still passes signature verification after replacement

---

### AC-11 — Handle divergence

**Claim:** An old manifest may record a historical handle that no longer routes to the
card. Current routing is governed by the registry. A handle that is no longer routed to
this `cardId` must not authorize payment through the old alias.

**Evidence:**
- Test: issue a manifest with `handle: "alice"`, rename registry routing to
  `"alice-renamed"`, verify → `REPLACED` or `REVOKED` as appropriate, execution blocked
  via `"alice"` alias
- Test: old manifest's handle field is preserved unchanged in the historical record

---

### AC-12 — Content integrity

**Claim:** Any difference between values displayed on the card interface and the
verified signed payload returns `CONTENT_MISMATCH` and blocks payment execution.

This applies to:
- `recipientAddress`
- `handle`
- `chainId`
- `assetContract`
- `assetSymbol` (where claimed)

**Evidence:**
- Test: display layer receives a `recipientAddress` that differs by one character from
  the signed payload → `CONTENT_MISMATCH`, execution blocked
- Test: display layer receives a different `chainId` → `CONTENT_MISMATCH`, execution
  blocked

---

### AC-13 — Fail-closed matrix

**Claim:** Every verification state other than `VALID_CURRENT` and permitted
`EXPIRING_SOON` blocks wallet invocation. There is no path from a non-passing state to
payment execution.

**Evidence:** Each row of the following matrix is tested and confirmed:

| Verification state | Execution permitted |
|---|---|
| `VALID_CURRENT` | Yes |
| `EXPIRING_SOON` | Yes (with visible notice) |
| `EXPIRED` | No |
| `REVOKED` | No |
| `SUSPENDED` | No |
| `REPLACED` | No |
| `REGISTRY_UNAVAILABLE` | No |
| `UNKNOWN_SCHEMA` | No |
| `INVALID_SIGNATURE` | No |
| `CONTENT_MISMATCH` | No |

No exception, timeout, catch-all handler, or default branch may produce a result
equivalent to `VALID_CURRENT`.

---

### AC-14 — Test vectors

**Claim:** The repository contains reproducible fixtures that exercise every
verification state. Fixtures are static — they do not depend on a live server — and
the verifier produces the expected state deterministically from each fixture.

**Required fixtures:**

| Fixture | Expected state |
|---|---|
| Reference manifest — all fields valid, within validity window | `VALID_CURRENT` |
| Reference manifest — within T−14 window | `EXPIRING_SOON` |
| Reference manifest — past `expiresAt` | `EXPIRED` |
| Registry status `revoked` | `REVOKED` |
| Registry status `suspended` | `SUSPENDED` |
| Registry `currentManifestVersion` mismatch | `REPLACED` |
| Unknown `schemaVersion` | `UNKNOWN_SCHEMA` |
| Signature bit-flipped | `INVALID_SIGNATURE` |
| Payload field altered after signing | `INVALID_SIGNATURE` |
| `domain.environment` set to `staging` | `INVALID_SIGNATURE` or `UNKNOWN_SCHEMA` |
| `domain.name` altered | `INVALID_SIGNATURE` |
| Registry fetch returns stale data (> freshness tolerance) | `REGISTRY_UNAVAILABLE` |
| Registry unreachable | `REGISTRY_UNAVAILABLE` |
| `currentManifestVersion` does not match manifest | `REPLACED` |
| Handle not routed to this `cardId` | `REPLACED` or `REVOKED` |
| Displayed address differs from signed `recipientAddress` | `CONTENT_MISMATCH` |

Each fixture must include the expected state as an assertion, not just the input.

---

### AC-15 — Live pilot proof

**Claim:** At least one controlled pilot card is issued through the complete
production-equivalent issuance flow and independently verified from its public route,
producing `VALID_CURRENT`.

**Evidence:**
- Issuance sequence (Constitution Section 16) completed in full, including step 8
  (independent signature verification before publication) and step 10 (live card
  verified from public route)
- Public card URL returns a valid JWS envelope
- Independent verifier (AC-05) run against the live URL produces `VALID_CURRENT`
- Registry record captured and included in the completion record
- `statusEffectiveAt` populated in the live registry entry

---

## 5. Required evidence record

CC-002 completion requires capturing the following as a durable artifact:

| Item | Required |
|---|---|
| Starting commit | Hash |
| Final commit | Hash |
| Files changed | `git diff --stat` output |
| Schema fixture hash | SHA-256 of reference fixture file |
| Canonical payload bytes | Hex or base64 of JCS output for reference vector |
| Canonical payload hash | SHA-256 of canonical bytes |
| Signing key ID | As recorded in the live manifest |
| JWS output | Complete envelope for reference vector |
| Public-key verification result | Pass / fail with verifier output |
| Registry record | JSON of live registry entry for AC-15 pilot card |
| Test results | Full output with pass/fail per test |
| Negative-state evidence | Verifier output for each fixture in AC-14 |
| Fail-closed matrix | AC-13 table with observed result per row |
| Production build fingerprint | Hash of deployed verifier artifact |
| Exact deployment target | Function name, project, region |
| Live verification evidence | Verifier output against public card URL |
| `git diff --check` | Clean |
| `git status --short` | Clean |
| Working tree status | Confirmed clean after all changes committed |

---

## 6. Completion rule

> CC-002 is not complete because a manifest was generated, signed, committed, built,
> or deployed. It is complete only when the full issuance-to-verification chain passes
> independently, every prohibited state in AC-13 demonstrably blocks execution, all
> test vectors in AC-14 produce their expected state, and the live pilot card in AC-15
> independently verifies as `VALID_CURRENT`.

Implementation details discovered during CC-002 that appear to conflict with Signed-
Record Constitution v0.2 must surface as proposed amendments, not silent deviations.

---

*Constitution reference: `31579af` — Signed-Record Constitution v0.2*
*Acceptance criteria for: CC-002 Signed Card Manifest*
*This document is approved and frozen. Changes to scope require a documented amendment
committed separately before implementation of the affected criteria.*
