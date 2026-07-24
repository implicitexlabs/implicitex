# Transaction Flow Screenshot Inventory

**Application:** ImplicitEx Transfer Portal<br>
**Capture date:** 2026-07-23<br>
**Network:** Polygon (chain ID 137)<br>
**Asset:** USDC<br>
**Scenario:** 1.00 USDC transfer with a 0.01 USDC platform fee<br>
**Observed total debit / spending cap:** 1.01 USDC<br>
**Outcome:** Confirmed on-chain — block 90,776,572 — funds moved

These screenshots document the observed transaction flow from portal
initialization through on-chain confirmation. The Blockaid warning is one
observed event within the ERC-20 approval stage. The filenames are stable
figure identifiers and should be used when the images are referenced from
the packet.

## Lifecycle represented

1. Portal loaded
2. Wallet connection
3. Recipient validation
4. Fee calculation
5. User confirmation
6. ERC-20 approval request
7. Observed Blockaid warning
8. Transfer transaction broadcast
9. On-chain confirmation
10. Activity record (CONFIRMED)
11. Proof packet (confirmed state)

| Figure | File | What the screenshot establishes |
|---:|---|---|
| 1 | `01-portal-ready-wallet-disconnected.png` | The portal loaded, Polygon network data was available, and the wallet had not yet been connected. |
| 2 | `02-metamask-connect-request.png` | MetaMask displayed an explicit connection request for `portal.implicitex.com`. |
| 3 | `03-wallet-connected-form-empty.png` | The sender connected. The portal loaded an 11.12 USDC balance and the transfer form became active. |
| 4 | `04-recipient-entered-validated.png` | The recipient address was entered and passed format validation ("Format valid"). |
| 5 | `05-amount-entered-fee-calculated.png` | A 1.00 USDC amount produced a 0.010000 USDC platform fee (1%). |
| 6 | `06-all-fields-complete.png` | All transfer fields (amount, purpose, reference, memo) were populated before execution review. |
| 7 | `07-confirmation-checked-execute-ready.png` | Checking the acknowledgement enabled Execute Transfer. |
| 8 | `08-blockaid-spending-cap-warning.png` | MetaMask displayed the Blockaid warning during the ERC-20 approval step and showed an exact 1.01 USDC spending cap. |
| 9 | `09-confirmed-transfer-right-panel.png` | The portal companion panel displayed receipt IX-07FF5D03 as CONFIRMED with TX hash and block 90,776,572. |
| 10 | `10-companion-tray-telemetry-confirmed.png` | The companion tray confirmed the settled state. The telemetry panel recorded the contract and USDC addresses. |
| 11 | `11-activity-tab-confirmed-receipt.png` | The Activity tab recorded receipt IX-07FF5D03 as CONFIRMED: "Transfer confirmed. Funds moved on Polygon." |
| 12 | `12-polygonscan-onchain-confirmation.png` | Polygonscan confirmed the `transferWithFee()` call: status Success, block 90,776,572, 1.00 USDC ERC-20 transfer to recipient. |

## Observed approval-stage warning

Figure 8 documents the wallet behavior under review and also shows that the
requested spending cap equals the disclosed transaction economics:

```text
1.00 USDC transfer
0.01 USDC platform fee
----------------------
1.01 USDC spending cap
```

Recommended caption:

> During the ERC-20 approval step, MetaMask displayed a Blockaid warning. The
> warning indicated "This is a deceptive request." The approval requested an
> exact spending cap of 1.01 USDC, matching the disclosed transfer amount
> (1.00 USDC) plus the platform fee (0.01 USDC). The subsequent transfer
> transaction was confirmed on-chain at block 90,776,572 with funds moved.

The screenshot establishes that the warning appeared and that MetaMask
displayed a 1.01 USDC cap. It does not, by itself, establish why Blockaid
assigned the classification.

## Settlement confirmation

Figure 12 and the exported proof packet establish confirmed settlement:

- `status: confirmed`
- `blockNumber: 90776572`
- `fundsMoved: true`
- `transactionHash: 0x07ff5d031ecc553edb6648f05169413715bc1a80fec46bb04910366ff2077a57`

The confirmed-state export is preserved as
`transaction-proof-packet-confirmed-2026-07-23.json`.

## Source-file handling

The source screenshots remain unchanged in the Desktop `transaction-flow`
folder. The confirmed source set contains 12 PNG files with 12 distinct
SHA-256 hashes; all 12 are represented in this inventory.
