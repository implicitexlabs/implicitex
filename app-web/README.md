# app-web

Primary application surface for ImplicitEx. Contains the web frontend, smart contract, deploy scripts, and tests.

## Structure

```
app-web/
├── frontend/public/          Web app — Firebase deploy root
│   ├── index.html            Transfer interface (entry point)
│   ├── config/chains.js      Chain configuration and transfer gates
│   ├── js/
│   │   ├── wallet.js         Wallet connection, transfer flow, state machine
│   │   ├── walletconnect-provider.js   WalletConnect / Reown integration
│   │   ├── app.js            UI orchestration
│   │   └── rehydrate.js      Receipt rehydration on page load
│   ├── css/                  Styles
│   ├── legal.html            Legal disclosures
│   ├── privacy.html          Privacy policy
│   └── jurisdictions.html    Jurisdiction availability
├── contracts/                Solidity contract source
│   └── implicitex_transfer.sol   Hardened transfer contract with fee routing
├── deployments/
│   └── polygon.json          Deployed contract address and metadata
├── scripts/                  Hardhat deploy and verify scripts
├── tests/                    Contract and frontend observability tests
├── backend/python/           Placeholder for future Python services
└── hardhat.config.js         Hardhat project config
```

## Contract

- **Deployed:** `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0` (Polygon mainnet)
- **Tests:** `npx hardhat test` from this directory
- **Deploy network flag:** `--network polygon-amoy` (testnet) or `--network polygon` (mainnet)

## Frontend Deploy

Web root is `frontend/public/`. Deploy via Firebase from the repo root:

```bash
firebase deploy --only hosting
```

## Transfer Gate

`frontend/public/config/chains.js` controls `transfersEnabled`. This gate is closed by default and opened only for controlled smoke testing. Never deploy with the gate open unless a smoke session is actively in progress.
