# Initial Roadmap

Last updated: 2026-05-22

## Current MVP Readiness Snapshot

Estimated MVP readiness: 88-92%.

ImplicitEx is no longer in the idea phase. The MVP has a hardened transfer
contract, a live Polygon transfer UI, local receipt persistence, deployment
evidence, wallet role separation, and funded operational wallets. The remaining
work is deployment execution, ownership acceptance, production evidence capture,
and real-wallet QA.

Current posture:

- Contract lane: closed / frozen.
- Frontend execution-safety lane: closed.
- Product-change lane: closed.
- Deployment lane: active.
- Preserved polish stash: do not apply before deployment evidence is complete.

Deployable code identity:

```text
32de649 Refresh transfer preview before wallet prompt
```

Deployment evidence was captured in a docs-only commit on top of deployable
code:

```text
59e5187 Capture Polygon mainnet deployment evidence
```

## MVP Wallet And Funding State

| Role | Address | Current readiness |
|---|---|---|
| Deployer | `0x5466bbA8cD334554c88F81342dDfcEc4c4A7698B` | Funded for deploy and verification; 40.0 POL observed. |
| Governance wallet | `0x6d6232f653f5DD765017F12647435c2122F3F6B8` | Identified and funded for governance/Safe operational use; 5.0 POL observed. |
| Safe / owner | `0x776A0D6b9F96445A38303F56d5B923e6d1FF8E97` | Intended owner target; 10.0 POL observed. |
| Treasury | `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919` | Intended fee recipient; 5.0 POL observed. |
| Operations | `0xFfEe63C73C082Da41Ec2ceB315aEd61ef192B616` | Operational reserve; 15.0 POL and 75.0 native Polygon USDC observed. |

Native Polygon USDC reserve:

```text
Operations Wallet: 75.0 USDC
Governance, Safe/owner, deployer, and treasury: 0.0 USDC observed.
```

## Remaining MVP Gates

### Deployment execution

- Confirm clean deployer provenance by operator.
- Confirm Safe / owner address is the intended owner target.
- Confirm treasury address is the intended fee recipient.
- Add small POL reserve to governance wallet.
- Run Polygon deployment:

```bash
npx hardhat run scripts/deploy_implicitex_transfer.js --network polygon
```

### Post-deploy evidence

- Record deployed contract address, deployment tx hash, constructor args, owner,
  pendingOwner, treasury, fee, min transfer, precision, paused state, and
  explorer links.
- Verify source on Polygonscan.
- Confirm `owner()` and `pendingOwner()` state.
- Have the Safe / owner accept ownership.
- Record final owner and pending owner state after acceptance.

### Controlled production smoke

- Update frontend config only after deployment evidence is reviewed.
- Run one low-value USDC smoke transfer.
- Verify sender debit, recipient credit, treasury fee, and contract USDC balance
  remains zero.
- Capture receipt, explorer link, and frontend state.

### Real-wallet QA

- Desktop MetaMask: connect, wrong network, approval, transfer, rejection, and
  refresh recovery.
- Mobile MetaMask browser or mobile wallet path: same minimum flow.
- Confirm fee, total debit, and receipt visibility on mobile and low-resolution
  laptop screens.

### Legal and operating boundary

- Attorney review remains required before public production transfer promotion.
- Jurisdiction language remains platform policy, not a legal authorization claim.
- Keep max transfer capped at 250 USDC until written promotion checklist passes.

## Stage 1 - Online Transfer MVP

- Define product scope for the online tool. Status: complete for MVP.
- Capture transfer flow requirements. Status: complete for MVP.
- Establish implementation baseline. Status: complete for MVP.
- Harden contract routing, fee cap, ownership, pause, and no-owner-drain policy.
  Status: complete.
- Prove controlled live transfer path. Status: prototype proven; fresh clean
  deployment pending.

## Stage 2 - Operational Reliability

- Fully realize online platform functionality. Status: mostly complete for MVP.
- Stabilize operations, reliability, and usability. Status: final deployment
  evidence and real-wallet QA pending.
- Maintain clear role separation between deployer, Safe/owner, treasury,
  governance, operations, and test wallets.
- Prove operational reliability with a small number of controlled production
  transfers before expanding limits.

## Stage 3 - Desktop Resource

- Plan desktop resource based on proven online patterns.
- Begin Electron desktop implementation after online maturity.
- Introduce desktop-only UX improvements without rebuilding core product logic.
- Do not start this stage until the web transfer MVP has clean production
  evidence.

## Stage 4 - Hardware Wallet And Security Expansion

- Begin Ledger hardware wallet integration only after web and Electron are stable.
- Implement controlled hardware-signing flows and UX hardening.
- Integrate AuditWalk as a complementary security tool for risk visibility and
  trust support.
- Evaluate Safe/timelock/governance hardening after MVP proof, not during the
  deployment execution lane.
