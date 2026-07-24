# Transaction Flow Screenshot Inventory

**Application:** ImplicitEx Transfer Portal<br>
**Capture date:** 2026-07-23<br>
**Network:** Polygon (chain ID 137)<br>
**Asset:** USDC<br>
**Scenario:** 5.00 USDC transfer with a 0.05 USDC platform fee<br>
**Observed total debit / spending cap:** 5.05 USDC

These screenshots document the observed transaction flow from portal
initialization through submission. The Blockaid warning is one observed event
within the ERC-20 approval stage. The filenames are stable figure identifiers
and should be used when the images are referenced from the packet.

## Lifecycle represented

1. Portal loaded
2. Wallet connection
3. Recipient validation
4. Fee calculation
5. User confirmation
6. ERC-20 approval request
7. Observed Blockaid warning
8. Transfer transaction request
9. Transaction submission
10. Activity record
11. Proof packet

| Figure | File | What the screenshot establishes |
|---:|---|---|
| 1 | `01-portal-ready-wallet-disconnected.png` | The portal loaded, Polygon network data was available, and the wallet had not yet been connected. |
| 2 | `02-metamask-unlock.png` | MetaMask requested a local wallet unlock before connection. |
| 3 | `03-metamask-connect-request.png` | MetaMask displayed an explicit connection request for `portal.implicitex.com`. |
| 4 | `04-wallet-connected-balance-loaded.png` | The sender connected and the portal loaded a 16.17 USDC balance. |
| 5 | `05-recipient-valid.png` | The recipient was entered and passed the portal's format validation. |
| 6 | `06-amount-and-fee-calculated.png` | A 5.00 USDC amount produced a 0.050000 USDC platform fee. |
| 7 | `07-transfer-details-complete.png` | The transfer details were populated before execution review. |
| 8 | `08-execution-confirmation-unchecked.png` | The explicit confirmation checkbox appeared and Execute Transfer remained disabled while it was unchecked. |
| 9 | `09-execution-confirmation-checked.png` | Checking the confirmation enabled Execute Transfer. |
| 10 | `10-blockaid-warning-exact-spending-cap.png` | MetaMask displayed the Blockaid warning during the ERC-20 approval step and showed an exact 5.05 USDC spending cap. |
| 11 | `11-metamask-transfer-request.png` | After the approval step, MetaMask displayed the separate transfer request, identifying Polygon, `portal.implicitex.com`, the ImplicitEx contract, and an estimated 5.05 USDC debit. |
| 12 | `12-activity-transfer-submitted.png` | The portal recorded the 5.00 USDC transfer as submitted and awaiting confirmation. |

## Observed approval-stage warning

Figure 10 documents the wallet behavior under review and also shows that the
requested spending cap equals the disclosed transaction economics:

```text
5.00 USDC transfer
0.05 USDC platform fee
----------------------
5.05 USDC spending cap
```

Recommended caption:

> During the ERC-20 approval step, MetaMask displayed a Blockaid warning. The
> warning indicated "This is a deceptive request." The approval requested an
> exact spending cap of 5.05 USDC, matching the disclosed transfer amount
> (5.00 USDC) plus the platform fee (0.05 USDC). The subsequent transfer
> request and transaction broadcast proceeded normally.

The screenshot establishes that the warning appeared and that MetaMask
displayed a 5.05 USDC cap. It does not, by itself, establish why Blockaid
assigned the classification.

## Settlement-status caution

Figure 12 and the exported proof packet describe this transaction as
`submitted`, with no confirmed block number or confirmed funds-moved result at
the time of capture. Until a successful on-chain receipt is recorded, describe
the transaction as **submitted** or **broadcast**, not **confirmed** or
**settled**.

The submitted-state export is preserved as
`transaction-proof-packet-submitted-2026-07-23.json`. Once final confirmation
is observed, regenerate the proof packet so that it records:

- `status: confirmed`
- a non-null `blockNumber`
- a non-null `resolvedAt`
- `fundsMoved: true`

## Source-file handling

The source screenshots remain unchanged in the Desktop `transaction-flow`
folder. The refreshed source set contains 12 PNG files with 12 distinct
SHA-256 hashes; all 12 are represented in this inventory.
