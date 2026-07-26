# Coin Card Wallet Ownership API — V1

**Status:** IMPLEMENTED AND TESTED LOCALLY — production deployment blocked pending backend deployment review
**Scope:** Wallet-control evidence only. No billing, provisioning, claim-UI, dashboard, or Transfer Portal changes.

## Security boundary

Firebase Authentication is the account authority. Both callable operations require:

- a valid Firebase Auth context;
- `email_verified === true`;
- Firebase App Check;
- an account-scoped rate limit.

Browser clients have no direct Firestore access to `walletChallenges`, `walletProofs`,
`walletChallengeRateLimits`, or `auditEvents`. The Admin SDK transaction is the only
write path.

## `coincardWalletChallenge`

Input:

```json
{
  "handle": "alice",
  "walletAddress": "0x...",
  "chainId": 137,
  "purpose": "claim_coin_card"
}
```

The server normalizes the handle and wallet, generates a 32-byte random nonce, a
random challenge ID, and a UUID request ID, then stores the challenge and issuance
audit event in one Firestore transaction. Challenges expire after ten minutes.

Output:

```json
{
  "schemaVersion": "implicitex.coincard.wallet-challenge.v1",
  "challengeId": "<32 base64url characters>",
  "requestId": "<UUID>",
  "message": "<exact message passed to personal_sign>",
  "issuedAt": "<ISO-8601 UTC>",
  "expiresAt": "<ISO-8601 UTC>",
  "bindings": {
    "domain": "implicitex.com",
    "version": 1,
    "purpose": "claim_coin_card",
    "accountId": "<Firebase UID>",
    "handle": "alice",
    "walletAddress": "0x...",
    "chainId": 137
  }
}
```

The canonical EIP-191 message is:

```text
ImplicitEx Coin Card Wallet Ownership v1

domain: implicitex.com
version: 1
purpose: claim_coin_card
account_id: <Firebase UID>
handle: <canonical handle>
wallet_address: <checksummed EVM address>
chain_id: 137
request_id: <server UUID>
issued_at: <ISO-8601 UTC>
expires_at: <ISO-8601 UTC>
nonce: <server 32-byte base64url nonce>
```

## `coincardWalletVerify`

Input:

```json
{
  "challengeId": "<server challenge ID>",
  "requestId": "<server request ID>",
  "handle": "alice",
  "walletAddress": "0x...",
  "chainId": 137,
  "purpose": "claim_coin_card",
  "signature": "0x..."
}
```

The server transaction:

1. reads the authoritative challenge;
2. rejects another account without consuming the owner’s challenge;
3. rejects any challenge not in `ISSUED`;
4. checks expiration and every submitted binding;
5. performs EIP-191 signer recovery against the stored exact message;
6. marks the challenge `VERIFIED`, `REJECTED`, or `EXPIRED`;
7. creates an immutable wallet proof only on success;
8. creates a terminal audit event.

Steps 1–8 commit atomically. Failed authorized verification attempts are terminal
and cannot be retried. Concurrent attempts cannot both succeed.

The successful proof binds exactly one:

```text
account + handle + wallet + chain + purpose + request + challenge
```

It is wallet-control evidence for that operation. It is not an identity claim and
does not prove ongoing wallet control.

## Threat model

| Threat | Control |
|---|---|
| Client-generated or predictable nonce | 32 random bytes generated server-side |
| Replay | Transaction requires `status == ISSUED`; first terminal attempt consumes it |
| Concurrent double submission | Firestore transaction serializes the challenge document |
| Signature moved to another account | Account ID is in the signed message and checked against Auth |
| Signature moved to another handle/wallet/chain/purpose/request | Every value is in the signed message and repeated verification bindings |
| Stolen challenge ID | 192-bit random ID; account mismatch is rejected without consuming |
| Expired evidence | Ten-minute expiry checked using the server clock |
| Direct database bypass | Deny-all client rules for authoritative collections |
| Challenge flooding | Five issues per account per ten-minute transaction window; App Check enforced |
| Signature or nonce disclosure in logs | Functions log IDs and outcome codes only |
| Identity overclaim | Proof vocabulary is “wallet control,” never “identity verified” |

## Deferred by design

- handle reservation and order-shell creation;
- payment and checkout;
- provisioning and registry publication;
- wallet-update/recovery purposes;
- claim-page integration;
- production Functions and Firestore-rules deployment.

Those remain deferred. Passing this boundary does not authorize work on them.

## Validation

The local gate covers:

- server nonce size and client-nonce rejection;
- successful EIP-191 recovery and proof creation;
- replay and simultaneous double submission;
- expiration;
- wrong signer;
- changed domain, version, wallet, handle, chain, purpose, account, and request ID;
- unverified email;
- transactional issuance rate limiting;
- deny-all rules for every authoritative collection.

`npm test` runs the domain and actual Firestore-store transaction contract through
a serializable Firestore test double. `npm run test:rules` compiles the production
rules in the Firebase Firestore emulator and attempts unauthenticated reads and
writes against all named collections plus an unknown collection.

The emulator gate passed on July 25, 2026: 11 collection paths × read/write were
all rejected with `PERMISSION_DENIED`.

Production deployment is intentionally not part of this task. Before deployment,
the Functions/IAM configuration must be added to the staging Firebase topology,
the callable boundary must pass an Auth/App Check integration test, and the
remaining Firebase Admin dependency advisories must receive a major-version
upgrade review.
