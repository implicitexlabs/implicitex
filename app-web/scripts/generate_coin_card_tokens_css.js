const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const tokensPath = path.join(repoRoot, 'docs/product/coin-card/coin-card.tokens.json');
const cssPath = path.join(appRoot, 'frontend/public/coincard/coin-card.tokens.css');

function toKebab(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function unitFor(key, value) {
  if (typeof value !== 'number') return '';
  if (key === 'token') return '';
  if (key === 'lineHeight' || key === 'aspectRatio' || key === 'allowedScaleRatio') return '';
  if (key === 'weight') return '';
  if (key === 'letterSpacingEm') return 'em';
  if (key === 'opacity') return '';
  return 'px';
}

function flatten(value, parts, out) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== 'object')) {
      out.push([parts.map(toKebab).join('-'), value.join(' ')]);
      return;
    }
    value.forEach((item, index) => flatten(item, parts.concat(index), out));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      flatten(child, parts.concat(key), out);
    });
    return;
  }

  const key = parts[parts.length - 1];
  const name = parts.map(toKebab).join('-');
  const suffix = unitFor(key, value);
  out.push([name, `${value}${suffix}`]);
}

function buildCss(inputTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'))) {
  const variables = [];
  flatten(inputTokens.constants, ['constant'], variables);
  flatten(inputTokens.formFactors, ['form-factor'], variables);
  flatten(inputTokens.ratios, ['ratio'], variables);
  flatten(inputTokens.typography, ['type'], variables);
  flatten(inputTokens.tolerance, ['tolerance'], variables);

  const lines = [
    '/*',
    ' * Generated from docs/product/coin-card/coin-card.tokens.json.',
    ' * Do not edit by hand. Run: npm run build:coincard-tokens',
    ' */',
    ':root {',
  ];

  variables
    .filter(([, value]) => typeof value !== 'object')
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, value]) => {
      lines.push(`  --cc-${name}: ${value};`);
    });

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const css = buildCss();
  const check = process.argv.includes('--check');

  if (check) {
    const existing = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
    if (existing !== css) {
      console.error(`Coin Card generated CSS is stale: ${path.relative(repoRoot, cssPath)}`);
      console.error('Run: npm run build:coincard-tokens');
      process.exit(1);
    }
    console.log(`Coin Card generated CSS is current: ${path.relative(repoRoot, cssPath)}`);
  } else {
    fs.writeFileSync(cssPath, css);
    console.log(`Wrote ${path.relative(repoRoot, cssPath)}`);
  }
}

if (require.main === module) main();

module.exports = { buildCss };
