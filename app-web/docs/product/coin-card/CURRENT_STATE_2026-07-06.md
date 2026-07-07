# Coin Card — Execution Shell Checkpoint
**Date:** 2026-07-06
**Commit:** b1bc58e — "Rebuild Coin Card surface with approved design vocabulary"
**Branch:** gate3-production-frontend-qa
**Live URL:** https://implicitex.com/card/antoine

---

## Screenshot reference

`docs/operations/evidence/coincard/2026-07-06-card-execution-shell.png`

Take this screenshot before resuming Coin Card work. If the live card does not match it, investigate before touching code. The screenshot is visual evidence only; the preservation stack is the git tag, this checkpoint document, the artifact contract, the smoke checklist, and then the screenshot.

Machine-readable artifact contract:

`app-web/docs/product/coin-card/coin-card.artifact.json`

Current implementation structure contract:

`app-web/docs/product/coin-card/coin-card.structure/v1.json`

---

## Visual hierarchy (as designed and live)

```
┌─────────────────────────────────────────────────────┐
│  [ImplicitEx lettermark + wordmark]   ● Verified    │  ← cc-card-top
├─────────────────────────────────────────────────────┤
│  Send USDC                                          │  ← cc-card-tx-label
│  ┌─────────────────────────────────────────────┐   │
│  │ 0.00                               USDC     │   │  ← cc-card-amount-field
│  └─────────────────────────────────────────────┘   │
│  Fee 1%                              —              │  ← cc-card-tx-row
│  Total                               —              │
│  Antoine Dennison                                   │  ← cc-card-name
│  0xa7cE…3919                                        │  ← cc-card-recipient
├─────────────────────────────────────────────────────┤
│  [chip ▬]                                           │  ← cc-card-action (--waiting)
├─────────────────────────────────────────────────────┤
│  POLYGON · USDC                    [¢OIN CARD]      │  ← cc-card-bottom
└─────────────────────────────────────────────────────┘
```

