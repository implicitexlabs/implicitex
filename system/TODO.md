# ImplicitEx TODO

Last updated: 2026-05-09

## Session Checkpoint — 2026-05-09

**Blocked:** Amoy deployment needs additional test POL. Deployer wallet has 0.1 POL, deploy requires ~0.151 POL. Alchemy faucet rate-limited (12h). Try Chainlink faucet at `https://faucets.chain.link/polygon-amoy` next.

**Frontend pre-live UX is committed and ready for contract address insertion after deploy.** Commits locked:
- `f148d05` Improve pre-live wallet transfer states
- `1b59701` Fix companion contrast and remove tagline copy
- `f4d8a81` Document Firebase hosting setup

**After deploy:** set `contractAddress` in `chains.js` chain 80002, then separately set `transfersEnabled: true` after testnet signoff checklist passes.

## Current Objective

Get the wallet, token, and deployment configuration clean enough that Claude,
Codex, and any human operator are not guessing.

Today is an operational readiness lane for ImplicitEx / USDC / Ledger. Mainnet
is not in scope unless deliberately chosen and documented.

## Today's Checklist

### 1. Confirm Network

- [ ] Decide whether today's target is Amoy / Polygon testnet.
- [ ] Confirm chain ID and explorer URL for the selected testnet.
- [ ] Record the selected network in a deployment parameter note.
- [ ] Keep mainnet out of scope unless there is explicit written approval.

### 2. Confirm Token Contract

- [ ] Confirm the USDC-style token address for the selected testnet.
- [ ] Confirm token decimals, expected to be 6 for USDC-style tokens.
- [ ] Record whether the token is real Circle USDC, bridged/test USDC, or a
      mock ERC-20.
- [ ] Confirm the frontend and contract tests use the same token assumptions.

### 3. Confirm Fee Recipient

- [ ] Create or select the Ledger-controlled treasury / fee recipient address.
- [ ] Record only the public address.
- [ ] Do not paste seed phrases, recovery words, private keys, or Ledger secrets
      anywhere.
- [ ] Confirm the treasury address is separate from the deployer/admin wallet.
- [ ] Label it clearly: `ImplicitEx Treasury - Fee Recipient`.

### 4. Confirm Deployer Wallet

- [ ] Select a dedicated hot wallet for testing and deployment.
- [ ] Confirm it is funded with enough test MATIC/POL for gas.
- [ ] Confirm it is not the treasury wallet.
- [ ] Keep this wallet low-value and testnet-focused.
- [ ] Document the public address and role label only.

### 5. Confirm `.env` Values

- [ ] RPC URL for selected network.
- [ ] Private key for deployer/test wallet only.
- [ ] Treasury / fee recipient public address.
- [ ] Token contract address.
- [ ] Optional Polygonscan API key for verification.
- [ ] Confirm `.env` and secret files are ignored and not committed.

### 6. Run Tests Before Deploy

- [ ] Fee math.
- [ ] Sender pays fee versus fee deducted from amount, if still supported.
- [ ] Recipient receives correct amount.
- [ ] Fee recipient receives correct fee.
- [ ] Reverts on invalid token, amount, or address.
- [ ] Events emit correctly.
- [ ] Pause and unpause behavior, if included in deploy scope.
- [ ] Ownership / admin permission checks.

## Wallet Role Plan

### Personal Wallet

Purpose: recipient testing and casual user-flow checks.

Use for:

- [ ] Receiving test USDC.
- [ ] Confirming user-side flows.
- [ ] Verifying transaction receipts.
- [ ] Testing what a normal recipient sees.

Do not use for:

- [ ] Fee recipient.
- [ ] Contract owner/admin.
- [ ] Platform treasury.
- [ ] Production deployer.

### Test Sender Wallet

Purpose: disposable development wallet for sending USDC through the app.

Use for:

- [ ] Sending USDC through the transfer flow.
- [ ] Fee calculation testing.
- [ ] Failed and edge-case tests.
- [ ] Wallet connect/disconnect testing.
- [ ] Later Time Transfer testing.

