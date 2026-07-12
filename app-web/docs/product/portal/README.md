# Portal App-Web Notes

This directory is implementation-local and historical unless a file explicitly says it is generated from the canonical portal contract root.

Canonical portal contracts now live in:

```text
docs/product/portal/
```

Implementation-local checkpoint notes may exist here, but they must not redefine portal destination hierarchy, state preservation, interruption policy, or execution authority. Validators and documentation consumers should use the canonical root directly.

## Document Map

Canonical docs:

- `../../../../docs/product/portal/PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md` — portal destination hierarchy, authoritative state, interruption policy, and responsive equivalence rules.
- `../../../../docs/product/portal/PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md` — current portal facts, source modules, authority types, volatility, and duplicated presentation sources.
- `../../../../docs/product/portal/PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md` — how inventoried facts project into Transfer, Recipients, Activity, contextual Verification, and System without creating new authority.
- `../../../../docs/product/portal/PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md` — how canonical registered surfaces compose into visible destinations before navigation changes presentation.
- `../../../../docs/product/portal/PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md` — explicit GLOBAL/NETWORK registration rules for portal surfaces that must remain present regardless of destination state.

Mirrored files in this directory:

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`
- `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`
- `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`
- `PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`

The mirrored file is a convenience copy for app-web readers. The canonical version lives under `docs/product/portal/`.

## Portal Architecture Stack

- Portal information architecture: `docs/product/portal/PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`
- Portal fact and authority inventory: `docs/product/portal/PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`
- Portal intent-based presentation projection: `docs/product/portal/PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`
- Portal destination composition: `docs/product/portal/PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`
- Portal global surface registration: `docs/product/portal/PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`

The boundary is:

```text
Portal navigation follows user intent.
Execution authority remains underneath and unchanged.
```
