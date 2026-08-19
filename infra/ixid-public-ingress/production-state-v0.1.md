# IX ID Wildcard Public Ingress v0.1 — Production State Record

Freeze date: 2026-08-19 (pending final public-DNS gate)  
GCP project: `ixid-prod` (551374626488)  
Region: `us-central1` (Cloud Run services); global (LB components)

## Architecture

```
*.ixid.me (any IX ID address)
    │
    ▼ (DNS A record → 8.232.10.66)
Global External HTTPS Load Balancer
    │ (TLS: ixid-wildcard-cert via ixid-cert-map)
    │
    ├── /api/*  → ixid-edge-backend → ixid-edge-neg → ixid-public-edge (Cloud Run)
    │            pathPrefixRewrite: /api/ → /
    │            (edge receives /public/identity/{ix_id})
    │
    └── /*      → ixid-web-backend → ixid-web-neg → ixid-public-web (Cloud Run)
                 (static identity page; hostname → IX ID in browser)
```

## GCP Resources

### Network

| Resource | Name | Value |
|---|---|---|
| Global static IP | `ixid-ingress-ip` | `8.232.10.66` |
| Forwarding rule | `ixid-https-forwarding-rule` | `8.232.10.66:443 → ixid-https-proxy` |
| HTTPS target proxy | `ixid-https-proxy` | `ixid-url-map` + `ixid-cert-map` |
| URL map | `ixid-url-map` | see `ixid-url-map-v0.1.yaml` |

### TLS

| Resource | Name | Value |
|---|---|---|
| Certificate map | `ixid-cert-map` | entry: `*.ixid.me → ixid-wildcard-cert` |
| Wildcard certificate | `ixid-wildcard-cert` | `*.ixid.me`, DNS auth: `ixid-me-dns-auth` |
| DNS authorization | `ixid-me-dns-auth` | `_acme-challenge.ixid.me CNAME 991ac447-bc70-439f-aea2-9fc941db4356.11.authorize.certificatemanager.goog.` |

### Backend Services and NEGs

| Backend service | NEG | Cloud Run service |
|---|---|---|
| `ixid-web-backend` | `ixid-web-neg` (us-central1) | `ixid-public-web` |
| `ixid-edge-backend` | `ixid-edge-neg` (us-central1) | `ixid-public-edge` |

### Cloud Run Services

| Service | Revision | Image digest | Ingress | IAM | SA | Firestore |
|---|---|---|---|---|---|---|
| `ixid-public-web` | `ixid-public-web-00001-fpf` | `sha256:15509540c5232d314176984e438c7d8f5367e9b9c82ed02eedf77a9a2bfa8f04` | `internal-and-cloud-load-balancing` | `allUsers → run.invoker` | `ixid-web-runtime` | NONE |
| `ixid-public-edge` | `ixid-public-edge-00002-sh5` | `sha256:d535d8cf06ff5251e57395a975c29931c364ecbffa4fb9f02e4ad2ed618d3bac` | `internal-and-cloud-load-balancing` | `allUsers → run.invoker` | `ixid-edge-runtime` | NONE |
| `ixid-projection` | `ixid-projection-00002-dj9` | `sha256:5012670f47571cdd99992120d6bbccd539611060950a1ff17c225fdef3a3b7b7` | `all` (private: no allUsers) | `ixid-edge-runtime → run.invoker` | `ixid-projection-runtime` | `datastore.viewer` |

### IAM Invariant

`ixid-web-runtime` holds zero project-level roles.  
`ixid-public-web` has no Firestore authority. It serves static files only.  
`ixid-projection` is not reachable from the public internet — only `ixid-edge-runtime` can invoke it.

SA-level binding on `ixid-web-runtime` itself:
- `user:adenmediagroup@gmail.com → roles/iam.serviceAccountUser`
- The deployment principal needs `iam.serviceAccounts.actAs` on `ixid-web-runtime` to attach that runtime identity during `gcloud run deploy`. The service-account-scoped `roles/iam.serviceAccountUser` binding currently supplies that permission. It is a clean, narrow grant — scoped to this SA only, not the project.

