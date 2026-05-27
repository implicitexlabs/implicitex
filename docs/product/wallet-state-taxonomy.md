# ImplicitEx - Wallet State Taxonomy

Last updated: 2026-05-27

Operational contract for wallet, network, sender, and permission states.
Transaction execution states live in `docs/product/transaction-states.md`.
This document may name transaction-facing gates such as `draft` and
`REVIEW_READY`, but `docs/product/transaction-states.md` remains authoritative
for post-wallet-action execution states such as `authorizing`, `submitted`,
`confirmed`, `failed`, `rejected`, and `unclear`.

Truth sources:

- On-chain truth: transaction receipt, contract readback, token readback, and
  explorer-verifiable transaction data.
- Wallet-provider truth: `eth_chainId`, `eth_accounts[0]`, wallet request
  responses, and provider errors.
- Local receipt truth: stored receipt state, hashes, timestamps, provenance,
  and integrity checks.
- Runtime interpretation: ImplicitEx header, transfer panel, telemetry, and
  companion tray.
- Advisory heuristics: browser-local recipient history, smart-contract address
  detection, gas estimates, and explanatory guidance.

## State Table

| State | Header label | Companion status | Network field | Last event | Next step | Severity | Transfer form | Primary button | Allowed action | Blocked action | Truth source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `DISCONNECTED` | Polygon pre-live / Wallet disconnected | Ready / Wallet disconnected | `-` | No wallet connected. | Connect wallet to begin. | none | hidden | Connect Wallet | request account permission | transfer submit | local state + `eth_accounts` |
| `DISCONNECTED_PERMISSION_REVOKED` | Wallet disconnected. Site permission removed. | Wallet disconnected | `-` | MetaMask returned no authorized accounts for this site. | For shared computers, also lock MetaMask. | none | hidden | Connect Wallet | request account permission | transfer submit | `eth_accounts = []` |
| `DISCONNECTED_PERMISSION_STILL_AUTHORIZED` | Wallet hidden locally, but MetaMask still authorizes this site. | Wallet hidden locally / MetaMask still authorizes this site | `-` | MetaMask returned an authorized account after disconnect. | Open MetaMask -> Connected sites -> disconnect this site, then lock MetaMask. | warning | hidden | Connect Wallet | reconnect only after explicit user action | transfer submit, silent reconnect | `eth_accounts` |
| `CONNECTING` | Connecting wallet | Connecting wallet | pending | Wallet connection requested. | Finish the MetaMask prompt. | none | hidden | Connecting... | approve/reject wallet request | transfer submit | MetaMask permission prompt |
| `WALLET_PENDING_REQUEST` | MetaMask already has a pending request. | Wallet request pending | current provider chain if known | MetaMask reported a pending request. | Open MetaMask and finish or cancel the pending request. | warning | hidden | Connect Wallet | finish/cancel pending wallet prompt | duplicate wallet request, transfer submit | provider error `-32002` |
| `WALLET_REJECTED` | Wallet connection rejected. | Wallet connection rejected | `-` | User rejected the wallet request. | Retry when ready. | warning | hidden | Connect Wallet | retry connection | transfer submit | provider error `4001` |
| `WALLET_CONNECTED_READY` | Wallet connected | Wallet connected | Polygon | Address: short sender | Enter a recipient address and amount to begin. | none | visible/enabled | Send USDC | draft/review transfer | wrong-chain submit | `eth_accounts[0]` + `eth_chainId = 0x89` + live chain config |
| `TRANSFERS_DISABLED` | Wallet connected | Standby | Polygon | Wallet connected on configured Polygon contract while transfers are paused. | No wallet action required. Wait for controlled transfer enablement. | none | visible/read-only | Transfers disabled | inspect configuration, disconnect, switch account | approval, transfer submit, wrong-network prompt | `eth_accounts[0]` + `eth_chainId = 0x89` + configured chain + disabled gates |
| `WRONG_NETWORK` | Wrong network | Wrong network | detected network, e.g. Ethereum Mainnet | Wallet connected on unsupported network. | Switch MetaMask to Polygon Mainnet before sending USDC. | error | hidden/disabled | Switch to Polygon | request `wallet_switchEthereumChain` | transfer submit | `eth_chainId` |
| `CONTRACT_UNAVAILABLE` | Contract unavailable | Contract unavailable | configured network without deployed contract, e.g. Polygon Amoy | Wallet connected on a configured network that has no transfer contract address. | Switch to Polygon Mainnet or disconnect. | error | hidden/disabled | Switch to Polygon | request `wallet_switchEthereumChain` | transfer submit | `eth_chainId` + configured chain with missing contract |
| `ACCOUNT_CHANGED` | Wallet connected | Wallet connected | current live network | Wallet account changed to short sender. | Review the connected sender and re-enter transfer details. | warning | cleared, then visible if network is live | Send USDC after new details | re-enter transfer details | submit stale draft | `eth_accounts[0]` |
| `ACCOUNT_PERMISSION_STALE` | Wallet hidden locally, but MetaMask still authorizes this site. | MetaMask still authorizes this site | `-` | MetaMask returned the same authorized account after account selection or disconnect. | Open MetaMask -> Connected sites -> disconnect this site, then reconnect with the intended account. | warning | hidden/cleared | Connect Wallet | remove site permission in MetaMask | transfer submit, stale-account submit | `eth_accounts` |
| `draft` | Wallet connected | Transfer draft | Polygon | User entered transfer details. | Review recipient, amount, fee, sender, and balance. | none | visible/editable | Review Transfer, or Insufficient Balance when blocked | validate draft | wallet approval, transfer submit | local form state + `eth_accounts[0]` + `eth_chainId` + USDC balance |
| `REVIEW_READY` | Review transfer | Transfer ready. No wallet action requested yet. | Polygon | Transfer details validated. | Confirm details before wallet approval. | none | locked/review mode | Approve USDC | request allowance approval or proceed if allowance is sufficient | transfer submit before review | validated draft + contract config + USDC balance |