**Card variant:** `cc-card--dark` (#1a1a1a surface, #f2f2f0 text)

---

## DOM structure

```
cc-frame[data-state]
  cc-loading          — MANIFEST_LOADING
  cc-error            — ERROR (manifest-level)
  cc-card.cc-card--dark
    cc-card-top
      cc-card-issuer  — ImplicitEx dual-art lettermark + wordmark
      cc-card-status  — Verified pill with dot
    cc-card-body
      #ccBodyInput    — VERIFIED / AMOUNT_READY / TRANSFER_INTENT_READY / WRONG_NETWORK
      #ccBodyReview   — READY_TO_SEND
      #ccBodyExec     — CONNECTING / SWITCHING_NETWORK / APPROVE_PENDING / EXECUTE_PENDING
      #ccBodyConfirmed— CONFIRMED
      #ccBodyError    — TX_FAILED / REVOKED
    cc-card-action
      #ccChip         — cc-card-chip--{waiting|ready|active|done}
    cc-card-bottom
      cc-card-network — "POLYGON · USDC"
      cc-card-stamp   — coincard-logo.svg
```

---

## Execution model

All fund-moving writes route through `window.IX_EXECUTE` (js/ix-execute.js).

**Flow:**
1. `IX_EXECUTE.connectWallet()` — eth_requestAccounts
2. `IX_EXECUTE.getChainId()` — confirm chain
3. `IX_EXECUTE.switchChain()` — if wrong network
4. `IX_EXECUTE.approve(chainId, sender, totalRaw)` — USDC approval
5. `IX_EXECUTE.waitForReceipt(approveHash)` — confirm approval
6. `IX_EXECUTE.transferWithFee(chainId, sender, recipient, amountRaw)` — execute
7. `IX_EXECUTE.waitForReceipt(txHash)` — confirm settlement

**Fee math:** `IX_EXECUTE.calculateFee(rawAmount, chainId, feeBps?)` — single authority.
Card.js calls this; fee displayed and fee on-chain are the same integer-division result.

**Chip dispatches by state:**
- `TRANSFER_INTENT_READY` → connectWallet()
- `WRONG_NETWORK` → switchNetwork()
- `READY_TO_SEND` → startExecution()

---

## Invariants

These must survive all future Coin Card work. If a proposed change violates any of them, stop.

1. **Coin Card is a complete payment instrument.**
   Every payment must be completable without leaving the Coin Card. The Transfer Portal
   is an optional inspection console, not a required step.

2. **Identity shell persists.**
   `cc-card-top` (issuer + status) and `cc-card-bottom` (network rail + stamp) are
   structural members. They are never hidden by state rules. Only body panels change.

3. **Fee math owned by the Execution Service.**
   `IX_EXECUTE.calculateFee()` is the single authority. card.js and wallet.js both
   consume it. No surface may implement its own fee calculation.

4. **No write outside IX_EXECUTE.**
   `eth_sendTransaction`, `.approve()`, `.transferWithFee()` must not appear outside
   `js/ix-execute.js`. Run the execution authority audit before any execution-adjacent change:
   ```
   grep -rn "eth_sendTransaction"        js/ config/ card/
   grep -rn "\.approve("                 js/ config/ card/
   grep -rn "transferWithFee("           js/ config/ card/
   ```

5. **Chip is the only action trigger inside the card.**
   No text buttons in the card frame. No external "Connect Wallet" button.
   The chip's state (waiting/ready/active/done) communicates what's happening.

---

## Smoke checklist

Run before and after any Coin Card change. Requires live browser + MetaMask.

### Visual / load checks (no wallet needed)

- [ ] `implicitex.com/card/antoine` loads without console errors
- [ ] ImplicitEx lettermark and wordmark visible in card top-left
- [ ] `● Verified` status pill visible in card top-right
- [ ] "Send USDC" label above the amount field
- [ ] Amount input field with "USDC" unit lock
- [ ] Fee and Total rows show `—` before amount is entered
- [ ] Recipient name (Antoine Dennison) visible
- [ ] Recipient address (0xa7cE…3919) visible
- [ ] `POLYGON · USDC` visible in card bottom-left
- [ ] COIN CARD stamp visible in card bottom-right
- [ ] Chip visible in waiting state (slow pulse) before amount entry
- [ ] Card background: #1a1a1a (dark)

### Amount + fee checks (no wallet needed)

- [ ] Enter `10.00` → Fee shows `0.10 USDC`, Total shows `10.10 USDC`
- [ ] Fee is exactly 1% (feeBps: 100)
- [ ] Fee and Total use integer math (no float drift — e.g. 0.100000001)
- [ ] Chip transitions from `--waiting` to `--ready` when valid amount entered
- [ ] Clear amount → chip returns to `--waiting`, fee rows reset to `—`

### Execution path (MetaMask required)

- [ ] Tap chip (--ready) → wallet connect prompt fires
- [ ] Wrong network → chip label reads "Switch to Polygon", chip --ready
- [ ] Tap chip on wrong network → network switch fires through IX_EXECUTE
- [ ] Review panel shows same amount / fee / total as input panel
- [ ] Tap chip on review → approval prompt fires (MetaMask)
- [ ] Console: `[IX] invoking approve` (not a direct Contract call)
- [ ] After approval: transfer prompt fires
- [ ] Console: `[IX] invoking transferWithFee`
- [ ] After transfer: CONFIRMED state; tx hash link visible; chip --done
- [ ] Reject approval (code 4001) → returns to READY_TO_SEND, chip --ready
- [ ] Reject transfer (code 4001) → returns to READY_TO_SEND, chip --ready

### Stage 2 gate (same amount on both surfaces)

- [ ] Enter same amount in `card/antoine` and Transfer Portal
- [ ] Fee displayed must be identical on both surfaces
- [ ] Total displayed must be identical on both surfaces

---

## Known violations (tracked, not blocking)

| Call | Location | Status |
|---|---|---|
| `wallet_switchEthereumChain` | wallet.js:3021 | Known; Stage 1 roadmap item |
| `eth_requestAccounts` | wallet.js | Known; Stage 1 roadmap item |
| `eth_requestAccounts` | coincard-publisher*.js | Known; Stage 1 roadmap item |

---

## Opening procedure for next Coin Card session

1. Read this document.
2. Read `app-web/docs/product/coin-card/coin-card.artifact.json`.
3. Read `app-web/docs/product/coin-card/coin-card.structure/v1.json`.
4. Run `npm run validate:architecture`.
5. Confirm the checkpoint tag `coincard-instrument-checkpoint-2026-07-06` exists.
6. Open `https://implicitex.com/card/antoine` in browser.
7. Compare against the screenshot at `docs/operations/evidence/coincard/2026-07-06-card-execution-shell.png`.
8. If the card does not match, investigate before writing code.
9. Run the smoke checklist (visual + fee checks, no wallet needed).
10. Only then proceed with planned work.

**The checkpoint is b1bc58e. Any regression from this state is a bug, not a style choice.**
