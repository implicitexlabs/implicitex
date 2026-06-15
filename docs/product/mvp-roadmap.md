# ImplicitEx MVP Roadmap

Last updated: 2026-06-14
Branch: gate3-production-frontend-qa

---

## Product scope

The MVP is a Polygon USDC transfer tool.

```
Sender wallet → recipient wallet
1% ImplicitEx fee
No custody
No escrow
No recovery claim
No reversal claim
```

**Governing principle:** make the transfer path safe, observable, and honest before turning live transfers on.

**Scope boundary:** do not add swaps, embedded wallets, fiat ramps, accounts, analytics dashboards,
session restore polish, AI features, or social login before live-transfer smoke is complete.

---

## Launch gate sequence

```
Gate 1: Wallet + UI regression smoke         ← COMPLETE
Gate 2: Live-transfer readiness review       ← COMPLETE
Gate 3: Builder-controlled launch readiness  ← current position
Gate 4: Mainnet controlled live smoke
Gate 5: Public soft launch
```

**Positioning:** Gate 2 complete. Live transfer smoke passed 2026-06-01 with real USDC on
Polygon. Full approve → transferWithFee → receipt lifecycle verified end-to-end.

Gate 3 is builder-controlled launch readiness. The question it answers is no longer "can
it work?" — that is proven. Gate 3 answers: "can we expose it without embarrassing trust
failures, stale wallet state, unclear risk language, or unsafe deploy procedure?"

Gate 3 remaining checklist (as of 2026-06-14):
```
[x] Failure paths — FP1–FP5 PASS, FP6 verified by code review
[x] Mobile UX smoke — responsive viewport + real MetaMask mobile browser PASS
[ ] Wallet/provider regression — extension ↔ WC provider swap, no duplicate events
[ ] Support/disclaimer copy pass — non-reckless risk language, support path, limitations
[ ] Transfer gate + deploy safety checklist — operator procedure before any live config
[ ] Firebase deploy smoke — confirm hosted app matches local; no stale cache
```

Gate 4 checklist:
```
[ ] Confirm branch/commit/suite before opening gate
[ ] Flip transfersEnabled intentionally
[ ] Deploy live config
[ ] Execute small controlled USDC transfer (1.00 USDC)
[ ] Verify approval prompt → transfer prompt → receipt → Polygonscan → fee split
[ ] Close gate immediately
[ ] Deploy closed-gate config
[ ] Confirm public app is closed again
[ ] Commit evidence
```

Gate 5 (public soft launch) minimum posture:
```
[ ] Homepage copy final
[ ] Support/contact route works
[ ] Known-limitations note (no recovery, no reversal, Polygon only)
[ ] First-user walkthrough tested
[ ] Launch announcement ready
[ ] Transfer cap low; fee simple; analytics watched manually
[ ] Rollback plan ready
```

Attorney review is recommended before scale but is not a hard MVP blocker — it is a
third-party dependency outside builder-controlled scope.

**Every work session should start by asking: which launch risk are we removing today?**

---

## Launch board

### 1. WalletConnect / Reown

```
[x] Project ID confirmed (0538feccd78aacaf3bda61038db1f65a)
[x] IX_WC.init() wired
[x] Mobile MetaMask QR handoff tested
[x] Disconnect terminates WalletConnect session cleanly
[x] localStorage sweep on disconnect (wc@2:*, WCM_*, W3M_*)
[x] Privacy-first: page refresh requires fresh QR (intentional, documented in ADR)
[x] Wrong-network handling on WC connect
[x] Cancellation detection (modal close / QR dismiss)
[ ] Session restore after refresh — deferred post-MVP
```

Wallet support is now significantly stronger. MetaMask injected and WalletConnect QR are both
functional. Deferred items (embedded wallets, social login, smart accounts, gas sponsorship)
are correctly out of scope.

---

### 2. Transfer money path

**VERIFIED 2026-06-01 — live 1.01 USDC transfer on Polygon, real wallet, real contract.**

