# ImplicitEx Demo Shell Gate Evidence

Date: 2026-05-04

## Purpose

This record captures evidence that the ImplicitEx public demo shell gate is
currently satisfied. It does not authorize Amoy deployment, transaction wiring,
or live transfers.

## Commit Chain

Evidence is based on `main` through:

```text
7ea4c0d Add ImplicitEx launch gate contracts
6f7aacc Add public discovery shell and static target check
4efae7c Align public shell with initial demo baseline (superseded)
```

These commits were pushed to `origin/main` on 2026-05-04.

Superseding fee decision:

```text
2026-05-04: launch fee model locked to 1% flat / 100 basis points.
```

## Gate Checked

Relevant gate:

```text
docs/operations/implicitex-launch-gate.md
Stage 1: Demo Shell Gate
```

Relevant contracts:

```text
docs/contracts/site-discovery-contract.md
docs/contracts/transaction-execution-contract.md
```

## Static Check Result

Command:

```bash
cd app-web
npm run check:static
```

Observed result:

```text
Static public check passed (62 local references checked).
```

## Demo Status

Current public shell status:

```text
Mode: Demo only
Live transfers: Disabled until testnet signoff
```

Current chain config:

```js
const ImplicitExChains = {
  transfersEnabled: false,
  supportedChains: {}
};
```

## Fee Model

The public shell, demo modal, deploy docs, runbook, and local predeploy check are
aligned to:

```text
1% flat platform fee
100 basis points
```

## Discovery Files Present

Present in `app-web/frontend/public/`:

```text
robots.txt
sitemap.xml
manifest.json
```

## Footer Destinations Present

The public footer destinations resolve to:

```text
About:   /about.html
Terms:   /components/terms.html
Privacy: /privacy.html
Legal:   /legal.html
News:    /news.html
Contact: mailto:connect@implicitex.com
```

## Public Page Set

Present in `app-web/frontend/public/`:

```text
index.html
about.html
privacy.html
legal.html
news.html
components/terms.html
```

## Known Non-Blockers

- The public shell remains demo-only.
- `wallet.js` still contains direct USDC `transfer(...)` ABI logic for gas
  estimation. The transaction execution contract forbids using direct USDC
  `transfer(...)` as the production transaction path.
- Footer legal/privacy/terms pages are minimal placeholders and still require
  production legal review before live funds movement.
- No browser approval or allowance flow exists yet.
- No browser `transferWithFee(...)` call exists yet.
- No Amoy deployment evidence exists yet.

## Explicit Non-Authorization

This evidence record does not authorize:

- Amoy deployment
- `chains.js` edits
- `transfersEnabled: true`
- Browser approval flow
- Browser `transferWithFee(...)` calls
- Mainnet deployment
- Production live transfer enablement

## Demo Shell Gate Result

Result:

```text
PASS for current demo/public shell state.
```

Next required lane before transaction wiring:

```text
Amoy deployment preparation and evidence, or additional public-shell review if
the visible site changes.
```
