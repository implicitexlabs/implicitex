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

Mirrored files in this directory:

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`

The mirrored file is a convenience copy for app-web readers. The canonical version lives under `docs/product/portal/`.

## Portal Architecture Stack

- Portal information architecture: `docs/product/portal/PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`

The boundary is:

```text
Portal navigation follows user intent.
Execution authority remains underneath and unchanged.
```
