# Coin Card Entitlement Specification V1

**Status:** Governing — implementation defers to this document  
**Pilot scope:** Controlled pilot; renewal mechanics are manual  
**Supersedes:** Informal entitlement notes in memory index  

---

## Anchor sentence

> A Coin Card entitlement grants one customer the right to operate one
> registry-backed, cryptographically verifiable USDC payment identity for
> twelve months, using one reserved card identifier and one
> customer-designated Polygon USDC recipient route, subject to lifecycle,
> security, and acceptable-use controls.

Every database field, lifecycle state, checkout rule, and customer-facing
screen is subordinate to this sentence. If an implementation decision
contradicts it, the specification wins.

---

## 1. Entitlement unit and term

**Unit:** One Coin Card entitlement per purchase.

**Price:** $10 USD for the first year.

**Pilot renewal policy:** Renewal pricing will be disclosed before expiration
and will not renew automatically during the pilot. Customers are under no
obligation to renew.

**Term:** Twelve calendar months from the activation date (see Section 4).
The term does not begin at checkout and does not begin at payment submission.

**Non-transferable:** An entitlement is bound to the purchasing customer. It
may not be sold, gifted, or assigned to another party.

**Pilot limit:** One active Coin Card per customer during the controlled pilot.
A customer whose card is `EXPIRED` or `REVOKED` may purchase a new entitlement
subject to acceptable-use review.

---

## 2. Included capabilities

A valid, active entitlement grants the customer:

| Capability | Specification |
|---|---|
| Card identifier | One unique handle (3–30 characters, alphanumeric + hyphen, lowercase) |
| Public URL | `coincard.click/<handle>` |
| Recipient route | One active Polygon USDC address, customer-supplied |
| Registry status | Authoritative `ACTIVE` status backed by signed registry record |
| Lifecycle evidence | Signed lifecycle bundle verifiable by anyone without ImplicitEx |
| Integrity evidence | Asset-hash manifest; card authenticity is machine-verifiable |
| Shareable presentation | Card page and QR code suitable for public sharing |
| Route updates | Up to 4 recipient route changes per 12-month term (see Section 5) |
| Correction support | Reasonable assistance for provisioning errors and status corrections |
| Grace period | 30-day reserved-slug grace period after expiration (see Section 6) |

---

## 3. What is not included

The entitlement explicitly excludes:

- **Custody of funds.** ImplicitEx never holds, controls, or has access to
  customer funds. All transfers are non-custodial.
- **Identity verification.** A Coin Card verifies that the card package is
  authentic and has not been tampered with. It does not verify that the
  customer is who they claim to be.
- **Address accuracy guarantee.** The customer is solely responsible for
  supplying a correct recipient address. ImplicitEx cannot prevent a customer
  from routing funds to a wrong or inaccessible address.
- **Transaction insurance or reimbursement.** Blockchain transfers are
  irreversible. ImplicitEx provides no insurance and no reimbursement for
  misdirected or lost transfers.
- **Multiple active cards.** The pilot entitlement covers one card per
  customer.
- **Ownership transfer.** The card identifier may not be transferred to
  another owner.
- **Permanent or lifetime hosting.** The entitlement is for twelve months.
  Continued operation requires renewal.
- **Automated payments, batching, invoicing, or analytics.**
- **Guaranteed uptime SLA.** Infrastructure availability targets apply at the
  platform level and are not per-entitlement contractual commitments.

---

## 4. Activation and provisioning

**Activation trigger:** The entitlement activates — and the twelve-month
term begins — when **both** of the following are true:

1. Payment is confirmed (funds received and settlement acknowledged).
2. ImplicitEx has successfully published the first valid signed card package
   for the customer's handle.

If provisioning fails after payment, the term does not begin until
provisioning succeeds. The customer is not charged for provisioning delay.

**Provisioning includes:**

- Handle reservation in the registry
- Recipient route association
- Lifecycle record creation with `ACTIVE` status
- Signed lifecycle bundle generation and publication
- Card page availability at the public URL

**Provisioning failure:** If provisioning cannot be completed within a
reasonable period (exact SLA to be defined before pilot launch), the customer
is entitled to a full refund regardless of the 30-day refund window.

---

## 5. Route-change authority

**Allowance:** Up to **4 recipient route changes** per 12-month term.

**Unused changes do not carry over** to a renewal term.

**What a route change does:**

- Updates the recipient Polygon USDC address associated with the card
- Triggers re-signing of the card package with the new recipient
- Publishes an updated signed lifecycle record reflecting the change
- The previous address is no longer the active route; in-flight transfers to
  the old address are not affected or reversible by ImplicitEx

**What a route change does not do:**

- Extend the term
- Reset the route-change counter
- Transfer custody or ownership of any funds

**Verification requirement:** Route changes require the customer to
authenticate using their registered credential (see Section 7). A route
change that cannot be authenticated cannot be processed.

---

## 6. Suspension, revocation, and expiration

### Status definitions

| Status | Meaning | Execution |
|---|---|---|
| `ACTIVE` | Entitlement is valid and in term | Enabled |
| `SUSPENDED` | Temporary hold; operator-initiated | Disabled |
| `EXPIRED` | Term ended; grace period may apply | Disabled |
| `REVOKED` | Permanent termination for acceptable-use violation | Disabled |

