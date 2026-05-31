# ImplicitEx MVP Roadmap

Last updated: 2026-05-30
Branch: walletconnect-mobile-session

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
Gate 2: Live-transfer readiness review       ← current position
Gate 3: Legal/disclosure review
Gate 4: Mainnet controlled live smoke
Gate 5: Public soft launch
```

**Positioning:** Gate 1 complete. Gate 2 preparation in progress.

The product now has credible wallet coverage, safety states, telemetry, and a coherent
interaction language. The risk is not lack of features — it is adding more before proving
the actual money movement path end-to-end.

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

**This is the highest-risk unknown before Gate 4.**

The approve → transferWithFee lifecycle has never executed under a real wallet prompt on
the live frontend. Everything else on the gate list verifies existing built behavior.
This is first-execution of the actual money path.

```
[x] Preview mode — renders on valid recipient + amount
[x] Transfers disabled gate — global + per-chain
[x] Configured-chain checks
[x] Paused-contract checks
[x] On-chain refreshed preview before wallet prompt
[x] Below-minimum transfer block
[x] Insufficient-balance block
[ ] Approve USDC — manual wallet prompt verification needed
[ ] Allowance confirmation — state transition AUTHORIZING → AUTHORIZED
[ ] transferWithFee execution
[ ] Fee deducted correctly (sender −1.01 USDC, recipient +1.00 USDC, treasury +0.01 USDC)
[ ] Explorer verification on real transfer
[ ] Failure/rejection paths under real wallet prompts
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
[ ] Full real-transfer receipt validation (requires live transfer)
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
[ ] Mobile menu — hamburger nav, browsing vs transaction modes
[ ] Mobile form — spacing, tap targets, keyboard overlays
[ ] No duplicate provider events — verify on WC reconnect
[ ] WalletConnect reconnect after MetaMask session and vice versa
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
[ ] Terms reviewed by attorney
[ ] Privacy reviewed by attorney
[ ] Jurisdiction language reviewed
[ ] Risk disclosures reviewed
[ ] Platform comparison brief refined
[ ] Firebase deploy smoke before go-live
[ ] transfersEnabled gate confirmed closed before deploy; opened only for controlled smoke
```

Legal review is a real gate, not cosmetic.

---

### 6. Public launch prep

```
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
| Transfer safety gates | Built; real-execution unverified |
| Receipt lifecycle | Built; real-transfer validation pending |
| Gas transparency | Complete — expandable row, session-local |
| Signal / disclosure system | Complete — canonical vocabulary locked |
| Mobile UX | Architecture decided; manual QA pending |
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

## Static verification (as of branch park 2026-05-30)

```
Static check:     145/145 pass
Observability:     27/27  pass
Contract tests:    59/59  pass
Working tree:      clean
```
