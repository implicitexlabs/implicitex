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
Required env vars present locally: PENDING
Secrets committed: no
Deployer has Amoy MATIC: PENDING
Predeploy checks run: PENDING
Deploy authorization: not granted
```

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
npx hardhat compile: no errors
local_predeploy_check: PASS all checks
npm run check:static: pass
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
