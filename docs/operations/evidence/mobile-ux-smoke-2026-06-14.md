# Mobile UX Smoke

**Date:** 2026-06-14
**Branch:** gate3-production-frontend-qa
**Outcome:** PASS

---

## Test scope

Prove the app is usable on a real mobile device without hiding or arming critical
transfer controls.

| Lane | Scope | Status |
|------|-------|--------|
| Responsive narrow-viewport layout | Desktop browser + narrow viewport + MetaMask extension | PASS |
| Real MetaMask mobile browser UX smoke | iPhone, MetaMask mobile browser, local network | PASS |

**Scope note:** No live transfer executed. This was mobile UX / wallet connection /
transfer-form readability smoke only.

---

## Lane 1: Responsive narrow-viewport layout — PASS

### Setup

- Browser: desktop Chrome/Firefox
- Viewport: narrowed to phone-width (~375px)
- Wallet: MetaMask extension, Polygon mainnet

### Checks performed

| Check | Result |
|-------|--------|
| Hamburger nav opens and closes cleanly | PASS |
| Wallet connect is reachable from narrow layout | PASS |
| Wallet connected state is readable | PASS |
| Recipient input field is usable | PASS |
| Amount input field is usable | PASS |
| Network / wrong-network state is readable | PASS |
| Acknowledgement checkbox is tappable, not accidentally clipped | PASS |
| Execute Transfer button is visible and not clipped | PASS |
| No horizontal overflow in mobile layout | PASS |
| Layout resolves to mobile view below narrow breakpoint | PASS |

---

## Lane 2: Real MetaMask mobile browser UX smoke — PASS

### Setup

- Device: iPhone (real device, not simulator)
- Browser: MetaMask mobile in-app browser
- URL: `http://192.168.1.97:8080` (local network, Python http.server)
- Wallet: MetaMask mobile, Polygon mainnet
- Gate: `transfersEnabled` closed — no live transfer

### Checks performed

| Check | Result |
|-------|--------|
| App reachable at local network IP in MetaMask mobile browser | PASS |
| Header / logo / hamburger layout renders correctly | PASS |
| Hamburger menu opens cleanly | PASS |
| Connect Wallet flow appears in MetaMask mobile | PASS |
| Wallet connection succeeds | PASS |
| Transfer portal opens | PASS |
| Connected sender address displays | PASS |
| Recipient input field works | PASS |
| Amount input field works | PASS |
| USDC balance displays: `7.17 USDC` | PASS |
| Platform fee displays correctly for `1.0`: `0.010000 USDC` | PASS |
| Acknowledgement checkbox visible and reachable | PASS |
| No live transfer executed | PASS |

### What this proves

Real device, real wallet, real local network. MetaMask mobile can connect and reach the
transfer form. All critical controls are accessible. Balance and fee display correctly.
Form is usable on a physical phone screen.

---

## UI observation — not a blocker

Connected sender address and recipient text are large and horizontally cramped on mobile.
Fields remain functional and readable, but before wider public launch, address display
should truncate more gracefully or use a condensed copy-friendly style. Logged as a
post-smoke polish item, not a Gate 3 blocker.

---

## Pass criteria

| Criterion | Result |
|-----------|--------|
| Responsive layout resolves at phone width | PASS |
| Hamburger nav functional | PASS |
| Critical controls accessible in narrow layout | PASS |
| No horizontal overflow | PASS |
| Real-device app reachable via local network | PASS |
| Wallet connected — address shown on device | PASS |
| Form fields usable on real device | PASS |
| USDC balance and fee displayed correctly | PASS |
| Ack checkbox reachable on real device | PASS |
| No live transfer triggered | PASS |

---

## Verdict

PASS — 2026-06-14

Real MetaMask mobile browser UX smoke confirmed. App renders correctly on an iPhone,
wallet connects, transfer form is accessible and readable, USDC balance and fee display
correctly. No live transfer executed — this is mobile UX / wallet connection /
form-readability smoke only.

One UI polish item noted (address truncation on mobile) — not a blocker for Gate 3.
