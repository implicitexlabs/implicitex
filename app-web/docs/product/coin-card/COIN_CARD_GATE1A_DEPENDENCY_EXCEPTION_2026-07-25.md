# Coin Card Gate 1A Dependency Security Exception

## Status

- Decision: TEMPORARY STAGING EXCEPTION
- Production deployment: PROHIBITED
- Non-production staging: PERMITTED after repository review
- Effective date: July 25, 2026
- Mandatory review:
  - before any production deployment;
  - when `firebase-admin`, `firebase-functions`, `@google-cloud/firestore`, `google-gax`, or `@google-cloud/storage` releases a new stable version;
  - no later than August 24, 2026.

## Scope

This exception applies only to:

- `coincardWalletChallenge`;
- `coincardWalletVerify`;
- Node 22;
- `firebase-admin` 14.2.0;
- `firebase-functions` 7.3.0;
- `ethers` 6.17.0.

This exception explicitly excludes:

- production deployment;
- the registry-read spike;
- billing;
- provisioning;
- handle reservation;
- order creation;
- Coin Card issuance;
- the dashboard;
- the claim UI;
- Transfer Portal changes.

## Advisory 1 — brace-expansion

- Advisory: GHSA-mh99-v99m-4gvg
- Installed vulnerable version: `brace-expansion` 2.1.2
- Patched release: 5.0.8
- Severity: high

Exact dependency path:

```text
firebase-admin 14.2.0
→ @google-cloud/firestore 8.7.0
→ google-gax 5.0.8
→ rimraf 5.0.10
→ glob 10.5.0
→ minimatch 9.0.9
→ brace-expansion 2.1.2
```

`minimatch` declares `brace-expansion` `^2.0.2`. Forcing 5.0.8 would cross
three major versions. The latest compatible Firebase and Google Cloud
dependency chain cannot reach the patched Glob and Minimatch chain.

Callable request data is never passed to `glob`, `minimatch`, `rimraf`, or
`brace-expansion`. The vulnerable package is in the dependency closure, but no
reachable request-controlled execution path was identified.

## Advisory 2 — uuid

- Advisory: GHSA-w5hq-g745-h8pq
- Installed vulnerable versions: `uuid` 9.0.1
- Patched release: 11.1.1
- Severity: moderate

Exact dependency paths:

```text
firebase-admin 14.2.0
→ @google-cloud/storage 7.21.0
→ gaxios 6.7.1
→ uuid 9.0.1
```

```text
firebase-admin 14.2.0
→ @google-cloud/storage 7.21.0
→ teeny-request 9.0.0
→ uuid 9.0.1
```

The parent packages declare `uuid` `^9.0.1` and `^9.0.0`. Forcing 11.1.1
would cross two major versions.

Gate 1A uses Node `crypto.randomUUID()`, not the `uuid` package. Gate 1A does
not call `uuid` v3, v5, or v6 and does not provide caller-controlled buffers or
offsets to `uuid`. `@google-cloud/storage` is not imported by the Gate 1A
callable code.

## Compensating controls

- Firebase Auth is required.
- `email_verified` must be `true`.
- Firebase App Check is enforced.
- All callable fields receive strict bounded validation.
- Challenges expire after ten minutes.
- Challenge issuance is limited to five challenges per account per rate-limit window.
- Challenges are consumed atomically and only once.
- Replay and concurrent submissions are rejected.
- Direct client Firestore access is denied.
- No callable input reaches `glob`, `minimatch`, or `brace-expansion`.
- No Gate 1A code imports or invokes the vulnerable `uuid` package.
- Restricted access and retention must apply to Functions logs.

## Deployment restrictions

- Staging must use a separate Firebase project.
- Production aliases and production Functions deployment commands must not be added while this exception is active.
- The registry-read spike must not be included in a staging deployment.
- Staging must expose only `coincardWalletChallenge` and `coincardWalletVerify`.
- Staging data must be test data only.
- No real customer onboarding, billing, wallet migration, or Coin Card provisioning may use this staging service.

## Removal criteria

This exception may be closed only when one of these occurs:

1. Compatible stable upstream dependencies remove both vulnerable package versions.
2. The vulnerable transitive packages are removed from the deployed dependency closure.
3. A reviewed architectural change eliminates the affected Google Cloud dependency paths.
4. Production deployment is abandoned and Gate 1A is removed.

npm overrides crossing unsupported major-version ranges are not an approved
remediation.

## Review record

- Owner: Antoine Dennison
- Technical reviewer: ____________________
- Review date: ____________________
- Decision: ____________________
- Notes: ____________________
