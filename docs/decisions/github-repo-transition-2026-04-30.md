# GitHub Repository Transition (2026-04-30)

## Canonical Repository

The canonical ImplicitEx repository is now:

`git@github.com:implicitexlabs/implicitex.git`

Local canonical working path:

`/home/adenmediagroup/DevEnv/implicitex`

## Legacy Repository State

The prior GitHub repository remains parked as a legacy remote:

`legacy-origin -> git@github.com:implicitexlabs/implicitex-site.git`

This legacy repository is not the active source of truth for current development.

## Local-Only Historical Artifacts

The following folders remain local-only and are intentionally not part of the canonical remote history:

- `/home/adenmediagroup/DevEnv/implicitex_dirty_history_2026-04-30`
- `/home/adenmediagroup/DevEnv/implicitex_local_quarantine_2026-04-30`

## Development Rule Going Forward

All future development should proceed from:

`/home/adenmediagroup/DevEnv/implicitex`

Do not merge history from `implicitex-site` into the clean canonical repository without explicit manual review and an intentional migration decision.
