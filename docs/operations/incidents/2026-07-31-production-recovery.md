# ImplicitEx Production Recovery — 2026-07-31

## Summary

An older, unmerged git worktree was accidentally deployed to production, overwriting the
current site. The settlement screenshot section, how-it-works content, two-row header,
Tourmaline palette, and updated copy were replaced by an earlier version. Recovery was
completed on the same day from an immutable-SHA recovery worktree. All four production
artifacts were independently verified by SHA-256 hash.

**Incident status:** FULLY RECOVERED  
**Technical deployment result:** PASS  
**Visual sign-off:** PASS

---

## Timeline

| Time (UTC-6) | Event |
|---|---|
| 2026-07-31 (discovered) | Production site observed serving older version — settlement screenshots absent, copy reverted |
| 2026-07-31 | Root cause identified: `implicitex-change-001r` worktree deployed over current site |
| 2026-07-31 | Last-known-good commit identified: `b8ef21a` / current HEAD `a9c8aea` |
| 2026-07-31 | Recovery worktree created, pinned to `a9c8aea` |
| 2026-07-31 | All three predeploy gates passed from recovery worktree |
| 2026-07-31 | Production deployment executed from recovery worktree |
| 2026-07-31 | Four SHA-256 artifact hashes verified against live production |
| 2026-07-31 | Manual visual sign-off completed in private browser session |

---

## Root Cause

Multiple git worktrees share the same `.firebaserc` and `firebase.json`. Any worktree
that has both files can execute `firebase deploy --project production` and overwrite the
live site. The incident worktree was on branch `integration/wp-02-canonical-reconciliation`,
which diverged from the main development branch before the following changes were made:

- Settlement screenshot visual (`e0056cf`)
- How-it-works step blurbs (`24aa2a8`, `a9540c2`)
- Two-row portal header (`e3ade84`)
- Tourmaline/dark palette (`f2d8d28`, `14f18ae`)
- Coin Card feature work (`1cf48fe` and later)

Deploying from this worktree silently published a build that was 133 commits behind the
active branch for the affected surfaces.

---

## Incident Worktree

| Field | Value |
|---|---|
| Directory | `/home/adenmediagroup/DevEnv/implicitex-change-001r` |
| Branch | `integration/wp-02-canonical-reconciliation` |
| Last commit | `0b7a446` — `docs(operations): record roadmap PDF publication` |
| Merged to main | No |
| Diverges from `cc-001` at | 133 commits behind |

---

## Recovery Source

| Field | Value |
|---|---|
| Recovery worktree | `/home/adenmediagroup/DevEnv/implicitex-recovery-a9c8aea` |
| Git state | Detached HEAD — pinned to immutable SHA |
| Commit SHA | `a9c8aeadea619b0e6d2147886024bcb3b0b92ad9` |
| Commit message | `feat(cc-002.2): Ed25519 JWS signing with abstract signer interface` |
| Last commit touching `public/` | `b8ef21a` — `fix(settlement): align caption width with portal visual` |
| `git diff b8ef21a a9c8aea -- app-web/frontend/public/` | 0 bytes — identical |
| `git status --short` | Clean (one untracked: `node_modules` symlink outside `public/`) |
| `build-info.json` | Absent — not published to `hosting:main` |

---

## Predeploy Gate Results (from recovery worktree)

All three gates ran from `/home/adenmediagroup/DevEnv/implicitex-recovery-a9c8aea`.

| Gate | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm --prefix app-web run predeploy:coin-card` | 0 | PASS — all sub-tests + browser smoke |
| 2 | `node docs/blockaid-review-packet/build-public-page.js` | 0 | PASS — reproduced committed content exactly |
| 3 | `git diff --exit-code app-web/frontend/public/architecture-and-security.html` | 0 | PASS |

Note: Gate 1 requires `puppeteer`. The recovery worktree had no `node_modules`. A
temporary symlink was created:

```
app-web/node_modules → /home/adenmediagroup/DevEnv/implicitex/app-web/node_modules
```

The symlink is outside `app-web/frontend/public/` and was not uploaded by Firebase. No
packages were installed or modified.

---

## Deployment Command

```
firebase deploy --only hosting:main --project production
```

Executed from: `/home/adenmediagroup/DevEnv/implicitex-recovery-a9c8aea`

Firebase project: `implicitex` (production)  
Hosting target: `main` → site `implicitex` → `implicitex.com`  
Files uploaded: 251 (252 local minus `.gitkeep`, excluded by `**/.*` ignore rule)  
Deployment identifier: not provided by Firebase CLI output  
Firebase Console: `https://console.firebase.google.com/project/implicitex/overview`

