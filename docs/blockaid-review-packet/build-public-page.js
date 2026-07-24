#!/usr/bin/env node
/**
 * build-public-page.js
 *
 * Generates app-web/frontend/public/architecture-and-security.html from the
 * canonical review packet and copies its transaction-flow evidence assets.
 * The canonical source is authoritative; the public output is disposable and
 * self-healing.
 *
 * Usage:
 *   node docs/blockaid-review-packet/build-public-page.js
 *
 * Pre-deploy stale check (wired into firebase.json "main" predeploy):
 *   node docs/blockaid-review-packet/build-public-page.js
 *   git diff --exit-code app-web/frontend/public/architecture-and-security.html
 *
 * Enforcement model:
 *   - The build step overwrites the public page from the canonical source.
 *   - Direct edits to the public page are silently replaced if not committed,
 *     or cause deployment to fail if committed without matching canonical changes.
 *   - Canonical changes not yet rebuilt also cause a diff and block deployment.
 *   - The canonical source wins under every ordinary workflow.
 *
 * Requirements:
 *   - Node.js (no external dependencies).
 *   - The stale check requires Git and must run from a working tree with
 *     repository metadata (.git). Not safe in stripped CI containers or
 *     deployment environments that check out only the build artifact.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────

const ROOT      = path.resolve(__dirname, '../..');
const CANONICAL = path.join(__dirname, 'ImplicitEx_Architecture_and_Security_Overview_v1.1.html');
const OUTPUT    = path.join(ROOT, 'app-web/frontend/public/architecture-and-security.html');
const EVIDENCE_SOURCE = path.join(__dirname, 'assets/transaction-flow');
const EVIDENCE_OUTPUT = path.join(ROOT, 'app-web/frontend/public/assets/transaction-flow');

// ── Read canonical ───────────────────────────────────────────────────────────

const canonical = fs.readFileSync(CANONICAL, 'utf8');

// Extract <style> block (everything between the first <style> and </style>)
const styleMatch = canonical.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) throw new Error('build-public-page: <style> block not found in canonical');
const canonicalStyle = styleMatch[1].trimEnd();

// Extract <body> content
const bodyMatch = canonical.match(/<body>\s*([\s\S]*?)\s*<\/body>/);
if (!bodyMatch) throw new Error('build-public-page: <body> not found in canonical');
let body = bodyMatch[1];

// ── Transformations ──────────────────────────────────────────────────────────

// Keep internal working notes in the canonical packet without publishing them.
// The public artifact must never retain an internal-only marker.
body = body.replace(
  /\s*<section class="internal-only">[\s\S]*?<\/section>\s*/g,
  '\n'
);
if (body.includes('internal-only')) {
  throw new Error('build-public-page: internal-only content was not fully removed');
}

