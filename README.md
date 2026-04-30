# ImplicitEx

Implicit Exchange (ImplicitEx) is a USDC transfer service.

This repository is organized around runtime surfaces. The web platform is the primary app today, with Python services integrated into that web app stack and a future desktop Python surface planned.

## Structure

- `app-web/` - Primary application surface (current production direction).
- `app-web/frontend/` - Web UI code (`src/`, `public/`).
- `app-web/backend/python/` - Python services and integration code (including gas services).
- `app-web/contracts/` - Canonical Solidity contract source.
- `app-web/tests/` - Web, Python, and contract test lanes.
- `desktop-python/` - Future desktop GUI surface (planned).
- `docs/product/` - Vision, product definition, and roadmap.
- `docs/architecture/` - Platform and integration architecture docs.
- `docs/decisions/` - Decision log and integrated notes.
- `legacy-transfer/` - Imported historical materials from transfer batches.
- `.private/secrets/` - Local sensitive files (never commit).

## Current Focus

1. Build and complete the online tool.
2. Establish a stable platform baseline.
3. Expand into an Electron desktop client as a secondary phase.

## Legacy Transfer Notes (Imported April 30, 2026)

Older project assets from `Desktop/ImplicitEx Transfer Files/implicitex-site` were imported into:

- `legacy-transfer/2026-04-30/implicitex-site/`

Legacy frontend documentation was preserved at:

- `docs/decisions/legacy-transfer/frontend-readme-2026-04-30.md`

Summary of legacy frontend file purposes:

- `index.html`: main page structure, accessibility, and wallet transfer UI integration.
- `scripts/wallet.js`: wallet connection and transfer logic.
- `scripts/modal.js`: confirmation modal flow and feedback states.
- `scripts/main.js`: component loading and app initialization.
- `styles/main.css`: core styles and global layout.
- `styles/modal.css`: modal styling and accessibility behavior.
- `styles/wallet.css`: wallet UI styling.
