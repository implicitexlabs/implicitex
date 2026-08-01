# WP-02 Canonical Repository Reconciliation — Starting Evidence

Status: WP-02 active — starting evidence complete; conflict resolution not authorized

Observed: 2026-07-30T16:32:26-06:00

Evidence branch: `integration/wp-02-canonical-reconciliation`

Evidence state: uncommitted

Fixed roadmap commit: `fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc`

Canonical remote-tracking head: `refs/remotes/origin/main` at `2cb92371f2a4a0018a70dedeebc23553f32ed668`

Known merge base: `9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84`

## 1. Scope and non-actions

This record captures the bounded work that activated WP-02: starting-state
capture, creation of the dedicated integration branch, a read-only merge
preview, and classification of every previewed conflict. WP-02 is now paused at
founder review; conflict resolution is not authorized.

No conflict was resolved. No merge was initiated. No integration result or
evidence was committed. Nothing was amended, rebased, force-pushed, pushed,
deployed, published, or converted to PDF. WP-03 was not activated.

The remote-tracking references recorded here are the references locally
available at the time of capture. No fetch was performed during this bounded
change.

## 2. Starting repository state

The source worktree was clean on
`docs/product-commercial-roadmap-rev6` at
`fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc` immediately before the branch
switch.

The dedicated integration branch was then created directly from canonical
`refs/remotes/origin/main`:

```text
git switch -c integration/wp-02-canonical-reconciliation refs/remotes/origin/main
```

The resulting branch state is:

```text
branch:   integration/wp-02-canonical-reconciliation
HEAD:     2cb92371f2a4a0018a70dedeebc23553f32ed668
upstream: origin/main
```

The branch switch exposed one pre-existing generated file as untracked:

```text
?? app-web/frontend/public/build-info.json
```

The file was ignored by the fixed roadmap branch at `.gitignore:40`, but the
canonical `origin/main` version of `.gitignore` does not ignore it. It was not
created, edited, staged, or adopted during WP-02 preparation. During the
evidence-closing pass it was preserved outside the repository at
`/tmp/implicitex-wp02-build-info-b664563-2026-07-30.json`, then removed from the
working tree as explicitly authorized. Its SHA-256 before and after the move is:

```text
1709730d6d878d6cfe11e47ede72a82ec8a1a6bb32de3889754eb95634bf2a96
```

Its embedded commit is
`b6645636005f48397fd2b90c7b0770fe141085da`. After the move, the only
working-tree change is this evidence record.

## 3. Relevant branch heads

| Reference | Full hash | Qualification |
|---|---|---|
| `refs/remotes/origin/main` | `2cb92371f2a4a0018a70dedeebc23553f32ed668` | Canonical integration base |
| `integration/wp-02-canonical-reconciliation` | `2cb92371f2a4a0018a70dedeebc23553f32ed668` | New local branch, tracking `origin/main` |
| `docs/product-commercial-roadmap-rev6` | `fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc` | Fixed local WP-01 roadmap commit |
| `refs/remotes/origin/docs/product-commercial-roadmap-rev6` | `6bf16083de42696680b4301094e1c32c0e5d5181` | Remote V1-plan publication source |
| `main` | `9ce0b182ab3dcc64b18f28f4d809957193a83576` | Stale local branch; 707 commits behind `origin/main`; not used |
| `refs/remotes/origin/coincard/cc-001-handle-reservation` | `1cf48fe70f56dab8ddedccf0817e67d07567f811` | Remote branch containing the live portal build commit |
| `coincard/cc-001-handle-reservation` | `a9c8aeadea619b0e6d2147886024bcb3b0b92ad9` | Local worktree branch; five commits ahead of its remote |
| `gate3-production-frontend-qa` | `b8ef21ab602aa5662f8de20fa8f8cfb432976330` | Local production-QA branch |
| `refs/remotes/origin/gate3-production-frontend-qa` | `edb1c6a3cd0c213f05dfb2d9582b6a02b204068d` | Remote production-QA branch |

The dedicated integration branch did not exist before this change. Neither
existing history was rewritten.

## 4. Topology and divergence

The common merge base is:

```text
9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84
```

The canonical head compared with the fixed local roadmap commit is:

```text
origin/main...fb50068 = 17 commits unique to main / 80 unique to roadmap
```

The canonical head compared with the remote roadmap/deployment branch is:

```text
origin/main...origin/docs/product-commercial-roadmap-rev6
= 17 commits unique to main / 79 unique to the remote roadmap branch
```

The 80th local-roadmap commit is the fixed WP-01 commit
`fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc`, which has deliberately not been
pushed.

## 5. Complete main-unique commit list

The 17 commits in
`9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84..2cb92371f2a4a0018a70dedeebc23553f32ed668`,
oldest first, are:

