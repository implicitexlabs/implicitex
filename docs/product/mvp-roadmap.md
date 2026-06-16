# ImplicitEx MVP Roadmap

Last updated: 2026-06-16
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
Gate 3: Builder-controlled launch readiness  ← COMPLETE 2026-06-15
Gate 4: Mainnet controlled live smoke        ← COMPLETE 2026-06-15
Gate 5: Public soft launch                   ← current position
```

**Positioning:** Gate 2 complete. Live transfer smoke passed 2026-06-01 with real USDC on
Polygon. Full approve → transferWithFee → receipt lifecycle verified end-to-end.

Gate 3 is builder-controlled launch readiness. The question it answers is no longer "can
it work?" — that is proven. Gate 3 answers: "can we expose it without embarrassing trust
failures, stale wallet state, unclear risk language, or unsafe deploy procedure?"

Gate 3 checklist — **COMPLETE 2026-06-15**:
```
[x] Failure paths — FP1–FP5 PASS, FP6 verified by code review
[x] Mobile UX smoke — responsive viewport + real MetaMask mobile browser PASS
[x] Wallet/provider regression — PASS WITH CAVEATS; Reown noise documented
[x] Support/disclaimer copy pass — FAQ added to mobile menu; 'being developed' removed
[x] Transfer gate + deploy safety checklist — docs/operations/deploy-safety-checklist.md
[x] Firebase deploy smoke — PASS 2026-06-15; all routes, gate closed, config fresh
```

Gate 4 checklist — **COMPLETE 2026-06-15**:
```
[x] Confirm branch/commit/suite before opening gate
[x] Flip transfersEnabled intentionally
[x] Deploy live config
[x] Execute small controlled USDC transfer (1.00 USDC)
[x] Verify approval prompt → transfer prompt → receipt → Polygonscan → fee split
[x] Close gate immediately
[x] Deploy closed-gate config
[x] Confirm public app is closed again
[x] Commit evidence
```

Gate 5 (public soft launch) minimum posture:
```
[ ] Homepage copy final
[ ] Support/contact route works
[x] Known-limitations note (added legal.html 2026-06-15)
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

**Strategic framing (Gate 5):** The engineering question — "will the system work?" — is
answered. The Gate 5 question is: "can a new visitor understand why they should trust it?"
This is a copy, transparency, and communication problem, not a smart contract problem.

**The two abandonment points** (observed from Gate 4 evidence, not hypothetical):
1. The wallet prompt — "Why am I seeing two prompts? What does each one do?"
2. The Blockaid warning — "Why is MetaMask warning me? What exactly is this contract doing?"
The first-time visitor stops at one of these moments and either finds an answer or leaves.
FAQ entries 1 and 2 exist to intercept those moments before doubt compounds.

**Gate 5 session opening order:**
1. verification.html — facts only, no adjectives. Build this first. It anchors everything
   that follows: the FAQ has something to cite, the homepage has something to point to,
   the launch announcement has something to link instead of claims to make.
2. FAQ: Why does MetaMask show two confirmations? (cites verification page)
3. FAQ: Why does MetaMask say the contract is untrusted? (cites verification page)
4. Homepage copy — anchored to a proven, documented, revenue-producing transaction
5. Launch announcement — points to evidence, not positioning

Gate 5 items split into two categories:

#### Trust-critical (affects whether a first-time visitor proceeds or bounces)