```
[x] Preview mode — renders on valid recipient + amount
[x] Transfers disabled gate — global + per-chain
[x] Configured-chain checks
[x] Paused-contract checks
[x] On-chain refreshed preview before wallet prompt
[x] Below-minimum transfer block
[x] Insufficient-balance block
[x] Approve USDC — MetaMask spending cap prompt confirmed: 1.01 USDC, correct contract
[x] Allowance confirmation — state transition AUTHORIZING → AUTHORIZED observed in receipt
[x] transferWithFee execution — tx confirmed on Polygon
[x] Fee deducted correctly (sender −1.01 USDC, recipient +1.00 USDC, treasury +0.01 USDC)
[x] Explorer verification — Polygonscan shows correct split to 0xe0B0...796B + 0xa7cE...3919
[~] Failure/rejection paths under real wallet prompts
    FP1 approval rejection          PASS 2026-06-01
    FP2 transfer rejection          PASS 2026-06-01
    FP3 wallet busy / -32002        PASS 2026-06-11
    FP4 insufficient balance        PASS 2026-06-14
    FP5 wrong network mid-flow      PASS 2026-06-14
    FP6 RPC failure / interruption  VERIFIED (code review) 2026-06-11
```

---

### 3. Receipt lifecycle

```
[x] Persistent receipts (localStorage)
[x] Active receipt cleanup (rehydrate.js)
[x] Observability source stamping
[x] Receipt-history architecture documented
[x] Recipient context lookup (getRecipientContext)
[x] 10-state machine: READY / AUTHORIZING / AUTHORIZED / SUBMITTING /
    SUBMITTED / CONFIRMED / REJECTED / FAILED / INTERRUPTED / OUTCOME_UNKNOWN
[x] Rehydration state model (pre-broadcast vs post-broadcast vs terminal)
[x] fundsMoved semantics — cannot be weakened once set true
[x] Full real-transfer receipt validation — AUTHORIZING → CONFIRMED observed, hashes recorded
[ ] Receipt copy/export polish — only if needed
[ ] Recipient memory UX — only if it stays subtle
```

---

### 4. UI / UX regression

```
[x] Cold load — all gates closed, calm presentation
[x] Connect wallet — MetaMask injected
[x] Connect wallet — WalletConnect QR
[x] Wrong-network handling
[x] Switch to Polygon
[x] Polygon standby (TRANSFERS_DISABLED — calm, not amber)
[x] Transfers disabled gate
[x] Disconnect / reconnect
[x] Clean disconnect (no MetaMask-specific copy on WC disconnect)
[x] Gas price row — expandable, collapsed by default
[x] Disclosure triangle consistency (CSS border-triangle canonical)
[x] Signal proportionality (gray/amber/red hierarchy)
[x] Mobile menu — hamburger nav confirmed functional 2026-06-14
[x] Mobile form — tap targets, balance/fee readable; real MetaMask mobile browser PASS 2026-06-14
[x] No duplicate provider events — verified 2026-06-14; event dispatch clean; Reown noise is library-side
[x] WalletConnect reconnect after MetaMask session and vice versa — PASS WITH CAVEATS 2026-06-14
```

---

### 5. Launch safety

```
[x] Non-custodial language across all pages
[x] No escrow / custody / recovery implication
[x] Transfer cap: 250 USDC
[x] Supported network narrow: Polygon mainnet only
[x] Hardened contract deployed and source-verified
[x] Contract address in chains.js verified
[x] Four-layer transfer flow protection (re-entry, cooldown, flow ID, txBroadcast flag)
[x] Fee framing: additive model stated (sender pays amount + fee; recipient receives full amount)
[x] Finality language: submitted ≠ confirmed; confirmed = irreversible — legal.html, terms.html, checkbox
[x] USDC/Circle risk section: Circle issues USDC; address restrictions outside ImplicitEx control
[x] Tax obligations: user responsibility stated in legal.html
[x] Jurisdiction consistency: verified identical list across legal.html, terms.html, jurisdictions.html
[x] Execution checkpoint: acknowledgement checkbox includes irreversibility statement
[x] Attorney package assembled: docs/attorney-review/ — service model summary, brief, evidence, page refs
[ ] Attorney screenshots added to docs/attorney-review/screenshots/
[ ] Terms reviewed by attorney
[ ] Privacy reviewed by attorney
[ ] Jurisdiction language reviewed
[ ] Risk disclosures reviewed
[ ] Firebase deploy smoke before go-live
[ ] transfersEnabled gate confirmed closed before deploy; opened only for controlled smoke
```

Legal self-review complete 2026-06-01. Attorney review pending. Gate 3 reduces to external review
plus four screenshots.

