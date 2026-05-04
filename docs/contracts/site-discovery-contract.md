# Site Discovery Contract

## Purpose

This contract defines what the ImplicitEx public site must truthfully provide
before any real transaction path is exposed to users.

The public shell is allowed to be demo-only. It is not allowed to imply that
live USDC movement is available before the transaction execution and launch
gates have passed.

## Contract

The public site must provide:

- A discoverable homepage at `https://implicitex.com/`.
- A valid `robots.txt` that permits indexing of the public shell.
- A valid `sitemap.xml` that lists the canonical public pages.
- Working footer destinations for About, Terms, Privacy, Legal, News, and
  Contact.
- A visible and honest platform status: demo, testnet, or live.
- Clear disclosure of the planned 2.5% additive platform fee.
- Non-custodial language: ImplicitEx does not take custody of user private keys.
- Clear risk language for wallet responsibility and irreversible transactions.
- No broken local public page, asset, manifest, sitemap, or same-domain social
  preview targets.

## Current Demo-Shell Requirements

While live transfers are disabled, the public shell must state:

- Live transfers are disabled.
- The current flow is demo-only or testnet-only, depending on the release state.
- No production USDC transfer will execute from the demo shell.
- Testnet or production execution requires explicit signoff.

## Required Guard

Before any public shell release, run:

```bash
cd app-web
npm run check:static
```

The release is blocked if the static check fails.

## Change Triggers

Re-run this contract's guard when a change touches:

- `app-web/frontend/public/index.html`
- `app-web/frontend/public/manifest.json`
- `app-web/frontend/public/robots.txt`
- `app-web/frontend/public/sitemap.xml`
- Footer/header links
- Public legal, privacy, terms, news, or about pages
- Public image/icon/social preview paths

## Non-Goals

This contract does not approve:

- Amoy deployment
- Mainnet deployment
- `transfersEnabled: true`
- Browser approval flow
- Browser `transferWithFee` calls
- Production legal sufficiency

Those are covered by the transaction execution and launch gate contracts.
