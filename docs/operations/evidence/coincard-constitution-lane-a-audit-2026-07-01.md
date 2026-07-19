# Coin Card Constitution — Lane A Audit

**Date:** 2026-07-01
**Surface:** `frontend/public/coincard/card-acceptance-lane-a.html`
**Constitution:** `docs/product/coincard-constitution.md`
**Purpose:** Classify Lane A against the Constitution. Not a verdict — a map.

---

## Summary

Lane A is a successful V1 prototype. It established the visual language,
transaction model, state sequence, trust model, fee model, and interaction
pattern. The audit below identifies what it proved, what it deferred, and
what the Constitution now clarifies as architectural debt.

---

## Zone Audit

| Constitution Zone | Lane A Status | Notes |
|---|---|---|
| Zone A — Brand / Issuer | **Partial** | Lettermark present. Authority lane has received multiple layout revisions; position is stable now but was not architecturally enforced — it was established iteratively. |
| Zone B — Recipient Identity | **Pass** | `displayName` populated from manifest via `applyVerified()`. Absent before badge rebuild (2026-06-30). |
| Zone C — Payment Intent | **Pass** | Amount, fee (1%), total displayed in TRANSACT section. BigInt math, no floating point. |
| Zone D — Interaction State | **Partial** | States modeled in JS (8-state machine). No formal zone boundary in DOM — interaction elements share space with identity in TRANSACT. |
| Zone E — Confirmation / Receipt | **Pass** | SETTLE section: tx hash, PolygonScan link, amount/fee/total. Screenshot-safe. |
| Zone F — Footer / Trust Strip | **Partial** | "Powered by ImplicitEx" attribution present. No explicit non-custodial language or irreversibility warning in current badge face. |

---

## State Audit

| Constitution State | Lane A Equivalent | Status | Notes |
|---|---|---|---|
| Collapsed | BADGE | **Pass** | Issuer mark, recipient, network/token, expand affordance present. |
| Hover | `.cc-badge:hover` | **Partial** | Border emphasis and glow present. No layout change observed. Hover-triggered layout changes are blocked by CSS. |
| Expanded | INSPECT | **Pass** | Full credential detail visible. Zone order preserved. |
| Input / Interactive | TRANSACT | **Pass** | Amount display, fee, total, readiness states. |
| Pending / Executing | `approval_pending` / `transfer_pending` states | **Pass** | States exist; spinner / status present. Recipient identity preserved during pending. |
| Confirmed | SETTLE | **Pass** | All required outputs present. PolygonScan link. Receipt-safe. |
| Error / Recovery | `approval_rejected` / `transfer_rejected` / `wrong_network` | **Partial** | States exist and display correctly. Not formally modeled as an Error zone — handled ad hoc in state machine. Recovery message language present. |

---

## Architecture Audit

| Constitution Rule | Lane A Status | Notes |
|---|---|---|
| Inside iframe owns credential display | **Fail** | Lane A is a standalone HTML page. No iframe boundary exists. |
| Outside iframe owns wallet connection | **Fail** | Wallet connection, approval, and transfer all live in the same document. |
| Parent passes wallet state into iframe | **Fail** | No handoff protocol; MetaMask is accessed directly from the card page. |
| Immutable zone ordering | **Partial** | Zones exist in practice; not formally enforced in DOM or CSS. Zone order has been stable but was established by convention, not constraint. |
| Zone ownership (elements cannot migrate) | **Partial** | Authority lane received logo in previous session after iterative placement. Elements have migrated between zones during development. |
| Card boundary — no element outside frame | **Pass** | `overflow: hidden` on `.cc-wrapper`. |
| Layout invariance across states | **Partial** | Position drift was observed and corrected during badge rebuild (2026-06-30). Not guaranteed by architecture — guaranteed by current CSS values. |
| Hidden elements do not collapse structure | **Pass** | `[hidden]` enforced; panel transitions use display-none with class toggle. |
| Hover does not change layout | **Pass** | Hover rules restricted to border/glow in CSS. |
| Variable parity across states | **Pass** | Amount, fee, total, recipient, tx hash preserved across state transitions. |
| State transitions are explicit | **Partial** | 8-state machine exists in JS. Transitions are explicit in code but informal — no state transition table, no invariant enforcement at transition time. |
| Deterministic outputs | **Pass** | Fee and total calculated from BigInt basis points. Same input always produces same output. |
| Integer math, no floating point | **Pass** | Confirmed in implementation. |

---

## What Lane A Proved

- Visual language for a payment credential
- Transaction model (approve → transfer → settle)
- State sequence (BADGE → INSPECT → TRANSACT → SETTLE)
- Trust model (manifest verification, on-chain reconciliation)
- Fee model (basis points, exact integer math)
- User interaction pattern (rejection handling, wrong-network recovery)
- Receipt / proof state as the terminal output

---

## What Lane A Did Not Prove

- Strict zone ownership (architecturally enforced)
- Iframe / parent execution boundary
- Layout invariance guaranteed by structure rather than by current CSS values
- Formal Error state zone (handled ad hoc)
- Zone F (trust strip) as a defined surface

---

## Debt Classification

| Item | Classification | Priority |
|---|---|---|
| Iframe / parent separation | Architectural migration | Post-smoke, post-V1 |
| Zone enforcement in DOM / CSS | Engineering refinement | Before V2 |
| Formal state transition table | Engineering refinement | Before V2 |
| Error zone formalization | Engineering refinement | Before V2 |
| Zone F trust strip copy | Product copy | Before production |
| Hover invariance test | QA process | Before production |

---

## Gate Status

Lane A smoke test proceeds on the current surface. The Constitution is the
target architecture. The audit above is the gap map between them.

No debt item above is a blocker for the Lane A smoke.
