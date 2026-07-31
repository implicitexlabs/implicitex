# WP-02 post-publication repository checkpoint — 2026-07-30

Status: WP-02 active and paused; post-publication evidence complete; WP-03
inactive

Observation time: `2026-07-30T23:58:42Z`

## 1. Purpose and scope

This evidence-only checkpoint records the repository and deployment
consequences of the founder-authorized Comprehensive Roadmap Inventory
publication.

It supersedes earlier *current-state* descriptions that the WP-01 endpoint was
local-only or deliberately unpushed and that the WP-02 integration branch
contained evidence commits only. It does not rewrite or invalidate those fixed
evidence records as descriptions of their own observation times.

This checkpoint makes no application change. It does not deploy, merge, rebase,
resolve a conflict, activate WP-03, or change product authority.

## 2. Refreshed repository state

`origin` was fetched with pruning immediately before this checkpoint. The
following refs were then observed:

| Ref or role | Commit | Current meaning |
|---|---|---|
| Canonical remote default | `2cb92371f2a4a0018a70dedeebc23553f32ed668` | `origin/main`; unchanged |
| Integration HEAD before this checkpoint | `b2404ce1fc22e009da6eef5efc2bee770f5f4f29` | Publication evidence recorded on top of the bounded document integration |
| Remote integration branch | `b2404ce1fc22e009da6eef5efc2bee770f5f4f29` | `origin/integration/wp-02-canonical-reconciliation`; matched local before this checkpoint |
| Production publication commit | `937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278` | Exact source tree used for the Firebase `main` hosting deployment |
| Remote publication branch | `937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278` | `origin/docs/comprehensive-roadmap-publication-2026-07-30` |
| Approved WP-01 snapshot | `fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc` | Parent of the production publication commit |
| Earlier remote roadmap branch | `6bf16083de42696680b4301094e1c32c0e5d5181` | `origin/docs/product-commercial-roadmap-rev6`; unchanged |
| Common merge base | `9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84` | Common base for the integration and roadmap/publication histories |

`git branch -r --contains fb50068` now returns:

```text
origin/docs/comprehensive-roadmap-publication-2026-07-30
```

Therefore `fb50068` is remotely reachable as an ancestor of the publication
branch. Any earlier statement that it was local-only, deliberately unpushed, or
unavailable on `origin` is historical as of the publication authorization.

The integration branch was pushed as
`origin/integration/wp-02-canonical-reconciliation`. `origin/main` was not
updated.

## 3. Bounded partial integration

Commit `d82ecce9d14b8b8be66e88799589ff68005650c6` incorporated the following seven
non-conflicting WP-01 document files into the integration branch:

```text
app-web/frontend/public/comprehensive-roadmap.html
app-web/frontend/public/css/comprehensive-roadmap.css
app-web/frontend/public/data/comprehensive-roadmap.json
app-web/frontend/public/js/comprehensive-roadmap.js
app-web/scripts/generate_comprehensive_roadmap_data.js
app-web/scripts/test_comprehensive_roadmap_artifact.js
docs/product/comprehensive-implementation-inventory-2026-07-30.md
```

Commit `b2404ce1fc22e009da6eef5efc2bee770f5f4f29` then added publication evidence.

The accurate current description is:

> WP-02 has integrated one bounded, non-conflicting document set for an
> explicitly authorized publication and remains paused before payment-critical
> conflict resolution.

The branch is no longer evidence-only, and WP-02 is no longer paused before
*all* source integration. None of the 15 previously classified conflict paths
was modified by `d82ecce` or `b2404ce`.

## 4. Production publication scope qualification

The production commit
`937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278` differs from its parent
`fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc` in four files:

```text
app-web/frontend/public/comprehensive-roadmap.html
app-web/frontend/public/data/comprehensive-roadmap.json
app-web/scripts/generate_comprehensive_roadmap_data.js
app-web/scripts/test_comprehensive_roadmap_artifact.js
```

That is a Git-commit delta, not a complete statement of the live hosting delta.
Firebase Hosting published the complete configured
`app-web/frontend/public` directory from the production commit. The deploy log
reported 253 files in the hosting directory and uploaded four files, but no
complete predeployment-versus-postdeployment Firebase version manifest or
hosting-directory hash inventory was recorded.

The correct deployment claim is:

> The production commit differed from its `fb50068` base by four files. The
> deployment published the complete configured hosting directory from that
> commit. No complete predeployment-versus-postdeployment hosting-manifest
> comparison was recorded.

The passed predeploy release gate, generated-page parity check, exact
roadmap-artifact hash verification, and postdeployment Coin Card browser smoke
substantially reduce risk. They do not prove that only four production files
changed.

No rollback or redeployment is authorized by this qualification.

## 5. Dependency-tree provenance qualification

The production worktree did not contain its own installed dependency tree.
Verification and deployment used:

```text
NODE_PATH=/home/adenmediagroup/DevEnv/implicitex-change-001r/app-web/node_modules
```

The borrowed installation came from the WP-02 integration worktree.

The deployment commit and integration HEAD had the same
`app-web/package-lock.json` blob:

```text
d35c79940e65d5613975ce5e0d9add9d1df62afb
```

Their `app-web/package.json` blobs differed:

```text
production publication: c418a7b71fc6199e0cafeac0915752eb71d71580
integration worktree:   018b64fc6db297cc19a691ac1b077e5685487b8f
```

