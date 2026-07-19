# Coin Card Registry Model

## Status

Normative subordinate registry model.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
MANIFEST_SCHEMA.md
```

Authority chain:

```text
IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
        -> COIN_CARD_TRUST_MODEL.md
        -> MANIFEST_SCHEMA.md
        -> REGISTRY_MODEL.md
        -> REVOCATION_MODEL.md
        -> PUBLISHER_SPEC.md
        -> IMPLEMENTATION
```

Nothing in this registry model may redefine the signed meaning layer established by `MANIFEST_SCHEMA.md`.

## Scope

This document defines:

- registry resolution
- registry status representation
- registry lookup evidence
- registry validator behavior
- registry trust boundaries

The registry does not create the Coin Card's signed meaning. It makes that meaning publicly resolvable and status-bearing.

## Non-Scope

This document does not define:

- manifest schema fields
- canonicalization rules
- creator signature rules
- revocation lifecycle
- revocation authority
- publisher onboarding
- iframe presentation
- card styling
- frontend UX
- transfer execution
- receipt generation
- legal marketing language

## Registry Purpose

The registry exists to answer:

```text
Is there a public registry record for this Coin Card identifier,
where is the signed manifest located,
what manifest hash is expected,
and what operational status does the registry currently report?
```

The registry provides publication evidence and operational status evidence.

The registry does not:

- sign the creator's payment identity payload
- create the identity-to-destination binding
- prove recipient honesty
- prove legal compliance
- prove business legitimacy
- prove transfer success
- replace revocation rules

## Registry Record

A registry record binds a `card_id` to a resolvable manifest and a registry-reported status.

Minimal record shape:

```json
{
  "registry_version": 1,
  "card_id": "coincard:creator:brandon-lehman",
  "manifest_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "manifest_uri": "https://implicitex.com/registry/coincards/coincard-creator-brandon-lehman.json",
  "status": "ACTIVE",
  "published_at": "2026-06-28T00:00:00Z",
  "updated_at": "2026-06-28T00:00:00Z",
  "registry_signature": {
    "type": "eip191",
    "value": "0x..."
  }
}
```

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `registry_version` | integer | Registry record schema version |
| `card_id` | string | Coin Card identifier |
| `manifest_hash` | string | Expected hash of the canonical signed manifest |
| `manifest_uri` | string | Public URI where the manifest can be resolved |
| `status` | string | Registry-reported operational status |
| `published_at` | string | UTC timestamp when the registry record was first published |
| `updated_at` | string | UTC timestamp when the registry record last changed |
| `registry_signature` | object | Registry signature over the registry record excluding `registry_signature` |

`card_id` MUST match the `card_id` inside the resolved manifest.

`manifest_hash` MUST be computed over the complete manifest as resolved, including the creator signature.

`registry_signature` proves only that the registry signed this registry record. It does not prove that the creator signature is valid, that the recipient is honest, or that a transfer will succeed.

## Allowed Registry Status

Allowed registry status values:

```text
ACTIVE
PAUSED
REVOKED
SUPERSEDED
EXPIRED
UNKNOWN
```

Status meanings:

| Status | Meaning |
| --- | --- |
| ACTIVE | Registry currently reports the Coin Card as operationally usable |
| PAUSED | Registry currently reports temporary non-use without permanent revocation |
| REVOKED | Registry currently reports operational invalidation |
| SUPERSEDED | Registry currently reports replacement by another Coin Card or manifest |
| EXPIRED | Registry currently reports expiration |
| UNKNOWN | Registry cannot establish current operational status |

Only `ACTIVE` supports active use.

Every other status MUST be surfaced as uncertainty, non-use, or invalidation according to the verifier's context.

`REVOKED`, `SUPERSEDED`, and `EXPIRED` are status evidence. The full lifecycle and authority rules for those states belong to `REVOCATION_MODEL.md`.

## Lookup States

A registry lookup produces a lookup state.

Allowed lookup states:

```text
FOUND
NOT_FOUND
UNAVAILABLE
STALE
MISMATCH
INVALID_REGISTRY_SIGNATURE
```

Lookup state meanings:

| Lookup State | Meaning |
| --- | --- |
| FOUND | Registry record was found and passed registry-level validation |
| NOT_FOUND | No registry record was found for the requested `card_id` |
| UNAVAILABLE | Registry could not be reached or resolved |
| STALE | Registry record was found but freshness requirements were not met |
| MISMATCH | Registry record conflicts with resolved manifest evidence |
| INVALID_REGISTRY_SIGNATURE | Registry signature failed validation |

Lookup states are evidence outputs. They are not visual states.

## Evidence Outputs

A registry verifier MUST be able to produce these evidence outputs:

| Evidence Output | Source |
| --- | --- |
| Registry record found | Lookup result |
| Registry lookup state | Lookup result |
| Registry status | `status` |
| Manifest URI | `manifest_uri` |
| Manifest hash | `manifest_hash` |
| Manifest hash match | `manifest_hash` + resolved manifest bytes |
| Card ID match | registry `card_id` + manifest `card_id` |
| Registry signature scheme | `registry_signature.type` |
| Registry signature validity | canonical registry record + `registry_signature.value` |
| Published timestamp | `published_at` |
| Updated timestamp | `updated_at` |
| Timestamp freshness | `updated_at` + verifier freshness policy |
| Registry version | `registry_version` |
| Mismatch state | validator result |
| Unknown state | validator result |
| Stale state | validator result |

These outputs support this bounded claim:

```text
The registry currently makes this manifest publicly resolvable
and reports this operational status for the Coin Card identifier.
```

They do not establish:

- creator signature validity
- revocation lifecycle authority
- business legitimacy
- legal compliance
- recipient intent
- transfer success

## Validator Rules

Validators MUST reject or surface uncertainty when any of the following are true:

- registry record is missing
- registry is unavailable
- registry record uses an unsupported `registry_version`
- required registry field is missing
- required registry field has the wrong type
- unknown registry field is present
- `card_id` is malformed
- registry `card_id` does not match manifest `card_id`
- `manifest_uri` is malformed
- `manifest_uri` cannot be resolved
- `manifest_hash` is malformed
- resolved manifest hash does not match `manifest_hash`
- `status` is unsupported
- `status` is not `ACTIVE`
- `published_at` is malformed
- `updated_at` is malformed
- `updated_at` precedes `published_at`
- lookup is stale under verifier policy
- `registry_signature.type` is unsupported
- `registry_signature.value` is malformed
- registry signature verification fails
- registry record conflicts with manifest evidence

Validators MUST NOT treat a registry record as valid when the manifest cannot be resolved.

Validators MUST NOT treat a matching registry record as proof that the creator signature is valid. Manifest validation remains governed by `MANIFEST_SCHEMA.md`.

Validators MUST NOT repair malformed registry records into validity.

Validators MAY report specific registry rejection reasons as evidence outputs.

## Freshness

Registry freshness is verifier policy, not manifest meaning.

Freshness checks MUST be based on `updated_at`.

If the registry record is older than the verifier's freshness threshold, the lookup state MUST be `STALE`.

`STALE` does not prove invalidity. It proves insufficient current evidence.

User-facing meaning:

```text
Registry record found, but status evidence is stale.
```

## Trust Boundary

The registry may establish:

- public resolvability
- manifest location
- expected manifest hash
- registry-reported operational status
- registry publication timestamp
- registry update timestamp
- registry signature validity

The registry does not establish:

- recipient honesty
- recipient legal compliance
- business legitimacy
- investment quality
- transfer success
- fund recovery
- custody
- insurance

Any registry trust marker MUST explain what was established.

Permitted:

```text
Registry record found
Registry status: ACTIVE
Manifest hash matched
Registry signature valid
```

Not permitted:

```text
Trusted recipient
Safe merchant
Verified business
Guaranteed payment
```

## Relationship to Manifest and Revocation

The manifest defines signed meaning.

The registry makes that signed meaning publicly resolvable and status-bearing.

The revocation model defines authority, lifecycle, and historical handling for invalidation states.

No layer substitutes for another:

| Layer | Establishes | Does Not Establish |
| --- | --- | --- |
| Manifest | Signed identity-to-destination meaning | Publication or operational status |
| Registry | Public resolvability and status evidence | Creator signature validity or revocation lifecycle |
| Revocation Model | Invalidation authority and lifecycle | Signed payload meaning |

## Closing Rule

The registry establishes public resolvability and status evidence.

It does not replace the signed manifest or the revocation model.