```text
4112da465a9e573fbec3c0152c4726d1aa7ac184 | 2026-07-16T12:43:57-06:00 | feat: add Coin Card signing rotation infrastructure
013ee5a1533e159dda2977f33b0329a64688b0d5 | 2026-07-16T13:27:08-06:00 | Publish signed Coin Card review runtime v2
f092f05610b6f41296302f815a621969ce39edf2 | 2026-07-17T12:26:37-06:00 | feat: add canonical gas policy module for Coin Card Polygon V1
f232ebc4b1196bab9a2f26d32125db9668d75aea | 2026-07-17T13:36:35-06:00 | feat: add Phase 2A policy applicability observer
c0191722aaa87ee4238306879dccb82958fa7da6 | 2026-07-17T13:44:50-06:00 | feat: wire canonical gas policy into execution engine
a27cbc3fb6616ad4f06cbadee577436c1ee1d9eb | 2026-07-17T13:53:01-06:00 | feat: add Coin Card review projection runtime
61e52682db88404cedf46e0d31663a789125de32 | 2026-07-17T17:36:44-06:00 | feat: integrate visible Review into Coin Card runtime
c0a7ac86ebace4504cebc7cc1dd76d85c29dded3 | 2026-07-17T18:16:38-06:00 | refactor: centralize Coin Card gas policy identity
5278414c04f2218fbc0120e2663f8a8c55aaa9f5 | 2026-07-17T18:31:16-06:00 | style: complete Coin Card visible Review presentation
627586a00a2bbb9135d8d669297d853cd809636c | 2026-07-18T16:21:35-06:00 | fix: restore canonical Coin Card geometry
715a68586aad9199896ebfeea2458a645db31ca0 | 2026-07-19T00:44:04-06:00 | test: add controlled Polygon fork acceptance suite
ee0ee099a281535c0ab8de892c7e9fa7eed59648 | 2026-07-19T01:00:53-06:00 | evidence: polygon fork acceptance checkpoint 2026-07-19
2d74bf720e110daf71a626a9b6b7bfc3a030dc50 | 2026-07-19T01:07:51-06:00 | evidence: record Polygon fork acceptance suite provenance
4c8931ea40768a8246a92bcb017bfe4603e0cfac | 2026-07-19T01:24:48-06:00 | evidence: live Polygon applicability observation 2026-07-19
830f1f334beade800d9a9f066c5978cbc5dcf52d | 2026-07-19T03:37:03-06:00 | feat: publish signed Coin Card visible review runtime v3
53eefa63596a7bc5cc893bca079bf3d8ed779491 | 2026-07-19T04:02:00-06:00 | test: derive lifecycle publication fixture from signed artifacts
2cb92371f2a4a0018a70dedeebc23553f32ed668 | 2026-07-19T04:23:57-06:00 | Merge coin-card-visible-review-runtime: signed Coin Card visible Review runtime v3
```

## 6. Complete roadmap-unique commit list

The 80 commits in
`9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84..fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc`,
oldest first, are:

