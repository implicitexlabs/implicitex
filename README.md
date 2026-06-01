# ImplicitEx

Non-custodial USDC transfer platform. Sender wallet → recipient wallet. 1% platform fee. No custody. Polygon mainnet.

Operated by Aden Media Group LLC.

---

## Repository Map

```
implicitex/
├── app-web/                          Primary application
│   ├── frontend/public/              Web app (Firebase deploy root)
│   │   ├── index.html                Transfer interface
│   │   ├── config/chains.js          Chain config and transfer gates
│   │   ├── js/                       wallet.js, app.js, rehydrate.js
│   │   └── css/                      Styles
│   ├── contracts/                    Solidity contract source
│   ├── deployments/polygon.json      Deployed contract address
│   ├── scripts/                      Hardhat deploy/verify scripts
│   └── tests/                        Contract, web, and Python tests
│
├── docs/
│   ├── product/mvp-roadmap.md        Launch gate sequence and board
│   ├── attorney-review/              Attorney review package (Gate 3)
│   ├── operations/evidence/          Live smoke test evidence
│   ├── decisions/                    ADRs and decision log
│   └── architecture/                 Platform architecture docs
│
├── legacy-transfer/                  Archived historical materials (read-only)
├── desktop-python/                   Planned future surface (not started)
└── system/                           Infrastructure config
```

---

## Current Position

Gate 3 (legal/disclosure review). Live transfer smoke passed 2026-06-01 on Polygon mainnet.

```
Gate 1: Wallet + UI regression smoke         COMPLETE
Gate 2: Live-transfer readiness review       COMPLETE (2026-06-01)
Gate 3: Legal/disclosure review              current
Gate 4: Mainnet controlled live smoke
Gate 5: Public soft launch
```

Full roadmap: `docs/product/mvp-roadmap.md`

---

## Contract

- **Address:** `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0`
- **Network:** Polygon mainnet
- **Status:** Deployed, source-verified, smoke-tested
- **Deployment record:** `app-web/deployments/polygon.json`

---

## Deploy

Firebase hosting. Web root is `app-web/frontend/public/`.

```bash
firebase deploy --only hosting
```

---

## Archive Note

Two older GitHub repositories exist from earlier development phases:

- `implicitexlabs/implicitex-site` — superseded by this repo's `app-web/`
- `implicitexlabs/implicitex-contract` — contract source now canonical in `app-web/contracts/`

Both are archived and inactive. This repository (`implicitexlabs/implicitex`) is the active codebase.

---

## Development Attribution

ImplicitEx is developed and maintained by Aden Media Group LLC / ImplicitEx Labs. AI coding assistants may be used during development for drafting, review, refactoring, testing, and documentation support. All committed code, documentation, configuration, deployment records, and release decisions are reviewed, accepted, and owned by the project maintainer.
