# Testnet Deploy Runbook (Polygon Amoy) (2026-04-30)

Defines the exact manual ceremony for deploying ImplicitExTransfer to Polygon
Amoy testnet. No real values are documented here. All secrets stay outside the
repo, in `.private/secrets/` or the local shell only.

This runbook is followed once for each testnet deploy attempt. Do not skip steps.

---

## 1. Pre-deploy prerequisites

All of the following must be true before the runbook begins. If any are not
satisfied, stop and resolve them first.

- [ ] `git status` is clean — no uncommitted changes, no untracked secrets
- [ ] `git pull origin main` is current — HEAD matches origin/main
- [ ] `npm test` passes all 36 tests against local Hardhat network
- [ ] `npx hardhat run scripts/local_predeploy_check.js` passes all 6 checks
- [ ] Deploy wallet (testnet-only EOA) has been created and is recorded in
      `.private/secrets/` only — private key never in the repo
- [ ] Deploy wallet is funded with testnet MATIC on Polygon Amoy (faucet or
      transfer from another testnet wallet)
- [ ] Testnet USDC address for Polygon Amoy has been confirmed from the official
      Circle or testnet source — do not guess or derive this address
- [ ] Treasury address for testnet has been decided — must not be the deploy key
      address; a personal test address is acceptable for testnet
- [ ] Deploy wallet is NOT the same address as the treasury

---

## 2. Required local-only .env values

The following variables must be set in `app-web/.env` before running preflight
or deploy commands. This file is gitignored and must never be committed.

```
IMPLICITEX_DEPLOYER_KEY=
IMPLICITEX_RPC_URL_AMOY=
IMPLICITEX_USDC_ADDRESS=
IMPLICITEX_TREASURY_ADDRESS=
IMPLICITEX_INITIAL_FEE_BPS=
IMPLICITEX_MIN_TRANSFER_AMOUNT=
IMPLICITEX_TRANSFER_PRECISION=
```

Suggested testnet starting values (adjust if needed; these are not enforced
here — the deploy script enforces the fee cap):

| Variable | Suggested testnet value |
|---|---|
| `IMPLICITEX_INITIAL_FEE_BPS` | `250` (2.5%) |
| `IMPLICITEX_MIN_TRANSFER_AMOUNT` | `1000000` (1 USDC, 6 decimals) |
| `IMPLICITEX_TRANSFER_PRECISION` | `1000000` (1 USDC granularity) |

`ETHERSCAN_API_KEY` (Polygonscan) is optional at this stage but must be set
before contract verification.

---

## 3. Preflight commands

Run in order. All must pass before the deploy command is run.

```bash
cd app-web

# 3a. Full test suite against local network
npm test

# 3b. Compile contracts (confirms no Solidity errors before touching Amoy)
npx hardhat compile

# 3c. Local deploy mechanics check (no network, no real key)
npx hardhat run scripts/local_predeploy_check.js
```

Expected outputs:
- `npm test`: `36 passing`
- `npx hardhat compile`: `Nothing to compile` or `Compiled N Solidity files`
  with no errors
- `local_predeploy_check.js`: `=== Predeploy check passed ===` with all 6 PASS

If any preflight command fails or produces unexpected output, stop. Do not
proceed to the deploy command until the cause is understood and resolved.

---

## 4. Deploy command

Run only after all preflight checks pass.

```bash
cd app-web
npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon-amoy
```

The script will:
1. Validate all required env vars are present and correctly formatted
2. Print a redacted deployment summary (deployer, partial addresses, params)
3. Deploy the contract and wait for confirmation
4. Print the deployed contract address
5. Print next-step instructions

Save the full terminal output. The deployed contract address will be needed for
post-deploy verification and config update.

---

## 5. Post-deploy verification

After the deploy command completes, verify the following before doing anything
else. All checks must pass.

Use a block explorer (Polygon Amoy: `https://amoy.polygonscan.com`) or a
read-only Hardhat script to confirm each value.

- [ ] Deployed contract address is visible on Amoy block explorer
- [ ] `owner()` returns the deploy wallet address (not treasury, not zero)
- [ ] `treasury()` returns the expected treasury address
- [ ] `feeBasisPoints()` returns the value set in `IMPLICITEX_INITIAL_FEE_BPS`
- [ ] `minTransferAmount()` returns the value set in
      `IMPLICITEX_MIN_TRANSFER_AMOUNT`
- [ ] `transferPrecision()` returns the value set in
      `IMPLICITEX_TRANSFER_PRECISION`
