const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');
const portalManifestPath = path.join(publicRoot, 'portal.webmanifest');
const portalInstallPath = path.join(publicRoot, 'js/portal-install.js');
const portalMainCssPath = path.join(publicRoot, 'css/main.css');
const appleTouchIconPath = path.join(publicRoot, 'assets/icons/apple-touch-icon.png');
const icon192Path = path.join(publicRoot, 'assets/icons/icon-192.png');
const icon512Path = path.join(publicRoot, 'assets/icons/icon-512.png');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractMediaBlock(source, mediaHeader) {
  const start = source.indexOf(mediaHeader);
  assert.ok(start >= 0, `missing media query: ${mediaHeader}`);

  const braceStart = source.indexOf('{', start);
  assert.ok(braceStart >= 0, `missing opening brace for: ${mediaHeader}`);

  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, i);
      }
    }
  }

  assert.fail(`unterminated media query block: ${mediaHeader}`);
}

function createDomHarness(options = {}) {
  const buttonListeners = {};
  const morePanel = {
    open: !!options.morePanelOpen,
    scrollIntoViewCalls: 0,
    scrollIntoView() {
      this.scrollIntoViewCalls += 1;
    },
  };
  const button = {
    hidden: false,
    attributes: {},
    title: '',
    listeners: buttonListeners,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    click() {
      if (typeof this.listeners.click === 'function') {
        return this.listeners.click();
      }
      return undefined;
    },
  };

  const windowListeners = {};
  const documentListeners = {};

  const context = {
    console,
    Promise,
    window: {
      navigator: {
        standalone: !!options.navigatorStandalone,
      },
      matchMedia(query) {
        return {
          matches: query === '(display-mode: standalone)' ? !!options.displayModeStandalone : false,
        };
      },
      addEventListener(type, handler) {
        windowListeners[type] = handler;
      },
      navigatorStandalone: !!options.navigatorStandalone,
    },
    document: {
      getElementById(id) {
        if (id === 'portalInstallBtn') return button;
        if (id === 'portalFooterMore') return morePanel;
        return null;
      },
      addEventListener(type, handler) {
        documentListeners[type] = handler;
      },
    },
  };

  context.window.window = context.window;
  context.window.document = context.document;
  context.window.Promise = Promise;
  context.window.console = console;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  context.window.__listeners = windowListeners;
  context.__listeners = documentListeners;

  return { context, button, morePanel, windowListeners, documentListeners };
}

async function runPortalInstallScript(options = {}) {
  const harness = createDomHarness(options);
  const source = read(portalInstallPath);
  vm.runInNewContext(source, harness.context, { filename: portalInstallPath });

  if (typeof harness.documentListeners.DOMContentLoaded === 'function') {
    harness.documentListeners.DOMContentLoaded();
  }

  return harness;
}

