const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const stateModulePath = path.join(publicRoot, 'js/portal-view-state.js');
const registryModulePath = path.join(publicRoot, 'js/portal-surface-registry.js');
const controllerModulePath = path.join(publicRoot, 'js/portal-visibility-controller.js');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');
const stylesheetPath = path.join(publicRoot, 'css/main.css');

const INACTIVE_ATTR = 'data-portal-controller-inactive';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function defineGetter(target, name, getter) {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    get: getter,
  });
}

function createMutationError(code = 'portal-visibility-mutation-failed') {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createFakeElement(id, attributes = {}, options = {}) {
  const attrs = Object.assign({}, attributes);
  const writeLog = [];
  const children = [];
  const listeners = [];

  return {
    id,
    value: options.value === undefined ? 'preserve-value' : options.value,
    checked: options.checked === undefined ? true : options.checked,
    disabled: options.disabled === undefined ? false : options.disabled,
    hidden: options.hidden === undefined ? false : options.hidden,
    className: options.className === undefined ? 'existing-class' : options.className,
    textContent: options.textContent === undefined ? 'preserve-text' : options.textContent,
    expando: options.expando === undefined ? { keep: true } : options.expando,
    parentNode: null,
    children,
    listeners,
    throwOnSetAttributeName: null,
    throwOnRemoveAttributeName: null,
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    contains(node) {
      let current = node;
      while (current) {
        if (current === this) return true;
        current = current.parentNode || null;
      }
      return false;
    },
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name);
    },
    setAttribute(name, value) {
      if (this.throwOnSetAttributeName === name) {
        throw createMutationError();
      }
      writeLog.push({
        order: writeLog.length,
        action: 'set',
        name,
        value: String(value),
      });
      attrs[name] = String(value);
    },
    removeAttribute(name) {
      if (this.throwOnRemoveAttributeName === name) {
        throw createMutationError();
      }
      writeLog.push({
        order: writeLog.length,
        action: 'remove',
        name,
        value: null,
      });
      delete attrs[name];
    },
    clearWriteLog() {
      writeLog.length = 0;
    },
    get attributes() {
      return Object.assign({}, attrs);
    },
    get writeLog() {
      return writeLog.slice();
    },
    get listenerCount() {
      return listeners.length;
    },
  };
}

function snapshotElement(element) {
  return {
    id: element.id,
    attributes: element.attributes,
    value: element.value,
    checked: element.checked,
    disabled: element.disabled,
    hidden: element.hidden,
    className: element.className,
    textContent: element.textContent,
    expando: JSON.parse(JSON.stringify(element.expando)),
    childrenIds: element.children.map((child) => child.id),
    listenerCount: element.listeners.length,
    writeLog: element.writeLog,
  };
}

function snapshotNodes(nodes) {
  return new Map(nodes.map((node) => [node.id, snapshotElement(node)]));
}

function assertSnapshotEqual(before, after, label) {
  assert.deepEqual(after, before, label);
}

function assertUntouched(before, node, label) {
  assert.deepEqual(snapshotElement(node), before, label);
}

function assertMarkerOnlyChange(before, node, present, label) {
  const after = snapshotElement(node);
  const expectedAttributes = Object.assign({}, before.attributes);

  if (present) {
    expectedAttributes[INACTIVE_ATTR] = '';
  } else {
    delete expectedAttributes[INACTIVE_ATTR];
  }

  assert.equal(after.value, before.value, `${label}: value changed`);
  assert.equal(after.checked, before.checked, `${label}: checked changed`);
  assert.equal(after.disabled, before.disabled, `${label}: disabled changed`);
  assert.equal(after.hidden, before.hidden, `${label}: hidden changed`);
  assert.equal(after.className, before.className, `${label}: className changed`);
  assert.equal(after.textContent, before.textContent, `${label}: textContent changed`);
  assert.deepEqual(after.expando, before.expando, `${label}: expando changed`);
  assert.deepEqual(after.childrenIds, before.childrenIds, `${label}: child structure changed`);
  assert.equal(after.listenerCount, before.listenerCount, `${label}: listener count changed`);
  assert.deepEqual(after.attributes, expectedAttributes, `${label}: attributes changed unexpectedly`);
  assert.equal(
    after.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true,
    `${label}: only the controller marker may be written`
  );
}

