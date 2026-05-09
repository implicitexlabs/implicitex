# Deploy Artifact Record — TEMPLATE

Copy this file to:
  `docs/operations/deployments/<network>-<YYYY-MM-DD>.md`

Fill every field from deploy output and on-chain verification.
Commit after verification is confirmed. Never commit private keys,
RPC URLs, or API keys.

---

## Deployment Summary

```text
Date (UTC):          [YYYY-MM-DD HH:MM]
Network:             [Polygon Amoy / Polygon Mainnet]
Chain ID:            [80002 / 137]
Environment:         [testnet / mainnet]
```

---

## Contract

```text
Contract name:       ImplicitExTransfer
Solidity version:    0.8.24
Compiler settings:   default optimizer (see hardhat.config.js)
Contract address:    [0x...]
Deploy tx hash:      [0x...]
Deploy block number: [      ]
Explorer link:       [https://amoy.polygonscan.com/address/0x...]
```

---

## Constructor Arguments

These must match `scripts/verify_args.js` at time of deploy.

```text
usdcAddress:          [0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582]
treasuryAddress:      [0x...] — treasury role label: [           ]
initialFeeBps:        [100]   — 1.00%
initialMinTransfer:   [     ] — [    ] USDC (in atomic units, 6 decimals)
initialPrecision:     [     ] — [    ] USDC (in atomic units, 6 decimals)
```

---

## Wallet Roles

```text
Deployer address:     [0xf614356F93408460b594AdDAcC86a7fC94310f1D]
Deployer role:        testnet admin / contract owner
Treasury address:     [0x...]
Treasury role:        platform fee recipient
Treasury ≠ deployer:  [ ] confirmed
```

---

## On-Chain State at Deploy

Read from contract immediately after deploy. Cross-check against constructor args.

```text
owner():              [0x...]
treasury():           [0x...]
feeBasisPoints():     [100]
minTransferAmount():  [    ]
transferPrecision():  [    ]
paused():             [false]
```

---

## Source Verification

```text
Verification tool:    hardhat-verify v2.1.3 / polygonAmoy
Verification command:
  cd app-web
  CONTRACT_ADDRESS=0x... npx hardhat verify \
    --network polygon-amoy \
    --constructor-args scripts/verify_args.js \
    $CONTRACT_ADDRESS

Verification status:  [ ] submitted  [ ] confirmed  [ ] failed
Explorer verify link: [https://amoy.polygonscan.com/address/0x...#code]
Source visible:       [ ] yes
ABI visible:          [ ] yes
Compiler match:       [ ] yes
```

If verification fails, record the error and resolution:

```text
Error:                [                    ]
Resolution:           [                    ]
Retry result:         [                    ]
```

---

## Post-Deploy Checks

These must be completed before proceeding to chains.js address insertion.

```text
[ ] Contract address recorded in this artifact
[ ] Deploy tx hash recorded
[ ] Block number recorded
[ ] Constructor args match verify_args.js
[ ] On-chain state cross-checked against constructor args
[ ] Source verified on explorer
[ ] Explorer shows matching source and ABI
[ ] verify_args.js updated with real values and committed
[ ] This artifact file committed (no secrets)
[ ] Signoff checklist Step 1 evidence slots filled
```

---

## Notes

Record any anomalies, retries, or deviations from the standard runbook here.

```text
[none]
```

---

## Authorization

```text
Deployed by:          [Antoine Dennison]
Reviewed by:          [                ]
Artifact committed:   [YYYY-MM-DD]
```
