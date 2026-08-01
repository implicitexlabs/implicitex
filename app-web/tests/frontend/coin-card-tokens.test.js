const assert = require('node:assert/strict');
const Ajv = require('ajv');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

const repoRoot = path.resolve(__dirname, '../../..');
const tokensPath = path.join(repoRoot, 'docs/product/coin-card/coin-card.tokens.json');
const schemaPath = path.join(repoRoot, 'docs/product/coin-card/coin-card.tokens.schema.json');
const cssPath = path.join(repoRoot, 'app-web/frontend/public/coincard/coin-card.tokens.css');
const generator = require(path.join(repoRoot, 'app-web/scripts/generate_coin_card_tokens_css.js'));
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

function hashFile(relativePath) {
  const file = fs.readFileSync(path.join(repoRoot, relativePath));
  return crypto.createHash('sha256').update(file).digest('hex');
}

function readSvgViewBox(relativePath) {
  const svg = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const match = svg.match(/\bviewBox="([^"]+)"/);
  assert.ok(match, 'SVG must include viewBox');
  return match[1].trim().split(/\s+/).map(Number);
}

test('token metadata is normative and uses border-box CSS pixels', () => {
  assert.equal(tokens.name, 'implicitex.coin-card.tokens.v1');
  assert.equal(tokens.status, 'normative');
  assert.equal(tokens.units, 'css_px');
  assert.equal(tokens.boxSizing, 'border-box');
  assert.equal(tokens.tolerance.token, 0);
});

test('token sheet validates against its JSON schema', () => {
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema);
  assert.equal(validate(tokens), true, JSON.stringify(validate.errors, null, 2));
});

test('collapsed acceptance mark exterior box is frozen at 216 x 44', () => {
  const box = tokens.formFactors.collapsedAcceptanceMark.outer;
  assert.equal(box.width, 216);
  assert.equal(box.height, 44);
});

test('expanded horizontal exterior box is frozen at 460 x 286', () => {
  const box = tokens.formFactors.expandedHorizontal.outer;
  assert.equal(box.width, 460);
  assert.equal(box.height, 286);
});

test('expanded planes sum exactly to exterior height', () => {
  const { outer, planes } = tokens.formFactors.expandedHorizontal;
  const sum =
    planes.identityHeader.height +
    planes.credential.height +
    planes.action.height;
  assert.equal(sum, outer.height);
});

test('collapsed identity area plus lettermark cell equals exterior width', () => {
  const { outer, grid } = tokens.formFactors.collapsedAcceptanceMark;
  assert.equal(grid.identityArea.width + grid.lettermarkCell.width, outer.width);
  assert.equal(grid.lettermarkCell.height, outer.height);
});

test('lettermark asset checksum matches token file', () => {
  const asset = tokens.assets.lettermark;
  assert.equal(hashFile(asset.path), asset.sha256);
});

test('canonical wordmark asset checksums match token file', () => {
  assert.equal(
    hashFile(tokens.assets.implicitexWordmark.path),
    tokens.assets.implicitexWordmark.sha256
  );
  assert.equal(
    hashFile(tokens.assets.coinCardWordmark.path),
    tokens.assets.coinCardWordmark.sha256
  );
});

test('lettermark SVG viewBox is square and matches token file', () => {
  const asset = tokens.assets.lettermark;
  const viewBox = readSvgViewBox(asset.path);
  assert.deepEqual(viewBox, asset.viewBox);
  assert.equal(viewBox[2], viewBox[3]);
  assert.equal(asset.aspectRatio, 1);
  assert.equal(asset.allowedScaleRatio, 1);
});

test('all approved lettermark boxes are square', () => {
  const collapsed = tokens.formFactors.collapsedAcceptanceMark.lettermark.box;
  const expanded = tokens.formFactors.expandedHorizontal.lettermark.box;
  assert.equal(collapsed.width, collapsed.height);
  assert.equal(expanded.width, expanded.height);
});

test('collapsed lettermark clear space is mathematically derived', () => {
  const mark = tokens.formFactors.collapsedAcceptanceMark.lettermark;
  assert.equal((mark.cell.width - mark.box.width) / 2, mark.clearSpace);
  assert.equal((mark.cell.height - mark.box.height) / 2, mark.clearSpace);
});

test('expanded lettermark coordinates match right and top clear space', () => {
  const expanded = tokens.formFactors.expandedHorizontal;
  const mark = expanded.lettermark;
  assert.equal(mark.position.y, mark.clearSpaceFromTop);
  assert.equal(
    expanded.outer.width - mark.position.x - mark.box.width,
    mark.clearSpaceFromRight
  );
});

