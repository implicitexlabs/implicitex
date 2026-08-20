# IX ID Holder Authority v0.1 — M1 Production State Evidence
## 2026-08-20

This document records the final observed production state of the IX ID Holder
Authority v0.1 deployment, the re-smoke evidence against the frozen two-token
protocol, the Auth exposure census, the neutralization chronology, and all
closure probes.

It is an evidence document, not a closure declaration. M1 closure requires
independent review.

---

## 1. Accepted Implementation Commits

| Commit | Date | Description |
|---|---|---|
| `0c069ed` | 2026-08-19 | Contract freeze (authority of record) |
| `e880898` | 2026-08-20 | M1 implementation |
| `2503933` | 2026-08-19 | Security Rules gate (73 Python / 28 Node) |
| `6755bf8` | 2026-08-20 | Deployment bug fixes (Host/hop-by-hop; NOT accepted for two-token protocol) |
| `b772f56` | 2026-08-20 | **Frozen two-token protocol restored**; 35 new handler tests |
| `57f8c21` | 2026-08-20 | URL-map `/holder/` rewrite corrected; first production evidence |

`b772f56` and `57f8c21` are the accepted M1 implementation state.
`6755bf8` introduced the incorrect two-token header redesign; it is superseded
by `b772f56` and retained as historical context only.

---

## 2. Frozen Two-Token Protocol (§5.1)

```
Browser → LB → ixid-holder-edge → ixid-holder-authority

Browser sends:
  Authorization: Bearer <firebase-id-token>

Edge strips from inbound:
  X-Serverless-Authorization (prevents forged Cloud Run invoker credential)
  X-Ix-* (prevents forged trust headers)
  Host (prevents hostname confusion at authority)
  hop-by-hop headers (RFC 7230 §6.1)

Edge forwards unchanged:
  Authorization: Bearer <firebase-id-token>

Edge adds:
  X-Serverless-Authorization: Bearer <google-oidc-token>  ← Cloud Run IAM checks this

Authority Cloud Run runtime validates:
  X-Serverless-Authorization (before Flask runs)

Authority Flask validates:
  Authorization: Bearer <firebase-id-token>  ← via Firebase Admin SDK

X-Firebase-Authorization has NO authority in either service.
```

---

## 3. Deployed Services

### ixid-holder-authority (private)

| Field | Value |
|---|---|
| Revision | `ixid-holder-authority-00003-n7k` |
| Image tag | `gcr.io/ixid-prod/ixid-holder-authority:v0.1.3` |
| Image digest | `sha256:b90f9e49952906c59632f569fb445036c3bcc5bd90052eacc4dae3a7f27e5e73` |
| Service account | `ixid-holder-authority-runtime@ixid-prod.iam.gserviceaccount.com` |
| Ingress | `all` (Cloud Run IAM provides access control) |
| Allow unauthenticated | No (`--no-allow-unauthenticated`) |
| Region | `us-central1` |

**Authority service IAM (`roles/run.invoker`):**
```
serviceAccount:ixid-holder-edge-runtime@ixid-prod.iam.gserviceaccount.com
```
Only `ixid-holder-edge-runtime` holds `run.invoker` on this service.

### ixid-holder-edge (public proxy)

| Field | Value |
|---|---|
| Revision | `ixid-holder-edge-00004-v7t` |
| Image tag | `gcr.io/ixid-prod/ixid-holder-edge:v0.1.3` |
| Image digest | `sha256:acb604eaf9194cb95a5bbad92b65839ec46a94bb7cf56a9f7eed77cb5b60ae22` |
| Service account | `ixid-holder-edge-runtime@ixid-prod.iam.gserviceaccount.com` |
| Ingress | `internal-and-cloud-load-balancing` |
| Allow unauthenticated | Yes (public; IAM boundary is at authority) |
| Region | `us-central1` |

---

## 4. IAM Invariants (observed)

| Check | Observed |
|---|---|
| `ixid-holder-edge-runtime` project-level roles | **ZERO** |
| `ixid-holder-authority-runtime` project-level roles | **`roles/datastore.user` only** |
| Authority service `run.invoker` | **`ixid-holder-edge-runtime` only** |

---

## 5. Infrastructure

### Serverless NEG

```
name:               ixid-holder-neg
type:               SERVERLESS
cloud_run.service:  ixid-holder-edge
region:             us-central1
```

### Backend Service

```
name:                  ixid-holder-backend
loadBalancingScheme:   EXTERNAL_MANAGED
backends[0].group:     ixid-holder-neg
```

### URL Map Rule (ixid-url-map)

```yaml
pathRules:
  - paths: ["/api/holder/*"]
    service: ixid-holder-backend
    routeAction:
      urlRewrite:
        pathPrefixRewrite: "/holder/"   ← trailing slash required
  - paths: ["/api/*"]
    service: ixid-edge-backend
    routeAction:
      urlRewrite:
        pathPrefixRewrite: "/"
```

---

## 6. Firestore Security Rules

