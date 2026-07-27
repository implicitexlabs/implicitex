# Hosting Rewrite Routing Evidence

**Date:** [fill in]
**Status:** PENDING — checklist item open until emulator run completes

---

## Question answered

> Does Firebase Hosting serve exact static files without invoking `spikeRegistryRead`,
> while falling through to the function for handles with no matching static file?

**Answer:** [fill in after running verify.js]

---

## Checklist item closed

> Hosting → `registryRead` rewrite works while exact static files retain priority.

---

## What this spike proves (and does not prove)

**Proves:**
- Exact static-file match takes priority over the `/registry/coincards/**` rewrite
- The function handles all 6 lifecycle states: ACTIVE (200), REVOKED (200), PENDING_PUBLICATION (503), hash-mismatch (503), no-record (404)
- A revoked handle returns 200 — revocation evidence is observable, not hidden as 404
- Unauthenticated direct Storage URL access is denied (Storage rules enforce access boundary in emulator)
- Structured invocation logs (spike_invocations) confirm which handles were routed where

**Does not prove:**
- The function is production-ready (it is not KMS-signed; it uses a spike collection)
- Cache policy is correct for production
- IAM-based bucket access (emulator uses Storage rules as a proxy; production uses GCS IAM)
- Authentication of lifecycle record signatures
- Rate limiting, error alerting, or reconciliation behavior

These are separate proof obligations, not part of the routing gate.

---

## How to run

**Prerequisites:**
- Firebase CLI installed (`npm install -g firebase-tools`)
- Node.js 20+ (observed: Node 22 runs successfully despite functions package.json requesting Node 20; see Node warning note below)
- **Java runtime** — required by the Firestore and Storage emulators; `java -version` must succeed before starting emulators. Install with `sudo apt-get install -y default-jre` on Debian/Ubuntu. This was confirmed as a hard prerequisite during the first execution attempt (2026-07-21).
- No production Firebase credentials active in the shell (e.g., no `GOOGLE_APPLICATION_CREDENTIALS` pointing at a production service account)

**Node version observation:** The Functions package specifies `engines.node: "20"`. The local environment is Node 22, which produces an `EBADENGINE` warning during installation. This has not yet been shown to affect emulator execution because the first run terminated before function startup due to the missing Java runtime. Production should align with the declared runtime before deployment.

```bash
# Step 0: Confirm you are NOT logged into a production project context
firebase use        # should show implicitex-236f2 or nothing; will be overridden by --project demo-spike
echo $GOOGLE_APPLICATION_CREDENTIALS   # should be empty or point at a dev credential only

# Step 1: Install dependencies
npm install --prefix app-web/backend/functions
npm install --prefix app-web/backend/scripts/spikes/hosting-rewrite

# Step 2: Start emulators — demo-spike is a local-only demo project; no real Firebase services contacted
firebase emulators:start --config firebase.routing-spike.json --project demo-spike
```

**In a second terminal:**

```bash
# Step 3: Seed fixtures (seed script will refuse to run if emulators are not detected)
node app-web/backend/scripts/spikes/hosting-rewrite/seed-fixtures.js

# Step 4: Run all 8 verification checks (verify script also guards against production)
node app-web/backend/scripts/spikes/hosting-rewrite/verify.js
```

Both `seed-fixtures.js` and `verify.js` include a step-0 guard that aborts if
`FIRESTORE_EMULATOR_HOST` is unset or if a production project ID is detected.
They will print a clear error and exit before writing or reading anything if the
environment looks wrong.

---

## Configuration used

- `firebase.routing-spike.json` — spike-only config; does NOT modify `firebase.json`
- Project ID: `demo-spike` — demo project; no real Firebase services
- Firestore emulator: `localhost:8080`
- Storage emulator: `localhost:9199`
- Hosting emulator: `localhost:5000`
- Firestore collection: `spike_registry` (isolated from any production collection)
- Function name: `spikeRegistryRead` (not the production function name)

---

## Verification output

[Paste output of `node verify.js` here]

```
=== Hosting-rewrite spike: verification ===

Check 1: Static fixture — antoine.json served directly; function NOT invoked

Check 2: ACTIVE handle — function invoked; returns 200 JSON

Check 3: Unknown handle — function invoked; returns 404

Check 4: PENDING_PUBLICATION — function returns 503

Check 5: Firestore/Storage hash mismatch — function returns 503

Check 6: REVOKED handle — function returns 200 with revocation evidence

Check 7: Direct Storage URL — unauthenticated access denied

Check 8: spike_invocations log — routing evidence

=== Summary ===

  [results here]
```

---

## Evidence: check 1 (static file priority)

Proves the key routing claim: `antoine.json` response lacks the `X-Spike-Source: function`
header. This header is set by the function on every invocation. Its absence confirms
the response came from Hosting's static file server, not from the function.

```
antoine.json response headers:
  [paste relevant headers here]

No X-Spike-Source header: [YES / NO]
Body matches registry/coincards/antoine.json: [YES / NO]
antoine absent from spike_invocations: [YES / NO]
```

---

## Evidence: check 8 (invocation log breakdown)

```
spike_invocations breakdown:
  [paste per-handle breakdown here]
```

---

## Architecture document update

When this gate passes, mark the following item in
`COIN_CARD_BACKEND_ARCHITECTURE_V1.md` blocking checklist:

> [x] Hosting → `registryRead` rewrite works while exact static files retain priority
>     — PROVED [date] (spike emulator; 8/8 checks; see HOSTING_REWRITE_EVIDENCE.md)

Do not mark the checklist item until `verify.js` reports GATE PASSED.

---

## What does not close with this gate

- [ ] Buyer proof is domain-separated, expiring, single-use, and transactionally consumed
- [ ] Storage bucket is private; validated reads cannot be bypassed via direct object URL
- [ ] `payloadHash`, `artifactHash`, and object-path semantics defined and implemented consistently
- [ ] Existing artifact objects are never overwritten
- [ ] `registryRead` response behavior defined and tested for every public lifecycle state
- [ ] Refund produces a new signed REVOKED projection; no unsigned status overlay

Each of these is a separate bounded proof.