## URL Map — Frozen Routing Contract

Source of truth: `infra/ixid-public-ingress/ixid-url-map-v0.1.yaml`

```
*.ixid.me
  /api/*  → ixid-edge-backend  (pathPrefixRewrite: /api/ → /)
  /*      → ixid-web-backend   (no rewrite)
```

The edge service contract `/public/identity/{ix_id}` is FROZEN.  
This URL map adapts the public URL namespace to that contract.  
The service does not change to accommodate ingress.

## DNS

| Record | Type | Host | Value |
|---|---|---|---|
| Cert authorization | CNAME | `_acme-challenge.ixid.me` | `991ac447-bc70-439f-aea2-9fc941db4356.11.authorize.certificatemanager.goog.` |
| Wildcard routing | A | `*.ixid.me` | `8.232.10.66` |

DNS managed via Squarespace DNS (NS: `nsd1-4.squarespacedns.com`).

## URL Map Fingerprint

Deployed fingerprint (as of 2026-08-19): `y7Zs42kzaXA=`

## Certificate State

```
ixid-wildcard-cert:
  managed.state:         ACTIVE
  authorizationAttemptInfo[0].state: AUTHORIZED
  authorizationAttemptInfo[0].attemptTime: 2026-08-19T17:53:42Z
  subject:               CN = *.ixid.me
  issuer:                Google Trust Services / WR3
  notBefore:             2026-08-19T17:09:33Z
  notAfter:              2026-11-17T17:53:40Z
```

## Data-Plane Gate — Forced-Host Evidence (2026-08-19)

Gate performed with `curl --resolve gate-test.ixid.me:443:8.232.10.66` before wildcard DNS was published.  
Verification script: `infra/ixid-public-ingress/verify-v0.1.sh --resolve` — **17/17 PASS**

### TLS certificate (no -k)
```
subject=CN = *.ixid.me
issuer=C = US, O = Google Trust Services, CN = WR3
notBefore=Aug 19 17:09:33 2026 GMT
notAfter=Nov 17 17:53:40 2026 GMT
```

### Probe 1 — Static page delivery
```
GET https://gate-test.ixid.me/
HTTP/2 200
content-type: text/html
cache-control: no-store
server: Google Frontend
via: 1.1 google
→ identity page body confirmed (IxIdentity.bootstrap present)
```

### Probe 2 — API path rewrite + edge 404
```
GET https://gate-test.ixid.me/api/public/identity/ix_nonexistent_probe
HTTP/2 404
content-type: application/json
cache-control: no-store
server: Google Frontend
body: {"error": "IX ID not found: 'ix_nonexistent_probe'"}
→ /api/ stripped; edge received /public/identity/ix_nonexistent_probe
→ canonical 404 from ixid-public-edge
```

### Direct .run.app bypass
```
ixid-public-web  direct URL → HTTP 404 (blocked)
ixid-public-edge direct URL → HTTP 404 (blocked)
ingress=internal-and-cloud-load-balancing confirmed on both
```

## Data-Plane Gate — Public DNS Evidence

*Pending wildcard A record publication in Squarespace DNS.*

```
Type:  A
Host:  *
Value: 8.232.10.66
```

Once published:
- Authoritative DNS verification: all four nsd*.squarespacedns.com return 8.232.10.66
- Public DNS resolution: gate-test.ixid.me → 8.232.10.66
- Normal-DNS web probe: HTTP 200, Cache-Control: no-store, identity page
- Normal-DNS API probe: HTTP 404, Cache-Control: no-store, canonical edge response
- Browser smoke: page derives gate-test from hostname, fetches /api/public/identity/gate-test same-origin, no CORS

## Test Gates

| Gate | Count | Result |
|---|---|---|
| Identity page tests (`npm test`) | 37 | PASS |
| Services tests (edge + projection) | 156 | PASS (55 skipped: emulator-only) |
| verify-v0.1.sh --resolve | 17 | PASS |
