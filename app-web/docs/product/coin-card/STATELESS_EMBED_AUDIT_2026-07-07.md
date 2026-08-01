# Coin Card Stateless Embed Audit

Date: 2026-07-07
Status: audit note; no runtime behavior changed

## Purpose

This audit separates the Coin Card v1 stateless embed boundary from the existing hosted-registry experiments. The goal is to preserve the current visual and receipt/proof work without accidentally claiming hosted identity, account records, or registry-backed verification as part of v1.

## V1 Boundary

Coin Card v1 is a stateless embed/wrapper. Recipient addresses are configured by the site owner locally and are not persisted in any ImplicitEx application database or user record. ImplicitEx may process the address client-side to prefill the Transfer Portal, but does not maintain a hosted recipient directory in v1.

Defensible public language:

> ImplicitEx v1 does not create user-specific Coin Card accounts or persist recipient addresses in an application database.

Avoid broader claims such as "wallet addresses are never stored." Query strings, browser history, referrers, CDN/Firebase access logs, analytics integrations, screenshots, and local receipt persistence can all retain address-bearing data depending on implementation and user environment.

## Immediate Findings

1. The current live card path assumes hosted registry identity.

   `frontend/public/card/index.html` and `frontend/public/card/card.js` load card records from `/registry/coincards/<cardId>.json`, use states such as `VERIFIED`, and render a registry-backed transfer instrument.

2. The root Coin Card page is also registry-oriented.

   `frontend/public/card.html` and `frontend/public/js/coincard.js` read `?cc=`, optionally compare URL claims such as `to`, and render status language around registry verification.

3. The current Transfer Portal handoff is registry-backed.

   `frontend/public/js/coincard-handoff.js` listens for `?cc=<cardId>&src=coincard`, fetches `/registry/coincards/<cc>.json`, locks `txRecipient`, and labels the intake as registry verified. This is useful for a future registered card, but it is not the v1 stateless embed boundary.

4. A stateless-compatible primitive already exists.

   `frontend/public/js/coincard-free-manifest.js` validates host-controlled Free Coin Card manifests. It explicitly verifies the payment route, not recipient identity or wallet ownership, rejects executable/presentation content, hashes the manifest, and builds receipt context.

5. Receipt/proof support exists but does persist locally.

   `frontend/public/js/receipt-schema.js`, `receipt-store.js`, and `proof-packet.js` support transaction-time evidence and Coin Card context. `receipt-store.js` writes active and archived receipts to browser `localStorage`, and receipts can include recipient addresses. This is local browser persistence, not an ImplicitEx hosted recipient directory.

6. Analytics is inert by default, but should stay out of address-bearing payloads.

   `frontend/public/js/analytics.js` is consent-gated and has no active backend by default. If analytics is later enabled, Coin Card events must avoid exact recipient addresses, exact amounts, URL payloads, and manifest contents.

7. `/.well-known/implicitex.json` does not currently exist.

   The agent-readable product guidance layer should be added before or alongside the v1 stateless embed launch.

## Classification

V1 stateless-compatible:

- `frontend/public/js/coincard-free-manifest.js`
- `frontend/public/coincard/coin-card.sample.json`
- Receipt/proof fields that record transaction-time route evidence without claiming identity verification
- Existing Coin Card visual tokens and construction preview, if used only as presentation structure

Future hosted-registry / registered card work:

- `frontend/public/registry/coincards/*.json`
- `frontend/public/card/index.html`
- `frontend/public/card/card.js`
- `frontend/public/card.html`
- `frontend/public/js/coincard.js`
- `frontend/public/js/coincard-handoff.js`
- `frontend/public/coincard/host.html`
- `frontend/public/coincard/proto.html`
- `frontend/public/coincard/card-acceptance-lane-a.html`
- `frontend/public/coincard/publisher-mvp.html`
- `frontend/public/js/coincard-publisher-core.js`
- `frontend/public/js/coincard-publisher-mvp.js`

Prototype / evidence work needing product-language review:

- `frontend/public/coincard/evidence-demo.html`
- `frontend/public/coincard/evidence-demo.js`
- `frontend/public/js/proof-packet.js`
- `frontend/public/js/receipt-schema.js`

## Audit Questions

Does the current Coin Card assume hosted identity?

Yes, for the registry-backed card surfaces. The `/card/` route, root `card.html`, verification panel, handoff script, publisher MVP, and registry JSON records all assume a hosted registry or signed/registered card model.

Does it store or persist recipient data anywhere?

No application database persistence was found in the static frontend audit. However, recipient data appears in static registry JSON files and local browser receipts can persist recipient addresses in `localStorage`.

Does it pass recipient address in URL query params?

`frontend/public/js/coincard.js` accepts a `to` URL claim for comparison against a registry manifest. The main handoff script uses `?cc=<cardId>&src=coincard`, not a direct recipient address, but the `cc` value still creates a loggable lookup key.

Does it say "verified recipient" or imply identity verification?

Yes. Current registry surfaces use `Verified`, `Registry verified`, `verified recipient record`, `canonical recipient`, `verified Coin Card`, and related language. That language should be reserved for future registered cards or rewritten for v1 as route validation.

Does it already hand off to the Transfer Portal cleanly?

Partially. The existing handoff cleanly opens and prefills the portal from a registry manifest, but it is registry-dependent. V1 stateless embed needs a separate handoff path that does not require a hosted card record.

Does it already have a receipt/proof path?

Yes. Receipt schema, local receipt store, proof packet generation, and Free-manifest evidence hooks exist. The next polish pass should keep the distinction between route evidence, transaction settlement, and identity verification explicit.

Can we preserve the visual design while making it stateless?

Yes. The visual card shell and structural regions can be preserved. The data source and language need to change: v1 Free should read locally configured recipient data, validate route fields, and avoid registry-backed identity claims.

## V1 Handoff Rule

Avoid recipient query parameters for v1 where practical. Prefer a local host declaration such as `data-recipient`, `data-network`, and `data-token`, then pass intent to the Transfer Portal through `postMessage` or a URL hash fragment. If query parameters are unavoidable, document that recipient addresses may appear in logs, browser history, referrers, analytics, screenshots, or shared URLs.

Recommended order:

1. Host page declares recipient locally.
2. Embed script validates route fields client-side.
3. Embed opens the Transfer Portal.
4. Recipient data is delivered client-side via `postMessage` or hash fragment.
5. Transfer Portal requires human wallet confirmation.
6. Receipt records the transaction-time Coin Card route context.

## Well-Known Scope

Add `frontend/public/.well-known/implicitex.json` before or alongside the stateless embed launch. It should describe:

- Product: ImplicitEx
- Mode: non-custodial USDC transfer portal
- Current network: Polygon
- Current token: USDC
- Platform fee: 1%
- Coin Card v1 type: stateless embed
- Recipient source: configured by site owner, not hosted registry
- Human confirmation required
- Private keys and seed phrases never requested
- Supported surfaces: portal, embed, receipt/proof
- Deep-link or intent format
- Agent safety rules

## Acceptance Gates

- V1 Free does not require `/registry/coincards/*`.
- V1 Free does not require signup, accounts, profiles, slugs, or hosted card records.
- V1 Free does not claim recipient identity verification or wallet ownership.
- V1 Free does not use recipient query params unless the leakage tradeoff is documented.
- V1 Free does not send exact recipient addresses or manifest contents to analytics.
- Receipt/proof distinguishes route evidence from identity verification and on-chain settlement.
- Existing registry-backed card work remains classified as future registered-card scope.