### Expiration lifecycle

**30 days before expiration:** Renewal notice delivered to the customer's
registered contact.

**At expiration date:** Card status transitions to `EXPIRED`. Execution
(ability to receive transfers via the card) is disabled. The card page
remains accessible and shows the expired status.

**30-day grace period:** The slug and configuration are reserved for the
customer. The card is non-executable. The customer may renew during this
window to restore `ACTIVE` status without losing their handle.

**After grace period:** The card remains `EXPIRED` and non-executable. The
slug is not immediately reassigned. Slug reuse creates impersonation and
payment-routing risk; no reassignment policy will be established without
independent security review.

### Suspension

Suspension is operator-initiated and temporary. Grounds include security
investigation, suspected acceptable-use violation under review, or platform
integrity concern. A suspended card is non-executable. The customer is
notified of the suspension and its stated reason. Suspension must be resolved
within a defined review period (to be specified before pilot launch); if the
review concludes without grounds for revocation, the card is restored to
`ACTIVE`.

### Revocation

Revocation is permanent and operator-initiated. Grounds include confirmed
acceptable-use violation, fraud, or court order. A revoked card is
permanently non-executable. No refund is issued for the remaining term when
revocation is for cause. The slug enters a post-revocation hold period before
any reassignment is considered.

---

## 7. Recovery and support

### Authentication model

Customer access uses a three-level credential stack:

| Level | Mechanism | Use |
|---|---|---|
| Primary | SIWE (Sign-In With Ethereum) — wallet signature | Routine access, route changes |
| Secondary | Verified email address | Fallback when wallet is unavailable |
| Recovery | 8 one-time recovery codes, generated at activation | Last-resort access recovery |

Recovery codes are generated once at activation. The customer is responsible
for storing them securely. Lost recovery codes with no accessible primary or
secondary credential may result in permanent loss of access to the card
(the customer's funds are not affected — the recipient address on-chain is
not controlled by ImplicitEx).

### Support scope

ImplicitEx provides reasonable support for:

- Provisioning failures or delays
- Route update failures caused by platform error
- Status corrections (e.g., card incorrectly showing `EXPIRED`)
- Recovery code issuance where identity can be re-established
- Renewal processing

Support does not include:

- Recovery of funds sent to an incorrect address
- Reversal of completed on-chain transactions
- Disputes with transfer senders

---

## 8. Renewal and cancellation

### Renewal

During the pilot, renewal is **manual and non-automatic**.

- Renewal notice is sent 30 days before expiration.
- The customer must actively choose to renew.
- Renewal pricing will be disclosed before the notice is sent.
- Renewal pricing during the pilot is not guaranteed to match the initial
  $10 price, but any change will be disclosed with sufficient advance notice
  for the customer to make an informed decision.
- A renewed entitlement resets the term to 12 months from the renewal date.
  It does not extend from the original activation date.
- Renewal restores the route-change allowance to 4.

### Cancellation

A customer may request deactivation of their card at any time by contacting
support. Deactivation transitions the card to `EXPIRED` status immediately.

**Refund policy:**

- Full refund if requested within 30 days of activation.
- No refund after 30 days (except provisioning failure, see Section 4).
- No refund for early cancellation after the 30-day window.
- No refund when revocation is for cause.

---

## 9. Evidence and audit requirements

The signed artifacts that constitute a valid Coin Card entitlement are:

| Artifact | Purpose | Verifiable by |
|---|---|---|
| Registry record | Authoritative status and route | Anyone with registry access |
| Signed lifecycle bundle | Chain of custody for card state | Anyone; no ImplicitEx dependency |
| Integrity manifest | Asset hashes; tamper detection | Anyone |
| Card page | Human-readable presentation | Anyone with the URL |

**Verification independence:** The lifecycle evidence must be verifiable
without requiring ImplicitEx to be operational. A card's authenticity is
established by cryptographic proof, not by ImplicitEx's availability.

**Audit trail:** Every status transition (ACTIVE → EXPIRED, route change,
suspension event) is recorded in the signed lifecycle record. The audit trail
is append-only and machine-readable.

**Evidence is not a legal identity claim.** The signed artifacts prove the
card package has not been tampered with and that ImplicitEx published it. They
do not prove the customer's real-world identity or the legitimacy of the
recipient address.

---

## 10. Pilot success criteria

The controlled pilot is complete when:

1. At least one customer (beyond internal test accounts) completes the full
   activation flow and operates an active card for at least 30 days.
2. At least one route change is processed successfully end-to-end.
3. At least one expiration lifecycle completes (with or without renewal).
4. No impersonation incident or payment-routing confusion attributable to
   the platform is reported.
5. The closure evidence for each pilot transaction satisfies the audit
   requirements in Section 9.
6. Renewal pricing and mechanics are defined and communicated before any
   customer's first renewal notice.

Pilot closure is a product decision, not an automated gate.

---

## Implementation authority

This document governs. When an implementation question is not answered here,
the answer is derived from the anchor sentence in the introduction. When a
proposed implementation contradicts this document, the document prevails
and the document must be updated first before the implementation can proceed.

The entitlement specification does not govern internal engineering architecture
(database schema, signing pipeline, checkout flow implementation). Those are
governed by their respective technical specifications. This document governs
what the customer is and is not entitled to.
