/* send-usdc-visual-fixture.test.js
 *
 * Browser validation for the local-only Send USDC visual fixture.
 * The fixture renders presentation states without wallet, RPC, registry,
 * analytics, storage, or execution wiring.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const puppeteer = require('puppeteer');

const appRoot = path.resolve(__dirname, '../..');
const fixturePath = path.join(appRoot, 'tests/browser/fixtures/send-usdc-visual-fixture.html');
const screenshotRoot = path.join('/tmp', 'implicitex-send-usdc-visual-fixture');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function openFixture(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#sendUsdcVisualFixture');
}

async function collectState(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.fixture-card')).map((card) => ({
      id: card.id,
      title: card.querySelector('.fixture-card-title')?.textContent.trim() || '',
      state: card.querySelector('.fixture-card-state')?.textContent.trim() || '',
      recipientId: card.querySelector('.tx-field')?.id || '',
      recipientDisabled: !!card.querySelector('.tx-field')?.disabled,
      amountDisabled: !!card.querySelectorAll('.tx-field')[1]?.disabled,
      confirmHidden: card.querySelector('.tx-confirm')?.hidden ?? null,
      previewHidden: card.querySelector('.tx-preview')?.hidden ?? null,
      buttonText: card.querySelector('.tx-btn')?.textContent.trim() || '',
      buttonArmed: card.querySelector('.tx-btn')?.classList.contains('tx-btn--armed') || false,
      errorText: card.querySelector('.tx-recipient-error')?.textContent.trim() || '',
      noteText: card.querySelector('.tx-state-note')?.textContent.trim() || '',
      activeElementId: document.activeElement && document.activeElement.id || '',
    }));

    return {
      cards,
      hasWindowIX: typeof window.IX !== 'undefined',
      externalScripts: Array.from(document.scripts)
        .map((script) => script.src)
        .filter(Boolean),
      documentOverflow: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      bodyOverflow: {
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
      fixtureWidth: document.getElementById('sendUsdcVisualFixture').getBoundingClientRect().width,
      activeElementId: document.activeElement && document.activeElement.id || '',
    };
  });
}

test('Send USDC visual fixture renders the canonical states at mobile and desktop widths', async () => {
  ensureDir(screenshotRoot);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-crash-reporter',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();

    await openFixture(page, 390, 1800);
    await page.focus('#focused-recipient');
    const mobile = await collectState(page);
    await page.screenshot({ path: path.join(screenshotRoot, 'send-usdc-visual-fixture-390.png'), fullPage: true });

    assert.equal(mobile.cards.length, 6, 'fixture renders six states');
    assert.equal(mobile.hasWindowIX, false, 'fixture must not load portal runtime');
    assert.equal(mobile.externalScripts.length, 0, 'fixture must not load external scripts');
    assert(mobile.documentOverflow.scrollWidth <= mobile.documentOverflow.clientWidth, 'mobile document must not overflow horizontally');
    assert(mobile.bodyOverflow.scrollWidth <= mobile.bodyOverflow.clientWidth, 'mobile body must not overflow horizontally');
    assert.equal(mobile.activeElementId, 'focused-recipient', 'focused card should own focus');

    const focused = mobile.cards.find((card) => card.id === 'fixture-focused');
    const empty = mobile.cards.find((card) => card.id === 'fixture-empty');
    const populated = mobile.cards.find((card) => card.id === 'fixture-populated');
    const invalid = mobile.cards.find((card) => card.id === 'fixture-invalid');
    const disabled = mobile.cards.find((card) => card.id === 'fixture-disabled');
    const reviewReady = mobile.cards.find((card) => card.id === 'fixture-review-ready');

    assert.equal(empty.previewHidden, true, 'empty state keeps preview hidden');
    assert.equal(empty.confirmHidden, true, 'empty state keeps acknowledgement hidden');
    assert.equal(focused.recipientId, 'focused-recipient', 'focused state exposes a distinct input id');
    assert.equal(populated.recipientDisabled, false, 'populated state remains editable');
    assert.equal(invalid.errorText, 'Enter a valid recipient wallet address or ENS name.', 'invalid state shows validation copy');
    assert.equal(disabled.recipientDisabled, true, 'disabled state disables recipient field');
    assert.equal(disabled.amountDisabled, true, 'disabled state disables amount field');
    assert.equal(reviewReady.previewHidden, false, 'review-ready state shows preview');
    assert.equal(reviewReady.confirmHidden, false, 'review-ready state shows acknowledgement');
    assert.equal(reviewReady.buttonArmed, true, 'review-ready state arms the action button');
    assert.equal(reviewReady.buttonText, 'Execute Transfer', 'review-ready state uses execution label');

    await openFixture(page, 1365, 1600);
    await page.focus('#focused-recipient');
    const desktop = await collectState(page);
    await page.screenshot({ path: path.join(screenshotRoot, 'send-usdc-visual-fixture-1365.png'), fullPage: true });

    assert.equal(desktop.cards.length, 6, 'desktop fixture also renders six states');
    assert(desktop.documentOverflow.scrollWidth <= desktop.documentOverflow.clientWidth, 'desktop document must not overflow horizontally');
    assert(desktop.bodyOverflow.scrollWidth <= desktop.bodyOverflow.clientWidth, 'desktop body must not overflow horizontally');
    assert.equal(desktop.activeElementId, 'focused-recipient', 'focused card should own focus on desktop');
  } finally {
    await browser.close();
  }
});
