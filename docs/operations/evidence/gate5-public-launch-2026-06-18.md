# ImplicitEx Gate 5 — Public Soft Launch

Date: 2026-06-18
Status: BLOCKED — Blockaid/MetaMask approval-step classification
Gate: Gate 5 (Public soft launch — transfers open to users)
Branch: gate3-production-frontend-qa
Network: Polygon mainnet (chainId 137)
Site: https://implicitex-236f2.web.app

## Gate 4 Reference

Gate 4 (controlled smoke) was completed 2026-06-15.
Evidence: docs/operations/evidence/gate4-mainnet-controlled-smoke-2026-06-15.md
Tx: 0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9
Result: PASS — fee routing confirmed, zero-custody confirmed, UI state machine confirmed.

## Config State

```text
Opened:   e0e21b1 — transfersEnabled: true  (global + Polygon)
Disabled: 9bf6922 — transfersEnabled: false (global + Polygon)
Current:  DISABLED — safe standby state

Contract:  0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
USDC:      0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
Treasury:  0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
Cap:       250 USDC / transfer (soft launch)
Fee:       1% additive
Amoy:      transfersEnabled: false (unchanged throughout)
```

## Pre-Launch Checks Passed

```text
Static audit:     631 references — PASS
Contract suite:   59/59 — PASS
Working tree:     clean
Typography lane:  closed at 523b71c
Formatting lane:  closed at efd2ebd
```

## Walkthrough Attempt — 2026-06-18

Transfers enabled at e0e21b1. First-user walkthrough initiated.

```text
Wallet:          MetaMask injected
Sender:          0x2489…1221
Recipient:       0xe0B02A6d…15796B
Amount entered:  1.00 USDC  (initially typed 1.01 by error, corrected)
Fee shown:       0.010000 USDC
Total debit:     1.010000 USDC
Approval amount: 1.01 USDC (exact — not unlimited)  ✓
```

**Walkthrough halted at approval step.**

## Observed Blocker

```text
Step:     USDC approval / spending-cap prompt (prompt 1 of 2)
Screen:   "Set a spending cap for your USDC"
Warning:  "This is a deceptive request" (MetaMask/Blockaid)
Cap shown: 1.01 USDC
Action:   Not signed — walkthrough aborted

Transfer execution prompt (prompt 2) was NOT reached.
No evidence that the transfer call itself is flagged.
```

## Classification Unknown

The Blockaid warning was observed on the approval step only. The specific
cause is not yet determined. Possible classifications:

```text
1. Site/domain reputation   — implicitex-236f2.web.app is staging, not implicitex.com
2. Contract/spender address — new contract, low transaction history
3. Approval call metadata   — app context or permit data flagged
4. Generic new-domain risk  — heuristic, not a specific finding
5. Combination of above
```

**This is an approval-step false positive**, not evidence that the transfer
logic or fee routing is incorrect. Gate 4 (2026-06-15) confirmed correct
on-chain behavior from the same contract.

## Current Safe State

Transfers disabled at 9bf6922. Site is in standby mode.
Users see the transfer portal as inactive — no execution path available.

## Re-enable Conditions

Do not re-enable transfers until one of the following:

```text
A. Blockaid review/whitelist request submitted and approved
B. Diagnostic smoke confirms the warning is domain-specific
   (test on implicitex.com vs implicitex-236f2.web.app)
C. Deliberate decision to accept the warning risk with documented rationale
```

## Revert Path (if needed)

Current disabled state (9bf6922) is the safe baseline.
To re-enable: flip both transfersEnabled flags to true and deploy.
To document that decision, update this file before deploying.

## Next Action

~~Submit Blockaid false-positive report.~~ DONE 2026-06-18.

Reports submitted for both:
- implicitex.com
- implicitex-236f2.web.app

Awaiting Blockaid review. Re-enable transfers after classification is cleared.

---

## P0 — Mobile Transfer Execution (post-launch regression)

Observed post-launch on MetaMask Mobile in-app browser:
approval (prompt 1) confirmed → transfer (prompt 2) never appeared → UI reported "Transfer could not continue."

**Root cause hypothesis:** MetaMask Mobile's in-app browser provider fires -32603 when a second
`eth_sendTransaction` is submitted before its internal pending-request state has cleared after
the first confirmation. The original 500ms fixed delay was insufficient or insufficient for
mobile hardware variance.

**Fix history:**
- commit 6c2ff01 — initial 500ms fixed delay (insufficient)
- commit 5f6de1e — replaced with on-chain allowance poll (500ms intervals, 10s timeout)
- commit 5f6de1e — -32603 classification added to error-classifier.js (WALLET_INTERNAL_ERROR)
- commit a4c6509 — raw provider error code now shown in LAST EVENT: "CLASSIFIED (raw: CODE)"
  visible on device without USB debugging

**First device result (2026-06-19):**
```text
Approval shown:        YES
Approval confirmed:    YES
Second prompt shown:   NO
Final result:          Transfer could not continue
Last event:            UNKNOWN_ERROR
```

UNKNOWN_ERROR persisting after deployment of -32603 classifier means one of:
1. Cached JS served old error-classifier.js (no -32603 handler)
2. Actual error code is not -32603 — different error escaping classification
3. ERROR_CLASSIFIER not loaded (script load failure — also produces UNKNOWN_ERROR)

Raw code is not yet captured. Next test will show "UNKNOWN_ERROR (raw: CODE)" in LAST EVENT.

**Pending: device confirmation — second pass**

```text
Approval shown:
Approval confirmed:
Delay after approval (observed):
Second prompt shown:
Final result:
Last event (full string — includes raw code):
```

**Verdict logic:**
- Second prompt appears → P0 closed
- Last event shows "WALLET_INTERNAL_ERROR (raw: -32603)" → classifier ran, provider state issue; split into two user-initiated steps
- Last event shows "UNKNOWN_ERROR (raw: -32603)" → classifier present but old version cached; force cache clear
- Last event shows "UNKNOWN_ERROR (raw: undefined)" → ERROR_CLASSIFIER not loading; script load failure
- Last event shows any other raw code → new error category, classify and handle

---

## P1 — Proof Packet Export Broken on Mobile (trust-surface bug)

**Observed (2026-06-19):** Interrupted receipt entries render "Export proof packet" button.
Tapping it on MetaMask Mobile in-app browser does nothing — no download, no feedback.

**Root cause:** `downloadProofPacket` used `URL.createObjectURL` + programmatic `a.click()`.
MetaMask's in-app browser (iOS/Android WebView) silently blocks this pattern.

**Fix deployed (commit a4c6509):**
- Blob download attempted first (works on desktop)
- On failure: `navigator.clipboard.writeText` copies JSON to clipboard
- Status line confirms "Proof packet copied to clipboard."
- Graceful fallback message if clipboard also unavailable

**Verification needed:**
```text
Interrupted receipt visible:
Export proof packet tapped:
Result: [ ] downloaded  [ ] copied to clipboard  [ ] error message shown  [ ] silent fail
```

**Classification:** Trust-surface bug, not transfer root cause. Does not block P0 diagnosis.
Interrupted receipts prove the app is persisting state correctly — the export action was broken,
not the receipt itself.
