# Coin Card Signature Policy v1

Status: contract proposal

Purpose: define how signature evidence is allowed to affect Coin Card
verification state. Hashes prove package consistency. Signatures provide trust.
Execution requires trust.

## Core Rule

Hash consistency is evidence. Signature verification is trust. Execution requires
trust.

`unsigned-dev` is a development evidence mode only. It must never enable
`IX_EXECUTION.executeTransfer(...)`.

## Policy Table

| Condition | Result |
| --- | --- |
| Required assets hash correctly + `unsigned-dev` | `ASSET_HASHES_PASSED` |
| Required assets hash correctly + supported valid signature | `VERIFIED` |
| Required assets hash correctly + missing signature | `VERIFICATION_UNAVAILABLE` |
| Required assets hash correctly + unsupported signature mode | `VERIFICATION_UNAVAILABLE` |
| Required assets hash correctly + invalid signature | `INTEGRITY_FAILED` |
| Required asset hash mismatch | `INTEGRITY_FAILED` |
| Asset fetch / browser crypto unavailable | `VERIFICATION_UNAVAILABLE` |

## Required Behavior

- `ASSET_HASHES_PASSED` is not enough to execute transfers.
- `VERIFIED` is the only state that may enable `IX_EXECUTION.executeTransfer(...)`.
- Unsupported signature modes must not be normalized into trust.
- Missing signature evidence is operationally unavailable, not trusted.
- Invalid signature evidence is an integrity failure.

## Expected State Flow

```text
Registry Record
  -> Integrity Manifest load
  -> Required asset hash verification
  -> Signature policy evaluation
  -> Verification state
  -> Runtime gate
```

The browser may prove local asset consistency. It may not elevate that proof to
trusted execution without signature policy.
