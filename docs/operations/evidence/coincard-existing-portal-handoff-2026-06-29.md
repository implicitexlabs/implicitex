# Coin Card → Existing Transfer Portal Handoff
## Evidence — 2026-06-29

### Lane

Wire Coin Card handoff into the existing Transfer Portal.
No second portal. No duplicate wallet logic.

### Branch

`HEAD` (main) — pre-commit

### Changed files

| File | Type | Change |
|------|------|--------|
| `app-web/frontend/public/card/card.js` | modified | `doHandoff()` — simplified URL to `/?cc=...&amount=...&src=coincard#transfer`; 3 params only |
| `app-web/frontend/public/css/main.css` | modified | `.cc-intake` banner styles appended |
| `app-web/frontend/public/index.html` | modified | `#ccIntake` banner added inside portal; `coincard-handoff.js` loaded last |
| `app-web/frontend/public/js/coincard-handoff.js` | new | Intake adapter: detects `cc+src=coincard`, fetches registry, prefills existing portal |
| `app-web/frontend/public/portal-index.html` | new | Minimal portal shell for `portal.implicitex.com` (same DOM, no marketing) |
| `firebase.json` | modified | Converted to multi-site array; added `implicitex-portal` site config |

### Architecture decision

Coin Card handoff targets the **existing** Transfer Portal at `/?cc=...#transfer`.
`coincard-handoff.js` is an intake adapter only — not a transaction engine.
All wallet logic, fee math, approval flow, and receipt handling remain in `wallet.js`.

---

### Test 1 — No-regression (manual browser required)

**URL:** `https://implicitex.com/`

| Check | Expected | Notes |
|-------|----------|-------|
| Hard refresh `/` | Portal does NOT auto-open | `coincard-handoff.js` exits silently: no `cc` param |
| "Transfer Portal" nav button | Opens portal normally | Existing `IX.focusTransferPortal()` path unchanged |
| Close/minimize | Works normally | No change to `wallet.js` minimize/close logic |
| Wallet connect | Not passive | No auto-connect added |
| Amount/fee math | Updates on input | `txAmount` listener in `wallet.js` unchanged |
| Recipient input | Validates normally | `txRecipient` listener in `wallet.js` unchanged |

**Status:** PENDING browser smoke

---

### Test 2 — Coin Card handoff (manual browser required)

**URL:** `https://implicitex.com/?cc=cc_demo_implicitex&amount=5&src=coincard#transfer`

| Check | Expected | Notes |
|-------|----------|-------|
| Portal opens | Yes — auto-opened by `IX.openTransferPortal()` | Called from `coincard-handoff.js` after manifest loads |
| Intake banner visible | Yes — `#ccIntake` shown | Label: `ImplicitEx · implicitex.com` |
| Registry status | `REGISTRY VERIFIED` | Manifest at `/registry/coincards/cc_demo_implicitex.json` valid and active |
| `txRecipient` value | `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919` | From manifest, not from URL |
| `txAmount` value | `5` | From `amount` URL param (hint) |
| Wallet auto-connect | No | `coincard-handoff.js` never calls `IX.connect()` |
| Transfer auto-execute | No | `coincard-handoff.js` never calls `IX.handleTxAction()` |

**Status:** PENDING browser smoke

---

### Test 3 — Hostile URL (static verified + manual browser required)

**URL:** `/?cc=cc_demo_implicitex&amount=5&src=coincard&to=0xBADBAD000000000000000000000000000000000000#transfer`

| Check | Expected | Status |
|-------|----------|--------|
| `to=` param used | No — never read by `coincard-handoff.js` | VERIFIED (code review) |
| Recipient source | manifest.recipient from registry only | VERIFIED (code review) |
| Banner state | `REGISTRY VERIFIED` — unaffected by `to=` | VERIFIED (logic) |
| Browser `txRecipient` | Registry address, not `to=` value | PENDING browser smoke |

---

### Test 4 — Silent exit conditions (static verified)

Verified by Node.js simulation of URL parsing logic:

| URL | Outcome |
|-----|---------|
| `/` | EXIT — no `cc` |
| `/?cc=cc_demo_implicitex` | EXIT — no `src=coincard` |
| `/?to=0xBAD&src=coincard` | EXIT — no `cc` |
| `/?cc=$$$INVALID$$$&src=coincard` | EXIT — fails CARD_ID_RE |
| `/?cc=cc_demo_implicitex&src=coincard` | RUNS |
| `/?cc=cc_demo_implicitex&amount=5&src=coincard` | RUNS |
| `/?cc=cc_demo_implicitex&src=coincard&to=0xBADBAD` | RUNS — `to=` ignored |

**Status:** VERIFIED

---

### Test 5 — Failure states (manual browser required)

| Scenario | Expected |
|----------|----------|
| `cc=nonexistent_card` | Banner: `UNVERIFIED — CARD NOT FOUND`; portal opens; no prefill |
| Registry fetch fails (network) | Banner: `UNVERIFIED — REGISTRY UNAVAILABLE`; portal opens; manual entry only |
| Revoked card (future) | Banner: `CARD REVOKED — TRANSFER BLOCKED`; portal does NOT open |

**Status:** PENDING browser smoke

---

### Suite results (2026-06-29)

```
check:static             PASS  (1419 local references checked)
test:observability       PASS  31/31
test:analytics           PASS  24/24
test:consent             PASS  15/15
```

---

### Current limitations

- `portal.implicitex.com` not yet deployed. `portal-index.html` and `firebase.json` multi-site config are ready; Firebase console site creation (`implicitex-portal`) required before deploy.
- Browser smoke (Tests 1, 2, 3, 5) pending — requires live deploy or local server.
- Wallet smoke (MetaMask desktop, MetaMask mobile, Coinbase Wallet) not yet run for the Coin Card intake path.

---

### Architectural note

`portal.implicitex.com` and Coin Card handoff are separate lanes:
- **Lane A** (complete): Coin Card `doHandoff()` → `/?cc=...&src=coincard#transfer` → `coincard-handoff.js` intake
- **Lane B** (config pending): `portal.implicitex.com` → `portal-index.html` shell → same definitive Transfer Portal, no Coin Card required
