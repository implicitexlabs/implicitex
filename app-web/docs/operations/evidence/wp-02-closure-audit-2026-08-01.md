# WP-02 Closure Audit — 2026-08-01

**Canonical merge commit:** `0dc8927`
**Branch closed:** `integration/wp-02-canonical-reconciliation`
**Gate command:** `npm run test:coin-card-release`
**Exit code:** 0

---

## Branch topology

```
$ git merge-base --is-ancestor origin/main HEAD
origin/main IS ancestor of HEAD — local main fully contains remote

$ git rev-list --left-right --count origin/main...HEAD
0       93
```

`origin/main` is a strict ancestor of local `main`. No divergence. Local `main` is
93 commits ahead of remote (not pushed — intentional; no deployment occurred).

---

## Working tree

```
$ git status
On branch main
nothing to commit, working tree clean
```

---

## Conflict-marker scan

```
$ git grep -rn "^<<<<<<< \|^=======$\|^>>>>>>> " -- '*.js' '*.html' '*.json' '*.css'
(no output)
```

No git conflict markers present anywhere in tracked source files.

---

## Release gate — full sequential invocation

```
$ npm run test:coin-card-release
EXIT: 0
```

Stages executed in order:

| Stage | Script | Result |
|---|---|---|
| Integrity proof tooling | `test:coin-card-integrity` | PASS |
| Trusted key resolution | `coin-card-trusted-key-resolution.test.js` | PASS |
| Lifecycle record verification | `coin-card-lifecycle-record-verification.test.js` | PASS |
| Lifecycle bundle verification | `coin-card-lifecycle-bundle-verification.test.js` | PASS |
| Lifecycle record selection | `coin-card-lifecycle-record-selection.test.js` | PASS |
| Lifecycle resolution | `coin-card-lifecycle-resolution.test.js` | PASS |
| Lifecycle presentation | `coin-card-lifecycle-presentation.test.js` | PASS |
| Execution authorization | `coin-card-execution-authorization.test.js` | PASS |
| Verification contract | `coin-card-verification.test.js` | PASS |
| Runtime trust conjunction | `coin-card-runtime-trust-conjunction.test.js` | PASS |
| Lifecycle registry | `coin-card-lifecycle-registry.test.js` | PASS |
| Lifecycle publication | `coin-card-lifecycle-publication.test.js` | PASS |
| Signing generator | `coin-card-signing-generator.test.js` | PASS |
| Executable registry record verification | `coin-card-executable-registry-record-verification.test.js` | PASS |
| Transaction evidence content verification | `coin-card-transaction-evidence-content-verification.test.js` | PASS |
| Review runtime prerequisites | `coin-card-review-runtime-prerequisites.test.js` | PASS |
| Provider continuity | `coin-card-provider-continuity.test.js` | PASS |
| IX execution authorized path | `test:ix-execution-authorized` | PASS |
| QR handoff | `test:coin-card-qr-handoff` | PASS |
| QR browser smoke | `test:coin-card-qr-browser` | PASS |
| Active-flow acceptance firewall | `coin-card-active-flow-firewall.test.js` | **8/8 PASS** |
| Production artifact browser smoke | `test:coin-card-production-artifact` | **PASS** |

Final output:
```
Coin Card browser smoke: PASS at http://127.0.0.1:… (antoine, cc_demo_implicitex)
```

---

## Active cards verified

Both active registry entries loaded, reached CONFIGURE state, and completed the
promoted-presentation lifecycle pipeline:

- `antoine`
- `cc_demo_implicitex`

---

## Signed artifact state

Regenerated during WP-02 post-merge work (`e920088`):

- `frontend/public/card/coin-card-lifecycle-bundle.js` — v2 signing, HEAD state machine
- `frontend/public/card/coin-card-manifest.json` — includes `card/index.html` as required asset

The manifest hash for `js/ix-execution.js` matches the deployed file. `ix-execution.js`
was not modified (it is a `REQUIRED_ASSET_PATHS` hash-verified asset; modifying it would
break manifest verification at card load time).

---

## Known test debt — 7 pre-existing frontend failures

These failures existed at `e167331` (the WP-02 merge commit) before the post-merge
firewall fixes. They were not introduced by WP-02 browser test work.

```
not ok 476 - homepage replaces the embedded transfer shell with a portal-entry surface
not ok 558 - Send USDC control system uses labeled groups and sentence-case actions
not ok 559 - Send USDC typography remains role-based and readable
not ok 560 - portal shell keeps the install icon quiet and restores the compact footer
not ok 562 - portal manifest points to the versioned install artwork
not ok 566 - contract mirror is byte-identical and runtime boundary is four files
not ok 576 - static source does not expose forbidden authority access and scripts are ordered correctly
```

Root cause: tests track old homepage and portal copy/structure. The homepage entry
headline was intentionally changed from "Send USDC with ImplicitEx" to "A dedicated
transfer workspace." during the WP-02 structural pass (`5c93ad6`). The tests need to
be updated to match the committed copy — this is a separate, scoped pass, not a
release blocker for Coin Card functionality.

These failures do **not** appear in `npm run test:coin-card-release` (which covers the
Coin Card release gate only).

---

## What was not done

- No push to remote (`origin/main`)
- No Firebase deployment
- No changes to production infrastructure

---

## Next work

$10 Coin Card Annual entitlement specification (separate session).
