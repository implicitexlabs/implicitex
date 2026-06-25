# Coin Card — Product Specification and Trust Model

**Status:** V1 — static registry, no cryptographic signing  
**Built:** 2026-06-25  
**Architectural authority:** Architectural Principles §3 and §6

---

## What Coin Card Is

A Coin Card is a registry-backed verified recipient record. It is not a payment instrument. It does not execute transfers.

A Coin Card answers one question: "Is this the canonical recipient for this Card ID?" The Transfer Portal answers a different question: "Did this transfer execute?"

---

## Trust Hierarchy

```
URL parameters    — transport (claims only)
Registry manifest — evidence (canonical recipient confirmed)
Wallet prompt     — execution (user confirms and signs)
Chain event       — settlement proof (on-chain, independently verifiable)
```

Each layer is independent. No layer substitutes for another.

- Verification confirms the published recipient record. It does not execute a transfer.
- A completed transfer does not retroactively verify a registry record.
- Settlement proof is the on-chain transaction hash, not the registry manifest.

---

## V1 Architecture

### Registry format

Static JSON manifests served from:

```
/registry/coincards/index.json
/registry/coincards/<cardId>.json
```

Each manifest follows `implicitex.coincard.v1` schema:

```json
{
  "schema": "implicitex.coincard.v1",
  "cardId": "cc_demo_implicitex",
  "status": "active",
  "displayName": "ImplicitEx Demo Treasury",
  "recipient": "0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919",
  "chainId": 137,
  "chainName": "Polygon",
  "token": "USDC",
  "sourceDomain": "implicitex.com",
  "createdAt": "2026-06-25T00:00:00Z",
  "updatedAt": "2026-06-25T00:00:00Z",
  "revokedAt": null
}
```

Required fields: `schema`, `cardId`, `status`, `recipient`, `chainId`, `token`

### URL parameter contract

A Coin Card link passes claims as URL parameters:

```
/?cc=<cardId>
/?cc=<cardId>&to=<address>&chain=<chainId>&token=<symbol>
```

`cc` alone is sufficient. The registry manifest is the source of truth for `to`, `chain`, and `token`. If `to`, `chain`, or `token` are also present in the URL, they are compared against the manifest. Any mismatch produces `Verification failed`.

The registry wins. URL claims do not override it.

### Card ID validation

Before any fetch is attempted, Card IDs are validated against:

```
/^[a-zA-Z0-9_-]{3,80}$/
```

Malformed IDs produce `Invalid card` — no network request is made.

### Verification states

| Status | Meaning |
|---|---|
| `No card` | No `cc` param present |
| `Card detected — not verified` | `cc` param present, manifest unavailable |
| `Verified` | Manifest confirmed, all required fields present, `status: active`, URL claims match |
| `Verification failed` | Manifest exists but URL claims mismatch |
| `Revoked` | `manifest.status === "revoked"` — do not treat as valid |
| `Invalid card` | Card ID failed regex guard |

### State exposed to other modules

`window.IX.coincard` is set by `coincard.js` after verification:

```js
{
  cardId,
  recipient,        // from URL (claim)
  chain,            // from URL (claim)
  token,            // from URL (claim)
  name,
  source,
  manifest,         // full JSON if fetched, null otherwise
  verificationStatus: 'none' | 'unverified' | 'verified' | 'failed' | 'revoked',
  sourceType:        'none' | 'url-claim' | 'registry',
  failureReason,    // internal, not surfaced to UI
}
```

### Prefill behavior

The recipient field (`txRecipient`) is prefilled from `manifest.recipient` only on `verificationStatus: 'verified'` and `sourceType: 'registry'`. URL-only recipients are never silently prefilled as verified.

---

## User-Facing Entry Points

**Transfer Portal (`index.html`):**  
The `03 — Verification` panel shows Coin Card status inline alongside the transfer form. Arrival via `/?cc=...` triggers automatic verification.

**Verification page (`verify.html`):**  
Independent lookup at `/verify.html?cc=<cardId>`. No wallet required. Displays full manifest fields and a link to open the Transfer Portal. The verification page is the canonical trust surface for Coin Card records.

---

## V1 Limitations

**Not cryptographically signed.** Registry manifests are public static JSON files served over HTTPS from `implicitex.com`. Trust depends on HTTPS delivery from the ImplicitEx domain. A manifest cannot be independently verified offline. There is no detached signature or key material that allows a third party to verify authenticity without a network call.

**No expiration.** Manifests do not expire by default. Revocation is manual — the `status` field must be updated to `"revoked"` and redeployed.

**No backend confirmation.** The registry check is a client-side fetch against a static file. There is no server-side rate limiting, fraud detection, or real-time revocation.

**No transfer linkage.** A verified Coin Card record confirms a recipient address. It does not track whether a transfer was made, confirm an amount, or produce a receipt. Settlement proof is always the on-chain transaction hash.

---

## Upgrade Path

The static registry design was chosen to ship V1 without backend complexity. Future upgrades may include:

- Cryptographic signatures on manifests (verifiable offline or via public key endpoint)
- Real-time status endpoint (live revocation without file redeployment)
- Transfer linkage (optional: associate completed transfers with a Card ID for receipt purposes)

These are future capabilities. The current system is accurately described as a static public registry, not a cryptographic identity system.

---

## Files

| File | Purpose |
|---|---|
| `frontend/public/registry/coincards/index.json` | Registry index |
| `frontend/public/registry/coincards/cc_demo_implicitex.json` | Demo manifest |
| `frontend/public/js/coincard.js` | Transfer Portal verification module |
| `frontend/public/js/verify.js` | Independent verify.html lookup |
| `frontend/public/verify.html` | Verification page |
| `frontend/public/index.html` | 03 — Verification panel in Transfer Portal |
