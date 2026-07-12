const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const stateModulePath = path.join(publicRoot, 'js/portal-view-state.js');
const projectionModulePath = path.join(publicRoot, 'js/portal-view-projection.js');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function defineThrowingGetter(target, name) {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    get() {
      throw new Error(`forbidden authority accessed: ${name}`);
    },
  });
}

function createElementSnapshot(element) {
  return {
    attributes: element.attributes,
    value: element.value,
    checked: element.checked,
    disabled: element.disabled,
    hidden: element.hidden,
    className: element.className,
    style: element.getAttribute('style'),
    expando: element.expando,
  };
}

function createFakeElement(id) {
  const attributes = {};
  const writeLog = [];
  return {
    id,
    value: 'preserve-value',
    checked: true,
    disabled: false,
    hidden: false,
    className: 'existing-class',
    expando: { keep: true },
    setAttribute(name, value) {
      const stringValue = String(value);
      writeLog.push({
        order: writeLog.length,
        name,
        value: stringValue,
      });
      attributes[name] = stringValue;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    },
    get attributes() {
      return Object.assign({}, attributes);
    },
    get writeLog() {
      return writeLog.slice();
    },
    clearWriteLog() {
      writeLog.length = 0;
    },
  };
}

function createDocumentHarness(options = {}) {
  const root = createFakeElement('modules');
  const fallbackRoot = createFakeElement('documentElement');
  const existingElements = [
    root,
    createFakeElement('txRecipient'),
    createFakeElement('txAmount'),
    createFakeElement('txConfirmAck'),
    createFakeElement('txBtn'),
    createFakeElement('verificationMod'),
    createFakeElement('receiptHistory'),
  ];
  const byId = new Map(existingElements.map((element) => [element.id, element]));

  const document = {
    documentElement: fallbackRoot,
    getElementById(id) {
      if (options.rootMissing && id === 'modules') return null;
      return byId.get(id) || null;
    },
  };

  return {
    document,
    root,
    fallbackRoot,
    existingElements,
  };
}

function createContext(options = {}) {
  const harness = createDocumentHarness(options);
  const window = {};
  const context = {
    window,
    document: harness.document,
  };

  defineThrowingGetter(context, 'localStorage');
  defineThrowingGetter(context, 'sessionStorage');
  defineThrowingGetter(context, 'indexedDB');
  defineThrowingGetter(context, 'fetch');
  defineThrowingGetter(context, 'XMLHttpRequest');
  defineThrowingGetter(context, 'location');
  defineThrowingGetter(context, 'history');
  defineThrowingGetter(context, 'IX_EXECUTION');
  defineThrowingGetter(context, 'IX_COIN_CARD_VERIFICATION');
  defineThrowingGetter(context, 'IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION');
  defineThrowingGetter(context, 'IX_COIN_CARD_LIFECYCLE_RESOLUTION');

  defineThrowingGetter(window, 'localStorage');
  defineThrowingGetter(window, 'sessionStorage');
  defineThrowingGetter(window, 'indexedDB');
  defineThrowingGetter(window, 'location');
  defineThrowingGetter(window, 'history');
  defineThrowingGetter(window, 'IX_EXECUTION');
  defineThrowingGetter(window, 'IX_COIN_CARD_VERIFICATION');
  defineThrowingGetter(window, 'IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION');
  defineThrowingGetter(window, 'IX_COIN_CARD_LIFECYCLE_RESOLUTION');

  return {
    context,
    harness,
  };
}

function loadStateModule(context) {
  vm.runInNewContext(read(stateModulePath), context, { filename: stateModulePath });
}

function loadProjectionModule(context) {
  vm.runInNewContext(read(projectionModulePath), context, { filename: projectionModulePath });
}

function loadProjection(options = {}) {
  const { context, harness } = createContext(options);

  if (options.malformedStateAuthority) {
    context.window.IX_PORTAL_VIEW_STATE = {};
  } else if (!options.missingStateAuthority) {
    loadStateModule(context);
  }

  const beforeWindowKeys = Reflect.ownKeys(context.window);
  const beforeSnapshots = new Map(
    harness.existingElements.map((element) => [element.id, createElementSnapshot(element)])
  );

  loadProjectionModule(context);

  return {
    api: context.window.IX_PORTAL_VIEW_PROJECTION,
    viewStateApi: context.window.IX_PORTAL_VIEW_STATE,
    context,
    harness,
    beforeWindowKeys,
    beforeSnapshots,
  };
}

