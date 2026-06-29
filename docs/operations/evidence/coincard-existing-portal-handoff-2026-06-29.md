# Coin Card → Existing Transfer Portal Handoff
## Evidence — 2026-06-29

### Lane

Wire Coin Card handoff into the existing Transfer Portal.
No second portal. No duplicate wallet logic.

### Branch

`gate3-production-frontend-qa`

### Commits

| Hash | Description |
|------|-------------|
| `b3c566d` | Initial Lane A implementation: coincard-handoff.js, ccIntake banner, portal-index.html, firebase.json multi-site |
| `d8bd53f` | repair Transfer Portal hierarchy and layout controls |
| `1302861` | fix layout toggle — icons, CSS-driven state, grid-column fix |
| `2f4cc65` | unify portal control icon suite — 2px SVG family |

### Changed files

| File | Type | Change |
|------|------|--------|
| `app-web/frontend/public/card/card.js` | modified | `doHandoff()` — simplified URL to `/?cc=...&amount=...&src=coincard#transfer`; 3 params only |
| `app-web/frontend/public/css/main.css` | modified | `.cc-intake` banner styles; portal control icon suite; layout toggle CSS |
| `app-web/frontend/public/index.html` | modified | `#ccIntake` banner; layout toggle button; unified SVG icon suite; layout toggle JS |
| `app-web/frontend/public/js/coincard-handoff.js` | new | Intake adapter: detects `cc+src=coincard`, fetches registry, prefills existing portal |
| `app-web/frontend/public/portal-index.html` | new | Minimal portal shell for `portal.implicitex.com` (same DOM, no marketing) |
| `firebase.json` | modified | Converted to multi-site array; added `implicitex-portal` site config |

### Architecture decision

Coin Card handoff targets the **existing** Transfer Portal at `/?cc=...#transfer`.
`coincard-handoff.js` is an intake adapter only — not a transaction engine.
All wallet logic, fee math, approval flow, and receipt handling remain in `wallet.js`.

---

### Test 1 — No-regression

**URL:** `https://implicitex-236f2.web.app/`

| Check | Expected | Status |
|-------|----------|--------|
| Hard refresh `/` | Portal does NOT auto-open | PASS |
| "Transfer Portal" nav button | Opens portal normally | PASS |
| Close/minimize | Works normally — SVG icon suite functional | PASS |
| Wallet connect | Not passive | PASS |
| Amount/fee math | Updates on input | PASS |
| Recipient input | Validates normally | PASS |

**Status:** PASS — staging smoke 2026-06-29

---

### Test 2 — Coin Card handoff

**URL:** `https://implicitex-236f2.web.app/?cc=cc_demo_implicitex&amount=5&src=coincard#transfer`

| Check | Expected | Status |
|-------|----------|--------|
| Portal opens | Yes — auto-opened by `IX.openTransferPortal()` | PASS |
| Intake banner visible | Yes — full-width strip above three modules | PASS |
| Banner content | `COIN CARD` badge (no cent sign); owner label; `REGISTRY VERIFIED` | PASS |
| `txRecipient` value | `0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919` — from manifest | PASS |
| `txAmount` value | `5` — from URL hint | PASS |
| Wallet auto-connect | No | PASS |
| Transfer auto-execute | No | PASS |
| Three modules distinct | 01 Transfer / 02 Network / 03 Verification clearly separated | PASS |

**Status:** PASS — staging smoke 2026-06-29

---

### Test 3 — Hostile URL

**URL:** `/?cc=cc_demo_implicitex&amount=5&src=coincard&to=0xBADBAD000000000000000000000000000000000000#transfer`

| Check | Expected | Status |
|-------|----------|--------|
| `to=` param used | No — never read by `coincard-handoff.js` | VERIFIED (code review) |
| Recipient source | manifest.recipient from registry only | VERIFIED (code review) |
| Banner state | `REGISTRY VERIFIED` — unaffected by `to=` | VERIFIED (logic) |
| Browser `txRecipient` | Registry address, not `to=` value | PASS — staging smoke 2026-06-29 |

