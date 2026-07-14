const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const displayScriptPath = path.join(repoRoot, 'app-web/frontend/public/js/portal-display.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function createElement(initial = {}) {
  const attributes = Object.assign(Object.create(null), initial.attributes || {});
  const listeners = Object.create(null);

  return {
    hidden: !!initial.hidden,
    disabled: !!initial.disabled,
    title: initial.title || '',
    ariaLabel: initial.ariaLabel || '',
    textContent: initial.textContent || '',
    attributes,
    listeners,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
      if (name === 'title') this.title = String(value);
      if (name === 'aria-label') this.ariaLabel = String(value);
      if (name === 'aria-expanded') this.ariaExpanded = String(value);
      if (name === 'aria-pressed') this.ariaPressed = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    click() {
      if (typeof listeners.click === 'function') {
        listeners.click({
          preventDefault() {},
          stopPropagation() {},
          target: this,
        });
      }
    },
    change() {
      if (typeof listeners.change === 'function') {
        listeners.change({
          preventDefault() {},
          stopPropagation() {},
          target: this,
        });
      }
    },
  };
}

function createHarness(options = {}) {
  const listeners = {
    document: Object.create(null),
    window: Object.create(null),
  };

  const state = {
    fullscreenElement: null,
    collapsed: !!options.collapsed,
    hidden: !!options.hidden,
    fullscreenRequests: 0,
    fullscreenExits: 0,
    fullscreenTarget: null,
    wakeLockRequests: 0,
    wakeLockReleases: 0,
    wakeLockLastSentinel: null,
  };

  const modules = createElement({
    attributes: { class: 'transfer-portal' },
  });
  modules.classList = {
    contains(token) {
      return token === 'is-minimized' ? state.collapsed : false;
    },
  };
  if (options.fullscreenSupported !== false) {
    modules.requestFullscreen = function () {
      state.fullscreenRequests += 1;
      state.fullscreenTarget = modules;
      state.fullscreenElement = modules;
      document.fullscreenElement = modules;
      emit('document', 'fullscreenchange');
      return Promise.resolve();
    };
  }

  const fullscreenBtn = createElement({
    title: 'Enter fullscreen',
    attributes: {
      'aria-label': 'Enter fullscreen',
      'aria-pressed': 'false',
      'data-fullscreen-active': 'false',
    },
  });
  const fullscreenEnterGlyph = createElement();
  const fullscreenExitGlyph = createElement();
  const displayMenu = createElement();
  const displayMenuToggle = createElement({
    title: 'Display settings',
    attributes: {
      'aria-label': 'Display settings',
      'aria-expanded': 'false',
      'aria-controls': 'portalDisplayPanel',
    },
  });
  const displayPanel = createElement({ hidden: true });
  const wakeLockToggle = createElement();
  const wakeLockState = createElement({ textContent: 'Off' });
  const wakeLockStatus = createElement({ hidden: true });
  const minimizeBtn = createElement();

  const wakeLockFactory = options.wakeLockSupported === false
    ? null
    : {
        request() {
          state.wakeLockRequests += 1;
          if (options.wakeLockReject) {
            return Promise.reject(new Error('wake lock rejected'));
          }
          const sentinel = {
            released: false,
            addEventListener(type, handler) {
              if (type === 'release') {
                this.onRelease = handler;
              }
            },
            release() {
              state.wakeLockReleases += 1;
              this.released = true;
              if (typeof this.onRelease === 'function') {
                this.onRelease();
              }
              return Promise.resolve();
            },
          };
          state.wakeLockLastSentinel = sentinel;
          return Promise.resolve(sentinel);
        },
      };

  const document = {
    hidden: state.hidden,
    fullscreenEnabled: options.fullscreenSupported !== false,
    documentElement: createElement({ tagName: 'html' }),
    fullscreenElement: state.fullscreenElement,
    getElementById(id) {
      if (id === 'portalFullscreenAction') return fullscreenBtn;
      if (id === 'portalDisplayMenu') return displayMenu;
      if (id === 'portalDisplayMenuToggle') return displayMenuToggle;
      if (id === 'portalDisplayPanel') return displayPanel;
      if (id === 'portalWakeLockToggle') return wakeLockToggle;
      if (id === 'portalWakeLockState') return wakeLockState;
      if (id === 'portalWakeLockStatus') return wakeLockStatus;
      if (id === 'modules') return modules;
      if (id === 'modulesMinimize') return minimizeBtn;
      return null;
    },
    querySelector(selector) {
      if (selector === '.portal-fullscreen-glyph--enter') return fullscreenEnterGlyph;
      if (selector === '.portal-fullscreen-glyph--exit') return fullscreenExitGlyph;
      return null;
    },
    addEventListener(type, handler) {
      listeners.document[type] = handler;
    },
    exitFullscreen() {
      state.fullscreenExits += 1;
      state.fullscreenElement = null;
      document.fullscreenElement = null;
      emit('document', 'fullscreenchange');
      return Promise.resolve();
    },
  };

  const window = {
    navigator: {
      wakeLock: wakeLockFactory,
    },
    addEventListener(type, handler) {
      listeners.window[type] = handler;
    },
    requestAnimationFrame(callback) {
      callback();
    },
  };

  function emit(scope, type, event = {}) {
    const handler = listeners[scope][type];
    if (typeof handler === 'function') {
      handler(Object.assign({
        preventDefault() {},
        stopPropagation() {},
        target: scope === 'document' ? document : window,
        key: undefined,
      }, event));
    }
  }

  const context = {
    console,
    Promise,
    window,
    document,
    navigator: window.navigator,
  };

  context.window.window = window;
  context.window.document = document;
  context.window.navigator = window.navigator;
  context.window.Promise = Promise;
  context.window.console = console;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;
  context.window.requestAnimationFrame = window.requestAnimationFrame;
  context.document.defaultView = window;

  return {
    context,
    state,
    elements: {
      fullscreenBtn,
      fullscreenEnterGlyph,
      fullscreenExitGlyph,
      displayMenu,
      displayMenuToggle,
      displayPanel,
      wakeLockToggle,
      wakeLockState,
      wakeLockStatus,
      modules,
      minimizeBtn,
    },
    listeners,
    emit,
  };
}

