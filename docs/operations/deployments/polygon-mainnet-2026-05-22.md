# ImplicitEx Polygon Mainnet Deployment Evidence

Date: 2026-05-22  
Lane: deployment execution only  
Status: deploy candidate identity captured

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

### Deployer funding check

Read-only Polygon RPC balance check:

```text
deployer: 0x5466bbA8cD334554c88F81342dDfcEc4c4A7698B
deployer POL balance: 40.0
```

Operator-only assertion still required:

```text
clean deployer wallet provenance confirmed by operator
owner address is intended owner / Safe / multisig target
treasury address is intended fee recipient
```

Deployment command, only after the gate passes:

```bash
npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon
```

## Boundary

No product, frontend, or Solidity changes are authorized in this lane. The preserved stash must remain unapplied until after deployment evidence is captured.