```
Ruleset:    projects/ixid-prod/rulesets/0c2a6c59-35d5-482c-821c-1f256aa99e1a
Release:    cloud.firestore
CreateTime: 2026-08-20T10:36:52.658427Z
Source:     services/firestore.rules (committed 2503933)
```

Rules deny all direct client reads and writes to all six authority collections.
Only `ixid-holder-authority-runtime` holds `datastore.user` and writes via the
Admin SDK, which bypasses Security Rules.

---

## 7. Firebase Authentication Provider State

| Provider | State at closure |
|---|---|
| Email/password | **Disabled** |
| Anonymous | **Disabled** |
| Phone | **Disabled** |

Firebase Auth was initialized during M1 deployment (no prior configuration
existed). No sign-in providers were configured before M1 began.

---

## 8. Firebase Auth User Census and Disposition

### Exposure windows

| Window | When | Provider enabled |
|---|---|---|
| First exposure | 2026-08-20T11:46–11:53Z (approx) | Anonymous |
| Second exposure | 2026-08-20T18:48–18:48Z (approx) | Email/password |

Both windows were brief. Email/password was disabled immediately after
obtaining the smoke credential.

### All Firebase Auth users in ixid-prod

| UID | Email | Providers | Created (UTC) | Last Login (UTC) | Classification |
|---|---|---|---|---|---|
| `bfGKaW2RwFUiob99C81CI1hGd9y1` | (anonymous) | `[]` | 2026-08-20T11:52:56Z | 2026-08-20T11:52:56Z | Known M1 smoke-1 |
| `2qeuak1aJHcNnoKrRrwUQqpRBql2` | `m1-smoke-authority@ixid.me` | `[password]` | 2026-08-20T18:48:29Z | 2026-08-20T18:48:29Z | Known M1 smoke-2 |

**No unexpected Firebase Auth users were found.**

### Firestore identity_keys (computed)

```
smoke-1 uid bfGKaW2RwFUiob99C81CI1hGd9y1
  identity_key: f3c52109e8f80faf4bf022c1efee2e52fbd7f751b2ccd20020de969f170de144
  account_id:   ix_GcJZ9vnbWhabnSKEIeA9Kg
  ix_id:        m1-smoke-test

smoke-2 uid 2qeuak1aJHcNnoKrRrwUQqpRBql2
  identity_key: 90cbe07cdca74b7a33b2964b0bf03f7fc76fa576fb926d70be3feda2c5f52f55
  account_id:   ix_aHXb-0lh2RRbo9nnL4v_Sg
  ix_id:        m1-smoke-authority
```

Both Firestore authority records are preserved as M1 smoke evidence.
No authority state was created during either exposure window other than these
known identities.

### Neutralization

Both Firebase Auth users were disabled and refresh tokens revoked at:
- **Revoke timestamp:** `1787253010` (2026-08-20T19:10:10Z)
- **`disabled: true`** confirmed via re-query
- **`validSince: 1787253010`** confirmed via re-query

Latest token issuance: 2026-08-20T18:48:29Z (smoke-2 sign-in).
Conservative 70-minute cooldown ends: **2026-08-20T20:20:11Z**.

After that time, all Firebase ID tokens issued during either exposure window
will have expired naturally (1-hour Firebase ID token lifetime). Revoked
refresh tokens prevent new ID token issuance.

---

## 9. Test Gate Results

### Python (services/) — commit `b772f56`

```
Total:   319 passed, 1 skipped
Skip:    TestF13DirectAuthorityInvocation — Cloud Run IAM not testable in emulator
                                           (production-only, expected skip)
```

Breakdown:
- 73 holder service tests (TestLoop* + TestF*) — all pass with Firestore emulator
- 35 new holder handler tests (test_ixid_holder_handlers.py) — frozen protocol invariants
- 211 pre-existing service tests — 0 regressions

### Node.js Security Rules (services/security-rules-tests/)

```
28 passed, 0 failed
```

---

## 10. Re-Smoke Evidence (frozen two-token protocol, v0.1.3 images)

Smoke identity: `m1-smoke-authority@ixid.me` (uid `2qeuak1aJHcNnoKrRrwUQqpRBql2`)
Protocol: `Authorization: Bearer <firebase-token>` (frozen §5.1)