```
[x] FAQ added — Polygon, USDC, two wallet confirmations, fee vs gas, wrong address risk
[x] Landing page How It Works copy aligned to proven fee-on-top model and two-prompt flow
[x] About page copy aligned — fee example with total debit, jargon removed

[x] Transparency / Verification page — carries the most weight of any remaining item.
    Name it "Transparency", "Verification", or "How ImplicitEx Works" — not "Trust".
    Trust is the result of evidence. This page publishes the evidence. A visitor who
    sees the Blockaid "untrusted contract" warning immediately asks: who built this,
    what address am I interacting with, where does the fee go, is the source public,
    has anyone used this before? This page answers all five in one place.
    Do not use the words "Secure", "Transparent", "Decentralized", or "Audited" without
    evidence behind them. Everything on this page is a fact or a link.

    Public Verification Section — a linked checklist answering the six questions a
    cautious user asks before clicking Confirm. Purpose is not to impress; it is to
    remove each specific uncertainty:

        Contract Address   → 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 (Polygonscan)
        Treasury Address   → 0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
        Supported Network  → Polygon mainnet
        Supported Asset    → USDC (Circle native, 0x3c499c...3359)
        Source Code        → [link to verified source on Polygonscan]
        Fee Model          → 1% additive; sender pays amount + fee; recipient receives full amount
        Latest Verified Tx → [link — updated as transaction history grows]

    Verified Live Transaction section (no hype, no adjectives — just facts):

          Controlled Mainnet Validation — 2026-06-15
          Network: Polygon | Asset: USDC
          Sender debit:       1.01 USDC
          Recipient received: 1.00 USDC
          Treasury received:  0.01 USDC
          Status: Confirmed on-chain
          Tx: 0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9

        The fee path is visible and auditable. Treasury received exactly what the UI said
        it would. Most crypto projects never show this. Showing it is the point of the page.

[x] FAQ entry: "Why does MetaMask show two confirmations?" (present pre-Gate 4)
[x] FAQ entry: "Why does MetaMask warn that the contract is untrusted?" (added 2026-06-15, cites verification.html)

[x] 1. Known-limitations note — added to legal.html 2026-06-15 (e479e43).
         Seven bullet points: Polygon only, USDC only, 250 USDC cap, irreversible,
         no address recovery, wallet required, no fiat. Links to Proof page.

[ ] 2. Contact path — gives users somewhere to go when uncertain; reduces
         abandonment from questions that FAQ doesn't answer.

[ ] 3. First-user walkthrough

   Brief: give the tester the URL (implicitex-236f2.web.app) and one sentence:
   "This is a USDC transfer tool. Take a look around."
   No other context. No hints. No narration.

   Observer watches for:
   - Where do they go first?
   - Do they find FAQ, Proof, Legal, Contact without prompting?
   - Do they hesitate at any point? If so, where exactly?
   - Do they understand what Polygon and USDC mean in this context?
   - Do they understand the 1% fee before being told?
   - Do they expect Ethereum, other tokens, or fiat support?

   Known watch items from Gate 4 evidence:
   - Wallet prompts: does the two-confirmation flow make sense unprompted?
   - Blockaid warning: does "Proof" in the footer get clicked when they see it?
   - Proof/Verification label: does "Verification" h1 cause confusion after clicking "Proof"?

   Signal vs. noise:
   - Hesitation + question = signal (something the site isn't answering)
   - Hesitation + self-resolution = noise (the site is working, user just needed a moment)
   - Confusion + no self-resolution = fix before cutover

   After walkthrough: update FAQ/Proof/Contact as needed, then make cutover decision.

**Domain cutover (implicitex.com → implicitex-236f2.web.app) is held until after
the walkthrough.** Cutover is irreversible in terms of public visibility — run the
cheapest comprehension test first.
```

#### Conversion-critical (affects whether someone who already trusts the platform completes a transfer)

```
[ ] 4. Homepage copy final — easier once limitations note and walkthrough feedback exist.

[ ] 5. Launch announcement — last item; points to verification.html, not marketing claims.
        "Here is the contract. Here is the treasury. Here is a verified transaction.
        Here is how the fee works." That is the announcement.
```

#### Post-walkthrough (informed by tester behavior, not assumptions)

```
[ ] 6. WalletConnect end-to-end smoke

   Status: Deferred. Implementation is complete — wallet.js:3935-4004,
   walletconnect-provider.js, vendor bundle present, project ID set.
   Button soft-disabled in index.html pending verification.

   Required to re-enable:
   - QR modal opens on a real mobile device
   - Session connects and account is returned
   - Transfer flow completes through WalletConnect provider
   - Disconnect lifecycle clears session and localStorage correctly

   Restore path: one-line HTML change (restore <button> in wallet-choice overlay)
   Block: do not re-enable until all four checks pass

[ ] 7. LEARN — crypto onboarding center

   Status: Design locked, content deferred. Architecture is defined at
   docs/product/learn-design-brief.md. Do not write entries before the
   walkthrough. Walkthrough findings determine which content to write first.

   Scope: LEARN is not a glossary. It is a crypto onboarding center — the
   bridge between traditional finance users and crypto users. It answers
   questions that belong neither in FAQ (product questions) nor in Legal
   (boundaries and disclaimers).

   Guiding principle:
   "It costs nothing to educate. It can cost everything to assume."

   Three layers (see design brief for full spec):
   - Layer 1: Quick Definitions — searchable, alphabetical, one-paragraph answers
   - Layer 2: First-Time User Guides — getting started, using ImplicitEx
   - Layer 3: Trust & Regulation — legality, USDC, GENIUS Act, user protections

   FAQ boundary:
   - FAQ: focused product questions (why two confirmations? why Polygon? why the warning?)
   - LEARN: educational resources (what is a wallet? how do I get one? is this legal?)
   - When a FAQ answer becomes a teaching resource, it moves to LEARN

   Name: LEARN (not "Terms" — collision with Terms of Service; not "Glossary" — too academic)
   URL: /learn.html
   Nav: primary footer link + inline term links from FAQ and homepage
```

