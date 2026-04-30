# Testnet Network Configuration Plan (2026-04-30)

Planning document only. No RPC URLs, API keys, private keys, provider tokens,
contract addresses, or USDC addresses. This document defines how Hardhat network
configuration will be added to the project without ever committing secrets or
live values to the repository.

---

## Current state

`app-web/hardhat.config.js` currently has no `networks` key. It compiles and
tests against the default Hardhat in-memory network only. No testnet connection
is possible until this plan is implemented.

---

## 1. Required environment variables

The following variables must exist in the local shell or in a gitignored file
before network configuration can function. None of them belong in the repo.

| Variable | Purpose | Notes |
|---|---|---|
| `IMPLICITEX_DEPLOYER_KEY` | Private key for the deploy wallet | Never committed; EOA for testnet only |
| `IMPLICITEX_RPC_URL_AMOY` | RPC provider URL for Polygon Amoy testnet | Provider-issued; treat as secret |
| `IMPLICITEX_RPC_URL_POLYGON` | RPC provider URL for Polygon mainnet | Reserved; not used until production gate |
| `ETHERSCAN_API_KEY` | Polygonscan/Etherscan API key for contract verification | Optional at testnet; required before production |

These join the five deploy-param variables already defined in
`docs/architecture/testnet-deploy-artifact-flow-2026-04-30.md`.

---

## 2. How hardhat.config.js should read them

`hardhat.config.js` should read these variables from `process.env` at config
load time. The `dotenv` package is the standard mechanism for loading a local
`.env` file into `process.env` before Hardhat reads the config.

Planned shape:

```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const deployerKey = process.env.IMPLICITEX_DEPLOYER_KEY;
const rpcAmoy     = process.env.IMPLICITEX_RPC_URL_AMOY;
const rpcPolygon  = process.env.IMPLICITEX_RPC_URL_POLYGON;

module.exports = {
  solidity: "0.8.24",
  paths: {
    sources: "./contracts",
    tests:   "./tests",
    cache:   "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    "polygon-amoy": {
      url:      rpcAmoy || "",
      accounts: deployerKey ? [deployerKey] : [],
      chainId:  80002
    },
    "polygon-mainnet": {
      url:      rpcPolygon || "",
      accounts: deployerKey ? [deployerKey] : [],
      chainId:  137
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  }
};
```

Key properties of this shape:
- Missing env vars produce empty strings / empty arrays, not a thrown error. The
  config loads cleanly for local `npm test` without any env vars set.
- The local Hardhat network (used by `npm test`) remains the default; adding
  `networks` does not affect it.
- The deployer key is never accessed unless `--network` is explicitly passed to
  a Hardhat command.

---

## 3. Variables that must never be committed

The following must not appear in any tracked file at any point:

- `IMPLICITEX_DEPLOYER_KEY` (or any private key or seed phrase)
- `IMPLICITEX_RPC_URL_AMOY`
- `IMPLICITEX_RPC_URL_POLYGON`
- `ETHERSCAN_API_KEY`
- Any `.env` file containing live values

The `.gitignore` already excludes `.env` and `.env.*`. Confirm this remains true
before adding any `.env` file locally.

---

## 4. Whether .env.example should exist

Yes. A `.env.example` file at `app-web/.env.example` should be committed to the
repo with placeholder values only. It documents which variables are expected
without supplying any real values. It must not be renamed `.env` before review.

Planned content:

```
# Copy to .env and fill in real values locally. Never commit .env.
IMPLICITEX_DEPLOYER_KEY=0x<PRIVATE_KEY>
IMPLICITEX_RPC_URL_AMOY=https://<YOUR_RPC_PROVIDER>/polygon-amoy/<KEY>
IMPLICITEX_RPC_URL_POLYGON=https://<YOUR_RPC_PROVIDER>/polygon-mainnet/<KEY>
ETHERSCAN_API_KEY=<POLYGONSCAN_API_KEY>

# Deploy params — also read by deploy_implicitex_transfer.js
IMPLICITEX_USDC_ADDRESS=0x<TESTNET_USDC_ADDRESS>
IMPLICITEX_TREASURY_ADDRESS=0x<TREASURY_ADDRESS>
IMPLICITEX_INITIAL_FEE_BPS=100
IMPLICITEX_MIN_TRANSFER_AMOUNT=1000000
IMPLICITEX_TRANSFER_PRECISION=1000000
```

---

## 5. Whether dotenv should be installed

Yes. `dotenv` should be added as a dev dependency:

```
cd app-web
npm install --save-dev dotenv
```

`dotenv` is a dev dependency only — it is not needed in the frontend runtime
or by any deployed artifact. It is called in `hardhat.config.js` only.

---

## 6. How deployer private key should be handled

For testnet:
- A dedicated testnet-only EOA wallet is created for deployments.
- The private key lives in `.private/secrets/` (gitignored) or in the shell
  environment only.
- It is never the same key used for any mainnet activity or as the treasury.
- It is never pasted into `.env.example` or any committed file.
- Ownership of the deployed contract may be transferred to a multisig after
  initial deploy (see testnet ops runbook skeleton gate in
  `docs/architecture/testnet-readiness-plan-2026-04-30.md`).

For production (not in scope for this plan):
- A hardware wallet or multisig is required for the deploy key.
- This is a separate gate and is explicitly deferred.

---

## 7. How testnet deploy artifacts should be recorded

As defined in `docs/architecture/testnet-deploy-artifact-flow-2026-04-30.md`:

- Raw Hardhat artifacts (`app-web/artifacts/`, `app-web/cache/`) are gitignored
  and are never committed.
- The only artifact that flows into the repo after a deploy is a single update to
  `app-web/frontend/public/config/chains.js`, adding the deployed address under
  the correct `supportedChains` entry.
- That update is committed in its own branch (`testnet-deploy-<date>`) after
  the deployed address has been reviewed and verified on the block explorer.

---

## 8. Safety checks before any deployment

The following must pass before running the deploy script against a live network:

1. `npm test` passes all tests against the local Hardhat network immediately
   before the deploy command is run.
2. All five deploy-param env vars are set and validated (the deploy script does
   this automatically).
3. `IMPLICITEX_DEPLOYER_KEY` is set and the deployer wallet is funded.
4. `IMPLICITEX_RPC_URL_AMOY` is set and reachable.
5. A dry-run of the deploy script against the local Hardhat network confirms no
   compilation or parameter errors.
6. The testnet ops runbook skeleton in `docs/product/` has been written (gate
   defined in `testnet-readiness-plan-2026-04-30.md`).

---

## 9. What remains blocked until this plan is approved

The following cannot proceed until the network config implementation branch
(successor to this plan branch) is reviewed and merged:

- Running the deploy script against any live network
- Contract verification on any block explorer
- Any testnet signoff checklist items

The deploy script (`app-web/scripts/deploy_implicitex_transfer.js`) exists and
is correct, but `npx hardhat run ... --network polygon-amoy` will fail until
`hardhat.config.js` defines the `polygon-amoy` network entry.

---

## Implementation branch

When this plan is approved, the next branch is:

```
testnet-network-config-impl-<date>
```

That branch will:
- Install `dotenv` as a dev dependency
- Create `app-web/.env.example` with placeholder values
- Update `app-web/hardhat.config.js` to read network config from env vars
- Confirm `npm test` still passes 36 tests
- Confirm no real values are committed

It will not run any deployment.
