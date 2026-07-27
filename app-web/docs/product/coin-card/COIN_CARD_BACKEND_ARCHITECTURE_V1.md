# Coin Card Backend Architecture — V1

**Status:** DRAFT 2026-07-21 — UNDER REVIEW: blocking checklist must be satisfied before this document is locked
**Type:** Architecture document — not commercial, not legal, not implementation

**Blocking checklist:**
- [x] KMS output verifies in the existing browser verifier without modification to the verifier — PROVED 2026-07-21 (spike.test.js 9/9; EC_SIGN_P256_SHA256; DER→P1363; see KMS_COMPATIBILITY_EVIDENCE.md)
- [ ] Hosting → `registryRead` rewrite works while exact static files retain priority
- [ ] Buyer proof is domain-separated, expiring, single-use, and transactionally consumed
- [ ] Storage bucket is private; validated reads cannot be bypassed via direct object URL
- [ ] `payloadHash`, `artifactHash`, and object-path semantics defined and implemented consistently
- [ ] Existing artifact objects are never overwritten
- [ ] `registryRead` response behavior defined and tested for every public lifecycle state
- [ ] Refund produces a new signed REVOKED projection; no unsigned status overlay

**Authority chain:**

```text
COIN_CARD_COMMERCIAL_SPEC_V1.md
    -> COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md
    -> this document
    -> COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md
    -> implementation
```

**Acceptance criteria for this document:**
- [ ] Runtime boundaries defined
- [ ] Trust and authority boundaries defined
- [ ] Command/event flow defined
- [ ] Atomicity requirements identified
- [ ] Data ownership table complete
- [ ] Failure-path analysis complete
- [ ] Security assumptions explicit
- [ ] MVP topology recommended

---

## Existing Infrastructure

Before any backend is added, this is what exists:

| Component | Technology | Notes |
|---|---|---|
| implicitex.com | Firebase Hosting — target `main` | Static site; handles registry JSON reads |
| coincard.click | Firebase Hosting — target `coincard` | Claim flow frontend at `/claim`; no backend yet |
| Transfer Portal | Firebase Hosting — target `portal` | Static; calls public RPC endpoints directly |
| Registry | Static JSON files in `app-web/frontend/public/registry/coincards/` | Served from implicitex.com; read by embed for handle resolution |
| Firebase project | `implicitex` (production), `implicitex-236f2` (staging) | Single project hosts all three targets |
| Backend | Empty | `backend/` directory exists; one Python gas service placeholder; no deployed functions |

**What this architecture adds:** Firebase Functions within the existing Firebase project; Firestore for mutable state; Cloud Storage for signed manifest files; Cloud KMS for registry signing; Secret Manager for payment credentials; Cloud Scheduler for reconciliation.

**What this architecture does not change:** All three hosting targets; all static frontend files; the registry JSON format and public URLs; the Transfer Portal embed; existing Coin Card claim flow frontend; the publisher MVP flow.

---

## The Registry Continuity Constraint

The Transfer Portal embed resolves Coin Card handles by fetching static JSON from:

```
https://implicitex.com/registry/coincards/<handle>.json
```

This URL is already in use. Any architecture that changes the URL or format breaks existing embeds and any existing cards.

### Read path

Firebase Hosting rewrites can route to a local Hosting file, a Cloud Function, or a Cloud Run service. They do not directly proxy an arbitrary Cloud Storage object URL. The correct read path is:

```
GET implicitex.com/registry/coincards/<handle>.json
                    │
                    ▼
Firebase Hosting — checks for an exact static file match first.
Existing checked-in registry JSON files (antoine.json, cc_demo_implicitex.json)
continue to be served directly without any function call.
                    │
No exact match → Hosting rewrite
                    │
                    ▼
coincard-registry-read HTTP Function
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
Firestore registry         Cloud Storage
authoritative record       signed manifest artifact
          │                    │
          └─────────┬──────────┘
                    ▼
         Validate: Firestore record ACTIVE,
         artifact hash matches manifest_hash in Firestore,
         return JSON with correct content-type and cache headers.
         Fail closed if either side is missing or disagrees.
```

**This preserves the public URL without operational compromise.** Existing static files continue to be served by Hosting (exact-file matches take priority over rewrites). New handles provisioned via the purchase flow fall through to the function. The embed does not change its fetch URL. No Firebase Hosting redeploy is required for each new card.

### Write path

The provisioning service:
1. Writes the signed manifest JSON to Cloud Storage at a versioned path: `coincards/<cardId>/<manifestHash>.json`
2. Then writes the Firestore registry record pointing to the active manifest hash and URI
3. Does not write a static file to Hosting — the `registryRead` function serves the response

Cloud Storage is the immutable artifact store for signed manifests. Firestore is the authoritative registry for card and handle state. These are separate roles. Cloud Storage is not a second registry database. If the Cloud Storage object and the Firestore registry record disagree, the Firestore record governs — regenerate the Cloud Storage object from the registry, never the reverse.

### Versioned object paths

Manifests are stored at versioned paths, not at a mutable handle-keyed path:

```
coincards/<cardId>/<manifestHash>.json
```

The Firestore registry record holds the active `manifest_hash` and `manifest_uri`. The `registryRead` function reads both. This eliminates overwrite races and makes every published manifest immutable — a refund does not overwrite the original artifact; the Firestore registry record changes status and the `registryRead` function returns the updated status without modifying the artifact.

