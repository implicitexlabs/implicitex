# Coin Card — Product Specification and Trust Model

**Status:** V1 architecture frozen for implementation
**Built:** 2026-06-25  
**Updated:** 2026-07-04
**Architectural authority:** Architectural Principles §3 and §6

V1 trust boundaries are frozen as of 2026-07-04. Implementation may change
mechanics, but not the route-vs-recipient verification boundary, evidence
supremacy order, or off-chain-only treatment of purpose labels.

---

## What Coin Card Is

Coin Card is a complete payment instrument. The Transfer Portal is an optional
inspection and verification console. Every payment must be completable without
leaving the Coin Card.

A payment never leaves the payment instrument. Both Coin Card and the Transfer
Portal consume the same execution engine independently. Neither routes through
the other.

Free Coin Card answers one question: "What supported route and host-supplied
recipient address is this card presenting?"

Registered Coin Card answers a stronger question: "Is this the canonical
recipient identity and destination for this Card ID?"

The Transfer Portal answers a different question: "How do I inspect, verify, or
diagnose this transfer?"

---

## Trust Hierarchy

```
URL parameters    — transport (claims only)
Manifest/registry — evidence (route or identity claim, depending on tier)
Wallet prompt     — execution (user confirms and signs)
Chain event       — settlement proof (on-chain, independently verifiable)
```

Each layer is independent. No layer substitutes for another.

- Free-tier verification confirms route evidence and host-supplied payment
  instructions. It does not verify recipient identity.
- Registered-tier verification may confirm the published recipient record. It
  does not execute a transfer.
- A completed transfer does not retroactively verify a recipient identity or
  registry record.
- Settlement proof is the on-chain transaction hash, not the registry manifest.

---

## V1 Architecture

### Free manifest format

Free Coin Card may use a host-controlled manifest such as:

```json
{
  "schema": "implicitex.coincard.free.v1",
  "version": 1,
  "created": "2026-07-04T18:00:00Z",
  "updated": "2026-07-04T18:00:00Z",
  "name": "Aden Media Group",
  "recipientAddress": "0x0000000000000000000000000000000000000000",
  "network": "polygon",
  "token": "USDC",
  "status": "active"
}
```

Free-tier validation checks manifest shape, supported network/token route,
official ImplicitEx contract path, and recipient address format. It does not
prove that the address belongs to the host or a named person/business.

Required free manifest fields:

| Field | Meaning |
|---|---|
| `schema` | Free Coin Card schema identifier. V1 is `implicitex.coincard.free.v1`. |
| `version` | Integer manifest version for migration and compatibility checks. |
| `created` | Host-declared RFC 3339 UTC creation timestamp. Chronology evidence, not cryptographic proof. |
| `updated` | Host-declared RFC 3339 UTC update timestamp. Chronology evidence, not cryptographic proof. |
| `name` | Plain-text display name supplied by the host. |
| `recipientAddress` | Host-supplied recipient wallet address. |
| `network` | Supported network identifier. V1 launch target: `polygon`. |
| `token` | Supported token symbol. V1 launch target: `USDC`. |
| `status` | Host-supplied operational status. V1 allowed values: `active`, `paused`. |

Manifest timestamps help explain chronology during a dispute, but they do not
prove when a file was actually published or changed. The evidentiary anchor is
the manifest fingerprint recorded at transaction time and the blockchain
transaction record.

`purpose` is intentionally deferred from the required V1 manifest. A future
V1.1 field may allow values such as `donation`, `invoice`, or
`creator-support`, but purpose labels must remain semantic/off-chain metadata.
They must not change settlement behavior or expand the trust claim.

### Free-tier evidence hierarchy

Host evidence:

- `coin-card.json`
- `created`
- `updated`
- host website/domain

Coin Card evidence:

- manifest fingerprint/hash
- Coin Card schema/version
- route validation result
- contract address used

Blockchain evidence:

- transaction hash
- block number
- timestamp
- sender
- recipient
- amount
- fee

Burden of proof:

```text
The host proves what they intended to publish.
ImplicitEx proves what was presented and executed.
The blockchain proves what actually happened.
```

Evidence supremacy:

```text
Blockchain evidence
        ↓
Recorded Coin Card evidence at transaction time
        ↓
Current host manifest or registry record
        ↓
Human testimony
```

If sources disagree, the more objective and transaction-proximate evidence
controls. The current host manifest cannot rewrite what was recorded at
transaction time. Recorded Coin Card evidence cannot override confirmed
on-chain settlement.

### Registered registry format

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

`cc` alone is sufficient for registered Coin Cards. The registry manifest is
the source of truth for `to`, `chain`, and `token`. If `to`, `chain`, or `token`
are also present in the URL, they are compared against the manifest. Any
mismatch produces `Verification failed`.

For registered cards, the registry wins. URL claims do not override it. For
free self-hosted cards, the host manifest controls the displayed recipient
address and must be treated as host-supplied payment instruction, not ImplicitEx
recipient verification.

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
| `Route verified` | Free manifest confirmed, route supported, address format valid |
| `Verified` | Registered manifest confirmed, all required fields present, `status: active`, URL claims match |
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

The recipient field (`txRecipient`) is prefilled from `manifest.recipient` only
on `verificationStatus: 'verified'` and `sourceType: 'registry'` for registered
cards. Free cards may prefill from the host manifest only with language that
states the recipient address is host-supplied. URL-only recipients are never
silently prefilled as verified.

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

**Free tier does not verify recipient identity.** It validates route evidence
and address format only. The host is responsible for the manifest address it
publishes.

**No transfer linkage.** A registered Coin Card record confirms a recipient
address according to its evidence tier. It does not by itself track whether a
transfer was made, confirm an amount, or produce a receipt. Settlement proof is
always the on-chain transaction hash.

---

## Upgrade Path

The static registry design was chosen to ship V1 without backend complexity. Future upgrades may include:

- Cryptographic signatures on manifests (verifiable offline or via public key endpoint)
- Real-time status endpoint (live revocation without file redeployment)
- Transfer linkage (optional: associate completed transfers with a Card ID or
  manifest fingerprint for receipt purposes)

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
