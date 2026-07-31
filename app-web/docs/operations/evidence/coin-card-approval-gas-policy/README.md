# Polygon fork gas evidence matrix

## Purpose

This directory contains evidence for later review of Coin Card approval and
`transferWithFee` gas behavior. It does not define, select, or integrate a
production gas policy or fixed gas limit.

The canonical raw artifact is `polygon-fork-gas-evidence.json`. The original
single-smoke draft remains at
`docs/operations/evidence/polygon-fork-sequential-smoke-checkpoint-draft-2026-07-16.json`
and is marked superseded while preserving its results and provenance.

## Safety model

- The upstream Polygon provider was supplied command-locally and used only for
  chain, block, code, storage, call, and fork-state reads.
- Its explicit allowlist contained no transaction-submission, impersonation,
  balance-mutation, snapshot, or revert method.
- Both `eth_sendTransaction` and `eth_sendRawTransaction` were rejected before
  transport as regression checks.
- All impersonation, local native balance funding, snapshots, reverts,
  estimation, transaction submission, receipt reads, and state validation used
  the certified in-process Hardhat provider.
- The local guard required Hardhat provider object identity, network identity,
  client identity, metadata instance identity, local chain ID `31337`, and the
  expected source fork identity before sender-capable actions.
- No private key, signing key, token storage mutation, live transaction, or
  deployment was used.

## Source state versus local execution

Transaction execution did not occur in either source-state block.

| Source | Source block | Source hash | Local execution start | Local hash | Local base fee |
|---|---:|---|---:|---|---:|
| Checkpoint pin | 90357660 | `0x58957b1e043b07b47b2c6a2ff141ed2678e8c6555b6ccd5be914b319b41633d9` | 90357661 | `0x6352ffb6ed7fd74b07d663585d78fd86e26e314d1e2c97e0e09e5c0004b1605b` | 239038935085 |
| Independent historical | 89853052 | `0x50e58d60eda6924c6a80f196963353b15f584384a117c21271b254f29175eeef` | 89853053 | `0xba03ead47b7f0446813dfa4b442b1552471f1670a94548639a7b2c86d536db32` | 234048606301 |

Hardhat materializes prefunded local accounts when it mines the empty successor,
so the global state root changes. Before scenario setup, the harness separately
compared both runtime bytecodes, recognized proxy slots, token metadata,
execution fee/configuration calls, and relevant actor and treasury balances and
allowances. Those relevant values matched exactly across the source state and
empty local successor.

## Deployment epoch gate

Both source blocks matched exactly for:

- USDC proxy address and runtime identity;
- recognized ZeppelinOS proxy implementation address and runtime identity;
- execution-contract address and runtime identity;
- configured USDC, treasury, fee basis points, minimum amount, transfer
  precision, and paused state.

The results therefore belong to one deployment epoch. The execution contract
showed no recognized proxy evidence.

## Methodology

Each source block was hard-reset independently. Each canonical scenario then:

1. started from the same clean local snapshot;
2. established payer balance, recipient balance class, and allowance through
   normal deployed-USDC transfers and approvals;
3. constructed requests through the current `IX_EXECUTION` request builder;
4. estimated only on the certified local provider;
5. used that estimate as the harness-only submitted transaction gas limit;
6. confirmed approval before estimating a dependent transfer;
7. validated receipt status, token deltas, and allowance behavior;
8. reverted the snapshot and verified payer/recipient balance and allowance
   restoration; and
9. repeated the scenario a second time from the same clean state.

The public holder candidates came from bounded deployed-USDC `Transfer` logs.
The selected address at each source block was balance-checked, impersonated only
locally for one normal funding transfer, locally funded with native gas, and
then stopped. USDC storage slots were never changed.

## Scenario matrix

| Path | Amounts | Allowance | Payer balance | Recipient state |
|---|---|---|---|---|
| Approval required | 1, 125, 250 USDC; 1.005001 USDC | zero | exact or excess | zero or nonzero |
| Approval replacement | 125 and 250 USDC | nonzero insufficient | exact or excess | zero or nonzero |
| Transfer only | 1, 125, and 250 USDC | exact | exact or excess | zero or nonzero |
| Transfer only | 1, 125, and 250 USDC | greater | exact or excess | zero or nonzero |

