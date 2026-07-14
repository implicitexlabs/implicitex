const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');
const portalCssPath = path.join(publicRoot, 'css/main.css');
const walletJsPath = path.join(publicRoot, 'js/wallet.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('Send USDC control system uses labeled groups and sentence-case actions', () => {
  const html = read(portalIndexPath);

  assert.match(html, /<label class="tx-field-label" for="txRecipient">Recipient<\/label>/);
  assert.match(html, /<label class="tx-field-label" for="txAmount">Amount<\/label>/);
  assert.match(html, /<label class="tx-field-label" for="txPurposeTag">Purpose<\/label>/);
  assert.match(html, /<label class="tx-field-label" for="txReference">Reference<\/label>/);
  assert.match(html, /<label class="tx-field-label" for="txMemo">Memo<\/label>/);
  assert.match(html, /<button class="tx-btn" id="txBtn"[\s\S]*?>Review transfer<\/button>/);
  assert.match(html, /<button class="tx-btn tx-btn--cancel" id="txCancelReview"[\s\S]*?>\s*Edit details\s*<\/button>/);
  assert.match(html, /<span class="wallet-choice-title">Connect wallet<\/span>/);
  assert.match(html, /\.portal-connect-inline[\s\S]*height: 44px;/);

  const groupCount = (html.match(/class="tx-field-group"/g) || []).length;
  assert.equal(groupCount, 5, 'expected five labeled field groups in Send USDC');
});

test('Send USDC typography remains role-based and readable', () => {
  const css = read(portalCssPath);
  const js = read(walletJsPath);

  assert.match(css, /\.tx-field-group\s*\{\s*display: flex;\s*flex-direction: column;\s*gap: 6px;\s*margin-bottom: 16px;/);
  assert.match(css, /\.tx-field-label\s*\{\s*font-family: var\(--font-sans\);\s*font-size: 13px;\s*font-weight: var\(--weight-semibold\);/);
  assert.match(css, /\.tx-field\s*\{\s*[\s\S]*font-size: 15px;[\s\S]*min-height: 44px;[\s\S]*border-radius: 2px;/);
  assert.match(css, /\.tx-field--select\s*\{\s*[\s\S]*font-family: var\(--font-sans\);\s*font-size: 14px;/);
  assert.match(css, /\.tx-recipient-error\s*\{\s*font-family: var\(--font-sans\);\s*font-size: 13px;/);
  assert.match(css, /\.fee-label\s*\{[\s\S]*font-family: var\(--font-sans\);[\s\S]*font-size: 13px;[\s\S]*font-weight: var\(--weight-semibold\);/);
  assert.match(css, /\.fee-val\s*\{[\s\S]*font-family: var\(--font-mono\);[\s\S]*font-size: 15px;/);
  assert.match(css, /#transferMod \.data-k\s*\{\s*font-family: var\(--font-sans\);\s*font-size: 13px;[\s\S]*text-transform: none;/);
  assert.match(css, /#transferMod \.data-v\s*\{\s*font-family: var\(--font-mono\);\s*font-size: 15px;/);
  assert.match(css, /\.tx-btn\s*\{\s*font-family: var\(--font-ui\);\s*font-size: 14px;[\s\S]*text-transform: none;[\s\S]*min-height: 44px;/);
  assert.match(css, /\.tx-btn--cancel\s*\{\s*background: transparent;/);
  assert.match(css, /\.tx-state-note\s*\{\s*font-family: var\(--font-sans\);\s*font-size: 13px;/);
  assert.match(css, /\.tx-status\s*\{\s*font-family: var\(--font-sans\);\s*font-size: 13px;/);
  assert.match(css, /\.tx-confirm\s*\{\s*[\s\S]*font-family: var\(--font-sans\);[\s\S]*font-size: 14px;/);
  assert.match(js, /Connect wallet to continue/);
  assert.match(js, /Review transfer/);
});
