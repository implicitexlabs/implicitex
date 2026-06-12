# ImplicitEx Launch Gate

## Current Status — 2026-06-11

```
Launch status: PRE-BROWSER-QA
Recorded: 2026-06-11 (updated from 2026-05-29)

COMPLETED:
  ✅ Contract deployed: 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
  ✅ Safe ownership accepted: owner = 0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97
  ✅ pendingOwner = 0x0000000000000000000000000000000000000000
  ✅ Source verified on Polygonscan
  ✅ On-chain state verified 2026-05-23 (owner/pendingOwner/treasury/fee/paused PASS)
  ✅ Frontend instrument polish merged to main (587aa93)
  ✅ All checks passing: 59/59 contract tests, 31/31 observability, syntax, static
  ✅ chains.js points to canonical contract, transfersEnabled: false
  ✅ deployments/polygon.json reflects canonical deployment evidence
  ✅ Deployer key hygiene: 0xf614356 (exposed 2026-05-13) not used; 0x5466 used instead
  ✅ Receipt lifecycle bug FIXED (2026-05-26) — rehydrate.js clears READY/AUTHORIZING
     silently; AUTHORIZED/SUBMITTING still surface correctly; corrupt active receipt
     state now notifies subscribers when cleared
  ✅ Standby/provider-event refactor complete — TRANSFERS_DISABLED is standby not error;
     isConfiguredChain ≠ isLiveTransferChain; amber ≠ red
  ✅ Firebase JS cache headers updated — stale wallet.js and receipt-store.js should
     not survive deploys
  ✅ Negative-path evidence (partial) — branch: gate3-negative-path-proof (cde21e7)
     FP1 PASS: approval rejection (2026-06-01)
     FP2 PASS: transfer rejection (2026-06-01)
     FP3 PASS: wallet busy / -32002 (2026-06-11)
       — acknowledgement cleared, form preserved, no phantom receipt
       — recovery loop verified: cancel → re-acknowledge → re-enable, no reload required
       — watch item: refresh/reconnect required after FP3 before subsequent tests
     FP6 VERIFIED: RPC failure — code review + safe offline attempt (2026-06-11)
       — four pre-flight guards confirmed, fundsMoved conservative, no bugs found
     FP4 PENDING: insufficient balance
     FP5 PENDING: wrong network mid-flow

REMAINING BLOCKERS (3):
  1. Real-browser MetaMask state regression smoke — MUST VERIFY before public exposure
     The state taxonomy is defined and the standby/provider-event refactor is complete.
     Required browser evidence:
     - MetaMask desktop connect; Polygon standby calm while transfers are disabled
     - Ethereum mainnet → Polygon recovery; no stale "Switch to Polygon" on Polygon
     - Disconnect → reconnect; no stale sender display
     - Refresh with wallet permission already granted
     - Account switch updates sender cleanly
     - No duplicated wallet/provider events after reconnect
     - Rejected approval and rejected transfer signature show human-readable copy
     - Receipt survives refresh/reconnect without READY/AUTHORIZING ghosts

  2. Manual production-frontend QA — MUST VERIFY before public exposure
     - Desktop MetaMask full flow (connect, approve, transfer, reject, refresh recovery)
     - Mobile MetaMask browser full flow
     - iPhone Safari visual/layout pass
     - Low-resolution laptop viewport: fee, receipt, operational text readable
     - Recipient copy/paste, keyboard overlay on mobile
     - Wrong-network recovery; receipt visibility after reconnect
     Note: MetaMask mobile browser is MVP QA. WalletConnect/Reown is not.

  3. Attorney review before public promotion
     Required before enabling or publicly promoting live transfers.
     Max transfer cap stays at 250 USDC until written checklist passes.
     Jurisdiction copy remains platform policy, not a legal authorization claim.
     Terms/Privacy/Legal/Jurisdictions remain draft until reviewed.

State classification (2026-06-11):
  Contract logic:          FROZEN (59/59 tests)
  Deployment:              COMPLETE — canonical contract on Polygon mainnet
  Ownership:               COMPLETE — Safe owns, pendingOwner zeroed
  Source verification:     COMPLETE — Polygonscan verified
  Controlled smoke:        COMPLETE — 2026-05-23, tx 0xf4359437..., all deltas verified
  Git history:             CLEAN
  Secret hygiene:          CLEAN
  Frontend UX:             COMPLETE — execution instrument polished and smoke-verified
  Receipt lifecycle:       FIXED (2026-05-26) — awaiting real-browser confirmation
  Standby/provider events: COMPLETE — refactor merged; amber/red routing corrected
  Negative-path evidence:  PARTIAL — FP1/FP2/FP3 PASS, FP6 VERIFIED; FP4/FP5 PENDING
  Domain cutover:          BLOCKED until browser QA complete
  Attorney review:         PENDING — required before public promotion
  transfersEnabled:        false — gate closed after smoke

.env hygiene rule:
  Never let an agent or tool read or print .env contents.
  Automated analysis must not be directed at .env files or secret-bearing paths.
  Build/deploy/test commands may load environment variables internally, but
  command output must not display secret values.

USDC rescue policy:
  Configured USDC cannot be rescued by the owner. Any USDC sent directly to the
  contract outside transferWithFee may be permanently unrecoverable.

USDC dependency risk:
  If USDC behavior changes unexpectedly (pause, blacklist, implementation change),
  pause ImplicitEx transfers and review before resuming.

Treasury receive risk:
  If treasury cannot receive USDC, the fee leg fails and the whole transfer
  reverts. Response: pause, fix treasury, verify with controlled smoke, resume.
```

## Purpose

This document defines the staged go/no-go process for moving ImplicitEx from a
public demo shell to Amoy testnet wiring and, later, production readiness.

No stage authorizes the next stage automatically. Each stage needs explicit
evidence and a clean working tree before proceeding.

Strategic decision context:

```text
docs/operations/strategic-decision-framework-2026-05-04.md
```

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
