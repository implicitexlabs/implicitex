# WP-02 Conflict-Resolution Ledger — 2026-08-01

Status: **RATIFIED** — all five governance sub-decisions ratified by founder
2026-08-01; resolution authorized to proceed

Observed: 2026-08-01

Integration HEAD: `0b7a446` (docs(operations): record roadmap PDF publication)

Roadmap endpoint: `937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278` (comprehensive roadmap publication)

Merge base: `9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84`

Entry gate result: **PASS** — `git fetch --prune` clean; 20 conflict paths (15 original + 5
new from PDF publication commits on integration side; classification updated below)

---

## Entry gate delta from starting evidence

The starting evidence (commit `eb73070`) recorded 15 conflict paths. Five additional paths
appear when testing the current integration HEAD (`0b7a446`) instead of `b2404ce`:

| New path | Why new |
|---|---|
| `app-web/frontend/public/comprehensive-roadmap.html` | Integration added dated overlay label (cf8bbb1); roadmap has undated label |
| `app-web/frontend/public/css/comprehensive-roadmap.css` | Integration added `.roadmap-overlay-evidence` CSS; roadmap doesn't have it |
| `app-web/package.json` | Integration added PDF build/test scripts; roadmap has V1 execution PDF scripts |
| `app-web/scripts/test_comprehensive_roadmap_artifact.js` | Integration added PDF path check; roadmap version doesn't |
| `firebase.json` | Integration added roadmap PDF download header; roadmap has CSS + v1-execution headers |

None of these five new paths touch payment-critical code. Their resolutions are
unambiguous (recorded below as Mechanical-2 class).

The three governance-escalation paths and their five sub-decisions are
unchanged.

---

## Classification table

| # | Path | Class | Order | Canonical answer | Resolution method |
|--:|---|---|--:|---|---|
| 1 | `.gitignore` | Behavioral | 1 | Merge: keep build-info.json rule (theirs) + fork evidence + debug logs; remove duplicate `.firebase/` block (ours) | Manual merge |
| 2 | `app-web/frontend/public/card/card.js` | Behavioral | 2 | Keep our `startedExecutionAttempts` WeakSet — approved execution-attempt tracking not present in roadmap | Accept ours |
| 3 | `app-web/frontend/public/card/coin-card-lifecycle-bundle.js` | Mechanical | 7 | Regenerate after governance decision on signer key version | Regenerate |
| 4 | `app-web/frontend/public/card/coin-card-manifest.json` | Mechanical | 7 | Regenerate after card.js behavioral resolution | Regenerate |
| 5 | `app-web/frontend/public/card/coin-card-verification.js` | Behavioral | 5 | Auto-merge accepted: "Route Verified" copy + `protectedAssetRequestUrl()` + `card/index.html` as protected asset (theirs) combined with v1+v2 key pairs in bootstrap (ours) | Auto-merge |
| 6 | `app-web/frontend/public/card/index.html` | Behavioral | 6 | Auto-merge accepted: our rich review UI (CONFIGURE/REVIEW states, detailed rows, Edit payment, collapsed mark) combined with their status-label default "Checking" and review-projection script tag | Auto-merge |
| 7 | `app-web/frontend/public/js/ix-execution.js` | Behavioral | 4 | Auto-merge accepted: our gas policy infrastructure combined with their `MAX_FEE = 10_000_000n` cap; cap is authorized by fee constitution | Auto-merge |
| 8 | `app-web/scripts/generate_signed_coin_card_acceptance.js` | **Governance** | 3 | See §GOVERNANCE-1 | Requires WP-03 decision |
| 9 | `app-web/scripts/test_coin_card_integrity.js` | Mechanical | 7 | Auto-merge accepted; expected hashes regenerated after artifacts settle | Regenerate |
| 10 | `app-web/tests/browser/coin-card-qr-browser.test.js` | Behavioral | 7 | Auto-merge accepted | Auto-merge |
| 11 | `app-web/tests/frontend/coin-card-lifecycle-publication.test.js` | **Governance** | 3 | See §GOVERNANCE-2 | Requires WP-03 decision |
| 12 | `app-web/tests/frontend/coin-card-review-runtime-prerequisites.test.js` | Behavioral | 7 | Keep our `getChainParams()` mock — provides full chain param coverage not present in theirs | Accept ours |
| 13 | `app-web/tests/frontend/coin-card-runtime-trust-conjunction.test.js` | Behavioral | 7 | Keep our dynamic `derivePublicationVerificationTime()` over their hardcoded `2026-07-26` date | Accept ours |
| 14 | `app-web/tests/frontend/coin-card-signing-generator.test.js` | **Governance** | 3 | See §GOVERNANCE-3 | Requires WP-03 decision |
| 15 | `app-web/tests/frontend/coin-card-verification.test.js` | Behavioral | 5 | Auto-merge accepted: our v1+v2 key bootstrap combined with their "Route Verified" copy test + `card/index.html` required-asset test | Auto-merge |
| 16 | `app-web/frontend/public/comprehensive-roadmap.html` | Mechanical-2 | 1 | Keep our dated label "Operational overlay · July 30, 2026" per checkpoint §8 | Accept ours |
| 17 | `app-web/frontend/public/css/comprehensive-roadmap.css` | Mechanical-2 | 1 | Keep our `.roadmap-overlay-evidence` CSS — governs evidence section styling | Accept ours |
| 18 | `app-web/package.json` | Mechanical-2 | 1 | Keep both: our PDF scripts + their v1-execution scripts | Manual merge |
| 19 | `app-web/scripts/test_comprehensive_roadmap_artifact.js` | Mechanical-2 | 1 | Keep our PDF path check — PDF was published | Accept ours |
| 20 | `firebase.json` | Mechanical-2 | 1 | Keep both: our roadmap PDF header + their CSS no-cache + v1-execution noindex + v1-execution PDF headers | Manual merge |