function createPortalNodes(order = 'normal') {
  const modules = createFakeElement('modules', {}, {
    className: 'modules transfer-portal',
    value: 'modules',
    checked: false,
    disabled: false,
    hidden: false,
    textContent: '',
    expando: { keep: 'modules' },
  });

  const nodes = [
    modules,
    createFakeElement('ccIntake', {
      'data-portal-primary-surface': 'TRANSFER',
      hidden: '',
      'aria-live': 'polite',
      'aria-label': 'Coin Card handoff status',
    }, {
      className: 'cc-intake',
      hidden: true,
      textContent: 'Coin Card handoff',
    }),
    createFakeElement('transferMod', {
      'data-portal-primary-surface': 'TRANSFER',
    }, {
      className: 'mod',
      textContent: 'Transfer',
    }),
    createFakeElement('recipientsMod', {
      'data-portal-primary-surface': 'RECIPIENTS',
    }, {
      className: 'mod',
      textContent: 'Recipients',
    }),
    createFakeElement('activityMod', {
      'data-portal-primary-surface': 'ACTIVITY',
    }, {
      className: 'mod',
      textContent: 'Activity',
    }),
    createFakeElement('recipientIntel', {
      hidden: '',
      'aria-live': 'polite',
    }, {
      className: 'intel-panel',
      hidden: true,
      textContent: 'Recipient intelligence',
    }),
    createFakeElement('receiptHistory', {}, {
      className: 'receipt-history-list',
      textContent: 'Receipt history',
    }),
    createFakeElement('companion', {
      'data-portal-primary-surface': 'TRANSFER',
    }, {
      className: 'companion',
      textContent: 'Transaction status',
    }),
    createFakeElement('verificationMod', {
      'data-portal-contextual-surface': 'VERIFICATION',
    }, {
      className: 'mod',
      textContent: 'Verification',
    }),
    createFakeElement('networkMod', {
      'data-portal-global-surface': 'NETWORK',
    }, {
      className: 'mod',
      textContent: 'Network',
    }),
    createFakeElement('telemetry', {
      'data-portal-contextual-surface': 'SYSTEM',
    }, {
      className: 'telemetry',
      textContent: 'Telemetry',
    }),
    createFakeElement('portalFooter', {
      'data-portal-contextual-surface': 'SYSTEM',
    }, {
      className: 'portal-footer',
      textContent: 'Portal information',
    }),
    createFakeElement('transferHeading', {}, { className: 'mod-title', textContent: 'Transfer' }),
    createFakeElement('recipientsHeading', {}, { className: 'mod-title', textContent: 'Recipients' }),
    createFakeElement('activityHeading', {}, { className: 'mod-title', textContent: 'Activity' }),
    createFakeElement('verificationHeading', {}, { className: 'mod-title', textContent: 'Verification' }),
    createFakeElement('telemetryHeading', {}, { className: 'telemetry-label', textContent: 'Telemetry' }),
    createFakeElement('portalFooterHeading', {}, { className: 'portal-footer-label', textContent: 'Portal information' }),
    createFakeElement('ccIntakeLabel', {}, { className: 'cc-intake-label', textContent: '—' }),
    createFakeElement('ccIntakeStatus', {}, { className: 'cc-intake-status', textContent: 'CHECKING REGISTRY' }),
  ];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const link = (parentId, childId) => {
    const parent = byId.get(parentId);
    const child = byId.get(childId);
    parent.appendChild(child);
    return child;
  };

  link('modules', 'ccIntake');
  link('modules', 'transferMod');
  link('modules', 'recipientsMod');
  link('modules', 'activityMod');
  link('modules', 'companion');
  link('modules', 'verificationMod');
  link('modules', 'networkMod');
  link('modules', 'telemetry');
  link('modules', 'portalFooter');
  link('transferMod', 'recipientIntel');
  link('activityMod', 'receiptHistory');
  link('ccIntake', 'ccIntakeLabel');
  link('ccIntake', 'ccIntakeStatus');
  link('transferMod', 'transferHeading');
  link('recipientsMod', 'recipientsHeading');
  link('activityMod', 'activityHeading');
  link('verificationMod', 'verificationHeading');
  link('telemetry', 'telemetryHeading');
  link('portalFooter', 'portalFooterHeading');

  if (order === 'reverse') {
    return nodes.slice().reverse();
  }

  return nodes;
}

function createDocument(nodes) {
  let activeElement = null;

  return {
    get activeElement() {
      return activeElement;
    },
    set activeElement(value) {
      activeElement = value;
    },
    querySelectorAll(selector) {
      assert.equal(
        selector,
        '[data-portal-primary-surface], [data-portal-contextual-surface], [data-portal-global-surface]'
      );

      return nodes.filter((node) => (
        node.hasAttribute('data-portal-primary-surface')
        || node.hasAttribute('data-portal-contextual-surface')
        || node.hasAttribute('data-portal-global-surface')
      ));
    },
    getElementById(id) {
      return nodes.find((node) => node.id === id) || null;
    },
  };
}

function loadAuthorities(context) {
  vm.runInNewContext(read(stateModulePath), context, { filename: stateModulePath });
  vm.runInNewContext(read(registryModulePath), context, { filename: registryModulePath });
  return {
    viewStateApi: context.window.IX_PORTAL_VIEW_STATE,
    registryApi: context.window.IX_PORTAL_SURFACE_REGISTRY,
  };
}

