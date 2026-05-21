# ImplicitEx — Transfer Observability

Transfer observability is ImplicitEx's local-first layer for explaining,
verifying, remembering, and recovering around a non-custodial USDC transfer.

It does not custody funds, provide yield, route swaps, lend assets, make
investment recommendations, sync transaction history to a server, or classify
addresses as safe.

Runtime code is authoritative for machine behavior. Product docs explain the
model. Tests enforce the invariants.

## Product Boundary

The transfer action remains visually and operationally central. Observability
exists to answer:

- What happened?
- Did funds move?
- Why did the attempt stop?
- Is the recipient familiar on this device?
- What network, amount, fee, and evidence were recorded?
- Where did the latest receipt fact come from?
- What should the user do next?

The system may explain and preserve transfer context. It must not imply recovery
guarantees, investment judgment, custody, centralized account history, or safety
claims about a recipient.

## Four Axes

Transfer observability separates four concepts that must not collapse into each
other:

- `state` — what the system currently believes happened.
- `strength` — whether a newer fact may overwrite an older fact.
- `provenance` — where the latest receipt fact came from.
- `schemaVersion` — how a stored receipt or proof packet is normalized.

Provenance explains facts; it does not strengthen or weaken them.

## State Vocabulary

Canonical state values live in
`app-web/frontend/public/js/transfer-status.js`.

Stored values are lowercase:

```txt
draft
ready
authorizing
authorized
submitting
submitted
pending
confirmed
rejected
failed
interrupted
unclear
outcome_unknown
replaced
expired
```

Display labels may use title case. Legacy uppercase values may be migrated, but
new stored records should use lowercase values only.

`confirmed` is the only state that proves funds moved. `outcome_unknown` means a
transaction hash exists but local confirmation visibility failed. `unclear`
means the app lacks enough evidence to classify the attempt, usually because no
reliable transfer hash exists.

Allowed transitions are defined in code by `ALLOWED_TRANSITIONS`. Terminal states
are `confirmed`, `failed`, `rejected`, `replaced`, and `expired`.

## Receipt Schema

Local receipt records use `receipt.v1`, defined by
`app-web/frontend/public/js/receipt-schema.js`.

Key receipt facts:

```txt
schemaVersion
id
state
fundsMoved
sender
recipient
amount
fee
totalDebit
chainId
network
contractAddress
approvalHash
transferHash
hash
blockNumber
explorerUrl
purposeTag
referenceId
memo
createdAt
updatedAt
resolvedAt
lastKnownMessage
observationSource
lastObservedAt
```

`fundsMoved` meanings:

- `true` — on-chain confirmation proves the transfer completed.
- `false` — a known non-transfer outcome occurred, or an on-chain receipt proved a revert.
- `null` — the outcome is unknown or pre-terminal. Do not assume.

Missing fields are normalized by the schema layer. Legacy hash-only and
transferHash-only records are reconciled so both aliases preserve the same
transaction hash.

## Proof Packet Schema

Proof packets use `proof-packet.v1`, defined by
`app-web/frontend/public/js/proof-packet.js`.

Proof packets export stored facts from a migrated receipt. They include the
transaction hash, network, sender, recipient, amount, fee, status, explorer URL,
local metadata, observation source, and observation timestamp. They do not invent
missing chain data.

## Provenance

`observationSource` records the latest source of receipt facts:

```txt
local
wallet
rpc
rehydration
migration
import
```

Source meanings:

- `local` — created by the browser app before wallet or chain evidence.
- `wallet` — observed from wallet action or wallet/provider response during the active transfer flow.
- `rpc` — observed from an RPC read or chain receipt during active reconciliation.
- `rehydration` — observed during reload-based receipt reconciliation.
- `migration` — assigned while normalizing legacy local records.
- `import` — reserved for future imported proof or receipt records.

`lastObservedAt` updates when a real observation source is explicitly stamped.
Metadata-only updates preserve state and provenance unless a source is explicitly
passed.

## Rehydration Rules

Rehydration reads local receipt state after reload and may query the chain for a
stored transfer hash.

Rules:

- If no active receipt exists, the companion remains idle.
- If the receipt is already terminal, archive handling remains local and bounded.
- If no transfer hash exists and the state is pre-broadcast, do not query chain.
- If a transfer hash exists, preserve it and query the chain when possible.
- If the chain confirms success, enrich to `confirmed`.
- If the chain confirms revert, enrich to `failed`.
- If the chain cannot answer, preserve existing facts and use `outcome_unknown` only for hash-bearing uncertainty.
- Rehydration may enrich a receipt, but it may not weaken confirmed facts.

## Error Classification

Wallet, provider, contract, and RPC failures are mapped by
`app-web/frontend/public/js/error-classifier.js`.

Classifier rules:

- Do not expose raw stack traces.
- Do not claim `fundsMoved: false` when broadcast outcome is unknown.
- Treat user rejection, wallet-busy interruption, gas issues, wrong network,
  contract pause, balance issues, and allowance issues as distinct classes.
- Direct hash-bearing uncertainty to explorer verification before retry.

## Test Gates

Observability invariants are tested in
`app-web/tests/frontend/observability.test.js`.

The test gate protects:

- state vocabulary uniqueness,
- invalid transition rejection,
- confirmed receipt non-regression,
- duplicate transaction hash merge behavior,
- metadata-only update state preservation,
- stack trace sanitization,
- broadcast-unknown `fundsMoved: null`,
- `receipt.v1` migration and defaults,
- `proof-packet.v1` export,
- hash and transferHash reconciliation,
- observation provenance stamping,
- archive preservation,
- malformed receipt tolerance,
- rehydration enrichment without weakening stronger facts.

Operational rehearsals live in
`docs/testing/transfer-edge-case-rehearsal.md`. That matrix is for
interruption-oriented review, not for changing the state model.

## Non-Goals

Do not add these as part of transfer observability:

- cloud sync,
- account identity,
- server-side receipt storage,
- imported transaction scanning,
- multi-device merge,
- observation history arrays,
- investment advice,
- custody or recovery guarantees,
- address safety claims.
