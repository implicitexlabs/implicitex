# ImplicitEx Launch Gate

## Current Status — 2026-05-21

```
Launch status: BLOCKED
Recorded: 2026-05-21

Contract logic: RE-FROZEN
  A controlled hardening patch has been applied: custom-error modernization
  plus constructor treasury validation fix. No routing, fee-cap, preview,
  ownership, or pause behavior changed. Owner rescue authority was narrowed:
  configured USDC can no longer be rescued.
  Verification: npm test 59/59 passing; npx hardhat compile passed;
  node scripts/local_predeploy_check.js passed.

Contract-level items closed (2026-05-20):
  - setMinTransferAmount(0) now blocked (MIN_TRANSFER_ZERO)
  - setTreasury(address(usdc)) now blocked (TREASURY_IS_USDC)
  - Both cases covered by new tests
  - transferOwnership auto-initiated by deploy script (confirmed existing)
  - Manifest records pendingOwner and ownershipTransferTxHash (confirmed existing)
  - Mainnet deployer-as-owner blocked by deploy script (network === "polygon" guard)

Remaining primary blockers:
  1. Deployer private key — rotation required
     The deployer private key was read by an automated analysis agent during a
     security review session (2026-05-13). The key was never committed to git
     and does not appear in any tracked source file, but the exposure via agent
     session is sufficient to require rotation before any further deployment
     operations. Treat the key as compromised for operational purposes.
     Derived deployer address: 0xf614356F93408460b594AdDAcC86a7fC94310f1D

  2. Safe/multisig must call acceptOwnership() post-deploy
     The deploy script automatically calls transferOwnership(ownerAddress) and
     waits for confirmation. Ownership is NOT complete until the Safe/multisig
     calls acceptOwnership(). Post-acceptance verified state must be recorded:
       owner: Safe/multisig address
       pendingOwner: 0x0000000000000000000000000000000000000000

Actions frozen until blockers are resolved:
  - Domain cutover (implicitex.com)
  - Production transfer enablement (transfersEnabled: true)
  - Additional smoke tests using the current deployer key
  - Any mainnet operation using 0xf614356F93408460b594AdDAcC86a7fC94310f1D

What is NOT blocked:
  - Frontend development and staging
  - Documentation and governance work
  - Local tests and contract test suite

Amoy status (revised 2026-05-13):
  Amoy testnet is OPTIONAL, not mandatory.
  The owner has already verified the MetaMask approval → transferWithFee →
  receipt lifecycle with real funds between wallets they control on Polygon
  mainnet. Chasing Amoy faucet drips adds no functional insight and wastes
  days. Do not pursue Amoy unless testnet tokens are immediately available.

Execution order:
  1. Create or identify a clean deployer wallet (any wallet whose key was
     not read, pasted, committed, or inspected by a tool)
  2. Redeploy a fresh mainnet contract with the clean deployer as owner
     (Option A — preferred). No production traffic exists; the exposed-owner
     story ends cleanly with a fresh deploy.
  3. Put only the clean key into app-web/.env locally — never let an
     agent or tool read or print .env contents
  4. Run: npm test, npx hardhat compile,
          npx hardhat run scripts/local_predeploy_check.js
  5. Deploy: npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon
     Confirm output shows: network: polygon, chainId: 137
  6. Have the Safe/multisig call acceptOwnership()
  7. Record final on-chain state: owner = Safe, pendingOwner = 0x000...
  8. Update chains.js with new contract address
  9. Run one controlled real USDC transfer (wallets you own; only cost is gas)
  10. Record sender/recipient/treasury balances, tx hash, explorer confirmation
  11. Fill domain-cutover-readiness artifact
  12. Decide go/no-go

State classification (2026-05-21):
  Contract logic:          RE-FROZEN after verified patch (59/59 tests passing)
  Deploy script:           PASS (ownership transfer automated)
  Git history:             CLEAN
  Local secret hygiene:    NEEDS ROTATION (session-only exposure 2026-05-13)
  Amoy testnet:            OPTIONAL (real USDC already proven)
  Mainnet deployment:      NOT PRODUCTION-TRUSTWORTHY YET (owner = exposed EOA)
  Domain cutover:          BLOCKED
  Frontend / code work:    ALLOWED
  Smoke testing after clean deploy: ALLOWED

Forensic note (2026-05-13):
  git ls-files | grep .env       → no output (file never tracked)
  git log --all -- app-web/.env  → no output (never committed)
  grep -R "0x6cec" (tracked files) → no output (key not in source)
  git check-ignore -v app-web/.env → .gitignore:19:.env (correctly ignored)
  Conclusion: git history is clean. Exposure was session-only.
  This is a controlled operational hygiene incident, not a repo-scrub incident.

.env hygiene rule:
  The .env file is allowed to exist locally.
  The rule is: never let an agent or tool read or print .env contents.
  Automated analysis must not be directed at .env files or secret-bearing paths.
  Build/deploy/test commands may load environment variables internally, but
  command output must not display secret values. Do not cat, grep, search,
  summarize, screenshot, or paste .env contents into chat.

USDC rescue policy:
  Configured USDC cannot be rescued by the owner. Any USDC sent directly to the
  contract outside transferWithFee may be permanently unrecoverable. This is
  intentional to preserve the no-owner-drain property.

USDC dependency risk:
  ImplicitEx uses a fixed configured USDC token address, but token behavior
  still depends on that token contract and its administrator-controlled
  implementation and roles. If USDC behavior changes unexpectedly, pauses,
  blacklists, or stops behaving as expected, pause ImplicitEx transfers and
  review the dependency before resuming.

Treasury receive risk:
  If the configured treasury cannot receive USDC, the treasury fee leg can fail
  and the whole user transfer will revert. This preserves fee enforcement but
  can halt production transfers until treasury is corrected. Response: pause
  transfers, set a clean treasury, verify with a controlled smoke transfer,
  capture evidence, then resume.
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
