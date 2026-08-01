#!/usr/bin/env node
/* provision-coin-card.js — create a new Coin Card registry entry
 *
 * Creates a registry JSON for a new Coin Card and updates the registry index.
 * This is the MVP provisioning tool — run once per new cardholder.
 *
 * Usage:
 *   node scripts/provision-coin-card.js \
 *     --id joesmith \
 *     --name "Joe Smith" \
 *     --wallet 0x1234567890abcdef1234567890abcdef12345678 \
 *     [--domain joesmith.com] \
 *     [--expires 2027-07-20] \
 *     [--dry-run]
 *
 * Required flags:
 *   --id       Card slug (3–80 chars, letters/digits/underscore/hyphen)
 *   --name     Display name shown to senders (quoted if it contains spaces)
 *   --wallet   EVM wallet address (0x-prefixed, 40 hex chars)
 *
 * Optional flags:
 *   --domain   Owner's domain (informational, defaults to "implicitex.com")
 *   --expires  Registration expiry date ISO-8601 (defaults to +1 year from today)
 *   --dry-run  Print what would be written without touching any files
 *
 * Output:
 *   Creates:  frontend/public/registry/coincards/{cardId}.json
 *   Updates:  frontend/public/registry/coincards/index.json
 *   Prints:   Card URL on implicitex.com
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

/* ── Paths ──────────────────────────────────────────────────────────────── */

const ROOT         = path.resolve(__dirname, '..');
const REGISTRY_DIR = path.join(ROOT, 'frontend/public/registry/coincards');
const INDEX_PATH   = path.join(REGISTRY_DIR, 'index.json');

/* ── Argument parsing ───────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') { args.dryRun = true; continue; }
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      args[key] = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const CARD_ID_RE  = /^[a-zA-Z0-9_-]{3,80}$/;
const ADDRESS_RE  = /^0x[0-9a-fA-F]{40}$/;
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;
const DRY_RUN     = !!args.dryRun;

/* ── Validation ─────────────────────────────────────────────────────────── */

const errors = [];

const cardId = (args.id || '').trim();
if (!cardId) {
  errors.push('--id is required');
} else if (!CARD_ID_RE.test(cardId)) {
  errors.push('--id must be 3–80 chars: letters, digits, underscores, hyphens');
}

const displayName = (args.name || '').trim();
if (!displayName) {
  errors.push('--name is required');
}

const wallet = (args.wallet || '').trim();
if (!wallet) {
  errors.push('--wallet is required');
} else if (!ADDRESS_RE.test(wallet)) {
  errors.push('--wallet must be a 0x-prefixed 40-hex-char EVM address');
}

const ownerDomain = (args.domain || 'implicitex.com').trim();

let expiresAt;
if (args.expires) {
  if (!DATE_RE.test(args.expires)) {
    errors.push('--expires must be YYYY-MM-DD');
  } else {
    expiresAt = new Date(args.expires + 'T00:00:00.000Z').toISOString();
  }
} else {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  expiresAt = d.toISOString().split('T')[0] + 'T00:00:00.000Z';
}

if (errors.length > 0) {
  console.error('\nProvision error:\n');
  errors.forEach(e => console.error('  ✗', e));
  console.error('\nUsage:\n');
  console.error('  node scripts/provision-coin-card.js \\');
  console.error('    --id <cardId> \\');
  console.error('    --name "Display Name" \\');
  console.error('    --wallet 0x... \\');
  console.error('    [--domain owner.com] \\');
  console.error('    [--expires YYYY-MM-DD] \\');
  console.error('    [--dry-run]\n');
  process.exit(1);
}

/* ── Conflict check ─────────────────────────────────────────────────────── */

const recordPath = path.join(REGISTRY_DIR, cardId + '.json');

if (!DRY_RUN && fs.existsSync(recordPath)) {
  console.error('\n✗ A Coin Card with ID "' + cardId + '" already exists.');
  console.error('  Path:', recordPath);
  console.error('  Use --dry-run to preview without writing.\n');
  process.exit(1);
}

