# Domain Cutover Readiness — 2026-05-13

Purpose: record final Firebase smoke evidence before `implicitex.com` cutover.

Decision target: `implicitex.com` controlled soft launch.

## Status

**BLOCKED — 2026-05-13**
This artifact is parked. Do not proceed with any gate below until the launch gate
primary blockers are resolved. See: `docs/operations/implicitex-launch-gate.md`

| Gate | Status | Notes |
|---|---|---|
| Config audit | BLOCKED | Awaiting key rotation and clean deployment |
| Legal review | Pending |  |
| Live transfer verification | BLOCKED | Requires clean deployment with rotated key |
| Domain connection | BLOCKED | Not until live transfer verification passes |
| DNS cutover | BLOCKED | Not until domain connection gate passes |
| Post-cutover verification | BLOCKED | Not until DNS cutover passes |

## Config Audit

| Item | Expected | Observed | Status | Notes |
|---|---|---|---|---|
| Firebase project | `implicitex-236f2` |  | Pending |  |
| Firebase hosting URL | `https://implicitex-236f2.web.app` |  | Pending |  |
| Hosting public directory | `app-web/frontend/public` |  | Pending |  |
| `transfersEnabled` | Intentional live value |  | Pending |  |
| Network | Polygon Mainnet |  | Pending |  |
| Contract address |  |  | Pending |  |
| Treasury address |  |  | Pending |  |
| USDC address |  |  | Pending |  |
| Fee basis points | 100 |  | Pending |  |
| Minimum transfer |  |  | Pending |  |
| Maximum transfer |  |  | Pending |  |

## Legal Review

Draft/pre-attorney language accepted for controlled soft launch: `Yes / No`

| Page | URL/path | Status | Notes |
|---|---|---|---|
| Terms |  | Pending |  |
| Privacy |  | Pending |  |
| Legal/disclaimer |  | Pending |  |

## Live Transfer Verification

Firebase test URL: `https://implicitex-236f2.web.app`

| Field | Value |
|---|---|
| Test date/time |  |
| Operator |  |
| Wallet used |  |
| Network |  |
| Transaction hash |  |
| Explorer URL |  |
| Receipt ID |  |

### UX Screenshots

| Moment | File/path | Status | Notes |
|---|---|---|---|
| Wallet review state |  | Pending |  |
| MetaMask approval |  | Pending |  |
| MetaMask transfer confirmation |  | Pending |  |
| Confirmed receipt |  | Pending |  |
| Check status UI |  | Pending |  |
| Explorer verification |  | Pending |  |

### Financial Verification

| Field | Expected | Observed | Status |
|---|---|---|---|
| Transfer amount |  |  | Pending |
| Fee amount | Transfer amount * 1% |  | Pending |
| Total debit | Amount + fee |  | Pending |
| Sender balance before |  |  | Pending |
| Sender balance after |  |  | Pending |
| Sender delta | `-(amount + fee)` |  | Pending |
| Recipient balance before |  |  | Pending |
| Recipient balance after |  |  | Pending |
| Recipient delta | `amount` |  | Pending |
| Treasury balance before |  |  | Pending |
| Treasury balance after |  |  | Pending |
| Treasury delta | `fee` |  | Pending |

### Gas Verification

| Field | Value |
|---|---|
| Gas used |  |
| Gas token | POL |
| Gas cost |  |
| Approximate USD gas cost |  |
| Source for USD estimate |  |

### Receipt Persistence

| Check | Expected | Observed | Status | Notes |
|---|---|---|---|---|
| Confirmed receipt visible | `confirmed` receipt appears in Recent Receipts |  | Pending |  |
| Receipt survives reload | Receipt remains after page refresh |  | Pending |  |
| Explorer link persists | Link remains available after reload |  | Pending |  |
| No duplicate receipts | One receipt for the transfer |  | Pending |  |
| No `Check status` on confirmed receipt | Confirmed receipt shows explorer link only |  | Pending |  |

### Reconciliation Behavior

| Check | Expected | Observed | Status | Notes |
|---|---|---|---|---|
| Active unresolved receipt with hash | Shows `View on explorer` and `Check status` |  | Pending |  |
| No-hash receipt | Does not show `Check status` |  | Pending |  |
| Terminal receipt | Does not show `Check status` |  | Pending |  |
| RPC not found behavior | Preserves unresolved state |  | Pending | Optional if reproducible |
| RPC failure behavior | Preserves/promotes `outcome_unknown` |  | Pending | Optional if reproducible |

### Explorer Confirmation

| Check | Expected | Observed | Status | Notes |
|---|---|---|---|---|
| Transaction status | Success |  | Pending |  |
| Contract interaction | Expected ImplicitEx contract |  | Pending |  |
| Sender debit | Amount + fee |  | Pending |  |
| Recipient credit | Amount |  | Pending |  |
| Treasury credit | Fee |  | Pending |  |

## Domain Connection

| Item | Status | Notes |
|---|---|---|
| `implicitex.com` added to Firebase Hosting | Pending |  |
| `www.implicitex.com` added to Firebase Hosting | Pending |  |
| Firebase verification records created | Pending |  |
| SSL certificate provisioning | Pending |  |

## DNS Cutover

| Record | Expected target/value | Observed | Status | Notes |
|---|---|---|---|---|
| Root domain | Firebase-provided value |  | Pending |  |
| `www` | Firebase-provided value |  | Pending |  |

## Post-Cutover Verification

| Check | Expected | Observed | Status | Notes |
|---|---|---|---|---|
| `https://implicitex.com` loads | HTTP 200 / app shell visible |  | Pending |  |
| `https://www.implicitex.com` behavior | Redirect or app loads intentionally |  | Pending |  |
| Security headers present | CSP, HSTS, frame denial, content type options |  | Pending |  |
| Wallet connect works | Wallet can connect on domain |  | Pending |  |
| Transfer modules render | App UI usable |  | Pending |  |
| Receipt history renders | Recent Receipts visible |  | Pending |  |
| Explorer links work | Opens Polygonscan |  | Pending |  |

## Go / No-Go

| Decision | Value |
|---|---|
| Controlled soft launch approved | Pending |
| Broad public promotion approved | No |
| Decision maker |  |
| Decision timestamp |  |

## Notes

- `implicitex.com` should inherit the verified Firebase build.
- Do not introduce product behavior changes during cutover unless a blocker appears.
- Treat this as controlled live beta until legal and onboarding are tighter.
