# Holder authentication and API boundary

This undeployed boundary turns verified authentication evidence into a host-only Coin Card session, maps its immutable provider subject to one opaque Coin Card account, and exposes only reviewed holder operations. It never derives account authority from email, username, wallet, or a caller-supplied `accountId`.

## Authentication and account mapping

The production adapter calls Firebase Admin `verifyIdToken(token, true)` with an explicit project, issuer, provider allow-list, verified-email requirement, and revoked-token check. Local tests use a runtime-generated ephemeral P-256 authenticator implementing the same privately branded verifier interface; no fixed test private key is stored.

Firestore mapping documents are backend-only:

| Collection | Key | Purpose |
| --- | --- | --- |
| `coinCardHolderAuthSubjects` | SHA-256 of issuer + subject | Immutable provider subject to opaque account mapping |
| `coinCardHolderAccountBindings` | opaque `accountId` | Reverse one-account binding and session version |
| `coinCardHolderSessions` | SHA-256 of opaque session token | Revocable server-side session, CSRF binding, and assurance metadata |

Mapping creation is transactional and idempotent. Rebinding either side is not an ordinary holder operation.

## Session contract

The intended production cookie is:

```text
__Host-coincard_session=<opaque>; Path=/; Secure; HttpOnly; SameSite=Strict
```

It has no `Domain` attribute and therefore cannot become a parent-domain session. Its audience is `coin-card-holder`, its origin is exactly `https://app.coincard.click`, and it is unrelated to ImplicitEx Transfer Portal authentication. The server stores only hashes of the session and CSRF tokens.

Every holder mutation requires the independently verified session, exact management origin, and the session-bound CSRF token. CORS is credentialed only for the exact holder origin and never uses a wildcard. The local API client simulates a cookie jar; a deployed browser transport would use credentialed fetch while JavaScript remains unable to read the HttpOnly cookie.

Changing an already configured recipient wallet additionally requires recent, action/session/account/subject-bound step-up evidence. The current local step-up verifier is an explicitly non-production WebAuthn-shaped P-256 test double. It is not production assurance and no SMS fallback is implied.

## API and authority boundary

The API exposes account load, username reservation, identity allocation, presentation and route intent, wallet challenge verification/attachment, and entitlement assessment. It exposes no raw collection CRUD and rejects caller-supplied `accountId`.

This module is not exported from `functions/index.js` and is not deployed. It cannot set lifecycle state, publish signed artifacts or Current Heads, create Transaction Evidence or executable authority, invoke signing/KMS, or enable execution. `ACTIVATION_READY` remains the maximum mutable holder state.