Post-wallet-action execution states are defined in
`docs/product/transaction-states.md`. This includes `authorizing`,
`authorized`, `submitting`, `submitted`, `pending`, `confirmed`, `failed`,
`rejected`, `unclear`, `expired`, and `replaced`.

## Live Transfer Chain Rule

A chain is usable for production transfer only when all are true:

```
eth_chainId resolves to the chain
IX_CHAINS[chainId] exists
IX_CHAINS[chainId].contractAddress exists
IX_CHAINS[chainId].transfersEnabled === true
IX_CONFIG.transfersEnabled === true
```

Configured chains with a deployed contract but disabled transfer gates are
`TRANSFERS_DISABLED`, not wrong-network states. This is the current
Polygon-mainnet pre-live posture:

```
eth_chainId = 0x89
IX_CHAINS[137].contractAddress = 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
IX_CHAINS[137].transfersEnabled === false
IX_CONFIG.transfersEnabled === false
```

Configured chains without a deployed transfer contract are
`CONTRACT_UNAVAILABLE`. Chains absent from `IX_CHAINS` are `WRONG_NETWORK`.

## Calm-State Rule

Stable operational states must not be rendered as recovery states.

`TRANSFERS_DISABLED` means the platform is intentionally in standby/read-only
mode. The UI may show the transfer instrument for configuration inspection, but
must not:

- show a wrong-network error,
- ask the user to switch networks when already on Polygon,
- pulse or color the state as urgent,
- query live balances solely to make a disabled transfer actionable,
- request approval or submit a transfer.

Error or warning severity is reserved for user-actionable provider/network
problems such as `WRONG_NETWORK`, `CONTRACT_UNAVAILABLE`,
`WALLET_PENDING_REQUEST`, `WALLET_REJECTED`, stale wallet permission, or
account changes.

## Severity Ladder

Preflight, recipient-intelligence, companion, and telemetry surfaces should map
state to presentation consistently:

| Level | Meaning | Presentation |
|---|---|---|
| `neutral` | Incomplete or not evaluated yet. | Muted. |
| `advisory` | Attention recommended before continuation. | Amber. |
| `blocking` | Continuation is blocked, but no loss or irreversible action can occur. | Amber. |
| `pending` | Read/check is in progress. | Muted or low-emphasis motion. |
| `critical` | Loss risk, dangerous mismatch, failed execution, corrupted state, or integrity failure. | Red. |
| `ok` | Requirement satisfied. | Normal/passive success treatment. |

