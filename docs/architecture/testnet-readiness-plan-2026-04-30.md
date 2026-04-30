# Testnet Readiness Plan (2026-04-30)

Planning document only. No deployment addresses, RPC URLs, API keys, network
config, or frontend transaction wiring. This document defines what must exist
before a controlled testnet deployment can proceed.

---

## Current position

The contract is OpenZeppelin-hardened and has 36 passing local Hardhat tests.
No deployment has occurred. No network configuration exists. The frontend runs
in demo mode only. Real transfer execution is disabled.

---

## 1. Required chain configuration structure

Before testnet deployment, a chain configuration file must exist that maps:

- Network name (e.g. `polygon-amoy`, `base-sepolia`)
- Chain ID
- USDC token address for that network (testnet USDC contract)
- Deployed ImplicitEx contract address (to be filled after deploy)
- Block explorer base URL (for receipt links)

This config must be:
- A static JSON or JS module, not hardcoded inline in wallet logic
- Checked into the repo only after secrets have been removed
- Structured so that swapping testnet → mainnet is a config change, not a code change
- Absent of API keys or RPC provider URLs (those go in `.private/` or environment)

**Gate:** Config structure defined and reviewed before any address is filled in.

---

## 2. Deploy artifact expectations

Hardhat deployment produces artifacts the frontend needs. Before testnet deploy:

- Decide: Hardhat Ignition scripts or legacy `scripts/deploy.js` pattern
- Define where compiled artifacts land (`app-web/artifacts/`) and confirm
  that path is gitignored
- Define how the deployed contract address flows from deploy output into
  the chain config file (manual update or scripted)
- Define what gets committed after a deploy: chain config update only,
  not raw Hardhat artifacts

**Gate:** Deploy script skeleton exists and artifact flow is documented before
any `npx hardhat ignition deploy` or equivalent is run.

---

## 3. Frontend config gate

The frontend currently has no contract address and no chain config. Before
wiring real execution:

- A config module must exist at a defined path (e.g.
  `app-web/frontend/public/config/chains.json` or equivalent)
- `wallet.js` must read contract address and USDC address from that config,
  not from hardcoded constants
- The config module must be the only place these addresses appear in runtime
- A missing or malformed config must produce a clear UI error state, not a
  silent failure

**Gate:** Config module structure defined and `wallet.js` updated to read from
it before any testnet address is inserted.

---

## 4. Testnet ops runbook skeleton

Before deploying to testnet, the following must be written (even as stubs):

- **Who deploys:** which wallet/key is used for the initial deploy
- **Treasury address:** which address receives fees on testnet (can be a
  personal test address; must not be the owner key)
- **Initial parameters:** `feeBasisPoints`, `minTransferAmount`,
  `transferPrecision` for testnet deploy
- **Pause procedure:** who can pause and under what conditions on testnet
- **Ownership:** whether owner key is a personal EOA or multisig on testnet
  (multisig preferred even for testnet to build the habit)
- **Key storage:** where the deploy key lives; confirm it is not in the repo

**Gate:** Runbook skeleton exists in `docs/product/` before deploy key is used.

---

## 5. Testnet signoff criteria

A testnet deployment is only "done" when these pass:

- [ ] Contract deployed to target testnet; address recorded in chain config
- [ ] `npm test` still passes 36+ tests against local Hardhat network
- [ ] Manual smoke test: connect wallet on testnet, switch to correct network
- [ ] Manual smoke test: approve USDC allowance for ImplicitEx contract
- [ ] Manual smoke test: `transferWithFee` executed with test USDC, recipient
      receives correct amount, treasury receives correct fee
- [ ] Manual smoke test: pause contract, confirm transfer is blocked
- [ ] Manual smoke test: unpause, confirm transfer resumes
- [ ] Block explorer confirms contract is verified (optional for testnet,
      required for production)
- [ ] Frontend demo button triggers full approve → transfer flow end to end
      without silent failures

**Gate:** All criteria checked off before testnet is called done and before
any production planning begins.

---

## 6. What this plan explicitly defers

The following are out of scope for this testnet readiness plan and must not
be added until testnet signoff is complete:

- Mainnet deployment addresses
- Mainnet RPC providers or API keys
- Production multisig setup
- Fee governance policy (timelock or DAO)
- External audit engagement
- Public frontend launch

---

## 7. Recommended branch sequence after this plan

```
testnet-config-structure-2026-04-30
  → define chain config module, update wallet.js to read from it
  → no real addresses yet

testnet-deploy-script-2026-04-30
  → Hardhat Ignition or deploy script skeleton
  → no deploy executed yet

testnet-deploy-<date>
  → actual deploy, address recorded in chain config
  → runbook followed

testnet-frontend-wiring-<date>
  → wire approve + transferWithFee in frontend behind a feature flag
  → testnet addresses only

testnet-signoff-<date>
  → all signoff criteria checked
  → branch merges only after checklist is complete
```

Each branch should merge into main only after its stated gate is satisfied.