```text
dd183b99b4f282c7bc0162bc0d8e896246c170ed | 2026-07-19T18:29:28-06:00 | feat: fee cap policy + product constitution
96825f9245990fcdc9bab2b0d36811f52a549a0d | 2026-07-19T18:32:41-06:00 | ops: add fee cap gate to chains.js and roadmap
56f0378e0e7e5506e78e777d452c1c8844c59e58 | 2026-07-19T18:35:42-06:00 | ops: clarify fee cap gate — divergence begins strictly above 1,000 USDC
1341db5ab568e2c16636aab6f440e34ba6225638 | 2026-07-19T18:43:23-06:00 | docs: resolve identity evidence schema semantics
25c397a3585971512982f87f546131b3121a358e | 2026-07-19T19:04:52-06:00 | docs: wallet-control authority matrix (DRAFT)
d58dbfe61e42c00bbe6c37404dbeb05650696598 | 2026-07-19T19:11:34-06:00 | docs: adversarial review of wallet-control authority matrix
10cf0a1d807409c2dd1371d9ae133f7eadf32515 | 2026-07-19T19:14:10-06:00 | docs: evidence protocol overview + matrix freeze gate
a63da3e3b7f606818147307e9cc62421e0d63c92 | 2026-07-20T17:34:20-06:00 | feat: refine Transfer Portal hierarchy and install experience
d5a1ac4b5e0116c14c5a6c1f6850e8b6b28ec747 | 2026-07-20T17:52:00-06:00 | docs(ops): add portal framing and safe-area evidence artifacts
c6e2b286fc57ade592fcd5cef077b001eb9dfba8 | 2026-07-20T17:52:12-06:00 | feat(coincard): wire review projection contract into execution runtime
74920fabd88844c69546830c1fa9703df728e20b | 2026-07-20T17:52:21-06:00 | feat(coincard): add provisioning script, schema lifecycle fields, and constitution
758c96708b16eebcaf0d516f84e10917896d8d11 | 2026-07-20T17:52:28-06:00 | feat(infra): add Coin Card hosting target and coincard/ public directory
0e087efdb22e6a7f842067439b231015d3b2a27e | 2026-07-20T18:19:06-06:00 | fix(portal): remove orphan </div> that ejected modules from grid container
80751604047bef418012eb3b4b8287dc364be362 | 2026-07-20T18:26:59-06:00 | test(portal): add browser containment regression test for modules grid
36d082ee41ecf938a75a4cd43fd497e86b85f507 | 2026-07-20T18:33:34-06:00 | chore(deploy): wire portal-integrity test as predeploy:portal gate
e8d6010dbdbbf9c79e8ff696b21590d2d2f4b6ec | 2026-07-20T18:35:49-06:00 | chore(deploy): enforce portal integrity test through Firebase predeploy hook
2bb3f5af5ea83561ba95f78bded24f201205fc29 | 2026-07-20T18:40:53-06:00 | docs(evidence): preserve portal containment acceptance artifacts
a02fe4150337bede648ccd0043210123ea848b56 | 2026-07-20T19:02:30-06:00 | fix(portal): make mobile header title legible; tighten regression test
cce76868dbb0b01f82c64a1fd43ba2f1f9e708b2 | 2026-07-21T01:30:29-06:00 | fix: restore mobile nav tabs broken by portal-frame-brackets DOM position
56e1a2fff840a2e48deac60d51ac7d1516eb2b95 | 2026-07-21T02:15:17-06:00 | fix(coincard): decouple cc-card surface from Portal palette tokens
22a4bd2f4414e4943f6a376674a754da33a2a7ff | 2026-07-21T02:54:57-06:00 | fix(portal): tighten header identity and install strip
97f04b549a6d4a57c69bfd7aa5c96b7930aeb688 | 2026-07-22T03:16:45-06:00 | docs(coin-card): reconcile evidence authority promotion
aafb409fae62af27c8d344c980ea9cda16b08580 | 2026-07-22T03:34:45-06:00 | docs(coin-card): seal evidence authority stack
e8fb1ed991de7fec5f011499d3e94fb61bc8a2ad | 2026-07-22T04:21:01-06:00 | feat(coin-card): validate executable registry records
26f56513b23c04b68196fee4e78863df4e246870 | 2026-07-22T11:39:39-06:00 | feat(coin-card): validate transaction evidence content
8d34e4fc2d203727370890125094c9a5df410618 | 2026-07-22T13:40:31-06:00 | docs(coin-card): seal transaction evidence v2 authority
2c35a6287eeb384ba1c15faabff264eb27fb397d | 2026-07-22T15:39:09-06:00 | feat: apply ImplicitEx Alloy palette
1ff737844b5f56fd3b2689e9501b14547665eca1 | 2026-07-22T15:52:37-06:00 | fix(firebase): map portal target to implicitex-portal hosting site
5c93ad61654cb959e3c59ef8d58d9d05894c2e1d | 2026-07-22T16:23:08-06:00 | copy(structure-pass): editorial hierarchy and install strip
4b4ffc43dae9951631b5ac10be6ccc5ecb1cc993 | 2026-07-23T15:16:54-06:00 | fix(portal): preserve transfer execution dependency
b18b83f6fe7242af9c1a98a94166f8fcc1e577f9 | 2026-07-23T18:40:32-06:00 | docs: add transaction flow evidence packet
58fc58877fde15db89f898c2e7fafc54615d29cd | 2026-07-23T18:51:49-06:00 | docs: refine review packet framing
c4a801cd2460eb4dd09d310e85137bb868e49bf1 | 2026-07-23T22:02:51-06:00 | fix(receipt): permit transfer-only lifecycle and guard clearActive
5ba90e625ec67b580871a1fb0a169dddb2fb840f | 2026-07-23T22:23:19-06:00 | fix(portal): add initialization dependency guard
269d594ff4438eeaf6afdc9e96bc0dcf3ce8cfc9 | 2026-07-23T22:23:23-06:00 | build(deploy): add predeploy doc gate and sitemap entry for architecture page
4f5cd3a5d7cc6c0f9ab1cfce7dad3ed221534ed8 | 2026-07-23T22:52:34-06:00 | fix(portal): correct fatalError visibility — display:none replaces hidden attribute
4a6e690ae2a803fe65243c2cdc9967dd412c545d | 2026-07-23T23:35:00-06:00 | Replace broken-flow screenshots with confirmed-transaction evidence (block 90776572)
17950a1f3d2451f3e55c584811ac110dbf35aa00 | 2026-07-23T23:48:44-06:00 | Fix metadata fields erased by state-transition patches (purposeTag/referenceId/memo)
814bb93fbb1055bc839f067cb1112ce134d3b2e8 | 2026-07-24T00:43:52-06:00 | Add transfer-only proof packet; remove hand-built reconstruction; document both paths
bcedb1cb82072fc14af93afca3c1db709e34a5e8 | 2026-07-24T00:58:53-06:00 | Add verification-architecture.md governing document
ecd61bc2ccfe754439aa2058c16fbee0270a2448 | 2026-07-24T01:02:45-06:00 | Release Blockaid review packet as v1.0
96caf94211bfd9ad819524a148d67c363ee0d494 | 2026-07-24T01:26:06-06:00 | Add v1.0 PDF artifact; update builder and public page to v1.0 source
6daed40b48b4426394b124b39c9e871f4c1b54e1 | 2026-07-24T01:36:08-06:00 | Normalize smart quotes to ASCII in v1.0 canonical; regenerate artifacts
195537d6b5798537f49fab966b08ffbf95160e2b | 2026-07-24T02:27:23-06:00 | Add PP-02 approval-path certification run; restructure §7.7 evidence record
984f3c47581d32a5c4c1dddf6fd8b1396c3fe98e | 2026-07-24T02:33:51-06:00 | Record PP-02 provenance, setup tx, and receipt-display parity gap
14ff246b06cc1db334ea70b66f411355869b23c3 | 2026-07-24T03:02:23-06:00 | Release review packet v1.1 — seven targeted insertions from external review pass
496e9ffb00bbb640a6eba77365726a527830a217 | 2026-07-24T03:11:03-06:00 | v1.1.1 — correct §7.7.3 transfer-only allowance wording
46d01b43dea6e2790a15b7065f3a939dfe22b8b3 | 2026-07-24T03:18:35-06:00 | Artifact separation — retain v1.1 as frozen release, promote v1.1.1 to named files
dc750ae2e44089c1f1a58e2f43bbfa53545f53e4 | 2026-07-24T03:25:40-06:00 | Remove v1.0 and v1.1 working-tree artifacts — Git history is the archive
d3ad2b0853bed0a89d52910fc8a6f4e597eb4e11 | 2026-07-24T03:47:45-06:00 | v1.1.2 — remove Blockaid ticket numbers from public document
f42c777e05616d6859df2edad510b6e025f2fc39 | 2026-07-24T03:53:12-06:00 | v1.1.2 fix — correct footer version string from v1.1.1 to v1.1.2
7fcf185185269c928f572fc6569f87662142bbc2 | 2026-07-24T04:00:53-06:00 | Add social card for Architecture and Security Overview v1.1.2
b37efe2e0dbc41afad0f0c3e2097ecf6ef8235e0 | 2026-07-24T04:09:06-06:00 | Update social card — lockup logo lower-left, no duplicate header
388abd32d5b189e689e538a7908d938b936a5fae | 2026-07-24T04:18:21-06:00 | Update social card — Orbitron/Inter/IBM Plex Mono, branded palette only
8f5e28783bb553f62609b227124413c6a0e49e87 | 2026-07-24T04:20:56-06:00 | Update social card — remove grid lines
38ff51d79d99035f3ea0311ac9cbd300eefd9544 | 2026-07-24T04:49:57-06:00 | Add portal launch sequence and Android maskable icons
324acdbb6266217bc0a3ba8a57ae9f52ce30e92e | 2026-07-24T13:52:18-06:00 | Portal shell release candidate — sticky nav, canonical footer, install intent
3195d75cb4a2a988c38df69d722f2f4871abf726 | 2026-07-24T14:00:31-06:00 | Wire full predeploy:portal gate into firebase.json portal hosting target
a82de941cfd41ce8a6f8da5bda9df4a9f3215216 | 2026-07-24T14:55:40-06:00 | fix(portal): four iPhone QA defects — wrong-network, tabs, workspace, strip
9d6b65bdd4cf7d8a9da2ad54de32950b02d97cef | 2026-07-24T15:27:52-06:00 | fix(portal): separate contract retry from network switching
e715ebc9a43db47863882c4f9b39caaf27833ca8 | 2026-07-24T16:41:26-06:00 | Refine portal header and footer hierarchy
2b40aec3dfb4c09e13e383cb2ac053ea16103826 | 2026-07-24T17:45:03-06:00 | Refine portal navigation outlines and frame brackets
e345885daf26cf5767409589a62c3461ae13a7be | 2026-07-24T18:54:33-06:00 | feat(portal): establish modern application shell and design tokens
4c172907788ac03a2eea9ba7e3b84cfeeaca1233 | 2026-07-25T02:07:15-06:00 | refactor(portal): tighten typography scale and tracking
317f40baa2861163b29b0674d9a0f3a8c6dc54f3 | 2026-07-25T13:41:18-06:00 | feat(ui): unify header height, restyle portal button, fix GWEI states, cap iPad wallet width
3ba09965674848ded32dea1c3a8d55efdf73a144 | 2026-07-25T13:45:28-06:00 | fix(ui): expand tablet wallet cap to 1180px, reframe fullscreen rule, fix GWEI error copy
7ea5ac055fe6e7385c4746f062957724ded0f78b | 2026-07-25T14:30:55-06:00 | fix(mobile): safe-area nav clearance and world map aspect ratio
22ea21025c6526ed898b219b5ff56ac50e672de0 | 2026-07-25T14:31:38-06:00 | fix(build): add viewport-fit=cover to architecture-and-security.html template
1988302a838cf5355a37a33c8fe33111c8c4ac51 | 2026-07-25T15:28:35-06:00 | Fix 5 mobile/portal regressions: safe-area reinforcement, teal nav buttons, brackets, wallet width, select arrow
7bf5066f490d1a5f262f5021a8ae35b1ed15bdb3 | 2026-07-25T15:40:47-06:00 | fix(hosting): add no-cache header for CSS files on main and portal targets
24705ba057c54fd23afa4c2f0809ca6ec39a839f | 2026-07-25T17:56:59-06:00 | feat(coincard): restore signed production verification gate
6b83d768247ee6dfb8a4765145dc046a8563dfc9 | 2026-07-25T18:04:42-06:00 | feat(coincard): add wallet ownership proof boundary
e374bd582f976097b5cc9a82a2ad09750c35b618 | 2026-07-25T18:50:52-06:00 | chore(coincard): migrate wallet proof runtime to Node 22
1338dd7cf8eee7b1f096bbc9bd2a699eaf0af0cb | 2026-07-25T19:34:28-06:00 | chore(coincard): add fail-closed Gate 1A staging gate
4ddd43f308d756d1241d709ca08fb1638b8c0e0d | 2026-07-26T01:17:48-06:00 | feat(portal): add production build identity — build-info.json + UI version surface
6619f13c306dd488906b39bc6e61768c41254778 | 2026-07-26T02:26:03-06:00 | merge: Change 001 — production build identity (4ddd43f)
b6645636005f48397fd2b90c7b0770fe141085da | 2026-07-26T04:03:04-06:00 | fix(portal): expose build identity in Settings sheet for mobile diagnostic
ec781782f392b0d4f91458418ee4e02dac700981 | 2026-07-30T12:25:45-06:00 | docs(product): consolidate one-year commercial roadmap
6bf16083de42696680b4301094e1c32c0e5d5181 | 2026-07-30T12:59:20-06:00 | docs(site): publish V1 execution plan
fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc | 2026-07-30T16:02:54-06:00 | docs(product): complete WP-01 comprehensive roadmap review
```

