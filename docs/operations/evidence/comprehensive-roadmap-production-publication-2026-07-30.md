# Comprehensive roadmap production publication — 2026-07-30

## Outcome

The founder explicitly authorized committing and deploying the Comprehensive
Roadmap Inventory on 2026-07-30.

The read-only HTML inventory is live at:

- `https://implicitex.com/comprehensive-roadmap.html`
- `https://implicitex.web.app/comprehensive-roadmap.html`

The production publication completed at approximately
`2026-07-30T23:41:30Z`.

## Source identity

- Approved WP-01 source snapshot:
  `fb500682fa2ca53b0ce8ddbb70608bec4fdd37cc`
- Integration-branch document commit:
  `d82ecce9d14b8b8be66e88799589ff68005650c6`
- Exact production deployment commit:
  `937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278`
- Recoverable remote production-source branch:
  `origin/docs/comprehensive-roadmap-publication-2026-07-30`
- Firebase project:
  `implicitex`
- Firebase hosting target:
  `main`

The integration commit adds the seven WP-01 roadmap source, generated-data,
interface, style, runtime, generator, and test files to the WP-02 integration
branch. The production commit is based on the previously deployed roadmap tree
and changes only the four snapshot-overlay files:

- `app-web/frontend/public/comprehensive-roadmap.html`
- `app-web/frontend/public/data/comprehensive-roadmap.json`
- `app-web/scripts/generate_comprehensive_roadmap_data.js`
- `app-web/scripts/test_comprehensive_roadmap_artifact.js`

This two-commit arrangement avoids deploying the divergent canonical runtime
before WP-02 reconciliation is complete. None of the 15 classified WP-02
conflict paths was modified by either document commit.

## Published-state correction

The WP-01 inventory remains a frozen approval snapshot. The published interface
does not rewrite its 289 records or eight-package sequence. It adds an explicit
current-control overlay so the page cannot imply that its historical state
labels are live authorization:

- WP-01 is closed.
- WP-02 is active and paused at the bounded governance-decision boundary.
- WP-03 is inactive until formally activated.

The page remains `noindex, nofollow`, read-only, and non-printable. No
comprehensive PDF was created or deployed.

## Predeployment evidence

The exact production candidate passed:

- roadmap data regeneration from the normalized Markdown;
- the comprehensive-roadmap structural and browser artifact suite;
- all expected counts: 289 roadmap records, 259 full records, 42 parents,
  eight work packages, and 30 exclusions;
- desktop and mobile responsive-layout checks;
- print-output suppression and snapshot notice;
- Coin Card release-gate verification;
- Coin Card integrity and lifecycle verification suites;
- publication, signing-generator, executable-registry, transaction-evidence,
  runtime-prerequisite, and provider-continuity suites;
- authorized execution, QR handoff, QR browser, active-flow firewall, and
  production-artifact browser suites;
- generated architecture-and-security page parity.

The full Firebase predeploy hook repeated the Coin Card release suite during
deployment and passed before the hosting version was released.

## Served-content verification

The custom domain returned `HTTP/2 200` with:

- `Cache-Control: no-cache, must-revalidate`
- the configured Content Security Policy
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`

The served files matched the production commit byte-for-byte:

| Artifact | SHA-256 |
|---|---|
| `comprehensive-roadmap.html` | `f4fbaadab2752bf8bb02d478ae59888c593a1ee25af995e8c067825d0d23fff6` |
| `data/comprehensive-roadmap.json` | `61c5e7d966a682eb6887a2b5a79eecd059cf072127a1e2d2769d45416c4d20d3` |
| `css/comprehensive-roadmap.css` | `30005ae7433a1d599a430a80408b59c4527164604a88153714ed5c7f1fc3cf6b` |
| `js/comprehensive-roadmap.js` | `9dbc3f3b88f4241a1a76c404b85a31084af16ba9cf51f7e4d00f79f27243c856` |

The postdeployment Coin Card browser smoke also passed on
`https://implicitex.com` for `antoine` and `cc_demo_implicitex`.

## Control-state effect

This publication is a narrow founder-authorized document release. It does not:

- close or supersede WP-02;
- activate WP-03;
- resolve any WP-02 conflict;
- merge the divergent canonical and roadmap histories;
- authorize feature development;
- change the inventory's release order, pricing, custody boundary, gates, or
  exclusions.

Production build-identity reconciliation remains part of WP-02. Until that work
is complete, this record, the production-source branch, and the verified
served-file hashes identify this document release.
