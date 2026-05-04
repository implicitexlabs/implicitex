# app-web/scripts

Deploy and maintenance scripts for ImplicitExTransfer.

---

## deploy_implicitex_transfer.js

Hardhat deploy script for the `ImplicitExTransfer` contract.

**This script is not run automatically.** It must be invoked explicitly after all
testnet pre-deploy gates in `docs/architecture/testnet-readiness-plan-2026-04-30.md`
are satisfied.

### How to run

```
cd app-web
npx hardhat run scripts/deploy_implicitex_transfer.js --network <network>
```

`<network>` must be a network configured in `hardhat.config.js`. No network
configuration exists in this repo yet — see the testnet readiness plan for the
gate that must be passed before adding it.

### Required environment variables

Set these locally before running. **Never commit these values to the repo.**

| Variable | Description |
|---|---|
| `IMPLICITEX_USDC_ADDRESS` | USDC token contract address on the target network |
| `IMPLICITEX_TREASURY_ADDRESS` | Address that receives fee payments |
| `IMPLICITEX_INITIAL_FEE_BPS` | Fee in basis points (e.g. `250` = 2.5%; max `1000`) |
| `IMPLICITEX_MIN_TRANSFER_AMOUNT` | Minimum transfer in USDC atomic units (6 decimals) |
| `IMPLICITEX_TRANSFER_PRECISION` | Transfer precision divisor in atomic units |

A deploy key and env vars must live in `.private/` or in the shell environment —
never in this repo.

### After a successful deploy

1. Record the deployed contract address printed in the deploy summary.
2. Verify the contract on the block explorer.
3. Update `frontend/public/config/chains.js` only after review and verification.
4. Run the testnet signoff checklist before setting `transfersEnabled: true`.

Do not commit raw Hardhat artifacts (`artifacts/`, `cache/`) — those are gitignored.
The only artifact that belongs in the repo after a deploy is the chain config update.
