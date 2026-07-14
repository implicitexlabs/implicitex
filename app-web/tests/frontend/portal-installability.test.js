const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const sharp = require('sharp');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');
const installPagePath = path.join(publicRoot, 'install.html');
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
    href: initial.href || '',
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
      if (name === 'href') {
        this.href = String(value);
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

function createHarness(options = {}) {
  const guide = !!options.guide;
  const promotion = guide
    ? createElement({
        hidden: !!options.standalone || !!options.displayModeStandalone,
      })
    : null;
  const action = guide
    ? createElement({ textContent: 'Install on this device', title: 'Show installation instructions' })
    : createElement({ title: 'Install ImplicitEx', attributes: { 'aria-label': 'Install ImplicitEx' } });
  const help = guide
    ? createElement({ textContent: 'Show installation steps', attributes: { 'aria-expanded': 'false' } })
    : null;
  const status = guide
    ? createElement({ hidden: !!options.standalone || !!options.displayModeStandalone })
    : null;
  const instructions = guide
    ? createElement({ hidden: true })
    : null;
  const browserLabel = guide ? createElement({ textContent: '' }) : null;
  const actions = guide ? createElement({ hidden: false }) : null;
  const footerInstallLink = guide ? null : createElement({
    hidden: !!options.standalone || !!options.displayModeStandalone,
    href: '/install.html',
  });
  const locationCalls = [];
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
        brave: options.brave ? {} : undefined,
      },
      matchMedia(query) {
        return {
          matches: query === '(display-mode: standalone)' ? !!options.displayModeStandalone : false,
        };
      },
      addEventListener(type, handler) {
        windowListeners[type] = handler;
      },
      location: {
        assign(url) {
          locationCalls.push(url);
        },
      },
    },
    document: {
      getElementById(id) {
        if (id === 'portalInstallPromotion') return promotion;
        if (id === 'portalInstallAction') return action;
        if (id === 'portalInstallHelp') return help;
        if (id === 'portalInstallStatus') return status;
        if (id === 'portalInstallInstructions') return instructions;
        if (id === 'portalInstallBrowser') return browserLabel;
        if (id === 'portalInstallActions') return actions;
        if (id === 'portalFooterInstallLink') return footerInstallLink;
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

  return { context, promotion, action, help, status, instructions, browserLabel, actions, footerInstallLink, locationCalls, windowListeners, documentListeners };
}

async function runInstallScript(options = {}) {
  const harness = createHarness(options);
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

test('portal shell keeps the install icon quiet and restores the compact footer', () => {
  const html = read(portalIndexPath);
  const installScript = read(portalInstallPath);

  assert.match(html, /<link rel="manifest" href="\/portal\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/icons\/apple-touch-icon-v2\.png">/);
  assert.match(html, /<button class="portal-ctrl-btn portal-install-ctrl" id="portalInstallAction" type="button" aria-label="Install ImplicitEx" title="Install ImplicitEx">/);
  assert.doesNotMatch(html, /portal-header-sub portal-install-strip/);
  assert.doesNotMatch(html, /Add ImplicitEx to this device<\/a>/);
  assert.match(html, /<a class="portal-footer-install-link" id="portalFooterInstallLink" href="\/install\.html">Add ImplicitEx to a device<\/a>/);
  assert.match(html, /<details class="portal-footer-more" id="portalFooterMore">/);
  assert.match(html, /<summary>More<\/summary>/);
  assert.match(html, /id="portalInstallAction"/);
  assert.equal((html.match(/portalInstallAction/g) || []).length, 1);
  assert.equal((html.match(/portalInstallHelp/g) || []).length, 0);
  assert.equal((html.match(/portalInstallInstructions/g) || []).length, 0);
  assert.equal((html.match(/portalInstallStatus/g) || []).length, 0);
  assert.equal((html.match(/portalInstallPromotion/g) || []).length, 0);
  assert.equal((html.match(/portalFooterMore/g) || []).length, 1);
  assert.doesNotMatch(html, /Share, then Add to Home Screen/);
  assert.doesNotMatch(html, /Desktop and Android browsers may show an Install prompt/);
  assert.doesNotMatch(html, /data-portal-(?:primary|contextual|global)-surface=.*portalInstallPromotion/);
  assert.doesNotMatch(installScript, /serviceWorker|navigator\.serviceWorker|register\s*\(/);
});

test('install page carries the detailed install guide and versioned icons', () => {
  const html = read(installPagePath);

  assert.match(html, /<title>ImplicitEx — Install<\/title>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/icons\/apple-touch-icon-v2\.png">/);
  assert.match(html, /<section class="portal-install-promo" id="portalInstallPromotion"/);
  assert.match(html, /id="portalInstallPromotionIcon"/);
  assert.match(html, /id="portalInstallBrowser"/);
  assert.match(html, /id="portalInstallAction"/);
  assert.match(html, /id="portalInstallHelp"/);
  assert.match(html, /id="portalInstallInstructions"/);
  assert.match(html, /id="portalInstallStatus"/);
  assert.match(html, /id="portalInstallActions"/);
  assert.match(html, /Install ImplicitEx/);
  assert.match(html, /Show installation steps/);
  assert.match(html, /Back to Transfer Portal/);
  assert.match(html, /href="\/portal-index\.html"/);
  assert.doesNotMatch(html, /portal-install-kicker/);
  assert.doesNotMatch(html, /Back to portal<\/a>/);
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

test('portal shell stays quiet and install page shows browser-specific direction', async () => {
  const stripHarness = await runInstallScript({ displayModeStandalone: false, standalone: false });
  assert.equal(stripHarness.promotion, null);
  assert.equal(stripHarness.action.hidden, false);
  assert.equal(stripHarness.action.textContent, '');
  assert.equal(stripHarness.action.title, 'Install ImplicitEx');
  assert.equal(stripHarness.action.attributes['aria-label'], 'Install ImplicitEx');
  assert.equal(stripHarness.footerInstallLink.hidden, false);

  await stripHarness.action.click();
  assert.deepEqual(stripHarness.locationCalls, ['/install.html']);

  const standaloneStrip = await runInstallScript({ displayModeStandalone: true, standalone: true });
  assert.equal(standaloneStrip.promotion, null);
  assert.equal(standaloneStrip.action.hidden, true);
  assert.equal(standaloneStrip.footerInstallLink.hidden, true);

  const promptHarness = await runInstallScript({
    guide: true,
    displayModeStandalone: false,
    standalone: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/605.1.15',
  });
  const promptCalls = [];
  const promptChoice = Promise.resolve({ outcome: 'dismissed' });
  promptHarness.windowListeners.beforeinstallprompt({
    preventDefault() {
      promptCalls.push('preventDefault');
    },
    prompt() {
      promptCalls.push('prompt');
    },
    userChoice: promptChoice,
  });

  assert.equal(promptHarness.browserLabel.textContent, 'Install ready');
  assert.equal(promptHarness.status.hidden, false);
  assert.equal(promptHarness.status.textContent, 'Your browser can install ImplicitEx directly.');
  assert.equal(promptHarness.actions.hidden, false);
  assert.equal(promptHarness.action.hidden, false);
  assert.equal(promptHarness.action.textContent, 'Install on this device');
  assert.equal(promptHarness.action.title, 'Install on this device');
  assert.equal(promptHarness.action.attributes['aria-label'], 'Install on this device');
  assert.equal(promptHarness.help.hidden, false);
  assert.equal(promptHarness.help.textContent, 'Show installation steps');
  assert.equal(promptHarness.help.attributes['aria-expanded'], 'false');

  await promptHarness.action.click();
  await promptChoice;
  await Promise.resolve();

  assert.deepEqual(promptCalls, ['preventDefault', 'prompt']);
  assert.equal(promptHarness.browserLabel.textContent, 'Chrome · Desktop');
  assert.equal(promptHarness.actions.hidden, true);
  assert.equal(promptHarness.action.hidden, true);
  assert.equal(promptHarness.help.hidden, true);
  assert.equal(promptHarness.instructions.hidden, false);
  assert.match(promptHarness.instructions.innerHTML, /Open Chrome&rsquo;s main menu\./);
  assert.match(promptHarness.instructions.innerHTML, /Choose More, then Cast, save, and share\./);
  assert.match(promptHarness.instructions.innerHTML, /Choose Install page as app\./);
  assert.equal(promptHarness.status.textContent, 'Chrome can install ImplicitEx from More > Cast, save, and share > Install page as app.');

  const acceptedHarness = await runInstallScript({
    guide: true,
    displayModeStandalone: false,
    standalone: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/605.1.15',
  });
  const acceptedCalls = [];
  const acceptedChoice = Promise.resolve({ outcome: 'accepted' });
  acceptedHarness.windowListeners.beforeinstallprompt({
    preventDefault() {
      acceptedCalls.push('preventDefault');
    },
    prompt() {
      acceptedCalls.push('prompt');
    },
    userChoice: acceptedChoice,
  });

  await acceptedHarness.action.click();
  await acceptedChoice;
  await Promise.resolve();

  assert.deepEqual(acceptedCalls, ['preventDefault', 'prompt']);
  assert.equal(acceptedHarness.browserLabel.textContent, 'Installed · this device');
  assert.equal(acceptedHarness.status.textContent, 'ImplicitEx is installed on this device.');
  assert.equal(acceptedHarness.actions.hidden, false);
  assert.equal(acceptedHarness.action.textContent, 'Open Transfer Portal');
  assert.equal(acceptedHarness.action.title, 'Open Transfer Portal');
  assert.equal(acceptedHarness.action.attributes['aria-label'], 'Open Transfer Portal');
  assert.equal(acceptedHarness.help.hidden, true);
  assert.equal(acceptedHarness.instructions.hidden, true);

  const braveHarness = await runInstallScript({
    guide: true,
    displayModeStandalone: false,
    standalone: false,
    brave: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/605.1.15 Brave/126.1.0.0',
  });

  assert.equal(braveHarness.browserLabel.textContent, 'Brave · Desktop');
  assert.equal(braveHarness.actions.hidden, true);
  assert.equal(braveHarness.action.hidden, true);
  assert.equal(braveHarness.help.hidden, true);
  assert.equal(braveHarness.status.hidden, false);
  assert.equal(braveHarness.status.textContent, 'Brave can install ImplicitEx from Save and Share > Install ImplicitEx or the address-bar install icon.');
  assert.match(braveHarness.instructions.innerHTML, /Install on this computer/);
  assert.match(braveHarness.instructions.innerHTML, /Open Brave&rsquo;s main menu/);
  assert.match(braveHarness.instructions.innerHTML, /Choose Save and Share, then Install ImplicitEx\./);
  assert.match(braveHarness.instructions.innerHTML, /Other devices/);

  const chromeHarness = await runInstallScript({
    guide: true,
    displayModeStandalone: false,
    standalone: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/605.1.15',
  });

  assert.equal(chromeHarness.browserLabel.textContent, 'Chrome · Desktop');
  assert.equal(chromeHarness.actions.hidden, true);
  assert.equal(chromeHarness.action.hidden, true);
  assert.equal(chromeHarness.help.hidden, true);
  assert.equal(chromeHarness.status.textContent, 'Chrome can install ImplicitEx from More > Cast, save, and share > Install page as app.');
  assert.match(chromeHarness.instructions.innerHTML, /Open Chrome&rsquo;s main menu\./);
  assert.match(chromeHarness.instructions.innerHTML, /Choose More, then Cast, save, and share\./);
  assert.match(chromeHarness.instructions.innerHTML, /Choose Install page as app\./);

  const iosHarness = await runInstallScript({
    guide: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
  });

  assert.equal(iosHarness.browserLabel.textContent, 'Safari · iPhone or iPad');
  assert.equal(iosHarness.status.textContent, 'Safari installs this portal through Share and Add to Home Screen.');
  assert.equal(iosHarness.actions.hidden, true);
  assert.equal(iosHarness.action.hidden, true);
  assert.match(iosHarness.instructions.innerHTML, /Add ImplicitEx to your iPhone or iPad/);
  assert.match(iosHarness.instructions.innerHTML, /View More when Add to Home Screen is not immediately visible/);
  assert.match(iosHarness.instructions.innerHTML, /Leave Open as Web App enabled/);

  const androidHarness = await runInstallScript({
    guide: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/605.1.15',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
  });

  assert.equal(androidHarness.browserLabel.textContent, 'Chrome · Android');
  assert.equal(androidHarness.status.textContent, 'Chrome on Android can install ImplicitEx from More > Add to Home screen > Install.');
  assert.equal(androidHarness.actions.hidden, true);
  assert.equal(androidHarness.action.hidden, true);
  assert.match(androidHarness.instructions.innerHTML, /Install on this Android device/);
  assert.match(androidHarness.instructions.innerHTML, /Tap Chrome&rsquo;s menu, then Add to Home screen\./);
  assert.match(androidHarness.instructions.innerHTML, /Choose Install when Chrome shows the install prompt\./);

  const firefoxWindowsHarness = await runInstallScript({
    guide: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    platform: 'Win32',
    maxTouchPoints: 0,
  });

  assert.equal(firefoxWindowsHarness.browserLabel.textContent, 'Firefox · Windows');
  assert.equal(firefoxWindowsHarness.status.textContent, 'Firefox on Windows can install ImplicitEx from the address-bar web-app button.');
  assert.match(firefoxWindowsHarness.instructions.innerHTML, /Install on this Windows computer/);
  assert.match(firefoxWindowsHarness.instructions.innerHTML, /Use the web-app button in the address bar\./);

  const firefoxUnsupportedHarness = await runInstallScript({
    guide: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:127.0) Gecko/20100101 Firefox/127.0',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  });

  assert.equal(firefoxUnsupportedHarness.browserLabel.textContent, 'Firefox · macOS/Linux');
  assert.equal(firefoxUnsupportedHarness.status.textContent, 'Firefox web apps are available on Windows; on macOS or Linux, create a normal desktop shortcut if needed.');
  assert.match(firefoxUnsupportedHarness.instructions.innerHTML, /Firefox web apps are supported on Windows\./);
  assert.match(firefoxUnsupportedHarness.instructions.innerHTML, /create a normal desktop shortcut if you need one\./);

  const standaloneGuide = await runInstallScript({ guide: true, displayModeStandalone: true, standalone: true });
  assert.equal(standaloneGuide.browserLabel.textContent, 'Installed · this device');
  assert.equal(standaloneGuide.status.textContent, 'ImplicitEx is installed on this device.');
  assert.equal(standaloneGuide.actions.hidden, false);
  assert.equal(standaloneGuide.action.hidden, false);
  assert.equal(standaloneGuide.action.textContent, 'Open Transfer Portal');
  assert.equal(standaloneGuide.action.title, 'Open Transfer Portal');
  assert.equal(standaloneGuide.help.hidden, true);
  assert.equal(standaloneGuide.instructions.hidden, true);
  await standaloneGuide.action.click();
  assert.deepEqual(standaloneGuide.locationCalls, ['/portal-index.html']);

  const unsupportedHarness = await runInstallScript({
    guide: true,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
  });

  assert.equal(unsupportedHarness.browserLabel.textContent, 'Desktop browser');
  assert.equal(unsupportedHarness.actions.hidden, true);
  assert.equal(unsupportedHarness.action.hidden, true);
  assert.equal(unsupportedHarness.help.hidden, true);
  assert.equal(unsupportedHarness.status.textContent, 'This browser does not support automatic installation.');
  assert.match(unsupportedHarness.instructions.innerHTML, /This browser does not support automatic installation\./);
});

test('portal install guide hides after appinstalled and stays out of the service-worker path', async () => {
  const harness = await runInstallScript({ guide: true, displayModeStandalone: false, standalone: false });

  assert.equal(harness.promotion.hidden, false);

  harness.windowListeners.appinstalled();

  assert.equal(harness.promotion.hidden, false);
  assert.equal(harness.status.hidden, false);
  assert.equal(harness.action.hidden, false);
  assert.equal(harness.action.textContent, 'Open Transfer Portal');
  assert.equal(harness.instructions.hidden, true);
  assert.equal(harness.help.hidden, true);

  const installScript = read(portalInstallPath);
  assert.doesNotMatch(installScript, /serviceWorker|navigator\.serviceWorker|register\s*\(/);
});