---

## Governance decision packet (WP-03)

Five sub-decisions, one bounded authority record required before any of paths 8, 11, 14 is touched.

### GOVERNANCE-1: `generate_signed_coin_card_acceptance.js`

**What integration says (our):**
Single-card build. `buildLifecycleRecord(cardId, manifestId, now, lifecycleKeyId)` takes an
explicit `lifecycleKeyId` parameter. The production key is `ix-lifecycle-pub-v2`
(post-rotation). Test in path 14 asserts rotation preserved v1 records and appended v2 IDs.

**What roadmap says (theirs):**
Multi-card build. Adds `loadActiveRegistryCards()` which reads active cards from a registry
directory (`card.status === 'active'`). `buildLifecycleRecord` signature changes to
`(cardId, manifestId, now, registryVersion)`. Lifecycle key identifier in generated bundle
header is `ix-lifecycle-pub-v1`.

**The decision:**

| Sub-decision | Options | Proposed canonical |
|---|---|---|
| 1. Production key identity | `ix-lifecycle-pub-v1` (roadmap) vs `ix-lifecycle-pub-v2` (integration) | `ix-lifecycle-pub-v2` — rotation already executed; new publications use v2; v1 remains valid for verifying existing bundles |
| 2. Signer separation | Both sides use separate manifest + lifecycle keys | No conflict — maintain both |
| 3. Rotation rules | Integration: preserve v1, append v2. Roadmap: v1 only | Keep rotation rule (integration): v1 preserved for backward compat; v2 for new publications |
| 4. Lifecycle preservation rules | Integration: single-card (cc_demo_implicitex). Roadmap: all active cards | Multi-card (roadmap): pilot has both cc_demo_implicitex (demo) and antoine (first paid card) |
| 5. Multi-card publication authority | Roadmap's `loadActiveRegistryCards()` | Authorize — required for controlled paid Coin Card pilot |

**Proposed canonical file behavior:**
Adopt roadmap's `loadActiveRegistryCards()` function for multi-card support; keep integration's
v2 lifecycle key identifier; keep integration's `lifecycleKeyId` explicit parameter signature
(rename to match rotation convention).

