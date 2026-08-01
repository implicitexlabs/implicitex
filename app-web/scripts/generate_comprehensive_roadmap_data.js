'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const inventoryPath = path.join(
  repoRoot,
  'docs',
  'product',
  'comprehensive-implementation-inventory-2026-07-30.md'
);
const outputPath = path.join(
  repoRoot,
  'app-web',
  'frontend',
  'public',
  'data',
  'comprehensive-roadmap.json'
);

const source = fs.readFileSync(inventoryPath, 'utf8');
const evidenceCommit = '6bf16083de42696680b4301094e1c32c0e5d5181';
const githubBase = 'https://github.com/implicitexlabs/implicitex';

function clean(value) {
  return String(value || '').replace(/\n\s+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseFields(block) {
  const fields = {};
  let currentField = null;
  let currentValue = [];

  function commitField() {
    if (!currentField) return;
    const joined = currentValue.reduce((value, part) => {
      if (!value) return part;
      return value.endsWith('-') ? `${value}${part}` : `${value} ${part}`;
    }, '');
    fields[currentField] = clean(joined);
  }

  block.split(/\r?\n/).forEach((line) => {
    const fieldMatch = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
    if (fieldMatch) {
      commitField();
      currentField = clean(fieldMatch[1]);
      currentValue = [fieldMatch[2]];
      return;
    }
    if (currentField && line.trim()) {
      currentValue.push(line.trim());
    }
  });

  commitField();
  return fields;
}

function parseHeadingRecords(pattern) {
  const records = [];
  let match;
  while ((match = pattern.exec(source))) {
    records.push({
      id: match[1],
      name: clean(match[2]),
      fields: parseFields(match[3])
    });
  }
  return records;
}

const parents = parseHeadingRecords(
  /^### (PC-\d+) — ([^\n]+)\n\n([\s\S]*?)(?=\n### PC-\d+|\n## Ordered V1 critical path)/gm
);

const workPackages = parseHeadingRecords(
  /^### (WP-\d+) — ([^\n]+)\n\n([\s\S]*?)(?=\n### WP-\d+|\n---\n)/gm
);

const records = parseHeadingRecords(
  /^### ((?:GOV|FND|OBJ|CC|V1|G0|V2C|V2E|V3W|V3A|RISK|LH|HX|COM)-\d+) — ([^\n]+)\n\n([\s\S]*?)(?=\n### |\n---\n|\n# \d+\.)/gm
);

const exclusions = [];
const exclusionPattern =
  /^\| (EX-\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm;
let exclusionMatch;
while ((exclusionMatch = exclusionPattern.exec(source))) {
  exclusions.push({
    id: clean(exclusionMatch[1]),
    name: clean(exclusionMatch[2]),
    consideredValue: clean(exclusionMatch[3]),
    boundary: clean(exclusionMatch[4]),
    reopenGate: clean(exclusionMatch[5])
  });
}

function splitList(value) {
  return clean(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function expandRange(prefix, from, to) {
  const start = Number(from);
  const end = Number(to);
  const width = Math.max(from.length, to.length);
  const values = [];
  for (let value = start; value <= end; value += 1) {
    values.push(`${prefix}-${String(value).padStart(width, '0')}`);
  }
  return values;
}

function recordIdsFromText(value) {
  const ids = new Set();
  const text = clean(value);
  const rangePattern = /\b([A-Z0-9]+)-(\d+)\s+through\s+\1-(\d+)\b/g;
  let range;
  while ((range = rangePattern.exec(text))) {
    expandRange(range[1], range[2], range[3]).forEach((id) => ids.add(id));
  }
  const idPattern =
    /\b(?:PC|GOV|FND|OBJ|CC|V1|G0|V2C|V2E|V3W|V3A|RISK|LH|HX|COM)-\d+\b/g;
  (text.match(idPattern) || []).forEach((id) => ids.add(id));
  return Array.from(ids);
}

function phaseGroup(parentId) {
  const number = Number(parentId.split('-')[1]);
  if (number <= 2) return 'Command and governance';
  if (number <= 8) return 'Existing foundation';
  if (number <= 16) return 'V1 credential and pilot';
  if (number <= 22) return 'V2 foundation and core';
  if (number <= 24) return 'V2 expansion';
  if (number <= 30) return 'V3 experiments';
  if (number <= 32) return 'Legal and risk controls';
  if (number <= 38) return 'Longer-horizon doors';
  if (number <= 40) return 'Horizontal expansion';
  return 'Commercial evidence';
}

function evidenceReferences(value) {
  const references = [];
  const seen = new Set();
  const locator = clean(value);
  const branchMatches = Array.from(
    locator.matchAll(/\b(?:deployed\s+)?branch `([^`]+)` at `([a-f0-9]{6,40})`/gi)
  ).map((match) => ({ branch: match[1], revision: match[2] }));
  const stateMatches = Array.from(
    locator.matchAll(/`([^`]+)` at `([a-f0-9]{6,40})`/gi)
  ).map((match) => ({ label: match[1], revision: match[2] }));
  const commitMatches = Array.from(
    locator.matchAll(/\bcommit `([a-f0-9]{6,40})`/gi)
  ).map((match) => match[1]);
  const mergeBaseMatches = Array.from(
    locator.matchAll(/\bmerge base `([a-f0-9]{6,40})`/gi)
  ).map((match) => match[1]);
  const revisionStateTokens = new Set([
    ...branchMatches.map((match) => match.branch),
    ...stateMatches.map((match) => match.label)
  ]);

  function addReference(label, href, kind, revision) {
    if (!href || seen.has(href)) return;
    references.push({ label, href, kind, revision });
    seen.add(href);
  }

  branchMatches.forEach(({ branch, revision }) => {
    addReference(
      `${branch} @ ${revision}`,
      `${githubBase}/tree/${revision}`,
      'branch-state',
      revision
    );
  });
  stateMatches.forEach(({ label, revision }) => {
    addReference(
      `${label} @ ${revision}`,
      `${githubBase}/tree/${revision}`,
      'revision-state',
      revision
    );
  });
  commitMatches.forEach((revision) => {
    addReference(
      `commit ${revision}`,
      `${githubBase}/commit/${revision}`,
      'commit',
      revision
    );
  });
  mergeBaseMatches.forEach((revision) => {
    addReference(
      `merge base ${revision}`,
      `${githubBase}/commit/${revision}`,
      'merge-base',
      revision
    );
  });

  const candidateRevisions = Array.from(
    new Set([
      ...branchMatches.map((match) => match.revision),
      ...stateMatches.map((match) => match.revision),
      ...commitMatches
    ])
  );
  const fileRevision =
    candidateRevisions.length === 1 ? candidateRevisions[0] : null;
  if (!fileRevision) return references;

  const tokens = Array.from(locator.matchAll(/`([^`]+)`/g)).map((match) => match[1]);
  tokens
    .filter(
      (token) =>
        token.includes('/') &&
        !token.includes(' ') &&
        !token.startsWith('http://') &&
        !token.startsWith('https://') &&
        !revisionStateTokens.has(token)
    )
    .forEach((token) => {
      addReference(
        `${token} @ ${fileRevision}`,
        `${githubBase}/blob/${fileRevision}/${token}`,
        'file',
        fileRevision
      );
    });

  return references;
}

const parentMap = new Map(parents.map((parent) => [parent.id, parent]));
const recordMap = new Map(records.map((record) => [record.id, record]));

parents.forEach((parent) => {
  parent.childIds = splitList(parent.fields['Child record IDs']);
  parent.phaseGroup = phaseGroup(parent.id);
  parent.childIds.forEach((id) => {
    if (!recordMap.has(id)) {
      throw new Error(`${parent.id} references missing child ${id}`);
    }
  });
});

records.forEach((record) => {
  record.parentId = clean(record.fields['Parent capability']).split(' — ')[0];
  record.phaseGroup = parentMap.has(record.parentId)
    ? parentMap.get(record.parentId).phaseGroup
    : 'Unassigned';
  record.tags = clean(record.fields['Strategic-role tags'])
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean);
  record.evidenceReferences = evidenceReferences(
    record.fields['Source / evidence locator']
  );
});

workPackages.forEach((workPackage) => {
  workPackage.parentIds = recordIdsFromText(
    clean(workPackage.fields['Included parent capabilities'])
  ).filter((id) => id.startsWith('PC-'));
  workPackage.recordIds = recordIdsFromText(
    clean(workPackage.fields['Included detailed records'])
  );
});

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

const requiredRecordFields = [
  'Record class',
  'Parent capability',
  'Area / phase / side / type',
  'Implementation maturity',
  'Work authorization',
  'Purpose',
  'Parent user value',
  'Parent strategic role',
  'Strategic-role tags',
  'Current implementation',
  'Remaining work',
  'Dependencies',
  'Entry gate',
  'Completion evidence',
  'Commercial hypothesis',
  'Boundary',
  'Stop rule',
  'Source / evidence locator',
  'Next action'
];

const missing = [];
records.forEach((record) => {
  requiredRecordFields.forEach((field) => {
    if (!record.fields[field]) missing.push(`${record.id}:${field}`);
  });
});

if (records.length !== 259) {
  throw new Error(`Expected 259 full records; found ${records.length}`);
}
if (parents.length !== 42) {
  throw new Error(`Expected 42 parent capabilities; found ${parents.length}`);
}
if (workPackages.length !== 8) {
  throw new Error(`Expected 8 work packages; found ${workPackages.length}`);
}
if (exclusions.length !== 30) {
  throw new Error(`Expected 30 exclusions; found ${exclusions.length}`);
}
if (missing.length) {
  throw new Error(`Missing normalized fields: ${missing.join(', ')}`);
}
if (
  workPackages.filter((workPackage) => workPackage.fields.State === 'Active change')
    .length !== 1
) {
  throw new Error('Exactly one work package must be active');
}

const payload = {
  meta: {
    title: 'ImplicitEx Comprehensive Roadmap',
    source: path.relative(repoRoot, inventoryPath),
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    sourceState: 'Founder-approved WP-01 snapshot (not live authorization)',
    projectionBaseCommit: evidenceCommit,
    roadmapCommit: 'ec78178',
    generatedFromInventoryRevision: '0.2',
    totals: {
      roadmapRecords: records.length + exclusions.length,
      fullRecords: records.length,
      exclusions: exclusions.length,
      parents: parents.length,
      workPackages: workPackages.length
    },
    counts: {
      recordClass: countBy(records, (record) => record.fields['Record class']),
      maturity: countBy(records, (record) => record.fields['Implementation maturity']),
      authorization: countBy(records, (record) => record.fields['Work authorization']),
      phaseGroup: countBy(records, (record) => record.phaseGroup)
    }
  },
  workPackages,
  parents,
  records,
  exclusions
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

process.stdout.write(
  `Generated ${path.relative(repoRoot, outputPath)} from ${records.length} full records, ` +
    `${parents.length} parents, ${workPackages.length} work packages, and ` +
    `${exclusions.length} exclusions.\n`
);
