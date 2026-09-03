# Follow-On Record: calculateFee / MAX_FEE Absent from Deployed Bytecode
## 2026-08-29

Recorded during IX ID / ImplicitEx production deployment read-only live preflight.
This is a follow-on record, not a blocker to the current deployment tranche.

---

## 1. Observation

On-chain read of `ImplicitExTransfer` at `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0`
(Polygon mainnet, chain ID 137) reveals two functions that are declared `public` in
the current local source (`app-web/contracts/implicitex_transfer.sol`) but are
**absent from the deployed bytecode dispatch table**:

| Function | Selector | Local source | Deployed bytecode |
|---|---|---|---|
| `calculateFee(uint256)` | `0x99a5d747` | `public view` (line 139) | **ABSENT** — reverts with no data |
| `MAX_FEE()` | `0xbc063e1a` | `uint256 public constant` (line 19) | **ABSENT** — reverts with no data |

Verification method: `eth_getCode` + substring search for each 4-byte selector.

All other expected functions confirmed PRESENT: `transferWithFee`, `previewTransfer`,
`feeBasisPoints`, `MAX_FEE_BPS`, `minTransferAmount`, `transferPrecision`, `usdc`,
`treasury`, `owner`, `pendingOwner`, `paused`, `pause`, `unpause`,
`acceptOwnership`, `renounceOwnership`, `transferOwnership`, `setFeeBasisPoints`,
`setMinTransferAmount`, `setTransferPrecision`, `setTreasury`, `rescueERC20`.

---

## 2. Root Cause

The deployed bytecode reflects an earlier source version where `calculateFee` was
declared `internal` (or `private`) and `MAX_FEE` was not a `public` constant. The local
source was updated to make both `public` after the contract was deployed on 2026-05-22
(tx `0x87593fdb...`). The contract was never redeployed after that change.

---

## 3. Current Impact — NONE on running product

`calculateFee` is called internally by `previewTransfer(address,uint256)` at the EVM
level. External callers do not need to call `calculateFee` directly because
`previewTransfer` exposes fee + totalDebit in one call.

The portal's `ix-execution.js` implements fee math entirely client-side:
- Line 331: `var MAX_FEE = 10_000_000n;` (hardcoded)
- Lines 333–338: JS `calculateFee()` mirrors the contract formula
- Comment (line 329): "Must mirror the calculateFee() function in implicitex_transfer.sol"

Confirmed live via `eth_call`: `previewTransfer(owner_address, 1000000)` returned:
```
fee         = 10000    (0.01 USDC — 1% of 1 USDC ✓)
totalDebit  = 1010000  (1.01 USDC ✓)
balance     = 1000000  (1 USDC held by owner address ✓)
allowance   = 0        (no allowance set — expected at read-only preflight)
canTransfer = false    (false because allowance = 0 — expected ✓)
```

---

## 4. Risks

1. **Source/bytecode divergence**: The local `implicitex_transfer.sol` no longer matches
   the deployed bytecode. Any future security audit that compares source to on-chain
   deployment will see this discrepancy. Must be declared or resolved before a formal audit.

2. **External callers**: Any off-chain integrator, indexer, or script that reads
   `calculateFee` or `MAX_FEE` directly from the contract will silently get a revert.
   The correct path is `previewTransfer(address,uint256)`.

3. **Portal correctness dependency**: The portal's JS fee math must remain in sync
   with the contract formula. There is no on-chain `calculateFee` call to verify
   against at runtime.

---

## 5. Resolution Options (FOLLOW-ON — not authorized in current lane)

**Option A**: Redeploy the contract with `calculateFee` and `MAX_FEE` declared
`public` as in the current source. Requires full redeployment and ownership transfer.

**Option B**: Revert the local source to match deployed bytecode — make
`calculateFee` `internal` and `MAX_FEE` non-public. Update comments accordingly.

**Option C**: Add a note to the source acknowledging the divergence and flagging it
for the next contract iteration (e.g., fee model change or V2).

Resolution requires explicit authorization. Not part of current tranche.

---

## 6. References

- Contract deployment: `docs/operations/evidence/smoke-polygon-mainnet-2026-05-23.md`
- Deployment artifact: `app-web/deployments/polygon.json`
- Contract source: `app-web/contracts/implicitex_transfer.sol`
- Fee constitution: `docs/product/fee-constitution.md`
