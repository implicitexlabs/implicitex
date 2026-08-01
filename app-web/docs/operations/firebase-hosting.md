# Firebase Hosting — Operations & Deployment Notes

## Configuration

| Field | Value |
|---|---|
| Config file | `/implicitex/firebase.json` |
| Public directory | `app-web/frontend/public` |
| Default project | `implicitex-236f2` |
| Production project | `implicitex` |
| Staging URL | `https://implicitex-236f2.web.app` |
| Production URL | `https://implicitex.com` |

Deploy command (run from `/implicitex/`, where `firebase.json` lives):

```bash
firebase deploy --only hosting
```

---

## Cache-Control Configuration

### Why this matters

Firebase Hosting sits behind a global CDN. On deploy, Firebase issues a cache invalidation, but propagation to edge nodes is not instantaneous. Without explicit `Cache-Control: no-cache` headers on HTML files, edge nodes may serve stale HTML for minutes after a deploy.

**JS files have been `no-cache` since initial setup. HTML files were added 2026-06-23** after a live smoke test revealed `consent.js` was missing from `implicitex.com` while correctly present on the staging URL. The deploy was correct; the CDN edge had a stale copy.

### Current configuration

| File type | Cache-Control | Reason |
|---|---|---|
| `**/*.html` | `no-cache, must-revalidate` | HTML references versioned assets; stale HTML breaks deploys |
| `**/*.js` | `no-cache, must-revalidate` | JS must always be current; no fingerprinting/versioning in use |
| CSS, images, fonts | (Firebase default) | These change rarely; fingerprint if needed in future |

### Important limitation

`Cache-Control` headers in `firebase.json` control **browser caching**, not Firebase's own CDN layer. Firebase Hosting's Fastly CDN applies `max-age=3600` to HTML responses regardless of the header set in `firebase.json`. Confirmed by observation: staging URL returned `cache-control: max-age=3600` even on a `x-cache: MISS` after the `no-cache` fix was deployed.

This means CDN propagation lag after a deploy is inherent to Firebase Hosting and cannot be eliminated via response headers alone. The `no-cache` header still provides value for browsers (prevents browser-level caching), but will not prevent CDN edge nodes from caching for up to 3600s.

### The failure mode (2026-06-23)

1. `consent.js` added to all 16 HTML pages and deployed.
2. Staging URL (`implicitex-236f2.web.app`) served correct HTML immediately (MISS on CDN = went to origin).
3. Custom domain (`implicitex.com`) served stale HTML missing `consent.js` for several hours — multiple Denver edge nodes each held independent `max-age=3600` cached copies.
4. Root cause: Firebase CDN applies `max-age=3600` to HTML at the CDN layer regardless of response headers.
5. Partial fix: Added `**/*.html` → `no-cache, must-revalidate` to `firebase.json` (commit `1327da8`) — prevents browser caching, does not affect CDN TTL.
6. Resolution: CDN nodes naturally expired their cached copies; custom domain then served correct HTML.

**Lesson:** Always check the custom domain, not just staging, when a deploy adds or reorders script tags. The staging URL bypasses the custom domain CDN layer.

---

## Deploy Verification Sequence

After any deploy that changes HTML (script tags, meta tags, canonical URLs, structured data):

```bash
# 1. Check staging immediately — should always be correct
curl -s https://implicitex-236f2.web.app/ | grep -n "<script\|canonical\|<meta"

# 2. Check custom domain — may lag by minutes if CDN had prior HTML cached
curl -s https://implicitex.com/ | grep -n "<script\|canonical\|<meta"

# 3. If custom domain shows stale content, check response headers
curl -I https://implicitex.com/
# Look for: x-cache, age, cache-control in the response
```

If staging is correct and custom domain is stale: check `cache-control` and `x-cache` response headers. If `x-cache: HIT` and `cache-control: max-age=3600`, the CDN edge received the old HTML before the `no-cache` fix was in place. Wait for the TTL to expire (up to 60 min), then re-check. After the TTL expires the edge fetches from origin and picks up the new `no-cache` policy — this lag will not recur on subsequent deploys.

---

## Security Headers

All routes (`**`) receive:

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' [polygon RPC endpoints]; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=()` |
| X-Content-Type-Options | `nosniff` |

If adding a new external resource (CDN, font, analytics endpoint), the CSP `connect-src` or relevant directive must be updated before the resource will load.

---

## Redirects

| Source | Destination | Type | Added |
|---|---|---|---|
| `/get-started.html` | `/start.html` | 301 | 2026-06-23 |

---

## Account Access

Firebase console: `https://console.firebase.google.com/project/implicitex-236f2/overview`  
Google account: `antoine.dennison@gmail.com`
