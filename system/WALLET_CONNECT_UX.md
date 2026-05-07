# ImplicitEx Wallet Connect UX

Last updated: 2026-05-07

Purpose: define the product rule for connecting a sender wallet versus entering
a recipient wallet address. This keeps ImplicitEx aligned with familiar crypto
UX and avoids making the connect action look like a custom login or address
collection form.

## Core Distinction

```text
Connect Wallet != type a wallet address
Send To Wallet = type or paste recipient address
```

In normal crypto UX, "Connect Wallet" means the user authorizes the site to read
their public wallet address through a wallet provider such as MetaMask, Coinbase
Wallet, WalletConnect, or a hardware wallet routed through compatible wallet
software.

The connect action should not ask the user to manually type their own wallet
address as the primary connection path.

## Product Rule

```text
CONNECT WALLET opens a wallet-provider modal.
It does not ask for a typed wallet address.
It does not navigate immediately.
It unlocks the transfer interface after wallet approval.
```

Recipient entry belongs in the transfer form:

```text
Recipient wallet address
```

## Recommended Flow

1. User clicks `CONNECT WALLET`.
2. User chooses wallet provider.
3. Wallet asks permission.
4. ImplicitEx reads the connected public address.
5. App verifies chain/network.
6. Transfer module unlocks.
7. User enters recipient address.
8. User enters USDC amount.
9. App shows fee, recipient, treasury, gas, token, network, and total-debit
   details.
10. User approves USDC if needed.
11. User confirms transfer.
12. App shows receipt.

## Connect Modal

The `CONNECT WALLET` button should open an in-place modal or dropdown, not
navigate to a new page.

Suggested content:

```text
Connect your wallet

Primary options:
- MetaMask
- Coinbase Wallet
- WalletConnect
- Ledger / Hardware Wallet guidance

Secondary:
- I do not have a wallet yet
- Learn about self-custody
```

## Button States

### Not Connected

```text
CONNECT WALLET
```

Click opens the wallet-provider modal.

### Connecting

```text
CONNECTING...
```

Disable repeat clicks while connection is pending.

### Connected on Correct Network

```text
0x82f4...91c2
```

or:

```text
CONNECTED
0x82f4...91c2
```

Click opens an account dropdown:

```text
Account
0x82f4...91c2

Network: Polygon
Balance: 122.50 USDC

Options:
- Copy address
- View on explorer
- Disconnect
```

### Connected on Wrong Network

```text
WRONG NETWORK
```

Click opens a network action:

```text
Switch to Polygon
```

## Transfer Form

The transfer form should contain recipient entry and amount entry. The connect
button should not double as an address field.

Suggested form:

```text
Recipient wallet address
[ 0x... ]

Amount
[ 100.00 USDC ]

Fee
1.00 USDC

Recipient receives
99.00 USDC

Treasury receives
1.00 USDC
```

For the current sender-pays-fee contract model, update the labels to avoid
ambiguity:

```text
Recipient receives
100.00 USDC

Platform fee
1.00 USDC

Total debit
101.00 USDC
```

Use the contract-read fee mode as the source of truth if fee modes change.

## Page State

The app should not hard-navigate or reload the page immediately after the user
clicks `CONNECT WALLET`.

Preferred behavior:

```text
Before connect:
Hero + explanation + CONNECT WALLET

After connect:
Same page, transaction panel becomes active
```

The URL may optionally become `/transfer`, but a hard page reload should not be
required. State-based UI comes first.

## Ledger / Hardware Wallet Guidance

Do not build a special Ledger-only path first.

Most Ledger users connect through MetaMask, Coinbase Wallet, Ledger Live,
WalletConnect, or similar wallet-provider flows. The initial ImplicitEx modal
can treat Ledger as guidance:

```text
Using Ledger?
Connect your Ledger through MetaMask, Coinbase Wallet, or WalletConnect.
```

Later, if Ledger-specific integration becomes valuable, build a stronger
hardware-wallet lane.

## Risks This Avoids

- Users typing their own wallet address and thinking they are connected.
- Blurring public address, connected signer, recipient address, and private
  credentials.
- Creating an unfamiliar flow that feels suspicious to experienced crypto users.
- Making beginners believe a public address entry is equivalent to wallet
  authorization.
- Accidentally training users to paste sensitive wallet information into forms.

## Implementation Notes

- The current runtime already has recipient validation in the transfer module.
- The connect path should remain provider-driven.
- Wallet connection should happen only after explicit user action.
- Recipient address validation should remain strict and separate from connected
  signer state.
- Approval UI should include allowance education before the wallet prompt.
- Hardware-wallet guidance belongs in the connect modal and help copy before any
  dedicated hardware integration is attempted.

## Related Documents

- `docs/contracts/transaction-execution-contract.md`
- `docs/decisions/wallet-behavior-audit-2026-04-30.md`
- `system/TODO.md`
- `system/ARENA_MAP.md`
