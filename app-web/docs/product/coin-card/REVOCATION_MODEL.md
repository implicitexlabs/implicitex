# Coin Card Revocation Model

## Status

Normative subordinate revocation model.

## Authority

This document inherits authority from:

```text
../IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md
COIN_CARD_TRUST_MODEL.md
MANIFEST_SCHEMA.md
REGISTRY_MODEL.md
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

Nothing in this revocation model may redefine manifest meaning, registry publication, or transfer execution.

## Scope

This document defines:

- revocation authority
- invalidation lifecycle
- status transitions
- historical preservation
- revocation evidence
- revocation uncertainty
- validator obligations

## Non-Scope

This document does not define:

- manifest meaning
- manifest schema fields
- canonicalization rules
- registry publication mechanics
- registry lookup mechanics
- publisher workflow
- iframe presentation
- card styling
- frontend UX
- transfer execution
- receipt generation
- legal claims

## Revocation Purpose

Revocation is not deletion. It is evidence that a previously published payment identity should no longer be treated as currently usable.

Revocation does not erase a Coin Card. It changes whether the Coin Card is currently operationally valid.

Revocation does not rewrite the signed manifest. The manifest may remain historically meaningful while active use is no longer authorized.

## Revocation Authorities

Revocation authority must be explicit.

Allowed authority classes:

```text
CREATOR_WALLET
REGISTRY_AUTHORITY
IMPLICITEX_ADMIN
SUPERSEDING_CREDENTIAL
EXPIRATION_RULE
```

Authority meanings:

| Authority | Meaning |
| --- | --- |
| CREATOR_WALLET | The creator wallet associated with the manifest or issuer requests invalidation |
| REGISTRY_AUTHORITY | The registry authority changes operational status according to registry policy |
| IMPLICITEX_ADMIN | ImplicitEx administrative authority invalidates use under defined operational controls |
| SUPERSEDING_CREDENTIAL | A newer credential replaces the previous credential |
| EXPIRATION_RULE | Signed or registry-defined validity window has elapsed |

Authority evidence MUST be preserved with the status change.

If authority cannot be established, the resulting state MUST be `UNKNOWN`, not `ACTIVE`.

## Invalidation States

Allowed revocation states:

```text
ACTIVE
PAUSED
REVOKED
SUPERSEDED
EXPIRED
UNKNOWN
```

State meanings:

| State | Meaning |
| --- | --- |
| ACTIVE | Evidence currently supports operational use |
| PAUSED | Operational use is temporarily disabled without permanent revocation |
| REVOKED | Operational use has been withdrawn |
| SUPERSEDED | Operational use has moved to a newer credential |
| EXPIRED | Operational use ended because a validity window elapsed |
| UNKNOWN | Current operational validity cannot be established |

Only `ACTIVE` supports active use.

All other states MUST prevent or block active-use flows unless a later valid state transition restores `ACTIVE`.

## Status Transitions

Allowed transitions:

```text
ACTIVE -> PAUSED
PAUSED -> ACTIVE
ACTIVE -> REVOKED
PAUSED -> REVOKED
ACTIVE -> SUPERSEDED
PAUSED -> SUPERSEDED
ACTIVE -> EXPIRED
PAUSED -> EXPIRED
any state -> UNKNOWN when evidence is insufficient
```

Transition rules:

- `REVOKED` MUST NOT return to `ACTIVE` without a new credential or explicit constitutional review.
- `SUPERSEDED` MUST NOT return to `ACTIVE`; active use belongs to the superseding credential.
- `EXPIRED` MUST NOT return to `ACTIVE` unless the validity evidence is revised through a new credential or schema-authorized update.
- `PAUSED` MAY return to `ACTIVE` when current evidence supports restored use.
- `UNKNOWN` MAY resolve to any state when sufficient evidence exists.

Transitions must be evidenced, timestamped, and historically inspectable.

## Revocation Record

A revocation record captures the evidence for an operational validity change.

Minimal record shape:

```json
{
  "revocation_version": 1,
  "card_id": "coincard:creator:brandon-lehman",
  "previous_status": "ACTIVE",
  "status": "REVOKED",
  "authority": {
    "type": "CREATOR_WALLET",
    "id": "0x0000000000000000000000000000000000000000"
  },
  "reason_code": "CREATOR_REQUEST",
  "effective_at": "2026-06-28T00:00:00Z",
  "recorded_at": "2026-06-28T00:00:30Z",
  "registry_record_version": 1,
  "evidence_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "revocation_signature": {
    "type": "eip191",
    "value": "0x..."
  }
}
```

Required fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `revocation_version` | integer | Revocation record schema version |
| `card_id` | string | Coin Card identifier affected by the status change |
| `previous_status` | string | Last established status before the transition |
| `status` | string | New operational validity state |
| `authority` | object | Authority responsible for the transition |
| `effective_at` | string | UTC timestamp when the transition became effective |
| `recorded_at` | string | UTC timestamp when the transition was recorded |
| `registry_record_version` | integer | Registry record version associated with the transition |
| `revocation_signature` | object | Signature over the revocation record excluding `revocation_signature` |

Optional fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `reason_code` | string | Bounded reason code for the transition |
| `superseding_card_id` | string | Replacement Coin Card identifier when `status` is `SUPERSEDED` |
| `evidence_hash` | string | Hash of supporting evidence for the transition |

Reason codes must not imply fraud, illegality, dishonesty, or wrongdoing unless that claim is independently established by a separate authorized process.

## Reason Codes

Allowed reason codes:

```text
CREATOR_REQUEST
REGISTRY_POLICY
ADMIN_POLICY
SUPERSEDED_BY_NEW_CARD
EXPIRED_BY_TIME
SECURITY_PRECAUTION
EVIDENCE_INSUFFICIENT
UNKNOWN
```

Reason codes provide operational context. They are not legal findings, moral judgments, or fraud determinations.

## Evidence Outputs

A revocation verifier MUST be able to produce these evidence outputs:

| Evidence Output | Source |
| --- | --- |
| Revocation status | `status` |
| Previous status | `previous_status` |
| Revocation authority | `authority` |
| Effective timestamp | `effective_at` |
| Recorded timestamp | `recorded_at` |
| Superseding card ID | `superseding_card_id`, when present |
| Reason code | `reason_code`, when present |
| Registry record version | `registry_record_version` |
| Evidence freshness | `recorded_at` + verifier freshness policy |
| Historical state | revocation record history |
| Revocation signature scheme | `revocation_signature.type` |
| Revocation signature validity | canonical revocation record + `revocation_signature.value` |

These outputs support this bounded claim:

```text
The Coin Card's current operational validity state is established by this revocation evidence.
```

They do not establish:

- recipient honesty or dishonesty
- legal compliance or non-compliance
- business legitimacy
- transfer success
- fraud
- custody
- insurance

## Validator Obligations

Validators MUST block active-use flows when state is:

```text
REVOKED
SUPERSEDED
EXPIRED
```

Validators MUST surface uncertainty when state is:

```text
UNKNOWN
```

Validators MUST surface non-use or temporary unavailability when state is:

```text
PAUSED
```

Validators MUST NOT:

- erase historical records
- treat missing revocation evidence as active status
- treat stale revocation evidence as active status
- treat revocation as proof of fraud or wrongdoing
- treat revocation as a legal finding
- treat revocation as a transfer reversal
- repair malformed revocation records into validity
- hide uncertainty because it may reduce completion

Validators MUST reject or surface uncertainty when:

- revocation record is missing when required by registry status
- revocation record uses an unsupported `revocation_version`
- required revocation field is missing
- required revocation field has the wrong type
- unknown revocation field is present
- `card_id` is malformed
- revocation `card_id` does not match registry `card_id`
- `previous_status` is unsupported
- `status` is unsupported
- transition is not permitted
- authority type is unsupported
- authority evidence is missing
- timestamps are malformed
- `recorded_at` precedes `effective_at`
- revocation evidence is stale under verifier policy
- `superseding_card_id` is required but absent
- `revocation_signature.type` is unsupported
- `revocation_signature.value` is malformed
- revocation signature verification fails

## Historical Preservation

Revoked, superseded, expired, paused, or unknown Coin Cards remain historically inspectable.

Historical preservation is required because:

- users may need to understand prior payment identity state
- receipts may refer to earlier states
- registry records may need auditability
- evidence must not disappear as a method of resolving uncertainty

A historical Coin Card record may be meaningful while no longer being operationally valid.

Revocation changes active-use permission. It does not erase prior publication or signed meaning.

## Revocation Uncertainty

Uncertainty must be surfaced when revocation evidence is incomplete, stale, unavailable, conflicting, or unverifiable.

Permitted uncertainty language:

- Revocation status unknown.
- Revocation evidence stale.
- Revocation authority not established.
- Revocation record unavailable.
- Superseding credential unknown.
- Revocation signature invalid.

Uncertainty must not be converted into active status.

Lack of current evidence is not equivalent to evidence of invalidity. It is also not evidence of validity.

## Relationship to Manifest and Registry

The manifest defines signed meaning.

The registry makes signed meaning publicly resolvable and status-bearing.

The revocation model defines how operational validity changes and how those changes remain historically inspectable.

No layer substitutes for another:

| Layer | Establishes | Does Not Establish |
| --- | --- | --- |
| Manifest | Signed identity-to-destination meaning | Operational validity |
| Registry | Public resolvability and status evidence | Revocation lifecycle authority |
| Revocation Model | Invalidation authority and lifecycle | Signed payload meaning or registry publication |

## Closing Rule

Revocation changes operational validity.

It does not rewrite signed meaning or erase historical evidence.