---

## Runtime Boundary Decision

**Recommendation: Firebase Functions (2nd gen) within the existing Firebase project.**

Rationale:
- Firebase Functions 2nd gen provides the smallest Firebase-native operational surface: it integrates directly with Firebase Auth, Firestore triggers, Eventarc, Cloud Scheduler, and the Firebase CLI within the existing project.
- The coincard.click frontend is already a Firebase Hosting target in this project; the coincard CSP already anticipates Firebase SDK usage.
- Functions 2nd gen is built and deployed as Cloud Run services — this means the deployment boundary can be migrated or separated later without an infrastructure change, because it is already running on Cloud Run infrastructure.
- Firestore, Cloud KMS, Secret Manager, Cloud Scheduler, and Cloud Storage are all first-class within the same GCP project.

Note: Cloud Run is a reasonable alternative and Firebase Hosting can rewrite directly to Cloud Run. An API gateway is not inherently required by Cloud Run. The decision to use Functions 2nd gen over bare Cloud Run is one of operational surface, not capability — Functions integrates more tightly with Firebase Auth triggers, Firestore triggers, and the Firebase CLI toolchain already in use.

**Not a separate microservice now.** The logical services (Checkout, Webhook Handler, Order State, Provisioning, Registry Read, Refund, Reconciliation) are separately testable modules deployed within one Functions workspace. They can be physically separated later if load, security, or signing-key isolation requires it. The logical boundary is what matters.

---

## The Seven Logical Services

These are the backend modules, not separate deployments. Each is a independently testable unit of logic. They are co-deployed but not co-mingled.

```
┌──────────────────────────────────────────────────────────────────┐
│ Firebase Functions workspace                                      │
│                                                                  │
│  ┌─────────────────┐   ┌────────────────────┐  ┌─────────────┐  │
│  │  Checkout API   │   │  Webhook Handler   │  │ Registry    │  │
│  │  (HTTP, auth)   │   │  (HTTP, public)    │  │ Read        │  │
│  └────────┬────────┘   └────────┬───────────┘  │ (HTTP,pub.) │  │
│           │                     │              └──────┬──────┘  │
│           ▼                     ▼                     │          │
│  ┌─────────────────────────────────────────┐          │          │
│  │          Order State Service            │   Firestore +        │
│  │  (module; called by all others)         │   Cloud Storage      │
│  └────────────────┬────────────────────────┘          │          │
│                   │                                   │          │
│           ┌───────┼───────────┐                       │          │
│           ▼       ▼           ▼                       │          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │          │
│  │Provision │  │ Refund   │  │  Reconciliation  │    │          │
│  │ Service  │  │ Service  │  │     Worker       │    │          │
│  │(Firestore│  │(HTTP +   │  │  (Scheduled)     │    │          │
│  │ trigger) │  │ Webhook) │  │                  │    │          │
│  └────┬─────┘  └──────────┘  └──────────────────┘    │          │
│       │                                               │          │
│       ▼                                               │          │
│  ┌─────────────────┐                                 │          │
│  │ Registry         │◄────────────────────────────────┘          │
│  │ Publisher        │  (read: serves signed artifact)            │
│  │ (KMS → Storage) │  (write: called by Provisioning only)       │
│  └─────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Service responsibilities

**Checkout API (HTTP, requires Firebase Auth ID token)**
- Validates handle availability
- Creates or resolves account
- Verifies wallet signature (ecrecover)
- Atomically reserves handle + creates order
- Creates Stripe PaymentIntent (idempotency key: order_id)
- Returns PaymentIntent client_secret to frontend

**Webhook Handler (HTTP, public endpoint)**
- Receives Stripe webhook events
- Verifies Stripe signature on every request before any processing
- Routes `payment_intent.succeeded` → Order State Service (PAID)
- Routes `charge.refunded` → Order State Service + Refund Service
- All handlers are idempotent (Engineering Rule 2)

**Order State Service (module)**
- The only code that writes order status
- Validates that each transition is legal per the Event Table
- Writes transition to event log with timestamp, event name, from_state, to_state
- Called by Checkout API, Webhook Handler, Provisioning Service, Refund Service, Reconciliation Worker
- Never called directly from frontend

**Provisioning Service (Firestore trigger on order.status → PAID)**
- Triggered when order.status changes to PAID in Firestore
- Idempotent: checks for existing ACTIVE registry record before writing anything
- Publication protocol (explicit intermediate state prevents partial exposure):
  1. Set registry record: status → PENDING_PUBLICATION
  2. Call Registry Publisher: manifest generation → KMS sign → Storage write at versioned path
  3. Read back the stored object and verify its hash matches the computed manifest_hash
  4. Firestore transaction: set registry record status → ACTIVE, pointing to verified artifact URI and hash
  5. Call Order State Service: mark order COMPLETE
  6. Send confirmation email
- A card is not exposed as ACTIVE before step 4 completes. If step 3 fails (object unreadable or hash mismatch), the registry record remains PENDING_PUBLICATION and provisioning retries.

**Registry Publisher (module, called by Provisioning Service and Refund Service)**

Two distinct hash values are defined and must not be conflated:

```
payloadHash  = hash(canonical unsigned manifest payload)
               Computed before signing. Stored in Firestore. Used by verifiers
               to confirm the payload has not been altered since signing.