The observed package-file diff removed 15 script declarations on the
integration side; the declared dependencies and dev dependencies were
unchanged. `npm --prefix app-web ls --depth=0` showed the declared top-level
packages and also reported `@emnapi/runtime@1.11.1` and
`@img/sharp-wasm32@0.35.1` as extraneous.

The matching lockfile and unchanged dependency declarations support the test
result, but they do not prove that the installed modules were recreated from
the production commit or that undeclared installed-package differences could
not affect a script. The build was therefore not fully isolated or independently
reproduced from the production worktree.

No redeployment is automatically required. This provenance limitation must
remain attached to the publication evidence.

## 6. Current prospective merge preview

Because the publication created a new roadmap-side head that preserves the
published overlay, the current prospective preview used:

```text
git merge-tree \
  9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84 \
  b2404ce1fc22e009da6eef5efc2bee770f5f4f29 \
  937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278
```

The endpoints diverge by:

```text
21 commits unique to the integration side
81 commits unique to the publication side
```

The read-only preview returned exactly the original 15 conflict candidates:

```text
changed in both | .gitignore
changed in both | app-web/frontend/public/card/card.js
changed in both | app-web/frontend/public/card/coin-card-lifecycle-bundle.js
changed in both | app-web/frontend/public/card/coin-card-manifest.json
changed in both | app-web/frontend/public/card/coin-card-verification.js
changed in both | app-web/frontend/public/card/index.html
changed in both | app-web/frontend/public/js/ix-execution.js
changed in both | app-web/scripts/generate_signed_coin_card_acceptance.js
changed in both | app-web/scripts/test_coin_card_integrity.js
changed in both | app-web/tests/browser/coin-card-qr-browser.test.js
changed in both | app-web/tests/frontend/coin-card-lifecycle-publication.test.js
added in both | app-web/tests/frontend/coin-card-review-runtime-prerequisites.test.js
changed in both | app-web/tests/frontend/coin-card-runtime-trust-conjunction.test.js
changed in both | app-web/tests/frontend/coin-card-signing-generator.test.js
changed in both | app-web/tests/frontend/coin-card-verification.test.js
```

Two exact path-restricted comparisons passed with no differences:

1. `origin/main` versus `b2404ce` across the 15 classified paths;
2. `fb50068` versus `937c7c7` across the 15 classified paths.

The merge base also remains unchanged. Therefore the blob inputs and prior
rationales for the original 15 paths remain applicable:

```text
Mechanical reconciliation: 3
Behavioral reconciliation: 9
Governance escalation: 3
Total: 15
```

The three governance-escalation paths remain:

```text
app-web/scripts/generate_signed_coin_card_acceptance.js
app-web/tests/frontend/coin-card-lifecycle-publication.test.js
app-web/tests/frontend/coin-card-signing-generator.test.js
```

No index or worktree merge state was created.

## 7. Historical fixed-endpoint sensitivity

The original WP-02 evidence fixed `fb50068` as the roadmap endpoint. A second
read-only preview therefore tested the current integration HEAD against that
unchanged historical endpoint:

```text
git merge-tree \
  9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84 \
  b2404ce1fc22e009da6eef5efc2bee770f5f4f29 \
  fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc
```

Those endpoints diverge by 21 integration-only / 80 roadmap-only commits. The
preview contains the same 15 payment-critical candidates plus four add/add
document artifacts:

```text
added in both | app-web/frontend/public/comprehensive-roadmap.html
added in both | app-web/frontend/public/data/comprehensive-roadmap.json
added in both | app-web/scripts/generate_comprehensive_roadmap_data.js
added in both | app-web/scripts/test_comprehensive_roadmap_artifact.js
```

These four arise because the integration branch contains the founder-approved
publication overlay while `fb50068` contains the pre-publication
“local/uncommitted” labels and assertions. The other three files introduced by
`d82ecce` are byte-identical to their `fb50068` versions and do not conflict.

This checkpoint does not silently change the fixed endpoint. It records:

- the 15-path 3/9/3 result is unchanged when the current publication head
  `937c7c7` is the roadmap-side endpoint;
- the literal historical `fb50068` endpoint now produces 19 preview
  candidates, four of which are bounded document-overlay add/add artifacts;
- WP-02 must explicitly record the applicable roadmap-side endpoint before any
  merge or conflict-resolution action.

The four document artifacts do not alter the classification of the original 15
payment-critical paths.

## 8. Published-overlay maintenance risk

The deployed current-control overlay is manually encoded. It is accurate for
the observation recorded in publication evidence `b2404ce`, but it will become
stale when WP-03 activates or control otherwise changes.

No application edit is authorized by this checkpoint. On the overlay's next
authorized revision, it should identify its observation date and durable
evidence anchors, including:

```text
Operational overlay observed July 30, 2026
WP-02 starting evidence: eb73070
Freshness gate: 6952cf6
Publication evidence: b2404ce
```

An undated “Current control state” label must not be treated as durable
authorization evidence.

## 9. Gate disposition

- The publication stands; no rollback or redeployment is authorized.
- WP-01 remains closed and is not reopened.
- WP-02 remains the sole active work package.
- WP-02 remains paused before payment-critical conflict resolution.
- WP-03 remains inactive.
- No merge or conflict resolution is authorized.
- The earlier no-push condition is superseded by the explicit publication
  authorization.
- The integration branch is accurately classified as a bounded partial
  integration plus evidence, not evidence-only.
- The next control action, if separately authorized, is formal activation of
  the bounded WP-03 signing-and-lifecycle authority decision packet.
