# Amoy Testnet Signoff Checklist

Last updated: 2026-05-09

## Purpose

Step-by-step execution checklist for the day POL lands and Amoy deployment
proceeds. Fill each evidence slot in sequence. Do not skip steps or combine
the two post-deploy chains.js commits.

Gate reference: `docs/operations/implicitex-launch-gate.md` Stage 2–4.

---

## Pre-Deploy Gate

Run these immediately before the deploy command. All must pass.

```bash
cd app-web
git status          # must be clean
npm test            # must show 42 passing
npx hardhat compile # must show Nothing to compile
npx hardhat run scripts/local_predeploy_check.js
```

Evidence:

```text
git status:          [ ] clean
npm test:            [ ] 42 passing
hardhat compile:     [ ] Nothing to compile
predeploy check:     [ ] PASS, feeBps == 100
deployer address:    [ ] 0xf614356F93408460b594AdDAcC86a7fC94310f1D
deployer balance:    [ ] >= 0.2 POL
treasury address:    [ ] [record public address — not deployer]
USDC address:        [ ] 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
treasury != deployer:[ ] confirmed
secrets committed:   [ ] none
```

---

## Step 1 — Deploy Contract

```bash
cd app-web
npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon-amoy
```

Record output here. Never print the private key.

```text
Date/time:           [                    ]
Contract address:    [                    ]
Deployer address:    [ ] 0xf614356F93408460b594AdDAcC86a7fC94310f1D
Deploy tx hash:      [                    ]
Explorer link:       [                    ]
Exit code:           [ ] 0
```

Deploy fails → stop. Do not update chains.js. Diagnose error before retrying.

---

## Step 2 — Insert Contract Address Only

Edit `app-web/frontend/public/config/chains.js`, chain 80002:

```javascript
contractAddress: '<address from Step 1>',
// transfersEnabled remains false — do not touch
```

```bash
git add app-web/frontend/public/config/chains.js
git commit -m "Set Amoy contract address after deploy"
git status  # must be clean
```

Evidence:

```text
contractAddress set:     [ ] confirmed
transfersEnabled:        [ ] false (unchanged)
commit hash:             [                    ]
working tree after:      [ ] clean
```

---

## Step 3 — UI Shows Preview Transfer

Open the frontend. Connect wallet on Amoy.

Expected observations:

```text
Network module shows:     [ ] Polygon Amoy
Contract address shows:   [ ] address from Step 1
Button label:             [ ] Preview Transfer  (not "Contract not deployed")
transferStateNote:        [ ] preview-mode copy visible
txPreview panel:          [ ] appears after entering recipient + amount
previewMode label:        [ ] "Preview · Transfers disabled"
transfersEnabled gate:    [ ] button does NOT submit a transaction
```

If button submits a real transaction at this step → STOP. Check
`transfersEnabled` in chains.js. It must be false.

---

## Step 4 — Read Contract Config from Frontend

With wallet connected on Amoy, verify the frontend reads live values.

Check browser console / Network module for:

```text
feeBasisPoints:     [ ] 100  (1.00%)
minTransferAmount:  [ ] [expected value in token units]
transferPrecision:  [ ] [expected value]
treasury address:   [ ] [expected treasury — matches deploy parameter]
paused:             [ ] false
contractAddress:    [ ] matches Step 1 address
```

If any value mismatches the deploy parameters → stop and diagnose before
proceeding.

---

## Step 5 — Enable Transfers (Testnet Only)

Only after Steps 1–4 pass. This is a separate commit from Step 2.

Edit `app-web/frontend/public/config/chains.js`, chain 80002:

```javascript
transfersEnabled: true,
```

```bash
git add app-web/frontend/public/config/chains.js
git commit -m "Enable transfers on Amoy after testnet UI signoff"
git status  # must be clean
```

Evidence:

```text
transfersEnabled set:    [ ] true for chain 80002 only
commit hash:             [                    ]
working tree after:      [ ] clean
```

