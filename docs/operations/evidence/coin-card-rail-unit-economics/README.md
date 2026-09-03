# Coin Card Rail Unit-Economics Evidence

**Status:** Empty evidence root; quote and transaction testing has not begun

This directory retains reviewed evidence for:

- `../../../product/coin-card/fiat-routing/COIN_CARD_MULTI_RAIL_PRODUCT_AND_ECONOMICS_STRATEGY_2026-08-08.md`
- `../../../product/coin-card/fiat-routing/COIN_CARD_RAIL_UNIT_ECONOMICS_MATRIX_V1.md`

Evidence retained here may populate the working matrix. It does not authorize a route,
change the Commercial Specification, modify frozen architecture, or approve a subsidy.

## Run layout

```text
<YYYY-MM-DD>_<provider-product>_<amount>_<short-run-id>/
  README.md
  normalized-result.json
  artifacts/
```

Every run README must record the matrix evidence fields, expected and actual result,
source terms/pricing version, provider environment/account, reviewer, disposition, and
hash inventory.

## Data handling

Do not commit:

- provider secrets, API keys, webhook secrets, or authentication tokens;
- full bank, routing, card, or wallet private-key material;
- unredacted KYC/KYB documents or unnecessary personal data;
- production payloads that provider terms or policy prohibit retaining in git.

Sensitive raw artifacts belong in the approved restricted evidence system. Commit only
the minimum redacted facts, hashes, and access reference needed for review.

## Evidence discipline

- A live quote is evidence only for its provider product, account, environment,
  jurisdiction, payment method, customer state, amount, asset, network, and time.
- A public percentage is a benchmark, not a substitute for a quote.
- An expired quote cannot prove current customer cost.
- A technically successful transaction cannot cure an unapproved role or use case.
- `APPROVED_SUBSIDY` requires a separate governed commercial and budget approval.
- Unexpected Coin Card cost is recorded as a failure, not normalized into the model.

