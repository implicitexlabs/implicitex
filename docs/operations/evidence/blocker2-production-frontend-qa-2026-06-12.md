# Blocker 2 — Manual Production-Frontend QA

**Date:** 2026-06-12
**Branch:** gate3-production-frontend-qa
**Outcome:** BLOCKED — transfer gate closed on active network

Gate: `transfersEnabled: false` throughout unless explicitly noted.
Successful transfer: satisfied by Gate 2 controlled live smoke (2026-05-23, tx 0xf4359437...).
No new live transfer required for this QA pass unless transfer execution code has changed.

---

## Lane 1 — Desktop Production Smoke

| ID | Description | Gate | Result |
|----|-------------|------|--------|
| L1-01 | Connect wallet on Polygon — standby state calm | closed | PASS — satisfied by B1-01 |
| L1-02 | Disconnect — state clears cleanly | closed | PASS — satisfied by B1-03 |
| L1-03 | Wrong network — switch-chain prompt appears | closed | PASS — satisfied by B1-02/B1-05 |
| L1-04 | Switch to Polygon — wrong-network clears | closed | PASS — satisfied by B1-02/B1-05 |
| L1-05 | Approval rejection — human-readable copy, no phantom receipt | open briefly | BLOCKED — app displayed “Transfers are currently paused on this network” before the USDC approval prompt could be reached. Config confirmation: `transfersEnabled: false` globally, on Polygon Mainnet, and on Polygon Amoy. No MetaMask approval prompt appeared. No transfer was initiated. No receipt was confirmed. |
| L1-06 | Transfer rejection — human-readable copy, no phantom receipt | open briefly | BLOCKED — app displayed “Transfers are currently paused on this network” before the final transfer execution prompt could be reached. Config confirmation: `transfersEnabled: false` globally, on Polygon Mainnet, and on Polygon Amoy. No final MetaMask transfer prompt appeared. No transfer was initiated. No fee was represented as collected. |
| L1-07 | Receipt visibility — archived receipt accessible after rejection | closed | PASS — satisfied by B1-07/B1-08 |
| L1-08 | Refresh recovery — no ghost receipt, form resets cleanly | closed | PASS — satisfied by B1-04/B1-08 |
| L1-09 | Successful transfer | satisfied by Gate 2 (2026-05-23) | SATISFIED |

---

## Lane 2 — Mobile Browser Smoke

| ID | Description | Result |
|----|-------------|--------|
| L2-01 | MetaMask mobile browser — wallet connection | PENDING |
| L2-02 | Responsive layout — transfer form usable on mobile | PENDING |
| L2-03 | Tap targets — buttons reachable, no overlap | PENDING |
| L2-04 | Keyboard overlay — form inputs accessible with keyboard open | PENDING |
| L2-05 | Rejection path — approval reject recovers cleanly on mobile | PENDING |

---

## Lane 3 — Viewport / Layout QA

| ID | Description | Result |
|----|-------------|--------|
| L3-01 | iPhone Safari — visual/layout pass, no clipping | PENDING |
| L3-02 | Low-resolution laptop viewport — fee, receipt, copy readable | PENDING |
| L3-03 | Tablet viewport — layout holds | PENDING |
| L3-04 | Recipient copy/paste — works on mobile | PENDING |

---

## Lane 4 — Production Recovery Paths

| ID | Description | Result |
|----|-------------|--------|
| L4-01 | Refresh during standby — no ghost state | PENDING |
| L4-02 | Refresh after receipt — receipt survives intact | PENDING |
| L4-03 | Wallet disconnect mid-session — safe recovery | PENDING |

---

## Gate discipline

- `transfersEnabled` opened only for L1-05 and L1-06
- Both flags closed before any commit
- Verify: all three `transfersEnabled` flags false before commit
- Static and observability checks before commit

---

## Post-QA verdict

BLOCKED — rejection-path QA requires a controlled transfer-enabled environment
