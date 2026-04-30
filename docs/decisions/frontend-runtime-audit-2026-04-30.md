# Frontend Runtime Audit — 2026-04-30

Scope audited:

- `app-web/frontend/public/index.html`
- `app-web/frontend/public/scripts/`
- `app-web/frontend/public/modal/`
- `app-web/frontend/public/utils/`

## 1. JavaScript Loaded Directly By `index.html`

- `scripts/wallet.js`
- `modal/modal.js`
- external `ethers` CDN bundle

## 2. JavaScript Dynamically Loaded By `index.html`

- `components/header/header.html`
- `components/header/header.js`
- `components/footer/footer.html`
- `components/footer/footer.js`

## 3. JavaScript Files That Appear Unused In Current Runtime

Under `app-web/frontend/public/scripts/`, the following are not loaded directly by `index.html` and appear inactive in current runtime flow:

- `app.js`
- `main.js`
- `verify.js` (empty file)
- `wallet-1.js`
- `wallet-email.js`
- `gas-estimator.js`

`app-web/frontend/public/utils/logger.js` is also present but appears unreferenced.

## 4. `wallet.js` vs `wallet-1.js` Overlap

- Both implement wallet/transaction-related behavior.
- `wallet-1.js` appears to be an experimental/alternate implementation with different assumptions.
- Keeping both in active runtime paths increases ambiguity and deployment risk.

## 5. `gas-estimator.js` Status

- `wallet.js` contains optional hooks for gas-estimation calls.
- `gas-estimator.js` is not currently loaded by `index.html` and is effectively orphaned/inactive.

## 6. `modal/modal.js` vs `scripts/main.js` / `scripts/app.js`

- `modal/modal.js` provides modal open/close/event handling.
- `main.js` and `app.js` include additional runtime orchestration and wallet UI behavior, but are not currently loaded.
- This creates overlapping runtime patterns with unclear ownership.

## 7. Missing DOM / Path Concerns

- `index.html` references `footer-placeholder` in script logic, but the corresponding mount element is missing.
- Some non-loaded scripts reference legacy component paths and IDs that may not match current markup.
- Several IDs queried by non-loaded scripts are absent from current `index.html` structure.

## 8. Security-Sensitive Findings (Redacted)

- Experimental scripts include hardcoded provider/endpoints and placeholder contract addresses.
- Sensitive-like runtime patterns exist in legacy scripts and should be treated as non-production.
- No secret values are documented in this report.

## Recommendation

Before any remote push, quarantine unused/experimental frontend scripts from active runtime directories, keeping only the minimal current runtime path:

- keep: `scripts/wallet.js`, `modal/modal.js`, header/footer component JS
- quarantine: inactive/experimental script variants

After quarantine, perform a dedicated wallet-path review on `wallet.js` as the single active runtime entry.
