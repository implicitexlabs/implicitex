# Google Search Console — Setup & Operations Log

## Property

| Field | Value |
|---|---|
| Property URL | `https://implicitex.com/` |
| Property type | URL prefix |
| Verification method | DNS TXT record |
| Verified | 2026-06-23 |
| DNS registrar | Squarespace |

---

## DNS Verification Record

```
Type:  TXT
Host:  @
Value: google-site-verification=Pq0L_oAcSnPFGFL1VSh3_pv6ltQq3Xu-k7twhy
```

**Do not remove this record.** Google re-checks ownership periodically. Removing the TXT record will cause the property to become unverified, losing all accumulated Search Console data.

### Verification history

- First attempt: token mismatch — likely caused by creating and backing out of a property in a prior session, leaving a stale token in Search Console. DNS record was visible and correct but didn't match the active token.
- Resolution: waited for DNS/Google synchronization. Verified successfully on second attempt (afternoon 2026-06-23).

---

## Sitemap

| Field | Value |
|---|---|
| Sitemap URL | `https://implicitex.com/sitemap.xml` |
| Submitted | 2026-06-23 |
| URLs in sitemap | 15 |

### Sitemap contents (as of 2026-06-23)

| URL | Priority | Change Freq |
|---|---|---|
| `https://implicitex.com/` | 1.0 | weekly |
| `https://implicitex.com/about.html` | 0.8 | monthly |
| `https://implicitex.com/start.html` | 0.8 | monthly |
| `https://implicitex.com/faq.html` | 0.8 | monthly |
| `https://implicitex.com/learn.html` | 0.7 | monthly |
| `https://implicitex.com/verification.html` | 0.7 | monthly |
| `https://implicitex.com/log.html` | 0.7 | weekly |
| `https://implicitex.com/news.html` | 0.6 | weekly |
| `https://implicitex.com/media.html` | 0.6 | monthly |
| `https://implicitex.com/contact.html` | 0.5 | yearly |
| `https://implicitex.com/jurisdictions.html` | 0.5 | monthly |
| `https://implicitex.com/terms.html` | 0.4 | yearly |
| `https://implicitex.com/privacy.html` | 0.4 | yearly |
| `https://implicitex.com/legal.html` | 0.4 | yearly |
| `https://implicitex.com/brand.html` | 0.3 | yearly |

**Note:** `get-started.html` was renamed to `start.html` on 2026-06-23, same session as GSC setup. Sitemap reflects the new URL. If `get-started.html` was indexed anywhere before this date, no redirect exists — the old URL will 404.

---

## Indexing Requests

The following URLs were submitted via URL Inspection on 2026-06-23:

1. `https://implicitex.com/`
2. `https://implicitex.com/about.html`
3. `https://implicitex.com/media.html`
4. `https://implicitex.com/privacy.html`
5. `https://implicitex.com/terms.html`
6. `https://implicitex.com/faq.html`
7. `https://implicitex.com/learn.html`
8. `https://implicitex.com/verification.html`
9. `https://implicitex.com/start.html` *(added after rename)*

---

## Structured Data Deployed (index.html)

Three JSON-LD schema nodes live on the homepage:

**Organization**
- `@id`: `https://implicitex.com/#organization`
- `name`: ImplicitEx
- `url`: `https://implicitex.com`
- `parentOrganization`: Aden Media Group LLC
- `sameAs`: X/Twitter, GitHub, LinkedIn

**WebSite**
- `@id`: `https://implicitex.com/#website`
- Enables sitelinks search box eligibility

**SoftwareApplication**
- `@id`: `https://implicitex.com/#app`
- `applicationCategory`: FinanceApplication
- `operatingSystem`: Web Browser
- `description`: Non-custodial USDC transfers on Polygon

---

## Milestone Progression

```
DNS Verification      ✅  2026-06-23
Property Activation   ✅  2026-06-23 (sitemap submitted, URLs requested)
Crawl & Discovery     ⏳  pending — first URL appears in Pages/Coverage
Indexing & Coverage   ⏳  pending — crawl statuses assigned
Brand Query Signals   ⏳  pending — "ImplicitEx" appears as a recognized query
```

**Baseline date: 2026-06-23** — use to measure time-to-first-crawl, time-to-first-index, time-to-first-impression.

### What each milestone means

| Milestone | What it proves |
|---|---|
| DNS Verification | Google believes you control `implicitex.com` — nothing more |
| Sitemap Submitted | Google received a map of the site — not confirmation it was followed |
| First URL in Coverage | Google discovered, evaluated, and cataloged a page — first real external content interaction |
| First Impression in Performance | A user query triggered a result — brand exists in search index |
| "ImplicitEx" as a Query | Google has disambiguated the brand string as an entity — brand establishment milestone |

---

## What to Check and When

### 1–7 days after 2026-06-23

Open **Pages** (formerly Coverage) report in Search Console.

Look for:
- URLs moving from "Discovered — currently not indexed" to "Crawled — currently not indexed" or "Indexed"
- Any crawl errors on priority pages
- Any structured data errors in the Rich Results report

### 1–4 weeks after 2026-06-23

Open **Performance** → **Search results** report.

Look for:
- First impressions appearing (even 0-click impressions count — they mean Google evaluated the page for a query)
- "implicitex" appearing as a query in the Queries tab
- Click-through data on priority pages

### Ongoing

Re-submit sitemap if major new pages are added.  
Use URL Inspection → Request Indexing for individual high-priority new pages.  
Do not request indexing for the same URL more than once per few days — it queues but doesn't accelerate.

---

## Account Access

Google Search Console is accessed via the Google account associated with `antoine.dennison@gmail.com`.
