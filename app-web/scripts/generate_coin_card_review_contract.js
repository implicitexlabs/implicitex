const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const contractRoot = path.join(repoRoot, 'docs/product/coin-card');
const statePath = path.join(contractRoot, 'coin-card.state.v1.json');
const fixturesPath = path.join(contractRoot, 'coin-card.fixtures.v1.json');
const tokensPath = path.join(contractRoot, 'coin-card.tokens.json');
const jsPath = path.join(appRoot, 'frontend/public/coincard/state-review-contract.generated.js');
const cssPath = path.join(appRoot, 'frontend/public/coincard/state-review-tokens.generated.css');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slotVars(prefix, slot) {
  const lines = [];
  Object.entries(slot).forEach(([key, value]) => {
    if (typeof value === 'number') lines.push(`  --cc-review-${prefix}-${key}: ${value}px;`);
  });
  return lines;
}

function buildContract() {
  return {
    generatedFrom: {
      state: path.relative(repoRoot, statePath),
      fixtures: path.relative(repoRoot, fixturesPath),
      tokens: path.relative(repoRoot, tokensPath),
    },
    state: readJson(statePath),
    fixtures: readJson(fixturesPath),
    tokens: readJson(tokensPath),
  };
}

function buildJs(contract = buildContract()) {
  const body = JSON.stringify(contract, null, 2);
  return [
    '/*',
    ' * Generated from docs/product/coin-card state, fixture, and token contracts.',
    ' * Do not edit by hand. Run: npm run build:coincard-review',
    ' */',
    '(function (root) {',
    '  "use strict";',
    `  var contract = ${body};`,
    '  if (typeof module !== "undefined" && module.exports) module.exports = contract;',
    '  root.COIN_CARD_REVIEW_CONTRACT = contract;',
    '})(typeof window !== "undefined" ? window : globalThis);',
    '',
  ].join('\n');
}

function buildCss(contract = buildContract()) {
  const tokens = contract.tokens;
  const state = contract.state;
  const collapsed = tokens.formFactors.collapsedAcceptanceMark;
  const expanded = tokens.formFactors.expandedHorizontal;
  const collapsedState = state.geometry.collapsed;
  const expandedState = state.geometry.expanded;
  const identity = expanded.slots.identityHeader;
  const credential = expanded.slots.credential;
  const action = expanded.slots.action;

  const lines = [
    '/*',
    ' * Generated from docs/product/coin-card/coin-card.tokens.json and coin-card.state.v1.json.',
    ' * Do not edit by hand. Run: npm run build:coincard-review',
    ' */',
    ':root {',
    `  --cc-review-collapsed-width: ${collapsed.outer.width}px;`,
    `  --cc-review-collapsed-height: ${collapsed.outer.height}px;`,
    `  --cc-review-expanded-width: ${expanded.outer.width}px;`,
    `  --cc-review-expanded-height: ${expanded.outer.height}px;`,
    `  --cc-review-collapsed-hit-x: ${collapsedState.expandHitTarget.x}px;`,
    `  --cc-review-collapsed-hit-y: ${collapsedState.expandHitTarget.y}px;`,
    `  --cc-review-collapsed-hit-width: ${collapsedState.expandHitTarget.width}px;`,
    `  --cc-review-collapsed-hit-height: ${collapsedState.expandHitTarget.height}px;`,
    ...slotVars('collapsed-primary', collapsed.slots.primaryClaim),
    ...slotVars('collapsed-secondary', collapsed.slots.attribution),
    ...slotVars('collapsed-status', {
      x: collapsed.slots.statusIndicator.x,
      y: collapsed.slots.statusIndicator.y,
      width: collapsed.slots.statusIndicator.diameter,
      height: collapsed.slots.statusIndicator.diameter,
    }),
    ...slotVars('collapsed-mark', {
      x: collapsed.lettermark.position.x,
      y: collapsed.lettermark.position.y,
      width: collapsed.lettermark.box.width,
      height: collapsed.lettermark.box.height,
    }),
    ...slotVars('expanded-primary', identity.primaryClaim),
    ...slotVars('expanded-name', identity.recipientName),
    ...slotVars('expanded-network', identity.networkToken),
    ...slotVars('expanded-product', identity.productIdentity),
    ...slotVars('expanded-attribution', identity.attribution),
    ...slotVars('expanded-mark', {
      x: expanded.lettermark.position.x,
      y: expanded.lettermark.position.y,
      width: expanded.lettermark.box.width,
      height: expanded.lettermark.box.height,
    }),
    ...slotVars('expanded-divider', {
      x: identity.headerDivider.x1,
      y: identity.headerDivider.y1,
      width: identity.headerDivider.x2 - identity.headerDivider.x1,
      height: 1,
    }),
    ...slotVars('row-label', {
      x: credential.labelX,
      width: credential.labelWidth,
      height: credential.rowHeight,
    }),
    ...slotVars('row-value', {
      x: credential.valueRightEdge - credential.valueMaxWidth,
      width: credential.valueMaxWidth,
      height: credential.rowHeight,
    }),
    ...credential.rows.map((row, index) => `  --cc-review-row-${index}-y: ${row.y}px;`),
    ...slotVars('action-divider', {
      x: credential.credentialDivider.x1,
      y: credential.credentialDivider.y1,
      width: credential.credentialDivider.x2 - credential.credentialDivider.x1,
      height: 1,
    }),
    ...slotVars('status-dot', {
      x: action.statusIndicator.x,
      y: action.statusIndicator.y,
      width: action.statusIndicator.diameter,
      height: action.statusIndicator.diameter,
    }),
    ...slotVars('status-text', action.statusText),
    ...slotVars('cta-slot', action.cta),
    `  --cc-review-collapse-x: ${expandedState.collapseControl.x}px;`,
    `  --cc-review-collapse-y: ${expandedState.collapseControl.y}px;`,
    `  --cc-review-collapse-width: ${expandedState.collapseControl.width}px;`,
    `  --cc-review-collapse-height: ${expandedState.collapseControl.height}px;`,
    '}',
    '',
  ];

  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const contract = buildContract();
  const nextJs = buildJs(contract);
  const nextCss = buildCss(contract);

  if (check) {
    const currentJs = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
    const currentCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
    if (currentJs !== nextJs || currentCss !== nextCss) {
      if (currentJs !== nextJs) console.error(`Coin Card review contract is stale: ${path.relative(repoRoot, jsPath)}`);
      if (currentCss !== nextCss) console.error(`Coin Card review CSS tokens are stale: ${path.relative(repoRoot, cssPath)}`);
      console.error('Run: npm run build:coincard-review');
      process.exit(1);
    }
    console.log('Coin Card review generated artifacts are current.');
    return;
  }

  fs.writeFileSync(jsPath, nextJs);
  fs.writeFileSync(cssPath, nextCss);
  console.log(`Wrote ${path.relative(repoRoot, jsPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, cssPath)}`);
}

if (require.main === module) main();

module.exports = { buildContract, buildCss, buildJs };