function defineAuthorityGetters(window, counts, authorities) {
  defineGetter(window, 'IX_PORTAL_VIEW_STATE', () => {
    counts.viewState += 1;
    return authorities.viewStateApi;
  });

  defineGetter(window, 'IX_PORTAL_SURFACE_REGISTRY', () => {
    counts.registry += 1;
    return authorities.registryApi;
  });

  defineGetter(window, 'IX_PORTAL_VIEW_PROJECTION', () => {
    counts.projection += 1;
    throw new Error('portal-visibility-controller must not access projection authority');
  });
}

function replaceNode(harness, oldId, replacement) {
  const index = harness.nodes.findIndex((node) => node.id === oldId);
  assert.ok(index >= 0, `missing node ${oldId}`);

  const original = harness.nodes[index];
  const parent = original.parentNode;
  const children = original.children;

  replacement.parentNode = parent;
  replacement.children = children;

  for (const child of children) {
    child.parentNode = replacement;
  }

  if (parent) {
    const siblingIndex = parent.children.indexOf(original);
    assert.ok(siblingIndex >= 0, `parent missing child ${oldId}`);
    parent.children[siblingIndex] = replacement;
  }

  harness.nodes[index] = replacement;
  return { original, replacement };
}

function createHarness(options = {}) {
  const nodes = createPortalNodes(options.order || 'normal');
  const document = createDocument(nodes);
  const window = {};
  const context = {
    window,
    document,
    globalThis: window,
    self: window,
  };

  window.window = window;
  window.self = window;
  window.globalThis = window;
  window.document = document;

  const authorities = loadAuthorities(context);
  const counts = {
    viewState: 0,
    registry: 0,
    projection: 0,
  };

  const exposeViewStateAuthority = options.exposeViewStateAuthority !== false;

  if (Object.prototype.hasOwnProperty.call(options, 'viewStateAuthority')) {
    authorities.viewStateApi = options.viewStateAuthority;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'registryAuthority')) {
    authorities.registryApi = options.registryAuthority;
  }

  if (exposeViewStateAuthority) {
    defineAuthorityGetters(window, counts, authorities);
  } else {
    delete window.IX_PORTAL_VIEW_STATE;
    defineGetter(window, 'IX_PORTAL_SURFACE_REGISTRY', () => {
      counts.registry += 1;
      return authorities.registryApi;
    });

    defineGetter(window, 'IX_PORTAL_VIEW_PROJECTION', () => {
      counts.projection += 1;
      throw new Error('portal-visibility-controller must not access projection authority');
    });
  }

  if (!exposeViewStateAuthority) {
    // Ensure the controller cannot fall back to view-state authority by name.
    assert.equal(Object.prototype.hasOwnProperty.call(window, 'IX_PORTAL_VIEW_STATE'), false);
  }

  const beforeWindowKeys = Reflect.ownKeys(window);
  const beforeSnapshots = snapshotNodes(nodes);

  vm.runInNewContext(read(controllerModulePath), context, { filename: controllerModulePath });

  return {
    context,
    document,
    nodes,
    window,
    api: window.IX_PORTAL_VISIBILITY_CONTROLLER,
    counts,
    authorities,
    beforeWindowKeys,
    beforeSnapshots,
    controllerSource: read(controllerModulePath),
    portalHtml: read(portalIndexPath),
    stylesheet: read(stylesheetPath),
  };
}

function makeState(context, primaryDestination, contextualLayer = null) {
  return vm.runInNewContext(
    `Object.freeze({
      contextualLayer: ${JSON.stringify(contextualLayer)},
      primaryDestination: ${JSON.stringify(primaryDestination)},
    })`,
    context
  );
}

function assertStatus(status, activated, primaryDestination, label = 'status') {
  assert.equal(status.activated, activated, `${label}.activated`);
  assert.equal(status.primaryDestination, primaryDestination, `${label}.primaryDestination`);
}

function assertErrorCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

function markerNames(node) {
  return node.writeLog.map((entry) => `${entry.action}:${entry.name}:${entry.value}`);
}

function markerState(nodes) {
  return Object.fromEntries(nodes.map((node) => [
    node.id,
    node.hasAttribute(INACTIVE_ATTR),
  ]));
}

test('module load is dormant, inert, and exports exactly one browser global', () => {
  const harness = createHarness();
  const afterWindowKeys = Reflect.ownKeys(harness.window);
  const addedKeys = afterWindowKeys.filter((key) => !harness.beforeWindowKeys.includes(key));

  assert.deepEqual(addedKeys, ['IX_PORTAL_VISIBILITY_CONTROLLER']);
  assert.equal(harness.counts.viewState, 0);
  assert.equal(harness.counts.registry, 0);
  assert.equal(harness.counts.projection, 0);
  assertStatus(harness.api.getStatus(), false, null);
  assert.equal(Object.isFrozen(harness.api), true);
  assert.equal(Object.isFrozen(harness.api.getStatus()), true);

  for (const node of harness.nodes) {
    assertUntouched(harness.beforeSnapshots.get(node.id), node, `${node.id} changed during dormant load`);
  }
});