artifactHash = hash(complete signed artifact JSON bytes)
               Computed after signing. Determines the object path.
               Two signing operations on the same payload produce different
               artifactHashes (ECDSA is non-deterministic).

Object path  = coincards/<cardId>/<artifactHash>.json
               Content-addressed on the complete signed artifact.
               An existing object at this path is never overwritten.
               A retry produces a new artifact at a new path.
```

Publication steps:
1. Construct canonical manifest payload per MANIFEST_SCHEMA.md
2. Compute `payloadHash` over the canonical payload bytes
3. Submit `payloadHash` digest to Cloud KMS — **subject to the KMS compatibility gate**
4. Receive DER signature; convert to verifier-compatible format
5. Assemble signed artifact JSON: payload + converted signature
6. Compute `artifactHash` over the complete signed artifact bytes
7. Write to Cloud Storage at `coincards/<cardId>/<artifactHash>.json`
8. Read back stored object; verify the read-back bytes hash matches `artifactHash`
9. Return `{ payloadHash, artifactHash, artifactUri }` to caller

The caller (Provisioning or Refund Service) writes `payloadHash`, `artifactHash`,
and `artifactUri` to the Firestore registry record in the final atomic transaction.
The Firestore registry record is the index of which artifact is currently active.

Called for initial activation (registry_status: ACTIVE) and for each subsequent
lifecycle publication (registry_status: REVOKED, and future PAUSED, wallet-update, etc.).
Each call produces a new immutable artifact. The Firestore record is updated to point
to the latest artifact. Prior artifacts are retained and never overwritten.

**Registry Read Function (HTTP, public, no auth — served through Hosting rewrite)**
- Receives `GET /registry/coincards/<handle>.json` via Hosting rewrite (when no static file matches)
- Normalizes and validates the handle
- Reads the Firestore registry record for the handle
- Reads the Cloud Storage artifact at the URI in `registry.artifactUri`
- Verifies: read-back artifact bytes hash matches `registry.artifactHash`
- Returns the signed artifact JSON with appropriate content-type and cache headers

Response behavior by lifecycle state:

| registry_status | Response | Rationale |
|---|---|---|
| `ACTIVE` | 200, signed active artifact | Card is live |
| `PAUSED` | 200, signed paused artifact | Card temporarily inactive; verifier must handle |
| `REVOKED` | 200, signed revoked artifact | Evidence of revocation must remain discoverable; 404 would erase it |
| `PENDING_PUBLICATION` | 503 (retry) | Artifact not yet verified; do not serve partial state |
| No Firestore record | 404 | Handle has never been registered or has been fully released |
| Firestore record exists but artifact missing or hash mismatch | 503 | Internal inconsistency; fail closed |

A revoked handle returns 200 (not 404) so that external verifiers can discover and surface the revocation
rather than treating a revoked card as if it never existed. 404 would make the absence of a card
indistinguishable from a revoked card, removing verifiable evidence of lifecycle history.

**Refund Service (HTTP, requires Firebase Auth; also receives charge.refunded webhook)**
- Accepts refund requests from authenticated customers
- Four-point eligibility check (first purchase, within 30 days, per account, one refund)
- Flags compound identity for abuse signals
- Creates refund_request record
- Admin-only endpoint for approval/denial
- On approval: initiates Stripe refund (idempotency key: refund_request_id)
- On `charge.refunded` webhook: updates order → REFUNDED, card → REFUNDED, handle → HELD

**Reconciliation Worker (Cloud Scheduler, every 5 minutes)**
- Re-triggers provisioning for stalled PAID orders
- Releases expired RESERVED handle TTLs
- Transitions HELD handles past heldUntil → AVAILABLE (updates Firestore + rewrites manifest)
- Alerts on PROVISION_FAILED orders that have exhausted retries
- Alerts on approved refunds with no corresponding charge.refunded event after threshold

---

## Trust and Authority Boundaries

```
[coincard.click frontend]
    │
    │  HTTPS + Firebase Auth ID token
    │  (identity: verified email from Firebase Auth)
    ▼
[Checkout API]  ─────────────────────────────────────── Stripe API
    │                                                       │
    │  Firestore Admin SDK (Firestore write)                │  webhook
    │  (handle reservation + order creation, atomic)        ▼
    ▼                                              [Webhook Handler]
[Firestore]  ◄─────────────────────────────────────── Stripe sig check
    │                                                       │
    │  Firestore trigger on order.status = PAID             │
    ▼                                                       │
[Provisioning Service]  ◄──────────────────────────────────┘
    │
    │  Cloud KMS API  ──────────────────────────► [Cloud KMS]
    │  (sign request; key never leaves KMS)          (registry signing key)
    │
    │  Cloud Storage Admin SDK
    ▼
