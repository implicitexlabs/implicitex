# ImplicitEx Contract Test Plan (2026-04-30)

## Scope

Test plan for `app-web/contracts/implicitex_transfer.sol` before enabling real transfer execution.

This plan is intentionally docs-first and does not include deployment or runtime configuration values.

## Test Framework Target

- Hardhat test suite with deterministic fixtures.
- Mock ERC20 token contract for controlled success/failure paths.
- Separate fixtures for standard token behavior and adversarial behavior.

## 1. Constructor Validation

Cover:

- Reject zero USDC address (`USDC_ZERO_ADDRESS`).
- Reject zero treasury address (`TREASURY_ZERO_ADDRESS`).
- Reject fee basis points above `MAX_FEE_BPS` (`FEE_TOO_HIGH`).
- Reject zero precision (`PRECISION_ZERO`).
- Successful constructor state initialization:
  - `owner`
  - `treasury`
  - `feeBasisPoints`
  - `minTransferAmount`
  - `transferPrecision`
- `OwnershipTransferred(address(0), owner)` event emission.

## 2. Ownership Behavior

Cover:

- `onlyOwner` enforcement on all owner-only methods.
- `transferOwnership` success path.
- `transferOwnership` rejects zero owner (`OWNER_ZERO_ADDRESS`).
- Previous owner loses privileged access after ownership transfer.

## 3. Treasury Update Behavior

Cover:

- `setTreasury` success path by owner.
- `setTreasury` rejects zero address (`TREASURY_ZERO_ADDRESS`).
- Non-owner revert (`OWNER_ONLY`).
- `TreasuryUpdated(previous, next)` event payload correctness.

## 4. Fee Basis Point Update Behavior

Cover:

- Owner can set valid fee in range `[0, MAX_FEE_BPS]`.
- Reject values above `MAX_FEE_BPS` (`FEE_TOO_HIGH`).
- Non-owner revert (`OWNER_ONLY`).
- `FeeUpdated(previous, next)` correctness.

## 5. Min Transfer Amount Behavior

Cover:

- Owner can update min transfer amount.
- Non-owner revert (`OWNER_ONLY`).
- `MinTransferUpdated(previous, next)` correctness.
- Runtime enforcement in `transferWithFee` when amount is below min (`AMOUNT_BELOW_MINIMUM`).

## 6. Transfer Precision Behavior

Cover:

- Owner can update precision to non-zero values.
- Reject zero precision (`PRECISION_ZERO`).
- Non-owner revert (`OWNER_ONLY`).
- `PrecisionUpdated(previous, next)` correctness.
- Runtime precision enforcement on `transferWithFee` (`INVALID_TRANSFER_PRECISION`).

## 7. Pause/Unpause Behavior

Cover:

- Owner can pause and unpause.
- Non-owner revert (`OWNER_ONLY`) for both methods.
- Reject double pause (`ALREADY_PAUSED`).
- Reject unpause when not paused (`NOT_PAUSED`).
- `transferWithFee` reverts while paused (`PAUSED`).
- `Paused` and `Unpaused` event payload correctness.

## 8. Successful `transferWithFee` Path

Cover:

- Valid recipient, amount, allowance, and sender balance.
- Contract pulls `amount + fee` from sender.
- Recipient receives `amount`.
- Treasury receives `fee`.
- Contract retains zero residual when transfers succeed.
- `TransferExecuted` event values:
  - `sender`
  - `recipient`
  - `amountSent`
  - `feeAmount`
  - `totalDebited`

## 9. Zero-Fee Transfer Path

Cover:

- Set fee basis points to zero.
- `transferWithFee` debits exactly `amount`.
- Recipient receives `amount`.
- No fee transfer call dependency.
- Event reports `feeAmount == 0` and `totalDebited == amount`.

## 10. Fee Math and Rounding

Cover:

- Basis-point math for representative amounts.
- Integer division rounding-down behavior is explicitly asserted.
- `totalDebited == amount + fee` invariant holds.
- Boundary checks near min amount and precision constraints.

## 11. Insufficient Allowance

Cover:

- Sender allowance below `totalDebited` should cause `TRANSFER_FROM_FAILED` (via token returning false or revert behavior harness).
- Assert no recipient/treasury balance changes on failure.

## 12. Insufficient Balance

Cover:

- Sender balance below `totalDebited` path fails safely.
- Assert no partial transfer side effects when failure occurs.
- Expected revert surface depends on mock token behavior (false return vs revert).

## 13. Recipient Zero Address

Cover:

- `transferWithFee(address(0), amount)` reverts with `RECIPIENT_ZERO_ADDRESS`.

## 14. Reentrancy Protection

Cover:

- Use malicious/mock token behavior to attempt callback re-entry into `transferWithFee`.
- Assert revert with `REENTRANCY`.
- Assert state consistency after blocked reentry.

## 15. Token Transfer Failure Cases

Cover targeted failure branches:

- `transferFrom` returns false -> `TRANSFER_FROM_FAILED`.
- recipient `transfer` returns false -> `RECIPIENT_TRANSFER_FAILED`.
- treasury fee transfer returns false (when fee > 0) -> `FEE_TRANSFER_FAILED`.

Also assert atomic behavior expectations per EVM revert semantics.

## 16. Event Emission Checks

Validate exact event emissions and arguments for:

- `TransferExecuted`
- `TreasuryUpdated`
- `FeeUpdated`
- `MinTransferUpdated`
- `PrecisionUpdated`
- `OwnershipTransferred`
- `Paused`
- `Unpaused`

Include indexed argument checks where applicable.

## 17. Fuzz / Property-Style Tests (Later)

Recommended follow-up:

- Fuzz `amount` under precision/min constraints to assert invariant:
  - success implies `totalDebited == amount + floor(amount * feeBps / 10000)`.
- Fuzz fee basis points across valid range.
- Fuzz state transitions around pause/unpause + ownership changes.
- Property check that non-owner never mutates owner-gated config.

## 18. Minimum Hardhat Fixture / Mock Token Setup

Minimum test scaffolding:

- Standard mock ERC20 with configurable balances/allowances.
- Failure-mode mock ERC20 with toggles for:
  - failing `transferFrom`
  - failing recipient `transfer`
  - failing treasury `transfer`
- Optional malicious mock for reentrancy simulation.

Baseline fixtures:

- `deployBaseFixture`:
  - deploy mock token
  - mint sender balance
  - deploy `ImplicitExTransfer` with controlled initial params
  - pre-approve spender for happy path
- `deployPausedFixture`
- `deployZeroFeeFixture`
- `deployPrecisionFixture`

## Execution Order Recommendation

1. Constructor + owner-gated control tests.
2. Pause/unpause and config mutation tests.
3. Happy path and zero-fee transfer tests.
4. Failure branch tests (allowance/balance/token failures).
5. Reentrancy and adversarial mocks.
6. Event correctness and invariant checks.
7. Fuzz/property suite (extended stage).

## Exit Criteria Before Frontend Execution Work

Contract is considered test-ready for production-gated integration only when:

- All deterministic unit/integration tests pass.
- Failure branches and events are covered.
- Reentrancy test coverage is in place.
- Fee math and precision constraints are validated.