---

### 6. Public launch prep

```
[x] FAQ added — Polygon, USDC, two wallet confirmations, fee vs gas, wrong address risk
[x] Landing page How It Works copy aligned to proven fee-on-top model and two-prompt flow
[x] About page copy aligned — fee example with total debit, jargon removed
[ ] Homepage copy final
[ ] Contact path
[ ] Basic support language
[ ] Known-limitations note (no recovery, no reversal, Polygon only)
[ ] X/Reddit launch post draft
[ ] First user walkthrough tested
```

---

## Area status summary

| Area | Status |
|------|--------|
| Core contract | Deployed, hardened, 59/59 tests passing |
| MetaMask wallet | Complete |
| WalletConnect / Reown | Complete — Gate 1 closed |
| Transfer safety gates | Complete — live smoke passed 2026-06-01 |
| Receipt lifecycle | Complete — full lifecycle verified on live transfer |
| Gas transparency | Complete — expandable row, session-local |
| Signal / disclosure system | Complete — canonical vocabulary locked |
| Mobile UX | PASS — responsive + real MetaMask mobile browser smoke 2026-06-14 |
| Legal / disclosure | Research complete; attorney review pending |
| Public launch prep | Not started; correctly deferred |

---

## What is deferred and why

| Item | Reason |
|------|--------|
| Session restore after refresh | Privacy-first default for MVP; documented in ADR |
| Embedded wallets | Post-MVP |
| Social / email login | Post-MVP |
| Smart accounts | Post-MVP |
| Gas sponsorship | Post-MVP |
| totalSent in recipient history | Float safety; v2 will use integer base units |
| Recipient memory UX | Only if subtle; not before live smoke |
| Sparkline on gas row | Post-gas-row polish |
| Ledger integration | After web + Electron both stable |
| Ethereum mainnet | Post-Polygon-MVP |

---

## Static verification (as of branch park 2026-06-14)

```
Static check:     231/231 pass
Observability:     27/27  pass
Contract tests:    59/59  pass
Working tree:      clean
```

## Gate 2 Smoke Attempt Log

### 2026-05-31 — Controlled live smoke attempt

Outcome: blocked / incomplete.

The controlled live smoke branch opened `transfersEnabled` globally and for Polygon, but the approve → transferWithFee money path did not complete. No active receipt was present afterward, no approval hash or transfer hash was recorded, and no corresponding Polygonscan transaction was observed.

Follow-up contract check confirmed `paused() = false`, so the blocked browser message was not caused by the contract pause state. Most likely cause is wallet/session instability during the WalletConnect flow or stale frontend presentation after disconnect.

Gate 2 remains open. Next attempt should use a stable injected MetaMask session before opening the transfer gate.

### 2026-06-01 — Gate 2 confirmed COMPLETE

Outcome: full live-transfer smoke passed.

MetaMask injected session on Polygon mainnet. 1.01 USDC transfer (1.00 recipient + 0.01 fee).

Participants:
- Sender:    0x2489587C9da6EaB970a5479BA70273BA37961221
- Recipient: 0xe0B02A6d9738aa36eE48004211E264b7a815796B
- Treasury:  0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
- Contract:  0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0

Receipt IDs (localStorage ix.receipt.archive):
- Confirmed receipt:   2026-06-01T18:48:56.305Z-992d25bd  (state: confirmed)
- Authorizing receipt: 2026-06-01T18:43:53.395Z-d064d498  (state: authorizing)

Hashes:
- Transfer hash: 0xcfa000fa...eeb59a  (partial — full hash pending archive[0] extraction)
- Approval hash: pending archive[0] extraction

Evidence:
- MetaMask spending cap prompt: 1.01 USDC, spender matches chains.js
- UI transitioned to "Step 1 of 2 — Approve 1.01 USDC total debit / Wallet authorization required"
- Receipt panel showed AUTHORIZING → CONFIRMED state progression
- Sender balance: 9.22 → 8.21 USDC (−1.01 exact)
- Polygonscan confirmed split: 1.00 USDC to recipient, 0.01 USDC to treasury
- Contract interaction verified at deployed production address

All 12 money-path checklist items now complete. Failure/rejection paths remain for Gate 4.

Gate 2 is closed. Current position: Gate 3 (legal/disclosure review).
