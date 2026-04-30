# Wallet Behavior Audit (2026-04-30)

## Scope

Read-only audit on branch `wallet-behavior-audit-2026-04-30` for current frontend wallet behavior.

## Page-Load Behavior

- `index.html` loads header and footer templates dynamically, then appends their JS files.
- `wallet.js` initializes wallet shell behavior:
  - binds connect handler if `#btn-connect` exists
  - checks accounts on load using `eth_accounts`
  - updates connect button state/address display
- `modal.js` exposes global modal helpers (`openModal`, `closeModal`).

## Connect Wallet Behavior

- Connect action calls `window.connectWallet()`.
- If no injected wallet provider exists, a modal error is shown.
- If provider exists, `eth_requestAccounts` is called.
- On success, connected state is updated using masked address in the connect button.

## `accountsChanged` Behavior

- `wallet.js` listens for `accountsChanged`.
- If an account exists, UI updates to connected state.
- If no accounts remain, UI returns to disconnected state.

## Polygon Network-Switch Behavior

- Uses `wallet_switchEthereumChain` for Polygon (`0x89`).
- If chain is unknown (`4902`), user sees a message that network setup is not configured.
- No add-chain RPC configuration is attempted in this build.

## Transfer Modal Reachability

- `window.openSendModal()` is defined in `wallet.js`.
- No visible control in current `index.html` invokes it.
- Result: transfer modal flow exists but is not discoverable through visible UI controls.

## Real Transfer Execution Status

- No on-chain transfer execution path is present.
- No transaction send call is made.
- Current confirmation path is simulation-only UI messaging.

## Demo/Simulation-Only Behavior

- Hardcoded demo balances are used in modal flow.
- Confirmation step displays a simulated completion message.
- Several dashboard/module values in `index.html` are static demo values.

## Required Transfer Modal DOM IDs

Base modal shell expected in page:

- `#modal-overlay`
- `.modal`
- `#modal-message`
- `#modal-confirm`
- `#modal-cancel`

Dynamically rendered by `openSendModal()` and then used by handlers:

- `#user-address-display`
- `#recipient-address-input`
- `#recipient-validation-msg`
- `#amount-input`
- `#fee-output`
- `#total-output`
- `#amount-warning-msg`
- `#gas-display`
- `#switch-network`

## Smallest Recommended Next Fix

Expose one explicit "demo transfer" control in the wallet/transfer area that calls `window.openSendModal()` and clearly labels the flow as non-executing in this build.