## 7. Read-only merge preview

Git 2.34.1 does not provide the newer `git merge-tree --write-tree` mode. The
preview therefore used the read-only three-tree form:

```text
git merge-tree \
  9f4f2d0632f268cf1d8bfe8fcd7cf2f640054c84 \
  2cb92371f2a4a0018a70dedeebc23553f32ed668 \
  fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc
```

The preview found exactly 15 conflict candidates. No index or worktree merge
state was created.

The total endpoint deltas over these 15 paths are:

```text
canonical main versus merge base: 4,469 insertions / 346 deletions
roadmap endpoint versus merge base: 1,114 insertions / 113 deletions
```

## 8. Exact conflict preview and classification

Resolution-order groups are numbered according to the authorized risk order:

1. repository and build configuration;
2. shared schemas and constants;
3. Coin Card authority and lifecycle;
4. execution boundary and provider continuity;
5. manifest, signatures, verification, and evidence;
6. portal integration and user interface;
7. tests and generated artifacts;
8. documentation.

| # | Path | Preview | Base / main / roadmap blob | Bucket | Order | Classification rationale |
|---:|---|---|---|---|---:|---|
| 1 | `.gitignore` | changed in both | `729f82420976699a84502e88bb418f6fa2e1dc9e` / `dc5478561c554ceedf88381eaa6784eb2d7e8c77` / `c09f18ed4217022147f92f5ba61f4f35e466d49d` | Behavioral reconciliation | 1 | The final resolution must adopt the already-approved generated build-identity policy after verifying which generated outputs are authoritative and how release generation and clean-worktree enforcement must behave. |
| 2 | `app-web/frontend/public/card/card.js` | changed in both | `432290cc6a2761b8c23afe74edeac817426db53a` / `221c1541749fed80ab9114a3606831c7b901f6b0` / `7f09065833b5ea0d360c981518d1352293374808` | Behavioral reconciliation | 6 | Both endpoints implement approved card/runtime behavior; the result must preserve current Review, lifecycle, provider-continuity, and later portal integration requirements. |
| 3 | `app-web/frontend/public/card/coin-card-lifecycle-bundle.js` | changed in both | `edd3ae1e9c901d73f20fc4bc1a8705941ab8fa48` / `2ace1fcd472ec783c91c5f1a1baba31b5952a928` / `39a18d60bfc446685760eea8c1e946b5e31e00bb` | Mechanical reconciliation | 7 | Generated artifact. Do not hand-resolve; regenerate only after signing and lifecycle authority is ratified. |
| 4 | `app-web/frontend/public/card/coin-card-manifest.json` | changed in both | `d8352c0246e7b6f04a34f3b163984bf5c9545682` / `45f08eb28be1cc662f829a8e24293c5a18da1bee` / `dfafe32b0f0ef22b427b7abc54a837c95af673c9` | Mechanical reconciliation | 7 | Generated artifact. Do not hand-resolve; regenerate after authoritative protected assets, build identity, and key identity are settled. |
| 5 | `app-web/frontend/public/card/coin-card-verification.js` | changed in both | `987d5341bc78536afbdaa49a34a6cef636592975` / `6ad67158dc3a30d58fe9e45707ca7ea121984c93` / `71e40a3ba217184d0c03269af54e19796568cb5d` | Behavioral reconciliation | 5 | Preserve main’s later runtime verification and roadmap’s protected-root asset, route-verification copy, and non-identity caveat under existing governing records. |
| 6 | `app-web/frontend/public/card/index.html` | changed in both | `6333abb080a3472df81ad2b5032d47f84e88cbeb` / `e78e65dbdb944f291cd10fbc9714cdbbe318af5e` / `74c532e57f221964ae5c73989427ce779522164e` | Behavioral reconciliation | 6 | Preserve current Review/gas-policy integration and approved later presentation/handoff behavior; no new authority choice is required. |
| 7 | `app-web/frontend/public/js/ix-execution.js` | changed in both | `ec60c2b62aece617d8a43ddcd893517f59199247` / `4677098f8e9cab920604050604c02a92fda0ddc1` / `7827e7aa17b798ec18680eb979faf9fd3380307f` | Behavioral reconciliation | 4 | Preserve the deployed contract’s actual limit behavior, the approved portal min/max policy from governing records, main’s gas-policy and execution-plan binding, and approved receipt-metadata fixes. Do not import the roadmap branch’s 10-USDC runtime cap unless an existing governing record authorizes it. |
| 8 | `app-web/scripts/generate_signed_coin_card_acceptance.js` | changed in both | `7565fefca5f194a30d1deb7097de395570061204` / `b2fffa472b091976255d8cbc801d5a10fd3991dd` / `d1b9177a3fe5184fba51fa7d64f3c82c6a124783` | Governance escalation | 3 | Choosing between main’s rotation/immutable production-key rules and roadmap’s later v1/multi-card publication would decide signing and lifecycle authority. |
| 9 | `app-web/scripts/test_coin_card_integrity.js` | changed in both | `964f65115f9ea8908a286ea8a728f7ee52533e2c` / `6404d0656f567793c6a0f8957694b70dd9ea4f08` / `7d26bdc691aabf14add4cb15d1f7b70b646292fa` | Mechanical reconciliation | 7 | Expected artifact set and hashes must be regenerated from the reconciled authoritative sources rather than selected by hand. |
| 10 | `app-web/tests/browser/coin-card-qr-browser.test.js` | changed in both | `140b93adf1d9aa747da971c14c39976e6dee17c2` / `0d99b834c8a624c3bf6ad41ed77df93a38cbcbeb` / `87424e0c74ee7a16ef49509fc56cbb8788054e28` | Behavioral reconciliation | 7 | Test must cover the reconciled, already-approved QR/review/handoff behavior; it does not independently choose authority. |
| 11 | `app-web/tests/frontend/coin-card-lifecycle-publication.test.js` | changed in both | `fbccfcc1092508cc3beec1d713d7978eb0fe849a` / `0e6427da31252b679200f75a590811d432943511` / `cd57ca524038c63bcfef23befe954c6ce8bf822a` | Governance escalation | 3 | The competing assertions encode different lifecycle publication, rotation, and preservation rules. |
| 12 | `app-web/tests/frontend/coin-card-review-runtime-prerequisites.test.js` | added in both | absent / `687649233a8cd4ad8810e349d5093186dbb0583b` / `ee78c8b51c0ce940e3c45a71fce61789b1c93307` | Behavioral reconciliation | 7 | Both additions test Review prerequisites; combine coverage after the governed runtime is reconciled. |
| 13 | `app-web/tests/frontend/coin-card-runtime-trust-conjunction.test.js` | changed in both | `ab8996ffb9e1b0e77f744cdb0b0c93cb41f93c45` / `6185ca6be891358f3fbea207fce3293e1def8ea7` / `95551c43a110e6fcc196253c498138e6aab70f72` | Behavioral reconciliation | 7 | Preserve the approved fail-closed conjunction and later protected-asset requirements; the test follows the governed trust model. |
| 14 | `app-web/tests/frontend/coin-card-signing-generator.test.js` | changed in both | `aed606b4f7f2e2561467894781defff9f951cc8d` / `f8e1106f793b29e308ef3141d1c766e3c394f2f4` / `a2053effc4d2098d8170c5643b7be80d1c334f95` | Governance escalation | 3 | The competing expectations encode reserved key identities, signer separation, rotation, and multi-card publication authority. |
| 15 | `app-web/tests/frontend/coin-card-verification.test.js` | changed in both | `4eea531f2ee27e938392bb8745c08e244aa1f21f` / `d295a69835c13f48fc33769ae7cf9188c72d8be5` / `e64d46330f9a7225e0e9e8ce4a583df3b3fc6ff3` | Behavioral reconciliation | 7 | Preserve combined verification coverage after the authoritative verification runtime is behaviorally reconciled. |

