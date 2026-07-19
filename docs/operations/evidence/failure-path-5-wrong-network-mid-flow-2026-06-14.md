# Failure Path 5 — Wrong Network Mid-Flow

**Date:** 2026-06-14
**Branch:** gate3-production-frontend-qa
**Outcome:** PASS

---

## Test scope

Verify that switching MetaMask to a non-Polygon network **while a valid Polygon transfer
is prepared** produces an immediate, honest block — with the transfer panel hidden, no
stale preview, no stale executable transfer, and a clear message directing the user to
switch back.

This path tests the `chainChanged` event handler at `wallet.js:112` and its downstream
call chain through `applyCurrentNetworkPresentation()` → `applyWrongNetworkPresentation()`.

---

## How the block works (code path for reference)

1. MetaMask fires `chainChanged` event.
2. `handleActiveProviderChainChanged(chainHex)` (wallet.js:112):
   - Updates `state.chainId` to the new chain.
   - Sets `activeFlowId = null` — invalidates any in-flight transfer flow.
   - Calls `applyCurrentNetworkPresentation()`.
3. `applyCurrentNetworkPresentation()` (wallet.js:2623):
   - Calls `getNetworkState()` → returns `WRONG_NETWORK` (new chain not in `IX_CHAINS`).
   - Routes to `applyWrongNetworkPresentation()`.
4. `applyWrongNetworkPresentation()` (wallet.js:2367):
   - Calls `exitReview()` — exits `REVIEW_READY` or `SIMULATING` phase if active.
     - `state.txPhase` → `'DRAFT'`; `state.reviewDraft` → `null`
     - `resetReviewAcknowledgement()` — ack checkbox cleared
     - Button disarmed and re-labeled
   - Calls `hideTransferModules()` — transfer panel fully hidden.
   - Calls `hidePreview()` — preview hidden.
   - Sets network badge to error/red with new chain label.
   - Sets button to `'Switch to Polygon'`.
   - Sets status: `'Switch MetaMask to Polygon Mainnet before sending USDC.'`
   - Opens companion tray in `WRONG_NETWORK` state.
5. A 1500ms poll (`startWalletChainWatcher`) also calls `syncProviderState()` as
   belt-and-suspenders, catching any late-firing events.

---

## Setup

- Wallet: MetaMask injected, Polygon mainnet
- Gate: `transfersEnabled` opened for test session, closed before commit
- Recipient: `0xe0B02A6d9738aa36eE48004211E264b7a815796B`
- Amount: `1.00` USDC
- Network switched to: **Ethereum mainnet** (chain 1, `0x1`, not in `IX_CHAINS`)

---

## MetaMask ambiguity — recorded for evidence integrity

The first attempted network switch changed MetaMask's token/account view to Ethereum,
but did **not** change the dapp-connected provider chain for `localhost:8080`. Provider
remained on `0x89` (Polygon). That is not a valid FP5 trigger.

Confirmed via:
```js
await ethereum.request({ method: 'eth_chainId' })
// → "0x89"  (Polygon — FP5 not yet triggered)
```

The valid FP5 trigger occurred only after switching the **site-connected network** for
`localhost:8080` using the per-site network selector in the MetaMask panel. After that
switch, `eth_chainId` returned `"0x1"` and the app immediately responded correctly.

This is a wallet QA detail, not an app inconsistency. MetaMask has two separate network
contexts: the global wallet token view, and the per-site dapp provider chain. FP5 requires
changing the latter.

---

## Primary path: DRAFT → chain switch

**Procedure:**
1. Connected MetaMask on Polygon mainnet.
2. Entered recipient and 1.00 USDC amount — preview rendered normally.
3. Switched site-connected network for localhost:8080 to Ethereum mainnet.
4. Observed immediate response.

**Signals observed on switch:**

| Signal | Expected | Observed |
|--------|----------|----------|
| Transfer panel | Immediately hidden | PASS |
| Preview | Immediately hidden | PASS |
| Nav status | Wrong network (error state) | PASS |
| Network badge | Ethereum Mainnet, red | PASS |
| Button | `Switch to Polygon` | PASS |
| Status bar | Switch MetaMask to Polygon Mainnet before sending USDC. | PASS |
| Acknowledgement checkbox | Cleared | PASS |
| Companion tray | Opened in WRONG_NETWORK state | PASS |
| Wallet prompt | Never triggered | PASS |

