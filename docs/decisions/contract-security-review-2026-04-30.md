# ImplicitEx Contract Security Review (2026-04-30)

## Scope

Read-only security review of current contract/test posture.

Reviewed:

- `app-web/contracts/implicitex_transfer.sol`
- `app-web/tests/contracts/implicitex_transfer.test.js`
- `app-web/contracts/test/MockERC20.sol`
- `docs/architecture/contract-test-plan-2026-04-30.md`
- `docs/product/production-transfer-gate.md`
- `docs/decisions/wallet-production-readiness-audit-2026-04-30.md`

## What Current 23 Tests Prove

- Constructor guards and initial state are enforced.
- Owner-gated treasury/fee/min/precision controls are working in tested paths.
- Fee cap guard (`MAX_FEE_BPS`) is enforced.
- Pause/unpause guards are working in tested paths.
- `transferWithFee` happy path is correct for debit and fee routing.
- Zero-fee and floor-rounding behavior are validated.
- Min amount / precision / zero-recipient / paused guards are enforced.
- Token failure branches for `transferFrom`, recipient transfer, and fee transfer are covered.
- Key event emissions are validated in exercised paths.

## What Current Tests Do Not Prove

- Full ownership transfer lifecycle and role rotation edge cases.
- Adversarial reentrancy behavior with callback-capable malicious token.
- Broad ERC20 compatibility across non-standard token behaviors.
- Full non-owner negative coverage for every owner-only setter.
- Fuzz/property invariants over amount/fee/state transitions.
- Operational incident paths beyond local unit-level assertions.

## Custom Owner/Pause/Reentrancy Risks

- Current custom implementations are simple and test-covered for core paths.
- Risk remains in long-term assurance and auditability versus standardized libraries.
- Manual guard logic increases bespoke security surface over time.

## OpenZeppelin Recommendation

Before production deployment, migrate security primitives to OpenZeppelin equivalents (or justify and externally audit custom implementations):

- `Ownable` / `Ownable2Step`
- `Pausable`
- `ReentrancyGuard`
- `SafeERC20`

## ERC20 Compatibility Risks

- Contract currently assumes straightforward bool-returning ERC20 semantics.
- Non-standard tokens and edge-case behaviors can break assumptions.
- `SafeERC20` reduces risk around token call compatibility and revert handling.

## Treasury / Key-Management Risks

- Owner can unilaterally update treasury.
- Compromised owner key can reroute fee flow.
- Operational controls (multisig, key policy, monitoring) are required before production.

## Fee Governance Risks

- Fee cap exists, but owner can change fee rapidly within cap.
- Governance policy for fee changes is currently out-of-contract.
- Production launch should define delay/review policy for fee changes.

## Ownership Transfer Risks

- Single-step ownership transfer can permanently hand control to wrong address if misconfigured.
- Two-step ownership acceptance pattern is safer for production governance.

## Pause/Unpause Operational Risks

- Pause mechanism exists and works in tested paths.
- Operational risk remains around who can pause, when, and how incidents are handled.
- Production runbook and authority policy are required.

## Missing Frontend/Helper View Functions

Potential safety/UX helpers not currently present:

- Fee quote helper for `amount -> fee + totalDebit`.
- Combined config view helper (`fee`, `minTransfer`, `precision`, `paused`, `treasury`).

These are not mandatory for correctness but reduce client-side ambiguity and integration mistakes.

## Current Readiness Level

- Local development/testing: acceptable.
- Controlled early testnet experiments: acceptable with caution and explicit non-production posture.
- Production: not acceptable yet.

## Recommended Smallest Next Action

Define and approve a pre-production hardening delta (security primitives, governance policy, additional tests) before any production deployment or frontend live-transfer enablement.
