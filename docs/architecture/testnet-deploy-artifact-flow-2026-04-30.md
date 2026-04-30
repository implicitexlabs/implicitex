# Testnet Deploy Artifact Flow (2026-04-30)

Planning document only. No deployment addresses, RPC URLs, API keys, network
config, or provider credentials. This document describes the intended flow from
pre-deploy environment setup through post-deploy config update.

---

## Overview

The deploy script at `app-web/scripts/deploy_implicitex_transfer.js` exists but
is not run automatically. This document describes the steps that surround running
it so that the deployed address flows safely into the frontend config without
secrets or raw artifacts entering the repo.

---

## Pre-deploy checklist

Before running the deploy script, the following must be true:

- [ ] Hardhat network config exists in `hardhat.config.js` for the target testnet
      (gate: this config does not exist yet — it is the next step after this branch)
- [ ] Deploy wallet is funded with testnet MATIC (or equivalent native gas token)
- [ ] Testnet USDC address for the target network is confirmed from the official source
- [ ] Treasury address for testnet is decided (personal test address acceptable;
      must not be the deploy key address)
- [ ] All five required env vars are set in the local shell or `.private/`:
      `IMPLICITEX_USDC_ADDRESS`, `IMPLICITEX_TREASURY_ADDRESS`,
      `IMPLICITEX_INITIAL_FEE_BPS`, `IMPLICITEX_MIN_TRANSFER_AMOUNT`,
      `IMPLICITEX_TRANSFER_PRECISION`
- [ ] Deploy key is confirmed to not be in the repo
- [ ] `npm test` passes 36 tests against local Hardhat network immediately before deploy

---

## Deploy step

```
cd app-web
npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon-amoy
```

(Network name subject to what is configured in `hardhat.config.js` at deploy time.)

The script prints a deployment summary with a redacted address preview and
next-step instructions. The full deployed contract address is printed at the end.

---

## Artifact handling

Hardhat produces compiled artifacts under `app-web/artifacts/` and cache under
`app-web/cache/`. Both paths are gitignored.

**Do not commit these directories.**

The only artifact that flows into the repo after a deploy is the chain config
update in `frontend/public/config/chains.js`.

---

## Post-deploy flow

1. **Record the deployed address** from the deploy summary output.

2. **Verify the contract on the block explorer.**
   For Polygon Amoy: `https://amoy.polygonscan.com`
   Verification command (once `hardhat.config.js` includes verification config):
   ```
   npx hardhat verify --network polygon-amoy <DEPLOYED_ADDRESS> <constructor args>
   ```

3. **Update `frontend/public/config/chains.js`** with the deployed address
   under the correct `supportedChains` entry. Shape reference: `config/chains.example.js`.
   The update to `chains.js` is the only commit that comes out of a deploy.

4. **Run the testnet signoff checklist** from
   `docs/architecture/testnet-readiness-plan-2026-04-30.md` before setting
   `transfersEnabled: true`.

5. **`transfersEnabled: true`** is set in `chains.js` only after the signoff
   checklist is complete — not at deploy time.

---

## What does NOT enter the repo at any point

- Deploy key or wallet seed phrase
- RPC provider URL or API key
- Alchemy / Infura / QuickNode credentials
- Raw Hardhat artifacts (`artifacts/`, `cache/`)
- Testnet USDC address hardcoded anywhere except `chains.js` (after deploy)
- Any value from `.private/secrets/`
