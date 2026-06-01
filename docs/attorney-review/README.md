# ImplicitEx — Attorney Review Package

Prepared: 2026-06-01
Status: Ready for counsel review (Gate 3)

This folder is the curated entry point for attorney review of ImplicitEx prior
to public launch. It contains the factual service model, legal research brief,
live legal pages, on-chain evidence, and open questions for counsel.

---

## What ImplicitEx Is

Non-custodial USDC transfer interface and smart-contract execution layer on Polygon.

The product connects to a user's self-custodied wallet, requests authorization,
executes a two-party USDC transfer through a deployed smart contract, and routes
the platform fee to a treasury wallet. It does not custody funds, hold keys,
provide escrow, reverse transactions, or act as a bank, broker, exchange, or
money transmitter.

Start with `service-model-summary.md`. Everything else in this package elaborates
on what that document states.

---

## Documents in This Package

### 1. Service Model Summary (start here)

`service-model-summary.md`

One-page factual summary of what ImplicitEx does and does not do, current
economics, and live Gate 2 evidence. This is the document to mark up and
challenge. If a claim in this document is incorrect or legally contested,
that is a productive starting point for the review.

### 2. Legal Review Research Brief

`legal-review-research-brief.md`

Comparative research across 10 platforms. Identifies 10 risk categories with
ImplicitEx-specific adaptations. Includes Circle USDC Terms analysis. Not a
clause library — it is a risk-category map for counsel to adapt.

### 3. Live Legal Pages

These pages are in their canonical locations in the frontend:

| Page | Path |
|---|---|
| Legal | `app-web/frontend/public/legal.html` |
| Privacy | `app-web/frontend/public/privacy.html` |
| Terms | `app-web/frontend/public/components/terms.html` |
| Jurisdiction Availability | `app-web/frontend/public/jurisdictions.html` |

All four are in draft status pending this review.

To read them in a browser: open the repo, navigate to `app-web/frontend/public/`,
and open each file directly. They render as standalone pages.

### 4. Gate 2 Evidence

`gate2-evidence.md` (see below for contents)

Live transfer smoke evidence from 2026-06-01. Establishes that the service model
described in this package reflects actual observed product behavior, not specification.

### 5. Screenshots

`screenshots/`

Placeholder for UI screenshots to be added before counsel meeting:
- Transfer input screen (amount + recipient entered)
- Preview panel (transfer amount, platform fee, total debit displayed)
- MetaMask approval prompt (spending cap request, 1.01 USDC, contract address)
- Confirmation receipt (CONFIRMED state, transfer and approval entries)

---

## Three Questions for Counsel

These are the open questions that require attorney judgment. Everything else in
this package provides factual context for them.

### 1. Regulatory Characterization

Given the service model described here, how should ImplicitEx characterize itself
in legal pages, marketing copy, and communications? What terms should it avoid?
Does the non-custodial, no-escrow, no-reversal model reduce or eliminate specific
regulatory categories of concern?

### 2. Jurisdiction Posture

Which launch posture is appropriate?
- U.S. only (most conservative)?
- Selected jurisdictions with explicit availability list?
- Global availability with sanctioned-jurisdiction exclusions (current posture)?

What obligations attach to each posture? Are state-by-state U.S. restrictions
appropriate at this stage?

### 3. Compliance Obligations Before Public Launch

Given the proven service model — non-custodial, fee-on-top, Polygon USDC,
no KYC currently implemented — what ongoing or pre-launch compliance obligations
should be anticipated? Does the non-custodial model change the analysis relative
to custodial transfer services?

---

## Context for Counsel

ImplicitEx is an early-stage product. It is not yet publicly launched. The
transfer gate is currently closed. The Gate 2 smoke test (2026-06-01) is the
only live transfer executed to date.

The product is built and operated by Aden Media Group LLC.

Legal pages are published but marked as draft pending this review. No public
traffic is being served with live transfers enabled.
