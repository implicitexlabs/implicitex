# Asset Route Registry

Date: 2026-07-03
Status: Architecture roadmap.

## Purpose

ImplicitEx is moving from a single Polygon USDC transfer path toward a small set
of verified stablecoin transfer routes. The registry is the control surface that
keeps this expansion narrow, explicit, and auditable.

The registry answers one question:

```text
Is this exact asset + network + token contract + execution contract approved?
```

If the exact route is not in the registry, ImplicitEx does not support it.

## Core Rule

The frontend, Coin Card, and any agent-facing interface must never accept a raw
token address as user input for execution.

Users may select only approved route IDs. A route ID resolves to a complete,
preverified configuration.

## Registry Integrity

The registry is security-sensitive configuration. A compromised registry could
misdirect a route even if the transfer contract remains correct.

Each published registry should carry:

- registry version
- content hash
- deployment environment
- release commit
- approved signer or release authority
- minimum client-supported registry version
- emergency revocation or pause mechanism

Clients should fail closed when the registry is missing, malformed, older than
the minimum supported version, or inconsistent with the compiled production
environment.

## Route Shape

Minimum route fields:

```json
{
  "routeId": "polygon-usdc-v1",
  "assetId": "USDC",
  "displayName": "USDC",
  "routeLabel": "USDC - POLYGON",
  "issuer": "Circle",
  "currency": "USD",
  "chainId": 137,
  "networkName": "Polygon",
  "tokenContract": "0x...",
  "transferContract": "0x...",
  "decimals": 6,
  "approvalBehavior": "standard",
  "feePolicyId": "implicitex-100bps-v1",
  "minimumTransfer": "1.00",
  "maximumTransfer": "250.00",
  "explorerBaseUrl": "https://polygonscan.com",
  "status": "active",
  "coinCardEligible": true,
  "receiptVersion": "implicitex.receipt.v1",
  "disclosureProfile": "issuer-controlled-stablecoin",
  "registryVersion": "implicitex.routes.v1",
  "registryContentHash": "sha256:..."
}
```

Status values:

- `active`: visible and executable.
- `paused`: visible but blocked from execution.
- `disabled`: hidden from ordinary selection and blocked from execution.
- `deprecated`: retained for receipt/proof history but not usable for new
  transfers.

## Initial Routes

### Polygon USDC

The current production route remains the reference route.

```text
routeId: polygon-usdc-v1
chainId: 137
asset: USDC
status: active when production gates allow transfers
```

The existing USDC production contract should remain independently operable.
USDT0 work must not require modifying or redeploying the USDC route.

### Polygon USDT0

USDT0 should be added as a second route after the registry, receipt model, and
Coin Card manifest schema are token-aware.

```text
routeId: polygon-usdt0-v1
chainId: 137
asset: USDT0
label: USDT0 - POLYGON
status: disabled until contract deployment, legal review, and smoke tests pass
```

USDT0 should use `approvalBehavior: "reset-to-zero-compatible"` unless direct
testing proves a narrower behavior is sufficient.

## Registry Consumers

Required consumers:

- transfer form
- balance reader
- allowance reader
- approval flow
- fee and total calculator
- Coin Card manifest builder
- Coin Card renderer
- receipt store
- proof packet export
- transaction event indexer
- support and trust pages
- observability checks

Each consumer should use route data rather than hard-coded asset constants.

## Receipt Binding

Every successful or failed transfer attempt must bind to the route that produced
it.

Receipts must include:

- `routeId`
- `assetId`
- `routeLabel`
- `chainId`
- `tokenContract`
- `transferContract`
- `routeRegistryVersion`

This prevents historical receipt ambiguity if a token contract changes behavior,
a route is deprecated, or a new transfer contract is deployed later.

## Coin Card Binding

Coin Cards should carry a route ID and a route snapshot.

The route ID lets current software find the latest route policy. The snapshot
preserves the card creator's original route context for evidence and support.

Coin Card execution must fail closed when:

- route ID is unknown
- chain ID does not match
- token contract does not match
- transfer contract does not match
- route status is paused, disabled, or deprecated
- route registry version is below the minimum accepted version

## Security Boundary

The registry exists to avoid these failure modes:

- counterfeit stablecoin contracts
- wrong-network transfers
- accidental bridged-token support
- unsupported token decimals
- unsupported approval behavior
- unsupported issuer freeze behavior
- receipt ambiguity
- treasury accounting ambiguity
- arbitrary ERC-20 attack surface

Every supported asset becomes an ImplicitEx promise:

```text
We verified this route, tested it, monitor it, and understand its behavior.
```

## Multichain Implication

The registry should be chain-aware from the beginning even while only Polygon is
active. That keeps the data model ready for later controlled network expansion.

Candidate future route groups:

- Polygon: USDC, USDT0
- Base: USDC, EURC, possible future approved assets
- Arbitrum: USDC, possible PYUSD route if demand supports it

Do not add a new network until RPC monitoring, gas handling, explorer links,
contract deployment, support documentation, and receipt indexing are ready for
that network.
