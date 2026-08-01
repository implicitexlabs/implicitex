# Coin Card Publisher MVP Audit - 2026-06-28

## Status

Focused implementation audit for the `coin-card-publisher-mvp` lane.

No implementation files were changed during this audit.

## Audit Scope

Reviewed targets:

```text
app-web/frontend/public/coincard/
app-web/frontend/public/registry/
app-web/frontend/public/js/
app-web/frontend/public/css/main.css
app-web/docs/product/coin-card/
app-web/docs/operations/evidence/
```

Additional relevant public surfaces found during audit:

```text
app-web/frontend/public/card.html
app-web/frontend/public/card-review.html
```

## 1. Existing Coin Card Surfaces

Current files under `app-web/frontend/public/coincard/`:

```text
card-acceptance-lane-a.html
host.html
proto.html
```

Related public card surfaces outside the folder:

```text
card.html
card-review.html
```

Findings:

- `coincard/host.html` and `coincard/proto.html` are prototype/evaluation host simulations with self-contained inline CSS.
- `coincard/card-acceptance-lane-a.html` is a controlled live acceptance artifact and currently has unrelated local modifications.
- `card.html` is the current public Coin Card visual surface using shared site nav, footer, `css/main.css`, and `js/card.js`.
- `card-review.html` is a visual variant review surface.

Reuse recommendation:

- Use `card.html` and `main.css` public-page patterns for page shell and restrained operational styling.
- Do not build the publisher MVP from `host.html` or `proto.html`; they are prototype artifacts with inline styles.
- Do not touch `card-acceptance-lane-a.html` in the publisher MVP unless explicitly entering that lane.

## 2. Existing Registry Files

Current registry files:

```text
app-web/frontend/public/registry/coincards/index.json
app-web/frontend/public/registry/coincards/cc_demo_implicitex.json
```

Current registry shape is legacy/static V1:

```text
schema: implicitex.coincard.registry.v1
cardId: cc_demo_implicitex
status: active
href: /registry/coincards/cc_demo_implicitex.json
```

Current manifest shape is also legacy/static V1:

```text
schema: implicitex.coincard.v1
cardId
status
owner
displayName
displayCredential
recipient
chainId
chainName
token
tokenDecimals
amountMode
feeBps
allowedParentOrigins
sourceDomain
createdAt
updatedAt
revokedAt
```

Finding:

The existing registry does not match the new normative `MANIFEST_SCHEMA.md` or `REGISTRY_MODEL.md`. It is useful as a compatibility/reference artifact, not as the target schema for the publisher MVP.

Reuse recommendation:

- Add a new publisher MVP example manifest/registry record rather than mutating the existing demo registry blindly.
- Keep a compatibility boundary clear between legacy `cc_demo_implicitex` and the new signed/canonical MVP artifact.

## 3. Naming, Layout, and CSS Patterns to Reuse

Relevant shared CSS in `app-web/frontend/public/css/main.css`:

```text
.coincard-verify
.coincard-lookup-form
.coincard-lookup-input
.coincard-lookup-btn
.coincard-trust-note
.cc-shell
.cc-card
.cc-card-status
.cc-card-status--verified
.cc-card-status--caution
.cc-card-status--error
.cc-card-status--revoked
.cc-card-actions
.cc-card-send-btn
.cc-card-verify-link
```

Relevant page shell pattern:

```text
card.html
```

Findings:

- Shared Coin Card visual styles already exist in `main.css`.
- Existing styles are oriented toward card display and verification, not publisher forms.
- The Learn/mobile patch discipline suggests new publisher controls should use stable dimensions and avoid layout shifts.

Reuse recommendation:

- Use global nav/footer/page shell from public pages.
- Reuse `.coincard-lookup-*` style language for compact operational form controls where appropriate.
- Add only publisher-specific CSS if existing controls cannot express evidence/archive panels cleanly.
- Do not reuse the inline prototype CSS from `coincard/host.html` or `coincard/proto.html`.