**Affected artifacts after decision:**
`coin-card-lifecycle-bundle.js` (regenerate), `coin-card-manifest.json` (regenerate),
`test_coin_card_integrity.js` (regenerate expected hashes)

---

### GOVERNANCE-2: `coin-card-lifecycle-publication.test.js`

**What integration says (our):**
Test 23 asserts: "real production bundle authenticates and promotes `cc_demo_implicitex`"
(single named card). Uses committed manifest hash for drift detection.

**What roadmap says (theirs):**
Test 23 asserts: "real production bundle authenticates and promotes every active registry card"
(multi-card, no specific card name). Simpler assertion structure.

**Proposed canonical:**
Keep both assertions as separate test cases:
- Test 23a: specific card (`cc_demo_implicitex`) promotion + manifest drift detection (our version — preserves the ability to detect drift between two separately committed files)
- Test 23b: multi-card promotion covering all active registry cards (their version — required for pilot)

---

### GOVERNANCE-3: `coin-card-signing-generator.test.js`

**What integration says (our):**
Adds: `rotation generator preserves v1 records and appends distinct v2 signer IDs`
(tests the key rotation invariant — v1 preserved, v2 appended)

**What roadmap says (theirs):**
Adds: `dry-run publication covers every active registry card without writing artifacts`
(tests multi-card dry-run; asserts `lifecycle records: 2`, `cardIds: antoine, cc_demo_implicitex`)

**Proposed canonical:**
Keep both tests. They test orthogonal properties: rotation correctness (ours) and
multi-card dry-run coverage (theirs). The `antoine, cc_demo_implicitex` assertion in their
test makes the pilot scope explicit and machine-checkable.

---

## Resolution sequence (post-ratification)

Once the three governance decisions are ratified, execute in this order:

1. **Resolution commit R-1 (Mechanical-2, no governance dependency):** Resolve paths 16–20.
   Entry action: verify integration branch is clean; no active merge state.

2. **Resolution commit R-2 (Behavioral, order 1–2):** Resolve `.gitignore` (#1) and `card.js` (#2).

3. **Resolution commit R-3 (Behavioral, order 3–6):** Resolve `ix-execution.js` (#7),
   `coin-card-verification.js` (#5), `card/index.html` (#6) — auto-merges applied.

4. **Resolution commit R-4 (Behavioral tests):** Resolve paths 10, 12, 13, 15 — auto-merges
   plus accept-ours cases.

5. **Resolution commit R-5 (Governance):** Resolve paths 8, 11, 14 per ratified WP-03 decisions.

6. **Regeneration pass:** Regenerate `coin-card-lifecycle-bundle.js`, `coin-card-manifest.json`,
   `test_coin_card_integrity.js` expected hashes from canonical sources.

7. **Test gate:** Run `npm --prefix app-web run test:coin-card-release` against the
   reconciled tree. All tests must pass before WP-02 is declared closed.

8. **Merge commit:** Fast-forward or merge to `main`. WP-02 closed.

---

## Authorization record

Ledger author: Claude (claude-sonnet-4-6)
Observation date: 2026-08-01
Ratification date: 2026-08-01
Ratified by: Founder (Antoine Dennison)

Ratification qualifications recorded:
- v2 is the only lifecycle key authorized for new productions; v1 is verification-only
- Rotation preserves valid v1 records; all new publications use v2
- Multi-card publication is registry-driven, not hard-coded to specific card names
- `antoine` is designated the pilot card (not "first paid card") until an actual paid
  entitlement exists
- All active records must pass schema/status/uniqueness/route/ordering validation before
  signing; any invalid or duplicate active record causes publication to fail closed; records
  must not be silently skipped
- Retention of MAX_FEE guard is a compatibility safeguard for the existing contract and does
  not change the strategic direction toward a zero-fee transfer contract
- Both lifecycle-publication test variants (drift-detection + multi-card) retained
- Both signing-generator tests (rotation correctness + multi-card dry-run) retained