[Cloud Storage bucket]  ──────────────────────► [Firebase Hosting rewrite]
(manifest files)                                  (public read: *.json)
```

**Trust boundary definitions:**

| Boundary | Mechanism | What it enforces |
|---|---|---|
| Customer → Checkout API | Firebase Auth ID token | Identity is a verified email address |
| Customer → Refund Service | Firebase Auth ID token | Same identity; only the account owner can request a refund |
| Stripe → Webhook Handler | Stripe webhook signature | Stripe is the only origin that can produce valid signatures |
| Provisioning Service → Cloud KMS | IAM: service account with `cloudkms.cryptoKeyVersions.useToSign` | Only provisioning can produce registry signatures |
| Admin → Refund approval endpoint | Separate admin auth check | Customer identity is not sufficient for refund approval |
| Functions → Firestore | Firebase Admin SDK (service account) | No client-side writes to orders, registry, or accounts |
| Functions → Stripe | Stripe secret key from Secret Manager | Payment operations require server-side credentials |

---

## The Signing Boundary (Critical)

The registry signing key is the root of trust for the entire Coin Card identity system. A signed registry record is what external verifiers and the embed use to establish that a manifest is authentic. If the signing key is compromised, every historical Coin Card can be forged.

**Decision: Cloud KMS, not a private key in Secret Manager.**

| | Cloud KMS | Private key in Secret Manager |
|---|---|---|
| Key leaves GCP HSM | Never | On access (loaded into memory) |
| Audit log of signings | Yes, in Cloud Logging | Application must implement |
| Key rotation | KMS operation, no code change | Secret update + redeploy |
| If function is compromised | Attacker can request signatures via KMS API (rate-limited, logged) | Attacker gets the private key |
| Latency per signing | ~10ms API call | In-process (negligible) |
| Operational complexity | Slightly higher | Lower |

The latency cost (~10ms per provisioning) is acceptable — provisioning is not a real-time operation from the customer's perspective. The security benefit is permanent.

**IAM configuration for signing:**
- Create a dedicated service account: `coincard-provisioner@implicitex.iam.gserviceaccount.com`
- Grant `cloudkms.cryptoKeyVersions.useToSign` to this service account on the registry key only
- The Checkout API, Webhook Handler, Refund Service, and Reconciliation Worker run under a different service account with no KMS access
- The Provisioning Service (and Registry Publisher) run under the provisioner service account

This means a compromise of the checkout or refund logic does not expose signing capability. The signing boundary is enforced by IAM, not by application-layer access control.

### KMS signature-format compatibility gate (PASSED — 2026-07-21)

**Evidence:** `backend/scripts/spikes/kms-p256-compatibility/spike.test.js` — 9/9 pass
**Full evidence record:** `backend/scripts/spikes/kms-p256-compatibility/KMS_COMPATIBILITY_EVIDENCE.md`

**Correction to prior assumption:** The architecture draft incorrectly stated `EC_SIGN_SECP256K1_SHA256`
and Ethereum-style `r || s || v` format. The lifecycle record verifier
(`coin-card-lifecycle-record-verification.js`) and the trusted key record
(`coin-card-trusted-keys.js`, key `ix-lifecycle-pub-v1`) specify P-256:

| Item | Correct value |
|---|---|
| KMS key algorithm | `EC_SIGN_P256_SHA256` |
| Curve | P-256 |
| Hash | SHA-256 (handled internally by KMS) |
| Signature format returned by KMS | ASN.1 DER |
| Signature format expected by verifier | IEEE P1363, `r(32) \|\| s(32)` = 64 bytes |
| Verifier signature field encoding | `base64url-unpadded`, always 86 characters |
| Recovery identifier | None — P-256 Web Crypto does not use one |

**DER → P1363 conversion** is the only format bridge required. The conversion function
is defined and tested in `spike.test.js` and must be promoted to
`backend/functions/src/registry-publisher/der-to-p1363.js` at implementation step 6.

The spike proved, end to end, that:
1. A canonical lifecycle record payload is constructed using the exact signing contract
2. The domain-separated payload bytes are hashed with SHA-256
3. The hash is submitted to `asymmetricSign`; KMS returns a DER-encoded P-256 signature
4. `derToP1363` converts DER to 64-byte P1363 without losing any r or s bits
5. The base64url-encoded P1363 value passes `authenticateLifecycleRecord` with outcome `LIFECYCLE_RECORD_AUTHENTICATED`
6. Two independent signatures on the same payload both verify (ECDSA non-determinism is not a problem)
7. A `CARD_REVOKED` + `MANIFEST_REVOKED` record also authenticates (refund publication works)

The existing browser verifier was not modified. The trusted key file was not modified.

**What remains before implementation step 2 (IAM and service accounts):**

The `ix-lifecycle-pub-v1` public key in `coin-card-trusted-keys.js` was generated offline
by `generate_signed_coin_card_acceptance.js`. When the production KMS key is provisioned,
its public key must be exported and used to replace the `ix-lifecycle-pub-v1` entry. This
update to `coin-card-trusted-keys.js` requires a new acceptance run to re-sign the manifest.

---

## Atomicity Requirements

Firestore transactions are available within a single database. Cross-service atomicity (Firestore + Stripe + Cloud Storage) is not available — these failures require idempotent recovery, not rollback.

### Operations requiring Firestore transactions

**Handle reservation + order creation (Checkout API)**
Must be a single Firestore transaction:
1. Read handle document: verify handleStatus is AVAILABLE
2. Write handle document: handleStatus → RESERVED, reservedUntil → now + TTL
3. Write order document: status → PENDING, all fields

If the transaction fails (e.g., concurrent reservation by another user): return "handle not available." The unique constraint on handle document key provides the hard enforcement.

**PAID status + provisioning trigger (Webhook Handler)**
Must be a single Firestore transaction:
1. Read order: verify status is PENDING (not already PAID or later)
2. Write order: status → PAID, paid_at → now
3. Write event log entry

The Firestore trigger on order.status fires after the transaction commits. This is safe — the trigger fires exactly once per status change, and the provisioning service is idempotent.

**Registry publication sequence (Provisioning Service)**
Four steps in order. The card is not exposed as ACTIVE until step 4.

```
Step 1 (Firestore transaction):
  Verify handle still RESERVED for this order_id.
  Set registry record: status → PENDING_PUBLICATION.

