# Wallet Production Readiness Audit (2026-04-30)

## Scope

Read-only audit of production readiness for enabling real USDC transfer execution.

Reviewed:

- `app-web/frontend/public/scripts/wallet.js`
- `app-web/frontend/public/index.html`
- `app-web/contracts/implicitex_transfer.sol`
- `docs/product/product-definition.md`
- `docs/architecture/repo-structure.md`
- `docs/decisions/wallet-behavior-audit-2026-04-30.md`

## Required Gates Before Real USDC Execution

- Explicit product gate that keeps real transfers disabled by default.
- Production chain and address configuration for USDC + ImplicitEx contract.
- Contract-backed fee and constraints read by frontend at runtime.
- Approval/allowance flow before transfer execution.
- Full transaction lifecycle UX and error handling.
- Test coverage and testnet signoff.

## Current Solidity Contract Assessment

`ImplicitExTransfer` supports a basic fee-charged relay flow:

- `transferWithFee(recipient, amount)` pulls `amount + fee` from sender (`transferFrom`)
- sends `amount` to recipient
- sends fee to treasury

It also includes owner controls, pause/unpause, fee/min/precision controls, and a reentrancy guard.

## Frontend Execution Path Decision

Frontend should call the ImplicitEx contract for production transfer execution.

Do not use direct USDC transfer execution as the primary transfer path, because that bypasses platform fee routing and treasury accounting.

## Required Approval / Allowance Flow

- Check current USDC allowance for spender = ImplicitEx contract.
- If allowance is insufficient, request `approve(...)` first.
- After successful approval, call `transferWithFee(recipient, amount)`.
- Handle user rejection and allowance race/refresh states.

## Network and Address Mapping Requirements

- Define supported production networks explicitly.
- Map each supported chain to:
  - USDC token address
  - ImplicitEx contract address
- Enforce active chain requirement before execution path is enabled.
- Block execution when mapping is missing or mismatched.

## Fee Calculation Assumptions

- Fee derives from `feeBasisPoints` on `amount`.
- Total debit = `amount + fee`.
- Frontend must read live fee and transfer constraints from contract (not hardcoded values).
- Respect contract precision and minimum transfer requirements.

## Recipient / Amount Validation Requirements

- Strict EVM address validation.
- Reject zero address and invalid format.
- Require positive amount.
- Enforce minimum transfer and precision compatibility before submit.
- Ensure expected total debit does not exceed available balance.

## Required Error States

- Wallet missing / disconnected.
- Wrong chain.
- Approval rejected / failed.
- Transfer rejected / failed.
- Insufficient allowance.
- Insufficient balance.
- Contract paused.
- Invalid min/precision input.
- Gas estimation / fee data failures.
- Unknown/replaced transaction lifecycle events.

## Security Risks Before Production

- Current frontend flow is still demo-first and non-executing.
- Production address binding and chain config gates are not yet implemented.
- Transaction confirmation UX is not yet wired to real receipts/events.
- Operational controls (incident response, pause authority handling) are not yet codified in release checklist.

## Minimum Test Suite

Contract tests:

- `transferWithFee` happy path
- fee math and treasury routing
- min/precision constraints
- owner-only controls
- pause/unpause behavior
- revert/failure paths

Integration tests:

- approval + transfer flow
- insufficient allowance/balance
- chain/address mismatch handling

Frontend behavior tests:

- wallet connect + chain gating
- approval prompt flow
- transfer lifecycle states
- deterministic error surfacing

## Smallest Safe Implementation Sequence

1. Publish production transfer gate checklist (disabled by default).
2. Add chain/address configuration scaffolding.
3. Add read-only on-chain reads for fee/min/precision/allowance.
4. Implement approval + contract transfer path behind feature flag.
5. Implement real transaction lifecycle states.
6. Complete tests and testnet signoff.
7. Enable production transfers only after all gates are complete.