test('controller load does not query state, registry, or projection authority', () => {
  const harness = createHarness();

  assert.equal(harness.counts.viewState, 0);
  assert.equal(harness.counts.registry, 0);
  assert.equal(harness.counts.projection, 0);
});

test('static portal files wire the controller and suppression rule', () => {
  const html = read(portalIndexPath);
  const css = read(stylesheetPath);
  const source = read(controllerModulePath);

  const stateIndex = html.indexOf('src="js/portal-view-state.js"');
  const projectionIndex = html.indexOf('src="js/portal-view-projection.js"');
  const registryIndex = html.indexOf('src="js/portal-surface-registry.js"');
  const controllerIndex = html.indexOf('src="js/portal-visibility-controller.js"');
  const walletIndex = html.indexOf('src="js/wallet.js"');

  assert.ok(stateIndex > 0, 'portal-view-state.js script is missing');
  assert.ok(projectionIndex > stateIndex, 'portal-view-projection.js must load after view state');
  assert.ok(registryIndex > projectionIndex, 'portal-surface-registry.js must load after projection');
  assert.ok(controllerIndex > registryIndex, 'portal-visibility-controller.js must load after registry');
  assert.ok(walletIndex > controllerIndex, 'wallet.js must load after the dormant controller');
  assert.equal((html.match(/portal-visibility-controller\.js/g) || []).length, 1);
  assert.equal((html.match(/data-portal-controller-inactive/g) || []).length, 0);
  assert.match(css, /\[data-portal-controller-inactive\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.doesNotMatch(source, /\bIX_PORTAL_VIEW_STATE\b/);
  assert.doesNotMatch(source, /\baddEventListener\b/);
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bsessionStorage\b/);
  assert.doesNotMatch(source, /\bhistory\b/);
  assert.doesNotMatch(source, /\blocation\b/);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bethereum\b/);
  assert.doesNotMatch(source, /\bIX_EXECUTION\b/);
  assert.doesNotMatch(source, /\bIX_COIN_CARD\b/);
  assert.doesNotMatch(source, /\bIX_PORTAL_VIEW_PROJECTION\b/);
  assert.doesNotMatch(source, /\bnormalizeState\b/);
  assert.doesNotMatch(source, /\bcreateDefaultState\b/);
  assert.doesNotMatch(source, /\bprojectCurrentState\b/);
  assert.doesNotMatch(source, /\bsetPrimaryDestination\b/);
  assert.doesNotMatch(source, /\bopenContextualLayer\b/);
  assert.doesNotMatch(source, /\bcloseContextualLayer\b/);
});

test('API and status projections are frozen and shape-limited', () => {
  const harness = createHarness();
  const status = harness.api.getStatus();

  assert.equal(Object.isFrozen(harness.api), true);
  assert.equal(Object.isFrozen(status), true);
  assert.deepEqual(Object.keys(status), ['activated', 'primaryDestination']);
  assertStatus(status, false, null);
  assert.notEqual(status, harness.api.getStatus());
});

test('invalid and unfrozen state snapshots fail before mutation', () => {
  const harness = createHarness();

  assertErrorCode(() => harness.api.apply(null), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply({ primaryDestination: 'TRANSFER', contextualLayer: null }), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply(Object.freeze({ primaryDestination: 'TRANSFER', contextualLayer: null, extra: true })), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply(Object.freeze({ primaryDestination: 'TRANSFER' })), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply('TRANSFER'), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply(Object.freeze(['TRANSFER', null])), 'portal-visibility-state-invalid');

  const symbolSnapshot = Object.freeze(Object.assign({
    primaryDestination: 'TRANSFER',
    contextualLayer: null,
  }, { [Symbol('extra')]: true }));
  assertErrorCode(() => harness.api.apply(symbolSnapshot), 'portal-visibility-state-invalid');

  const accessorSnapshot = {};
  Object.defineProperty(accessorSnapshot, 'primaryDestination', {
    enumerable: true,
    configurable: true,
    get() {
      return 'TRANSFER';
    },
  });
  Object.defineProperty(accessorSnapshot, 'contextualLayer', {
    enumerable: true,
    configurable: true,
    value: null,
    writable: true,
  });
  Object.freeze(accessorSnapshot);
  assertErrorCode(() => harness.api.apply(accessorSnapshot), 'portal-visibility-state-invalid');

  const nonPlainSnapshot = Object.freeze(Object.create(null, {
    primaryDestination: {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 'TRANSFER',
    },
    contextualLayer: {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null,
    },
  }));
  assertErrorCode(() => harness.api.apply(nonPlainSnapshot), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply(Object.freeze({ primaryDestination: 'SYSTEM', contextualLayer: null })), 'portal-visibility-state-invalid');
  assertErrorCode(() => harness.api.apply(Object.freeze({ primaryDestination: 'TRANSFER', contextualLayer: 'TRANSFER' })), 'portal-visibility-state-invalid');
  for (const node of harness.nodes) {
    assert.deepEqual(markerNames(node), []);
  }
});