Classification totals:

```text
Mechanical reconciliation: 3
Behavioral reconciliation: 9
Governance escalation: 3
Total: 15
```

The three governance-escalation candidates are:

```text
app-web/scripts/generate_signed_coin_card_acceptance.js
app-web/tests/frontend/coin-card-lifecycle-publication.test.js
app-web/tests/frontend/coin-card-signing-generator.test.js
```

They identify one bounded signing-and-lifecycle authority decision packet with
five explicit sub-decisions:

1. reserved production key identity;
2. signer separation;
3. rotation rules;
4. lifecycle preservation rules;
5. multi-card publication authority.

The decision packet must record a separate outcome for each sub-decision. A
single broad approval of “signing and lifecycle authority” cannot implicitly
ratify an unrecorded outcome for any of the five.

No decision is made here. Before any of these three files is resolved, WP-02
must pause and a specifically authorized, bounded WP-03 decision must be
ratified. Control must then return to WP-02. The rest of WP-03 remains closed.

## 9. Conflict-resolution entry gate

Before any merge or conflict resolution begins, fetch `origin` and revalidate:

1. `origin/main`;
2. the fixed roadmap endpoint;
3. the merge base;
4. ahead/behind counts;
5. the exact conflict count and paths.

If any endpoint or conflict set changes, stop and update this starting evidence
before proceeding. The fetch and revalidation are mandatory entry actions for
the next separately authorized change; they were not performed during this
evidence-closing change.

