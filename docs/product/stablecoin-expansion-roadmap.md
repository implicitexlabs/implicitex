# Stablecoin Expansion Roadmap

Date: 2026-07-04
Status: Product roadmap notes.

## Strategic Position

ImplicitEx should not become a broad token menu. The stronger product is:

```text
Verified, non-custodial transfer routes for carefully approved digital currencies.
```

USDC proves the first route. USDT0 should prove issuer diversity on the same
network. Later assets should add a meaningful new user group, currency,
distribution channel, or strategic capability.

This roadmap is subordinate to the Coin Card distribution roadmap. Additional
stablecoins do not solve the current bottleneck by themselves:

```text
Supporting two assets does not matter if no one knows the product exists.
```

USDT0 remains strategically useful, but it should not displace Coin Card Free,
receipt proof, content, or early user acquisition.

## Recommended Order

### 1. USDC

USDC remains the default route and reference implementation.

Why it stays first:

- current ImplicitEx production route
- Circle-issued dollar stablecoin
- native Polygon support
- known production behavior inside the current app
- cleanest baseline for registry, receipt, and Coin Card route expansion

Rule: preserve the USDC route as independently operable.

### 2. Coin Card Route Readiness

Before adding another stablecoin, Coin Card must make the existing USDC route
usable outside implicitex.com.

Required before USDT0 becomes implementation priority:

- Coin Card Free has a self-serve embed path.
- Host-controlled manifest configuration is documented.
- Free-tier trust language is locked: route verified, recipient not verified.
- Receipt path records contract, network, token, recipient, fee, transaction
  hash, and manifest fingerprint where practical.
- At least one real external embed use case exists or a specific partner/user
  request justifies USDT0.

### 3. USDT0

USDT0 is the highest-priority stablecoin expansion after Coin Card route
readiness because it broadens international and exchange-oriented stablecoin
usefulness without forcing ImplicitEx onto another network.

Strategic value:

- adds Tether-oriented users
- keeps the execution environment on Polygon
- tests multi-asset architecture without multichain complexity
- makes Coin Card materially more useful for stablecoin recipients

Implementation posture:

- dedicated USDT0 transfer-contract instance
- no arbitrary token entry
- explicit `USDT0 - POLYGON` label
- issuer-control and freeze-risk disclosure
- legal review before public exposure

Detailed plan: `docs/product/usdt0-integration-plan.md`

### 4. EURC

EURC is the best third-currency candidate because it introduces euro-denominated
payments rather than another dollar stablecoin.

Strategic value:

- European freelancers and contractors
- international invoices
- digital services priced in euros
- Coin Cards denominated in EUR
- currency diversity beyond USD

Constraint:

- Circle documents EURC as available on multiple public blockchains, but the
  current roadmap assumption is that Polygon is not the natural target for EURC.
  Reverify supported networks before implementation.

Likely timing:

- after USDT0
- after demand measurement
- probably paired with a second network such as Base if current network support
  still makes Base the best fit

Reference:

- Circle EURC overview
  https://developers.circle.com/stablecoins/what-is-eurc
- Circle EURC contract addresses
  https://developers.circle.com/stablecoins/eurc-contract-addresses

### 5. PYUSD

PYUSD is strategically interesting because PayPal is a recognizable consumer and
merchant brand.

Strategic value:

- mainstream payment-platform recognition
- possible Coin Card trust improvement for non-crypto-native users
- merchant and consumer mental model alignment

Constraint:

- do not expand to an expensive network solely for PYUSD
- consider only after ImplicitEx has a proven second low-cost EVM network and
  measured demand

Likely posture:

- watchlist after Base or Arbitrum decisions
- not ahead of EURC unless user demand is strong

### 6. RLUSD

RLUSD belongs on the institutional watchlist.

Strategic value:

- enterprise payment positioning
- regulated-finance narrative
- cross-border payment corridors
- possible future low-cost EVM deployments

Constraint:

- do not chase developing network rollouts before user demand and route maturity
  justify it

Likely posture:

- formal watchlist
- reevaluate when an inexpensive EVM route is approved, liquid, documented, and
  operational

### 7. DAI Or USDS

DAI or plain USDS could serve users who want a more crypto-native stablecoin
alternative.

Reasons to defer:

- DAI/USDS naming and migration confusion
- protocol and governance risk
- collateral composition changes
- harder disclosures for ordinary users
- yield-bearing variants create a materially different product category

Rule:

- do not support sUSDS or other yield-bearing tokens during the straightforward
  transfer phase
- keep plain DAI or USDS demand-driven

## Phases

### Phase 1: Multi-Asset Polygon

- USDC remains default.
- Ship Coin Card Free for USDC first.
- Add USDT0 only after Coin Card route readiness criteria are met.
- Implement asset route registry.
- Make Coin Cards token-aware.
- Make receipts and proof packets token-aware.
- Add asset-level pause controls.
- Track treasury balances by asset.
- Prove USDC and USDT0 operate independently.

### Phase 2: Demand Measurement

Instrument before selecting the third asset.

Measure:

- USDC vs USDT0 selection
- unsupported asset requests
- wrong-network abandonments
- wrong-token abandonments
- Coin Card creator demand for EUR denomination
- support requests by asset and network

Privacy boundary:

- do not turn wallet inspection into broad surveillance
- collect only what is needed to decide route support and improve reliability

### Phase 3: Second EVM Network

The likely first candidate is Base, subject to conditions at the time of build.

A second network requires:

- route registry support
- RPC monitoring
- gas logic
- explorer configuration
- transfer contract deployment
- receipt indexing
- support documentation
- live smoke procedure
- rollback and pause controls

Do not start multichain work until Polygon USDC Coin Card usage and any approved
USDT0 route are stable.

### Phase 4: Currency And Issuer Diversity

A mature but still controlled route set could become:

- USDC: primary digital dollar
- USDT0: international digital dollar
- EURC: digital euro
- PYUSD: consumer/payment-platform dollar, if demand supports it
- RLUSD: enterprise-oriented dollar, if network support and demand justify it

Five well-governed assets are more valuable than many loosely supported tokens.

## Assets To Avoid For Now

Exclude:

- algorithmic stablecoins
- anonymous or unauditable issuers
- tokens without reliable redemption information
- bridged copies lacking canonical issuer support
- low-liquidity stablecoins
- rebasing tokens
- yield-bearing stablecoins
- assets whose balances change without ordinary transfers
- arbitrary ERC-20 entry by users
- tokens added primarily because of issuer incentives

## Product Principle

Every new asset must make ImplicitEx clearer or more useful. If a route adds
confusion, operational risk, or support burden without a distinct user advantage,
it should stay out of the product.

Distribution principle:

```text
Fewer supported routes with real users beat more supported routes with no usage.
```