Step 2 (KMS + Cloud Storage, not transactional with Firestore):
  Generate canonical manifest payload.
  Submit digest to Cloud KMS → receive DER signature.
  Convert to expected format (DER → verifier-compatible; per compatibility gate).
  Write to Cloud Storage: coincards/<cardId>/<manifestHash>.json

Step 3 (Read-back verification):
  Read the stored object.
  Compute its hash.
  Verify hash matches the computed manifestHash.
  If mismatch or object unreadable: do not proceed; provisioning retries from Step 2.

Step 4 (Firestore transaction):
  Set registry record: status → ACTIVE, manifest_uri, manifest_hash.
  Set order: status → COMPLETE, completed_at.
  Write event log.
```

If Step 2 or Step 3 fails: the registry record remains PENDING_PUBLICATION. The reconciliation job detects PENDING_PUBLICATION records older than N minutes and re-enters from Step 2. The Cloud Storage path is versioned by manifest hash — re-running Step 2 produces a new artifact at a new path (signatures are non-deterministic); if the path already exists from a prior attempt, overwriting it with a freshly-signed artifact is safe. Only Step 4's Firestore transaction atomically advances the card to ACTIVE.

**REFUNDED transition (Refund Service on charge.refunded)**

Refund publication uses the same PENDING_PUBLICATION protocol as initial activation.
Every externally meaningful lifecycle change produces a new signed artifact. The original
ACTIVE artifact is never overwritten or modified.

Step 1 (Firestore transaction):
  Verify order status is COMPLETE (not already REFUNDED).
  Write order: status → REFUNDED, refunded_at → now.
  Write registry record: cardStatus → REFUNDED, handleStatus → HELD,
    heldUntil → now + HANDLE_RECOVERY_PERIOD.
  Write registry record: registry_status → PENDING_PUBLICATION.
  Write refund_request: status → APPROVED, approved_at → now.
  Write event log.

Step 2 (Registry Publisher — KMS + Cloud Storage, not transactional with Firestore):
  Generate canonical manifest payload with registry_status: REVOKED and updated timestamps.
  Compute payloadHash. Sign via Cloud KMS. Assemble signed artifact. Compute artifactHash.
  Write to coincards/<cardId>/<artifactHash>.json (new path; original ACTIVE artifact unchanged).

Step 3 (read-back verification):
  Read stored object. Verify hash matches artifactHash.
  If mismatch or unreadable: retry Step 2. PENDING_PUBLICATION persists until verified.

Step 4 (Firestore transaction):
  Update registry record: registry_status → REVOKED, artifactUri, artifactHash, payloadHash → new values.
  registryRead now serves the signed REVOKED artifact for this handle.

The original ACTIVE artifact is not deleted or overwritten. It remains at its original path.
The Firestore registry record is the index. Verifiers that re-fetch the handle URL after refund
will receive the signed REVOKED projection from registryRead.

### Operations that cannot be atomic (managed by idempotency)

**Stripe API calls** — all Stripe API calls carry Stripe idempotency keys. If a call fails and is retried with the same key, Stripe returns the same result. No Firestore state should be written before a Stripe call succeeds.

**Cloud Storage writes** — these are not transactional with Firestore. Sequence: write Cloud Storage first, then write Firestore. If Cloud Storage succeeds and Firestore fails, the reconciliation job detects the inconsistency and retries the Firestore write without re-signing.

**Email dispatch** — confirmation emails are best-effort. A failed email does not roll back any state. Log failures; retry via reconciliation if needed.

---

## Data Ownership Table

| Data | Authoritative store | Role of secondary |
|---|---|---|
| Verified email identity | Firebase Auth | Firestore accounts: copy for application reads |
| stripe_customer_id | Firestore accounts | Stripe Customer object: payment processor view |
| Order state | Firestore orders collection | — |
| Payment fact | Stripe | Order record: application view after webhook confirms |
| Handle reservation + card status | Firestore registry collection | Authoritative; Cloud Storage does not override |
| Signed manifest artifact | Cloud Storage (versioned path) | **Immutable public projection only — not authority.** Cloud Storage holds the signed artifact; Firestore holds the authoritative status. If they disagree, regenerate the artifact from the Firestore record; never update Firestore to match the artifact. |
| Active manifest hash + URI | Firestore registry collection | Points to the current artifact in Cloud Storage |
| Registry signature | Embedded in the Cloud Storage artifact file | Proves ImplicitEx signed this specific artifact |
| Public JSON response | `registryRead` Function | Delivery mechanism; reads both Firestore and Cloud Storage; not an authority |
| Refund eligibility decision | Firestore refund_requests collection | — |
| Stripe refund fact | Stripe | Order record: application view after webhook confirms |
| Event log | Firestore events collection | Cloud Logging: structured duplicate for observability |
| Stripe credentials | Secret Manager | Functions runtime: loaded at startup, not stored in code |
| Registry signing key | Cloud KMS | Never exported |

---

## Firestore Collection Structure (Direction)

Not a final schema. These are the collections and their primary keys.

```
/accounts/{uid}                   Firebase Auth UID as document ID
/orders/{orderId}                 UUID generated at checkout
/registry/{handle}                Handle string as document ID (e.g., "alice")
/refund_requests/{requestId}      UUID generated at request submission
/events/{eventId}                 UUID; indexed by orderId
```

**Key structural rule:** Registry documents are keyed by handle. This enforces the uniqueness constraint at the database level — two concurrent writes for the same handle will conflict within a transaction, and only one succeeds. This is the hard enforcement that the application-layer idempotency check also relies on.

**Event log as a separate collection:** Event log documents must not be embedded inside order documents. Embedding limits queryability and creates large documents that are expensive to read. A separate events collection, indexed by orderId, is queryable, appendable, and separable.

---

## Failure-Path Analysis

### Payment fails
- Stripe does not fire `payment_intent.succeeded`
- Order remains PENDING
- Handle remains RESERVED until TTL expires
- Reconciliation job detects expired TTL, no PAID order: handle → AVAILABLE, order → FAILED
- No charge; no card; no customer impact beyond "payment declined"

### Provisioning service not triggered after payment
- `payment_intent.succeeded` webhook fires; order → PAID; Firestore trigger fires
- If trigger delivery fails (infrastructure issue): order is PAID, no PROVISIONING transition
- Reconciliation job detects orders in PAID for > N minutes; re-triggers provisioning
- Provisioning is idempotent: safe to trigger multiple times

### Cloud KMS unavailable during provisioning
- Manifest cannot be signed; provisioning cannot complete
- Order remains PROVISIONING; provisioning retries with exponential backoff
- After max retries: order → PROVISION_FAILED; alert fires
- Customer has paid; card not yet active
- Operator action: investigate KMS availability; trigger manual_re_provision once KMS recovers
- Do not refund automatically — this is an infrastructure incident, not a product failure

### Cloud Storage write fails after KMS signing
- Signed artifact computed but not stored; or stored but read-back hash verification failed
- Registry record is in PENDING_PUBLICATION state
- Provisioning retries from Registry Publisher Step 2: a new KMS signing call produces a new
  artifactHash (ECDSA is non-deterministic); a new object is written at the new path
- No existing object is overwritten; the failed attempt path is simply abandoned
- Once the new artifact passes read-back verification, the Firestore transaction in Step 4
  advances the registry record to ACTIVE and records the new artifactHash and artifactUri
- Abandoned PENDING_PUBLICATION artifacts at unreferenced paths can be garbage-collected
  by a periodic storage cleanup job (future, not MVP)

### Stripe webhook arrives twice (`payment_intent.succeeded`)
- Webhook Handler reads order; finds status already PAID or later
- No-op; returns 200 to Stripe
- No duplicate state written

### Provisioning triggered twice concurrently (e.g., webhook trigger + reconciliation)
- Both instances check for PENDING_PUBLICATION or ACTIVE registry record before doing any work
- If one reaches the Step 4 Firestore transaction first and succeeds (ACTIVE), the other
  finds the record already ACTIVE on its idempotency check and exits cleanly
- If both reach Cloud Storage writes concurrently, both produce different artifacts at
  different artifactHash paths (non-deterministic signing). Neither overwrites the other.
  Only one can win the Step 4 Firestore transaction; the other finds ACTIVE and exits.
  The artifact written by the losing instance is abandoned (garbage-collectible later).

### Refund approved; `charge.refunded` webhook never arrives
- Order remains COMPLETE; card remains ACTIVE
- Reconciliation job detects approved refund_request with no corresponding REFUNDED event after threshold
- Alert fires: operator confirms with Stripe whether refund settled; manually triggers status update if confirmed

### Reconciliation job runs twice in rapid succession
- All reconciliation actions check current state before acting
- An order already at COMPLETE is not re-provisioned
- A HELD handle with heldUntil in the future is not released
- Idempotent by construction (Engineering Rule 7)

---

## Buyer Signature vs Registry Signature

These are two distinct signatures with different signers, formats, purposes, retention rules, and replay domains. They must never use interchangeable payloads.

| | Buyer signature | Registry signature |
|---|---|---|
| Signer | Buyer's wallet (EIP-191, personal_sign) | ImplicitEx registry key via Cloud KMS |
| What it proves | Buyer controlled the wallet at checkout time and consented to bind it to this order | ImplicitEx issued this specific manifest artifact for this handle |
| When collected | During checkout, before payment | During provisioning, after payment confirmed |
| Stored where | `orders/{orderId}.buyer_signature` in Firestore | Embedded in the signed manifest artifact in Cloud Storage |
| Format | EIP-191 signature over a domain-separated payload | ECDSA/secp256k1 in verifier-compatible format (per compatibility gate) |
| Purpose at verification | Not exposed publicly; used internally to prove wallet binding during provisioning | Verified by the browser verifier and the embed to authenticate the manifest |
| Replay risk | High — must be consumed once, scoped to a specific order | Low — payload includes all manifest fields; a valid signature for one manifest is not valid for any other |

### Buyer signature payload

The payload signed by the buyer wallet must be domain-separated and order-scoped. A valid signature from a prior order must not be replayable into a new order for the same or a different handle.

Required fields:

```
domain:           "COINCARD_PURCHASE_BINDING"
version:          1
chain_id:         <chain_id of buyer's wallet>
order_id:         <UUID of this specific order>
account_id:       <Firebase Auth UID>
handle:           <the reserved handle>
wallet_address:   <the buyer's wallet address>
issued_at:        <ISO 8601 UTC timestamp>
expires_at:       <issued_at + 30 minutes>
nonce:            <server-issued random nonce, single-use>
```

The nonce must be server-issued and recorded as consumed on first use. A client-side nonce is Phase 0 only — see `project_coincard_nonce_production_requirement.md` in memory. The server verifies `ecrecover(payload, signature) == wallet_address` and marks the nonce consumed in the same Firestore transaction as the order creation.

These assumptions must hold for the security model to be valid. If any assumption becomes false, the architecture must be reviewed.

1. **Firebase Auth is the identity boundary.** A user who can authenticate with Firebase Auth and verify an email address is a valid account holder. The Checkout API trusts no identity claim that cannot be verified against a Firebase Auth ID token.

2. **Stripe webhook signatures are unforgeable.** An event received at the webhook endpoint with a valid Stripe signature was sent by Stripe. Any request without a valid signature is rejected before any logic runs.

3. **Cloud KMS signing is authorization-controlled.** Only the `coincard-provisioner` service account can request signing operations from the registry KMS key. Compromise of the checkout or refund service accounts does not grant signing capability.

4. **Secret Manager access is service-account-scoped.** The Stripe secret key is accessible only to service accounts that need it. Functions that do not call Stripe do not have Secret Manager access for Stripe credentials.

5. **The registry handle namespace is the global uniqueness boundary.** Two handles with the same string value cannot simultaneously hold RESERVED or ACTIVE handleStatus. The Firestore document key enforces this.

6. **No client-side writes to authoritative collections.** Customers cannot write directly to `/orders`, `/registry`, `/accounts`, or `/refund_requests` via the Firebase client SDK. All writes go through server-side Functions using the Admin SDK. Firestore security rules enforce this.

7. **The buyer_signature collected at checkout is non-repudiable.** The EIP-191 signature proves the buyer controlled the wallet address at checkout time. It does not prove ongoing control. For V1, this is sufficient — wallet ownership is verified once at purchase. Future versions may require periodic re-attestation.

---

## Recommended MVP Topology

```
┌───────────────────────────────────────────────────────────────┐
│  Firebase Project: implicitex (production)                     │
│                                                               │
│  Hosting: implicitex.com (main)  ─── Static registry JSON     │
│           coincard.click          ─── Checkout frontend       │
│           portal (implicitex-portal) ─── Transfer Portal      │
│                                                               │
│  Firestore database                                           │
│    /accounts /orders /registry /refund_requests /events       │
│                                                               │
│  Firebase Functions (2nd gen)                                 │
│    coincard-registry-read (HTTP, public — registry JSON reads)│
│    coincard-checkout      (HTTP, auth required)               │
│    coincard-webhook       (HTTP, public, Stripe-sig-checked)  │
│    coincard-provision     (Firestore trigger on order.PAID)   │
│    coincard-refund        (HTTP, auth required)               │
│    coincard-refund-admin  (HTTP, admin auth)                  │
│    coincard-reconcile     (Cloud Scheduler, every 5 min)      │
│                                                               │
│  Cloud KMS                                                    │
│    key ring: coincard                                         │
│    key: registry-signing-key                                  │
│    IAM: coincard-provisioner SA only                          │
│                                                               │
│  Cloud Storage                                                │
│    bucket: implicitex-registry (PRIVATE)                      │
│    path:   coincards/<cardId>/<artifactHash>.json             │
│    access: uniform bucket-level; public access prevention ON  │
│    read:   coincard-provisioner SA + coincard-registry-read SA│
│    write:  coincard-provisioner SA only                       │
│                                                               │
│  Secret Manager                                               │
│    stripe-secret-key                                          │
│    stripe-webhook-secret                                      │
│    (accessed by checkout + webhook + refund SA only)          │
│                                                               │
│  Cloud Scheduler                                              │
│    coincard-reconcile: every 5 minutes                        │
│                                                               │
│  Cloud Logging                                                │
│    structured logs keyed by order_id from all functions       │
│    KMS signing audit log                                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Firebase Hosting rewrite for registry

