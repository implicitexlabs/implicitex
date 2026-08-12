# Coin Card holder management (non-production vertical slice)

This directory contains the local holder-management vertical slice intended for a future, separately authorized `app.coincard.click` deployment. It is not included in any Firebase Hosting root.

## Boundary

The holder flow is:

```text
non-production account session
→ current V2 canonical username
→ short-lived local reservation
→ opaque Coin Card identity intent
→ bounded presentation intent
→ fixed Polygon / native USDC route intent
→ wallet-control challenge/evidence
→ commercial entitlement prerequisite
→ ACTIVATION_READY
```

`ACTIVATION_READY` is not `ACTIVE`. Only the existing signed lifecycle and public route-authority conjunction may classify a card as active. The holder app never publishes a Current Head, signs an artifact, loads `IX_EXECUTION`, or enables a payment control.

The holder public preview calls the existing `coin-card-readonly-browser.js` adapter. It does not infer lifecycle from editable form state. `INVALID` and `AUTHORITY_UNAVAILABLE` therefore remain fail-closed holder outcomes.

## Identity and session model

- One holder account has zero or one current canonical username.
- One holder account has zero or one opaque Coin Card identity.
- `antoinedennison.coincard.click` is canonical.
- `coincard.click/antoinedennison` is only a public resolution alias and is never accepted as a second username or identity.
- The fixture session asserts the future holder origin, holder-only audience, and host-only session boundary. It does not model shared Transfer Portal cookies, permissions, OAuth audience, or service-worker scope.

## Presentation product policy

These limits are local product-policy constants, not cryptographic authority:

- avatar URL: optional HTTPS, at most 2,048 characters
- banner URL: optional HTTPS, at most 2,048 characters
- bio: at most 160 characters
- external link: optional HTTPS, at most 2,048 characters

Presentation state is stored independently from route state. Updating presentation cannot mutate the wallet, lifecycle, route authority, evidence, or execution eligibility.

## Route and evidence model

The only exposed V1 route is Polygon (`chainId` 137), native Polygon USDC, and one canonical EVM recipient wallet. Route editing produces a non-authoritative intent. A new or changed route must obtain wallet-control evidence bound to the account, current V2 username, opaque card ID, wallet, and chain.

Wallet control proves control at verification time. It does not claim legal identity, business legitimacy, or perpetual ownership.

## Running locally

Serve the repository root with a local static server and open:

```text
/app-web/holder-management/public/index.html?scenario=new
```

The deterministic browser fixture also supports `active`, `expired`, `revoked`, `tombstoned`, `invalid`, and `authority-unavailable` scenarios. Every scenario is labeled `NON_PRODUCTION_TEST_FIXTURE` and keeps `executionEligible: false`.

Focused verification:

```text
node app-web/tests/frontend/coin-card-holder-management.test.js
node app-web/tests/browser/coin-card-holder-management.test.js
```

The browser test starts a loopback-only server and requires an environment that permits local port binding and headless Chromium.

## Production work still required

Production activation still requires genuine holder authentication, a persistent account/reservation store, production wallet-challenge transport and evidence authority, commercial entitlement, production KMS-backed publication, authenticated Current Heads, protected holder packaging, deployment authorization, and routing cutover. None of those boundaries is simulated as production here.