**Blockaid warning principle:** The correct response is not to hide or dismiss it. The
better response is: "You may see an untrusted-contract warning because the contract is new.
Here is the address. Here is the source. Here is exactly what the transaction does."
Sophisticated users who see MetaMask performing security analysis and then see the
transaction reconcile perfectly will develop more trust than users who are told to ignore
the warning. Transparency is the mitigation.

Longer-term mitigations (no single fix):
- Polygonscan source verification (already complete — launch safety above)
- Transaction history accumulation (Blockaid becomes less aggressive over time)
- Lightweight audit published publicly (post-MVP, before scale)

---

## Area status summary

| Area | Status |
|------|--------|
| Core contract | Deployed, hardened, 59/59 tests passing |
| MetaMask wallet | Complete |
| WalletConnect / Reown | Complete — Gate 1 closed |
| Transfer safety gates | Complete — Gate 4 mainnet smoke passed 2026-06-15 |
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
| Creator widget | Post-MVP; depends on transfer engine being proven reliable first |
| Creator dashboard | Post-widget; requires transaction volume to be meaningful |

---

## Post-MVP expansion

The MVP answers one question: **can a person reliably transfer USDC?**

The next questions depend on it.

---

### Layer 1 — Transfer engine (current)

```
Wallet → Wallet
1% fee
No custody
```

This is what ships. Everything below requires this to work first.

---

### Layer 2 — Creator widget

An embeddable transfer interface for creator pages, blogs, newsletters, and
podcasts. The user does not create an account, download a wallet, or join an
ecosystem. They use the wallet they already have.

```
Creator Website
      ↓
ImplicitEx Widget
      ↓
USDC Transfer
```

Conceptual UI:

```
Support [Creator]
[ Send $5 ]  [ Send $10 ]  [ Custom Amount ]
Powered by ImplicitEx
```

**Why this is the right first expansion:**

- Every creator who embeds the widget becomes a distribution channel.
- Supporters use it. Every transfer generates a fee. The creator gets support,
  ImplicitEx gets transaction volume.
- That is a cleaner growth loop than acquiring individual transfer users one by one.

**Differentiation from custodial alternatives (e.g. Rumble Wallet):**

Custodial model: download our wallet, create an account, join our ecosystem.
ImplicitEx model: already have a wallet? Click support and send USDC.

The second has less friction and no lock-in. The emotional purchase is the same
— "I want to support this creator" — but the path is shorter.

**Technical preconditions before building:**

- Transfer engine proven stable under real load (Gate 5 complete)
- Fee model confirmed working and understood by users
- Receipt lifecycle reliable (no orphaned receipts in production)
- Widget embed architecture defined (iframe, script tag, or redirect flow)

**Status:** Not started. Correctly deferred until transfer engine is proven.

---

### Layer 3 — Creator dashboard

Post-widget. Only meaningful when transaction volume exists.

```
Creators:   transfer analytics, supporter history, top supporters
Supporters: recurring support, campaign tracking
```

This is where ImplicitEx starts competing with creator monetization tools.
Do not design for this before Layer 2 ships and generates real data.

---

**Sequencing principle:** the creator widget was not abandoned — it was correctly
deferred behind the harder problem of proving the transfer engine works. The widget
depends on that proof. Once Gate 5 is complete and real transfers are flowing, the
creator widget becomes the most natural first revenue-producing expansion.

---

## Static verification (as of branch park 2026-06-14)

```
Static check:     231/231 pass
Observability:     27/27  pass
Contract tests:    59/59  pass
Working tree:      clean
```

## Post-Gate 3 fixes and improvements (2026-06-15)

Suite result after all changes: 232/232 static · 31/31 observability · 59/59 contract.

### 5. Nav shows WALLET CONNECTED with no wallet authorized — fixed (`898a547`)

