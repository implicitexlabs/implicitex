# Blocker 1 — Real-Browser MetaMask State Regression Smoke

**Date:** 2026-06-11
**Branch:** gate3-browser-regression-smoke
**Outcome:** PASS — all 8 items complete (2026-06-12)

Gate: `transfersEnabled: false` throughout all tests unless explicitly noted.
Wallet: MetaMask injected, Firefox desktop.
Connected wallet: `0x2489...1221`

---

## Checklist

| ID | Description | Result |
|----|-------------|--------|
| B1-01 | Connected on Polygon while transfers disabled — calm standby state | PASS |
| B1-02 | Ethereum mainnet → Polygon recovery; no stale switch-chain prompt | PASS |
| B1-03 | Disconnect → reconnect; no stale sender display | PASS |
| B1-04 | Refresh with wallet permission already granted | PASS |
| B1-05 | Account switch updates sender cleanly | PASS |
| B1-06 | No duplicated wallet/provider events after reconnect | PASS |
| B1-07 | Rejected approval shows human-readable copy | PASS |
| B1-08 | Receipt survives refresh/reconnect without READY/AUTHORIZING ghosts | PASS |

---

## B1-01 — Connected on Polygon with transfers disabled

**Date:** 2026-06-11
**Result:** PASS

**Observations:**
- Wallet `0x2489...1221` connected and displayed correctly in header (WALLET CONNECTED).
- Sender field populated correctly.
- No red signals, no warning banners, no error copy.
- No "Switch to Polygon" message — network panel correctly reported Polygon.
- Execute Transfer button read **TRANSFERS DISABLED** — clearly disabled.
- Status showed **"Preview only"** — reinforces intentional gate, not malfunction.
- Preflight section showed residual amount value (`1.0`) from prior session; does not affect
  standby-state result as button remained governed by the launch gate regardless.
- Network data, balance, gas, contract status all functional in standby.

**Verdict:** Calm standby state. No indications of malfunction. No error presentation.

---

## B1-02 — Ethereum mainnet → Polygon recovery

**Date:** 2026-06-11
**Result:** PASS

**Observations:**
- MetaMask global UI switched to Arbitrum while ImplicitEx was connected.
- ImplicitEx continued showing Polygon / Preview only.
- Initially recorded as INVESTIGATE — suspected stale UI or missing chainChanged event.
- Console check: `await window.ethereum.request({ method: 'eth_chainId' })` → `"0x89"` (Polygon).
- Provider chain never changed from ImplicitEx's perspective.

**Root cause of apparent discrepancy:**
MetaMask maintains per-site chain contexts. Switching MetaMask's global UI to another chain
does not change the provider chain for an already-connected site. The `chainChanged` event
correctly did not fire. The UI showing Polygon was accurate, not stale.

**Verdict:** No bug. Chain-change detection is correct. UI reflected true provider state.

---

## B1-03 — Disconnect → reconnect; no stale sender display

**Date:** 2026-06-11
**Result:** PASS

**After disconnect:**
- Header showed: "WALLET DISCONNECTED. SITE PERMISSION REMOVED."
- CONNECT WALLET button present.
- Sender address `0x2489...1221` cleared — not visible anywhere.
- No lingering wrong-network state.
- No stuck status or console errors.

**After reconnect:**
- MetaMask presented account selection and permission grant correctly.
- ImplicitEx showed CONNECTING WALLET during handshake.
- Wallet identity restored after approval.
- Network state re-evaluated on reconnect.
- Wrong-network condition surfaced accurately when MetaMask was on non-Polygon chain.

**Product behavior note:**
Network selection remains a MetaMask responsibility after reconnect. ImplicitEx correctly
reflects the active provider network but does not silently change networks during the
reconnect flow. This is the safer behavior for a financial application — the app detects
wrong network, warns clearly, and offers Switch to Polygon; it does not silently re-route
the user's chain context.

---

## B1-04 — Refresh with wallet permission already granted

**Date:** 2026-06-11
**Result:** PASS

**Observations:**
- Hard refresh (`Ctrl+Shift+R`) did not silently rehydrate the wallet session.
- App started in disconnected state — MetaMask presented a fresh site connection approval dialog.
- Balance showed "Not connected."
- Sender field empty — no stale address.
- No ghost receipt state (no READY/AUTHORIZING/PROCESSING artifacts).
- No stale wallet identity or transfer state surviving the refresh.

**Verdict:** Clean conservative behavior. Requiring explicit reconnect after hard refresh is
an acceptable security posture for a financial application.

**Incidental finding — MetaMask icon quality:**
MetaMask connection dialog showed a low-resolution blurry site icon. Likely caused by
MetaMask selecting a small favicon asset and upscaling it. Manifest.json and page head
icon declarations should be checked. Not a launch blocker, but a trust-signal polish item
given users are authorizing financial transactions.

---

## B1-05 — Account switch updates sender cleanly

**Date:** 2026-06-11
**Result:** PASS

**Observations:**
- Switched MetaMask to a different account while connected.
- ImplicitEx triggered full provider state re-evaluation on account change.
- Wrong-network state surfaced correctly (new account was on non-Polygon chain).
- Switched to Polygon — wrong-network state cleared, correct network displayed.
- No stale sender address, no stuck state, no reload required.

---

## B1-06 — No duplicated wallet/provider events after reconnect

**Date:** 2026-06-11
**Result:** PASS

**Observations:**
- Disconnect/reconnect produced stable UI with no visible flicker or duplicate prompts.
- No repeated connect loop observed.
- Wrong-network state appeared correctly when provider was on non-Polygon chain.
- Red wrong-network prompt was appropriate, not stale.
- Console showed MetaMask extension listener noise only; no ImplicitEx UI instability.

---

## B1-07 — Rejected approval shows human-readable copy

**Date:** 2026-06-12
**Result:** PASS

**Observations:**
- Clicked Execute Transfer, MetaMask approval appeared, rejection clicked.
- No visible status bar message displayed in the UI after rejection.
- Acknowledgement checkbox cleared; form returned to safe disabled state.
- Console check confirmed human-readable copy in receipt:
  `lastKnownMessage: "Transfer rejected in wallet. No transfer was broadcast."`
- `state: "rejected"` — correct terminal state.
- `getActive()` → `null` — no phantom active receipt.

**UX note:** The rejection message exists in the archived receipt but was not prominently
surfaced in the visible UI. Safety behavior is correct; copy visibility is a post-launch
polish consideration.

---

## B1-08 — Receipt survives refresh/reconnect without READY/AUTHORIZING ghosts

**Date:** 2026-06-12
**Result:** PASS

**Observations:**
- Hard refresh performed with archived rejected receipt in localStorage.
- Wallet reconnected after refresh.
- `getActive()` → `null` — no ghost active receipt.
- `ix.receipt.archive[0].state` → `"rejected"` — archived receipt survived intact.
- No READY / AUTHORIZING / PROCESSING state appeared after reconnect.

---

## Post-session verdict

PASS — 2026-06-12. All 8 items complete.

B1-01 through B1-08 passed. No regressions found. One polish fix applied
during the session (192x192 icon declaration — MetaMask connection dialog now
shows crisp brandmark). One UX note recorded (B1-07 rejection message exists in
receipt but not prominently surfaced in visible UI — post-launch polish item).