test('valid frozen snapshots work without window.IX_PORTAL_VIEW_STATE', () => {
  const harness = createHarness({
    exposeViewStateAuthority: false,
  });

  assert.equal(Object.prototype.hasOwnProperty.call(harness.window, 'IX_PORTAL_VIEW_STATE'), false);
  const result = harness.api.apply(makeState(harness.context, 'TRANSFER'));
  assertStatus(result, true, 'TRANSFER', 'no view-state authority result');
  assert.equal(harness.counts.viewState, 0);
});

test('missing registry and registry validation failure fail before mutation', () => {
  const missingRegistryHarness = createHarness({
    registryAuthority: null,
  });
  const missingRegistryState = makeState(missingRegistryHarness.context, 'TRANSFER');

  assertErrorCode(() => missingRegistryHarness.api.apply(missingRegistryState), 'portal-surface-registry-missing');
  for (const node of missingRegistryHarness.nodes) {
    assert.deepEqual(markerNames(node), []);
  }

  const failingRegistry = Object.assign({}, createHarness().authorities.registryApi, {
    validate() {
      const error = new Error('registry-validate-failed');
      error.code = 'registry-validate-failed';
      throw error;
    },
  });
  const validationHarness = createHarness({
    registryAuthority: failingRegistry,
  });
  const validationState = makeState(validationHarness.context, 'TRANSFER');

  assertErrorCode(() => validationHarness.api.apply(validationState), 'registry-validate-failed');
  for (const node of validationHarness.nodes) {
    assert.deepEqual(markerNames(node), []);
  }
});

test('missing or mismatched registered roots fail before mutation', () => {
  const baseRegistry = createHarness().authorities.registryApi;
  const missingRootRegistry = Object.assign({}, baseRegistry, {
    getPrimarySurfaceRegistrations(surface) {
      if (surface === 'RECIPIENTS') {
        return Object.freeze([Object.freeze({
          id: 'ghostRoot',
          selector: '#ghostRoot',
          surface: 'RECIPIENTS',
          category: 'primary',
        })]);
      }
      return baseRegistry.getPrimarySurfaceRegistrations(surface);
    },
  });
  const missingRootHarness = createHarness({
    registryAuthority: missingRootRegistry,
  });
  const missingRootState = makeState(missingRootHarness.context, 'TRANSFER');

  assertErrorCode(() => missingRootHarness.api.apply(missingRootState), 'portal-visibility-root-missing');

  const mismatchedRegistry = Object.assign({}, baseRegistry, {
    getPrimarySurfaceRegistrations(surface) {
      if (surface === 'TRANSFER') {
        return Object.freeze([
          Object.freeze({
            id: 'ccIntake',
            selector: '#wrong-selector',
            surface: 'TRANSFER',
            category: 'primary',
          }),
          Object.freeze({
            id: 'companion',
            selector: '#companion',
            surface: 'TRANSFER',
            category: 'primary',
          }),
          Object.freeze({
            id: 'transferMod',
            selector: '#transferMod',
            surface: 'TRANSFER',
            category: 'primary',
          }),
        ]);
      }
      return baseRegistry.getPrimarySurfaceRegistrations(surface);
    },
  });
  const mismatchedHarness = createHarness({
    registryAuthority: mismatchedRegistry,
  });
  const mismatchedState = makeState(mismatchedHarness.context, 'TRANSFER');

  assertErrorCode(() => mismatchedHarness.api.apply(mismatchedState), 'portal-visibility-root-mismatch');
});

test('foreign marker on primary, global, or contextual roots produces conflict', () => {
  for (const targetId of ['transferMod', 'networkMod', 'verificationMod', 'portalFooter', 'telemetry']) {
    const harness = createHarness();
    harness.nodes.find((node) => node.id === targetId).setAttribute(INACTIVE_ATTR, '');

    assertErrorCode(() => harness.api.apply(makeState(harness.context, 'TRANSFER')), 'portal-visibility-marker-conflict');
  }
});

test('focus inside a closing root produces a deterministic conflict before mutation', () => {
  const harness = createHarness();
  harness.document.activeElement = harness.nodes.find((node) => node.id === 'recipientIntel');

  assertErrorCode(() => harness.api.apply(makeState(harness.context, 'RECIPIENTS')), 'portal-visibility-focus-conflict');
  for (const node of harness.nodes) {
    assert.deepEqual(markerNames(node), []);
  }
});

