# ImplicitEx - Wallet State Taxonomy

Operational contract for wallet, network, sender, and permission states.
Transaction execution states live in `docs/product/transaction-states.md`.
This document may name transaction-facing gates such as `draft` and
`REVIEW_READY`, but `docs/product/transaction-states.md` remains authoritative
for post-wallet-action execution states such as `authorizing`, `submitted`,
`confirmed`, `failed`, `rejected`, and `unclear`.

Truth sources:

- Network truth: `eth_chainId`
- Sender truth: `eth_accounts[0]`
- Transfer truth: contract result, transaction receipt, and receipt store
- Wallet permission truth: MetaMask connected-site authorization, checked through `eth_accounts`
- User guidance: ImplicitEx header, transfer panel, and companion tray

## State Table

| State | Header label | Companion status | Network field | Last event | Next step | Severity | Transfer form | Primary button | Allowed action | Blocked action | Truth source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `DISCONNECTED` | Polygon live / Wallet disconnected | Ready / Wallet disconnected | `-` | No wallet connected. | Connect wallet to begin. | none | hidden | Connect Wallet | request account permission | transfer submit | local state + `eth_accounts` |
| `DISCONNECTED_PERMISSION_REVOKED` | Wallet disconnected. Site permission removed. | Wallet disconnected | `-` | MetaMask returned no authorized accounts for this site. | For shared computers, also lock MetaMask. | none | hidden | Connect Wallet | request account permission | transfer submit | `eth_accounts = []` |
| `DISCONNECTED_PERMISSION_STILL_AUTHORIZED` | Wallet hidden locally, but MetaMask still authorizes this site. | Wallet hidden locally / MetaMask still authorizes this site | `-` | MetaMask returned an authorized account after disconnect. | Open MetaMask -> Connected sites -> disconnect this site, then lock MetaMask. | warning | hidden | Connect Wallet | reconnect only after explicit user action | transfer submit, silent reconnect | `eth_accounts` |
| `CONNECTING` | Connecting wallet | Connecting wallet | pending | Wallet connection requested. | Finish the MetaMask prompt. | none | hidden | Connecting... | approve/reject wallet request | transfer submit | MetaMask permission prompt |
| `WALLET_PENDING_REQUEST` | MetaMask already has a pending request. | Wallet request pending | current provider chain if known | MetaMask reported a pending request. | Open MetaMask and finish or cancel the pending request. | warning | hidden | Connect Wallet | finish/cancel pending wallet prompt | duplicate wallet request, transfer submit | provider error `-32002` |
| `WALLET_REJECTED` | Wallet connection rejected. | Wallet connection rejected | `-` | User rejected the wallet request. | Retry when ready. | warning | hidden | Connect Wallet | retry connection | transfer submit | provider error `4001` |
| `WALLET_CONNECTED_READY` | Wallet connected | Wallet connected | Polygon | Address: short sender | Enter a recipient address and amount to begin. | none | visible/enabled | Send USDC | draft/review transfer | wrong-chain submit | `eth_accounts[0]` + `eth_chainId = 0x89` + live chain config |
| `WRONG_NETWORK` | Wrong network | Wrong network | detected network, e.g. Ethereum Mainnet | Wallet connected on unsupported network. | Switch MetaMask to Polygon Mainnet before sending USDC. | error | hidden/disabled | Switch to Polygon | request `wallet_switchEthereumChain` | transfer submit | `eth_chainId` |
| `UNSUPPORTED_TRANSFER_NETWORK` | Unsupported transfer network | Unsupported transfer network | configured but non-live network, e.g. Polygon Amoy | Wallet connected on a network without live transfers. | Switch MetaMask to Polygon Mainnet before sending USDC. | error | hidden/disabled | Switch to Polygon | request `wallet_switchEthereumChain` | transfer submit | `eth_chainId` + live chain config |
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

Configured but non-live chains, including Polygon Amoy without a deployed
contract, are `UNSUPPORTED_TRANSFER_NETWORK` in the production sender flow.

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
- wrong-network / unsupported-network state
- Switch to Polygon
- Switch Account
- Disconnect
- long MetaMask/provider guidance without truncation

If any of those are unavailable or unreadable on mobile, the wallet flow is not
release-ready.