async function loadHarness(options = {}) {
  const harness = createHarness(options);
  vm.runInNewContext(read(displayScriptPath), harness.context, { filename: displayScriptPath });
  return harness;
}

async function flushPromises(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

test('fullscreen toggles state, labels, and Escape-driven exit', async () => {
  const harness = await loadHarness({ fullscreenSupported: true });
  const { fullscreenBtn, fullscreenEnterGlyph, fullscreenExitGlyph, displayMenuToggle, displayPanel } = harness.elements;
  const { state } = harness;

  assert.equal(fullscreenBtn.disabled, false);
  assert.equal(fullscreenBtn.attributes['aria-label'], 'Enter fullscreen');
  assert.equal(fullscreenBtn.attributes['aria-pressed'], 'false');
  assert.equal(fullscreenBtn.attributes['data-fullscreen-active'], 'false');

  displayMenuToggle.click();
  assert.equal(displayPanel.hidden, false);
  assert.equal(displayMenuToggle.attributes['aria-expanded'], 'true');

  fullscreenBtn.click();
  assert.equal(state.fullscreenRequests, 1);
  assert.equal(state.fullscreenTarget, harness.elements.modules);
  assert.equal(harness.context.document.fullscreenElement, harness.elements.modules);
  assert.equal(fullscreenBtn.attributes['aria-label'], 'Return to browser view');
  assert.equal(fullscreenBtn.attributes['aria-pressed'], 'true');
  assert.equal(fullscreenBtn.attributes['data-fullscreen-active'], 'true');

  harness.emit('document', 'keydown', { key: 'Escape' });
  assert.equal(displayPanel.hidden, true);
  assert.equal(displayMenuToggle.attributes['aria-expanded'], 'false');
  assert.equal(harness.context.document.fullscreenElement, harness.elements.modules);
  assert.equal(fullscreenBtn.attributes['aria-label'], 'Return to browser view');
  assert.equal(fullscreenBtn.attributes['aria-pressed'], 'true');

  fullscreenBtn.click();
  assert.equal(state.fullscreenExits, 1);
  assert.equal(harness.context.document.fullscreenElement, null);
  assert.equal(fullscreenBtn.attributes['aria-label'], 'Enter fullscreen');
  assert.equal(fullscreenBtn.attributes['aria-pressed'], 'false');
  assert.equal(fullscreenBtn.attributes['data-fullscreen-active'], 'false');
});

test('fullscreen unsupported browsers present the control as unavailable', async () => {
  const harness = await loadHarness({ fullscreenSupported: false });
  const { fullscreenBtn, fullscreenEnterGlyph, fullscreenExitGlyph } = harness.elements;
  const css = read(path.join(repoRoot, 'app-web/frontend/public/css/main.css'));

  assert.equal(fullscreenBtn.disabled, true);
  assert.equal(fullscreenBtn.attributes['aria-disabled'], 'true');
  assert.equal(fullscreenBtn.attributes['aria-label'], 'Fullscreen unavailable on this device');
  assert.equal(fullscreenBtn.attributes['title'], 'Fullscreen unavailable on this device');
  assert.equal(fullscreenBtn.attributes['data-fullscreen-active'], 'false');
  assert.match(css, /\.transfer-portal:fullscreen/);
});

test('wake lock toggle stays session-only and reacquires after visibility returns', async () => {
  const harness = await loadHarness({ fullscreenSupported: true, wakeLockSupported: true });
  const { wakeLockToggle, wakeLockState, wakeLockStatus, minimizeBtn } = harness.elements;
  const { state, listeners } = harness;

  assert.equal(wakeLockToggle.checked, false);
  assert.equal(wakeLockToggle.disabled, false);
  assert.equal(wakeLockState.textContent, 'Off');
  assert.equal(wakeLockStatus.hidden, true);

  wakeLockToggle.checked = true;
  wakeLockToggle.change();
  await flushPromises();

  assert.equal(state.wakeLockRequests, 1);
  assert.equal(wakeLockToggle.checked, true);
  assert.equal(wakeLockState.textContent, 'On');
  assert.equal(wakeLockStatus.hidden, false);
  assert.match(wakeLockStatus.textContent, /kept awake/);

  harness.context.document.hidden = true;
  harness.emit('document', 'visibilitychange');
  await flushPromises();

  assert.equal(state.wakeLockReleases >= 1, true);
  assert.equal(wakeLockToggle.checked, true);
  assert.equal(wakeLockState.textContent, 'Paused');
  assert.equal(wakeLockStatus.hidden, false);
  assert.match(wakeLockStatus.textContent, /paused until the portal is visible again/i);

  harness.context.document.hidden = false;
  harness.emit('document', 'visibilitychange');
  await flushPromises();

  assert.equal(state.wakeLockRequests, 2);
  assert.equal(wakeLockToggle.checked, true);
  assert.equal(wakeLockState.textContent, 'On');
  assert.equal(wakeLockStatus.hidden, false);

  harness.state.collapsed = true;
  minimizeBtn.click();
  await flushPromises();
  assert.equal(state.wakeLockReleases >= 2, true);
  assert.equal(wakeLockToggle.checked, true);
  assert.equal(wakeLockState.textContent, 'Paused');
  assert.equal(wakeLockStatus.hidden, false);
  assert.match(wakeLockStatus.textContent, /paused until the portal is visible again/i);

  harness.state.collapsed = false;
  minimizeBtn.click();
  await flushPromises();
  assert.equal(state.wakeLockRequests, 3);
  assert.equal(wakeLockToggle.checked, true);
  assert.equal(wakeLockState.textContent, 'On');
});

test('wake lock unavailable and rejected requests are handled explicitly', async () => {
  const unsupported = await loadHarness({ wakeLockSupported: false });
  unsupported.elements.wakeLockToggle.checked = true;
  unsupported.elements.wakeLockToggle.change();

  assert.equal(unsupported.elements.wakeLockToggle.disabled, true);
  assert.equal(unsupported.elements.wakeLockState.textContent, 'Unavailable');
  assert.equal(unsupported.elements.wakeLockStatus.hidden, false);
  assert.match(unsupported.elements.wakeLockStatus.textContent, /Unavailable on this device/);
  assert.equal(unsupported.state.wakeLockRequests, 0);

  const rejected = await loadHarness({ wakeLockSupported: true, wakeLockReject: true });
  rejected.elements.wakeLockToggle.checked = true;
  rejected.elements.wakeLockToggle.change();
  await flushPromises();

  assert.equal(rejected.elements.wakeLockToggle.checked, false);
  assert.equal(rejected.elements.wakeLockToggle.disabled, false);
  assert.equal(rejected.elements.wakeLockState.textContent, 'Could not activate');
  assert.equal(rejected.elements.wakeLockStatus.hidden, false);
  assert.match(rejected.elements.wakeLockStatus.textContent, /Could not keep screen awake/);
  assert.equal(rejected.state.wakeLockRequests, 1);

  rejected.context.window.navigator.wakeLock.request = function () {
    rejected.state.wakeLockRequests += 1;
    return Promise.resolve({
      addEventListener() {},
      release() {
        rejected.state.wakeLockReleases += 1;
        return Promise.resolve();
      },
    });
  };

  rejected.elements.wakeLockToggle.checked = true;
  rejected.elements.wakeLockToggle.change();
  await flushPromises();

  assert.equal(rejected.elements.wakeLockToggle.disabled, false);
  assert.equal(rejected.elements.wakeLockState.textContent, 'On');
  assert.equal(rejected.elements.wakeLockStatus.hidden, false);
  assert.match(rejected.elements.wakeLockStatus.textContent, /kept awake/i);
  assert.equal(rejected.state.wakeLockRequests, 2);
});