test('Transfer activation marks Recipients and Activity inactive together', () => {
  const harness = createHarness();
  const result = harness.api.apply(makeState(harness.context, 'TRANSFER'));

  assertStatus(result, true, 'TRANSFER', 'transfer result');
  assertMarkerOnlyChange(harness.beforeSnapshots.get('recipientsMod'), harness.nodes.find((node) => node.id === 'recipientsMod'), true, 'recipientsMod');
  assertMarkerOnlyChange(harness.beforeSnapshots.get('activityMod'), harness.nodes.find((node) => node.id === 'activityMod'), true, 'activityMod');
  assertMarkerOnlyChange(harness.beforeSnapshots.get('transferMod'), harness.nodes.find((node) => node.id === 'transferMod'), false, 'transferMod');
  assertMarkerOnlyChange(harness.beforeSnapshots.get('companion'), harness.nodes.find((node) => node.id === 'companion'), false, 'companion');
  assertMarkerOnlyChange(harness.beforeSnapshots.get('ccIntake'), harness.nodes.find((node) => node.id === 'ccIntake'), false, 'ccIntake');
  assert.deepEqual(markerState(harness.nodes.filter((node) => ['recipientsMod', 'activityMod'].includes(node.id))), {
    recipientsMod: true,
    activityMod: true,
  });
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hidden, true);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hasAttribute('hidden'), true);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hasAttribute(INACTIVE_ATTR), false);
});

test('Recipients activation marks Transfer and Activity inactive together', () => {
  const harness = createHarness();

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  for (const node of harness.nodes) {
    node.clearWriteLog();
  }

  const result = harness.api.apply(makeState(harness.context, 'RECIPIENTS'));

  assertStatus(result, true, 'RECIPIENTS', 'recipients result');
  assert.equal(harness.nodes.find((node) => node.id === 'recipientsMod').hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'transferMod').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'companion').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'activityMod').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hidden, true);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hasAttribute('hidden'), true);
  assert.deepEqual(markerNames(harness.nodes.find((node) => node.id === 'recipientsMod')), ['remove:data-portal-controller-inactive:null']);
});

test('Activity activation marks Transfer and Recipients inactive together', () => {
  const harness = createHarness();

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  for (const node of harness.nodes) {
    node.clearWriteLog();
  }

  const result = harness.api.apply(makeState(harness.context, 'ACTIVITY'));

  assertStatus(result, true, 'ACTIVITY', 'activity result');
  assert.equal(harness.nodes.find((node) => node.id === 'activityMod').hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'transferMod').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'companion').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'recipientsMod').hasAttribute(INACTIVE_ATTR), true);
});