Add to firebase.json `main` target (after existing static files, before catch-all):

```json
{
  "source": "/registry/coincards/**",
  "function": "coincard-registry-read",
  "region": "us-central1"
}
```

Firebase Hosting evaluates rewrites after checking for an exact static file match. Existing static registry JSON files (`antoine.json`, `cc_demo_implicitex.json`) continue to be served directly by Hosting — no function call. Handles provisioned via the purchase flow have no static file; those requests fall through to `coincard-registry-read`. The embed URL does not change. No Hosting redeploy is needed when a new card is provisioned.

---

## What Does Not Get Built in V1

**Separate microservices.** The logical boundary is enough. Physical separation can follow evidence of need — load, security audit, or signing-key isolation concerns that emerge from live operation.

**Customer-facing account dashboard.** Purchasing a card and seeing it is sufficient for V1. Card management UI (wallet address update, voluntary deactivation) is future scope.

**Webhook event replay system.** Manual reconciliation via the reconciliation job is sufficient for MVP failure recovery. A full event replay system is an operational tool for a later stage.

**Multi-region deployment.** Single-region Firebase Functions is sufficient for MVP. Multi-region follows if latency or availability requirements justify the operational complexity.

**Real-time handle availability UI.** Handle availability is checked at checkout. Optimistic client-side UI that shows real-time availability (via Firestore listener) is a UX improvement, not an MVP requirement.

