# Architecture Contracts

This directory owns generic architecture contract validation.

## Responsibility Boundary

Architecture validation has one authority:

> Validators enforce declared contract rules. They do not infer product rules
> from product names, state names, selectors, or copy.

Keep the layers separate:

| Layer | Question |
|---|---|
| Schema | Is this structurally valid JSON? |
| Validator | Are the declared relationships coherent? |
| Product contract | Which product-specific rules must be enforced? |
| Implementation | Does runtime behavior satisfy the declared contract? |

Schemas validate shape. Validators validate declared relationships. Product
contracts declare product-specific rules. Implementations prove runtime behavior
through source checks, smoke checks, browser checks, or product-specific tests.

## Validator Rules

Generic validators must not become hidden product authorities.

Do not add product-specific inference to generic validator code:

```js
if (artifact.name === 'Coin Card') {
  // forbidden
}

if (state.id === 'CONFIRMED') {
  // forbidden
}

if (region.selector === '.cc-card-top') {
  // forbidden
}
```

If a product needs a rule, declare it in that product's artifact or structure
contract. The validator may enforce the declared rule, but it must not discover
the rule by recognizing product names, state names, selectors, copy, or branding.

Examples:

- Terminal states belong in a contract field such as `requiredTerminalStates`.
- State field references belong in a contract field such as `stateFieldRefs`.
- Forbidden dependencies belong in `graph.forbiddenEdges`.
- Product selectors belong in structure contracts, not generic validator logic.

Architecture first. Taxonomy later. Split validators into UI, execution, or
lifecycle-specific engines only when a second product contract creates real
pressure for that separation.
