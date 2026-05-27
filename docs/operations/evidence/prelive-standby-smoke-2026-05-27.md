# ImplicitEx Pre-Live Standby Production Smoke

Date: 2026-05-27
Status: PASSED
Commit: `79bc537 Calibrate pre-live wallet state UI`
Hosting URL: https://implicitex-236f2.web.app
Contract: `0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0` (Polygon mainnet, canonical, Safe-owned)

## Purpose

Validate the deployed pre-live/read-only standby posture after the wallet-state
and severity-calibration pass. This smoke did not enable transfers and did not
attempt a live transaction.

## Deployment Evidence

Firebase Hosting deploy completed successfully for project `implicitex-236f2`.

Static production checks confirmed:

- Homepage returned HTTP 200.
- `js/wallet.js` served with `Cache-Control: no-cache, must-revalidate`.
- `js/receipt-store.js` served with `Cache-Control: no-cache, must-revalidate`.
- Footer identity links were limited to X, LinkedIn, and GitHub.
- No Reddit link and no LinkedIn company URL were present in the deployed
  homepage footer.
- Recipient and amount fields were deployed with primary input styling.
- USDC balance row was present in the transfer instrument.

## Transfer Gates

Production chain config remained closed:

```text
IX_CONFIG.transfersEnabled = false
IX_CHAINS[137].transfersEnabled = false
```

Polygon contract address remained:

```text
0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
```

## Manual Production Smoke

Manual fresh-load browser smoke passed:

- Fresh/private production load completed.
- Footer showed X, LinkedIn, and GitHub only.
- Wallet connected successfully.
- Polygon standby state rendered calmly after switch/connection.
- Preflight reflected connected wallet and Polygon state without stale
  `Switch to Polygon` messaging after Polygon was already active.
- USDC balance was visible and read from the configured Polygon USDC contract.
- Recipient and amount fields rendered as primary white execution inputs.
- No phantom active receipt behavior was observed.
- Red did not appear except for true critical/fault conditions.

## Dwell Validation

Connected-on-Polygon standby dwell passed after several minutes open:

- Standby felt supervised, not broken.
- Motion remained quiet.
- Amber did not pull attention unless action was actually needed.
- Wallet, balance, and Polygon state remained visible.
- Companion and telemetry felt patient rather than restless.
- No recovery language appeared while transfers were intentionally paused.
- No red appeared without a true critical fault.

## Result

PASSED.

`79bc537` is validated as the current pre-live standby baseline. WalletConnect
or mobile session work may proceed from this baseline, but live transfers remain
gated off until a separate controlled enablement checklist is executed.
