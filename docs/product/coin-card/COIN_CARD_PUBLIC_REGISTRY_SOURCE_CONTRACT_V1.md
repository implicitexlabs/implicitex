# Coin Card Public Registry Source Contract V1

Status: implemented and locally conformant; no production Current Head,
snapshot, username identity, or signing material is published.

## 1. Purpose and trust boundary

Public Registry Source V1 owns the HTTP delivery path between a public Coin
Card page and the two authenticated username-registry artifacts:

```text
username.coincard.click
        -> fixed Current Head URL
        -> authenticate Current Head
        -> immutable snapshot URL derived from its exact sha256 identity
        -> authenticate and hash snapshot
        -> require exact revision and hash conjunction
        -> exact username lookup
```

HTTP delivery supplies untrusted bytes. CORS, CSP, cache directives, HTTPS, and
fixed URLs constrain delivery behavior; they do not authenticate an artifact.
Current Head and snapshot signatures establish authenticity, and their exact
revision/hash conjunction establishes the current routing authority.

The source layer contains no username mapping, account ID, card ID, wallet
address, route, presentation authority, or execution authority.

## 2. Fixed artifact locations

The sole Current Head location is:

```text
https://coincard.click/.well-known/coin-card-public-username-registry-head.v1.json
```

A Current Head hash of `sha256:<64 lowercase hex characters>` selects exactly:

```text
https://coincard.click/.well-known/
  coin-card-public-username-registry-snapshots/sha256/<64 lowercase hex>.json
```

The line break above is illustrative only. The deployed URL is one continuous
path. Any other algorithm, case, length, character set, path segment, query,
fragment, or traversal-shaped input is invalid before a request is made.

Browser input cannot replace the origin, path prefix, artifact algorithm, or
filename. Neither artifact may redirect.

## 3. Current Head HTTP contract

The browser performs HTTPS `GET` with:

```text
cache             no-store
credentials       omit
redirect          error
referrer policy   no-referrer
Accept            application/json
```

The response must have status `200`, preserve the exact requested response URL,
be non-opaque and non-redirected, declare `application/json`, and expose a
`Cache-Control` policy containing `no-store`. Every mismatch fails closed.

The Coin Card hosting target declares:

```text
Content-Type: application/json; charset=utf-8
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
Cache-Control: no-store, max-age=0
CDN-Cache-Control: no-store
Surrogate-Control: no-store
```

The resource is public and credentialless. Wildcard CORS avoids a dynamic list
of username subdomains. CORS is not an authenticity mechanism; a successfully
read response remains untrusted until signature verification.

The `Cache-Control`, CDN, and surrogate directives jointly prohibit browser and
shared-cache storage. V1 still retains the Current Head contract's explicit
old-but-unexpired replay limitation.

## 4. Immutable snapshot HTTP contract

The snapshot request uses HTTPS `GET`, omitted credentials, rejected redirects,
no referrer, `Accept: application/json`, and `cache: force-cache`. Reuse is safe
only because the URL is derived from an exact artifact hash and the registry
independently recomputes that domain-separated hash after authenticating the
snapshot.

The response must have status `200`, preserve the exact content-addressed URL,
be non-opaque and non-redirected, declare `application/json`, and expose a cache
policy containing `public`, a positive `max-age`, and `immutable`.

The Coin Card hosting target declares:

```text
Content-Type: application/json; charset=utf-8
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable
CDN-Cache-Control: public, max-age=31536000, immutable
```

An artifact published at one snapshot URL is immutable forever. Publication may
create a new hash URL but must never overwrite, redirect, delete-and-reuse, or
serve different bytes from an existing artifact identity. A wrong response is
unusable even if a cache returns it because the authenticated snapshot hash must
equal the Current Head hash.

## 5. CSP and service-worker contract

Public Coin Card responses permit the exact registry origin in CSP:

```text
connect-src 'self' https://coincard.click
```

The source does not need, and CSP does not grant, a wildcard connection to
arbitrary username subdomains.

The V1 Coin Card host registers no service worker and contains no Cache Storage
path capable of intercepting Current Head requests. This absence is a tested
delivery invariant. A future service worker must add an explicit network-only,
`no-store` bypass for the exact Current Head URL before registration is allowed.
Snapshot caching may be added only if its key remains the full content-addressed
URL and the verifier continues to require the exact hash.

## 6. Publication ordering

Publishing revision `N+1` requires:

1. build and sign snapshot `N+1`;
2. calculate its exact registry artifact hash;
3. publish it once at the corresponding immutable snapshot URL;
4. confirm that exact URL returns the required status, MIME, CORS, and cache
   headers and authenticates to the expected revision and hash;
5. build and sign the short-lived Current Head;
6. atomically replace the fixed Current Head object;
7. confirm the fixed endpoint bypasses browser, CDN, surrogate, and service
   worker caches before treating the revision as publicly current.

The head must never advance before its named snapshot is retrievable. Failure at
any step leaves the previous Current Head in place and creates no fallback from
the browser to another snapshot.

## 7. Failure and production boundary

Network failure, CORS denial, CSP denial, redirect, non-200 status, opaque
response, response-URL substitution, wrong MIME type, invalid cache policy,
invalid artifact hash syntax, JSON parsing failure, source outage, signature
failure, revision mismatch, or hash mismatch closes public resolution and keeps
execution authority false.

Operational diagnostics preserve two non-authoritative incident classes:

```text
TRANSPORT_UNAVAILABLE
  fetch unavailable or rejected; required endpoint/object did not return 200

TRANSPORT_CONTRACT_VIOLATED
  returned endpoint identity, MIME, cache policy, JSON, or artifact identity
  violated this contract
```

The source privately brands these diagnostics so a copied error cannot acquire a
transport classification. Current Head and snapshot verification retain the
class and source-specific code while keeping both presentation and execution
closed. Browser Fetch reports some redirect, CORS, CSP, DNS, and network failures
through the same rejected-promise surface; when the browser supplies no safe
distinction, the runtime records `TRANSPORT_UNAVAILABLE` and server/CDN evidence
must provide the finer incident classification.

This slice configures the future HTTP boundary and verifies it locally. It does
not create either production endpoint object, allocate a production account or
card ID, publish `antoinedennison`, modify the historical `antoine` lifecycle,
sign an artifact, update the protected manifest, change DNS, or deploy.
