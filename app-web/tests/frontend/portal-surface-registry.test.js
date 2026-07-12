const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const registryModulePath = path.join(publicRoot, 'js/portal-surface-registry.js');
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

function createFakeElement(id, attributes = {}) {
  const attrs = Object.assign({}, attributes);
  const writeLog = [];
  const listeners = [];
  const children = [];

  return {
    id,
    value: 'preserve-value',
    checked: true,
    disabled: false,
    hidden: false,
    className: 'existing-class',
    expando: { preserve: true },
    children,
    listeners,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) {
      writeLog.push({ name, value: String(value) });
      attrs[name] = String(value);
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name);
    },
    removeAttribute(name) {
      delete attrs[name];
    },
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    get attributes() {
      return Object.assign({}, attrs);
    },
    get writeLog() {
      return writeLog.slice();
    },
  };
}

function createElementSnapshot(element) {
  return {
    id: element.id,
    attributes: element.attributes,
    value: element.value,
    checked: element.checked,
    disabled: element.disabled,
    hidden: element.hidden,
    className: element.className,
    expando: element.expando,
    writeLog: element.writeLog,
    listeners: element.listeners.slice(),
    children: element.children.slice(),
  };
}

function createDocument(nodes) {
  return {
    querySelectorAll(selector) {
      assert.equal(
        selector,
        '[data-portal-primary-surface], [data-portal-contextual-surface]'
      );

      return nodes.filter((node) => (
        node.hasAttribute('data-portal-primary-surface')
        || node.hasAttribute('data-portal-contextual-surface')
      ));
    },
    getElementById(id) {
      return nodes.find((node) => node.id === id) || null;
    },
  };
}

function createRegisteredNodes(order = 'normal') {
  const nodes = [
    createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
    createFakeElement('ccIntake'),
    createFakeElement('recipientIntel'),
    createFakeElement('receiptHistory', { 'data-portal-primary-surface': 'ACTIVITY' }),
    createFakeElement('companion', { 'data-portal-primary-surface': 'TRANSFER' }),
    createFakeElement('verificationMod', { 'data-portal-contextual-surface': 'VERIFICATION' }),
    createFakeElement('networkMod'),
    createFakeElement('telemetry', { 'data-portal-contextual-surface': 'SYSTEM' }),
    createFakeElement('portalFooter', { 'data-portal-contextual-surface': 'SYSTEM' }),
  ];

  if (order === 'reverse') {
    return nodes.slice().reverse();
  }

  return nodes;
}

