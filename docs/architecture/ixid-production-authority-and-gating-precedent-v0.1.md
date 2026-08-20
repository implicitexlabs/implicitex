# IX ID Production Authority and Gating Precedent
## Architecture Decision Record v0.1 — August 18, 2026

---

## Status

**FROZEN.** This document records precedents established during the DOMAIN v0.1
production deployment. It does not modify the frozen
[Identity & Trust Architecture v0.1](ixid-identity-trust-architecture-v0.1.md).

---

## Context

The DOMAIN v0.1 vertical slice was the first IX ID component to complete full
production deployment: Firestore schema, transition lifecycle, batch Scheduler,
Cloud Run HTTP boundary, Firestore indexes, IAM identities, and live end-to-end
Cloud Scheduler invocation.

During that deployment, three behavioral differences between the emulator and
the production platform were discovered and corrected. Those findings prompted
this record, which establishes precedent for all subsequent IX ID vertical slices.

---

## Decision 1: Behavioral authority defines a frozen milestone

**Behavioral authority, not component deployment, defines a frozen milestone.**
Downstream layers consume frozen guarantees and do not reopen them absent a
demonstrated contradiction, security defect, or explicitly authorized successor
specification.

A milestone is declared frozen when:

1. The behavioral contract is established and tested.
2. The production platform has validated the contract against actual
   infrastructure (not only the emulator).
3. All production-only findings have been corrected and re-verified.

Deploying code to Cloud Run is a necessary but not sufficient condition for
freezing a milestone.

---

## Decision 2: Emulator and production are distinct validation gates

Emulator and production validation are distinct gates with different purposes.
They must not be collapsed into a single gate, and neither may be weakened to
make the two appear equivalent.

| Gate | Purpose |
|---|---|
| Emulator | Proves the contract works under controlled conditions |
| Production | Proves the contract survives the actual platform |

**Production-only findings are an expected output of staged gating, not evidence
that the emulator gate failed.** The emulator caught contract violations within
its control plane. Production caught platform-specific behaviors the emulator
does not enforce. Both gates functioned correctly.

### DOMAIN v0.1 production-only findings

Three behavioral differences from the emulator environment were discovered and
corrected during production deployment:

1. **`FIRESTORE_EMULATOR_HOST=""` (empty string) poisons the Firestore client
   URI in production.** The emulator host env var must be absent — not empty —
   in production. An empty string is passed to the Firestore client as the
   endpoint URI (`dns:///`), causing `Failed to create channel to ''` at
   connection time. Fix: `gcloud run services update --remove-env-vars=FIRESTORE_EMULATOR_HOST`.

2. **Production Firestore enforces composite index field ordering; the emulator
   does not.** The repair sweep query used `FieldFilter("transition_triggered",
   "!=", None)` (IS NOT NULL) and `FieldFilter("checked_at", "<=", cutoff)`.
   Production required the composite index to list `checked_at` before
   `transition_triggered`. The emulator accepted both orderings silently. Fix:
   delete the incorrectly-ordered index and recreate with the correct field
   sequence; update `firestore.indexes.json`.

3. **`roles/iam.serviceAccountTokenCreator` is not required for Cloud Scheduler
   OIDC token issuance and must not be granted.** `roles/cloudscheduler.serviceAgent`
   (held at the project level by the Cloud Scheduler service agent) already
   includes OIDC token minting for the specified invoker service account. Adding
   `roles/iam.serviceAccountTokenCreator` is over-broad. Fix: remove the binding;
   verify that the Scheduler job still delivers HTTP 200 through Cloud Run IAM
   without it. Confirmed: it does.

---

## Decision 3: `expires_at` is the authoritative trust boundary for DOMAIN claims

For DOMAIN verification claims, `expires_at` is the authoritative time boundary
for public trust validity. The Scheduler-driven transition to `EXPIRED` status
is the durable lifecycle materialization of that fact, not the source of the fact.

**Evaluation rule (binding on all trust consumers and presentation layers):**

```
effective DOMAIN validity at evaluation time:

current =
    status in {ACTIVE, RECHECK_REQUIRED}
    AND evaluated_at < expires_at
```

A claim with `status = ACTIVE` whose `expires_at` is already in the past is
**not currently verified** and must not be presented as such. The scheduled
`EXPIRED` transition will materialize within the hour; the trust consumer must
not wait for it.

This rule is enforced by the Public Identity Presentation Kernel
(`ixid_presentation_kernel.py`), which accepts `evaluated_at` as an explicit
input and never reads the system clock internally.

---

## Decision 4: IAM assertions must distinguish service-local from inherited authority

Any statement about who may invoke a Cloud Run service must distinguish between:

- **Service-local bindings**: roles granted directly on the Cloud Run service
  resource (visible in `gcloud run services get-iam-policy`).
- **Inherited project-level authority**: roles granted at the project level that
  Cloud Run inherits (visible only in `gcloud projects get-iam-policy`).

The statement "only X can invoke this service" is only accurate if both the
service-local policy and the project-level policy are audited together. A clean
service-local policy does not guarantee a clean invocation perimeter.