There were 12 scenarios × 2 repetitions × 2 source blocks = 48 represented
raw repetitions. All 24 same-block scenario pairs were identical.

## Findings

### Approval

- Maximum estimate: `55882`.
- Maximum actual gas used: `55449`.
- Zero-to-nonzero approval range: estimate `55870–55882`, actual
  `55437–55449`.
- Nonzero-to-nonzero replacement: estimate `38648`, actual `38349`.
- Estimate-to-actual headroom: `299–433`.
- Estimate spread: `17234`; actual spread: `17100`.

Polygon USDC permitted direct nonzero-to-nonzero replacement in all eight
middle/maximum gate repetitions. The one-step `APPROVE_THEN_TRANSFER` allowance
replacement semantics therefore passed this architecture gate; no zero-reset
flow was substituted.

### Transfer

- Maximum estimate: `106099`, produced by transfer-only greater allowance,
  middle amount, zero recipient balance, and exact payer balance.
- Maximum actual gas used: `100439`, produced by transfer-only greater
  allowance, maximum amount, zero recipient balance, and excess payer balance.
- Minimum estimate: `88356`; minimum actual: `73739`.
- Estimate-to-actual headroom: `5207–14903`.
- Estimate spread: `17743`; actual spread: `26700`.

The values were identical at both source blocks. Storage transitions materially
affected gas: recipient zero/nonzero state, payer exact/excess state, and whether
allowance cleared to zero or retained a nonzero remainder all produced distinct
profiles.

## Six-decimal amount finding

For `1.005001` USDC, fee calculation produced raw fee `10050`, total debit
`1015051`, and division remainder `100`; the fee therefore used integer-floor
truncation. Approval succeeded, but every transfer estimate deterministically
reverted with `InvalidTransferPrecision` because deployed transfer precision is
`1000000`.

No transfer was submitted after the failed estimate. This makes the current
six-decimal transfer case invalid for the deployed configuration and must be
resolved before a complete production gas policy can cover that advertised
amount class. This evidence phase does not change eligibility or runtime logic.

## Candidate later-review margin methods

No method is selected or adopted here.

1. **Percentage plus fixed reserve:** as an illustration only, 20% above the
   maximum estimate plus 5,000 produces approval `72059` and transfer `132319`.
   This scales with observed cost and preserves an explicit fixed reserve, but
   it is materially more conservative and requires justification for both
   components.
2. **Next integer boundary:** rounding each maximum estimate to the next 10,000
   boundary produces approval `60000` and transfer `110000`. This is simpler to
   audit, but the chosen boundary is arbitrary and transfer headroom would be
   much narrower.

These are comparison methods for later human review, not production limits.

## Limitations

- The invalid six-decimal transfer has no transfer estimate, submitted gas
  limit, receipt, or actual gas observation.
- Two historical source blocks and deterministic local repetitions do not cover
  future deployment epochs, proxy upgrades, fee changes, provider changes, or
  all possible storage distributions.
- Hardhat metadata instance IDs are deliberately run-specific; gas and state
  equality checks exclude only generation timestamps and those IDs.
- The matrix used provider estimates as harness-only transaction limits. It did
  not alter production requests.

## Reproduction

From `app-web`, provide an approved read-only Polygon endpoint through a
command-local placeholder and ensure no deployer key enters the process:

```bash
env -u IMPLICITEX_DEPLOYER_KEY \
  IMPLICITEX_RPC_URL_POLYGON='<approved-read-only-polygon-endpoint>' \
  npx hardhat test --no-compile \
  --config tests/fork/hardhat.polygon-smoke.config.js \
  tests/fork/polygon-gas-evidence-matrix.test.js
```

Do not add a live network flag. The run must report one passing matrix test,
identity-matched source blocks, 48 represented repetitions, zero unexpected
estimate/execution discrepancies, eight successful nonzero replacement runs,
and four retained `InvalidTransferPrecision` estimate failures.
