# Amoy Deploy Parameter Evidence

Date: 2026-05-04

## Purpose

This record prepares the required Polygon Amoy deployment inputs before any
deploy command is run.

This is a preparation record only. It does not authorize deployment, chain
configuration changes, browser transaction wiring, or live transfer enablement.

## Scope

Allowed in this lane:

- Confirm required environment variable names.
- Confirm deployer wallet address.
- Confirm deployer wallet has Amoy MATIC.
- Confirm treasury address.
- Confirm treasury differs from deployer.
- Confirm trusted testnet USDC address source.
- Record intended deploy parameters.
- Record whether required values are present locally.

Forbidden in this lane:

- No deploy command.
- No `chains.js` edit.
- No frontend transaction wiring.
- No approval or allowance flow.
- No `transfersEnabled` toggle.

## Network

```text
Network: Polygon Amoy
Chain ID: 80002
Hardhat network name: polygon-amoy
```

## Required Environment Variables

These values must exist locally in `app-web/.env` or the shell environment
before a deploy command may be run. They must not be committed.

```text
IMPLICITEX_DEPLOYER_KEY
IMPLICITEX_RPC_URL_AMOY
IMPLICITEX_USDC_ADDRESS
IMPLICITEX_TREASURY_ADDRESS
IMPLICITEX_INITIAL_FEE_BPS
IMPLICITEX_MIN_TRANSFER_AMOUNT
IMPLICITEX_TRANSFER_PRECISION
```

Optional before testnet verification, required before production verification:

```text
ETHERSCAN_API_KEY
```

## Parameter Record

Fill this section before requesting deploy authorization.

```text
Network: Polygon Amoy
Deployer address: PENDING
Treasury address: PENDING
Treasury differs from deployer: PENDING
USDC test token address: PENDING
Source used to verify USDC address: PENDING
Fee bps: 250
Min transfer: PENDING
Transfer precision: PENDING
Required env vars present locally: no
Secrets committed: no
Deployer has Amoy MATIC: PENDING
Predeploy checks run: pass for local-only checks
Deploy authorization: not granted
```

## Local Env Name Check

The local `app-web/.env` file contains the expected variable names, but the
required deployment values are empty as of this record.

Observed status:

```text
ETHERSCAN_API_KEY: empty
IMPLICITEX_DEPLOYER_KEY: empty
IMPLICITEX_INITIAL_FEE_BPS: empty
IMPLICITEX_MIN_TRANSFER_AMOUNT: empty
IMPLICITEX_RPC_URL_AMOY: empty
IMPLICITEX_RPC_URL_POLYGON: empty
IMPLICITEX_TRANSFER_PRECISION: empty
IMPLICITEX_TREASURY_ADDRESS: empty
IMPLICITEX_USDC_ADDRESS: empty
```

No private key, RPC URL, API key, or secret value was printed or committed.

## Current Blockers

Amoy deployment preparation is blocked until the following are supplied and
reviewed locally:

- `IMPLICITEX_DEPLOYER_KEY`
- `IMPLICITEX_RPC_URL_AMOY`
- `IMPLICITEX_USDC_ADDRESS`
- `IMPLICITEX_TREASURY_ADDRESS`
- `IMPLICITEX_INITIAL_FEE_BPS=250`
- `IMPLICITEX_MIN_TRANSFER_AMOUNT`
- `IMPLICITEX_TRANSFER_PRECISION`

After values are supplied, derive and record only public addresses and boolean
checks. Never print or commit the private key or RPC URL.

## Required Predeploy Checks

Run immediately before any deploy authorization decision:

```bash
cd app-web
npm test
npx hardhat compile
npx hardhat run scripts/local_predeploy_check.js
npm run check:static
```

Required observed results:

```text
npm test: 36 passing
npx hardhat compile: Nothing to compile
local_predeploy_check: PASS all checks, feeBps == 250
npm run check:static: Static public check passed (62 local references checked)
```

## Deployment Stop Conditions

Do not deploy if any of the following are true:

- `git status` is not clean.
- Any required env var is missing.
- Any secret or private key appears in a tracked file.
- Deployer address is unknown.
- Treasury address is unknown.
- Treasury equals deployer without explicit written exception.
- Deployer does not have Amoy MATIC.
- Testnet USDC address is unverified.
- Any predeploy check fails.
- There is uncertainty about wallet, network, token, treasury, or fee settings.

## Authorization

Deploy authorization status:

```text
NOT GRANTED
```

This document must be updated with concrete, reviewed values and passing
predeploy evidence before any Amoy deploy command may be run.