**Correct formulation for DOMAIN v0.1 Scheduler service:**

> The Cloud Run service has exactly one service-specific `roles/run.invoker`
> binding: `ixid-scheduler-invoker`. Anonymous invocation is disabled.
> Additional invocation authority, if any, is governed by inherited project IAM
> and must be audited separately.

---

## Decision 5: v0.1 canonical public domain selection rule

The frozen Identity & Trust Architecture v0.1 (§3.2 claim types, §6.1 review
queue) does not guarantee that an IX ID holds exactly one DOMAIN subject at a
time. §6.1 `DOMAIN_CONFLICT` guards against two *different* IX IDs verifying
the same domain; it says nothing about one IX ID verifying multiple distinct
domains. An IX ID is permitted to accumulate DOMAIN claims for different
subjects.

This creates an authority gap in the Public Identity HTTP Projection: claim
selection itself is an authority decision. `superseded_by = None` establishes
only that a claim is the tip of its chain, not that it is *the* canonical
public domain for the IX ID.

**v0.1 canonical-domain rule (explicit product decision):**

Each IX ID presents exactly one canonical public DOMAIN at a time. This rule
applies at the projection layer and is enforced as follows:

1. **Exclude chain predecessors.** Claims with `superseded_by` set are
   excluded from selection; they are superseded chain nodes, not current tips.
   EXPIRED terminal claims retain `superseded_by = None` (EXPIRED has no
   outbound transitions) and remain as candidates.

2. **Single-subject invariant.** If non-superseded DOMAIN claim tips have more
   than one distinct `subject` value, the canonical domain is ambiguous under
   this rule. Fail closed: present no DOMAIN claim rather than silently elect
   one domain over another by verified recency. Log the ambiguity for
   operational investigation.

3. **Recency within a single subject.** When all candidate tips share the same
   subject (successive verifications of the same domain — e.g., re-verification
   after expiry), the most recently verified claim is selected.

**Why not "latest verified_at wins" across distinct subjects?**

Verification recency answers "when did IX last confirm control of this
domain?" It does not answer "which domain is this IX ID's canonical public
website?" Those are different questions with different authority structures.
Making `max(verified_at)` secretly answer the second question would turn every
second verification ceremony into an implicit canonical-domain change
operation, without any explicit controller intent to change their public
domain.

**Future evolution:**

Multi-domain presentation (showing all verified domains, with one designated
canonical) requires an explicit canonical-domain field on the IX ID account
or an explicit controller action to designate the canonical domain. That work
belongs to a future account-profile or multi-claim-presentation vertical
slice, not to the v0.1 projection loader.

---

## Frozen infrastructure state (DOMAIN v0.1 — August 18, 2026)

| Component | State |
|---|---|
| Transition Service v0.1 | FROZEN |
| DOMAIN Verification v0.1 | FROZEN |
| Scheduler Service v0.1 | FROZEN |
| Scheduler HTTP boundary (Flask/Gunicorn) | FROZEN |
| Python 3.13 / Gunicorn container | FROZEN |
| Production Firestore indexes (4 indexes) | FROZEN |
| Private Cloud Run service (`ixid-scheduler`) | FROZEN |
| Runtime / invoker IAM split | FROZEN |
| Cloud Scheduler OIDC invocation | FROZEN |
| Public Identity Presentation Kernel v0.1 | FROZEN |

### Scheduler jobs

| Job | Schedule | Purpose |
|---|---|---|
| `ixid-recheck` | `0 2 * * *` (daily 02:00 UTC) | DNS re-verification for active claims |
| `ixid-expire` | `5 * * * *` (hourly :05) | Hard-expiration materialization |
| `ixid-repair` | `20 * * * *` (hourly :20) | Stranded-transition repair sweep |

### IAM

- Runtime SA: `ixid-scheduler-runtime@ixid-prod.iam.gserviceaccount.com` — `roles/datastore.user`
- Invoker SA: `ixid-scheduler-invoker@ixid-prod.iam.gserviceaccount.com` — `roles/run.invoker` on service only; SA IAM policy is empty
- OIDC authority: `roles/cloudscheduler.serviceAgent` at project level; `roles/iam.serviceAccountTokenCreator` is NOT granted

### Cloud Run

- Service URL: `https://ixid-scheduler-i2idkn6uxq-uc.a.run.app`
- Active revision: `ixid-scheduler-00002-wsc`
- Image digest: `@sha256:62eba9f71c187486feb8cf447aa903aacb80ef11eea54e41454f78b6538cda84`

---

## Carry-forward requirements

These requirements bind all future layers that consume the DOMAIN/Scheduler stack:

1. Trust consumers must evaluate `evaluated_at < expires_at` independently of
   materialized `status`.
2. IAM statements about invocation authority must distinguish service-local from
   inherited project-level grants.
3. `evaluated_at` must always be supplied explicitly by the caller of the
   presentation kernel; the kernel never reads `datetime.now()` internally.
4. `evaluated_at` must be timezone-aware; naive datetimes are rejected with
   `ValueError`.
