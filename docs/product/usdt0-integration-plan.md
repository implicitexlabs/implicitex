# USDT0 Integration Plan

Date: 2026-07-03
Status: Roadmap plan; not implementation authorization.

## Position

ImplicitEx should add USDT0 as the second supported stablecoin route after the
current Polygon USDC route is preserved and independently operable.

USDT0 should not be implemented as an arbitrary ERC-20 token selector. It should
be implemented as one explicitly approved route:

```text
Polygon mainnet (137) + USDT0 -> approved USDT0 transfer contract
```

The production USDC route remains the default and must continue to work if the
USDT0 route is paused, disabled, or delayed.

## Source Assumptions To Reverify Before Build

As of the roadmap notes captured on 2026-07-03:

- Polygon announced that USDT on Polygon was upgraded to Polygon-native USDT0 on
  2025-08-27.
- Polygon stated that users did not need to take action for the migration.
- The USDT0 route should use the canonical Polygon token address currently
  understood to be:

```text
0xc2132D05D31c914a87C6611C10748AEb04B58e8F
```

Before implementation, reverify this address against the official USDT0 registry,
Polygon documentation, Polygonscan, and a direct mainnet RPC read.

References:

- Polygon Labs, "Native USDT0 Comes to Polygon for Lower Fees and Deeper Liquidity"
  https://polygon.technology/blog/native-usdt0-comes-to-polygon-for-lower-fees-and-deeper-liquidity
- OpenZeppelin Contracts SafeERC20 documentation
  https://docs.openzeppelin.com/contracts/4.x/api/token/erc20
- Polygonscan token page
  https://polygonscan.com/address/0xc2132D05D31c914a87C6611C10748AEb04B58e8F

## Verification Gate

Before implementation begins, create a dated verification record with these
fields completed:

| Field | Required evidence |
| --- | --- |
| Verification date | UTC date and operator |
| Official issuer source | USDT0 registry or Tether-controlled source |
| Polygon source | Polygon documentation or announcement |
| On-chain `symbol()` | RPC result |
| On-chain `decimals()` | RPC result |
| Proxy implementation address | Polygonscan and direct storage/read evidence |
| Token owner/admin state | Polygonscan and direct contract/read evidence |
| Transfer-contract deployment address | Post-deploy address and verification link |

The USDT0 route remains disabled until this record exists and matches the route
registry entry.

## Architecture Decision

Deploy a separate transfer-contract instance configured for USDT0 rather than
turning the existing frontend into a generic token sender.

The approved route registry must map the whole route:

```text
asset + chainId + tokenContract + transferContract
```

The browser and Coin Card must never provide an arbitrary token address. They may
request a route by registry ID only.

Minimum route fields:

- asset id: `USDT0`
- display label: `USDT0 - POLYGON`
- chain id: `137`
- token contract
- transfer contract
- decimals
- approval behavior
- fee policy
- min and max transfer
- explorer configuration
- route status: active, paused, disabled, deprecated
- receipt/proof compatibility version
- disclosure profile

## Contract Requirements

If the current transfer contract accepts the token address through construction
and stores it immutably, the preferred path is to reuse the audited bytecode and
deploy a second instance for USDT0.

Required checks:

- Confirm the current contract uses `SafeERC20.safeTransferFrom()`.
- Confirm the configured token address cannot be changed after deployment.
- Confirm fee, treasury, pause, cap, and ownership behavior remain identical to
  the USDC route unless intentionally changed.
- Confirm source verification and on-chain state verification for the new
  transfer contract.
- Confirm the USDC production contract remains unchanged.

## Frontend Requirements

USDT0 has to be route-aware throughout the transfer lifecycle:

- balance reads
- allowance reads
- approval transaction prompts
- total debit calculation
- fee calculation
- receipt state
- explorer links
- support copy
- error handling
- mobile wallet recovery

USDT-style approval behavior requires special handling. OpenZeppelin documents
`forceApprove` for tokens that require allowance to be reset to zero before a
new nonzero approval, specifically citing USDT.

Frontend behavior:

1. Read current allowance.
2. If allowance is zero or below the needed amount, request exact approval.
3. If changing a nonzero allowance fails, present a two-step recovery:
   reset allowance to zero, then approve the exact required amount.
4. Distinguish approval failure from transfer failure in receipts and user copy.

Do not scatter a hard-coded `6` through the interface. Decimals should come from
the route registry and be verified during route initialization.

## Coin Card Requirements

Coin Card manifests and rendered cards must be token-aware before USDT0 is
exposed.

Required Coin Card fields:

- route id
- asset id
- display label
- chain id
- token contract
- transfer contract
- recipient address
- amount denomination
- fee model
- route status at card creation
- receipt/proof version

The visible label should be precise:

```text
USDT0 - POLYGON
```

Do not render only `USDT`, because users may hold Tether on Ethereum, Tron,
Arbitrum, or another network and incorrectly assume interchangeability.

## Receipt And Proof Requirements

Every receipt and proof packet must include:

- selected asset id
- public asset label
- chain id
- token contract address
- transfer contract address
- sender
- recipient
- transfer amount
- fee amount
- total debit
- approval transaction hash, when applicable
- transfer transaction hash
- route registry version

Receipts must make it impossible to confuse a USDC transfer with a USDT0 transfer.

## Risk And Legal Review

USDT0 is issuer-controlled. Tether may freeze or restrict token activity
independently of ImplicitEx. This does not automatically mean a non-custodial
secondary-market wallet transfer is prohibited, but the route needs legal review
before public availability.

Review topics:

- how ImplicitEx describes USDT0
- issuer freeze and address restriction disclosure
- sanctions and blocked-address procedure
- whether collecting fees in USDT0 changes the compliance analysis
- geographic restrictions
- support language for frozen, restricted, or reverting transfers
- monitoring for proxy implementation changes

## Test Plan

Required before production exposure:

- Polygon mainnet fork test against the real USDT0 contract
- balance and allowance read tests
- exact approval test
- approval reset-to-zero test
- insufficient balance test
- insufficient allowance test
- transfer rejection test
- interrupted mobile wallet test
- wrong-network test
- paused-route test
- frozen/reverting-token simulation
- receipt reconciliation test
- treasury accounting test
- controlled live smoke with small amount

## Launch Sequence

1. Freeze and preserve current USDC production route.
2. Implement the route registry and token-aware receipt model.
3. Make Coin Card manifests token-aware.
4. Deploy dedicated USDT0 transfer-contract instance.
5. Verify token, transfer contract, treasury, owner, fee, cap, and pause state.
6. Run fork tests and browser wallet tests.
7. Run controlled production smoke.
8. Publish the exact USDT0 and transfer-contract addresses.
9. Enable the USDT0 selector only after monitoring and reconciliation are ready.

## Non-Goals

- No arbitrary ERC-20 token sender.
- No bridged-token auto-detection.
- No swaps.
- No cross-chain routing.
- No yield-bearing token support.
- No claim that ImplicitEx can reverse, recover, unfreeze, or guarantee tokens.
