# Coin Card Lifecycle Bundle Verification Contract v1

Status: implemented authentication foundation

Purpose: define atomic validation for a non-empty protected lifecycle record
bundle composed of individually authenticated lifecycle records.

## Bundle Scope

V1 bundle verification proves only this claim:

> The bundle wrapper is structurally valid, every contained lifecycle record
> authenticates independently, and the authenticated records form one coherent
> collection.

It does not prove bundle-signature authenticity. V1 bundles are not
separately bundle-signed. It does not resolve card lifecycle state, promote
presentation, or authorize execution.

The V1 result must make that absence explicit with
`bundleSignature: 'not-applicable-v1'`.

## Bundle Schema

A non-empty lifecycle bundle must contain exactly:

```text
registrySchemaVersion
registryId
environment
registryVersion
generatedAt
entries
```

The V1 non-empty bundle schema version is:

```text
coin-card-lifecycle-registry-bundle.v1
```

Bundle identity is exact in V1:

- `registryId` must be `implicitex-production`.
- `environment` must be `production`.
- `registryVersion` must be a positive safe integer.
- `generatedAt` must be a strict UTC timestamp.
- `entries` must be a dense, non-empty frozen array.

## Bundle Validation

The bundle verifier must reject:

- custom prototypes;
- hidden fields;
- accessors;
- symbol properties;
- cycles;
- shared object references;
- empty entry arrays;
- duplicate `recordId` values;
- duplicate `registryVersion` values;
- non-monotonic `registryVersion` ordering;
- duplicate lifecycle publication identities;
- registry/environment mismatches between the bundle and any entry;
- entries published after `generatedAt`.

Bundle verification must snapshot the caller-owned bundle before any async
record verification begins, then operate only on the frozen snapshot.
If a verification time is supplied for testing or deterministic replay, the
same instant must be used for the bundle freshness check and every contained
record verification.

## Entry Authentication

Each entry must authenticate through
`card/coin-card-lifecycle-record-verification.js`.

One failing entry invalidates the entire bundle. A successful bundle result must
return only frozen facts:

```javascript
{
  outcome: 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED',
  authenticated: true,
  sourceValidated: true,
  recordsAuthenticated: true,
  bundleIntegrityAuthenticated: false,
  rollbackProtected: false,
  bundleSignature: 'not-applicable-v1',
  registryId: 'implicitex-production',
  environment: 'production',
  registryVersion: 3,
  generatedAt: '2026-07-10T09:00:00.000Z',
  entryCount: 3,
  bundle: frozenBundleSnapshot,
  entries: frozenEntryResults
}
```

The result must not claim lifecycle state resolution or execution eligibility.

## Failure Outcomes

V1 bundle verification should distinguish:

- `LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE`
- `LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID`
- `LIFECYCLE_BUNDLE_STRUCTURE_INVALID`
- `LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED`

The success outcome is `LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED`.

Failure results must be frozen and must not expose partial accepted entries.

## Empty Bootstrap Boundary

The existing `validateLifecycleRegistryBundle()` empty-bootstrap validator stays
unchanged. It continues to govern only the exact empty production source:

```text
registrySchemaVersion
registryId
environment
registryVersion
generatedAt
entries
```

with `registryVersion: 0`, `generatedAt: null`, and `entries: []`.