**Status:** PASS

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

### Test 5 — Failure states

| Scenario | Expected | Status |
|----------|----------|--------|
| `cc=nonexistent_card` | Banner: `UNVERIFIED — CARD NOT FOUND`; portal opens; no prefill | PENDING |
| Registry fetch fails (network) | Banner: `UNVERIFIED — REGISTRY UNAVAILABLE`; portal opens; manual entry only | PENDING |
| Revoked card (future) | Banner: `CARD REVOKED — TRANSFER BLOCKED`; portal does NOT open | PENDING |

**Status:** PENDING — failure state simulation not yet run

---

### Test 6 — Layout toggle

**URL:** `https://implicitex-236f2.web.app/`

| Check | Expected | Status |
|-------|----------|--------|
| Default layout on load | Columns (two-column grid) | PASS |
| Layout icon — columns state | Two vertical bars visible | PASS |
| Click toggle | Switches to stacked (single column) | PASS |
| Layout icon — stacked state | Three horizontal bars visible | PASS |
| Click again | Returns to columns | PASS |
| Refresh | Selected layout persists via `localStorage` | PASS |
| Icon suite consistency | Layout / minimize chevron / close × all 2px weight, 12×12 SVG | PASS |

**Status:** PASS — staging smoke 2026-06-29

---

### Suite results

```
check:static             PASS  (1419 local references checked)
test:observability       PASS  31/31
test:analytics           PASS  24/24
test:consent             PASS  15/15
```

### Remote checks — staging (implicitex-236f2.web.app)

All curl checks pass:

| Check | Result |
|-------|--------|
| `coincard-handoff.js` served (HTTP 200) | PASS |
| Registry manifest `cc_demo_implicitex.json` valid | PASS — `active`, recipient `0xa7cE4232...` |
| `index.html` loads `coincard-handoff.js` | PASS |
| `#ccIntake` banner in `index.html` DOM | PASS — `hidden` by default, `grid-column: 1/-1` |
| `portal-index.html` served (HTTP 200) | PASS |
| `card.js` `doHandoff()` URL targets `implicitex.com/?...#transfer` | PASS |
| `coincard-handoff.js` trust rule live | PASS — CARD_ID_RE guard confirmed |
| `portal-index.html` has no hero/marketing markup | PASS |
| `portal-index.html` auto-open script present | PASS |
| `index.html` does NOT have auto-open script | PASS |
| `cc-intake-mark` (cent sign) absent from HTML | PASS |
| `cc-intake-badge` present in HTML | PASS |
| Layout toggle (`layoutToggle`) present | PASS |
| `data-portal-layout` rules in CSS | PASS |

---

### Transfer Portal hierarchy repair: staging smoke passed

Visual smoke confirmed 2026-06-29. Portal hierarchy restored:
- Coin Card intake banner is a full-width thin strip (`grid-column: 1/-1`, 6px padding)
- `COIN CARD` text badge replaces cent-sign mark
- 01 Transfer / 02 Network / 03 Verification remain distinct modules
- Layout toggle functional with CSS-driven icon state and `localStorage` persistence
- Portal control icons unified: 2px SVG family across layout / minimize / close

---

### Current limitations

- `portal.implicitex.com` not yet deployed. `firebase.json` uses deploy targets; `implicitex-portal` site must be created in Firebase console before production portal deploy.
- Test 5 (failure states) not yet run — requires network simulation or temporary registry manipulation.
- Wallet smoke (MetaMask desktop, MetaMask mobile, Coinbase Wallet) not yet run for the Coin Card intake path.

---

### Architectural note

`portal.implicitex.com` and Coin Card handoff are separate lanes:
- **Lane A** (staging smoke PASS): Coin Card `doHandoff()` → `/?cc=...&src=coincard#transfer` → `coincard-handoff.js` intake
- **Lane B** (config pending): `portal.implicitex.com` → `portal-index.html` shell → same definitive Transfer Portal, no Coin Card required
