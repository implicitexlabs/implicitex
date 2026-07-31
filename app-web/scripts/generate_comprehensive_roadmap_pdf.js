'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '..', 'frontend', 'public');
const dataPath = path.join(publicRoot, 'data', 'comprehensive-roadmap.json');
const outputPath = path.join(
  publicRoot,
  'downloads',
  'implicitex-comprehensive-roadmap-2026-07-30.pdf'
);

const operationalOverlay = {
  observed: 'July 30, 2026',
  wp01: 'Closed',
  wp02: 'Active and paused before payment-critical conflict resolution',
  wp03: 'Inactive',
  publication: 'Stands; no rollback indicated',
  productionCommit: '937c7c7400c7fa2b2c5028c9a8b4a0ba2a3d6278',
  startingEvidence: 'eb73070',
  freshnessGate: '6952cf6',
  publicationEvidence: 'b2404ce',
  repositoryCheckpoint: '9a8b7a9'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderFields(fields, options = {}) {
  const relabel = options.relabel || {};
  return `<dl class="field-list">${Object.entries(fields)
    .map(
      ([label, value]) => `<div class="field-row">
        <dt>${escapeHtml(relabel[label] || label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>`
    )
    .join('')}</dl>`;
}

function renderCountTable(title, counts) {
  return `<section class="count-card">
    <h3>${escapeHtml(title)}</h3>
    <dl>${Object.entries(counts)
      .map(
        ([label, count]) => `<div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(count)}</dd>
        </div>`
      )
      .join('')}</dl>
  </section>`;
}

function renderWorkPackages(data) {
  return data.workPackages
    .map(
      (workPackage) => `<article class="entry work-package" id="${escapeHtml(
        workPackage.id
      )}">
        <header class="entry-header">
          <div>
            <p class="entry-id">${escapeHtml(workPackage.id)}</p>
            <h3>${escapeHtml(workPackage.name)}</h3>
          </div>
          <span class="snapshot-badge">${escapeHtml(
            workPackage.fields.State
          )} · WP-01 snapshot</span>
        </header>
        ${renderFields(workPackage.fields, {
          relabel: { State: 'State at WP-01 approval' }
        })}
      </article>`
    )
    .join('');
}

function renderParents(data) {
  const grouped = new Map();
  data.parents.forEach((parent) => {
    const group = parent.phaseGroup || 'Other';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(parent);
  });

  return Array.from(grouped.entries())
    .map(
      ([group, parents]) => `<section class="entry-group">
        <header class="group-heading">
          <p class="section-eyebrow">Capability group</p>
          <h3>${escapeHtml(group)}</h3>
          <p>${parents.length} parent ${parents.length === 1 ? 'capability' : 'capabilities'}</p>
        </header>
        ${parents
          .map(
            (parent) => `<article class="entry parent-entry" id="${escapeHtml(
              parent.id
            )}">
              <header class="entry-header">
                <div>
                  <p class="entry-id">${escapeHtml(parent.id)}</p>
                  <h4>${escapeHtml(parent.name)}</h4>
                </div>
                <span class="phase-label">${escapeHtml(parent.phaseGroup)}</span>
              </header>
              ${renderFields(parent.fields)}
            </article>`
          )
          .join('')}
      </section>`
    )
    .join('');
}

function renderRecords(data) {
  const grouped = new Map();
  data.records.forEach((record) => {
    const group = record.phaseGroup || 'Other';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(record);
  });

  return Array.from(grouped.entries())
    .map(
      ([group, records]) => `<section class="entry-group">
        <header class="group-heading record-group-heading">
          <p class="section-eyebrow">Implementation group</p>
          <h3>${escapeHtml(group)}</h3>
          <p>${records.length} detailed ${records.length === 1 ? 'record' : 'records'}</p>
        </header>
        ${records
          .map(
            (record) => `<article class="entry record-entry" id="${escapeHtml(
              record.id
            )}">
              <header class="entry-header">
                <div>
                  <p class="entry-id">${escapeHtml(record.id)}</p>
                  <h4>${escapeHtml(record.name)}</h4>
                </div>
                <div class="badge-stack">
                  <span>${escapeHtml(record.fields['Record class'])}</span>
                  <span>${escapeHtml(record.fields['Implementation maturity'])}</span>
                  <span>${escapeHtml(record.fields['Work authorization'])}</span>
                </div>
              </header>
              <p class="parent-line">${escapeHtml(record.fields['Parent capability'])}</p>
              ${renderFields(record.fields)}
              ${
                record.evidenceReferences.length
                  ? `<div class="evidence-links">
                      <h5>Revision-qualified evidence links</h5>
                      <ul>${record.evidenceReferences
                        .map(
                          (reference) =>
                            `<li><a href="${escapeHtml(reference.href)}">${escapeHtml(
                              reference.label
                            )}</a></li>`
                        )
                        .join('')}</ul>
                    </div>`
                  : ''
              }
            </article>`
          )
          .join('')}
      </section>`
    )
    .join('');
}

