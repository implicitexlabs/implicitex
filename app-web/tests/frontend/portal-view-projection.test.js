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

function createMutationError(code = 'portal-view-projection-mutation-failed') {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createFakeElement(id, options = {}) {
  const attributes = Object.assign(Object.create(null), options.attributes || {});
  const writeLog = [];
  const element = {
    id,
    value: options.value !== undefined ? options.value : 'preserve-value',
    checked: options.checked !== undefined ? options.checked : true,
    disabled: options.disabled !== undefined ? options.disabled : false,
    hidden: options.hidden !== undefined ? options.hidden : false,
    className: options.className !== undefined ? options.className : 'existing-class',
    expando: options.expando !== undefined ? options.expando : { keep: true },
    parentNode: options.parentNode || null,
    childNodes: [],
    beforeWriteHook: null,
    throwOnSetAttributeCallNumber: null,
    throwOnSetAttributeTiming: 'before',
    throwOnSetAttributeName: null,
    throwOnRemoveAttributeCallNumber: null,
    throwOnRemoveAttributeTiming: 'before',
    throwOnRemoveAttributeName: null,
    _setAttributeCalls: 0,
    _removeAttributeCalls: 0,
    appendChild(child) {
      child.parentNode = element;
      element.childNodes.push(child);
      return child;
    },
    setAttribute(name, value) {
      const callNumber = element._setAttributeCalls + 1;
      const stringValue = String(value);
      const entry = {
        order: writeLog.length,
        operation: 'set',
        name,
        value: stringValue,
        callNumber,
      };

      if (typeof element.beforeWriteHook === 'function') {
        element.beforeWriteHook(entry);
      }

      if (
        element.throwOnSetAttributeCallNumber === callNumber
        && (element.throwOnSetAttributeName === null || element.throwOnSetAttributeName === name)
        && element.throwOnSetAttributeTiming === 'before'
      ) {
        throw createMutationError();
      }

      element._setAttributeCalls = callNumber;
      writeLog.push(entry);
      attributes[name] = stringValue;

      if (
        element.throwOnSetAttributeCallNumber === callNumber
        && (element.throwOnSetAttributeName === null || element.throwOnSetAttributeName === name)
        && element.throwOnSetAttributeTiming === 'after'
      ) {
        throw createMutationError();
      }
    },
    removeAttribute(name) {
      const callNumber = element._removeAttributeCalls + 1;
      const entry = {
        order: writeLog.length,
        operation: 'remove',
        name,
        value: null,
        callNumber,
      };

      if (typeof element.beforeWriteHook === 'function') {
        element.beforeWriteHook(entry);
      }

      if (
        element.throwOnRemoveAttributeCallNumber === callNumber
        && (element.throwOnRemoveAttributeName === null || element.throwOnRemoveAttributeName === name)
        && element.throwOnRemoveAttributeTiming === 'before'
      ) {
        throw createMutationError();
      }

      element._removeAttributeCalls = callNumber;
      if (Object.prototype.hasOwnProperty.call(attributes, name)) {
        delete attributes[name];
        writeLog.push(entry);
      }

      if (
        element.throwOnRemoveAttributeCallNumber === callNumber
        && (element.throwOnRemoveAttributeName === null || element.throwOnRemoveAttributeName === name)
        && element.throwOnRemoveAttributeTiming === 'after'
      ) {
        throw createMutationError();
      }
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
      element._setAttributeCalls = 0;
      element._removeAttributeCalls = 0;
    },
  };

  if (options.parentNode) {
    options.parentNode.appendChild(element);
  }

  return element;
}

function createDocumentHarness(options = {}) {
  const fallbackRoot = createFakeElement('documentElement');
  const root = createFakeElement('modules');
  const ccIntake = createFakeElement('ccIntake', {
    attributes: {
      'data-portal-primary-surface': 'TRANSFER',
    },
    hidden: true,
    className: 'cc-intake',
  });
  const transferMod = createFakeElement('transferMod', {
    attributes: {
      'data-portal-primary-surface': 'TRANSFER',
    },
    className: 'mod transfer-mod',
  });
  const recipientIntel = createFakeElement('recipientIntel', {
    hidden: true,
    className: 'intel-panel',
  });
  const recipientsMod = createFakeElement('recipientsMod', {
    attributes: {
      'data-portal-primary-surface': 'RECIPIENTS',
      'aria-labelledby': 'recipientsHeading',
    },
    className: 'mod recipients-mod',
  });
  const activityMod = createFakeElement('activityMod', {
    attributes: {
      'data-portal-primary-surface': 'ACTIVITY',
      'aria-labelledby': 'activityHeading',
    },
    className: 'mod activity-mod',
  });
  const receiptHistory = createFakeElement('receiptHistory', {
    className: 'receipt-history-list',
  });
  const networkMod = createFakeElement('networkMod', {
    attributes: {
      'data-portal-global-surface': 'NETWORK',
    },
    className: 'mod network-mod',
  });
  const verificationMod = createFakeElement('verificationMod', {
    attributes: {
      'data-portal-contextual-surface': 'VERIFICATION',
    },
    className: 'mod verification-mod',
  });
  const companion = createFakeElement('companion', {
    attributes: {
      'data-portal-primary-surface': 'TRANSFER',
    },
    className: 'companion',
  });
  const telemetry = createFakeElement('telemetry', {
    attributes: {
      'data-portal-contextual-surface': 'SYSTEM',
    },
    className: 'telemetry',
  });
  const portalFooter = createFakeElement('portalFooter', {
    attributes: {
      'data-portal-contextual-surface': 'SYSTEM',
    },
    className: 'portal-footer',
  });
  const txRecipient = createFakeElement('txRecipient');
  const txAmount = createFakeElement('txAmount');
  const txConfirmAck = createFakeElement('txConfirmAck');
  const txBtn = createFakeElement('txBtn');

  root.appendChild(ccIntake);
  root.appendChild(transferMod);
  transferMod.appendChild(recipientIntel);
  root.appendChild(recipientsMod);
  root.appendChild(activityMod);
  activityMod.appendChild(receiptHistory);
  root.appendChild(networkMod);
  root.appendChild(verificationMod);
  root.appendChild(companion);
  root.appendChild(telemetry);
  root.appendChild(portalFooter);
  root.appendChild(txRecipient);
  root.appendChild(txAmount);
  root.appendChild(txConfirmAck);
  root.appendChild(txBtn);

  const existingElements = [
    root,
    fallbackRoot,
    ccIntake,
    transferMod,
    recipientIntel,
    recipientsMod,
    activityMod,
    receiptHistory,
    networkMod,
    verificationMod,
    companion,
    telemetry,
    portalFooter,
    txRecipient,
    txAmount,
    txConfirmAck,
    txBtn,
  ];
  const byId = new Map(existingElements.filter((element) => element.id !== 'documentElement').map((element) => [element.id, element]));

  const document = {
    documentElement: fallbackRoot,
    activeElement: null,
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

function markerState(element, name) {
  return {
    exists: element.hasAttribute(name),
    value: element.hasAttribute(name) ? element.getAttribute(name) : null,
  };
}

function setMarkerState(element, name, state) {
  if (state.exists) {
    element.setAttribute(name, state.value);
  } else {
    element.removeAttribute(name);
  }
}

function makeState(api, primaryDestination, contextualLayer = null) {
  const state = api.setPrimaryDestination(api.createDefaultState(), primaryDestination);
  if (contextualLayer === null) {
    return state;
  }
  return api.openContextualLayer(state, contextualLayer);
}

function clearProjectionWrites(harness) {
  for (const element of harness.existingElements) {
    element.clearWriteLog();
  }
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

test('projection API exports the committed frozen marker descriptor', () => {
  const { api } = loadProjection();

  assert.deepEqual(Object.keys(api), [
    'MARKERS',
    'getState',
    'setPrimaryDestination',
    'openContextualLayer',
    'closeContextualLayer',
    'projectCurrentState',
  ]);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.MARKERS), true);
  assert.deepEqual(Object.keys(api.MARKERS), [
    'PRIMARY_DESTINATION',
    'CONTEXTUAL_LAYER',
    'CONTEXTUAL_LAYER_NONE',
  ]);
  assert.equal(api.MARKERS.PRIMARY_DESTINATION, 'data-portal-primary-destination');
  assert.equal(api.MARKERS.CONTEXTUAL_LAYER, 'data-portal-contextual-layer');
  assert.equal(api.MARKERS.CONTEXTUAL_LAYER_NONE, 'NONE');
});

test('successful primary transition commits DOM before private state', () => {
  const { api, harness } = loadProjection();
  const observedStates = [];

  clearProjectionWrites(harness);
  harness.root.beforeWriteHook = () => {
    observedStates.push(api.getState().primaryDestination);
  };

  const result = api.setPrimaryDestination('RECIPIENTS');

  assert.deepEqual(observedStates, ['TRANSFER']);
  assert.equal(result.primaryDestination, 'RECIPIENTS');
  assert.equal(result.contextualLayer, null);
  assert.equal(api.getState().primaryDestination, 'RECIPIENTS');
  assert.equal(api.getState().contextualLayer, null);
  assertWriteLog(harness.root, [
    { name: 'data-portal-primary-destination', value: 'RECIPIENTS' },
  ]);
});

test('first-write failure preserves prior state and markers', () => {
  const { api, harness } = loadProjection();
  const priorState = api.getState();
  const priorPrimary = markerState(harness.root, 'data-portal-primary-destination');
  const priorLayer = markerState(harness.root, 'data-portal-contextual-layer');

  clearProjectionWrites(harness);
  harness.root.throwOnSetAttributeCallNumber = 1;
  harness.root.throwOnSetAttributeTiming = 'before';

  assert.throws(
    () => api.setPrimaryDestination('RECIPIENTS'),
    (error) =>
      error
      && error.code === 'portal-view-projection-transaction-failed'
      && error.cause
      && error.cause.code === 'portal-view-projection-mutation-failed'
  );

  assert.deepEqual(api.getState(), priorState);
  assert.deepEqual(markerState(harness.root, 'data-portal-primary-destination'), priorPrimary);
  assert.deepEqual(markerState(harness.root, 'data-portal-contextual-layer'), priorLayer);
  assert.equal(harness.root.writeLog.length, 0);
});

test('rollback restores an originally absent attribute as absent', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  api.openContextualLayer('SYSTEM');
  harness.root.removeAttribute('data-portal-primary-destination');
  harness.root.removeAttribute('data-portal-contextual-layer');
  harness.root.setAttribute('data-portal-contextual-layer', 'DRIFTED');
  clearProjectionWrites(harness);
  harness.root.throwOnSetAttributeCallNumber = 2;
  harness.root.throwOnSetAttributeTiming = 'after';

  const priorState = api.getState();

  assert.throws(
    () => api.projectCurrentState(),
    (error) =>
      error
      && error.code === 'portal-view-projection-transaction-failed'
      && error.cause
      && error.cause.code === 'portal-view-projection-mutation-failed'
  );

  assert.deepEqual(api.getState(), priorState);
  assert.deepEqual(markerState(harness.root, 'data-portal-primary-destination'), {
    exists: false,
    value: null,
  });
  assert.deepEqual(markerState(harness.root, 'data-portal-contextual-layer'), {
    exists: true,
    value: 'DRIFTED',
  });
  assert.deepEqual(harness.root.writeLog.map(({ operation, name, value }) => ({ operation, name, value })), [
    { operation: 'set', name: 'data-portal-primary-destination', value: 'ACTIVITY' },
    { operation: 'set', name: 'data-portal-contextual-layer', value: 'SYSTEM' },
    { operation: 'set', name: 'data-portal-contextual-layer', value: 'DRIFTED' },
    { operation: 'remove', name: 'data-portal-primary-destination', value: null },
  ]);
});

test('rollback restores an originally empty-string attribute as an empty string', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  api.openContextualLayer('SYSTEM');
  harness.root.setAttribute('data-portal-primary-destination', '');
  harness.root.removeAttribute('data-portal-contextual-layer');
  harness.root.setAttribute('data-portal-contextual-layer', 'DRIFTED');
  clearProjectionWrites(harness);
  harness.root.throwOnSetAttributeCallNumber = 2;
  harness.root.throwOnSetAttributeTiming = 'after';

  const priorPrimary = markerState(harness.root, 'data-portal-primary-destination');
  const priorLayer = markerState(harness.root, 'data-portal-contextual-layer');

  assert.throws(
    () => api.projectCurrentState(),
    (error) =>
      error
      && error.code === 'portal-view-projection-transaction-failed'
      && error.cause
      && error.cause.code === 'portal-view-projection-mutation-failed'
  );

  assert.deepEqual(markerState(harness.root, 'data-portal-primary-destination'), priorPrimary);
  assert.deepEqual(markerState(harness.root, 'data-portal-contextual-layer'), priorLayer);
  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), '');
});

