# Wallet Runtime Audit (2026-04-30)

## Scope

Read-only audit of current runtime wiring on branch `wallet-runtime-audit-2026-04-30`.

## Files Reviewed

- `app-web/frontend/public/index.html`
- `app-web/frontend/public/scripts/wallet.js`
- `app-web/frontend/public/modal/modal.js`
- `app-web/frontend/public/components/header/header.js`
- `app-web/frontend/public/components/footer/footer.js`
- `app-web/frontend/public/components/header/header.html`
- `app-web/frontend/public/components/footer/footer.html`

## DOM Expectations from wallet.js

`wallet.js` expects:

- `#btn-connect`
- `#gas-display`
- Modal shell elements: `#modal-overlay`, `#modal-message`, `#modal-confirm`, `#modal-cancel`, `.modal`
- Dynamically rendered modal form IDs from `openSendModal()`:
  - `#user-address-display`
  - `#recipient-address-input`
  - `#recipient-validation-msg`
  - `#amount-input`
  - `#fee-output`
  - `#total-output`
  - `#amount-warning-msg`
  - `#switch-network`

## Existence Check

Existing:

- `#btn-connect` exists in injected `components/header/header.html`
- Modal shell exists in `index.html`

Conditional:

- `#gas-display` and send-form IDs exist only after `openSendModal()` renders modal content

Missing:

- `#footer-placeholder` is referenced by footer fetch/injection script in `index.html` but does not exist in the HTML body

## Current Wallet Wiring

- Connect wallet flow in `wallet.js` using EIP-1193 (`eth_requestAccounts`)
- On-load account check (`eth_accounts`)
- Account change listener (`accountsChanged`)
- Network switching via `wallet_switchEthereumChain`
- Modal-driven send preview/validation flow in `openSendModal()`

## Concerns

- `components/header/header.js` is obfuscated and duplicates wallet-connect behavior rather than delegating to `wallet.js`
- Footer injection path is broken due to missing `#footer-placeholder`
- Invocation path for `openSendModal()` is unclear from current visible page wiring

## Smallest Next Fix Recommendation

1. Add missing `#footer-placeholder` in `index.html` and remove conflicting static footer placeholder text.
2. Replace obfuscated `header.js` with transparent glue code that delegates click handling to `window.connectWallet`.
3. Keep wallet logic ownership in `wallet.js`; do not change transfer/send behavior in this wiring pass.
