const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const indexHtmlPath = path.join(publicRoot, 'index.html');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('homepage replaces the embedded transfer shell with a portal-entry surface', () => {
  const html = read(indexHtmlPath);

  assert.match(html, /<section class="portal-entry" id="transfer" aria-labelledby="portalEntryTitle">/);
  assert.match(html, /<h2 class="portal-entry-title" id="portalEntryTitle">Send USDC with ImplicitEx<\/h2>/);
  assert.match(html, /<a class="portal-entry-action portal-entry-action--primary" href="\/portal-index\.html">Open Transfer Portal<\/a>/);
  assert.match(html, /<a class="portal-entry-action portal-entry-action--secondary" href="\/install\.html">Install ImplicitEx<\/a>/);
  assert.match(html, /No recipient, amount, wallet, verification, or execution controls appear on the public site\./);
  assert.match(html, /<a class="send-usdc-link" href="#transfer">Transfer portal<\/a>/);
  assert.match(html, /<p class="mobile-menu-portal-note">Open the canonical portal\.<\/p>/);
  assert.match(html, /Open the Transfer Portal to prepare, review,\s+and verify the transfer before sending\./);

  assert.doesNotMatch(html, /id="txRecipient"/);
  assert.doesNotMatch(html, /id="txAmount"/);
  assert.doesNotMatch(html, /id="txPurposeTag"/);
  assert.doesNotMatch(html, /id="txReference"/);
  assert.doesNotMatch(html, /id="txMemo"/);
  assert.doesNotMatch(html, /id="txConfirmAck"/);
  assert.doesNotMatch(html, /id="txBtn"/);
  assert.doesNotMatch(html, /id="txCancelReview"/);
  assert.doesNotMatch(html, /Transfer DETAILS/i);
  assert.doesNotMatch(html, /Wallet paying for this transfer/);
  assert.doesNotMatch(html, /Coin Card handoff status/);
  assert.doesNotMatch(html, /Recent transaction attempts/);
});
