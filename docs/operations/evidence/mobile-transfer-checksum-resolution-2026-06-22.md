# Mobile Transfer Checksum Resolution

**Date:** 2026-06-22
**Branch:** gate3-production-frontend-qa
**Commit:** 0a85417
**Status:** PASS

---

## Initial Symptom

MetaMask Mobile appeared to fail immediately after transfer review with no confirmation prompt and no error explanation.

Observed behavior:
- Review screen completed successfully
- No MetaMask transfer confirmation appeared
- UI reported: Transfer could not continue / UNKNOWN_ERROR
- No funds moved

Behavior persisted across multiple clearing sessions (cookies, browser data, history).

---

## Investigation Summary

### Finding 1: Production Domain Serving Stale Build

All diagnostic patches were deployed to `implicitex-236f2.web.app` (default Firebase project).

`implicitex.com` was served by a separate production project (`implicitex`) that had not been updated since 2026-06-19.

Verification:

```bash
curl https://implicitex.com/js/wallet.js | grep IX_DEBUG_BUILD
# (no output — stale build confirmed)

curl https://implicitex-236f2.web.app/js/wallet.js | grep IX_DEBUG_BUILD
# window.IX_DEBUG_BUILD = 'mobile-transfer-debug-2026-06-22-1408';
```

Correct deploy command:

```bash
firebase deploy --only hosting --project production
```

All subsequent testing used the correct target.

### Finding 2: Root Cause — Invalid EIP-55 Checksum

Once diagnostics were live on the correct domain, the QA overlay exposed the actual error:

```
TypeError: bad address checksum
code: INVALID_ARGUMENT
value: "0xe0B02A6D9738aa36eE48004211E264b7a815796B"
```

The recipient address had valid hex format and length, but its mixed-case capitalization did not match the EIP-55 checksum. ethers.js v6 throws on this before constructing the transaction — before MetaMask is ever reached.

The existing `validateRecipient()` checked format only (regex). It passed the address. The execution pipeline later rejected it.

---

## Fixes Applied

### Validation (`validateRecipient`)

Added `ethers.getAddress(v)` call after format checks. Any address that fails EIP-55 checksum now returns a validation error before the review screen is reached.

### Normalization (`normalizeAddress`)

Changed catch block from `return v` to `return null`. Invalid checksum addresses no longer propagate into recipient book lookups, context loading, or transfer execution.

### Recovery UX

When a checksum error is detected on the recipient field:

- Field border receives error state (red)
- Explanatory message displayed at `--size-xs` with `--warn` color:

  > Invalid checksum. This address uses mixed uppercase and lowercase letters with an invalid capitalization pattern. Most wallet addresses can be safely entered in lowercase.

- Recovery action displayed in `--accent` color:

  > Use lowercase address

  Tapping converts the field value to lowercase and re-triggers validation. No manual editing required.

### Scope Fix

`txBroadcast`, `broadcastHash`, and `diagnosticHold` were declared inside the outer `try` block, making them inaccessible to the `finally` block (`let` declarations in a `try {}` are not accessible in `finally {}`). Hoisted above the outer `try` alongside `receiptId` and `transferConfirmed`.

### Diagnostic Infrastructure Retained

- `staticCall` and `estimateGas` catch blocks now call `renderPreBroadcastDiag` and set `diagnosticHold = true` (same as `transferWithFee` catch)
- `serializeWalletError` widened to use `Object.getOwnPropertyNames` and string coercions, catching non-enumerable error fields

---

## Live Transfer Verification

After deploying checksum validation to production:

Test transfer on Polygon mainnet completed successfully.

| Item | Result |
|---|---|
| Network | Polygon mainnet |
| Device | iPhone 12, MetaMask in-app browser |
| Recipient | Valid lowercase address |
| Amount | 1.00 USDC |
| MetaMask prompt | Appeared |
| Broadcast | Confirmed |
| Recipient received | 1.00 USDC |
| Treasury received | 0.01 USDC (1% fee) |
| Explorer | Polygonscan confirmed |

---

## Before / After

**Before:**
```
Address entered (mixed-case, invalid checksum)
→ Passes regex validation
→ Review screen reached
→ Transfer execution begins
→ ethers.getAddress() throws INVALID_ARGUMENT
→ UNKNOWN_ERROR
→ User sees dead end
```

**After:**
```
Address entered (mixed-case, invalid checksum)
→ ethers.getAddress() called in validateRecipient()
→ Checksum error surfaced inline
→ User taps "Use lowercase address"
→ Field normalized, validation passes
→ Review screen reached
→ Transfer executes successfully
```

---

## Conclusion

The apparent MetaMask Mobile execution failure was not a wallet issue, provider issue, contract issue, or gas issue.

Root cause: invalid EIP-55 checksum on recipient address, rejected by ethers.js before reaching the wallet.

Secondary finding: production domain was not receiving deploys due to a two-project Firebase configuration. Corrected by targeting `--project production` explicitly.

Investigation closed. Result: PASS.
