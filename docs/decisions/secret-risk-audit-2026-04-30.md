# Secret Risk Audit — 2026-04-30 (Redacted)

Scope: working tree + git history indicators for runtime and legacy JS/HTML/CSS artifacts.

No secret values, full URLs, tokens, or key material are included.

## ACTIVE RUNTIME Findings
- `app-web/frontend/public/components/auth.html:L13` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/components/auth.html:L20` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/components/auth.html:L24` | `POSSIBLE_API_KEY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/components/auth.html:L39` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/components/auth.html:L42` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/styles/theme.css:L1` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/styles/theme.css:L69` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder
- `app-web/frontend/public/styles/theme.css:L98` | `SECRET_WORD_ONLY` | `active runtime` | action: sanitize in-place or replace with non-secret config placeholder

## LEGACY_QUARANTINED Findings
- `legacy-transfer/2026-04-30/quarantined-runtime-js/gas-estimator.js:L3` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/gas-estimator.js:L4` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L17` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L18` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L19` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L154` | `LEGACY_QUARANTINED_RISK` (PLACEHOLDER_CONTRACT) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L155` | `LEGACY_QUARANTINED_RISK` (PLACEHOLDER_CONTRACT) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L202` | `LEGACY_QUARANTINED_RISK` (PLACEHOLDER_CONTRACT) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L246` | `LEGACY_QUARANTINED_RISK` (PLACEHOLDER_CONTRACT) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js:L262` | `LEGACY_QUARANTINED_RISK` (PLACEHOLDER_CONTRACT) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-email.js:L19` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-email.js:L20` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship
- `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-email.js:L26` | `LEGACY_QUARANTINED_RISK` (POSSIBLE_RPC_URL) | `quarantined legacy` | action: keep quarantined; do not ship

## DOCS Findings
- `docs/decisions/frontend-migration-inventory-2026-04-30.md:L85` | `SECRET_WORD_ONLY` | `docs` | action: documentation-only; verify no live config values
- `docs/decisions/frontend-migration-inventory-2026-04-30.md:L90` | `SECRET_WORD_ONLY` | `docs` | action: documentation-only; verify no live config values
- `docs/decisions/frontend-runtime-audit-2026-04-30.md:L63` | `SECRET_WORD_ONLY` | `docs` | action: documentation-only; verify no live config values
- `docs/decisions/legacy-transfer/frontend-readme-2026-04-30.md:L29` | `SECRET_WORD_ONLY` | `docs` | action: documentation-only; verify no live config values

## HISTORY_ONLY Findings
- `cdc261583149` | `app-web/frontend/public/scripts/wallet.js` | `HISTORY_ONLY_RISK` | `git history` | action: clean reconstruction or history rewrite before remote push
- `ddd18b78dc58` | `legacy-transfer/2026-04-30/quarantined-runtime-js/wallet-1.js` | `HISTORY_ONLY_RISK` | `git history` | action: clean reconstruction or history rewrite before remote push
- `525a037d18c7` | `legacy-transfer/2026-04-30/implicitex-contract/hardhat.config.js` | `HISTORY_ONLY_RISK` | `git history` | action: clean reconstruction or history rewrite before remote push

## Recommended Actions
- Sanitize active runtime findings first.
- Keep quarantined scripts outside runtime path.
- Before any remote push, prefer fresh clean repo reconstruction from sanitized working tree.