`applyCurrentNetworkPresentation()` had no guard for the `DISCONNECTED` state.
On every `focus` and `visibilitychange` event, `syncProviderState({ force: true })`
called `applyCurrentNetworkPresentation()`, which fell through to
`applyConnectedPresentation()` even when `state.connected = false`. This applied
the `.connected` class to `connectBtn` and set nav status to "Wallet connected"
on every tab-switch and window-focus event when no wallet was authorized — a
direct trust contradiction visible to any unauthenticated visitor.

Fixed by adding an early return for `DISCONNECTED` at the top of
`applyCurrentNetworkPresentation()`. Focus/visibility sync events now exit
immediately when no wallet is connected. All connected paths (chain change,
account change, real connect) are unchanged. Nav smoke confirmed: hard refresh
→ "Connect Wallet"; tab-away/back → "Connect Wallet"; connect → connected state;
disconnect → "Connect Wallet". Pre-Gate-4 blocker closed.

### 1. Receipt-recovery path broken — fixed (`95d9c91` + `b48a680`)

`polygon-rpc.com` began returning 401 (unauthenticated access disabled) for all
JSON-RPC calls including `eth_getTransactionReceipt`. The live in-session transfer
path (`tx.wait()` via MetaMask) was unaffected — it uses the wallet's own RPC.
But `reconcileActiveReceipt()`, called on page reload with a pending receipt and on
the manual "Check status" button, was silently failing with `OUTCOME_UNKNOWN` and
"App status check failed. Check the explorer before retrying."

Fixed by replacing the endpoint with `polygon-bor-rpc.publicnode.com` in `chains.js`.
The endpoint swap alone was not sufficient: `polygon-bor-rpc.publicnode.com` was not
in the CSP `connect-src` directive in `firebase.json`, so the browser blocked the
fetch silently — receipt recovery remained broken until both changes landed together.

Verified against a recent transaction receipt (block 88,536,207) and a 14-day-old
receipt (block 87,697,424, Gate 2 block range). Both returned correctly with
`status: 0x1`. CORS `*` confirmed from both `implicitex.app` and
`implicitex-236f2.web.app` origins. `eth_getLogs` is pruned on publicnode for
old blocks; `eth_getTransactionReceipt` is not — receipt data is retained.

### 2. Execute Transfer button armed in TRANSFERS_DISABLED state — fixed (`b48a680`)

`updatePreview()` reached `setDraftButton('Execute Transfer', false)` unconditionally
when the form was valid (valid recipient, sufficient balance, above minimum), even
in `TRANSFERS_DISABLED` state. If the user checked the ack checkbox, the button
appeared armed and clickable alongside an amber "Transfers paused by launch gate"
preflight bullet — a direct visual contradiction.

The click-time guard in `enterReview()` was always present and safe (it returns
immediately with a status message, no wallet prompt). But the visual state was
misleading. Fixed by adding a `TRANSFERS_DISABLED` guard in `updatePreview()` after
the preview renders: transfer summary remains visible, ack checkbox is hidden, button
stays inert with label "Transfers disabled." The `enterReview()` guard remains as a
second layer.

### 3. Ack checkbox not hiding due to `display:flex` CSS override — fixed (`34d746c`)

`.tx-confirm { display: flex }` overrides the browser UA stylesheet's default
`[hidden] { display: none }`. `setReviewAcknowledgementVisible(false)` was setting
the `hidden` attribute correctly, but CSS won — the checkbox remained visible.
Added `.tx-confirm[hidden] { display: none; }`, matching the pattern used by every
other `[hidden]` element in the codebase.

### 4. Network column additions — RPC latency and confirmation time (`793f0dd`)

Two new rows added to the 02 Network panel:

- **Confirmation**: `blockTime × 2` from the Gas Station response (~3.0 sec typical).
  Live data, not a static string. Resets to `—` on Gas Station failure.
- **RPC latency**: Direct `eth_blockNumber` probe to `polygon-bor-rpc.publicnode.com`
  (the chain RPC, independent of the Gas Station). Gray numeric on success, red
  "Unavailable" on timeout (5s AbortController), non-200, or network failure.
  Resets to `—` at the start of each 30-second cycle to prevent stale readings.
  Amber reserved for transfer-flow signals; gray/red only here.

Root cause note: the CSP gap (item 1) initially caused this row to show red
"Unavailable" even after the endpoint swap, since the browser blocked the fetch.
Both resolved together.

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
