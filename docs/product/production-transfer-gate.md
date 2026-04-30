# Production Transfer Gate Checklist

Real transfers are disabled until every gate in this checklist is complete.

## Current Default Status

- [ ] Production transfer execution is **disabled**.
- [ ] Demo/non-executing flow messaging is active in runtime UI.

## 1. Product Scope Gate

- [ ] Product owner signoff that release scope includes real transfer execution.
- [ ] User-facing copy clearly distinguishes demo vs production behavior.
- [ ] Terms language reviewed for live funds movement.

## 2. Contract Deployment Gate

- [ ] `ImplicitExTransfer` deployed for target production network(s).
- [ ] Deployment artifacts and verification records stored in canonical docs.
- [ ] Ownership and treasury control plan documented.
- [ ] Pause/unpause operational policy documented.

## 3. Chain/Address Config Gate

- [ ] Supported production chain list finalized.
- [ ] Per-chain USDC token address mapped in config.
- [ ] Per-chain ImplicitEx contract address mapped in config.
- [ ] Runtime rejects execution if chain/address config is missing or mismatched.

## 4. Allowance/Approval Gate

- [ ] Runtime checks USDC allowance for ImplicitEx contract spender.
- [ ] Approval flow is implemented for insufficient allowance.
- [ ] Clear UI handling for approval success, rejection, and failure.
- [ ] Allowance re-check occurs before transfer submission.

## 5. Fee Calculation Gate

- [ ] Frontend reads fee settings from contract, not hardcoded values.
- [ ] Frontend reads min transfer and precision constraints from contract.
- [ ] UI preview and contract execution use identical fee math assumptions.
- [ ] Rounding/precision behavior documented and tested.

## 6. Recipient and Amount Validation Gate

- [ ] Strict recipient address validation implemented.
- [ ] Zero address blocked.
- [ ] Positive amount required.
- [ ] Contract min transfer and precision constraints enforced client-side pre-submit.
- [ ] Balance sufficiency checks include amount + fee.

## 7. Transaction Lifecycle Gate

- [ ] Real transfer path calls ImplicitEx contract (not direct USDC transfer path).
- [ ] UI states cover: pending signature, pending confirmation, confirmed, failed.
- [ ] Final confirmation copy reflects real on-chain status only.
- [ ] Explorer link/receipt metadata shown for confirmed transactions.

## 8. Error Handling Gate

- [ ] Wallet missing/disconnected handling complete.
- [ ] Wrong chain handling complete.
- [ ] Approval rejected/failed handling complete.
- [ ] Transfer rejected/failed handling complete.
- [ ] Contract paused and revert reason handling complete.
- [ ] Gas estimation and fee-data failure handling complete.

## 9. Security/Ops Gate

- [ ] Least-privilege owner/treasury key handling documented.
- [ ] Emergency pause runbook exists and tested.
- [ ] Incident response contact/escalation path documented.
- [ ] Pre-release review confirms no hardcoded secrets or sensitive config.

## 10. Testnet Signoff Gate

- [ ] End-to-end flow validated on target testnet(s).
- [ ] Approval + transfer + fee routing validated on testnet.
- [ ] Negative-path tests validated (rejections/reverts/wrong chain).
- [ ] Product and engineering signoff recorded.

## 11. Production Enablement Gate

- [ ] Checklist reviewed and marked complete by engineering lead.
- [ ] Checklist reviewed and marked complete by product owner.
- [ ] Feature flag (or equivalent release toggle) enabled intentionally.
- [ ] Release notes include transfer enablement scope and rollback plan.

## Release Rule

If any item remains incomplete, production transfer execution stays disabled.