## 10. Production and deployment identity

Production does not presently expose one branch-qualified identity for the
whole site. The evidence supports the following narrower statements.

### Portal

At observation time,
`https://implicitex-portal.web.app/build-info.json` returned:

```json
{
  "app": "implicitex-portal",
  "environment": "production",
  "commit": "a9540c2fd3789f2ff778d08659d867a92468e33f",
  "shortCommit": "a9540c2",
  "buildTime": "2026-07-28T22:37:25.800Z",
  "dirty": false,
  "hosting": {
    "project": "implicitex",
    "site": "implicitex-portal"
  }
}
```

Commit `a9540c2fd3789f2ff778d08659d867a92468e33f` is present in:

```text
refs/remotes/origin/coincard/cc-001-handle-reservation
coincard/cc-001-handle-reservation
coincard/cc-002.3-registry-state
gate3-production-frontend-qa
```

The metadata proves the deployed portal content commit, but it does not name
the source branch. The remote branch shown above is the available remote
production-content history containing that commit; this record does not infer
which branch issued the deployment.

### Main site

At observation time, `https://implicitex.com/build-info.json` returned commit
`b6645636005f48397fd2b90c7b0770fe141085da`, build time
`2026-07-26T10:10:53.404Z`, and hosting metadata naming the
`implicitex-portal` site. It is therefore stale or mis-scoped for proving the
current main-site deployment and is not treated as an authoritative main-site
identity.