---

## Console checks (while on Ethereum)

```js
await ethereum.request({ method: 'eth_chainId' })
// → "0x1"   ✓ provider confirmed on Ethereum

window.IX?.receipts?.getActive?.()
// → null   ✓ no active receipt

Object.keys(localStorage).filter(k => k.includes('receipt'))
// → []   ✓ no receipt created during FP5 attempt
```

---

## Recovery check

Switched site-connected network back to Polygon mainnet.

| Signal | Expected | Observed |
|--------|----------|----------|
| Transfer panel | Reappears | PASS |
| USDC balance | Refreshed | PASS |
| Recipient + amount fields | Preserved (user-friendly) | PASS |
| Acknowledgement checkbox | Cleared — user must re-confirm | PASS |
| Execute Transfer button | Disabled — not auto-armed | PASS |
| Wrong-network status | Cleared | PASS |
| Network badge | Polygon, no error state | PASS |
| No stale armed transfer | Confirmed | PASS |

**Trust lock confirmed:** recipient and amount persisting on recovery is correct UX; the
cleared acknowledgement is the safety gate. The user must explicitly re-confirm before
execution can be armed. No stale armed transfer returns from network recovery.

---

## Secondary variant: REVIEW_READY → chain switch

**Outcome: NOT APPLICABLE — blocked by wallet UX, not an app failure.**

Attempted: prepared valid transfer → checked acknowledgement → clicked Execute Transfer
to enter review/preflight state.

MetaMask opened a confirmation prompt before or alongside the preflight. Once MetaMask
has an open confirmation prompt, switching the site-connected network is not possible
until the prompt is resolved (approved or rejected). Rejecting the prompt produces a
`User denied transaction signature` event — FP2 rejection behavior, not FP5 wrong-network
behavior. The two paths cannot be isolated once a wallet prompt is open.

**This is not an app bug.** Before a wallet prompt opens, the app can and does react to
`chainChanged`. After a wallet prompt opens, MetaMask controls the UI — the dapp cannot
receive network-switch events until the prompt resolves.

**Conclusion for secondary variant:** The REVIEW_READY → chainChanged path is verified
by code review (`applyWrongNetworkPresentation()` calls `exitReview()` unconditionally
before hiding the panel), but cannot be cleanly reproduced in the browser because MetaMask
blocks network switching while a confirmation prompt is open. Not counted as a pass or
fail — excluded from verdict.

---

## Pass criteria

| Criterion | Result |
|-----------|--------|
| Transfer panel hidden immediately on chain switch | PASS |
| Preview hidden — no stale transfer visible | PASS |
| Network badge updates to Ethereum, error state | PASS |
| Button changes to `Switch to Polygon` | PASS |
| Status bar: correct wrong-network message | PASS |
| Acknowledgement checkbox cleared | PASS |
| No MetaMask prompt triggered | PASS |
| `getActive()` → null | PASS |
| No receipt created | PASS |
| Provider chain confirmed `0x1` via `eth_chainId` | PASS |
| Recovery: switch back to Polygon restores transfer panel | PASS |
| Recovery: ack cleared, transfer not auto-armed | PASS |

---

## Gate discipline

- `transfersEnabled` opened for test session, closed before commit — verified
- All three `transfersEnabled` flags confirmed `false` before commit
- Static check and observability suite passed before commit

---

## Verdict

PASS — 2026-06-14

Primary DRAFT → wrong-network path verified. App correctly blocks on `chainChanged`
before any wallet contact, hides the transfer panel, clears the acknowledgement, and
presents exact guidance. Recovery to Polygon is clean: form restores, ack cleared,
no stale armed transfer.

Secondary REVIEW_READY variant is verified by code review but excluded from browser
evidence: MetaMask does not allow switching the site-connected network while a confirmation
prompt is open, making the scenario unreproducible in isolation.

MetaMask per-site network vs. global token-view ambiguity documented above to protect
evidence integrity.
