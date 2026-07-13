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
const appleTouchIconPath = path.join(publicRoot, 'assets/icons/apple-touch-icon-v2.png');
const icon192Path = path.join(publicRoot, 'assets/icons/icon-192-v2.png');
const icon512Path = path.join(publicRoot, 'assets/icons/icon-512-v2.png');

const BRANDMARK_PATH = 'M18.4,21.48L2.64,5.73l.43-.43,15.76,15.76s1.3,1.3,2.79-.19.21-2.77.21-2.77L6.05,2.32l.43-.43,4.07,4.07,1.38,1.38,1.28-1.28,4.28-4.28.43.43-5.56,5.56,2.98,2.98,5.56-5.56.43.43-5.56,5.56,1.28,1.28,5.56-5.56s1.28-1.28-.21-2.77-2.79-.19-2.79-.19l-4.26,4.26-.43-.43,4.26-4.26s1.3-1.3-.19-2.79-2.77-.21-2.77-.21l-4.28,4.28L7.75.62s-1.28-1.28-2.77.21-.19,2.79-.19,2.79l15.76,15.76-.43.43L4.37,4.05s-1.3-1.3-2.79.19-.11,2.87-.11,2.87l15.68,15.68-.43.43-5.56-5.56-5.54,5.54-.43-.43,5.54-5.54-2.98-2.98-5.54,5.54-.43-.43,5.54-5.54-1.28-1.28L.51,18.08s-1.28,1.28.21,2.77,2.79.19,2.79.19l4.23-4.23.43.43-4.23,4.23s-1.3,1.3.19,2.79,2.77.21,2.77.21l4.26-4.26,4.28,4.28s1.28,1.28,2.77-.21.19-2.79.19-2.79Z';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function canonicalIconSvg(size) {
  const markScale = 0.73;
  const markSize = size * markScale;
  const inset = (size - markSize) / 2;
  const scale = markSize / 25;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">
      <rect width="${size}" height="${size}" fill="#000000"/>
      <g transform="translate(${inset} ${inset}) scale(${scale})">
        <path d="${BRANDMARK_PATH}" fill="#ffffff"/>
      </g>
    </svg>
  `;
}

async function renderCanonicalRaw(size) {
  return sharp(Buffer.from(canonicalIconSvg(size))).raw().toBuffer({ resolveWithObject: true });
}

function createElement(initial = {}) {
  const listeners = {};
  return {
    hidden: !!initial.hidden,
    title: initial.title || '',
    textContent: initial.textContent || '',
    innerHTML: initial.innerHTML || '',
    attributes: { ...(initial.attributes || {}) },
    listeners,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'title') {
        this.title = String(value);
      }
      if (name === 'aria-expanded' && initial.ariaExpanded !== undefined) {
        this.ariaExpanded = String(value);
      }
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    click() {
      if (typeof listeners.click === 'function') {
        return listeners.click({
          preventDefault() {},
        });
      }
      return undefined;
    },
  };
}

function createDomHarness(options = {}) {
  const promotion = createElement({ hidden: !!options.standalone || !!options.displayModeStandalone });
  const action = createElement({ textContent: 'Install ImplicitEx', title: 'Show installation instructions' });
  const help = createElement({ textContent: 'How installation works', attributes: { 'aria-expanded': 'false' } });
  const status = createElement({ hidden: !!options.standalone || !!options.displayModeStandalone });
  const instructions = createElement({ hidden: true });
  const windowListeners = {};
  const documentListeners = {};

  const context = {
    console,
    Promise,
    window: {
      navigator: {
        standalone: !!options.standalone,
        userAgent: options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        platform: options.platform || 'MacIntel',
        maxTouchPoints: options.maxTouchPoints === undefined ? 0 : options.maxTouchPoints,
      },
      matchMedia(query) {
        return {
          matches: query === '(display-mode: standalone)' ? !!options.displayModeStandalone : false,
        };
      },
      addEventListener(type, handler) {
        windowListeners[type] = handler;
      },
    },
    document: {
      getElementById(id) {
        if (id === 'portalInstallPromotion') return promotion;
        if (id === 'portalInstallAction') return action;
        if (id === 'portalInstallHelp') return help;
        if (id === 'portalInstallStatus') return status;
        if (id === 'portalInstallInstructions') return instructions;
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

  return { context, promotion, action, help, status, instructions, windowListeners, documentListeners };
}

async function runInstallScript(options = {}) {
  const harness = createDomHarness(options);
  vm.runInNewContext(read(portalInstallPath), harness.context, { filename: portalInstallPath });

  if (typeof harness.documentListeners.DOMContentLoaded === 'function') {
    harness.documentListeners.DOMContentLoaded();
  }

  return harness;
}

async function assertIconMatchesCanonical(filePath, size) {
  const actual = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const expected = await renderCanonicalRaw(size);

  assert.equal(actual.info.width, size);
  assert.equal(actual.info.height, size);
  assert.equal(actual.info.channels, 4);
  assert.deepEqual(actual.data, expected.data);

  const sample = (x, y) => {
    const i = (y * actual.info.width + x) * actual.info.channels;
    return Array.from(actual.data.slice(i, i + actual.info.channels));
  };

  assert.deepEqual(sample(0, 0), [0, 0, 0, 255]);
  assert.deepEqual(sample(size - 1, 0), [0, 0, 0, 255]);
  assert.deepEqual(sample(0, size - 1), [0, 0, 0, 255]);
  assert.deepEqual(sample(size - 1, size - 1), [0, 0, 0, 255]);

  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const r = actual.data[i];
      const g = actual.data[i + 1];
      const b = actual.data[i + 2];
      const a = actual.data[i + 3];

      if (r === 0 && g === 0 && b === 0 && a === 255) {
        continue;
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const widthRatio = (maxX - minX + 1) / size;
  const heightRatio = (maxY - minY + 1) / size;

  assert.ok(widthRatio >= 0.67 && widthRatio <= 0.70, `unexpected icon width ratio: ${widthRatio}`);
  assert.ok(heightRatio >= 0.72 && heightRatio <= 0.75, `unexpected icon height ratio: ${heightRatio}`);
}

test('portal shell references the install promotion and versioned icons', () => {
  const html = read(portalIndexPath);
  const installScript = read(portalInstallPath);

  assert.match(html, /<link rel="manifest" href="\/portal\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/icons\/apple-touch-icon-v2\.png">/);
  assert.match(html, /<script defer src="js\/portal-install\.js"><\/script>/);
  assert.match(html, /<section class="portal-install-promo" id="portalInstallPromotion"/);
  assert.match(html, /id="portalInstallPromotionIcon"/);
  assert.match(html, /id="portalInstallAction"/);
  assert.match(html, /id="portalInstallHelp"/);
  assert.match(html, /id="portalInstallInstructions"/);
  assert.match(html, /id="portalInstallStatus"/);
  assert.match(html, /Install ImplicitEx/);
  assert.match(html, /How installation works/);
  assert.ok(html.indexOf('portalInstallPromotion') < html.indexOf('ccIntake'));
  assert.ok(html.indexOf('portalInstallPromotion') < html.indexOf('portalFooter'));
  assert.equal((html.match(/portalInstallAction/g) || []).length, 1);
  assert.equal((html.match(/portalInstallHelp/g) || []).length, 1);
  assert.equal((html.match(/portalFooterMore/g) || []).length, 0);
  assert.equal((html.match(/portalInstallBtn/g) || []).length, 0);
  assert.doesNotMatch(html, /Share, then Add to Home Screen/);
  assert.doesNotMatch(html, /Desktop and Android browsers may show an Install prompt/);
  assert.doesNotMatch(html, /data-portal-(?:primary|contextual|global)-surface=.*portalInstallPromotion/);
  assert.doesNotMatch(installScript, /serviceWorker|navigator\.serviceWorker|register\s*\(/);
});

test('portal manifest points to the versioned install artwork', () => {
  const manifest = JSON.parse(read(portalManifestPath));

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'ImplicitEx Transfer Portal');
  assert.equal(manifest.short_name, 'ImplicitEx');
  assert.match(manifest.description, /^Installable ImplicitEx transfer portal/);
  assert.equal(Array.isArray(manifest.icons), true);
  assert.equal(manifest.icons.length, 2);
  assert.deepEqual(manifest.icons.map((icon) => icon.src), [
    '/assets/icons/icon-192-v2.png',
    '/assets/icons/icon-512-v2.png',
  ]);
  for (const icon of manifest.icons) {
    assert.equal(icon.purpose, 'any');
  }
});

test('versioned portal icons match the canonical centered artwork', async () => {
  await assertIconMatchesCanonical(appleTouchIconPath, 180);
  await assertIconMatchesCanonical(icon192Path, 192);
  await assertIconMatchesCanonical(icon512Path, 512);
});

test('portal install promotion handles prompt, fallback guidance, and standalone hiding', async () => {
  const harness = await runInstallScript({ displayModeStandalone: false, standalone: false });
  const { action, help, promotion, status, instructions, windowListeners } = harness;

  assert.equal(promotion.hidden, false);
  assert.equal(status.hidden, false);
  assert.equal(action.textContent, 'Install ImplicitEx');
  assert.equal(action.title, 'Show installation instructions');
  assert.equal(action.attributes['aria-label'], 'Show installation instructions');
  assert.equal(help.attributes['aria-expanded'], 'false');
  assert.match(status.textContent, /browser’s install icon or menu|browser.*installation menu/i);

  action.click();
  assert.equal(instructions.hidden, false);
  assert.match(instructions.innerHTML, /Use your browser&rsquo;s install icon or browser menu/i);
  assert.equal(help.attributes['aria-expanded'], 'true');

  help.click();
  assert.equal(instructions.hidden, true);
  assert.equal(help.attributes['aria-expanded'], 'false');

  const userChoiceAccepted = Promise.resolve({ outcome: 'accepted' });
  const promptCalls = [];
  windowListeners.beforeinstallprompt({
    preventDefault() {
      promptCalls.push('preventDefault');
    },
    prompt() {
      promptCalls.push('prompt');
    },
    userChoice: userChoiceAccepted,
  });

  assert.equal(action.title, 'Install ImplicitEx');
  assert.equal(action.attributes['aria-label'], 'Install ImplicitEx');

  await action.click();
  await userChoiceAccepted;
  await Promise.resolve();

  assert.deepEqual(promptCalls, ['preventDefault', 'prompt']);
  assert.equal(promotion.hidden, true);
  assert.equal(status.hidden, true);
  assert.equal(instructions.hidden, true);

  const dismissedHarness = await runInstallScript({ displayModeStandalone: false, standalone: false });
  const dismissedPromptCalls = [];
  const userChoiceDismissed = Promise.resolve({ outcome: 'dismissed' });
  dismissedHarness.windowListeners.beforeinstallprompt({
    preventDefault() {
      dismissedPromptCalls.push('preventDefault');
    },
    prompt() {
      dismissedPromptCalls.push('prompt');
    },
    userChoice: userChoiceDismissed,
  });

  await dismissedHarness.action.click();
  await userChoiceDismissed;
  await Promise.resolve();

  assert.deepEqual(dismissedPromptCalls, ['preventDefault', 'prompt']);
  assert.equal(dismissedHarness.promotion.hidden, false);
  assert.equal(dismissedHarness.status.hidden, false);

  const iosHarness = await runInstallScript({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
  });

  assert.match(iosHarness.status.textContent, /Safari installs this portal through Share and Add to Home Screen\./);
  iosHarness.action.click();
  assert.match(iosHarness.instructions.innerHTML, /Add ImplicitEx to your iPhone or iPad/);
  assert.match(iosHarness.instructions.innerHTML, /View More when Add to Home Screen is not immediately visible/);
  assert.match(iosHarness.instructions.innerHTML, /Leave Open as Web App enabled/);

  const iosNonSafariHarness = await runInstallScript({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
  });

  assert.match(iosNonSafariHarness.status.textContent, /Open this page in Safari to install ImplicitEx as a Home Screen web app\./);
  iosNonSafariHarness.action.click();
  assert.match(iosNonSafariHarness.instructions.innerHTML, /Open this page in Safari to add ImplicitEx as a Home Screen web app\./);

  const standaloneHarness = await runInstallScript({ displayModeStandalone: true, standalone: true });
  assert.equal(standaloneHarness.promotion.hidden, true);
  assert.equal(standaloneHarness.status.hidden, true);
  assert.equal(standaloneHarness.instructions.hidden, true);
});

test('portal install promotion hides after appinstalled and stays out of the service-worker path', async () => {
  const harness = await runInstallScript({ displayModeStandalone: false, standalone: false });

  assert.equal(harness.promotion.hidden, false);

  harness.windowListeners.appinstalled();

  assert.equal(harness.promotion.hidden, true);
  assert.equal(harness.status.hidden, true);
  assert.equal(harness.instructions.hidden, true);

  const installScript = read(portalInstallPath);
  assert.doesNotMatch(installScript, /serviceWorker|navigator\.serviceWorker|register\s*\(/);
});