- [ ] `paused()` returns `false`
- [ ] Contract source is verified on block explorer (optional for testnet;
      required before production — see contract verification step below)

If any on-chain value does not match expectations: pause the contract (see
Section 8) and do not update `config/chains.js`.

### Contract verification (optional at testnet, required before production)

```bash
cd app-web
npx hardhat verify --network polygon-amoy \
  <DEPLOYED_ADDRESS> \
  <USDC_ADDRESS> <TREASURY_ADDRESS> <FEE_BPS> <MIN_TRANSFER> <PRECISION>
```

Requires `ETHERSCAN_API_KEY` to be set in `.env`.

---

## 6. Artifact capture policy

After a successful deploy and post-deploy verification:

**What can be committed to the repo:**
- An update to `app-web/frontend/public/config/chains.js` adding the deployed
  address under `supportedChains` — in a separate branch (see Section 7)

**What must remain local only:**
- The full terminal output of the deploy command (contains the deployed address
  and deployer address; keep in `.private/` or a local notes file)
- `app-web/.env` (gitignored; never commit)
- Raw Hardhat artifacts: `app-web/artifacts/`, `app-web/cache/` (gitignored)
- Deploy wallet private key

**What belongs in `docs/operations/` only after redaction:**
- A post-deploy record (deployed address, block number, tx hash, date) with
  private key and RPC URL redacted — document what was deployed, not how to
  access it

---

## 7. Config update gate

`app-web/frontend/public/config/chains.js` remains unchanged until all of the
following are true:

- [ ] Post-deploy verification (Section 5) passed in full
- [ ] Contract is visible on block explorer
- [ ] No unexpected on-chain state
- [ ] Decision to enable frontend transfers has been made deliberately

The config update must be made in a separate, dedicated branch:

```
testnet-deploy-<date>
```

That branch updates `chains.js` only: adds the deployed address under the
correct `supportedChains` entry. It does not set `transfersEnabled: true` — that
is a subsequent, separate decision after the testnet signoff checklist in
`docs/architecture/testnet-readiness-plan-2026-04-30.md` is complete.

---

## 8. Emergency rollback / pause response

If any issue is found after deploy — unexpected on-chain state, wrong parameter,
suspicious transaction, or any uncertainty:

1. **Pause the contract immediately.** The deploy wallet (contract owner) calls
   `pause()`. This blocks all `transferWithFee` calls.

   ```bash
   # Example via Hardhat console (replace address):
   cd app-web
   npx hardhat console --network polygon-amoy
   > const c = await ethers.getContractAt("ImplicitExTransfer", "<DEPLOYED_ADDRESS>")
   > await c.pause()
   ```

2. **Do not update `config/chains.js`.** Frontend transfers are already disabled
   and must stay that way.

3. **Do not attempt to resume** until the issue is understood and documented.

4. **Document the incident** in `docs/operations/` describing what was observed,
   what was done, and what the resolution path is.

5. If the contract is unrecoverable (wrong treasury, unacceptable params):
   redeploy from scratch following this runbook from Step 1. The old contract
   address is abandoned — record it in the incident doc as a known-bad address.

---

## 9. Stop conditions

Stop the runbook and do not proceed to the deploy command if any of the
following are true:

- [ ] `npm test` fails any test
- [ ] `local_predeploy_check.js` fails any check
- [ ] `npx hardhat compile` produces any error
- [ ] `git status` shows uncommitted changes or untracked `.env` / secrets
- [ ] Any required env var is missing or empty
- [ ] The deploy wallet address is the same as the treasury address
- [ ] The deploy wallet has insufficient MATIC for gas
- [ ] Deployed contract `owner()` does not match the deploy wallet
- [ ] Any post-deploy on-chain value does not match the expected value
- [ ] The block explorer does not show the contract within a reasonable time
- [ ] Any uncertainty about which wallet, which key, or which network is in use

When in doubt: stop, do not deploy, document the question, resolve it first.

---

## Related documents

- `docs/architecture/testnet-readiness-plan-2026-04-30.md` — overall testnet
  gate criteria; signoff checklist
- `docs/architecture/testnet-deploy-artifact-flow-2026-04-30.md` — artifact
  flow from deploy output to config update
- `docs/architecture/testnet-network-config-plan-2026-04-30.md` — env var and
  hardhat.config.js design decisions
- `docs/architecture/testnet-predeploy-check-2026-04-30.md` — local predeploy
  check results
- `app-web/scripts/deploy_implicitex_transfer.js` — the deploy script
- `app-web/scripts/local_predeploy_check.js` — the local verification script
