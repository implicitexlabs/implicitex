# ImplicitEx MVP Validation Laundry List

Date: 2026-05-11

Purpose: track MVP readiness against the live Polygon soft-launch posture. This is a QA artifact, not a feature roadmap. Items marked Manual require a real browser wallet, mobile device, or user-visible display check.

## Status Legend

- Pass: verified by source review, deterministic local harness, contract test, smoke transaction, or static check.
- Patched: issue found during this pass and corrected.
- Manual: requires MetaMask, mobile browser, or visual inspection in a real browser.
- Watch: acceptable for MVP, but should stay visible in later hardening.

## 1. Wallet Connection

- Manual: Connect MetaMask on desktop.
- Manual: Connect MetaMask on mobile.
- Pass: wallet address display uses shortened connected account in nav and button.
- Patched: disconnect/account-loss now clears recipient, amount, fee display, validation error, status text, preview, balance, companion state, and portal state.
- Manual: refresh/reconnect behavior with MetaMask permission already granted.
- Pass: wrong-network state is explicit and blocks transfer submission through network gates.
- Patched: connected account now re-syncs from MetaMask `eth_accounts` on account changes, focus, visibility, and connected-wallet polling; nav includes `Switch Account` to open MetaMask account selection.
- Patched: transfer panel now shows the connected sender explicitly, and submit re-checks `eth_accounts` before using the signer.
- Patched: if MetaMask returns the same authorized account after `Switch Account`, the UI instructs the user to remove the site from MetaMask connected sites and reconnect with the intended account.
- Patched: user-initiated Disconnect now clears sender authority, transfer fields, preview, balance, active receipt state, and provider polling; it attempts MetaMask `wallet_revokePermissions`, verifies `eth_accounts`, and warns when MetaMask still authorizes the site.
- Patched: wallet connection failures now surface MetaMask/provider-specific causes instead of a generic failure string, with `IX.debugWalletProvider()` available for manual QA.
- Patched: header wallet guidance and wallet actions now wrap into a mobile status/action rail instead of truncating long MetaMask guidance.
- Patched: empty `accountsChanged` now clears the same wallet/session fields as local disconnect, and provider sync on focus/visibility/poll uses one reconciliation pass to avoid duplicate presentation renders.
- Manual: multiple-account MetaMask flow must confirm sender updates when switching from one Polygon account to another.

## 2. Network / Chain Handling

- Pass: Polygon mainnet chain ID 137 is configured with native USDC and hardened contract `0xdB0084caBF891872Ee5bD7cf9Ba47E828449D972`.
- Pass: unsupported networks produce a wrong-network warning and hide transfer modules.
- Patched: configured but non-live networks, including Polygon Amoy with no deployed contract, now route to the `Switch to Polygon` recovery path instead of opening the transfer panel as `Contract not deployed`.
- Pass: transfer submission re-reads `eth_chainId` before contract calls and blocks unsupported or disabled chains.
- Patched: transfer preview and submit gating now require the active chain to be live for transfer, not merely present in `IX_CHAINS`.
- Pass: wrong-network switch clears balance and preview.
- Patched: wrong-network diagnostic now recovers when MetaMask switches back to Polygon Mainnet by re-syncing `eth_chainId` from `chainChanged`, window focus, tab visibility, and a connected-wallet chain poll.
- Patched: wrong-network connected state now offers a site-side `Switch to Polygon` action using MetaMask's network switch request before re-syncing `eth_chainId`.
- Watch: active receipts intentionally persist across network changes because they are historical transaction records, not current-network UI state.

## 3. Transfer Form

- Manual: recipient input spacing on desktop and mobile.
- Manual: copy/paste comfort from wallet apps and mobile keyboard.
- Pass: manual recipient validation covers missing `0x`, wrong length, non-hex characters, own-wallet recipient, and configured USDC token address.
- Pass: amount parsing rejects empty, zero, and more than 6 decimals before wallet submission.
- Pass: too-small, precision-invalid, cap-exceeding, insufficient-balance, and unreadable-balance paths resolve local receipts as no-funds-moved failures.
- Pass: preview updates before submission for valid connected-network inputs.

## 4. Fee Preview

- Pass: transfer amount, 1% fee, and total debit appear in preview.
- Pass: fee math mirrors contract integer division after on-chain fee basis points are read.
- Patched: fee, routing, preview note, and receipt text now use stronger contrast so fee information does not feel hidden.
- Manual: confirm fee preview remains unmistakable on low-resolution laptop and mobile screens.