## 4. Existing JavaScript Utilities

Relevant files:

```text
js/coincard.js
js/card.js
js/verify.js
js/wallet.js
js/receipt-integrity.js
js/proof-packet.js
```

Findings:

- `js/coincard.js` verifies `?cc=` links against `/registry/coincards/<cardId>.json` and populates Transfer Portal state. It uses legacy `cardId`, `chainId`, `token`, `status: active/revoked`.
- `js/card.js` renders `card.html` from the same legacy static registry format.
- `js/verify.js` powers independent lookup on `verify.html` and also uses the legacy static registry format.
- `receipt-integrity.js` and `proof-packet.js` are transfer receipt/proof utilities. They are not suitable as Coin Card manifest/archive primitives without a new adapter.
- `wallet.js` and the public app already load wallet/ethers capability, but there is no existing Coin Card canonicalization/signing module aligned to `MANIFEST_SCHEMA.md`.

Gap:

The MVP needs new small utilities for:

```text
canonical JSON serialization
payload hash
manifest hash
creator signature request
signature verification
registry record generation
verification output generation
evidence archive export/rendering
```

Reuse recommendation:

- Reuse address/network constants and wallet connection patterns only if they can be imported without coupling publisher flow to transfer execution.
- Do not overload `coincard.js`, `card.js`, or `verify.js` for the new signed manifest model in the first MVP pass.
- Create a small publisher-MVP-specific JS module first, then factor shared utilities only after evidence shows reuse pressure.

## 5. Artifacts That Are Unrelated and Must Remain Untouched

Current local worktree contains unrelated Coin Card/assets work:

```text
M  app-web/frontend/public/coincard/card-acceptance-lane-a.html
?? app-web/docs/operations/evidence/coincard-lane-a-smoke-2026-06-27.md
?? app-web/docs/product/coincard-identity-thesis.md
?? implicitex-twitter-lockup.png
```

These are not part of the publisher MVP audit or first implementation unless explicitly moved into that lane.

## 6. Minimal Files Needed for `publisher-mvp.html`

Recommended minimal implementation files:

```text
app-web/frontend/public/coincard/publisher-mvp.html
app-web/frontend/public/js/coincard-publisher-mvp.js
app-web/docs/operations/evidence/coin-card-publisher-mvp-smoke-2026-06-28.md
```

Likely generated/static example artifacts:

```text
app-web/frontend/public/registry/coincards/<mvp-card-id>.json
app-web/frontend/public/registry/coincards/<mvp-card-id>.registry.json
```

Possible update if the example should be indexed:

```text
app-web/frontend/public/registry/coincards/index.json
```

Implementation note:

The existing `index.json` is legacy shaped. If it is updated, the update must preserve old demo compatibility or explicitly document a versioned split.

## Implementation Recommendation

Build the first MVP as a single static page plus a small dedicated JS module.

The first page should prove:

```text
input
  -> canonical manifest
  -> signature
  -> registry record draft
  -> verification output
  -> evidence archive output
```

The first implementation should not attempt automated filesystem writes from the browser. Static registry/example files can be generated as copyable/exported artifacts and committed only after smoke evidence confirms the shape.

## Required First Smoke

The first MVP smoke should verify:

- page loads on desktop and mobile
- required inputs validate
- canonical payload is deterministic
- payload hash is stable
- signing request is clearly not transfer execution
- signature verification works
- registry record draft references the manifest hash
- verification output uses approved language
- unknown/stale simulation surfaces uncertainty
- evidence archive output includes observed and unresolved states

## Audit Conclusion

The repo has useful Coin Card display and legacy static registry patterns, but it does not yet have a signed canonical manifest publisher path.

The first implementation should be a narrow new surface:

```text
app-web/frontend/public/coincard/publisher-mvp.html
```

with a dedicated support module, rather than modifying existing live transfer/card surfaces.