function assertOnlyProjectionMutatedRootMarkers(harness, beforeSnapshots) {
  const allowedRootMarkers = new Set([
    'data-portal-primary-destination',
    'data-portal-contextual-layer',
  ]);

  for (const element of harness.existingElements) {
    const before = beforeSnapshots.get(element.id);
    const after = createElementSnapshot(element);

    assert.equal(after.value, before.value, `${element.id} value changed`);
    assert.equal(after.checked, before.checked, `${element.id} checked state changed`);
    assert.equal(after.disabled, before.disabled, `${element.id} disabled state changed`);
    assert.equal(after.hidden, before.hidden, `${element.id} hidden state changed`);
    assert.equal(after.className, before.className, `${element.id} className changed`);
    assert.equal(after.style, before.style, `${element.id} inline style changed`);
    assert.deepEqual(after.expando, before.expando, `${element.id} expando changed`);

    if (element === harness.root) {
      const changed = new Set([
        ...Object.keys(before.attributes),
        ...Object.keys(after.attributes),
      ].filter((name) => before.attributes[name] !== after.attributes[name]));

      for (const name of changed) {
        assert.equal(
          allowedRootMarkers.has(name),
          true,
          `unexpected root attribute changed: ${name}`
        );
      }
    } else {
      assert.deepEqual(after.attributes, before.attributes, `${element.id} attributes changed`);
    }
  }
}

function assertWriteLog(element, expected) {
  assert.deepEqual(
    element.writeLog.map(({ name, value }) => ({ name, value })),
    expected
  );
}

test('default projection is Transfer plus NONE on the portal root', () => {
  const { api, harness } = loadProjection();

  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'TRANSFER');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'NONE');
  assertWriteLog(harness.root, [
    { name: 'data-portal-primary-destination', value: 'TRANSFER' },
    { name: 'data-portal-contextual-layer', value: 'NONE' },
  ]);
  assert.equal(api.getState().primaryDestination, 'TRANSFER');
  assert.equal(api.getState().contextualLayer, null);
});

test('primary transitions update only the primary marker', () => {
  const { api, harness } = loadProjection();

  api.openContextualLayer('SYSTEM');
  harness.root.clearWriteLog();
  api.setPrimaryDestination('RECIPIENTS');

  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'RECIPIENTS');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'SYSTEM');
  assertWriteLog(harness.root, [
    { name: 'data-portal-primary-destination', value: 'RECIPIENTS' },
  ]);

  harness.root.clearWriteLog();
  api.setPrimaryDestination('ACTIVITY');
  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'ACTIVITY');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'SYSTEM');
  assertWriteLog(harness.root, [
    { name: 'data-portal-primary-destination', value: 'ACTIVITY' },
  ]);
});

test('contextual transitions update only the contextual marker', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  harness.root.clearWriteLog();
  api.openContextualLayer('VERIFICATION');

  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'ACTIVITY');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'VERIFICATION');
  assertWriteLog(harness.root, [
    { name: 'data-portal-contextual-layer', value: 'VERIFICATION' },
  ]);

  harness.root.clearWriteLog();
  api.openContextualLayer('SYSTEM');
  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'ACTIVITY');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'SYSTEM');
  assertWriteLog(harness.root, [
    { name: 'data-portal-contextual-layer', value: 'SYSTEM' },
  ]);
});

test('closing contextual layer preserves the primary destination', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('RECIPIENTS');
  api.openContextualLayer('VERIFICATION');
  harness.root.clearWriteLog();
  api.closeContextualLayer();

  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'RECIPIENTS');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'NONE');
  assertWriteLog(harness.root, [
    { name: 'data-portal-contextual-layer', value: 'NONE' },
  ]);
});

test('idempotent transitions write no markers', () => {
  const { api, harness } = loadProjection();

  harness.root.clearWriteLog();
  api.setPrimaryDestination('TRANSFER');
  assertWriteLog(harness.root, []);

  api.openContextualLayer('SYSTEM');
  harness.root.clearWriteLog();
  api.openContextualLayer('SYSTEM');
  assertWriteLog(harness.root, []);
});

test('projectCurrentState repairs only drifted markers', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  api.openContextualLayer('SYSTEM');
  harness.root.clearWriteLog();
  harness.root.setAttribute('data-portal-contextual-layer', 'DRIFTED');
  harness.root.clearWriteLog();

  api.projectCurrentState();
  assertWriteLog(harness.root, [
    { name: 'data-portal-contextual-layer', value: 'SYSTEM' },
  ]);
});