| Probe | Expected | Observed |
|---|---|---|
| R-S8.1 Unauthenticated workspace | 401 + `cache-control: no-store` | **PASS** |
| R-S8.2 CREATE_ACCOUNT | 201 — `ix_aHXb-0lh2RRbo9nnL4v_Sg`, ACTIVE | **PASS** |
| R-S8.3 REGISTER_IX_ID `m1-smoke-authority` | 201 — ACTIVE | **PASS** |
| R-S8.4 GET_WORKSPACE | 200 — account + ix_ids array | **PASS** |
| R-S8.5 Forged `X-Serverless-Authorization` overwritten | Workspace still 200 (edge overwrites) | **PASS** |
| R-S8.6 `X-Firebase-Authorization` alone | 401 (no authority) | **PASS** |
| R-S8.7 Edge runtime project IAM | ZERO bindings | **PASS** |
| R-S8.8 Authority runtime project IAM | `roles/datastore.user` only | **PASS** |
| R-S8.9 Authority service invoker | `ixid-holder-edge-runtime` only | **PASS** |
| R-S8.10 Direct edge bypass | 404 (`ingress=internal-and-cloud-load-balancing`) | **PASS** |
| R-S8.11 Direct authority IAM | 403 (no `allUsers run.invoker`) | **PASS** |
| R-S8.12 No permissive CORS | No `Access-Control-Allow-Origin` on OPTIONS | **PASS** |
| R-S8.13 Existing paths regression | Web root 200, `/api/v0.1/*` 404 | **PASS** |

---

## 11. Containment and Remediation Chronology

| Time (UTC) | Action |
|---|---|
| 2026-08-20T11:46Z (approx) | Anonymous auth enabled (first smoke, not authorized) |
| 2026-08-20T11:52:56Z | Anonymous user `bfGKaW2R...` created |
| 2026-08-20T11:53Z (approx) | First smoke: CREATE_ACCOUNT, REGISTER_IX_ID (`m1-smoke-test`) |
| 2026-08-20 (same session) | Exposure identified; URL map withdrawn; anonymous + email/password disabled |
| 2026-08-20 | Two-token protocol bug identified; `b772f56` committed restoring §5.1 |
| 2026-08-20T18:48:29Z | Email/password enabled briefly; smoke-2 user created |
| 2026-08-20T18:48:29Z | Email/password disabled immediately after credential obtained |
| 2026-08-20T18:48–19:10Z | Re-smoke against frozen protocol (R-S8.1–R-S8.13): all PASS |
| 2026-08-20T19:10Z (cleanup gate) | URL map withdrawn again for Auth cleanup |
| 2026-08-20T19:10:10Z | Both users `disabled=true`, `validSince=1787253010` |
| 2026-08-20T19:10Z | Stray emulator processes terminated |
| 2026-08-20T20:20:11Z | 70-minute cooldown ends; URL map restoration authorized |

---

## 12. Final Closure Probes (after cooldown)

Probes executed at **2026-08-20T20:29:04Z** (route live after LB propagation) /
**20:30:19Z** (all probes complete).
URL map fingerprint at restoration: `Ah3rpz12iqw=`

### Pre-restoration read-only checks (all PASS before URL map was touched)

| Pre-check | Result |
|---|---|
| Firebase email/password disabled | PASS |
| Firebase anonymous disabled | PASS |
| Firebase phone disabled | PASS |
| Both smoke users `disabled=true`, `validSince=1787253010` | PASS |
| Total Firebase Auth users = 2, no unexpected users | PASS |
| `/api/holder/*` absent from live URL map | PASS |

### URL map restoration

Restored `/api/holder/*` → `ixid-holder-backend` (`pathPrefixRewrite: /holder/`) at
2026-08-20T20:22Z. Control plane confirmed exact shape:
- default → `ixid-web-backend`
- `/api/holder/*` → `ixid-holder-backend` (`pathPrefixRewrite: /holder/`)
- `/api/*` → `ixid-edge-backend` (`pathPrefixRewrite: /`)

### Closure probes

| Probe | Expected | Observed |
|---|---|---|
| CP-1: Unauthenticated holder GET workspace | `401` + `cache-control: no-store` | PASS |
| CP-2: No permissive CORS (OPTIONS, evil Origin) | No `Access-Control-Allow-Origin` | PASS |
| CP-3: Web root | `200` | PASS |
| CP-4: Public API regression `/api/v0.1/ix/notexist` | `404` | PASS |
| CP-5: Direct edge bypass (`.run.app`) | `404` | PASS |
| CP-6: Direct authority unauthenticated | `403` | PASS |
| CP-7: Firebase Auth providers post-restoration | email/anonymous/phone disabled | PASS |
| CP-8: Final Firebase Auth census | 2 users, both known, both disabled | PASS |

All 8 closure probes PASS. No new credentials created. No CREATE_ACCOUNT or
REGISTER_IX_ID called. Authenticated path proven by R-S8 re-smoke (section 10).

---

## 13. Git Boundary (final)

M1 service and infra paths: **clean** (no unstaged M1 changes at evidence capture).

Unrelated Coin Card WIP exists in `app-web/`, `docs/product/coin-card/`,
`coincard/`, `firebase.json` — not part of M1 boundary; not modified by M1
work.

```
M1 commit chain (0c069ed → 57f8c21):
  0c069ed  Contract freeze
  e880898  M1 implementation
  2503933  Security Rules gate
  6755bf8  Deployment bug fixes (Host/hop-by-hop; two-token protocol incorrect)
  b772f56  Frozen two-token protocol restored + 35 handler tests
  57f8c21  URL-map /holder/ fix + first production evidence
```

HEAD at evidence capture: `57f8c21`