function createContext(nodes = createRegisteredNodes()) {
  const window = {};
  const document = createDocument(nodes);
  const context = {
    window,
    document,
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
  defineThrowingGetter(context, 'IX_PORTAL_VIEW_STATE');
  defineThrowingGetter(context, 'IX_PORTAL_VIEW_PROJECTION');

  defineThrowingGetter(window, 'localStorage');
  defineThrowingGetter(window, 'sessionStorage');
  defineThrowingGetter(window, 'indexedDB');
  defineThrowingGetter(window, 'location');
  defineThrowingGetter(window, 'history');
  defineThrowingGetter(window, 'IX_EXECUTION');
  defineThrowingGetter(window, 'IX_COIN_CARD_VERIFICATION');
  defineThrowingGetter(window, 'IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION');
  defineThrowingGetter(window, 'IX_COIN_CARD_LIFECYCLE_RESOLUTION');
  defineThrowingGetter(window, 'IX_PORTAL_VIEW_STATE');
  defineThrowingGetter(window, 'IX_PORTAL_VIEW_PROJECTION');

  return {
    context,
    nodes,
  };
}

function loadRegistry(nodes) {
  const { context, nodes: effectiveNodes } = createContext(nodes);
  const beforeWindowKeys = Reflect.ownKeys(context.window);
  const beforeSnapshots = new Map(
    effectiveNodes.map((node) => [node.id, createElementSnapshot(node)])
  );

  vm.runInNewContext(read(registryModulePath), context, { filename: registryModulePath });

  return {
    api: context.window.IX_PORTAL_SURFACE_REGISTRY,
    window: context.window,
    nodes: effectiveNodes,
    beforeWindowKeys,
    beforeSnapshots,
  };
}

function assertErrorCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

function ids(registrations) {
  return Array.from(registrations, (entry) => entry.id);
}

function plainSnapshot(snapshot) {
  return JSON.parse(JSON.stringify({
    primary: Object.fromEntries(
      Object.entries(snapshot.primary).map(([surface, registrations]) => [
        surface,
        registrations.map((entry) => ({
          id: entry.id,
          selector: entry.selector,
          surface: entry.surface,
          category: entry.category,
        })),
      ])
    ),
    contextual: Object.fromEntries(
      Object.entries(snapshot.contextual).map(([surface, registrations]) => [
        surface,
        registrations.map((entry) => ({
          id: entry.id,
          selector: entry.selector,
          surface: entry.surface,
          category: entry.category,
        })),
      ])
    ),
  }));
}

test('real portal markup declares the expected surface anchors', () => {
  const html = read(portalIndexPath);
  const primaryMatches = [...html.matchAll(
    /<[^>]+\bid="([^"]+)"[^>]+\bdata-portal-primary-surface="([^"]+)"/g
  )];
  const contextualMatches = [...html.matchAll(
    /<[^>]+\bid="([^"]+)"[^>]+\bdata-portal-contextual-surface="([^"]+)"/g
  )];

  assert.deepEqual(
    primaryMatches.map((match) => `${match[1]}:${match[2]}`).sort(),
    [
      'companion:TRANSFER',
      'receiptHistory:ACTIVITY',
      'transferMod:TRANSFER',
    ].sort()
  );
  assert.deepEqual(
    contextualMatches.map((match) => `${match[1]}:${match[2]}`).sort(),
    [
      'portalFooter:SYSTEM',
      'telemetry:SYSTEM',
      'verificationMod:VERIFICATION',
    ].sort()
  );
});

test('script order loads surface registry after view projection and before wallet', () => {
  const html = read(portalIndexPath);
  const stateIndex = html.indexOf('src="js/portal-view-state.js"');
  const projectionIndex = html.indexOf('src="js/portal-view-projection.js"');
  const registryIndex = html.indexOf('src="js/portal-surface-registry.js"');
  const walletIndex = html.indexOf('src="js/wallet.js"');

  assert.ok(stateIndex > 0);
  assert.ok(projectionIndex > stateIndex);
  assert.ok(registryIndex > projectionIndex);
  assert.ok(walletIndex > registryIndex);
  assert.equal((html.match(/portal-surface-registry\.js/g) || []).length, 1);
});

test('registry exposes separate primary and contextual surface buckets', () => {
  const { api } = loadRegistry();

  assert.equal(api.validate(), true);
  assert.deepEqual(ids(api.getPrimarySurfaceRegistrations('TRANSFER')), ['companion', 'transferMod']);
  assert.deepEqual(ids(api.getPrimarySurfaceRegistrations('RECIPIENTS')), []);
  assert.deepEqual(ids(api.getPrimarySurfaceRegistrations('ACTIVITY')), ['receiptHistory']);
  assert.deepEqual(ids(api.getContextualSurfaceRegistrations('VERIFICATION')), ['verificationMod']);
  assert.deepEqual(ids(api.getContextualSurfaceRegistrations('SYSTEM')), ['portalFooter', 'telemetry']);
});

test('DOM order does not change ordered surface snapshots', () => {
  const normal = loadRegistry(createRegisteredNodes('normal')).api;
  const reversed = loadRegistry(createRegisteredNodes('reverse')).api;

  assert.deepEqual(
    plainSnapshot(normal.getRegistrationSnapshot()),
    plainSnapshot(reversed.getRegistrationSnapshot())
  );
});

test('returned collections and API objects are immutable fresh projections', () => {
  const { api } = loadRegistry();
  const first = api.getPrimarySurfaceRegistrations('TRANSFER');
  const second = api.getPrimarySurfaceRegistrations('TRANSFER');
  const snapshot = api.getRegistrationSnapshot();

  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.PRIMARY_SURFACES), true);
  assert.equal(Object.isFrozen(api.CONTEXTUAL_SURFACES), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first[0]), true);
  assert.deepEqual(Object.keys(first[0]).sort(), ['category', 'id', 'selector', 'surface']);
  assert.equal(Object.prototype.hasOwnProperty.call(first[0], 'element'), false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.primary), true);
  assert.equal(Object.isFrozen(snapshot.primary.RECIPIENTS), true);
});

test('unsupported or malformed registrations fail deterministically', () => {
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('badPrimary', { 'data-portal-primary-surface': 'SYSTEM' }),
    ]),
    'portal-primary-surface-invalid'
  );
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('badContextual', { 'data-portal-contextual-surface': 'ACTIVITY' }),
    ]),
    'portal-contextual-surface-invalid'
  );
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('emptyPrimary', { 'data-portal-primary-surface': '' }),
    ]),
    'portal-surface-registration-malformed'
  );
});

test('duplicate, unstable, dual-role, and missing Transfer registrations fail', () => {
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'ACTIVITY' }),
    ]),
    'portal-surface-registration-duplicate'
  );
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('', { 'data-portal-primary-surface': 'RECIPIENTS' }),
    ]),
    'portal-surface-registration-unstable'
  );
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('bad:id', { 'data-portal-primary-surface': 'RECIPIENTS' }),
    ]),
    'portal-surface-registration-unstable'
  );
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
      createFakeElement('dual', {
        'data-portal-primary-surface': 'RECIPIENTS',
        'data-portal-contextual-surface': 'SYSTEM',
      }),
    ]),
    'portal-surface-registration-dual-role'
  );
  assertErrorCode(
    () => loadRegistry([
      createFakeElement('receiptHistory', { 'data-portal-primary-surface': 'ACTIVITY' }),
    ]),
    'portal-transfer-surface-missing'
  );
});

