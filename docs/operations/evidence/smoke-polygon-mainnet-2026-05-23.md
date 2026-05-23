# ImplicitEx Controlled Production Smoke — Polygon Mainnet

Date: 2026-05-23
Status: PASSED
Contract: 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 (canonical, Safe-owned)
Frontend: main @ f03629a (pre-smoke gate-open, post-smoke gate-closed)

## Transfer Evidence

```text
Transaction hash: 0xf4359437ad7f42ef2bc06dd829b5b68ea1bfe76f3a5919dd14f5c63e87573556
Explorer: https://polygonscan.com/tx/0xf4359437ad7f42ef2bc06dd829b5b68ea1bfe76f3a5919dd14f5c63e87573556
Network: Polygon mainnet (chainId 137)
Contract: 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
```

## Economic Routing Verification

```text
Recipient received:       1.00 USDC   ✅
Treasury fee received:    0.01 USDC   ✅  (100 bps = 1% of 1.00 USDC)
Sender total debit:       1.01 USDC   ✅  (amount + fee)
Contract retained:        0.00 USDC   ✅  (zero-custody routing confirmed)
```

Fee math correct: floor(1000000 × 100 / 10000) = 10000 atomic units = 0.01 USDC.
Contract never held funds. Both legs of safeTransferFrom executed atomically.

## UX Observations — Passed

- Armed-state button glow communicated "ready/live" unmistakably
- Animated phase labels (Approve in MetaMask… / Confirm transfer in MetaMask…)
  eliminated the false-completion ambiguity from MetaMask's own "transaction complete"
  messaging after the approval step
- MetaMask ↔ ImplicitEx coordination felt continuous, not broken
- Timeline persisted through wallet round-trips without collapsing
- Smart-contract recipient warning surfaced correctly for Safe address
- Recipient history (known/new, prior transfer count) displayed correctly
- Gate discipline held: opened for smoke only, closed before this commit

## Issues Surfaced — Requires Fix Before Public Exposure

Receipt lifecycle reconciliation bug observed:

1. "READY" receipt state persisting after completed execution — should not remain
   after a CONFIRMED transfer closes the flow
2. AUTHORIZING records not collapsing/promoting into final CONFIRMED state —
   the approval phase receipt is not being superseded by the transfer confirmation
3. Possible dual-record persistence between approve + transfer phases —
   two receipts may be visible when only one final confirmed record should remain

These are frontend receipt-store integrity issues, not contract issues.
Receipts are part of the trust surface — users reading stale READY or AUTHORIZING
records after a confirmed transfer will lose confidence in the platform.
This must be resolved before public exposure.

## Gate Discipline

Gate opened: manually, for this smoke only
Gate closed: immediately after smoke, before any commit
transfersEnabled state at commit: false (global), false (Polygon 137), false (Amoy)