test('rollback restores a nonempty prior value exactly', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  api.openContextualLayer('SYSTEM');
  harness.root.setAttribute('data-portal-primary-destination', 'LEGACY');
  harness.root.removeAttribute('data-portal-contextual-layer');
  harness.root.setAttribute('data-portal-contextual-layer', 'DRIFTED');
  clearProjectionWrites(harness);
  harness.root.throwOnSetAttributeCallNumber = 2;
  harness.root.throwOnSetAttributeTiming = 'after';

  const priorPrimary = markerState(harness.root, 'data-portal-primary-destination');
  const priorLayer = markerState(harness.root, 'data-portal-contextual-layer');

  assert.throws(
    () => api.projectCurrentState(),
    (error) =>
      error
      && error.code === 'portal-view-projection-transaction-failed'
      && error.cause
      && error.cause.code === 'portal-view-projection-mutation-failed'
  );

  assert.deepEqual(markerState(harness.root, 'data-portal-primary-destination'), priorPrimary);
  assert.deepEqual(markerState(harness.root, 'data-portal-contextual-layer'), priorLayer);
  assert.equal(harness.root.getAttribute('data-portal-primary-destination'), 'LEGACY');
});

test('rollback failure continues attempting later restorations after one restoration fails', () => {
  const { api, harness } = loadProjection();

  api.setPrimaryDestination('ACTIVITY');
  api.openContextualLayer('SYSTEM');
  harness.root.setAttribute('data-portal-primary-destination', 'LEGACY');
  harness.root.setAttribute('data-portal-contextual-layer', 'DRIFTED');
  clearProjectionWrites(harness);
  harness.root.beforeWriteHook = (entry) => {
    if (entry.operation === 'set' && entry.name === 'data-portal-contextual-layer' && entry.callNumber === 3) {
      throw createMutationError();
    }
  };
  harness.root.throwOnSetAttributeCallNumber = 2;
  harness.root.throwOnSetAttributeTiming = 'after';

  const priorState = api.getState();

  assert.throws(
    () => api.projectCurrentState(),
    (error) =>
      error
      && error.code === 'portal-view-projection-rollback-failed'
      && error.cause
      && error.cause.code === 'portal-view-projection-mutation-failed'
  );

  assert.deepEqual(api.getState(), priorState);
  assert.deepEqual(markerState(harness.root, 'data-portal-primary-destination'), {
    exists: true,
    value: 'LEGACY',
  });
  assert.deepEqual(markerState(harness.root, 'data-portal-contextual-layer'), {
    exists: true,
    value: 'SYSTEM',
  });
  assert.deepEqual(harness.root.writeLog.map(({ operation, name, value }) => ({ operation, name, value })), [
    { operation: 'set', name: 'data-portal-primary-destination', value: 'ACTIVITY' },
    { operation: 'set', name: 'data-portal-contextual-layer', value: 'SYSTEM' },
    { operation: 'set', name: 'data-portal-primary-destination', value: 'LEGACY' },
  ]);
});

