# Portal Contract Root

This is the canonical portal contract directory.

It owns the portal information architecture, destination hierarchy, state-preservation rules, interruption policy, and responsive navigation constraints for `portal.implicitex.com`.

Implementation-local mirrors may exist under `app-web/docs/product/portal/`, but they do not redefine this contract root. Validators and documentation consumers should treat this directory as canonical.

## Document Map

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md` — portal destination hierarchy, authoritative state, interruption policy, and responsive equivalence rules.
- `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md` — current portal facts, source modules, authority types, volatility, and duplicated presentation sources.
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md` — how inventoried facts project into Transfer, Recipients, Activity, contextual Verification, and System without creating new authority.
- `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md` — how canonical registered surfaces compose into visible destinations before navigation changes presentation.

## Portal Architecture Stack

- Product intent and hierarchy: `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`
- Fact and authority inventory: `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`
- Intent-based presentation projection: `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`
- Destination composition: `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`

The boundary is:

```text
Portal navigation follows user intent.
Execution authority remains underneath and unchanged.
```
