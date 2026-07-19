const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const stateModulePath = path.join(publicRoot, 'js/portal-view-state.js');
const projectionModulePath = path.join(publicRoot, 'js/portal-view-projection.js');
const registryModulePath = path.join(publicRoot, 'js/portal-surface-registry.js');
const controllerModulePath = path.join(publicRoot, 'js/portal-visibility-controller.js');
const coordinatorModulePath = path.join(publicRoot, 'js/portal-navigation-coordinator.js');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');
const stylesheetPath = path.join(publicRoot, 'css/main.css');
const contractPath = path.join(repoRoot, 'docs/product/portal/PORTAL_PRIMARY_NAVIGATION_COORDINATOR_CONTRACT_V1.md');
const mirrorContractPath = path.join(repoRoot, 'app-web/docs/product/portal/PORTAL_PRIMARY_NAVIGATION_COORDINATOR_CONTRACT_V1.md');

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

function createMutationError(code = 'portal-navigation-mutation-failed') {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createFakeElement(id, options = {}) {
  const attributes = Object.assign(Object.create(null), options.attributes || {});
  const writeLog = [];
  const listeners = Object.create(null);
  const children = [];
  const tagName = (options.tagName || 'div').toUpperCase();

  const element = {
    id,
    tagName,
    nodeName: tagName,
    value: options.value !== undefined ? options.value : 'preserve-value',
    checked: options.checked !== undefined ? options.checked : true,
    disabled: options.disabled !== undefined ? options.disabled : false,
    hidden: options.hidden !== undefined ? options.hidden : false,
    className: options.className !== undefined ? options.className : 'existing-class',
    textContent: options.textContent !== undefined ? options.textContent : 'preserve-text',
    expando: options.expando !== undefined ? options.expando : { keep: true },
    parentNode: null,
    children,
    childNodes: children,
    beforeWriteHook: null,
    throwOnSetAttributeCallNumber: null,
    throwOnSetAttributeName: null,
    throwOnSetAttributeTiming: 'before',
    throwOnRemoveAttributeCallNumber: null,
    throwOnRemoveAttributeName: null,
    throwOnRemoveAttributeTiming: 'before',
    _setCalls: 0,
    _removeCalls: 0,
    appendChild(child) {
      child.parentNode = element;
      children.push(child);
      return child;
    },
    contains(node) {
      let current = node;
      while (current) {
        if (current === element) return true;
        current = current.parentNode || null;
      }
      return false;
    },
    focus() {
      if (element.ownerDocument) {
        element.ownerDocument.activeElement = element;
      }
      writeLog.push({
        operation: 'focus',
        name: 'focus',
        value: null,
        callNumber: writeLog.length + 1,
      });
    },
    addEventListener(type, handler) {
      if (!listeners[type]) {
        listeners[type] = [];
      }
      listeners[type].push(handler);
    },
    dispatch(type, event = {}) {
      const handlers = listeners[type] || [];
      for (const handler of handlers) {
        handler(Object.assign({
          preventDefault() {},
          stopPropagation() {},
        }, event));
      }
    },
    click() {
      element.dispatch('click');
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    },
    setAttribute(name, value) {
      const callNumber = element._setCalls + 1;
      const entry = {
        operation: 'set',
        name,
        value: String(value),
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

      element._setCalls = callNumber;
      writeLog.push(entry);
      attributes[name] = String(value);

      if (
        element.throwOnSetAttributeCallNumber === callNumber
        && (element.throwOnSetAttributeName === null || element.throwOnSetAttributeName === name)
        && element.throwOnSetAttributeTiming === 'after'
      ) {
        throw createMutationError();
      }
    },
    removeAttribute(name) {
      const callNumber = element._removeCalls + 1;
      const entry = {
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

      element._removeCalls = callNumber;
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
    clearWriteLog() {
      writeLog.length = 0;
      element._setCalls = 0;
      element._removeCalls = 0;
    },
    get attributes() {
      return Object.assign({}, attributes);
    },
    get writeLog() {
      return writeLog.slice();
    },
    get listenerCount() {
      return Object.values(listeners).reduce((count, list) => count + list.length, 0);
    },
    get listeners() {
      return listeners;
    },
    get firstElementChild() {
      return children[0] || null;
    },
    get nextElementSibling() {
      if (!element.parentNode) return null;
      const siblings = element.parentNode.children || [];
      const index = siblings.indexOf(element);
      return index >= 0 ? siblings[index + 1] || null : null;
    },
  };

  if (element.hidden) {
    attributes.hidden = '';
  }

  return element;
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
    listenerCount: element.listenerCount,
    focusCount: element.writeLog.filter((entry) => entry.operation === 'focus').length,
    writeLog: element.writeLog,
  };
}

function createPortalDocument(options = {}) {
  const fallbackRoot = createFakeElement('documentElement', { tagName: 'html' });
  const modules = createFakeElement('modules', {
    tagName: 'section',
    className: 'modules transfer-portal',
    textContent: '',
    expando: { keep: 'modules' },
  });
  const portalPrimaryNav = createFakeElement('portalPrimaryNav', {
    tagName: 'nav',
    className: 'portal-primary-nav',
    hidden: true,
    attributes: {
      'aria-label': 'Portal destinations',
      hidden: '',
    },
    textContent: '',
  });
  const portalPrimaryNavStatus = createFakeElement('portalPrimaryNavStatus', {
    tagName: 'p',
    className: 'portal-primary-nav-status',
    hidden: true,
    attributes: {
      role: 'status',
      'aria-live': 'polite',
      hidden: '',
    },
    textContent: '',
  });
  const portalNavTransfer = createFakeElement('portalNavTransfer', {
    tagName: 'button',
    className: 'portal-primary-nav-button',
    attributes: {
      type: 'button',
      'data-portal-navigation-destination': 'TRANSFER',
      'aria-current': 'page',
    },
    textContent: 'Transfer',
  });
  const portalNavRecipients = createFakeElement('portalNavRecipients', {
    tagName: 'button',
    className: 'portal-primary-nav-button',
    attributes: {
      type: 'button',
      'data-portal-navigation-destination': 'RECIPIENTS',
    },
    textContent: 'Recipients',
  });
  const portalNavActivity = createFakeElement('portalNavActivity', {
    tagName: 'button',
    className: 'portal-primary-nav-button',
    attributes: {
      type: 'button',
      'data-portal-navigation-destination': 'ACTIVITY',
    },
    textContent: 'Activity',
  });
  const portalHeader = createFakeElement('portalHeader', {
    tagName: 'div',
    className: 'portal-header',
  });
  const portalHeaderSub = createFakeElement('portalHeaderSub', {
    tagName: 'p',
    className: 'portal-header-sub',
    textContent: 'TRANSFER DETAILS · NETWORK STATE · RECIPIENT VERIFICATION',
  });
  const ccIntake = createFakeElement('ccIntake', {
    tagName: 'div',
    className: 'cc-intake',
    hidden: true,
    attributes: {
      'data-portal-primary-surface': 'TRANSFER',
      hidden: '',
      'aria-live': 'polite',
      'aria-label': 'Coin Card handoff status',
    },
  });
  const transferMod = createFakeElement('transferMod', {
    tagName: 'div',
    className: 'mod transfer-mod',
    attributes: {
      'data-portal-primary-surface': 'TRANSFER',
    },
  });
  const recipientsMod = createFakeElement('recipientsMod', {
    tagName: 'div',
    className: 'mod recipients-mod',
    attributes: {
      'data-portal-primary-surface': 'RECIPIENTS',
    },
  });
  const activityMod = createFakeElement('activityMod', {
    tagName: 'div',
    className: 'mod activity-mod',
    attributes: {
      'data-portal-primary-surface': 'ACTIVITY',
    },
  });
  const companion = createFakeElement('companion', {
    tagName: 'div',
    className: 'companion',
    attributes: {
      'data-portal-primary-surface': 'TRANSFER',
    },
  });
  const verificationMod = createFakeElement('verificationMod', {
    tagName: 'div',
    className: 'mod verification-mod',
    attributes: {
      'data-portal-contextual-surface': 'VERIFICATION',
    },
  });
  const networkMod = createFakeElement('networkMod', {
    tagName: 'div',
    className: 'mod network-mod',
    attributes: {
      'data-portal-global-surface': 'NETWORK',
    },
  });
  const portalFooter = createFakeElement('portalFooter', {
    tagName: 'div',
    className: 'portal-footer',
    attributes: {
      'data-portal-contextual-surface': 'SYSTEM',
    },
  });
  const telemetry = createFakeElement('telemetry', {
    tagName: 'div',
    className: 'telemetry',
    attributes: {
      'data-portal-contextual-surface': 'SYSTEM',
    },
  });
  const recipientIntel = createFakeElement('recipientIntel', {
    tagName: 'div',
    className: 'intel-panel',
    hidden: true,
  });
  const receiptHistory = createFakeElement('receiptHistory', {
    tagName: 'div',
    className: 'receipt-history-list',
  });

  portalPrimaryNav.appendChild(portalNavTransfer);
  portalPrimaryNav.appendChild(portalNavRecipients);
  portalPrimaryNav.appendChild(portalNavActivity);

  transferMod.appendChild(recipientIntel);
  activityMod.appendChild(receiptHistory);

  modules.appendChild(portalPrimaryNav);
  modules.appendChild(portalPrimaryNavStatus);
  modules.appendChild(portalHeader);
  modules.appendChild(portalHeaderSub);
  modules.appendChild(ccIntake);
  modules.appendChild(transferMod);
  modules.appendChild(recipientsMod);
  modules.appendChild(activityMod);
  modules.appendChild(companion);
  modules.appendChild(verificationMod);
  modules.appendChild(networkMod);
  modules.appendChild(portalFooter);
  modules.appendChild(telemetry);

  const nodes = [
    modules,
    fallbackRoot,
    portalPrimaryNav,
    portalPrimaryNavStatus,
    portalNavTransfer,
    portalNavRecipients,
    portalNavActivity,
    portalHeader,
    portalHeaderSub,
    ccIntake,
    transferMod,
    recipientsMod,
    activityMod,
    companion,
    verificationMod,
    networkMod,
    portalFooter,
    telemetry,
    recipientIntel,
    receiptHistory,
  ];

  const byId = new Map(nodes.map((node) => [node.id, node]));

  const document = {
    documentElement: fallbackRoot,
    activeElement: null,
    getElementById(id) {
      if (options.rootMissing && id === 'modules') return null;
      return byId.get(id) || null;
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
  };

  for (const node of nodes) {
    node.ownerDocument = document;
  }

  return {
    document,
    nodes,
    byId,
    modules,
    portalPrimaryNav,
    portalPrimaryNavStatus,
    portalNavTransfer,
    portalNavRecipients,
    portalNavActivity,
    portalHeader,
    portalHeaderSub,
    ccIntake,
    transferMod,
    recipientsMod,
    activityMod,
    companion,
    verificationMod,
    networkMod,
    portalFooter,
    telemetry,
    recipientIntel,
    receiptHistory,
  };
}

function createContext(options = {}) {
  const harness = createPortalDocument(options);
  const window = {};
  const context = { window, document: harness.document };

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

function loadModule(context, modulePath) {
  vm.runInNewContext(read(modulePath), context, { filename: modulePath });
}

function loadPortalRuntime(options = {}) {
  const { context, harness } = createContext(options);

  loadModule(context, stateModulePath);
  loadModule(context, projectionModulePath);
  loadModule(context, registryModulePath);
  loadModule(context, controllerModulePath);

  if (options.malformedControllerAuthority) {
    context.window.IX_PORTAL_VISIBILITY_CONTROLLER = {};
  }

  if (options.missingControllerAuthority) {
    delete context.window.IX_PORTAL_VISIBILITY_CONTROLLER;
  }

  if (options.controllerOverrides) {
    context.window.IX_PORTAL_VISIBILITY_CONTROLLER = Object.freeze(options.controllerOverrides);
  }

  if (options.malformedProjectionAuthority) {
    context.window.IX_PORTAL_VIEW_PROJECTION = {};
  }

  if (options.missingProjectionAuthority) {
    delete context.window.IX_PORTAL_VIEW_PROJECTION;
  }

  if (options.malformedRegistryAuthority) {
    context.window.IX_PORTAL_SURFACE_REGISTRY = {};
  }

  if (options.missingRegistryAuthority) {
    delete context.window.IX_PORTAL_SURFACE_REGISTRY;
  }

  const beforeWindowKeys = Reflect.ownKeys(context.window);
  const beforeSnapshots = new Map(harness.nodes.map((node) => [node.id, snapshotElement(node)]));

  loadModule(context, coordinatorModulePath);

  return {
    context,
    harness,
    api: context.window.IX_PORTAL_NAVIGATION_COORDINATOR,
    projectionApi: context.window.IX_PORTAL_VIEW_PROJECTION,
    registryApi: context.window.IX_PORTAL_SURFACE_REGISTRY,
    controllerApi: context.window.IX_PORTAL_VISIBILITY_CONTROLLER,
    beforeWindowKeys,
    beforeSnapshots,
  };
}

function assertStatus(status, available, transitioning, primaryDestination, lastErrorCode) {
  assert.equal(Object.isFrozen(status), true);
  assert.deepEqual(Object.keys(status), ['available', 'transitioning', 'primaryDestination', 'lastErrorCode']);
  assert.equal(status.available, available);
  assert.equal(status.transitioning, transitioning);
  assert.equal(status.primaryDestination, primaryDestination);
  assert.equal(status.lastErrorCode, lastErrorCode);
}

function assertNoUnexpectedMutation(before, after, label) {
  assert.equal(after.value, before.value, `${label}: value changed`);
  assert.equal(after.checked, before.checked, `${label}: checked changed`);
  assert.equal(after.disabled, before.disabled, `${label}: disabled changed`);
  assert.equal(after.hidden, before.hidden, `${label}: hidden changed`);
  assert.equal(after.className, before.className, `${label}: className changed`);
  assert.equal(after.textContent, before.textContent, `${label}: textContent changed`);
  assert.deepEqual(after.expando, before.expando, `${label}: expando changed`);
  assert.deepEqual(after.childrenIds, before.childrenIds, `${label}: children changed`);
}

function buttonSnapshot(button) {
  return {
    attributes: button.attributes,
    hidden: button.hidden,
    className: button.className,
    textContent: button.textContent,
    listenerCount: button.listenerCount,
    focusCount: button.writeLog.filter((entry) => entry.operation === 'focus').length,
  };
}

test('contract mirror is byte-identical and runtime boundary is four files', () => {
  assert.equal(fs.readFileSync(contractPath, 'utf8'), fs.readFileSync(mirrorContractPath, 'utf8'));

  const html = read(portalIndexPath);
  const css = read(stylesheetPath);

  assert.match(html, /<nav\s+id="portalPrimaryNav"\s+class="portal-primary-nav"\s+aria-label="Portal destinations"\s+hidden>/);
  assert.match(html, /<p\s+id="portalPrimaryNavStatus"\s+class="portal-primary-nav-status"\s+role="status"\s+aria-live="polite"\s+hidden><\/p>/);
  assert.ok(html.indexOf('id="portalPrimaryNav"') < html.indexOf('class="portal-header"'));
  assert.ok(html.indexOf('id="portalPrimaryNavStatus"') < html.indexOf('class="portal-header"'));
  assert.match(html, /src="js\/portal-navigation-coordinator\.js"/);
  assert.ok(html.indexOf('portal-visibility-controller.js') < html.indexOf('portal-navigation-coordinator.js'));
  assert.ok(html.indexOf('portal-navigation-coordinator.js') < html.indexOf('wallet.js'));
  assert.match(css, /\.portal-primary-nav/);
  assert.match(css, /\.portal-primary-nav-button/);
  assert.match(css, /\.portal-primary-nav-status/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /:focus-visible/);
});

test('hidden portal navigation fallback remains hidden when coordinator is unavailable', () => {
  const html = read(portalIndexPath);
  const css = read(stylesheetPath);

  assert.match(html, /<nav\s+id="portalPrimaryNav"[\s\S]*?\shidden>/);
  assert.match(html, /<p\s+id="portalPrimaryNavStatus"[\s\S]*?\shidden><\/p>/);
  assert.match(css, /\.portal-primary-nav\[hidden\],\s*\.portal-primary-nav-status\[hidden\]\s*\{\s*display:\s*none;\s*\}/s);
});

test('module exports before initialization and initialization remains contained', () => {
  const runtime = loadPortalRuntime();
  const beforeStatus = runtime.api.getStatus();

  assert.equal(Object.isFrozen(runtime.api), true);
  assert.deepEqual(Object.keys(runtime.api), ['selectPrimaryDestination', 'getStatus']);
  assert.equal(Object.isFrozen(beforeStatus), true);
  assertStatus(beforeStatus, true, false, 'TRANSFER', null);
  assert.equal(runtime.harness.portalPrimaryNav.hidden, false);
  assert.equal(runtime.harness.portalPrimaryNav.hasAttribute('hidden'), false);
  assert.equal(runtime.harness.portalPrimaryNavStatus.hidden, true);
  assert.equal(runtime.harness.portalPrimaryNavStatus.textContent, '');
  assert.equal(runtime.harness.document.activeElement, null);
  assert.deepEqual(
    runtime.harness.portalPrimaryNav.children.map((node) => node.id),
    ['portalNavTransfer', 'portalNavRecipients', 'portalNavActivity']
  );
  assert.equal(runtime.harness.portalNavTransfer.getAttribute('aria-current'), 'page');
  assert.equal(runtime.harness.portalNavRecipients.hasAttribute('aria-current'), false);
  assert.equal(runtime.harness.portalNavActivity.hasAttribute('aria-current'), false);
});

test('initialization failure does not escape module evaluation and keeps the global inspectable', () => {
  const runtime = loadPortalRuntime({ missingControllerAuthority: true });
  const status = runtime.api.getStatus();

  assert.equal(Object.isFrozen(runtime.api), true);
  assertStatus(status, false, false, 'TRANSFER', 'portal-navigation-initialization-failed');
  assert.equal(runtime.harness.portalPrimaryNav.hidden, true);
  assert.equal(runtime.harness.portalPrimaryNav.hasAttribute('hidden'), true);
  assert.equal(runtime.harness.portalPrimaryNavStatus.hidden, true);
  assert.equal(runtime.harness.portalPrimaryNavStatus.textContent, '');
});

test('selectPrimaryDestination rejects unavailable use without mutating focus or authorities', () => {
  const runtime = loadPortalRuntime({ missingControllerAuthority: true });
  const before = {
    activeElement: runtime.harness.document.activeElement,
    nav: snapshotElement(runtime.harness.portalPrimaryNav),
    status: snapshotElement(runtime.harness.portalPrimaryNavStatus),
    transfer: snapshotElement(runtime.harness.portalNavTransfer),
    recipients: snapshotElement(runtime.harness.portalNavRecipients),
    activity: snapshotElement(runtime.harness.portalNavActivity),
  };

  assert.throws(
    () => runtime.api.selectPrimaryDestination('RECIPIENTS'),
    (error) => error && error.code === 'portal-navigation-unavailable'
  );
  assert.equal(runtime.api.getStatus().lastErrorCode, 'portal-navigation-initialization-failed');
  assert.equal(runtime.harness.document.activeElement, before.activeElement);
  assert.deepEqual(snapshotElement(runtime.harness.portalPrimaryNav), before.nav);
  assert.deepEqual(snapshotElement(runtime.harness.portalPrimaryNavStatus), before.status);
  assert.deepEqual(snapshotElement(runtime.harness.portalNavTransfer), before.transfer);
  assert.deepEqual(snapshotElement(runtime.harness.portalNavRecipients), before.recipients);
  assert.deepEqual(snapshotElement(runtime.harness.portalNavActivity), before.activity);
});

test('same-destination selection clears prior recoverable status and remains change-aware', () => {
  const runtime = loadPortalRuntime();
  runtime.harness.portalNavRecipients.throwOnSetAttributeCallNumber = 1;

  assert.throws(
    () => runtime.api.selectPrimaryDestination('RECIPIENTS'),
    (error) => error && error.code === 'portal-navigation-transition-failed'
  );
  assert.equal(runtime.harness.portalPrimaryNavStatus.hidden, false);
  assert.equal(runtime.harness.portalPrimaryNavStatus.textContent, 'Couldn’t switch views. Your previous view remains active.');
  assertStatus(runtime.api.getStatus(), true, false, 'TRANSFER', 'portal-navigation-transition-failed');

  runtime.harness.portalNavRecipients.throwOnSetAttributeCallNumber = null;
  runtime.harness.portalPrimaryNavStatus.clearWriteLog();
  runtime.harness.portalPrimaryNavStatus.textContent = 'stale';
  runtime.harness.portalPrimaryNavStatus.hidden = false;

  const result = runtime.api.selectPrimaryDestination('RECIPIENTS');
  assertStatus(result, true, false, 'RECIPIENTS', null);
  assert.equal(runtime.harness.portalPrimaryNavStatus.hidden, true);
  assert.equal(runtime.harness.portalPrimaryNavStatus.textContent, '');
  assert.equal(runtime.harness.document.activeElement.id, 'portalNavRecipients');
});

test('successful primary transitions apply projection, controller, and selected state in order', () => {
  const runtime = loadPortalRuntime();
  const focusBefore = runtime.harness.document.activeElement;

  const result = runtime.api.selectPrimaryDestination('RECIPIENTS');
  assertStatus(result, true, false, 'RECIPIENTS', null);
  assert.equal(runtime.harness.document.activeElement.id, 'portalNavRecipients');
  assert.equal(runtime.harness.portalPrimaryNav.hidden, false);
  assert.equal(runtime.harness.portalPrimaryNavStatus.hidden, true);
  assert.equal(runtime.harness.portalPrimaryNavStatus.textContent, '');
  assert.equal(runtime.harness.portalNavTransfer.getAttribute('aria-current'), null);
  assert.equal(runtime.harness.portalNavRecipients.getAttribute('aria-current'), 'page');
  assert.equal(runtime.harness.portalNavActivity.hasAttribute('aria-current'), false);
  assert.equal(runtime.controllerApi.getStatus().activated, true);
  assert.equal(runtime.controllerApi.getStatus().primaryDestination, 'RECIPIENTS');
  assert.equal(runtime.projectionApi.getState().primaryDestination, 'RECIPIENTS');
  assert.equal(focusBefore, null);
});

test('reentrant selection throws transition-in-progress without nested mutation', () => {
  const runtime = loadPortalRuntime();
  let nestedErrorCode = null;

  runtime.harness.portalNavRecipients.beforeWriteHook = (entry) => {
    if (entry.operation === 'set' && entry.name === 'aria-current' && entry.value === 'page') {
      try {
        runtime.api.selectPrimaryDestination('ACTIVITY');
      } catch (error) {
        nestedErrorCode = error.code;
      }
    }
  };

  const result = runtime.api.selectPrimaryDestination('RECIPIENTS');
  assertStatus(result, true, false, 'RECIPIENTS', null);
  assert.equal(nestedErrorCode, 'portal-navigation-transition-in-progress');
  assert.equal(runtime.harness.portalNavRecipients.getAttribute('aria-current'), 'page');
  assert.equal(runtime.harness.portalNavActivity.hasAttribute('aria-current'), false);
  assert.equal(runtime.api.getStatus().lastErrorCode, null);
});

test('selected-state failure can recover or fail compensation deterministically', () => {
  const recoverableRuntime = loadPortalRuntime();
  recoverableRuntime.harness.portalNavRecipients.throwOnSetAttributeCallNumber = 1;

  assert.throws(
    () => recoverableRuntime.api.selectPrimaryDestination('RECIPIENTS'),
    (error) => error && error.code === 'portal-navigation-transition-failed'
  );
  assertStatus(recoverableRuntime.api.getStatus(), true, false, 'TRANSFER', 'portal-navigation-transition-failed');
  assert.equal(recoverableRuntime.harness.portalPrimaryNavStatus.hidden, false);
  assert.equal(recoverableRuntime.harness.portalPrimaryNavStatus.textContent, 'Couldn’t switch views. Your previous view remains active.');

  const compensationRuntime = loadPortalRuntime();
  compensationRuntime.harness.portalNavRecipients.beforeWriteHook = (entry) => {
    if (entry.operation === 'set' && entry.name === 'aria-current' && entry.value === 'page') {
      compensationRuntime.harness.modules.throwOnSetAttributeCallNumber = compensationRuntime.harness.modules._setCalls + 1;
      compensationRuntime.harness.modules.throwOnSetAttributeName = 'data-portal-primary-destination';
    }
  };
  compensationRuntime.harness.portalNavRecipients.throwOnSetAttributeCallNumber = 1;

  assert.throws(
    () => compensationRuntime.api.selectPrimaryDestination('RECIPIENTS'),
    (error) => error && error.code === 'portal-navigation-compensation-failed'
  );
  assert.equal(compensationRuntime.api.getStatus().available, false);
  assert.equal(compensationRuntime.api.getStatus().transitioning, false);
  assert.equal(compensationRuntime.api.getStatus().lastErrorCode, 'portal-navigation-compensation-failed');
  assert.equal(compensationRuntime.harness.portalPrimaryNav.hidden, true);
  assert.equal(compensationRuntime.harness.portalPrimaryNavStatus.hidden, false);
  assert.equal(compensationRuntime.harness.portalPrimaryNavStatus.textContent, 'Couldn’t confirm the active view. Navigation has been disabled.');
});

test('focus moves to the requested button before closing roots', () => {
  const runtime = loadPortalRuntime();
  runtime.harness.document.activeElement = runtime.harness.transferMod;

  const result = runtime.api.selectPrimaryDestination('RECIPIENTS');

  assertStatus(result, true, false, 'RECIPIENTS', null);
  assert.equal(runtime.harness.document.activeElement.id, 'portalNavRecipients');
  assert.equal(runtime.harness.transferMod.hasAttribute('data-portal-controller-inactive'), true);
  assert.equal(runtime.harness.recipientsMod.hasAttribute('data-portal-controller-inactive'), false);
});

test('static source does not expose forbidden authority access and scripts are ordered correctly', () => {
  const source = read(coordinatorModulePath);
  const html = read(portalIndexPath);
  const css = read(stylesheetPath);

  assert.doesNotMatch(source, /\bIX_PORTAL_VIEW_STATE\b/);
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bsessionStorage\b/);
  assert.doesNotMatch(source, /\blocation\./);
  assert.doesNotMatch(source, /\bhistory\./);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bethereum\b/);
  assert.doesNotMatch(source, /\bIX_EXECUTION\b/);
  assert.doesNotMatch(source, /\bIX_COIN_CARD\b/);

  assert.ok(html.indexOf('portal-visibility-controller.js') < html.indexOf('portal-navigation-coordinator.js'));
  assert.ok(html.indexOf('portal-navigation-coordinator.js') < html.indexOf('wallet.js'));
  assert.match(html, /id="portalPrimaryNav"/);
  assert.match(html, /id="portalPrimaryNavStatus"/);
  assert.match(css, /\.portal-primary-nav-button/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(
    css,
    /@media \(max-width: 1024px\)[\s\S]*?\.portal-primary-nav\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*140;[^}]*background:\s*var\(--surface\);[^}]*border-bottom:\s*1px solid var\(--border-2\);[^}]*\}/s
  );
  assert.match(
    css,
    /@media \(max-width: 1024px\) and \(display-mode:\s*standalone\)[\s\S]*?\.portal-primary-nav\s*\{[^}]*padding-top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 0\.35rem\);[^}]*\}/s
  );
  assert.doesNotMatch(css, /\.portal-primary-nav\s*\{[^}]*position:\s*fixed;/s);
  assert.doesNotMatch(css, /\.portal-header\s*\{[^}]*position:\s*sticky;/s);
  assert.doesNotMatch(css, /\.portal-header-controls\s*\{[^}]*position:\s*sticky;/s);
  assert.doesNotMatch(css, /\.portal-header-brand\s*\{[^}]*position:\s*sticky;/s);
});