Examples:

- Blank recipient, blank amount, and pending balance reads are not critical.
- New-to-browser-history recipient and network-confirmation reminders are
  advisory.
- Wrong network during an executable flow, unavailable contract, failed gas
  simulation, transfer revert, and receipt-integrity failure are critical.

## Advisory Density Rule

Amber should not become the new red. Advisory items are useful when they explain
the next decision, but too many visible advisory bullets can still make the
instrument feel noisy.

When more than three advisory items are active on the same surface, prefer a
summary row such as `3 advisory checks pending` with expandable detail. Keep
critical items visible without collapsing them.

## Temporal Severity Rule

Severity depends on the user's phase in the flow. The same condition can move
between levels as user intent and execution risk increase:

| Condition | Drafting | Review attempt | Signing/broadcast | After broadcast |
|---|---|---|---|---|
| Recipient missing | `neutral` | `blocking` | not reachable | not reachable |
| Amount below minimum | `neutral` or `blocking` after entry | `blocking` | not reachable | not reachable |
| Wallet not connected | `neutral` | `blocking` | not reachable | not reachable |
| Approval required | `advisory` | `advisory` | `pending` during prompt | `ok` or execution state |
| Wallet prompt open | `pending` | `pending` | `pending` | not applicable |
| Wrong chain | `advisory` if only inspecting | `critical` if trying to execute | `critical` | `critical` until resolved |
| Transaction replaced | not applicable | not applicable | `advisory` or `critical` by ambiguity | `advisory` or `critical` by ambiguity |
| Receipt mismatch | not applicable | not applicable | `critical` | `critical` |

Rule of thumb: before explicit user intent, describe current state. At review,
name blockers. During signing or broadcast, elevate mismatches and failed
integrity checks because funds, authority, or transaction truth may be at risk.

## Persistence Rule

Not all severities should persist for the same duration. Avoid historical
emotional residue: a resolved warning should not keep visually dominating the
instrument after it no longer affects the current decision.

| Level | Persistence behavior |
|---|---|
| `neutral` | Disappears or downgrades immediately when satisfied. |
| `advisory` | May fade, collapse, or summarize after comprehension; should clear when no longer relevant. |
| `blocking` | Persists while it blocks the next intended action; clears as soon as the blocker is resolved. |
| `pending` | Must self-resolve to `ok`, `advisory`, `blocking`, or `critical`; should not linger indefinitely. |
| `critical` | Persists until acknowledged, resolved, or replaced by stronger verified truth. |
| `ok` | May remain passive or disappear when it adds no useful context. |

Examples:

- `Approval required` clears immediately after approval is confirmed.
- `New to this browser history` may downgrade after repeated successful
  transfers to the same recipient.
- `Gas estimate retrying` must decay automatically into success, advisory retry
  guidance, or critical failure.
- Critical receipt or execution integrity failures remain visible until the user
  acknowledges them or a stronger source resolves the state.

## Critical Subtypes

Critical states should preserve why they are severe. User-risk critical and
system-integrity critical are both red-level, but they require different user
guidance.

| Subtype | Meaning | Example guidance |
|---|---|---|
| `user-risk critical` | The next action could cause loss, wrong-recipient execution, authority misuse, or irreversible user harm. | Stop execution and ask the user to correct or re-confirm the dangerous input. |
| `system-integrity critical` | The platform cannot reconcile transaction truth, receipt truth, provider truth, or local state. | Stop relying on local UI truth; direct verification through chain/explorer/support evidence. |

Examples:

- Recipient checksum mismatch or dangerous recipient heuristics:
  `user-risk critical`.
- Receipt reconciliation failure, impossible state transition, or corrupted
  active receipt: `system-integrity critical`.

## Truth Hierarchy

When sources disagree, the UI must favor stronger evidence over weaker
interpretation:

1. On-chain verified truth.
2. Wallet-provider truth.
3. Local receipt truth with provenance and integrity checks.
4. Runtime UI interpretation.
5. Advisory heuristics.

Runtime UI interpretation and advisory heuristics must never overrule on-chain
truth. Local receipt state may preserve uncertainty, but it must not fabricate
certainty that a stronger source has not confirmed.

## Truth Degradation Rule

