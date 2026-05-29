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

### 🔲 Gate 1 — Real-browser MetaMask state regression smoke

The state taxonomy is defined and the standby/provider-event refactor is complete.
This gate is now a **browser evidence task**, not a definition task.

Required evidence before WalletConnect/Reown work begins:

- MetaMask desktop connect — Polygon standby state is calm while transfers are disabled
- Ethereum mainnet → Polygon recovery — no stale "Switch to Polygon" on Polygon
- Disconnect → reconnect — sender clears and re-populates cleanly
- Refresh with wallet permission already granted — state recovers without false error
- Account switch — sender address updates cleanly, no stale prior-account display
- No duplicated wallet/provider events after reconnect
- No repeated companion notices, balance refreshes, or account-change reactions
- Rejected approval — human-readable copy shown, no misleading receipt state
- Rejected transfer signature — human-readable copy shown, no misleading receipt state
- Receipt survives refresh/reconnect — no stale READY/AUTHORIZING ghosts

### 🔲 Gate 2 — Manual production-frontend QA

Full-flow verification in a real browser. MetaMask mobile browser is MVP QA.
WalletConnect/Reown is not.

- Desktop MetaMask: connect, wrong network, approval path, transfer, rejection, refresh recovery
- Mobile MetaMask browser: same minimum flow
- iPhone Safari: visual and layout pass
- Low-resolution laptop viewport: fee, total debit, receipt, and operational text readable
- Recipient copy/paste from wallet apps and mobile keyboard
- Keyboard overlay behavior on mobile
- Approval path, rejected approval path, rejected transfer path
- Refresh/reconnect after receipt
- Wrong-network recovery: Ethereum mainnet → back to Polygon
- Receipt visibility and correct state after reconnect

### 🔲 Gate 3 — Attorney/legal clearance

Required before enabling or publicly promoting live transfers.

- Attorney review of Terms, Privacy, Legal, and Jurisdictions pages
- Jurisdiction copy remains platform policy, not an authorized/legal approval claim
- No escrow, custody, recovery, or reversal language
- No implication that ImplicitEx can reverse or guarantee funds
- Max 250 USDC cap holds until written legal/product checklist passes
- All legal pages remain marked as draft until review is complete
- Research brief for attorney: `docs/product/legal-review-research-brief.md`
  (10 platforms, 10 risk categories, ImplicitEx-specific framing for each)

### 🔲 Gate 4 — Mainnet enablement checklist

Separate from legal clearance. Legal says "may we?" This checklist says "did we
flip the right switches?"

Before any live transfer toggle:

- Polygon contract address confirmed: `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0`
- USDC address confirmed for Polygon mainnet
- Treasury address confirmed: `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919`
- Fee confirmed at 1% (100 bps)
- Max transfer cap intentionally set
- Contract pause state checked — not paused
- `transfersEnabled` flags changed intentionally, not accidentally inherited
- Polygonscan links render correctly in the UI
- Failed/rejected transactions do not create misleading receipt states
- Confirmed transfer receipt clearly shows hash and status

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

1. Run Gate 1 real-browser MetaMask state regression smoke.
2. Run Gate 2 manual production-frontend QA (desktop + mobile MetaMask, iPhone Safari).
3. Begin WalletConnect/Reown branch after Gate 1 and Gate 2 are closed.
   WalletConnect is an engineering integration — it does not require attorney review
   first, but it does require proven MetaMask/browser state behavior. Adding it before
   Gates 1 and 2 are closed multiplies uncertainty.
4. Obtain Gate 3 attorney/legal clearance.
5. Execute Gate 4 mainnet enablement checklist immediately before flipping transfer gates.
6. Enable live transfers only after Gates 3 and 4 are closed.
7. Update Firebase Hosting cache header documentation if not done before Gate 1.

### Receipt History Lane — Specced, Not Yet Implemented

Identified 2026-05-28 during receipt-store architecture review.

The receipt archive already contains the raw material for a local-first recipient
relationship memory system. No backend, schema migration, or new storage layer is
required.

API contract specced in `docs/product/receipt-store.md` under
"Recipient Context Queries":

```javascript
window.IX.receipts.getRecipientContext(address)
// returns { known, recipient, count, lastTransfer, recentTags, lastMemo, lastReference }
// returns null for unknown recipients
```

Scope rules locked:
- Archive-only (active receipt excluded — in-flight state must not influence history)
- `totalSent` deferred to v2 (requires integer USDC base unit arithmetic, not parseFloat)
- `wallet.js` calls the interface; it does not query the archive directly

Implementation branch: `receipt-history` (not yet opened)
Spec diff parked at: `/tmp/implicitex-recipient-context-doc.diff` (uncommitted)
Next step: open `receipt-history`, apply diff, implement, verify with `node --check`

Do not start until the frontend state contract gate is resolved.

---

## Stage 3 - Desktop Resource

- Do not start until Stage 2 smoke evidence is complete.

## Stage 4 - Hardware Wallet And Security Expansion

- Do not start until Stage 3 is mature.
