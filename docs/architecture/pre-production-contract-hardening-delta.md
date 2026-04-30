# Pre-Production Contract Hardening Delta

## 1. Current Contract Status

Current `ImplicitExTransfer` contract is suitable for local development and controlled testnet experimentation.

Current posture is not yet production-ready.

Key factors:

- Security-critical paths are covered by 23 passing local tests.
- Core fee-routing flow works in happy and selected failure paths.
- Security primitives are currently custom/minimal rather than standardized.

## 2. Required OpenZeppelin Migration Decision

Before production deployment, an explicit decision is required:

- Path A: migrate to OpenZeppelin security primitives.
- Path B: retain custom primitives with strong justification and external audit.

Default recommendation: Path A.

## 3. SafeERC20 Migration Requirement

Production path should adopt `SafeERC20` for token interaction safety and broader ERC20 compatibility handling.

Scope:

- replace raw `transferFrom`/`transfer` require-bool assumptions with safe wrappers
- validate behavior with non-standard token mock scenarios in tests

## 4. Ownable vs Ownable2Step Decision

Production governance should explicitly select ownership transfer model:

- `Ownable`: simple, lower complexity
- `Ownable2Step`: safer control handoff with acceptance step

Recommendation: `Ownable2Step` for production to reduce accidental or malicious ownership handoff risk.

## 5. Pausable/ReentrancyGuard Replacement Decision

Production path should explicitly choose standardized guards:

- `Pausable` for emergency stop semantics
- `ReentrancyGuard` for non-reentrant transfer execution

Decision outcome should include migration plan and regression tests.

## 6. Ownership and Treasury Key Policy

Required before production:

- owner key policy (multisig recommended)
- treasury key policy (multisig recommended)
- key rotation and incident escalation process
- documented authority boundaries for config changes and pause control

## 7. Fee-Change Governance Policy

Required before production:

- fee change review/approval workflow
- communication policy for fee updates
- optional delay/timelock policy for fee changes
- explicit cap policy beyond on-chain max if needed

## 8. Additional Required Tests

Minimum additions before production signoff:

- ownership transfer edge cases and full role transition coverage
- adversarial reentrancy tests using malicious callback-capable token
- broader ERC20 compatibility/failure-mode tests
- expanded negative tests for all owner-only methods
- targeted invariant/property tests (fee math, state transitions, pause behavior)

## 9. Frontend Helper/View Function Candidates

Potential contract helper functions to reduce frontend ambiguity:

- quote helper for `amount -> fee + totalDebit`
- aggregated config getter for `fee/minTransfer/precision/paused/treasury`

These are optional but recommended for safer client integration and clearer UX.

## 10. Production-Blocking Open Questions

- Are OpenZeppelin primitives mandatory for production, or will custom primitives be externally audited and accepted?
- Will ownership transfer use one-step or two-step model?
- What is the final owner/treasury control model in operations?
- What governance process is required for fee changes?
- What ERC20 compatibility envelope is officially supported at launch?

## 11. Recommendation

Keep current contract for local/testing and controlled testnet usage only.

Do not enable production transfer execution until this hardening delta is resolved, implemented, and validated with updated tests and operational signoff.
