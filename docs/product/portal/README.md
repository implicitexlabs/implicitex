# Portal Contract Root

This is the canonical portal contract directory.

It owns the portal information architecture, destination hierarchy, state-preservation rules, interruption policy, and responsive navigation constraints for `portal.implicitex.com`.

Implementation-local mirrors may exist under `app-web/docs/product/portal/`, but they do not redefine this contract root. Validators and documentation consumers should treat this directory as canonical.

## Document Map

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md` — portal destination hierarchy, authoritative state, interruption policy, and responsive equivalence rules.

## Portal Architecture Stack

- Product intent and hierarchy: `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`

The boundary is:

```text
Portal navigation follows user intent.
Execution authority remains underneath and unchanged.
```