Notes:

- [ ] Keep low-value.
- [ ] Do not use as treasury or production admin.

### Platform Treasury Wallet

Purpose: dedicated platform fee recipient.

Use for:

- [ ] Platform fee collection.
- [ ] Protocol revenue tracking.
- [ ] Treasury accounting.
- [ ] Future business/tax records.

Notes:

- [ ] Create one dedicated ImplicitEx treasury wallet.
- [ ] Ledger-backed custody is preferred once testing is stable.
- [ ] Treasury receives fees only; it should not automatically control admin
      permissions.

### Deployer / Admin Wallet

Purpose: contract deployment and privileged operations.

Use for:

- [ ] Deploying contracts.
- [ ] Assigning roles.
- [ ] Managing future timelock or admin controls.
- [ ] Proposing/administering contract changes.

Notes:

- [ ] Keep separate from treasury.
- [ ] Do not create the production deployer/admin wallet until contract roles are
      locked.
- [ ] Testnet deployer can be a dedicated low-value hot wallet.
- [ ] Production deployer/admin should eventually move to hardware wallet and/or
      multisig control.

### Subscriber / Test User Wallets

Purpose: future user-type simulation.

Create later:

- [ ] `Test User - Free`
- [ ] `Test User - Subscriber`

Use for:

- [ ] 1% default fee testing.
- [ ] 0.5% subscriber fee testing, if implemented.
- [ ] Locked versus unlocked tools.
- [ ] Wallet reputation behavior.
- [ ] Time Transfer eligibility.
- [ ] UI messaging for non-subscribers.

## Wallet Registry Template

```text
ImplicitEx Wallet Registry

1. Personal Recipient Wallet
Purpose: Recipient testing only
Address: [public address]
Network(s): [network]
Notes: Personal wallet, not platform treasury.

2. Test Sender Wallet
Purpose: USDC transfer testing
Address: [public address]
Network(s): [network]
Notes: Low-value testing wallet.

3. ImplicitEx Treasury Wallet
Purpose: Platform fee recipient
Address: [public address]
Network(s): [network]
Notes: Dedicated fee recipient. Not admin/deployer.

4. Testnet Admin / Deployer Wallet
Purpose: Contract deployment and admin testing
Address: [public address]
Network(s): [network]
Notes: Low-value hot wallet. Not treasury.
```

## Conservative MVP Posture

Initial launch posture should prove operational correctness, not maximize
volume.

- [ ] Start treasury funding around 100 USDC or less.
- [ ] Keep treasury POL/MATIC gas reserve around $10-$25 equivalent.
- [ ] Start max transfer around 250 USDC per transfer.
- [ ] Consider a daily volume limit around 1,000-2,500 USDC if implemented.
- [ ] Keep hot/software wallet exposure minimal.
- [ ] Deploy one low-limit production transfer contract first.
- [ ] Increase limits only after a written promotion checklist passes.

## MVP Completion Gaps

These items are not wallet setup, but they are required before calling the MVP
ready.

- [ ] Define the exact MVP success path: connect wallet, approve USDC, submit
      `transferWithFee`, show receipt, and verify recipient/treasury balances.
- [ ] Confirm frontend chain config is injected safely and does not rely on
      hardcoded production secrets.
- [ ] Add a deployment artifact record for each testnet/mainnet deploy,
      including network, contract, token, treasury, deployer, fee, min transfer,
      precision, paused state, and explorer link.
- [ ] Add a transaction receipt record template for smoke tests.
- [ ] Confirm frontend reads live contract settings for fee, minimum transfer,
      precision, treasury, paused state, and contract address.
- [ ] Confirm allowance flow: no approval when allowance is sufficient, approval
      prompt when needed, transfer prompt only after approval succeeds.
- [ ] Confirm all user-facing failure states: rejected wallet request, wrong
      network, insufficient balance, insufficient allowance, invalid recipient,
      paused contract, failed gas estimate, failed transaction, and explorer
      delay.
- [ ] Confirm production disable switch / `transfersEnabled` behavior is visible
      and cannot silently route live funds before signoff.