## 5. Contract / Live Transfer

- Pass: final hardened contract deployed and source verified.
- Pass: frontend config points to the smoke-verified Polygon contract.
- Pass: small USDC smoke transfer completed from deployer wallet to recipient wallet.
- Pass: smoke transfer confirmed recipient `+1.000000 USDC`, treasury `+0.010000 USDC`, sender `-1.010000 USDC`, contract `0.000000 USDC`.
- Pass: transfer tx appeared on Polygonscan: `0xd26a714b4eaea0af17d6d56c673ec4389421d6db66f9f2de124f72c662688dc8`.
- Pass: public copy states non-custodial transfer execution and avoids escrow/custody framing.

## 6. Approval Flow

- Manual: confirm MetaMask USDC approval prompt appears when allowance is insufficient.
- Pass: approval success updates receipt from `authorizing` to `authorized`.
- Pass: rejected authorization resolves as `rejected`, `fundsMoved: false`, and does not submit transfer.
- Manual: confirm human-readable MetaMask rejection UI on desktop and mobile.

## 7. Transaction Submission

- Manual: submit transfer through production frontend with MetaMask.
- Pass: pre-broadcast state is `submitting`; broadcast state is `submitted`; confirmation state is `confirmed`.
- Pass: failed/reverted state is distinct from rejected and unclear.
- Pass: insufficient balance is handled before wallet submission and records a local receipt.
- Manual: rejected transfer signature through MetaMask.

## 8. Receipt / History Rail

- Pass: every validated transfer attempt creates a local receipt once exact amount, fee, and total debit are known.
- Pass: receipt survives refresh through `localStorage`.
- Pass: receipt stores approval hash, transfer hash, amount, fee, total debit, recipient, network, status, contract, and funds-moved state.
- Pass: rehydration confirms successful transfer hashes, failed transfer hashes, missing hashes, and missing receipts without fabricating success.
- Pass: receipt does not claim success before on-chain confirmation.
- Patched: late async callbacks can no longer archive a newer active receipt.
- Patched: no-hash submitted/interrupted receipts persist as `unclear` instead of internally staying `submitted`.
- Manual: receipt/history layout on mobile.

## 9. Mobile UX

- Manual: iPhone Safari.
- Manual: MetaMask mobile browser.
- Manual: normal Safari handoff behavior where relevant.
- Manual: form stacking, tap targets, keyboard overlays, copy/paste comfort, light mode, and dark mode.

## 10. Visual Trust / Readability

- Patched: faint fee, routing, preview note, and receipt details have stronger contrast.
- Manual: warnings, legal/network information, low-resolution laptop display, and mobile crampedness need real viewport inspection.
- Watch: monochrome precision aesthetic is preserved, but operational text should stay readable over stylized subtlety.

## 11. Legal / Boundary Copy

- Pass: non-custodial language is present across main, about, terms, privacy, and legal pages.
- Pass: no recovery/no reversal/user responsibility language is present.
- Pass: supported network language points to Polygon live and jurisdiction availability.
- Pass: escrow and custody claims are avoided.
- Patched: stale conditional transfer/fee wording was aligned with the live soft-launch state.
- Watch: attorney-review status is not visually marked on the legal pages. Add an explicit draft/review marker only if that is the intended public posture.

## 12. Launch Controls

- Pass: transfer cap remains low at 250 USDC.
- Pass: supported live network remains narrow: Polygon mainnet only.
- Pass: feature set remains minimal: no Python components, desktop app, analytics expansion, or subscription logic added.
- Pass: Amoy remains configured but transfer-disabled because no testnet contract is deployed.

## 13. Final Validation Pass

- Manual: desktop full flow.
- Manual: mobile full flow.
- Manual: wrong-network flow with MetaMask, including recovery from Ethereum Mainnet back to Polygon Mainnet.
- Manual: rejected approval flow.
- Manual: rejected transfer flow.
- Pass: insufficient balance flow is source-verified and covered by receipt lifecycle behavior.
- Pass: refresh after receipt is source-verified and harness-tested.
- Manual: disconnect/reconnect after receipt in real browser.
- Pass: explorer verification completed for hardened contract and smoke transfer.

## 14. MVP Launch Definition

Current status: partially proven.

A user can connect a wallet, enter a recipient, understand the 1% fee, submit a small USDC transfer, see a clear receipt, and recover transaction state after refresh without confusion. The contract and deterministic local state satisfy this definition; the remaining proof is real desktop/mobile wallet QA.
