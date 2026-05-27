# Initial Roadmap

Last updated: 2026-05-27

## Current MVP Readiness Snapshot

Estimated MVP readiness: 96-98%.

ImplicitEx has a hardened transfer contract deployed on Polygon mainnet with Safe
ownership accepted, source verified, and on-chain state confirmed. The platform
is deployed, but remains pre-live/read-only by configuration. The frontend can
load, connect a wallet, detect Polygon, show the instrument UI, and verify
configuration, but it must not allow a real transfer yet.

Current posture:

- Contract lane: CLOSED / FROZEN.
- Deployment lane: COMPLETE — canonical contract live, Safe-owned.
- Frontend execution-safety lane: CLOSED.
- Frontend calm-state lane: ACTIVE — stable operational states must not render
  as error/recovery states.
- Frontend polish lane: ACTIVE — pre-live/read-only presentation tightening.
- Controlled smoke lane: COMPLETE for prior gated smoke; CLOSED until transfers
  are deliberately re-enabled under a written checklist.
- Product-change lane: limited to state-contract and read-only presentation
  hardening before WalletConnect/mobile work.

Transfer gates:

```text
IX_CONFIG.transfersEnabled = false
IX_CHAINS[137].transfersEnabled = false
```

Main branch tip: last documented production checkpoint was
`587aa93 — Restore canonical Polygon deployment record`. Re-check before any
new deploy or live-transfer gate change.

## Canonical Production Contract

```text
Address:   0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
Network:   Polygon mainnet (137)
Owner:     0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97 (Safe — ACCEPTED)
PendingOwner: 0x0000000000000000000000000000000000000000
Treasury:  0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
Fee:       100 bps (1%)
Deploy tx: 0x87593fdb3d256a4a94b3e73877ba0bc433c39e81eefc78334af6da79ff5ef1f3
Ownership accepted tx: 0xd6bfb2876725391c956dbd17ec5f774f9246b50df5667e8b29e8c78305365e90
Source verified: https://polygonscan.com/address/0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
On-chain verified: 2026-05-23 — owner/pendingOwner/treasury/fee/paused all PASS
```

Frontend production config points Polygon mainnet to the same contract address,
but both the global transfer gate and Polygon chain transfer gate remain false.

## MVP Wallet And Funding State

| Role | Address | Status |
|---|---|---|
| Deployer | `0x5466bbA8cD334554c88F81342dDfcEc4c4A7698B` | DONE — used for canonical deploy |
| Governance wallet | `0x6d6232f653f5DD765017F12647435c2122F3F6B8` | Funded; governance/Safe operational reserve |
| Safe / owner | `0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97` | DONE — ownership accepted on canonical contract |
| Treasury | `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919` | Configured in contract; ready to receive fees |
| Operations | `0xFfEe63C73C082Da41Ec2ceB315aEd61ef192B616` | 75.0 USDC available for smoke transfers |

## Remaining MVP Gates

### ✅ Deployment execution — COMPLETE

- ✅ Deployer provenance confirmed by operator
- ✅ Safe / owner address confirmed
- ✅ Treasury address confirmed
- ✅ Polygon mainnet deployment executed (`0x5015841D`)
- ✅ Ownership transferred and accepted by Safe
- ✅ Source verified on Polygonscan
- ✅ On-chain state verified 2026-05-23 (owner, pendingOwner, treasury, fee, paused)
- ✅ `deployments/polygon.json` reflects canonical contract

### ✅ Frontend polish — COMPLETE

- ✅ Single-action execution UX (checkbox → Execute Transfer)
- ✅ Transfer timeline with phase-specific milestones
- ✅ Phase-specific pulsing button labels across all pending states
- ✅ Preflight readiness check before wallet prompt
- ✅ Merged to main at `ad53db6` / `587aa93`
- ✅ All checks passing: syntax, static, observability (27/27)

### ✅ Controlled production smoke — COMPLETE (2026-05-23)

- ✅ 1 USDC transfer executed on canonical contract
- ✅ Recipient received 1.00 USDC, treasury received 0.01 USDC, contract retained 0
- ✅ Timeline, armed state, MetaMask phase narration all verified
- ✅ Gate closed before commit
- Evidence: docs/operations/evidence/smoke-polygon-mainnet-2026-05-23.md

### ✅ Receipt stale-state fix — COMPLETE

Scope: do not show stale READY/AUTHORIZING records as active after a confirmed transfer.
Polygon is the authoritative receipt. Local receipts are UX/proof packaging.

After confirmation the UI should show:
  "Confirmed on Polygon · View transaction · Export proof packet"

Not required for MVP: a perfect local accounting ledger.
Required for MVP: no stale intermediate records presented as active state after settlement.

Follow-up confirmed 2026-05-27:

- Stale receipt phantom state was fixed.
- Corrupt active receipt state now notifies subscribers when cleared.
- Firebase JS cache headers were updated so stale `wallet.js` and
  `receipt-store.js` should not survive deploys.

### 🔲 Frontend state contract — MUST DEFINE before WalletConnect/Reown

The app is safe, but it is not yet calm. Transfer gates are doing their job; the
next risk is presentation-layer twitchiness where stable operational states look
like error or recovery states.

Before WalletConnect/mobile handoff is added, define explicit allowed frontend
states for at least:

- disconnected
- connected on Polygon while transfers are disabled
- connected on unsupported network
- connected on configured network without a deployed contract
- wallet request pending
- wallet request rejected
- account changed
- local disconnect with wallet permission still authorized
- draft/review-ready with no wallet action requested
- post-wallet transaction execution states, delegated to
  `docs/product/transaction-states.md`

### 🔲 Real-wallet QA

- Desktop MetaMask: connect, wrong network, approval path, transfer, rejection, refresh recovery
- Mobile MetaMask or mobile wallet: same minimum flow
- Confirm fee, total debit, and receipt visibility on mobile and low-resolution screens

### 🔲 Legal and operating boundary

- Attorney review required before public production transfer promotion
- Jurisdiction language remains platform policy, not a legal authorization claim
- Keep max transfer capped at 250 USDC until written promotion checklist passes

## Stage 1 - Online Transfer MVP

- ✅ Define product scope
- ✅ Capture transfer flow requirements
- ✅ Establish implementation baseline
- ✅ Harden contract (routing, fee cap, ownership, pause, no-owner-drain)
- ✅ Deploy to Polygon mainnet with Safe ownership
- ✅ Verify source and on-chain state
- ✅ Prove controlled live transfer path on canonical contract (2026-05-23)

## Stage 2 - Operational Reliability

- ✅ Role separation: deployer / Safe / treasury / governance / operations
- ✅ Frontend execution instrument complete and merged
- ✅ Controlled production smoke evidence
- 🔲 Real-wallet QA (desktop + mobile)
- 🔲 Prove reliability with small number of production transfers before expanding limits

## Next Best Sequence

1. Update Firebase Hosting documentation for JavaScript cache headers.
2. Fix the CSS transform warning only if it stays a small one-commit change.
3. Define the frontend state contract.
4. Add WalletConnect/Reown after the state contract is explicit.
5. Run live-transfer smoke only after UI modes are stable and transfers are
   deliberately enabled under controlled conditions.

## Stage 3 - Desktop Resource

- Do not start until Stage 2 smoke evidence is complete.

## Stage 4 - Hardware Wallet And Security Expansion

- Do not start until Stage 3 is mature.