- [ ] Confirm support path, legal pages, privacy language, and fee disclosure are
      reachable from the transfer flow.
- [ ] Have Terms, Privacy, Legal, and Supported Jurisdictions reviewed by a
      qualified attorney before live production transfer enablement.
- [ ] Re-check restricted jurisdictions against current sanctions and USDC
      issuer/platform policies before launch and on a recurring schedule.
- [ ] Confirm analytics/logging does not capture private wallet data beyond
      public addresses and public transaction metadata.
- [ ] Confirm landing page gas display uses a readable font size and an explicit
      precision policy: whole-number Gwei in the hero for scanning, one decimal
      in detailed gas/chain panels.
- [ ] Confirm mobile layout for wallet connect, transfer modal, gas display, and
      receipt view.
- [ ] Confirm launch copy clearly says transfers are testnet/demo until live
      enablement is approved.
- [ ] Confirm `CONNECT WALLET` opens a wallet-provider modal and never asks the
      user to type their own wallet address as the connect action.
- [ ] Confirm recipient address entry remains a separate transfer-form field.

## Limit Increase Checklist

Current candidate max transfer: 250 USDC

Before increasing to 1,000 USDC:

- [ ] Full Hardhat test suite passes.
- [ ] Fee math verified for every supported fee mode.
- [ ] Contract source verified on explorer.
- [ ] At least 20 successful low-value production transactions recorded.
- [ ] No failed transaction caused by contract logic.
- [ ] Treasury received expected fee amounts.
- [ ] Event logs match frontend receipts.
- [ ] Admin/deployer wallet secured.
- [ ] Fee recipient wallet confirmed.
- [ ] Emergency pause behavior tested, if included.
- [ ] AI/security review findings resolved or documented.

## Cost-Conscious Launch Structure

- [ ] Local testing target spend: $0.
- [ ] Amoy testnet target spend: $0, except time and faucet availability.
- [ ] AI/security review target spend: $0 incremental, using existing tools.
- [ ] Polygon mainnet dry run reserve: $5-$25.
- [ ] Public MVP gas and test transaction reserve: $25-$100.
- [ ] Professional audit fund later: only after traction or meaningful TVL.

## Security Rules

- [ ] AI review is not a formal audit.
- [ ] Do not paste seed phrases, private keys, or recovery words into any chat,
      document, issue, commit, or screenshot.
- [ ] Do not mix treasury and admin roles without an explicit written exception.
- [ ] Do not ship hardcoded RPC URLs, private keys, API keys, or wallet secrets.
- [ ] Do not enable live transfers until the launch gate evidence is complete.
- [ ] Keep v1 contract behavior simple.
- [ ] Verify contract source before production enablement.
- [ ] Test small amounts first.

## Legal / Compliance Wording Discipline

- [ ] Treat Terms, Privacy, Legal, and Jurisdictions as drafted, not final.
- [ ] Add visible note: attorney review required before live production transfer
      enablement.
- [ ] Review `jurisdictions.html` for overclaiming.
- [ ] Use "intended MVP availability," "supported by platform policy," and
      "restricted by platform policy."
- [ ] Avoid "authorized," "approved," "licensed," or "legally permitted" unless
      attorney-reviewed.
- [ ] Clarify that supported means product-intended availability, not legal
      authorization.
- [ ] Clarify that New York and Hawaii exclusions are ImplicitEx policy pending
      review, not a legal determination.
- [ ] Do not imply Circle coverage, banking approval, money-transmission
      licensing, or regulatory clearance.
- [ ] Confirm all policy pages cross-link consistently:
      - `/components/terms.html`
      - `/privacy.html`
      - `/legal.html`
      - `/jurisdictions.html`
- [ ] Run static link checks.
- [ ] Run mobile render pass.

## Related Documents

- `system/ARENA_MAP.md`
- `system/WALLET_CONNECT_UX.md`
- `docs/operations/implicitex-launch-gate.md`
- `docs/decisions/implicitex-foundation-checkpoint-2026-04-30.md`