This commit is the live-transfer gate for testnet. Do not combine with Step 2.

---

## Step 6 — Happy Path Smoke Test

Use the test sender wallet. Recipient must be a different address.

Transfer amount: smallest value above minTransferAmount that satisfies precision.

```bash
# Expected values (fill before sending)
sender:          [                    ]
recipient:       [                    ]
treasury:        [ ] [same as deploy parameter]
amount (USDC):   [                    ]
fee expected:    [amount * 0.01       ]
recipient gets:  [amount              ]
treasury gets:   [fee                 ]
```

After transaction confirms on-chain:

```text
tx hash:                  [                    ]
explorer link:            [                    ]
recipient balance change: [ ] matches expected
treasury balance change:  [ ] matches expected fee
TransferExecuted event:   [ ] visible on explorer
UI receipt / companion:   [ ] shows confirmed state
```

---

## Step 7 — Fee Routing Verified

From Step 6 explorer receipt, verify event fields:

```text
TransferExecuted:
  sender:       [ ] matches test sender
  recipient:    [ ] matches test recipient
  amountSent:   [ ] matches transfer amount
  feeAmount:    [ ] matches expected 1% fee
  totalDebited: [ ] amountSent + feeAmount
```

Treasury wallet balance on-chain:

```text
Before:   [                    ]
After:     [                    ]
Delta:     [ ] matches feeAmount
```

---

## Step 8 — Recipient Amount Verified

```text
Recipient wallet USDC balance:
  Before:   [                    ]
  After:     [                    ]
  Delta:     [ ] matches amountSent (no fee deducted from recipient)
```

---

## Step 9 — Pause Blocks Transfer

```bash
# Owner calls pause() on Amoy — use Hardhat task or direct contract write
npx hardhat run scripts/pause_contract.js --network polygon-amoy
```

With contract paused, attempt a transfer in the browser:

```text
Attempt result:     [ ] transaction reverts or UI blocks before submit
Error shown:        [ ] clear failure state — no silent success
transferWithFee:    [ ] rejected with Pausable: paused
```

Unpause after this step:

```bash
npx hardhat run scripts/unpause_contract.js --network polygon-amoy
```

```text
Unpause tx hash:    [                    ]
Contract paused:    [ ] false after unpause
```

---

## Step 10 — Negative Path Coverage

Minimum cases. Each must show a clear UI failure state, not silent success.

```text
Wrong network:          [ ] UI shows WRONG_NETWORK state
Invalid recipient:      [ ] form rejects non-address input
Zero address recipient: [ ] contract reverts
Amount below minimum:   [ ] contract reverts or form blocks
Invalid precision:      [ ] contract reverts or form blocks
Insufficient balance:   [ ] approval or transfer reverts gracefully
Approval rejected:      [ ] companion shows rejection, no funds moved
Transfer rejected:      [ ] companion shows rejection, no funds moved
```

---

## Signoff Record

Complete this section only after all steps above are checked.

```text
Date:                    [                    ]
Chain:                   Polygon Amoy / 80002
Contract address:        [                    ]
USDC address:            0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
Deployer:                0xf614356F93408460b594AdDAcC86a7fC94310f1D
Treasury:                [                    ]
Fee bps at signoff:      100
Paused at signoff:       false
Steps 1–10:              [ ] all passed
Signoff by:              [                    ]
```

Testnet signoff complete. Next gate: `docs/operations/implicitex-launch-gate.md`
Stage 5 (Production Readiness Gate).

---

## Hard Stops

Do not proceed past any step if:

- Deploy tx reverted or contract address is missing.
- UI still shows "Contract not deployed" after Step 2 commit.
- Button submits a transaction while `transfersEnabled` is false.
- Recipient delta does not match expected amount.
- Treasury delta does not match expected fee.
- `TransferExecuted` event fields do not match.
- Pause test does not block the transfer.
- Any negative-path test shows silent success.
- Working tree is not clean after either chains.js commit.
