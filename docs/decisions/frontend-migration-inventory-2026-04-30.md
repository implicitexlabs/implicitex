# Frontend Migration Inventory — 2026-04-30

Scope: `legacy-transfer/2026-04-30/implicitex-site`

This is an inventory only. No files were moved, edited, or deleted from `legacy-transfer` during this step.

## 1. Promote To `app-web/frontend` Now

These are candidate source assets worth preserving as immediate starter material for the active web app surface.

- `index.html`
- `manifest.json`
- `styles/main.css`
- `styles/theme.css`
- `styles/modal.css`
- `styles/wallet.css`
- `scripts/main.js`
- `scripts/wallet.js`
- `scripts/verify.js`
- `scripts/gas-estimator.js`
- `modal/modal.js`
- `components/header/header.html`
- `components/header/header.css`
- `components/header/header.js`
- `components/footer/footer.html`
- `components/footer/footer.css`
- `components/footer/footer.js`
- `components/images/brandmark.svg`
- `components/images/wordmark.svg`
- `components/images/brandmark-wordmark.svg`
- `assets/icons/favicon.ico`
- `assets/icons/favicon-16x16.png`
- `assets/icons/favicon-32x32.png`
- `assets/icons/apple-touch-icon.png`
- `assets/icons/icon-192.png`
- `assets/icons/icon-512.png`

## 2. Hold As Legacy Reference

Keep for historical context, experimentation history, or optional future extraction.

- `docs/IMPLICITEX INSTRUCTIONS.txt`
- `docs/ROADMAP.md`
- `docs/components.md`
- `docs/download-fonts.txt`
- `docs/subscription-sol.txt`
- `docs/ImplicitExTransfer.md`
- `docs/Implicitex-transfer.txt`
- `src/authService.js`
- `src/firebase-config.js`
- `src/transactions.js`
- `gas-widget/gas.html`
- `gas-widget/gas.css`
- `gas-widget/gas.js`
- `gas-widget/gas.py`
- `utils/logger.js`

## 3. Delete Later (After Explicit Approval)

These appear low-value, duplicate, generated, or environment-specific. Keep for now; delete only in a dedicated cleanup pass.

- `.vscode/settings.json`
- `components/headertest.html`
- `scripts/wallet-1.js`
- `scripts/wallet-email.js`
- `styles/super.css`
- `assets/icons/social/*` (full social icon set; likely overcomplete/duplicate)
- `components/images/*.ai` (source design files; keep only if design workflow depends on them)

## 4. Needs Manual Review

These files have coupling, correctness, or policy concerns and should be reviewed line-by-line before promotion.

- `index.html`
  - Potential path mismatches (`components/footer.html` vs actual `components/footer/footer.html`), typo references (`scripts/foter.js`, `footer-placholder`).
- `scripts/main.js`
  - Uses `components/header.html` and `components/footer.html` paths that may not match folder layout.
- `components/terms.html`
  - Confirm legal accuracy and product policy alignment before reuse.
- `assets/icons/social/*`
  - Validate licensing/provenance and decide final icon set.
- `gas-widget/gas.py` and `scripts/gas-estimator.js`
  - Decide canonical runtime boundary for gas logic (Python service vs frontend JS).
- `src/firebase-config.js`
  - Confirm env handling and secret boundaries before any promotion.

## Notes

- Recommended migration sequence: promote only the minimal web shell (HTML/CSS/core JS/components/icons) first, then selectively pull legacy reference files as intentional follow-on tasks.
- This inventory intentionally excludes any inspection or disclosure of `.private/secrets`.