test('expanded shell constants mirror expanded form factor values', () => {
  const constants = tokens.constants.expanded;
  const expanded = tokens.formFactors.expandedHorizontal;
  assert.equal(constants.radius, expanded.radius);
  assert.equal(constants.border, expanded.border.width);
  assert.equal(constants.inset, expanded.inset.x);
  assert.equal(constants.inset, expanded.inset.y);
});

test('expanded lettermark value shift stays inside the mark silhouette', () => {
  const valueShift = tokens.constants.expanded.lettermarkValueShift;
  assert.equal(valueShift.duration, 8);
  assert.equal(valueShift.easing, 'ease-in-out');
  assert.equal(valueShift.neutralColor, 'rgb(112, 112, 112)');
  assert.equal(valueShift.brightColor, 'rgb(242, 244, 246)');
  assert.equal(valueShift.phaseOffset, 0);
});

test('collapsed lettermark value shift stays inside the mark silhouette', () => {
  const valueShift = tokens.constants.collapsed.lettermarkValueShift;
  assert.equal(valueShift.duration, 9);
  assert.equal(valueShift.easing, 'ease-in-out');
  assert.equal(valueShift.neutralColor, 'rgb(112, 112, 112)');
  assert.equal(valueShift.brightColor, 'rgb(242, 244, 246)');
  assert.equal(valueShift.phaseOffset, -1.8);
});

test('expanded proportion ratios match token geometry', () => {
  const expanded = tokens.formFactors.expandedHorizontal;
  const action = expanded.slots.action;
  const ratios = tokens.ratios.expanded;
  const precision = 0.0000001;

  assert.ok(Math.abs(ratios.lettermarkWidthToCardWidth - expanded.lettermark.box.width / expanded.outer.width) < precision);
  assert.ok(Math.abs(ratios.lettermarkHeightToCardHeight - expanded.lettermark.box.height / expanded.outer.height) < precision);
  assert.ok(Math.abs(ratios.topInsetToWidth - expanded.inset.x / expanded.outer.width) < precision);
  assert.ok(Math.abs(ratios.topInsetToHeight - expanded.inset.y / expanded.outer.height) < precision);
  assert.ok(Math.abs(ratios.ctaWidthToCardWidth - action.cta.width / expanded.outer.width) < precision);
  assert.ok(Math.abs(ratios.ctaHeightToCardHeight - action.cta.height / expanded.outer.height) < precision);
  assert.ok(Math.abs(ratios.headerPlaneToCardHeight - expanded.planes.identityHeader.height / expanded.outer.height) < precision);
  assert.ok(Math.abs(ratios.credentialPlaneToCardHeight - expanded.planes.credential.height / expanded.outer.height) < precision);
  assert.ok(Math.abs(ratios.actionPlaneToCardHeight - expanded.planes.action.height / expanded.outer.height) < precision);
});

test('collapsed slots remain inside collapsed exterior box', () => {
  const collapsed = tokens.formFactors.collapsedAcceptanceMark;
  const { outer, slots } = collapsed;
  const boxes = [
    slots.primaryClaim,
    slots.networkToken,
    {
      x: slots.statusIndicator.x,
      y: slots.statusIndicator.y,
      width: slots.statusIndicator.diameter,
      height: slots.statusIndicator.diameter,
    },
  ];

  boxes.forEach((box) => {
    assert.ok(box.x >= 0);
    assert.ok(box.y >= 0);
    assert.ok(box.x + box.width <= outer.width);
    assert.ok(box.y + box.height <= outer.height);
  });
});

test('collapsed Coin Card wordmark fit remains contained by product slot', () => {
  const slot = tokens.formFactors.collapsedAcceptanceMark.slots.primaryClaim;
  const fit = tokens.formFactors.collapsedAcceptanceMark.slots.coinCardWordmarkFit;
  assert.ok(fit.maxWidth <= slot.width);
  assert.ok(fit.maxHeight <= slot.height);
  assert.equal(fit.aspectRatio, 7);
  assert.equal(fit.renderedWidth, fit.renderedHeight * fit.aspectRatio);
  assert.ok(fit.renderedWidth <= fit.maxWidth);
  assert.ok(fit.renderedHeight <= fit.maxHeight);
  assert.equal(fit.objectFit, 'contain');
  assert.equal(fit.objectPosition, 'left center');
});