The live V1 execution artifacts can be proved independently:

| Artifact | Live SHA-256 | `6bf1608` SHA-256 | Result |
|---|---|---|---|
| `/v1-execution.html` | `b6cbde7367e014fbce0aaf98c7c68bf2e171317f25c032ace0594c505116a167` | `b6cbde7367e014fbce0aaf98c7c68bf2e171317f25c032ace0594c505116a167` | Exact match |
| `/downloads/implicitex-v1-execution-plan-rev6.pdf` | `262791f72731d3400683b60468035dd11f423b5a098ea1570ad0adc42f5b8619` | `262791f72731d3400683b60468035dd11f423b5a098ea1570ad0adc42f5b8619` | Exact match |

This proves those two live files match commit
`6bf16083de42696680b4301094e1c32c0e5d5181` on
`origin/docs/product-commercial-roadmap-rev6`; it does not prove that the
entire main site was deployed from that branch.

## 11. Existing test and release commands

These commands were inventoried from committed package and Firebase
configuration. They were not executed during WP-02 preparation.

### Canonical `origin/main` app scripts

```text
npm --prefix app-web run compile
npm --prefix app-web run check:static
npm --prefix app-web run build:coincard-tokens
npm --prefix app-web run check:coincard-tokens
npm --prefix app-web run build:coincard-review
npm --prefix app-web run check:coincard-review
npm --prefix app-web run validate:architecture
npm --prefix app-web run test:coincard-presentation-input
npm --prefix app-web run test:coincard-display
npm --prefix app-web run test:coincard
npm --prefix app-web run test:coincard-review
npm --prefix app-web run test:coin-card-integrity
npm --prefix app-web run test:coin-card-verification
npm --prefix app-web run test:portal
npm --prefix app-web run test:coin-card-qr-handoff
npm --prefix app-web run test:coin-card-qr-browser
npm --prefix app-web run build:qrcode-vendor
npm --prefix app-web run check:qrcode-vendor
npm --prefix app-web run test:ix-execution
npm --prefix app-web run test:ix-execution-authorized
npm --prefix app-web run test:observability
npm --prefix app-web run test:analytics
npm --prefix app-web run test:consent
npm --prefix app-web test
```