test('invalid API lookup values fail deterministically', () => {
  const { api } = loadRegistry();

  assertErrorCode(() => api.getPrimarySurfaceRegistrations('SYSTEM'), 'portal-primary-surface-invalid');
  assertErrorCode(() => api.getContextualSurfaceRegistrations('TRANSFER'), 'portal-contextual-surface-invalid');
});

test('validate rescans current metadata without mutating original snapshot', () => {
  const loaded = loadRegistry();
  const snapshotBefore = plainSnapshot(loaded.api.getRegistrationSnapshot());
  const transfer = loaded.nodes.find((node) => node.id === 'transferMod');
  const companion = loaded.nodes.find((node) => node.id === 'companion');

  transfer.removeAttribute('data-portal-primary-surface');
  companion.removeAttribute('data-portal-primary-surface');

  assertErrorCode(() => loaded.api.validate(), 'portal-transfer-surface-missing');
  assert.deepEqual(plainSnapshot(loaded.api.getRegistrationSnapshot()), snapshotBefore);
});

test('registered IDs resolve to the registered element', () => {
  const nodes = createRegisteredNodes();
  const loaded = loadRegistry(nodes);
  const snapshot = loaded.api.getRegistrationSnapshot();
  const registered = [
    ...snapshot.primary.TRANSFER,
    ...snapshot.primary.ACTIVITY,
    ...snapshot.contextual.VERIFICATION,
    ...snapshot.contextual.SYSTEM,
  ];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  assert.deepEqual(ids(snapshot.primary.RECIPIENTS), []);

  for (const entry of registered) {
    assert.equal(byId.get(entry.id).id, entry.id);
    assert.equal(entry.selector, `#${entry.id}`);
  }
});

test('registry does not mutate presentation or product element state', () => {
  const { nodes, beforeSnapshots } = loadRegistry();

  for (const node of nodes) {
    const before = beforeSnapshots.get(node.id);
    const after = createElementSnapshot(node);

    assert.deepEqual(after.attributes, before.attributes, `${node.id} attributes changed`);
    assert.equal(after.value, before.value, `${node.id} value changed`);
    assert.equal(after.checked, before.checked, `${node.id} checked changed`);
    assert.equal(after.disabled, before.disabled, `${node.id} disabled changed`);
    assert.equal(after.hidden, before.hidden, `${node.id} hidden changed`);
    assert.equal(after.className, before.className, `${node.id} className changed`);
    assert.deepEqual(after.expando, before.expando, `${node.id} expando changed`);
    assert.deepEqual(after.writeLog, [], `${node.id} attributes were written`);
    assert.deepEqual(after.listeners, [], `${node.id} listeners were added`);
    assert.deepEqual(after.children, [], `${node.id} children were added`);
  }
});

test('module has no forbidden static dependency mechanisms', () => {
  const source = read(registryModulePath);

  [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bwindow\.location\b/,
    /\bwindow\.history\b/,
    /\bpushState\b/,
    /\breplaceState\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\bIX_EXECUTION\b/,
    /\bIX_COIN_CARD(?:_[A-Z0-9_]+)?\b/,
    /\bIX_PORTAL_VIEW_STATE\b/,
    /\bIX_PORTAL_VIEW_PROJECTION\b/,
    /\breceipt-store\b/,
    /\breceiptStore\b/,
    /\brequire\s*\(/,
    /\bimport\s+/,
    /\.addEventListener\s*\(/,
    /\.dispatchEvent\s*\(/,
  ].forEach((pattern) => {
    assert.doesNotMatch(source, pattern);
  });
});

test('module exports only IX_PORTAL_SURFACE_REGISTRY', () => {
  const { window, beforeWindowKeys } = loadRegistry();
  const afterWindowKeys = Reflect.ownKeys(window);
  const added = afterWindowKeys.filter((key) => !beforeWindowKeys.includes(key));
  const removed = beforeWindowKeys.filter((key) => !afterWindowKeys.includes(key));

  assert.deepEqual(added, ['IX_PORTAL_SURFACE_REGISTRY']);
  assert.deepEqual(removed, []);
  assert.deepEqual(added.filter((key) => typeof key === 'symbol'), []);
});

test('no visible navigation control is introduced', () => {
  const html = read(portalIndexPath);

  assert.doesNotMatch(html, /data-portal-nav/i);
  assert.doesNotMatch(html, /id="portalNav/i);
  assert.doesNotMatch(html, /aria-controls="[^"]*portal-view/i);
});
