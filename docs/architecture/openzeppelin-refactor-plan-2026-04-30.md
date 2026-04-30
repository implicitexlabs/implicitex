# OpenZeppelin Refactor Plan (2026-04-30)

## Scope

Planning-only document for pre-production hardening refactor of `app-web/contracts/implicitex_transfer.sol`.

No Solidity or test changes are made in this step.

## Current Baseline

- Current contract passes 23 local Hardhat tests.
- Current contract is acceptable for local testing and controlled early testnet experimentation.
- Current contract is not yet production-ready per documented security review and hardening delta.

## 1. Ownable vs Ownable2Step

Decision: **Use `Ownable2Step`** for pre-production refactor.

Reason:

- Reduces single-transaction ownership handoff risk.
- Prevents accidental ownership transfer to wrong/uncontrolled address.
- Improves governance safety posture for production operations.

## 2. Pause/Unpause Authority Model (Owner-Only for Now)

Decision: **Keep pause/unpause owner-only in this refactor phase**.

Reason:

- Keeps behavior change surface smaller for first hardening pass.
- Allows focused migration to trusted primitives first.
- Role-splitting (e.g., separate pauser role) can be a follow-on governance change.

Deferred:

- Potential split emergency pause authority model after first OZ migration pass.

## 3. OpenZeppelin `Pausable`

Decision: **Adopt `Pausable`**.

Expected mapping:

- `paused` state and modifiers replaced by OZ pause primitives.
- Existing pause/unpause behavior preserved functionally.

## 4. OpenZeppelin `ReentrancyGuard`

Decision: **Adopt `ReentrancyGuard`**.

Expected mapping:

- Replace custom `entered` lock with OZ `nonReentrant`.
- Preserve external behavior of `transferWithFee` non-reentrancy protection.

## 5. OpenZeppelin `SafeERC20`

Decision: **Adopt `SafeERC20`**.

Expected mapping:

- Replace direct bool-return assumptions on token calls.
- Improve compatibility handling for common non-standard ERC20 implementations.

## 6. Ownership Transfer Semantics and Tests

Decision: **Update ownership transfer semantics and tests to two-step flow**.

Required test updates:

- owner starts ownership transfer to pending owner.
- only pending owner can accept ownership.
- old owner permissions persist until acceptance.
- old owner permissions are removed after acceptance.

## 7. Expected Behavior Changes from Refactor

Expected deliberate behavior changes:

- Ownership transfer moves from one-step to two-step acceptance.

Expected no-change behaviors (must remain equivalent):

- Fee math and max fee cap.
- Treasury/min/precision setters and events.
- Pause gate on transfers.
- Transfer flow semantics (`amount + fee` debit, recipient transfer, treasury fee transfer).

## 8. Test Updates Required After Refactor

Minimum required updates/additions:

- Ownership tests rewritten for `Ownable2Step` lifecycle.
- Re-run and adapt current 23 tests to new revert/event semantics if needed.
- Add tests for pending owner state transitions and cancellation/replacement behavior if supported.
- Add ERC20 compatibility-focused tests for `SafeERC20` behavior where feasible.

## 9. Refactor Risks

- Revert reason / event differences may break existing tests and frontend assumptions.
- Inheritance order and modifier interaction can introduce subtle behavior drift.
- Ownership flow changes can affect operational runbooks if not documented.
- Over-scoping (adding role systems/governance changes at same time) raises regression risk.

## 10. Smallest Safe Refactor Sequence

1. Create dedicated implementation branch for OZ migration.
2. Replace custom owner/pause/reentrancy/erc20 primitives with OZ equivalents only.
3. Keep business logic and fee flow unchanged in first pass.
4. Update and run tests; fix only semantic compatibility issues introduced by primitive migration.
5. Add explicit ownership two-step tests and operational documentation updates.
6. Re-run full suite and security review before any deployment decision.

## Recommendation

Proceed with a narrowly scoped OpenZeppelin primitive migration using `Ownable2Step`, `Pausable`, `ReentrancyGuard`, and `SafeERC20`, while preserving transfer business logic in phase one.

Do not combine this migration with deployment, frontend execution enablement, or governance model expansion in the same change set.