// Make bare Polygonscan URLs inside <pre> blocks into clickable links.
// Leaves the display text unchanged; wraps it in an <a>.
body = body.replace(/<pre>([\s\S]*?)<\/pre>/g, (_match, preContent) => {
  const linked = preContent.replace(
    /(https:\/\/polygonscan\.com\/[^\s<"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return `<pre>${linked}</pre>`;
});

// ── Public-page CSS additions ────────────────────────────────────────────────

const publicCSS = `
    /* ─── Document action bar (public page only) ─────────────────────────── */
    .doc-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0 20px;
      margin-bottom: 24px;
      border-bottom: 1px solid #ddd;
      font-size: 9pt;
    }

    .doc-actions-home {
      color: #555;
      text-decoration: none;
      letter-spacing: 0.03em;
    }

    .doc-actions-home:hover { color: #000; }

    .doc-actions-label {
      color: #888;
      text-align: center;
    }

    .print-btn {
      font-family: inherit;
      font-size: 9pt;
      background: #000;
      color: #fff;
      border: none;
      padding: 6px 14px;
      cursor: pointer;
      letter-spacing: 0.02em;
    }

    .print-btn:hover { background: #333; }

    .print-btn:focus-visible {
      outline: 2px solid #000;
      outline-offset: 2px;
    }

    /* Action bar reduces needed top padding */
    body { padding-top: 24px; }

    /* ─── Clickable links inside <pre> blocks ─────────────────────────────── */
    pre a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    pre a:hover { opacity: 0.7; }

    /* Mobile: keep long addresses from overflowing */
    @media (max-width: 640px) {
      body { padding: 16px 20px 48px; }
      .doc-actions { flex-wrap: wrap; gap: 8px; }
      .doc-actions-label { order: 3; width: 100%; text-align: left; }
      .address, code, pre { overflow-wrap: anywhere; word-break: break-all; }
    }

    /* ─── Enhanced print ──────────────────────────────────────────────────── */
    @media print {
      .doc-actions { display: none; }

      body { max-width: 100%; padding: 0; font-size: 10pt; }

      /* Override base print block — consolidated rules here */
      h2 { page-break-before: auto; break-before: auto; }
      h2, h3 { page-break-after: avoid; break-after: avoid; }

      table { page-break-inside: auto; break-inside: auto; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; break-inside: avoid; }
      .callout, figure, pre { page-break-inside: avoid; break-inside: avoid; }

      #s7 { page-break-before: always; break-before: page; }
      #s7 h3,
      #s7 h3 + p { page-break-after: avoid; break-after: avoid; }

      a { color: #000; }
      pre a { text-decoration: none; }

      code, .address {
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      pre {
        white-space: pre-wrap;
        overflow: visible;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      @page {
        size: Letter;
        margin: 0.65in;
      }
    }
`;

// ── Assemble public page ─────────────────────────────────────────────────────

const output = `<!DOCTYPE html>
<!-- Generated by docs/blockaid-review-packet/build-public-page.js -->
<!-- DO NOT EDIT DIRECTLY. Edit the canonical and re-run the build script. -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ImplicitEx — Architecture and Security Overview</title>
  <meta name="description" content="Technical documentation for the ImplicitEx non-custodial USDC transfer protocol on Polygon. Covers smart contract behavior, fee structure, trust boundaries, and the full transaction lifecycle.">
  <link rel="canonical" href="https://implicitex.com/architecture-and-security.html">

  <!-- Open Graph -->
  <meta property="og:url" content="https://implicitex.com/architecture-and-security.html">
  <meta property="og:type" content="article">
  <meta property="og:title" content="ImplicitEx — Architecture and Security Overview">
  <meta property="og:description" content="Technical documentation for the ImplicitEx non-custodial USDC transfer protocol on Polygon. Smart contract behavior, fee structure, trust boundaries, and transaction lifecycle.">
  <meta property="og:image" content="https://implicitex.com/components/images/og-primary.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="628">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@implicitex">
  <meta name="twitter:title" content="ImplicitEx — Architecture and Security Overview">
  <meta name="twitter:description" content="Technical documentation for the ImplicitEx non-custodial USDC transfer protocol on Polygon. Smart contract behavior, fee structure, trust boundaries, and transaction lifecycle.">
  <meta name="twitter:image" content="https://implicitex.com/components/images/og-primary.png">

  <!-- Document provenance -->
  <meta name="implicitex-document-source"
        content="docs/blockaid-review-packet/ImplicitEx_Architecture_and_Security_Overview_v1.1.html">

  <style>${canonicalStyle}${publicCSS}  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- ACTION BAR (hidden when printing)                                        -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<div class="doc-actions">
  <a class="doc-actions-home" href="https://implicitex.com">&#8592; ImplicitEx</a>
  <span class="doc-actions-label">Architecture and Security Overview</span>
  <button class="print-btn" type="button" onclick="window.print()"
          aria-label="Print or save this document as PDF">Print / Save as PDF</button>
</div>

${body}
</body>
</html>`;

fs.writeFileSync(OUTPUT, output, 'utf8');

fs.mkdirSync(EVIDENCE_OUTPUT, { recursive: true });
for (const filename of fs.readdirSync(EVIDENCE_SOURCE)) {
  if (!/\.(?:json|png)$/i.test(filename)) continue;
  fs.copyFileSync(
    path.join(EVIDENCE_SOURCE, filename),
    path.join(EVIDENCE_OUTPUT, filename)
  );
}

const rel = path.relative(process.cwd(), OUTPUT);
console.log(`built: ${rel}`);