function renderExclusions(data) {
  return data.exclusions
    .map(
      (exclusion) => `<article class="entry exclusion-entry" id="${escapeHtml(
        exclusion.id
      )}">
        <header class="entry-header">
          <div>
            <p class="entry-id">${escapeHtml(exclusion.id)}</p>
            <h3>${escapeHtml(exclusion.name)}</h3>
          </div>
          <span class="excluded-badge">Excluded</span>
        </header>
        <dl class="field-list">
          <div class="field-row">
            <dt>Considered value</dt>
            <dd>${escapeHtml(exclusion.consideredValue)}</dd>
          </div>
          <div class="field-row">
            <dt>Boundary</dt>
            <dd>${escapeHtml(exclusion.boundary)}</dd>
          </div>
          <div class="field-row">
            <dt>Reopen only if</dt>
            <dd>${escapeHtml(exclusion.reopenGate)}</dd>
          </div>
        </dl>
      </article>`
    )
    .join('');
}

function createDocument(data) {
  const totals = data.meta.totals;
  const sourceState = data.meta.sourceState;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ImplicitEx Comprehensive Roadmap — July 30, 2026</title>
  <style>
    @page {
      size: Letter;
      margin: 0.58in 0.48in 0.68in;
    }

    :root {
      --ink: #18201f;
      --copy: #3f4a48;
      --quiet: #687472;
      --rule: #cbd2d0;
      --paper: #f2f4f3;
      --green: #185f57;
      --green-soft: #e3efec;
      --amber: #9b6700;
      --amber-soft: #fff2ce;
      --red: #8a2e2e;
      --red-soft: #f8e3e3;
    }

    * {
      box-sizing: border-box;
    }

    html {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    body {
      margin: 0;
      color: var(--ink);
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8.4pt;
      line-height: 1.38;
    }

    a {
      color: var(--green);
      text-decoration: none;
      overflow-wrap: anywhere;
    }

    h1, h2, h3, h4, h5, p, dl, dd, dt, ul {
      margin-top: 0;
    }

    h1, h2, h3, h4 {
      line-height: 1.08;
    }

    h1 {
      max-width: 6.7in;
      margin-bottom: 0.25in;
      font-size: 38pt;
      letter-spacing: -0.035em;
      text-transform: uppercase;
    }

    h2 {
      margin-bottom: 0.14in;
      font-size: 22pt;
      letter-spacing: -0.02em;
    }

    h3 {
      margin-bottom: 0.08in;
      font-size: 13pt;
    }

    h4 {
      margin-bottom: 0.05in;
      font-size: 11pt;
    }

    h5 {
      margin-bottom: 0.05in;
      font-size: 8pt;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .cover {
      min-height: 8.45in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      break-after: page;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.12in;
      font-size: 15pt;
      font-weight: 800;
      letter-spacing: 0.24em;
    }

    .brand-mark {
      width: 0.32in;
      height: 0.32in;
      display: grid;
      place-items: center;
      color: #fff;
      background: var(--ink);
      font-size: 13pt;
      letter-spacing: 0;
    }

    .cover-kicker,
    .section-eyebrow,
    .entry-id {
      margin-bottom: 0.07in;
      color: var(--amber);
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .cover-lead {
      max-width: 6.2in;
      margin-bottom: 0.34in;
      color: var(--copy);
      font-size: 13pt;
      line-height: 1.5;
    }

    .snapshot-seal {
      display: inline-block;
      padding: 0.09in 0.13in;
      color: var(--green);
      background: var(--green-soft);
      border: 1px solid var(--green);
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .control-panel {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 0.16in;
      margin-top: 0.32in;
    }

    .control-card,
    .source-card {
      padding: 0.18in;
      border: 1px solid var(--rule);
    }

    .control-card {
      border-top: 3px solid var(--green);
    }

    .control-card strong {
      display: block;
      margin: 0.03in 0 0.11in;
      font-size: 15pt;
    }

    .control-card dl,
    .source-card dl,
    .count-card dl {
      margin-bottom: 0;
    }

    .control-card dl div {
      grid-template-columns: 0.62in minmax(0, 1fr);
    }

    .control-card dt {
      white-space: nowrap;
    }

    .control-card dl div,
    .source-card dl div,
    .count-card dl div {
      display: grid;
      gap: 0.12in;
      padding: 0.045in 0;
      border-top: 1px solid var(--rule);
    }

    .source-card dl div,
    .count-card dl div {
      grid-template-columns: 1fr auto;
    }

    .control-card dt,
    .source-card dt,
    .count-card dt {
      color: var(--quiet);
    }

    .control-card dd,
    .source-card dd,
    .count-card dd {
      margin-bottom: 0;
      text-align: right;
      font-weight: 700;
    }

    .cover-footer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.2in;
      padding-top: 0.15in;
      color: var(--quiet);
      border-top: 1px solid var(--rule);
      font-size: 7.5pt;
    }

    .section-cover {
      min-height: 7.95in;
      display: flex;
      flex-direction: column;
      justify-content: center;
      break-before: page;
      break-after: page;
    }

    .section-number {
      margin-bottom: 0.15in;
      color: var(--green);
      font-size: 42pt;
      font-weight: 800;
      line-height: 1;
    }

    .section-cover p {
      max-width: 5.8in;
      color: var(--copy);
      font-size: 12pt;
      line-height: 1.55;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.12in;
      margin-top: 0.25in;
    }

    .stat {
      padding: 0.13in;
      background: var(--paper);
      border: 1px solid var(--rule);
    }

    .stat strong {
      display: block;
      font-size: 19pt;
    }

    .stat span {
      color: var(--quiet);
      font-size: 7pt;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .count-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.15in;
      margin-top: 0.24in;
    }

    .count-card {
      padding: 0.15in;
      border: 1px solid var(--rule);
      break-inside: avoid;
    }

    .count-card h3 {
      color: var(--green);
      font-size: 10pt;
    }

    .count-card dl div {
      font-size: 7.5pt;
    }

    .group-heading {
      margin: 0 0 0.15in;
      padding: 0.14in 0.16in;
      background: var(--ink);
      color: #fff;
      break-before: page;
      break-after: avoid;
    }

    .group-heading .section-eyebrow {
      color: #f0c76b;
    }

    .group-heading p:last-child {
      margin-bottom: 0;
      color: #d6dcda;
    }

    .entry {
      margin-bottom: 0.14in;
      border: 1px solid var(--rule);
      break-inside: avoid-page;
    }

    .entry-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.18in;
      padding: 0.12in 0.14in;
      background: var(--paper);
      border-bottom: 1px solid var(--rule);
    }

    .entry-header h3,
    .entry-header h4,
    .entry-header p {
      margin-bottom: 0;
    }

    .entry-id {
      font-family: "Courier New", monospace;
      font-size: 7.5pt;
    }

    .snapshot-badge,
    .excluded-badge,
    .phase-label,
    .badge-stack span {
      display: inline-block;
      padding: 0.035in 0.06in;
      color: var(--green);
      background: var(--green-soft);
      border: 1px solid #a9c7c1;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.035em;
      text-transform: uppercase;
    }

    .excluded-badge {
      color: var(--red);
      background: var(--red-soft);
      border-color: #deb3b3;
    }

    .phase-label {
      max-width: 2in;
      color: var(--copy);
      background: #fff;
      border-color: var(--rule);
      text-align: right;
    }

    .badge-stack {
      max-width: 2.45in;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.04in;
    }

    .badge-stack span:nth-child(2) {
      color: var(--copy);
      background: #fff;
      border-color: var(--rule);
    }

    .badge-stack span:nth-child(3) {
      color: #684f14;
      background: var(--amber-soft);
      border-color: #dfc47d;
    }

    .parent-line {
      margin: 0;
      padding: 0.08in 0.14in;
      color: var(--green);
      border-bottom: 1px solid var(--rule);
      font-size: 7.5pt;
      font-weight: 700;
    }

    .field-list {
      margin-bottom: 0;
    }

    .field-row {
      display: grid;
      grid-template-columns: 1.42in minmax(0, 1fr);
      border-top: 1px solid #e0e4e3;
      break-inside: avoid;
    }

    .field-row:first-child {
      border-top: 0;
    }

    .field-row dt,
    .field-row dd {
      margin: 0;
      padding: 0.065in 0.11in;
      overflow-wrap: anywhere;
    }

    .field-row dt {
      color: var(--quiet);
      background: #fafbfb;
      border-right: 1px solid #e0e4e3;
      font-size: 6.9pt;
      font-weight: 700;
      letter-spacing: 0.025em;
      text-transform: uppercase;
    }

    .field-row dd {
      color: var(--copy);
    }

    .evidence-links {
      padding: 0.1in 0.14in 0.12in;
      border-top: 1px solid var(--rule);
    }

    .evidence-links ul {
      margin: 0;
      padding-left: 0.17in;
      color: var(--green);
      font-size: 7pt;
    }

    .evidence-links li {
      margin-bottom: 0.025in;
    }

    .exclusion-entry {
      break-inside: avoid;
    }

    .reading-note {
      margin-top: 0.22in;
      padding: 0.16in 0.18in;
      background: var(--amber-soft);
      border-left: 3px solid var(--amber);
    }

    .reading-note strong {
      display: block;
      margin-bottom: 0.04in;
    }

    .reading-note p:last-child {
      margin-bottom: 0;
    }

    .source-fingerprint {
      font-family: "Courier New", monospace;
      font-size: 6.5pt;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="brand"><span class="brand-mark">X</span>IMPLICITEX</div>
    <div>
      <p class="cover-kicker">Product command system · August 2026–July 2027</p>
      <h1>Comprehensive Roadmap</h1>
      <p class="cover-lead">
        The complete founder-approved roadmap inventory: critical path, 42 parent
        capabilities, 259 detailed implementation records, and 30 explicit exclusions.
      </p>
      <span class="snapshot-seal">${escapeHtml(sourceState)}</span>
      <div class="control-panel">
        <section class="control-card">
          <p class="section-eyebrow">Operational overlay observed ${escapeHtml(
            operationalOverlay.observed
          )}</p>
          <strong>WP-02 · Active / paused</strong>
          <dl>
            <div><dt>WP-01</dt><dd>${escapeHtml(operationalOverlay.wp01)}</dd></div>
            <div><dt>WP-02</dt><dd>${escapeHtml(operationalOverlay.wp02)}</dd></div>
            <div><dt>WP-03</dt><dd>${escapeHtml(operationalOverlay.wp03)}</dd></div>
            <div><dt>Publication</dt><dd>${escapeHtml(
              operationalOverlay.publication
            )}</dd></div>
          </dl>
        </section>
        <section class="source-card">
          <p class="section-eyebrow">Evidence anchors</p>
          <dl>
            <div><dt>Starting evidence</dt><dd>${escapeHtml(
              operationalOverlay.startingEvidence
            )}</dd></div>
            <div><dt>Freshness gate</dt><dd>${escapeHtml(
              operationalOverlay.freshnessGate
            )}</dd></div>
            <div><dt>Publication</dt><dd>${escapeHtml(
              operationalOverlay.publicationEvidence
            )}</dd></div>
            <div><dt>Checkpoint</dt><dd>${escapeHtml(
              operationalOverlay.repositoryCheckpoint
            )}</dd></div>
          </dl>
        </section>
      </div>
      <div class="reading-note">
        <strong>Snapshot discipline</strong>
        <p>
          Work-package and record state labels in the register are frozen at WP-01
          approval. They are not live authorization. The dated operational overlay
          above records the later control state without rewriting the approved inventory.
        </p>
      </div>
    </div>
    <footer class="cover-footer">
      <span>Inventory revision ${escapeHtml(
        data.meta.generatedFromInventoryRevision
      )} · July 30, 2026</span>
      <span>Production source ${escapeHtml(
        operationalOverlay.productionCommit.slice(0, 7)
      )}</span>
    </footer>
  </section>

  <section class="section-cover">
    <p class="section-eyebrow">Inventory orientation</p>
    <h2>One source, two axes, one active package</h2>
    <p>
      Maturity describes what exists. Authorization describes whether work may
      proceed. Neither substitutes for evidence, and this PDF does not become authority.
    </p>
    <div class="stats-grid">
      <div class="stat"><strong>${totals.workPackages}</strong><span>work packages</span></div>
      <div class="stat"><strong>${totals.parents}</strong><span>parent capabilities</span></div>
      <div class="stat"><strong>${totals.fullRecords}</strong><span>detailed records</span></div>
      <div class="stat"><strong>${totals.roadmapRecords}</strong><span>total roadmap records</span></div>
      <div class="stat"><strong>${totals.exclusions}</strong><span>explicit exclusions</span></div>
      <div class="stat"><strong>${
        data.meta.counts.maturity['Customer-validated'] || 0
      }</strong><span>customer-validated</span></div>
    </div>
    <div class="count-grid">
      ${renderCountTable('Records by class', data.meta.counts.recordClass)}
      ${renderCountTable('Implementation maturity', data.meta.counts.maturity)}
      ${renderCountTable('Work authorization', data.meta.counts.authorization)}
      ${renderCountTable('Phase or implementation group', data.meta.counts.phaseGroup)}
    </div>
    <div class="reading-note">
      <strong>Source fingerprint</strong>
      <p class="source-fingerprint">${escapeHtml(data.meta.source)} · SHA-256 ${escapeHtml(
        data.meta.sourceSha256
      )}</p>
    </div>
  </section>

  <section class="section-cover">
    <div class="section-number">01</div>
    <p class="section-eyebrow">Closed-loop execution</p>
    <h2>Eight-package V1 critical path</h2>
    <p>
      Exactly one package may control work at a time. The state labels in this
      section are the approved WP-01 snapshot; use the dated overlay for the
      post-publication control state.
    </p>
  </section>
  ${renderWorkPackages(data)}

  <section class="section-cover">
    <div class="section-number">02</div>
    <p class="section-eyebrow">Founder-facing zoom layer</p>
    <h2>42 parent capabilities</h2>
    <p>
      Each parent explains why its detailed records exist, the value they create,
      the strategic role they play, and the evidence required to move.
    </p>
  </section>
  ${renderParents(data)}

  <section class="section-cover">
    <div class="section-number">03</div>
    <p class="section-eyebrow">Authoritative implementation detail</p>
    <h2>259 detailed roadmap records</h2>
    <p>
      The complete register of components, controls, processes, decisions,
      commercial experiments, and expansion doors. Every record preserves its
      maturity, authorization, dependencies, boundaries, stop rule, evidence
      locator, and next action.
    </p>
  </section>
  ${renderRecords(data)}

  <section class="section-cover">
    <div class="section-number">04</div>
    <p class="section-eyebrow">Standing “no” register</p>
    <h2>30 explicit exclusions</h2>
    <p>
      These rows are not missing implementations. They protect the focused,
      wallet-neutral, self-custodial small-operator thesis and preserve founder capacity.
    </p>
  </section>
  ${renderExclusions(data)}
</body>
</html>`;
}

async function main() {
  assert(fs.existsSync(dataPath), 'Generated comprehensive-roadmap data is missing.');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.strictEqual(data.meta.totals.roadmapRecords, 289);
  assert.strictEqual(data.meta.totals.fullRecords, 259);
  assert.strictEqual(data.meta.totals.parents, 42);
  assert.strictEqual(data.meta.totals.workPackages, 8);
  assert.strictEqual(data.meta.totals.exclusions, 30);
  assert.strictEqual(data.workPackages.length, 8);
  assert.strictEqual(data.parents.length, 42);
  assert.strictEqual(data.records.length, 259);
  assert.strictEqual(data.exclusions.length, 30);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.setContent(createDocument(data), { waitUntil: 'load' });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;padding:0 0.48in;color:#687472;font-family:Arial,sans-serif;font-size:7px;">
        IMPLICITEX · COMPREHENSIVE ROADMAP · JULY 30, 2026
      </div>`,
      footerTemplate: `<div style="width:100%;padding:0 0.48in;color:#687472;font-family:Arial,sans-serif;font-size:7px;display:flex;justify-content:space-between;">
        <span>Founder-approved WP-01 inventory snapshot</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
      margin: {
        top: '0.58in',
        right: '0.48in',
        bottom: '0.68in',
        left: '0.48in'
      },
      outline: true,
      tagged: true,
      timeout: 120000
    });
  } finally {
    await browser.close();
  }

  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
