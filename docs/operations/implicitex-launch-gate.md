# ImplicitEx Launch Gate

## Purpose

This document defines the staged go/no-go process for moving ImplicitEx from a
public demo shell to Amoy testnet wiring and, later, production readiness.

No stage authorizes the next stage automatically. Each stage needs explicit
evidence and a clean working tree before proceeding.

## Forbidden In This Documentation Lane

This document does not authorize:

- Amoy deployment
- `chains.js` edits
- Browser approval flow
- Browser `transferWithFee` calls
- `transfersEnabled: true`
- Mainnet deployment

## Stage 1: Demo Shell Gate

The demo shell gate passes when:

- Public shell truthfully states current mode.
- Live transfers are visibly disabled.
- 1% flat fee language is consistent.
- About, Terms, Privacy, Legal, News, and Contact destinations resolve.
- `robots.txt` exists.
- `sitemap.xml` exists.
- Same-domain social preview assets resolve.
- Static public target check passes.

Evidence:

```bash
cd app-web
npm run check:static
```

## Stage 2: Amoy Deployment Gate

Amoy deployment may begin only when:

- `git status` is clean.
- Latest intended source commits are present.
- `npm test` passes.
- `npx hardhat compile` passes.
- `npx hardhat run scripts/local_predeploy_check.js` passes.
- Testnet deploy wallet exists and is funded with Amoy MATIC.
- Testnet treasury address is selected.
- Treasury address is not the deployer address, unless an explicit written
  exception is recorded.
- Testnet USDC address is confirmed from a trusted source.
- Required `.env` values are present locally and are not committed.

Evidence:

- Terminal output from predeploy checks.
- Deployment parameter record with secrets redacted.
- Written deployer/treasury role confirmation.

## Stage 3: Testnet Transaction Smoke Gate

Testnet transaction wiring may be called ready only when a real Amoy flow proves:

- Wallet connects.
- Correct network is detected.
- Unsupported network is rejected.
- Contract address is read from config.
- USDC address is read from config.
- Fee/min/precision are read from contract.
- USDC balance is read.
- Allowance is read.
- Approval executes when allowance is insufficient.
- `transferWithFee(recipient, amount)` executes.
- Recipient receives expected USDC amount.
- Treasury receives expected fee.
- Explorer receipt is shown or recorded.

Evidence:

- Date of test.
- Chain/network.
- Contract address.
- USDC token address.
- Sender, recipient, and treasury role labels.
- Transaction hash.
- Explorer link.
- Observed recipient amount.
- Observed treasury fee.

## Stage 4: Negative-Path Smoke Gate

Negative-path signoff requires evidence for:

- Wallet missing or disconnected.
- Wrong network.
- Unsupported network.
- Missing or malformed config.
- Invalid recipient.
- Zero address recipient.
- Amount below minimum.
- Invalid precision.
- Insufficient balance.
- Approval rejected.
- Transfer rejected.
- Contract paused.
- Gas estimate failure or graceful fallback.

Each case must show that the UI blocks or explains the failure without silent
success messaging.

## Stage 5: Production Readiness Gate

Production readiness is blocked until:

- Site discovery contract passes.
- Transaction execution contract passes on testnet.
- Legal, privacy, and terms pages have been reviewed for production use.
- Support/contact path is visible.
- Treasury policy is documented.
- Owner key policy is documented.
- Emergency pause runbook exists.
- Pause/unpause procedure has been tested.
- Contract verification policy is documented.
- Rollback/disable plan is documented.

## Stage 6: Mainnet Deployment Gate

Mainnet deployment may begin only when:

- Production readiness gate is complete.
- Mainnet deploy parameters are reviewed.
- Mainnet USDC address is verified from a trusted source.
- Deployer and treasury roles are confirmed.
- Treasury does not equal deployer unless explicitly approved in writing.
- Owner/multisig policy is approved.
- `npm test`, compile, local predeploy, and static checks pass immediately
  before deploy.

Mainnet deploy does not automatically enable live browser transfers.

## Stage 7: Live Transfer Enablement Gate

Live transfer enablement requires:

- Mainnet contract deployed.
- Contract source verified.
- On-chain owner, treasury, fee, min transfer, precision, and paused state
  verified.
- Production chain config reviewed.
- Small-value live smoke transfer completed.
- Explorer receipt recorded.
- Rollback/pause contact available.
- Product owner signoff.
- Engineering signoff.

Only after this gate may `transfersEnabled` be set true for production.

## Production Hard Stops

Stop and do not proceed if any of the following are true:

- `transfersEnabled` is true before written signoff.
- Legal, privacy, or terms pages are missing.
- Support/contact path is missing.
- Contract is not verified before production enablement.
- Treasury equals deployer without an explicit written reason.
- No pause runbook exists.
- Pause has not been tested.
- No testnet transaction evidence exists.
- No negative-path testnet evidence exists.
- Frontend production path bypasses `transferWithFee`.
- Any uncertainty exists about which wallet, key, chain, token, or contract is
  being used.