---

## Approved Artifact Fingerprints

SHA-256 hashes recorded from the recovery worktree before deployment and independently
verified against live production after deployment.

| File | SHA-256 | Live match |
|---|---|---|
| `app-web/frontend/public/index.html` | `e7956e8f82c20ffd337796c110f1a2a63b00f04a1a9ab9dd2beb18614e9aec04` | EXACT |
| `app-web/frontend/public/images/portal-workspace-light.png` | `3ce2d7c773b8aa8b5919d2ac498af0abbda472d1ede5ca441fdc4b2039b79c55` | EXACT |
| `app-web/frontend/public/images/portal-workspace-dark.png` | `c68bc640b82136e415490fbf103ef8a7789e4829d971f87d89648c20c33fb986` | EXACT |
| `app-web/frontend/public/architecture-and-security.html` | `6e1d1f74c09596bdd14c10095bc8b13c05fe379f4fe871ebd258e083765f5122` | EXACT |

---

## Live Verification Results

| Check | Result |
|---|---|
| `implicitex.com` HTTP status | 200 |
| `Cache-Control` response header | `no-cache, must-revalidate` |
| `X-Cache` | MISS (fresh response) |
| Live `index.html` SHA-256 | `e7956e8f...` — exact match |
| Live body vs local file diff | Byte-for-byte identical |
| Cache-busting repeat request | Same hash |
| `portal-workspace-light.png` | 200, `image/png`, 98791 bytes, exact hash |
| `portal-workspace-dark.png` | 200, `image/png`, 98559 bytes, exact hash |
| `architecture-and-security.html` | 200, 77056 bytes, exact hash |
| `/build-info.json` | 404 — not served |

### Required content markers (confirmed present in live response)

- `<figure class="settlement-visual">` — PRESENT
- `A clear path to settlement.` — PRESENT
- `A dedicated transfer workspace.` — PRESENT
- `Preparation, review, and confirmation remain separate.` — PRESENT
- `<section class="how-it-works" id="howItWorks" ...>` — PRESENT

### Visual sign-off (manual browser, private window)

- Desktop layout: PASS
- Mobile layout: PASS
- Light mode: PASS
- Dark mode: PASS
- Both settlement screenshots render: PASS
- Two-row header present: PASS
- Updated typography and palette: PASS
- Updated copy and page structure: PASS
- Navigation links functional: PASS
- No broken images or missing assets: PASS
- No stale copy observed: PASS
- No browser-console or network errors: PASS

---

## Worktree Inventory (at time of recovery)

| Worktree | Branch | Merged to `origin/main` | Cleanup decision |
|---|---|---|---|
| `implicitex` | `coincard/cc-001-handle-reservation` | No — active development | Keep |
| `implicitex-recovery-a9c8aea` | detached `a9c8aea` | — | Remove after this commit |
| `implicitex-change-001` | `change/001-production-build-identity` | No | Reconcile unique commits before removing |
| `implicitex-change-001r` | `integration/wp-02-canonical-reconciliation` | No — **incident source** | Reconcile unique commits before removing |
| `implicitex-codex-cc0023` | `coincard/cc-002.3-registry-state` | No — active CC-002 dev | Keep |
| `implicitex-review-signing-integration` | `coin-card-review-runtime-v2-signing-integration` | **Yes** | Remove worktree (not branch) |
| `implicitex-signing-rotation` | `coin-card-signing-rotation-infrastructure` | **Yes** | Remove worktree (not branch) |
| `implicitex-visible-review-runtime` | `coin-card-visible-review-runtime` | **Yes** | Remove worktree (not branch) |

Removing a worktree clears the duplicate directory. It does not delete the branch
reference. These are distinct operations. Cleanup removes worktrees only.

---

## Operational Doctrine (established by this incident)

> No production deployment may begin until the operator proves the absolute path,
> immutable commit SHA, clean state, Firebase project, hosting target, and complete
> artifact identity of the exact worktree performing the deployment.

Specific controls:

1. Always record `pwd` and `git rev-parse HEAD` immediately before issuing any deploy command.
2. Pin deploy sources to an immutable SHA (`git worktree add <path> <SHA>`), not to a branch name.
3. Generate a complete SHA-256 manifest of `app-web/frontend/public/` before deployment.
4. Run all predeploy gates from the exact worktree that will execute the deploy.
5. Verify live artifact hashes against the pre-deployment manifest after every production deploy.
6. `build-info.json` is gitignored but not Firebase-ignored. Verify it is absent from the deploy source before deploying `hosting:main`.
7. Worktree cleanup is a separate authorized operation — never fold it into a recovery or feature change.