/* ── Build registry record ──────────────────────────────────────────────── */

const now = new Date().toISOString();

// Short credential string: "CC" + uppercase initials from displayName + last 4 of wallet
function buildCredential(name, address) {
  const initials = name
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 4);
  const tail = address.slice(-4).toUpperCase();
  return 'CC ' + initials + '-' + tail;
}

const record = {
  schema:             'implicitex.coincard.v1',
  cardId:             cardId,
  status:             'active',
  owner: {
    name:             'ImplicitEx',
    domain:           'implicitex.com',
  },
  displayName:        displayName,
  displayCredential:  buildCredential(displayName, wallet),
  recipient:          wallet,
  chainId:            137,
  chainName:          'Polygon',
  token:              'USDC',
  tokenDecimals:      6,
  amountMode:         'sender_input',
  feeBps:             100,
  allowedParentOrigins: ['*'],
  sourceDomain:       ownerDomain !== 'implicitex.com' ? ownerDomain : 'implicitex.com',
  /* activatedAt — when the card became publicly accessible (status: live).
   * In the manual MVP, provisioning and activation are the same event.
   * When activation is automated, set activatedAt separately from createdAt. */
  activatedAt:            now,
  registrationExpiresAt:  expiresAt,   /* activatedAt + 1 year by default */
  createdAt:              now,
  updatedAt:              now,
  revokedAt:              null,
};

const recordJson = JSON.stringify(record, null, 2) + '\n';

/* ── Update registry index ──────────────────────────────────────────────── */

let index;
try {
  index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
} catch (e) {
  console.error('✗ Could not read registry index:', INDEX_PATH);
  console.error(e.message);
  process.exit(1);
}

// Remove any existing entry with the same cardId (shouldn't happen, but be safe)
index.cards = (index.cards || []).filter(c => c.cardId !== cardId);

index.cards.push({
  cardId:      cardId,
  status:      'active',
  displayName: displayName,
  href:        '/registry/coincards/' + cardId + '.json',
  chainId:     137,
  token:       'USDC',
  updatedAt:   now,
});

index.updatedAt = now;

const indexJson = JSON.stringify(index, null, 2) + '\n';

/* ── Output ─────────────────────────────────────────────────────────────── */

console.log('\n' + (DRY_RUN ? '[DRY RUN] ' : '') + 'Coin Card provisioning\n');
console.log('  Card ID      :', cardId);
console.log('  Display name :', displayName);
console.log('  Recipient    :', wallet);
console.log('  Credential   :', record.displayCredential);
console.log('  Owner domain :', ownerDomain);
console.log('  Expires      :', expiresAt.split('T')[0]);
console.log('  Card URL     : https://implicitex.com/card/' + cardId);
console.log('  Embed iframe : <iframe src="https://implicitex.com/card/' + cardId + '" title="' + displayName + ' Coin Card" width="360" height="560" frameborder="0"></iframe>');
console.log('');

if (DRY_RUN) {
  console.log('--- Would write to:', recordPath);
  console.log(recordJson);
  console.log('--- Would update:', INDEX_PATH);
  console.log(indexJson);
  process.exit(0);
}

/* ── Write files ─────────────────────────────────────────────────────────── */

fs.mkdirSync(REGISTRY_DIR, { recursive: true });
fs.writeFileSync(recordPath, recordJson, 'utf8');
fs.writeFileSync(INDEX_PATH, indexJson, 'utf8');

console.log('✓ Registry record written :', recordPath);
console.log('✓ Registry index updated  :', INDEX_PATH);
console.log('\nNext steps:');
console.log('  1. Deploy frontend to production (firebase deploy --only hosting --project production)');
console.log('  2. Verify card loads: https://implicitex.com/card/' + cardId);
console.log('  3. Send the URL to the cardholder.\n');
