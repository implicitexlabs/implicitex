# Mobile UX Smoke

**Date:** 2026-06-14
**Branch:** gate3-production-frontend-qa
**Outcome:** PARTIAL — responsive layout PASS; real-device pass PENDING

---

## Test scope

Prove the app is usable on a phone-sized viewport without hiding or arming critical
transfer controls, and that the real mobile wallet path (WalletConnect QR → phone browser)
is viable before Gate 3 closes.

This evidence is split into two lanes:

| Lane | Scope | Status |
|------|-------|--------|
| Responsive narrow-viewport layout | Desktop browser + narrow viewport + MetaMask extension | PASS |
| Real-device / WalletConnect mobile handoff | Actual phone, WalletConnect QR, mobile MetaMask browser | PENDING |

---

## Lane 1: Responsive narrow-viewport layout — PASS

### Setup

- Browser: desktop Chrome/Firefox
- Viewport: narrowed to phone-width (~375px)
- Wallet: MetaMask extension, Polygon mainnet
- Gate: `transfersEnabled` closed (layout-only pass — no real transfer needed)

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

### What this proves

The responsive layout correctly collapses at phone-width. Critical transfer controls
(recipient, amount, ack checkbox, Execute Transfer) remain accessible. Hamburger nav
is functional. Wrong-network state is readable. No layout collapse or clipped elements
observed.

### What this does not prove

- Real touch tap targets on a physical device
- Keyboard overlay behavior (virtual keyboard pushing form out of view)
- WalletConnect QR handoff on a real phone
- Mobile MetaMask browser rendering
- iOS Safari rendering differences

---

## Lane 2: Real-device / WalletConnect mobile handoff — PENDING

### Scope

One real phone pass. Does not require a live transfer.

Minimum acceptance:

1. Open `https://implicitex.app` on a real mobile device (or scan QR to localhost via ngrok/tunnel).
2. Tap **Connect Wallet** → wallet choice overlay appears.
3. Tap **WalletConnect** → QR code renders.
4. Scan QR with MetaMask mobile (or another WalletConnect wallet).
5. Confirm wallet connects — address shows, network badge shows Polygon.
6. Enter a recipient address and amount — fields usable on soft keyboard.
7. Observe fee / total debit / balance are readable above the keyboard.
8. Observe acknowledgement checkbox is tappable without accidental trigger.
9. Observe Execute Transfer button is not hidden by keyboard overlay.
10. Disconnect cleanly.

### Optional additions

- Wrong-network state: while connected on mobile, trigger network mismatch and confirm
  wrong-network UI is readable on phone screen.
- Companion tray: expand/collapse on mobile — check tap target and readability.
- Receipt area: if a receipt exists from a prior session, check readability on mobile.

### Gate decision

**One real-device pass is required before closing the mobile UX lane.** Layout smoke
on a narrow desktop viewport is useful but does not substitute for real touch + mobile
browser behavior.

---

## Pass criteria for full mobile UX lane close

| Criterion | Status |
|-----------|--------|
| Responsive layout resolves at phone width | PASS |
| Hamburger nav functional | PASS |
| Critical controls accessible in narrow layout | PASS |
| No horizontal overflow | PASS |
| Real-device WalletConnect QR connect | PENDING |
| Wallet connected state readable on real device | PENDING |
| Form fields usable with soft keyboard | PENDING |
| Ack + Execute Transfer accessible above/below keyboard | PENDING |
| Clean disconnect on real device | PENDING |

---

## Evidence (fill in after real-device pass)

**Device:** _____
**Browser:** _____ (e.g. Safari, Chrome for Android, MetaMask in-app browser)
**WalletConnect wallet used:** _____

**QR rendered correctly? (Y/N):** _____
**Wallet connected — address shown? (Y/N):** _____
**Network badge readable? (Y/N):** _____
**Form fields usable with keyboard? (Y/N):** _____
**Ack checkbox reachable? (Y/N):** _____
**Execute Transfer button visible? (Y/N):** _____
**Clean disconnect? (Y/N):** _____

---

## Verdict

PARTIAL — 2026-06-14

Responsive narrow-viewport layout is confirmed correct. Real-device / WalletConnect
mobile pass is pending. Do not close the mobile UX lane until at least one real phone
session is recorded.