When higher-trust sources become unavailable, delayed, or contradictory, the UI
should degrade confidence explicitly instead of pretending certainty.

Confidence language should move progressively:

| Confidence | Meaning | Example |
|---|---|---|
| `confirmed` | Strong source confirms the state. | Chain receipt proves success or revert. |
| `probable` | Evidence points one way, but a stronger source is unavailable. | Wallet returned a hash, RPC confirmation is delayed. |
| `uncertain` | Sources are missing, stale, or contradictory. | Local receipt restored, but RPC/explorer cannot verify yet. |
| `untrusted` | State integrity is broken or impossible to reconcile. | Receipt transition is impossible or local state is corrupt. |

Examples:

- RPC unavailable after broadcast: keep hash-bearing state recoverable and mark
  confirmation as `probable` or `uncertain`, not failed.
- Wallet disconnect mid-confirmation: preserve local receipt evidence, but do
  not claim finality until chain truth is available.
- Explorer unreachable: keep chain/RPC evidence if present; only explorer link
  confidence degrades.
- Receipt state partially restored: show uncertainty and re-query stronger
  sources before promoting to a final state.
- Contradictory receipt/provider/chain evidence: escalate to
  `system-integrity critical` and direct independent verification.

## Narration Confidence Rule

The companion tray, telemetry bar, and other explanatory surfaces may summarize,
interpret, and narrate transaction state, but they must not speak with stronger
confidence than the strongest verified source beneath them.

Narration must inherit confidence from the underlying truth layer:

| Underlying truth | Allowed narration |
|---|---|
| Advisory heuristic only | Suggestive language only. Do not state as fact. |
| Local receipt restored but unverified | Recoverable/uncertain language. Do not imply finality. |
| Wallet-provider hash returned | Submitted/probable language. Do not claim confirmation. |
| RPC or explorer temporarily unavailable | Verification pending/uncertain language. Do not classify as failed solely from timeout. |
| Chain receipt verified | Confirmed or failed language, matching receipt truth. |
| Contradictory or impossible state | Untrusted/system-integrity-critical language. Direct independent verification. |

Examples:

- Advisory heuristics should not say `unsafe recipient`; they may say
  `recipient needs review` unless a stronger risk source exists.
- Restored local state should not say `transfer confirmed`; it should say
  `previous transfer state restored; verifying`.
- Probable confirmation should not use finalized receipt wording.
- Uncertain states should avoid authoritative phrasing and expose the reason
  confidence is degraded.

## Disconnect Contract

User-clicked Disconnect must:

1. Clear local connected state before any awaited provider call.
2. Clear sender display, recipient, amount, preview, fee, balance, status, and active receipt state.
3. Stop provider polling.
4. Attempt `wallet_revokePermissions` for `eth_accounts`.
5. Verify `eth_accounts`.
6. Render `DISCONNECTED_PERMISSION_REVOKED` when `eth_accounts` returns `[]`.
7. Render `DISCONNECTED_PERMISSION_STILL_AUTHORIZED` when MetaMask still returns an account.

ImplicitEx must not claim that MetaMask is disconnected unless
`eth_accounts` confirms no account authorization for the site.

## Sender Authority Rule

The sender used for any transfer must equal `eth_accounts[0]` immediately before
signer use. If `eth_accounts[0]` changes after the user has prepared a draft,
clear the draft and show:

```
Wallet account changed. Review the connected sender and re-enter transfer details.
```

## Pre-Send Review Requirement

Before requesting approval or transfer confirmation, ImplicitEx should show a
deterministic review state with:

```
Connected sender
Recipient
Amount
ImplicitEx fee
Total debit
Network
Contract
```

The review state is not a transaction. No wallet action has been requested yet.
`REVIEW_READY` is blocked unless sender, recipient, amount, fee, total debit,
network, contract, and known USDC balance all pass. If total debit exceeds
balance, the primary button is non-actionable and reads `Insufficient Balance`.

## Mobile Parity Requirement

Mobile must expose the same operational truth as desktop:

- connected sender
- connected network
- standby/read-only state while transfers are disabled
- wrong-network / contract-unavailable state
- Switch to Polygon
- Switch Account
- Disconnect
- long MetaMask/provider guidance without truncation

If any of those are unavailable or unreadable on mobile, the wallet flow is not
release-ready.
