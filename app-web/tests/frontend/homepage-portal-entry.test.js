const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const indexHtmlPath = path.join(publicRoot, 'index.html');
const portalCssPath = path.join(publicRoot, 'css/main.css');
const mobileMenuJsPath = path.join(publicRoot, 'js/mobile-menu.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('homepage replaces the embedded transfer shell with a portal-entry surface', () => {
  const html = read(indexHtmlPath);
  const css = read(portalCssPath);
  const mobileMenuJs = read(mobileMenuJsPath);

  assert.match(html, /<section class="portal-entry" id="transfer" aria-labelledby="portalEntryTitle">/);
  assert.match(html, /<p class="portal-entry-kicker">Quick access<\/p>/);
  assert.match(html, /<h2 class="portal-entry-title" id="portalEntryTitle">Send USDC with ImplicitEx<\/h2>/);
  assert.match(html, /<a class="portal-entry-action portal-entry-action--primary" href="https:\/\/portal\.implicitex\.com\/">Open Transfer Portal<\/a>/);
  assert.match(html, /<a class="portal-entry-action portal-entry-action--secondary" href="\/install\.html">Install ImplicitEx<\/a>/);
  assert.match(html, /Transfers open in a dedicated workspace so preparation, review, and confirmation stay separated\./);
  assert.match(html, /<a class="send-usdc-link" href="https:\/\/portal\.implicitex\.com\/">Open Transfer Portal<\/a>/);
  assert.match(html, /<p class="mobile-menu-portal-note">Opens the dedicated transfer workspace\.<\/p>/);
  assert.match(html, /Open the Transfer Portal to review the recipient, amount, fee, and network before you send USDC on Polygon\./);

  assert.doesNotMatch(html, /id="txRecipient"/);
  assert.doesNotMatch(html, /id="txAmount"/);
  assert.doesNotMatch(html, /id="txPurposeTag"/);
  assert.doesNotMatch(html, /id="txReference"/);
  assert.doesNotMatch(html, /id="txMemo"/);
  assert.doesNotMatch(html, /id="txConfirmAck"/);
  assert.doesNotMatch(html, /id="txBtn"/);
  assert.doesNotMatch(html, /id="txCancelReview"/);
  assert.doesNotMatch(html, /id="connectBtn"/);
  assert.doesNotMatch(html, /id="walletMenu"/);
  assert.doesNotMatch(html, /id="walletChoiceOverlay"/);
  assert.doesNotMatch(html, /Transfer DETAILS/i);
  assert.doesNotMatch(html, /Wallet paying for this transfer/);
  assert.doesNotMatch(html, /Coin Card handoff status/);
  assert.doesNotMatch(html, /Recent transaction attempts/);

  assert.match(css, /\.portal-entry-kicker\s*\{[\s\S]*color: var\(--dim\);/);
  assert.match(css, /\.portal-install-strip-label\s*\{[\s\S]*color: var\(--dim\);/);
  assert.match(css, /\.portal-entry-preview-step\s*\{[\s\S]*color: var\(--dim\);/);
  assert.match(css, /\.mobile-menu-portal-note\s*\{[\s\S]*letter-spacing: 0\.02em;/);
  assert.match(mobileMenuJs, /https:\/\/portal\.implicitex\.com\//);
  assert.doesNotMatch(mobileMenuJs, /\/#transfer/);
});
