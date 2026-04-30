# Testnet Predeploy Check (2026-04-30)

Documents the local predeploy check performed before any Polygon Amoy deployment.
No real network, RPC URL, private key, or address was involved.

---

## What was checked

`app-web/scripts/local_predeploy_check.js` was run against the default Hardhat
in-memory network. It:

1. Deployed `MockERC20` as a local USDC stand-in
2. Deployed `ImplicitExTransfer` using synthetic constructor values:
   - `feeBasisPoints`: 250 (2.5%)
   - `minTransferAmount`: 1,000,000 (1 USDC, 6 decimals)
   - `transferPrecision`: 1,000,000
   - `usdcAddress`: MockERC20 deployed above
   - `treasuryAddress`: local Hardhat signer[1]
3. Read back on-chain state and verified all six constructor invariants:

| Check | Result |
|---|---|
| `owner == deployer` | PASS |
| `feeBps == 250` | PASS |
| `minTransfer == 1000000` | PASS |
| `precision == 1000000` | PASS |
| `treasury == treasury signer` | PASS |
| `not paused` | PASS |

All checks passed. `config/chains.js` was not updated.

---

## Why this is local-only

- No `.env` file was created or loaded (dotenv reported: `injected env (0)`)
- No RPC provider URL was used
- No real private key was loaded
- No Polygon Amoy connection was made
- Hardhat in-memory network spins up and tears down within the script run
- Deployed addresses are ephemeral and meaningless outside this check

---

## What remains before Polygon Amoy deploy

- [ ] Testnet deployer wallet created and funded with MATIC
- [ ] `IMPLICITEX_DEPLOYER_KEY` set in local `.env` (never committed)
- [ ] `IMPLICITEX_RPC_URL_AMOY` set in local `.env` (never committed)
- [ ] All five deploy-param env vars set:
      `IMPLICITEX_USDC_ADDRESS`, `IMPLICITEX_TREASURY_ADDRESS`,
      `IMPLICITEX_INITIAL_FEE_BPS`, `IMPLICITEX_MIN_TRANSFER_AMOUNT`,
      `IMPLICITEX_TRANSFER_PRECISION`
- [ ] Testnet USDC address for Polygon Amoy confirmed from official source
- [ ] `npm test` passes all 36 tests immediately before deploy
- [ ] Testnet ops runbook skeleton written (see gate in
      `docs/architecture/testnet-readiness-plan-2026-04-30.md`)
- [ ] Deploy command:
      `npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon-amoy`
- [ ] Deployed address recorded and verified on block explorer
- [ ] `config/chains.js` updated with deployed address after review

---

## Relationship to deploy script

`local_predeploy_check.js` is a verification tool only. It does not replace
`deploy_implicitex_transfer.js` and is not used for the actual deploy. The
difference:

| | `local_predeploy_check.js` | `deploy_implicitex_transfer.js` |
|---|---|---|
| Network | Hardhat in-memory | Real network via `--network` flag |
| Values | Synthetic/hardcoded | From env vars |
| USDC | MockERC20 | Real USDC contract address |
| Purpose | Prove mechanics work locally | Actual deployment |
| Updates `chains.js` | No | No (manual step after) |