test('switching destinations changes only controller-owned markers and preserves feature-owned ccIntake hidden state', () => {
  const harness = createHarness();
  const ccIntake = harness.nodes.find((node) => node.id === 'ccIntake');
  const transferMod = harness.nodes.find((node) => node.id === 'transferMod');
  const recipientsMod = harness.nodes.find((node) => node.id === 'recipientsMod');
  const activityMod = harness.nodes.find((node) => node.id === 'activityMod');

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  ccIntake.clearWriteLog();
  harness.nodes.find((node) => node.id === 'companion').clearWriteLog();
  transferMod.clearWriteLog();
  recipientsMod.clearWriteLog();
  activityMod.clearWriteLog();

  harness.api.apply(makeState(harness.context, 'RECIPIENTS'));
  assert.equal(ccIntake.hidden, true);
  assert.equal(ccIntake.hasAttribute('hidden'), true);
  assert.equal(ccIntake.listeners.length, 0);
  assert.equal(ccIntake.className, 'cc-intake');
  assert.equal(ccIntake.children.map((child) => child.id).join(','), 'ccIntakeLabel,ccIntakeStatus');
  assert.equal(
    ccIntake.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true
  );
  assert.equal(transferMod.hasAttribute(INACTIVE_ATTR), true);
  assert.equal(harness.nodes.find((node) => node.id === 'companion').hasAttribute(INACTIVE_ATTR), true);
  assert.equal(recipientsMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(activityMod.hasAttribute(INACTIVE_ATTR), true);
  assert.equal(
    transferMod.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true
  );
  assert.equal(
    ccIntake.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true
  );
  assert.equal(
    harness.nodes.find((node) => node.id === 'companion').writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true
  );
  assert.equal(
    recipientsMod.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true
  );
  assert.equal(
    activityMod.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
    true
  );

  transferMod.clearWriteLog();
  recipientsMod.clearWriteLog();
  activityMod.clearWriteLog();
  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  assert.equal(ccIntake.hidden, true);
  assert.equal(ccIntake.hasAttribute('hidden'), true);
  assert.equal(transferMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(recipientsMod.hasAttribute(INACTIVE_ATTR), true);
  assert.equal(activityMod.hasAttribute(INACTIVE_ATTR), true);
  assert.equal(transferMod.writeLog.every((entry) => entry.name === INACTIVE_ATTR), true);
});

test('replacement roots with the same ID and marker fail exact-root ownership checks', () => {
  const harness = createHarness();

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  const originalRecipients = harness.nodes.find((node) => node.id === 'recipientsMod');
  const replacementWithMarker = createFakeElement('recipientsMod', {
    'data-portal-primary-surface': 'RECIPIENTS',
    [INACTIVE_ATTR]: '',
  }, {
    className: 'mod replacement',
    textContent: 'Recipients replacement',
  });
  replaceNode(harness, 'recipientsMod', replacementWithMarker);

  assert.equal(harness.document.getElementById('recipientsMod'), replacementWithMarker);
  assertErrorCode(() => harness.api.apply(makeState(harness.context, 'TRANSFER')), 'portal-visibility-marker-conflict');
  assert.equal(replacementWithMarker.hasAttribute(INACTIVE_ATTR), true);
  assert.equal(originalRecipients.hasAttribute(INACTIVE_ATTR), true);
  assertStatus(harness.api.getStatus(), true, 'TRANSFER', 'replacement marker conflict status');
});

test('replacement roots with the same ID but no marker fail exact-root ownership checks', () => {
  const harness = createHarness();

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  const originalActivity = harness.nodes.find((node) => node.id === 'activityMod');
  const replacementWithoutMarker = createFakeElement('activityMod', {
    'data-portal-primary-surface': 'ACTIVITY',
  }, {
    className: 'mod replacement',
    textContent: 'Activity replacement',
  });
  replaceNode(harness, 'activityMod', replacementWithoutMarker);

  assert.equal(harness.document.getElementById('activityMod'), replacementWithoutMarker);
  assertErrorCode(() => harness.api.apply(makeState(harness.context, 'TRANSFER')), 'portal-visibility-marker-conflict');
  assert.equal(replacementWithoutMarker.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(originalActivity.hasAttribute(INACTIVE_ATTR), true);
  assertStatus(harness.api.getStatus(), true, 'TRANSFER', 'replacement no-marker conflict status');
});

test('mutation failure rolls back the complete transaction', () => {
  const harness = createHarness();
  const activityMod = harness.nodes.find((node) => node.id === 'activityMod');
  const transferMod = harness.nodes.find((node) => node.id === 'transferMod');
  const recipientsMod = harness.nodes.find((node) => node.id === 'recipientsMod');
  const ccIntake = harness.nodes.find((node) => node.id === 'ccIntake');

  activityMod.throwOnSetAttributeName = INACTIVE_ATTR;
  assertErrorCode(() => harness.api.apply(makeState(harness.context, 'RECIPIENTS')), 'portal-visibility-mutation-failed');
  assert.equal(transferMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'companion').hasAttribute(INACTIVE_ATTR), false);
  assert.equal(recipientsMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(activityMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(ccIntake.hasAttribute(INACTIVE_ATTR), false);
  assertStatus(harness.api.getStatus(), false, null);
});

test('restore removes only owned markers and is idempotent', () => {
  const harness = createHarness();
  const transferMod = harness.nodes.find((node) => node.id === 'transferMod');
  const ccIntake = harness.nodes.find((node) => node.id === 'ccIntake');
  const companion = harness.nodes.find((node) => node.id === 'companion');
  const recipientsMod = harness.nodes.find((node) => node.id === 'recipientsMod');
  const activityMod = harness.nodes.find((node) => node.id === 'activityMod');

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  for (const node of harness.nodes) {
    node.clearWriteLog();
  }

  const restored = harness.api.restore();
  assertStatus(restored, false, null, 'restored status');
  assert.equal(ccIntake.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(companion.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(transferMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(recipientsMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(activityMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.api.restore().activated, false);
  assert.equal(harness.api.restore().primaryDestination, null);
});

test('restore is independent of later registry failure and preserves feature-owned state', () => {
  const harness = createHarness();
  const recipientsMod = harness.nodes.find((node) => node.id === 'recipientsMod');
  const activityMod = harness.nodes.find((node) => node.id === 'activityMod');

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  harness.authorities.registryApi.validate = () => {
    const error = new Error('registry-validate-failed');
    error.code = 'registry-validate-failed';
    throw error;
  };

  const restored = harness.api.restore();
  assertStatus(restored, false, null, 'registry-independent restore');
  assert.equal(activityMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(recipientsMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'transferMod').hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'companion').hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hasAttribute(INACTIVE_ATTR), false);
  assert.equal(harness.nodes.find((node) => node.id === 'ccIntake').hidden, true);
  assertStatus(harness.api.getStatus(), false, null, 'registry-independent restore status');
});

test('restore detects exact-root replacement drift before removing any marker', () => {
  const harness = createHarness();
  const transferMod = harness.nodes.find((node) => node.id === 'transferMod');
  const originalRecipients = harness.nodes.find((node) => node.id === 'recipientsMod');

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  const replacementRecipients = createFakeElement('recipientsMod', {
    'data-portal-primary-surface': 'RECIPIENTS',
  }, {
    className: 'mod replacement',
    textContent: 'Recipients replacement',
  });
  replaceNode(harness, 'recipientsMod', replacementRecipients);

  assertErrorCode(() => harness.api.restore(), 'portal-visibility-marker-conflict');
  assert.equal(transferMod.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(replacementRecipients.hasAttribute(INACTIVE_ATTR), false);
  assert.equal(originalRecipients.hasAttribute(INACTIVE_ATTR), true);
  assertStatus(harness.api.getStatus(), true, 'TRANSFER', 'restore drift status');
});

test('DOM input order does not affect registry validation or controller results', () => {
  const normalHarness = createHarness({ order: 'normal' });
  const reverseHarness = createHarness({ order: 'reverse' });

  normalHarness.api.apply(makeState(normalHarness.context, 'ACTIVITY'));
  reverseHarness.api.apply(makeState(reverseHarness.context, 'ACTIVITY'));

  assert.deepEqual(
    markerState(normalHarness.nodes.filter((node) => ['ccIntake', 'companion', 'transferMod', 'recipientsMod', 'activityMod'].includes(node.id))),
    markerState(reverseHarness.nodes.filter((node) => ['ccIntake', 'companion', 'transferMod', 'recipientsMod', 'activityMod'].includes(node.id)))
  );
  assertStatus(normalHarness.api.getStatus(), true, 'ACTIVITY', 'normal order status');
  assertStatus(reverseHarness.api.getStatus(), true, 'ACTIVITY', 'reverse order status');
});

test('controller does not transition view state or alter projection metadata', () => {
  const harness = createHarness();
  const transitionCounts = {
    createDefaultState: 0,
    setPrimaryDestination: 0,
    openContextualLayer: 0,
    closeContextualLayer: 0,
  };
  const originalViewStateApi = harness.authorities.viewStateApi;
  const wrappedViewStateApi = Object.assign({}, originalViewStateApi, {
    createDefaultState() {
      transitionCounts.createDefaultState += 1;
      return originalViewStateApi.createDefaultState();
    },
    setPrimaryDestination(state, primaryDestination) {
      transitionCounts.setPrimaryDestination += 1;
      return originalViewStateApi.setPrimaryDestination(state, primaryDestination);
    },
    openContextualLayer(state, contextualLayer) {
      transitionCounts.openContextualLayer += 1;
      return originalViewStateApi.openContextualLayer(state, contextualLayer);
    },
    closeContextualLayer(state) {
      transitionCounts.closeContextualLayer += 1;
      return originalViewStateApi.closeContextualLayer(state);
    },
  });

  defineGetter(harness.window, 'IX_PORTAL_VIEW_STATE', () => wrappedViewStateApi);
  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  harness.api.apply(makeState(harness.context, 'RECIPIENTS'));
  harness.api.restore();

  assert.deepEqual(transitionCounts, {
    createDefaultState: 0,
    setPrimaryDestination: 0,
    openContextualLayer: 0,
    closeContextualLayer: 0,
  });
  assert.equal(harness.counts.projection, 0);
});

test('controller never mutates hidden, inert, or aria-hidden state', () => {
  const harness = createHarness();
  const before = snapshotNodes(harness.nodes);

  harness.api.apply(makeState(harness.context, 'TRANSFER'));
  harness.api.apply(makeState(harness.context, 'RECIPIENTS'));
  harness.api.apply(makeState(harness.context, 'ACTIVITY'));
  harness.api.restore();

  for (const node of harness.nodes) {
    assert.equal(
      node.writeLog.every((entry) => entry.name === INACTIVE_ATTR),
      true,
      `${node.id} received a non-marker mutation`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(node.attributes, 'hidden'),
      Object.prototype.hasOwnProperty.call(before.get(node.id).attributes, 'hidden'),
      `${node.id} hidden attribute changed`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(node.attributes, 'inert'),
      Object.prototype.hasOwnProperty.call(before.get(node.id).attributes, 'inert'),
      `${node.id} inert attribute changed`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(node.attributes, 'aria-hidden'),
      Object.prototype.hasOwnProperty.call(before.get(node.id).attributes, 'aria-hidden'),
      `${node.id} aria-hidden attribute changed`
    );
    assert.equal(node.hidden, before.get(node.id).hidden, `${node.id} hidden property changed`);
    assert.equal(node.className, before.get(node.id).className, `${node.id} className changed`);
    assert.equal(node.listenerCount, before.get(node.id).listenerCount, `${node.id} listener count changed`);
  }
});