### Fixed-roadmap app scripts added after divergence

```text
npm --prefix app-web run build:v1-execution-pdf
npm --prefix app-web run test:v1-execution-artifact
npm --prefix app-web run verify:coin-card-release
npm --prefix app-web run test:coin-card-production-artifact
npm --prefix app-web run test:coin-card-live
npm --prefix app-web run test:coin-card-release
npm --prefix app-web run predeploy:coin-card
npm --prefix app-web run test:portal-integrity
npm --prefix app-web run test:footer-parity
npm --prefix app-web run test:coordinator-regression
npm --prefix app-web run test:install-intent
npm --prefix app-web run test:tx-dispatch
npm --prefix app-web run predeploy:portal
npm --prefix app-web run generate:build-info
npm --prefix app-web run deploy:portal
```

The fixed-roadmap release aggregators are:

```text
test:coin-card-release =
  npm run test:coin-card-integrity &&
  npm run test:coin-card-verification &&
  node tests/frontend/coin-card-lifecycle-publication.test.js &&
  node tests/frontend/coin-card-signing-generator.test.js &&
  node tests/frontend/coin-card-executable-registry-record-verification.test.js &&
  node tests/frontend/coin-card-transaction-evidence-content-verification.test.js &&
  node tests/frontend/coin-card-review-runtime-prerequisites.test.js &&
  node tests/frontend/coin-card-provider-continuity.test.js &&
  npm run test:ix-execution-authorized &&
  npm run test:coin-card-qr-handoff &&
  npm run test:coin-card-qr-browser &&
  node tests/browser/coin-card-active-flow-firewall.test.js &&
  npm run test:coin-card-production-artifact

predeploy:coin-card =
  npm run verify:coin-card-release &&
  npm run test:coin-card-release

predeploy:portal =
  npm run generate:build-info &&
  npm run predeploy:coin-card &&
  npm run test:portal-integrity &&
  npm run test:footer-parity &&
  npm run test:coordinator-regression &&
  npm run test:install-intent &&
  npm run test:tx-dispatch
```

### Wallet-challenge backend scripts on the fixed roadmap commit

```text
npm --prefix app-web/backend/functions run lint
npm --prefix app-web/backend/functions test
npm --prefix app-web/backend/functions run test:rules
npm --prefix app-web/backend/functions run test:gate
```

### Firebase hosting predeploy configuration on the fixed roadmap commit

```text
main:
  npm --prefix app-web run predeploy:coin-card
  node docs/blockaid-review-packet/build-public-page.js
  git diff --exit-code app-web/frontend/public/architecture-and-security.html

coincard:
  no predeploy command configured

portal:
  npm --prefix app-web run predeploy:portal
```

Deployment commands are recorded only as release inventory. They are not
authorized during WP-02 integration:

```text
npm --prefix app-web run deploy:portal
firebase deploy ...
```

## 12. WP-02 starting-evidence disposition

Starting-state capture: complete.

Dedicated integration branch: created from canonical `origin/main`.

Merge preview: complete and read-only.

Conflict classification: complete for all 15 previewed paths.

Conflict resolution: not started.

Active work package: WP-02 only, paused at founder review.

WP-03: inactive; its bounded signing-and-lifecycle decision packet is not
authorized by this record.

Commit, push, merge, deploy, publish, PDF: not performed.

Conflict resolution is not authorized by this record. The next separately
authorized change must begin by fetching `origin` and satisfying the
conflict-resolution entry gate above. The three governance-escalation
candidates require the documented WP-02 → bounded WP-03 decision → WP-02
return loop before those files can be resolved.
