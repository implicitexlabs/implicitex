# ImplicitEx Polygon Mainnet Deployment Evidence

Date: 2026-05-22  
Lane: deployment execution only  
Status: deployed; Safe ownership accepted; source verified

## Deploy Candidate Identity

### `git status --short`

```text

```

Result: clean worktree.

### `git rev-parse HEAD`

```text
32de64926639574072bab415516aefd37a06a091
```

### `git log --oneline -10`

```text
32de649 Refresh transfer preview before wallet prompt
64033a2 Document transfer validation taxonomy
cc1c197 Fix app shell icon references
e10e488 Refine transaction companion states
9b553b6 Harden receipt persistence states
0d14f14 Harden deployment ownership gate
493ed63 Add transfer observability assets
dab29a1 Document transfer execution risks
91a37fc Harden transfer contract errors
eab660c Clarify transfer debit UX
```

### `git stash list --max-count=3`

```text
stash@{0}: On polish-transfer-instrument: pending companion telemetry release-doc polish
```

## Verification Already Captured

```text
npm test
npm run check:static
npm run test:observability
node scripts/local_predeploy_check.js
```

Result:

```text
All passed.
npm test: 59 passing.
local_predeploy_check: owner == deployer locally, feeBps == 100, minTransfer == 1000000, precision == 1000000, treasury == treasury signer, not paused.
```

Note: `local_predeploy_check.js` uses Hardhat in-memory local signers and is not the Polygon mainnet deployment ceremony.

## Deployment Gate Requirements

Before running Polygon deployment:

```text
target network = Polygon
owner != deployer
owner != treasury
fee <= 100 bps
clean deployer wallet confirmed
deployer funded for Polygon gas
treasury address confirmed
owner address confirmed
```

## Deployment Gate Preview

### Local environment gate

Command: read-only environment validation; private key not printed.

```text
=== Polygon deployment gate preview ===
target network: Polygon (chainId 137)
deployer: 0x5466bbA8cD334554c88F81342dDfcEc4c4A7698B
owner: 0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97
treasury: 0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
usdc: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
feeBps: 100
owner != deployer: PASS
owner != treasury: PASS
treasury != deployer: PASS
fee <= 100 bps: PASS
```

### Wallet registry alignment

Registry checked:

```text
Aden Media Group LLC - Wallet Registry
Last updated: 2026-05-22
```

Result:

```text
deployer matches current candidate deployer wallet
owner matches current Safe / owner wallet target
treasury matches current treasury wallet
retired deployer-associated wallet is not used
legacy treasury wallet is not used
```

### Polygon funding and provenance signals

Read-only Polygon RPC balance check:

```text
network: Polygon (chainId 137)
deployer: 0x5466bbA8cD334554c88F81342dDfcEc4c4A7698B
deployer POL balance: 40.0
deployer USDC balance: 0.0
deployer tx count: 0

owner: 0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97
owner POL balance: 10.0
owner USDC balance: 0.0
owner tx count: 0

treasury: 0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
treasury POL balance: 5.0
treasury USDC balance: 0.0
treasury tx count: 0
```

The deployer nonce and token balance are consistent with a newly funded deploy
wallet on Polygon: funded with POL, no USDC, and no prior Polygon transactions.
This is a technical signal only; it does not by itself prove wallet creation
history or personal-use history.

Operator-only assertion still required:

```text
clean deployer wallet provenance confirmed by operator
owner address is intended owner / Safe / multisig target
treasury address is intended fee recipient
```

Gate decision:

```text
technical address/funding checks: PASS
operator provenance/intention assertions: CONFIRMED BEFORE DEPLOY
```

## Deployment Execution

Command:

```bash
npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon
```

Result:

```text
DEPLOYMENT COMPLETE
Network: polygon (137)
Timestamp: 2026-05-22T20:27:50.300Z
Deployer: 0x5466bbA8cD334554c88F81342dDfcEc4c4A7698B
Owner target: 0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97
Treasury: 0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
Fee: 100 bps (1.00%)
Min transfer: 1000000
Precision: 1000000
Contract: 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
```

Manifest:

```text
app-web/deployments/polygon.json
```

Transaction hashes:

```text
deploy tx: 0x87593fdb3d256a4a94b3e73877ba0bc433c39e81eefc78334af6da79ff5ef1f3
ownership transfer tx: 0xd84181dbffbd4f760cfa650b2a1edb1acc17713e66bb5d6d478376dc5202d777
ownership acceptance tx: 0xd6bfb2876725391c956dbd17ec5f774f9246b50df5667e8b29e8c78305365e90
```

Explorer links:

```text
contract: https://polygonscan.com/address/0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
deploy tx: https://polygonscan.com/tx/0x87593fdb3d256a4a94b3e73877ba0bc433c39e81eefc78334af6da79ff5ef1f3
ownership transfer tx: https://polygonscan.com/tx/0xd84181dbffbd4f760cfa650b2a1edb1acc17713e66bb5d6d478376dc5202d777
ownership acceptance tx: https://polygonscan.com/tx/0xd6bfb2876725391c956dbd17ec5f774f9246b50df5667e8b29e8c78305365e90
```

## Post-Deploy Chain State

Read-only Polygon RPC check:

```text
network: Polygon (chainId 137)
blockNumber: 87282958
contract: 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
owner: 0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97
pendingOwner: 0x0000000000000000000000000000000000000000
usdc: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
treasury: 0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
feeBps: 100
minTransfer: 1000000
precision: 1000000
paused: false
deployTxStatus: 1
deployBlock: 87281124
ownershipTransferTxStatus: 1
ownershipTransferBlock: 87281125
ownershipAcceptanceBlock: 87282714
```

## Source Verification

Command:

```bash
npx hardhat verify --network polygon 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919 100 1000000 1000000
```

Result:

```text
The contract 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 has already been verified on the block explorer.
```

Verified source:

```text
https://polygonscan.com/address/0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0#code
```

Owner status:

```text
Ownership transfer completed.
The Safe at 0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97 is current owner.
pendingOwner is zero.
```

Frontend gate:

```text
app-web/frontend/public/config/chains.js points chainId 137 at 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0.
Global transfersEnabled remains false.
Polygon transfersEnabled remains false.
```

## Boundary

No product, frontend, or Solidity changes are authorized in this lane. The preserved stash must remain unapplied until after deployment evidence is captured.