**Automated refund approval.** The four-point eligibility check can run automatically, but the actual refund initiation requires operator review at MVP scale. Automation follows once patterns are understood.

---

## Implementation Sequence

This is the order in which components should be built and tested. Each step produces independently verifiable output before the next begins.

```
1.  KMS compatibility spike  ← GATE PASSED 2026-07-21
    Key type: EC_SIGN_P256_SHA256 (corrected from secp256k1 assumption).
    Signing contract: domain_utf8 + 0x00 + canonicalJson_utf8; SHA-256 passed to KMS asymmetricSign.
    DER → P1363 conversion: derToP1363() in spike.test.js; promotes to der-to-p1363.js at step 6.
    Verifier: coin-card-lifecycle-record-verification.js — unmodified; 9/9 spike tests pass.
    Evidence: backend/scripts/spikes/kms-p256-compatibility/KMS_COMPATIBILITY_EVIDENCE.md

2.  IAM and service account matrix
    Create coincard-provisioner SA with KMS sign permission.
    Create coincard-operator SA for checkout/webhook/refund (no KMS access).
    Verify SA separation: operator SA cannot call KMS sign.

3.  Cloud Storage bucket
    Create implicitex-registry bucket with uniform bucket-level access
    and public access prevention enabled. No public-read ACL.
    Grant storage.objects.get to coincard-provisioner SA and coincard-registry-read SA only.
    Verify: direct public GET on a bucket object returns 403.
    Verify: coincard-registry-read SA can read; coincard-operator SA cannot.
    Verify: registryRead Function fetches object and serves response → 200 to caller.

4.  Firestore collections and security rules
    Define /accounts /orders /registry /refund_requests /events collections.
    Write security rules: reject all client-side writes to all collections.
    Verify in emulator: client SDK write to /orders is rejected; Admin SDK write succeeds.

5.  Firebase Auth integration in coincard frontend
    Verify email verification flow end-to-end in staging.
    Verify ID token is attached to requests to Functions.

6.  Registry Publisher module
    Unit tests: canonical manifest generation → KMS sign (using conversion from step 1)
    → Storage write at versioned path → read-back hash verification.
    Output: { manifestHash, manifestUri }. All assertions must pass before step 7.

7.  Registry Read Function + Hosting rewrite
    Deploy coincard-registry-read.
    Add /registry/coincards/** rewrite to firebase.json main target.
    Test: existing static file still served directly (antoine.json).
    Test: unknown handle returns 404.
    Test: Firestore record with Cloud Storage artifact → correct JSON response.
    Test: Firestore/Storage disagreement → 503.

8.  Order State Service module
    Unit tests: all 16 event table transitions; valid transitions advance state;
    invalid transitions rejected; every transition writes event log.

9.  Provisioning Service
    Integration test: PAID order → Firestore trigger → PENDING_PUBLICATION
    → Registry Publisher → read-back verify → ACTIVE record.
    Test: trigger fires twice → second invocation detects existing ACTIVE record → no-op.

10. Checkout API
    Integration test: handle availability → server nonce issue → wallet sig verify
    → atomic reservation (concurrent request for same handle: one succeeds, one fails)
    → PaymentIntent creation with idempotency key.

11. Webhook Handler
    Integration tests: payment_intent.succeeded idempotency (second delivery → no-op);
    charge.refunded idempotency; invalid Stripe signature → 400 before any logic runs.

12. Refund Service
    Integration tests: four eligibility checks; compound identity flagging;
    Stripe refund initiation with idempotency key.

13. Reconciliation Worker
    Integration tests: stalled PAID orders re-trigger provisioning;
    PENDING_PUBLICATION records older than threshold re-trigger Registry Publisher;
    expired RESERVED TTLs release handle; HELD handles past heldUntil → AVAILABLE.

14. End-to-end staging acceptance
    Full purchase path: checkout → payment → provisioning → card ACTIVE → registry read returns JSON.
    Full refund path: request → eligibility → approval → charge.refunded → card REVOKED → registry read returns REVOKED status.
    Handle recovery: simulate heldUntil expiry → reconciliation → AVAILABLE.
```

Steps 1–4 (KMS spike, IAM, Storage, Firestore rules) can proceed before attorney review is complete. No function may be deployed to production, and no Stripe live-mode credentials may be configured, until the deployment gate in COIN_CARD_COMMERCIAL_SPEC_V1.md is satisfied.

---

*This document derives from COIN_CARD_COMMERCIAL_SPEC_V1.md and COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md. If this document conflicts with either, those documents govern — update this document, not them.*