test('collapsed ImplicitEx attribution fits before the mark-cell divider', () => {
  const collapsed = tokens.formFactors.collapsedAcceptanceMark;
  const attribution = collapsed.slots.attribution;
  const fit = collapsed.slots.attributionFit;
  const dividerX = collapsed.slots.lettermarkCellDivider.x1;
  const computedWordmarkWidth = fit.wordmarkHeight * fit.wordmarkAspectRatio;
  const computedTotalWidth = fit.poweredByWidth + fit.gap + fit.wordmarkWidth;
  const epsilon = 0.000001;

  assert.ok(Math.abs(fit.wordmarkWidth - computedWordmarkWidth) < epsilon);
  assert.ok(Math.abs(fit.totalWidth - computedTotalWidth) < epsilon);
  assert.ok(fit.totalWidth <= attribution.width);
  assert.ok(attribution.x + attribution.width <= dividerX);
});

test('expanded header slots remain inside identity plane and avoid mark slot', () => {
  const expanded = tokens.formFactors.expandedHorizontal;
  const plane = expanded.planes.identityHeader;
  const slots = expanded.slots.identityHeader;
  const mark = expanded.lettermark;
  const markLeft = mark.position.x;

  ['primaryClaim', 'recipientName', 'networkToken', 'productIdentity', 'attribution'].forEach((id) => {
    const box = slots[id];
    assert.ok(box.x >= plane.x);
    assert.ok(box.y >= plane.y);
    assert.ok(box.x + box.width <= markLeft);
    assert.ok(box.y + box.height <= plane.y + plane.height);
    if (typeof box.baseline === 'number') {
      assert.ok(box.baseline >= box.y);
      assert.ok(box.baseline <= box.y + box.height);
    }
  });
});

test('expanded product identity slot fits above attribution without changing divider', () => {
  const slots = tokens.formFactors.expandedHorizontal.slots.identityHeader;
  const product = slots.productIdentity;
  const productFit = slots.productIdentityFit;
  const attribution = slots.attribution;
  const divider = slots.headerDivider;

  assert.ok(product.y + product.height < attribution.y);
  assert.ok(attribution.y + attribution.height < divider.y1);
  assert.ok(productFit.maxWidth <= product.width);
  assert.ok(productFit.maxHeight <= product.height);
  assert.equal(productFit.aspectRatio, 7);
  assert.equal(productFit.renderedWidth, productFit.renderedHeight * productFit.aspectRatio);
  assert.ok(productFit.renderedWidth <= productFit.maxWidth);
  assert.ok(productFit.renderedHeight <= productFit.maxHeight);
  assert.equal(productFit.objectFit, 'contain');
  assert.equal(productFit.objectPosition, 'left center');
});

test('credential rows are fixed-height and remain inside credential plane', () => {
  const expanded = tokens.formFactors.expandedHorizontal;
  const plane = expanded.planes.credential;
  const credential = expanded.slots.credential;
  const expectedRows = ['recipient', 'route', 'destination', 'amount', 'fee', 'total'];

  assert.deepEqual(credential.rows.map((row) => row.id), expectedRows);
  credential.rows.forEach((row, index) => {
    assert.equal(row.y, plane.y + index * credential.rowHeight);
    assert.ok(row.baseline >= row.y);
    assert.ok(row.baseline <= row.y + credential.rowHeight);
    assert.ok(row.y + credential.rowHeight <= plane.y + plane.height);
  });
});

test('credential label and value columns cannot overlap', () => {
  const credential = tokens.formFactors.expandedHorizontal.slots.credential;
  const labelRight = credential.labelX + credential.labelWidth;
  const valueLeft = credential.valueRightEdge - credential.valueMaxWidth;
  assert.ok(labelRight < valueLeft);
});

test('action slots remain inside action plane', () => {
  const expanded = tokens.formFactors.expandedHorizontal;
  const plane = expanded.planes.action;
  const action = expanded.slots.action;

  [action.statusText, action.cta, action.ctaLabel].forEach((box) => {
    assert.ok(box.x >= plane.x);
    assert.ok(box.y >= plane.y);
    assert.ok(box.x + box.width <= plane.x + plane.width);
    assert.ok(box.y + box.height <= plane.y + plane.height);
  });
  assert.ok(action.statusIndicator.x >= plane.x);
  assert.ok(action.statusIndicator.y >= plane.y);
  assert.ok(action.statusIndicator.y + action.statusIndicator.diameter <= plane.y + plane.height);
});

test('generated Coin Card CSS is current', () => {
  const existing = fs.readFileSync(cssPath, 'utf8');
  assert.equal(existing, generator.buildCss(tokens));
});