test('harness uses IX_PORTAL_VIEW_STATE transition authority', () => {
  const { context, harness } = createContext();
  const calls = [];

  context.window.IX_PORTAL_VIEW_STATE = Object.freeze({
    createDefaultState() {
      calls.push('createDefaultState');
      return Object.freeze({ primaryDestination: 'TRANSFER', contextualLayer: null });
    },
    normalizeState(state) {
      calls.push('normalizeState');
      return Object.freeze({
        primaryDestination: state.primaryDestination,
        contextualLayer: state.contextualLayer,
      });
    },
    setPrimaryDestination(state, primaryDestination) {
      calls.push(['setPrimaryDestination', primaryDestination]);
      return Object.freeze({
        primaryDestination,
        contextualLayer: state.contextualLayer,
      });
    },
    openContextualLayer(state, contextualLayer) {
      calls.push(['openContextualLayer', contextualLayer]);
      return Object.freeze({
        primaryDestination: state.primaryDestination,
        contextualLayer,
      });
    },
    closeContextualLayer(state) {
      calls.push('closeContextualLayer');
      return Object.freeze({
        primaryDestination: state.primaryDestination,
        contextualLayer: null,
      });
    },
  });

  loadProjectionModule(context);
  context.window.IX_PORTAL_VIEW_PROJECTION.setPrimaryDestination('ACTIVITY');
  context.window.IX_PORTAL_VIEW_PROJECTION.openContextualLayer('SYSTEM');
  context.window.IX_PORTAL_VIEW_PROJECTION.closeContextualLayer();

  assert.deepEqual(calls, [
    'createDefaultState',
    'normalizeState',
    ['setPrimaryDestination', 'ACTIVITY'],
    'normalizeState',
    ['openContextualLayer', 'SYSTEM'],
    'normalizeState',
    'closeContextualLayer',
    'normalizeState',
  ]);
  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'ACTIVITY');
  assert.equal(harness.root.getAttribute('data-portal-contextual-layer'), 'NONE');
});

test('missing or malformed state authority fails before document mutation', () => {
  for (const options of [
    { missingStateAuthority: true },
    { malformedStateAuthority: true },
  ]) {
    const { context, harness } = createContext(options);
    if (options.malformedStateAuthority) {
      context.window.IX_PORTAL_VIEW_STATE = {};
    }

    assert.throws(
      () => loadProjectionModule(context),
      (error) => error && /^portal-view-state-authority-/.test(error.code)
    );
    assert.equal(harness.root.hasAttribute('data-portal-primary-destination'), false);
    assert.equal(harness.root.hasAttribute('data-portal-contextual-layer'), false);
  }
});

test('projection does not change existing portal element state', () => {
  const { api, harness, beforeSnapshots } = loadProjection();

  api.setPrimaryDestination('RECIPIENTS');
  api.openContextualLayer('VERIFICATION');
  api.closeContextualLayer();
  assertOnlyProjectionMutatedRootMarkers(harness, beforeSnapshots);
});

test('projection falls back to documentElement only when modules root is absent', () => {
  const { harness } = loadProjection({ rootMissing: true });

  assert.equal(harness.root.hasAttribute('data-portal-primary-destination'), false);
  assert.equal(harness.fallbackRoot.getAttribute('data-portal-primary-destination'), 'TRANSFER');
  assert.equal(harness.fallbackRoot.getAttribute('data-portal-contextual-layer'), 'NONE');
});

test('no storage, URL, history, wallet, Coin Card, receipt, network, or execution authority is accessed', () => {
  const { api } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  api.openContextualLayer('SYSTEM');
  api.projectCurrentState();
  api.closeContextualLayer();

  const source = read(projectionModulePath);
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bsessionStorage\b/);
  assert.doesNotMatch(source, /\bindexedDB\b/);
  assert.doesNotMatch(source, /\bwindow\.location\b/);
  assert.doesNotMatch(source, /\bwindow\.history\b/);
  assert.doesNotMatch(source, /\bpushState\b/);
  assert.doesNotMatch(source, /\breplaceState\b/);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bIX_EXECUTION\b/);
  assert.doesNotMatch(source, /\bIX_COIN_CARD(?:_[A-Z0-9_]+)?\b/);
  assert.doesNotMatch(source, /receipt-store/);
});

test('script order in portal-index loads state before projection', () => {
  const html = read(portalIndexPath);
  const stateIndex = html.indexOf('src="js/portal-view-state.js"');
  const projectionIndex = html.indexOf('src="js/portal-view-projection.js"');

  assert.ok(stateIndex > 0, 'portal-view-state.js script is missing');
  assert.ok(projectionIndex > 0, 'portal-view-projection.js script is missing');
  assert.ok(stateIndex < projectionIndex, 'view-state must load before projection');
});

test('no visible navigation control is introduced', () => {
  const html = read(portalIndexPath);

  assert.equal((html.match(/portal-view-projection\.js/g) || []).length, 1);
  assert.doesNotMatch(html, /data-portal-nav/);
  assert.doesNotMatch(html, /id="portalNav/);
  assert.doesNotMatch(html, /class="[^"]*portal-nav/);
});

test('projection API is immutable and exports only IX_PORTAL_VIEW_PROJECTION', () => {
  const { api, context, beforeWindowKeys } = loadProjection();
  const afterWindowKeys = Reflect.ownKeys(context.window);
  const addedKeys = afterWindowKeys.filter((key) => !beforeWindowKeys.includes(key));
  const removedKeys = beforeWindowKeys.filter((key) => !afterWindowKeys.includes(key));
  const addedSymbols = addedKeys.filter((key) => typeof key === 'symbol');

  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.MARKERS), true);
  assert.deepEqual(addedKeys, ['IX_PORTAL_VIEW_PROJECTION']);
  assert.deepEqual(removedKeys, []);
  assert.deepEqual(addedSymbols, []);
});
