# Portal Contract Root

This is the canonical portal contract directory.

It owns the portal information architecture, destination hierarchy, state-preservation rules, interruption policy, and responsive navigation constraints for `portal.implicitex.com`.

Implementation-local mirrors may exist under `app-web/docs/product/portal/`, but they do not redefine this contract root. Validators and documentation consumers should treat this directory as canonical.

## Document Map

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md` — portal destination hierarchy, authoritative state, interruption policy, and responsive equivalence rules.
- `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md` — current portal facts, source modules, authority types, volatility, and duplicated presentation sources.
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md` — how inventoried facts project into Transfer, Recipients, Activity, contextual Verification, and System without creating new authority.
- `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md` — how canonical registered surfaces compose into visible destinations before navigation changes presentation.
- `PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md` — explicit GLOBAL/NETWORK registration rules for portal surfaces that must remain present regardless of destination state.
- `PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md` — dormant visibility-controller rollout and later activation boundary for destination hiding.
- `PORTAL_PRIMARY_NAVIGATION_COORDINATOR_CONTRACT_V1.md` — accessible primary navigation, first visibility-controller activation, focus behavior, selected-state ownership, and cross-authority compensation.

## Portal Architecture Stack

- Product intent and hierarchy: `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`
- Fact and authority inventory: `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`
- Intent-based presentation projection: `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`
- Destination composition: `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`
- Global surface registration: `PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`
- Visibility-controller activation: `PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md`
- Primary navigation coordinator: `PORTAL_PRIMARY_NAVIGATION_COORDINATOR_CONTRACT_V1.md`

The boundary is:

```text
Portal navigation follows user intent.
Execution authority remains underneath and unchanged.
```
