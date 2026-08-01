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

## Settlement evidence — proof packets and historical record

### PP-01: Transfer-only path (2026-07-24) — canonical state-machine fix artifact

Exported byte-for-byte from the browser after a production transfer where the wallet held an
existing 3.03 USDC allowance established via a direct USDC contract call. No approval step
occurred. This is the canonical evidence that the `READY → SUBMITTING → SUBMITTED → CONFIRMED`
path works in production and that the metadata persistence fix is effective.

File: `transaction-proof-packet-transfer-only-2026-07-24.json`

Key fields:
- `approvalHash: null` — no approval step occurred
- `transactionHash: 0x0e0b3c1f2d0565663743050f43282e97501b3ee8505084fa5af823da00b1e15a`
- `blockNumber: 90780021`
- `fundsMoved: true`
- `purposeTag: "test"`, `referenceId: "TRANSFER-ONLY-001"`, `memo: "Production allowance verification"`

Post-transfer allowance confirmed at 2.020000 USDC (3.030000 − 1.010000).

### PP-02: Approval-path certification run (2026-07-24) — exact browser export

Exported byte-for-byte from the browser immediately after a dedicated approval-path
certification run. The wallet allowance was zeroed to 0 USDC before execution, forcing the
full `READY → AUTHORIZING → AUTHORIZED → SUBMITTING → SUBMITTED → CONFIRMED` lifecycle.
This is the canonical evidence that the approval-path execution branch produces a complete,
independently verifiable settlement record at the same artifact fidelity as PP-01.

File: `transaction-proof-packet-approval-2026-07-24.json`

Key fields:
- `approvalHash: 0x115647e9ec9cab18e1bd422a68d5fd4216383fa240b58eb02f53e44274a7f428`
- `transactionHash: 0x48c07f8039d50754a20c1b32ee701fa042fcb4bbeabd8d01ab0164805c5faa78`
- `blockNumber: 90784121`
- `status: "confirmed"`, `fundsMoved: true`
- `purposeTag: "test"`, `referenceId: "APPROVAL-PATH-002"`, `memo: "Production approval-path artifact verification"`

Original download: `implicitex-proof-0x48c07f8039.json` (2491 bytes)
SHA-256: `ae91d64b50d20b28df8c9bcd8bd2ecfac595f872b7c65cfbd1bb98bd2ffdbf7a`
Modified: 2026-07-24T08:21:02 (browser export timestamp)
Repository copy: byte-for-byte identical (`cmp` verified)

Setup evidence (not the portal approval):
- Allowance-reset tx: `0x85b7f6c6557c225e562ac5e0b0ceb9a3af8db0ded7e638d61e348abdc99f31c8`
  Block 90,783,869 — reduced allowance from 2.020000 USDC to 0 before certification run

Independent chain verification (2026-07-24):
- Approval tx (`0x115647...`): targets USDC contract, selector `0x095ea7b3`, spender = ImplicitEx contract, amount = 1.010000 USDC, status = success; Blockaid warning reproduced
- Transfer tx (`0x48c07f...`): targets ImplicitEx contract, status = success, block 90,784,121, 4 logs
- Post-transfer allowance: 0.000000 USDC — full 1.01 USDC consumed

### Historical record: Original Blockaid-observed approval-path transaction (2026-07-23)

Covered by Figures 1–12. Documents the first-time-user flow that produced the Blockaid
spending-cap warning (Figure 8) and established the initial evidence for this review.
The original browser-exported proof packet for this transaction was not preserved at time
of export; the chain record is independently verifiable on Polygonscan.

- `transactionHash: 0x07ff5d031ecc553edb6648f05169413715bc1a80fec46bb04910366ff2077a57`
- `approvalHash: 0xb137bebac424d6f39630c00938776f1397450a0c531523432052aa57d001f7fb`
- `blockNumber: 90776572`
- `fundsMoved: true`
- Evidence: Figures 1–12; Polygonscan; §7.7.1 transaction table in the review packet
- Artifact gap: original browser JSON not preserved — browser export not found at time of PP-02 collection

## Source-file handling

The source screenshots remain unchanged in the Desktop `transaction-flow`
folder. The confirmed source set contains 12 PNG files with 12 distinct
SHA-256 hashes; all 12 are represented in this inventory.
