# Coin Card Lane A — Controlled Live Smoke
**Date:** 2026-06-27
**Surface:** implicitex.com/coincard/card-acceptance-lane-a.html
**Commit under test:** 38d5c76 (footer: COIN CARD issuer mark replaces mutable domain text — Coin Card as persistent object, not ephemeral artifact)
**Card:** cc_demo_implicitex · feeBps: 100 · Polygon mainnet
**Contracts:**
- USDC: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- ImplicitExTransfer: `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0`

---

## Pre-Smoke Visual Finding

**Date recorded:** 2026-06-30
**Classification:** Product clarity defect — does not block on-chain execution smoke

Coin Card badge variants (Decal, Compact, Feature) show layout and hierarchy defects:
- "USDC accepted here," COIN CARD logo image, "Powered by ImplicitEx," network/token
  label, and ImplicitEx lettermark all compete at similar visual weight
- Recipient identity is absent from the badge face (only visible after INSPECT opens)
- "Powered by" attribution appears twice (left copy block + authority square)
- Feature card (Variant 3) lettermark is 160×160px in a 380×188px card — poster scale
- Result: card does not explain itself to a first-time sender without narration

**Gate status:** execution smoke may proceed. Product clarity is a separate gate.

**Pre-smoke card-face correction (2026-06-30):** Lane A visual hierarchy rebuilt before
on-chain smoke because the previous badge face did not communicate recipient identity and
had duplicate attribution elements. Execution logic, state machine, transfer math, manifest
verification, and receipt behavior are unchanged.
Two questions being answered separately:
1. Does approve → transfer → settle execute correctly? ← this smoke
2. Does the card explain itself without private narration? ← blocked by visual defect above

Rebuild spec: `docs/product/coincard-badge-rebuild.md`
Rebuild implemented: 2026-06-30 (Variant 1 only; Variants 2 and 3 deferred)

---

## Rejection Sequence (run before happy path)

**Rule:** Rejection tests must pass before the happy-path transfer. No USDC is spent during this sequence.

### R1 — Approval Rejection

| Check | Expected | Result |
|---|---|---|
| Click Send, reject approval in MetaMask | APPROVAL REJECTED displayed | |
| Sub-copy | "No transfer was submitted." | |
| Send button re-enables | Yes (approval_rejected is in SEND_ENABLED_STATES) | |
| SETTLE reachable | No | |
| USDC debited | 0 | |

**Outcome:** PASS / FAIL

---

### R2 — Transfer Rejection

| Check | Expected | Result |
|---|---|---|
| Approve USDC, then reject transfer in MetaMask | TRANSFER REJECTED displayed | |
| Sub-copy | "No funds moved." | |
| Send button re-enables | Yes (transfer_rejected is in SEND_ENABLED_STATES) | |
| SETTLE reachable | No | |
| USDC debited | 0 (approval may be granted, no transfer) | |

**Outcome:** PASS / FAIL

---

### R3 — Wrong-Network Recovery

| Check | Expected | Result |
|---|---|---|
| Switch wallet to non-Polygon network | WRONG NETWORK displayed | |
| Send button disabled | Yes | |
| Switch wallet back to Polygon (chainId 137) | preflight re-evaluates | |
| State recovers to READY | Yes | |
| SETTLE reachable before recovery | No | |

**Outcome:** PASS / FAIL

---

## Happy Path — 1.00 USDC Transfer

### Pre-Send Verification (confirm all three rows before clicking Send)

| Field | Expected | Observed |
|---|---|---|
| Amount | 1.00 USDC | |
| Fee (1%) | 0.01 USDC | |
| Total | 1.01 USDC | |
| MetaMask approval request | 1.01 USDC | |

All four must agree before proceeding. If any diverges, stop — do not approve.

---

### Execution

| Step | Value |
|---|---|
| Approval tx hash | |
| Approval confirmed | Yes / No |
| Transfer tx hash | |
| Transfer confirmed | Yes / No |
| Block number | |
| Timestamp | |

---

### SETTLE State Verification

| Field | Expected | Observed |
|---|---|---|
| Headline | TRANSFER CONFIRMED | |
| Amount displayed | 1.00 USDC | |
| Fee displayed | 0.01 USDC | |
| Total displayed | 1.01 USDC | |
| PolygonScan link | clickable, real tx hash | |
| PolygonScan link matches tx hash in SETTLE | Yes | |

---

### On-Chain Reconciliation (PolygonScan)

| Party | Expected | On-chain result |
|---|---|---|
| Recipient `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919` | +1.00 USDC | |
| Treasury (contract fee routing) | +0.01 USDC | |
| ImplicitExTransfer contract retained | 0.00 USDC | |
| Total sender debit | 1.01 USDC | |

PolygonScan link: `https://polygonscan.com/tx/<tx-hash>`

---

## Four-Layer Truth Table

```
Promise (TRANSACT display):    amount 1.00 / fee 0.01 / total 1.01
Approval (MetaMask prompt):    1.01 USDC
Settlement (on-chain result):  recipient +1.00 / treasury +0.01 / contract +0.00
Proof (SETTLE display):        matches settlement exactly + real PolygonScan link
```

**All four layers reconcile:** Yes / No

If No, record the divergence here:

---

## Result

**Lane A smoke:** PASS / FAIL

If PASS: displayed intent = wallet approval = on-chain result = receipt/proof state. Lane A execution trust contract holds.

If FAIL: [record finding — the finding is the evidence, not a footnote]