test('projection validation failures perform zero DOM writes', () => {
  const { api, harness } = loadProjection();

  clearProjectionWrites(harness);
  assert.throws(
    () => api.setPrimaryDestination('SYSTEM'),
    (error) => error && error.code === 'portal-primary-destination-invalid'
  );
  assert.equal(harness.root.writeLog.length, 0);
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

test('projection does not own or create primary navigation', () => {
  const source = read(projectionModulePath);
  const html = read(portalIndexPath);

  assert.equal((html.match(/portal-view-projection\.js/g) || []).length, 1);
  assert.doesNotMatch(source, /\bIX_PORTAL_NAVIGATION_COORDINATOR\b/);
  assert.doesNotMatch(source, /\bportalPrimaryNav\b/);
  assert.doesNotMatch(source, /\bportalPrimaryNavStatus\b/);
  assert.doesNotMatch(source, /\bportalNavTransfer\b/);
  assert.doesNotMatch(source, /\bportalNavRecipients\b/);
  assert.doesNotMatch(source, /\bportalNavActivity\b/);
  assert.doesNotMatch(source, /\bdata-portal-navigation-destination\b/);
  assert.doesNotMatch(source, /\baria-current\b/);
  assert.doesNotMatch(source, /\.addEventListener\s*\(/);
  assert.doesNotMatch(source, /\bfocus\s*\(/);

  if (html.includes('id="portalPrimaryNav"')) {
    const navStart = html.indexOf('<nav id="portalPrimaryNav"');
    const statusStart = html.indexOf('<p id="portalPrimaryNavStatus"');
    const navTag = html.slice(navStart, html.indexOf('>', navStart) + 1);
    const statusTag = html.slice(statusStart, html.indexOf('>', statusStart) + 1);

    assert.doesNotMatch(navTag, /data-portal-(primary|contextual|global)-surface=/);
    assert.doesNotMatch(statusTag, /data-portal-(primary|contextual|global)-surface=/);
  }
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