test('portal shell references the install manifest and helper', () => {
  const html = read(portalIndexPath);

  assert.match(html, /<link rel="manifest" href="\/portal\.webmanifest">/);
  assert.match(html, /<script defer src="js\/portal-install\.js"><\/script>/);
  assert.match(html, /id="portalInstallBtn"/);
  assert.match(html, /id="portalFooterMore"/);
  assert.match(html, /Share, then Add to Home Screen/);
  assert.match(html, /Desktop and Android browsers may show an Install prompt/);
  assert.match(html, /--portal-safe-top:\s*env\(safe-area-inset-top,\s*0px\);/);
  assert.match(html, /--portal-safe-right:\s*env\(safe-area-inset-right,\s*0px\);/);
  assert.match(html, /--portal-safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\);/);
  assert.match(html, /--portal-safe-left:\s*env\(safe-area-inset-left,\s*0px\);/);
  assert.match(html, /padding-top:\s*calc\(0\.875rem \+ var\(--portal-safe-top\)\);/);
  assert.match(html, /padding-bottom:\s*calc\(1rem \+ var\(--portal-safe-bottom\)\);/);
  assert.match(html, /\.portal-zone::before\s*\{\s*right:\s*calc\(-14px \+ var\(--portal-safe-right\)\);/s);
  assert.match(html, /\.portal-zone::after\s*\{\s*left:\s*calc\(-14px \+ var\(--portal-safe-left\)\);/s);
  assert.match(html, /\[data-portal-shell="direct"\]\s+\.portal-zone\s*\{\s*margin:\s*0\.5rem 0;/s);
  const compactLandscapeBlock = extractMediaBlock(html, '@media (max-width: 900px) and (max-height: 500px)');
  assert.match(compactLandscapeBlock, /\[data-portal-shell="direct"\]\s+\.portal-zone::before,\s*\[data-portal-shell="direct"\]\s+\.portal-zone::after,\s*\[data-portal-shell="direct"\]\s+\.transfer-portal::before,\s*\[data-portal-shell="direct"\]\s+\.transfer-portal::after\s*\{\s*display:\s*none;/s);
  assert.doesNotMatch(compactLandscapeBlock, /\.portal-header-title/);
  assert.doesNotMatch(compactLandscapeBlock, /\.portal-footer/);
  assert.doesNotMatch(compactLandscapeBlock, /\.portal-zone\s*\{\s*margin:/);
  assert.doesNotMatch(compactLandscapeBlock, /\.portal-footer-row/);
  assert.doesNotMatch(compactLandscapeBlock, /\.portal-install-label/);
  assert.match(html, /\.portal-footer\s*\{\s*max-width:[^}]*margin:\s*0 auto 0;/s);

  const mainCss = read(portalMainCssPath);
  assert.match(mainCss, /\.portal-zone::before\s*\{/);
  assert.match(mainCss, /\.transfer-portal::before,\s*\.transfer-portal::after/s);
  assert.doesNotMatch(mainCss, /\[data-portal-shell="direct"\]\s+\.portal-zone::before/);

  assert.equal((html.match(/id="portalInstallBtn"/g) || []).length, 1);
  assert.equal((html.match(/js\/portal-install\.js/g) || []).length, 1);
});

test('portal manifest is installable and durable', () => {
  const manifest = JSON.parse(read(portalManifestPath));

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'ImplicitEx Transfer Portal');
  assert.equal(manifest.short_name, 'ImplicitEx');
  assert.match(manifest.description, /^Installable ImplicitEx transfer portal/);
  assert(!/Polygon/i.test(manifest.description), 'manifest description should not be permanently tied to Polygon');
  assert.equal(Array.isArray(manifest.icons), true);
  assert.equal(manifest.icons.length, 2);
  for (const icon of manifest.icons) {
    assert.equal(icon.purpose, 'any');
    assert.match(icon.src, /^\/assets\/icons\/icon-(192|512)\.png$/);
  }
});

test('required portal icon assets exist at the expected dimensions', async () => {
  const appleTouch = await sharp(appleTouchIconPath).metadata();
  const icon192 = await sharp(icon192Path).metadata();
  const icon512 = await sharp(icon512Path).metadata();

  assert.equal(appleTouch.width, 180);
  assert.equal(appleTouch.height, 180);
  assert.equal(icon192.width, 192);
  assert.equal(icon192.height, 192);
  assert.equal(icon512.width, 512);
  assert.equal(icon512.height, 512);
});

test('portal install helper opens install prompt and fallback instructions', async () => {
  const harness = await runPortalInstallScript({ displayModeStandalone: false, navigatorStandalone: false });
  const { button, morePanel, windowListeners } = harness;

  assert.equal(button.hidden, false);
  assert.equal(button.attributes['aria-label'], 'Show ImplicitEx Transfer Portal install instructions');
  assert.equal(button.title, 'Show install instructions');

  const promptCalls = [];
  const userChoice = Promise.resolve({ outcome: 'accepted' });
  windowListeners.beforeinstallprompt({
    preventDefault() {
      promptCalls.push('preventDefault');
    },
    prompt() {
      promptCalls.push('prompt');
    },
    userChoice,
  });

  assert.equal(button.hidden, false);
  assert.equal(button.attributes['aria-label'], 'Install ImplicitEx Transfer Portal');
  assert.equal(button.title, 'Install ImplicitEx Transfer Portal');

  await button.click();
  await userChoice;
  assert.deepEqual(promptCalls, ['preventDefault', 'prompt']);
  assert.equal(morePanel.open, false);

  const fallbackHarness = await runPortalInstallScript({ displayModeStandalone: false, navigatorStandalone: false });
  fallbackHarness.button.click();
  assert.equal(fallbackHarness.morePanel.open, true);
  assert.equal(fallbackHarness.morePanel.scrollIntoViewCalls, 1);
});

test('portal install helper hides the control in standalone mode', async () => {
  const harness = await runPortalInstallScript({ displayModeStandalone: true, navigatorStandalone: true });
  assert.equal(harness.button.hidden, true);
});
