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
    parentNode: null,
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

function createRegisteredNodes(order = 'normal') {
  const modulesRoot = createFakeElement('modules');
  const nodes = [
    modulesRoot,
    createFakeElement('ccIntake', { 'data-portal-primary-surface': 'TRANSFER' }),
    createFakeElement('transferMod', { 'data-portal-primary-surface': 'TRANSFER' }),
    createFakeElement('recipientsMod', { 'data-portal-primary-surface': 'RECIPIENTS' }),
    createFakeElement('activityMod', { 'data-portal-primary-surface': 'ACTIVITY' }),
    createFakeElement('recipientIntel'),
    createFakeElement('receiptHistory'),
    createFakeElement('companion', { 'data-portal-primary-surface': 'TRANSFER' }),
    createFakeElement('verificationMod', { 'data-portal-contextual-surface': 'VERIFICATION' }),
    createFakeElement('networkMod', { 'data-portal-global-surface': 'NETWORK' }),
    createFakeElement('telemetry', { 'data-portal-contextual-surface': 'SYSTEM' }),
    createFakeElement('portalFooter', { 'data-portal-contextual-surface': 'SYSTEM' }),
  ];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const link = (parentId, childId) => {
    const parent = byId.get(parentId);
    const child = byId.get(childId);

    child.parentNode = parent;
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
    global: Object.fromEntries(
      Object.entries(snapshot.global).map(([surface, registrations]) => [
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

function findElementSpan(html, id) {
  const idToken = `id="${id}"`;
  const idIndex = html.indexOf(idToken);

  if (idIndex < 0) {
    return null;
  }

  const begin = html.lastIndexOf('<', idIndex);
  if (begin < 0) {
    return null;
  }

  const openTagEnd = html.indexOf('>', begin);
  if (openTagEnd < 0) {
    return null;
  }

  const openTag = html.slice(begin, openTagEnd + 1);
  const match = /^<([A-Za-z][\w:-]*)\b/.exec(openTag);
  if (!match) {
    return null;
  }

  const tagName = match[1];
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'g');
  let depth = 1;
  let cursor = openTagEnd + 1;

  while (cursor < html.length) {
    tokenPattern.lastIndex = cursor;
    const nextToken = tokenPattern.exec(html);

    if (!nextToken) {
      return null;
    }

    if (nextToken[0][1] === '/') {
      depth -= 1;
      if (depth === 0) {
        return {
          start: begin,
          end: nextToken.index + nextToken[0].length,
        };
      }

      cursor = nextToken.index + nextToken[0].length;
      continue;
    }

    depth += 1;
    cursor = nextToken.index + nextToken[0].length;
  }

  return null;
}

function assertNonOverlap(left, right, message) {
  assert.ok(left.end <= right.start || left.start >= right.end, message);
}

test('real portal markup declares the expected surface anchors', () => {
  const html = read(portalIndexPath);
  const primaryMatches = [...html.matchAll(
    /<[^>]+\bid="([^"]+)"[^>]+\bdata-portal-primary-surface="([^"]+)"/g
  )];
  const contextualMatches = [...html.matchAll(
    /<[^>]+\bid="([^"]+)"[^>]+\bdata-portal-contextual-surface="([^"]+)"/g
  )];
  const globalMatches = [...html.matchAll(
    /<[^>]+\bid="([^"]+)"[^>]+\bdata-portal-global-surface="([^"]+)"/g
  )];

  assert.deepEqual(
    primaryMatches.map((match) => `${match[1]}:${match[2]}`).sort(),
    [
      'ccIntake:TRANSFER',
      'companion:TRANSFER',
      'activityMod:ACTIVITY',
      'recipientsMod:RECIPIENTS',
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
  assert.deepEqual(
    globalMatches.map((match) => `${match[1]}:${match[2]}`).sort(),
    ['networkMod:NETWORK']
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

test('registry exposes separate primary, contextual, and global surface buckets', () => {
  const { api } = loadRegistry();

  assert.equal(api.validate(), true);
  assert.deepEqual(Object.keys(api.getRegistrationSnapshot()).sort(), ['contextual', 'global', 'primary']);
  assert.deepEqual(ids(api.getPrimarySurfaceRegistrations('TRANSFER')), ['ccIntake', 'companion', 'transferMod']);
  assert.deepEqual(ids(api.getPrimarySurfaceRegistrations('RECIPIENTS')), ['recipientsMod']);
  assert.deepEqual(ids(api.getPrimarySurfaceRegistrations('ACTIVITY')), ['activityMod']);
  assert.deepEqual(ids(api.getContextualSurfaceRegistrations('VERIFICATION')), ['verificationMod']);
  assert.deepEqual(ids(api.getContextualSurfaceRegistrations('SYSTEM')), ['portalFooter', 'telemetry']);
  assert.deepEqual(ids(api.getGlobalSurfaceRegistrations('NETWORK')), ['networkMod']);
});

test('recipients shell exists exactly once with an accessible heading and no recipient-data controls', () => {
  const html = read(portalIndexPath);
  const portalSpan = findElementSpan(html, 'modules');
  const transferSpan = findElementSpan(html, 'transferMod');
  const recipientsSpan = findElementSpan(html, 'recipientsMod');
  const ccIntakeSpan = findElementSpan(html, 'ccIntake');
  const recipientIntelSpan = findElementSpan(html, 'recipientIntel');

  assert.ok(portalSpan, 'transfer portal markup is missing');
  assert.ok(transferSpan, 'transfer shell markup is missing');
  assert.ok(recipientsSpan, 'recipients shell markup is missing');
  assert.ok(ccIntakeSpan, 'ccIntake markup is missing');
  assert.ok(recipientIntelSpan, 'recipientIntel markup is missing');

  const shell = html.slice(recipientsSpan.start, recipientsSpan.end);
  const portalShell = html.slice(portalSpan.start, portalSpan.end);

  assert.equal((html.match(/id="recipientsMod"/g) || []).length, 1);
  assert.equal((html.match(/id="recipientsHeading"/g) || []).length, 1);
  assert.equal((html.match(/id="ccIntake"/g) || []).length, 1);
  assert.match(html, /<div class="cc-intake" id="ccIntake" hidden aria-live="polite" aria-label="Coin Card handoff status" data-portal-primary-surface="TRANSFER">/);
  assert.match(html, /<p class="cc-intake-label" id="ccIntakeLabel">—<\/p>/);
  assert.match(html, /<span class="cc-intake-status" id="ccIntakeStatus" data-verify-state="pending">CHECKING REGISTRY<\/span>/);
  assert.match(html, /<p class="mod-title" id="recipientsHeading">Recipients<\/p>/);
  assert.match(html, /<div class="mod" id="recipientsMod" data-portal-primary-surface="RECIPIENTS" aria-labelledby="recipientsHeading">/);
  assert.match(html, /<span class="data-v">No saved recipients yet\.<\/span>/);
  assert.match(html, /Recipient tools are not enabled in this version\./);
  assert.equal(ccIntakeSpan.start > portalSpan.start && ccIntakeSpan.end < portalSpan.end, true);
  assert.equal(ccIntakeSpan.end < transferSpan.start, true, 'ccIntake must remain outside transferMod');
  assert.doesNotMatch(shell, /<input\b/);
  assert.doesNotMatch(shell, /<button\b/);
  assert.doesNotMatch(shell, /<a\b/);
  assert.doesNotMatch(shell, /\bon[a-z]+\s*=/i);
  assert.doesNotMatch(shell, /\bhidden\b/);
  assert.doesNotMatch(shell, /\binert\b/);
  assert.doesNotMatch(shell, /\baria-hidden\b/);
  assert.doesNotMatch(shell, /<form\b/);
  assert.doesNotMatch(shell, /<input\b/);
  assert.doesNotMatch(shell, /<select\b/);
  assert.doesNotMatch(shell, /<textarea\b/);
  assert.doesNotMatch(shell, /<button\b/);
  assert.doesNotMatch(shell, /<a\b/);
  assert.doesNotMatch(shell, /<script\b/);
  assert.doesNotMatch(shell, /id="ccIntake"|id="recipientIntel"/);
  assert.ok(transferSpan.end < recipientsSpan.start, 'transfer shell must close before recipients shell begins');
  assert.doesNotMatch(shell, /id="ccIntake"|id="recipientIntel"/);
  assert.ok(recipientIntelSpan.start > transferSpan.start && recipientIntelSpan.end < transferSpan.end, 'recipientIntel must remain inside transferMod');
  assert.ok(html.indexOf('id="ccIntake"') < recipientsSpan.start || html.indexOf('id="ccIntake"') > recipientsSpan.end, 'ccIntake must not appear inside recipients shell');
  assert.ok(html.indexOf('id="recipientIntel"') < recipientsSpan.start || html.indexOf('id="recipientIntel"') > recipientsSpan.end, 'recipientIntel must not appear inside recipients shell');
  assert.match(portalShell, /id="recipientIntel"/);
});

test('activity shell exists exactly once with receipt history inside and no receipt registration on the child', () => {
  const html = read(portalIndexPath);
  const portalSpan = findElementSpan(html, 'modules');
  const transferSpan = findElementSpan(html, 'transferMod');
  const activitySpan = findElementSpan(html, 'activityMod');
  const receiptHistorySpan = findElementSpan(html, 'receiptHistory');
  const companionSpan = findElementSpan(html, 'companion');

  assert.ok(portalSpan, 'transfer portal markup is missing');
  assert.ok(transferSpan, 'transfer shell markup is missing');
  assert.ok(activitySpan, 'activity shell markup is missing');
  assert.ok(receiptHistorySpan, 'receiptHistory markup is missing');
  assert.ok(companionSpan, 'companion markup is missing');

  const activityShell = html.slice(activitySpan.start, activitySpan.end);
  const receiptShell = html.slice(receiptHistorySpan.start, receiptHistorySpan.end);

  assert.equal((html.match(/id="activityMod"/g) || []).length, 1);
  assert.equal((html.match(/id="activityHeading"/g) || []).length, 1);
  assert.equal((html.match(/id="receiptHistory"/g) || []).length, 1);
  assert.equal((html.match(/data-portal-primary-surface="ACTIVITY"/g) || []).length, 1);
  assert.match(html, /<div class="mod" id="activityMod" data-portal-primary-surface="ACTIVITY" aria-labelledby="activityHeading">/);
  assert.match(html, /<p class="mod-title" id="activityHeading">Activity<\/p>/);
  assert.match(html, /<div id="receiptHistory" class="receipt-history-list">/);
  assert.ok(transferSpan.end < activitySpan.start, 'transfer shell must close before activity shell begins');
  assert.ok(activitySpan.start > portalSpan.start && activitySpan.end < portalSpan.end, 'activity shell must remain inside the portal surface');
  assert.ok(receiptHistorySpan.start > activitySpan.start && receiptHistorySpan.end < activitySpan.end, 'receiptHistory must remain inside activityMod');
  assert.ok(receiptHistorySpan.start > transferSpan.end, 'receiptHistory must no longer be inside transferMod');
  assert.ok(
    companionSpan.end <= activitySpan.start || companionSpan.start >= activitySpan.end,
    'companion must remain outside activityMod'
  );
  assert.doesNotMatch(activityShell, /\bhidden\b/);
  assert.doesNotMatch(activityShell, /\binert\b/);
  assert.doesNotMatch(activityShell, /\baria-hidden\b/);
  assert.doesNotMatch(receiptShell, /data-portal-primary-surface|data-portal-contextual-surface/);
  assert.doesNotMatch(activityShell, /<form\b/);
  assert.doesNotMatch(activityShell, /<input\b/);
  assert.doesNotMatch(activityShell, /<select\b/);
  assert.doesNotMatch(activityShell, /<textarea\b/);
  assert.doesNotMatch(activityShell, /<button\b/);
  assert.doesNotMatch(activityShell, /<a\b/);
  assert.doesNotMatch(activityShell, /<script\b/);
});

test('network root exists exactly once with global registration in place and no destination registration on the child root', () => {
  const html = read(portalIndexPath);
  const portalSpan = findElementSpan(html, 'modules');
  const networkSpan = findElementSpan(html, 'networkMod');
  const transferSpan = findElementSpan(html, 'transferMod');
  const ccIntakeSpan = findElementSpan(html, 'ccIntake');
  const recipientsSpan = findElementSpan(html, 'recipientsMod');
  const activitySpan = findElementSpan(html, 'activityMod');
  const verificationSpan = findElementSpan(html, 'verificationMod');
  const telemetrySpan = findElementSpan(html, 'telemetry');
  const footerSpan = findElementSpan(html, 'portalFooter');

  assert.ok(portalSpan, 'portal modules markup is missing');
  assert.ok(networkSpan, 'network module markup is missing');
  assert.ok(transferSpan, 'transfer shell markup is missing');
  assert.ok(ccIntakeSpan, 'ccIntake markup is missing');
  assert.ok(recipientsSpan, 'recipients shell markup is missing');
  assert.ok(activitySpan, 'activity shell markup is missing');
  assert.ok(verificationSpan, 'verification shell markup is missing');
  assert.ok(telemetrySpan, 'telemetry markup is missing');
  assert.ok(footerSpan, 'portal footer markup is missing');

  const networkShell = html.slice(networkSpan.start, networkSpan.end);

  assert.equal((html.match(/id="networkMod"/g) || []).length, 1);
  assert.equal((html.match(/data-portal-global-surface="NETWORK"/g) || []).length, 1);
  assert.match(networkShell, /<div class="mod" id="networkMod" data-portal-global-surface="NETWORK"/);
  assert.match(networkShell, /data-agent-step="2"/);
  assert.match(networkShell, /data-agent-purpose="Expose network, gas price, RPC latency, contract address, and chain status before execution\."/);
  assert.match(networkShell, /id="networkNameDisplay"/);
  assert.match(networkShell, /id="gasRow"/);
  assert.match(networkShell, /id="networkStatus"/);
  assert.doesNotMatch(networkShell, /data-portal-primary-surface|data-portal-contextual-surface/);
  assert.ok(networkSpan.start > portalSpan.start && networkSpan.end < portalSpan.end, 'network root must remain inside the portal surface');
  assertNonOverlap(networkSpan, transferSpan, 'network root must remain outside transferMod');
  assertNonOverlap(networkSpan, ccIntakeSpan, 'network root must remain outside ccIntake');
  assertNonOverlap(networkSpan, recipientsSpan, 'network root must remain outside recipientsMod');
  assertNonOverlap(networkSpan, activitySpan, 'network root must remain outside activityMod');
  assertNonOverlap(networkSpan, verificationSpan, 'network root must remain outside verificationMod');
  assertNonOverlap(networkSpan, telemetrySpan, 'network root must remain outside telemetry');
  assertNonOverlap(networkSpan, footerSpan, 'network root must remain outside portalFooter');
  assert.doesNotMatch(networkShell, /<form\b/);
  assert.doesNotMatch(networkShell, /<script\b/);
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
  const globalFirst = api.getGlobalSurfaceRegistrations('NETWORK');
  const globalSecond = api.getGlobalSurfaceRegistrations('NETWORK');
  const snapshot = api.getRegistrationSnapshot();

  assert.notEqual(first, second);
  assert.notEqual(globalFirst, globalSecond);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.PRIMARY_SURFACES), true);
  assert.equal(Object.isFrozen(api.CONTEXTUAL_SURFACES), true);
  assert.equal(Object.isFrozen(api.GLOBAL_SURFACES), true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first[0]), true);
  assert.equal(Object.isFrozen(globalFirst), true);
  assert.equal(Object.isFrozen(globalFirst[0]), true);
  assert.equal(globalFirst[0].category, 'GLOBAL');
  assert.deepEqual(Object.keys(first[0]).sort(), ['category', 'id', 'selector', 'surface']);
  assert.equal(Object.prototype.hasOwnProperty.call(first[0], 'element'), false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.primary), true);
  assert.equal(Object.isFrozen(snapshot.primary.RECIPIENTS), true);
  assert.equal(Object.isFrozen(snapshot.global), true);
  assert.equal(Object.isFrozen(snapshot.global.NETWORK), true);
  assert.equal(snapshot.global.NETWORK[0].category, 'GLOBAL');
});

test('unsupported or malformed registrations fail deterministically', () => {
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('badPrimary', { 'data-portal-primary-surface': 'SYSTEM' }));
      return loadRegistry(nodes);
    },
    'portal-primary-surface-invalid'
  );
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('badContextual', { 'data-portal-contextual-surface': 'ACTIVITY' }));
      return loadRegistry(nodes);
    },
    'portal-contextual-surface-invalid'
  );
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('emptyPrimary', { 'data-portal-primary-surface': '' }));
      return loadRegistry(nodes);
    },
    'portal-surface-registration-malformed'
  );
});

test('duplicate, unstable, dual-role, and missing Transfer registrations fail', () => {
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('transferMod', { 'data-portal-primary-surface': 'ACTIVITY' }));
      return loadRegistry(nodes);
    },
    'portal-surface-registration-duplicate'
  );
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('', { 'data-portal-primary-surface': 'RECIPIENTS' }));
      return loadRegistry(nodes);
    },
    'portal-surface-registration-unstable'
  );
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('bad:id', { 'data-portal-primary-surface': 'RECIPIENTS' }));
      return loadRegistry(nodes);
    },
    'portal-surface-registration-unstable'
  );
  assertErrorCode(
    () => {
      const nodes = createRegisteredNodes();
      nodes.push(createFakeElement('dual', {
        'data-portal-primary-surface': 'RECIPIENTS',
        'data-portal-contextual-surface': 'SYSTEM',
      }));
      return loadRegistry(nodes);
    },
    'portal-surface-registration-dual-role'
  );
  assertErrorCode(
    () => {
      const modules = createFakeElement('modules');
      const network = createFakeElement('networkMod', { 'data-portal-global-surface': 'NETWORK' });
      const receipt = createFakeElement('receiptHistory', { 'data-portal-primary-surface': 'ACTIVITY' });

      network.parentNode = modules;

      return loadRegistry([modules, network, receipt]);
    },
    'portal-transfer-surface-missing'
  );
});

test('invalid API lookup values fail deterministically', () => {
  const { api } = loadRegistry();

  assertErrorCode(() => api.getPrimarySurfaceRegistrations('SYSTEM'), 'portal-primary-surface-invalid');
  assertErrorCode(() => api.getContextualSurfaceRegistrations('TRANSFER'), 'portal-contextual-surface-invalid');
  assertErrorCode(() => api.getGlobalSurfaceRegistrations('TRANSFER'), 'portal-global-surface-invalid');
});

test('global network registration validates in place and rejects drift deterministically', () => {
  const loaded = loadRegistry();
  const snapshotBefore = plainSnapshot(loaded.api.getRegistrationSnapshot());
  const network = loaded.nodes.find((node) => node.id === 'networkMod');
  const transfer = loaded.nodes.find((node) => node.id === 'transferMod');
  const verification = loaded.nodes.find((node) => node.id === 'verificationMod');
  const modules = loaded.nodes.find((node) => node.id === 'modules');

  network.removeAttribute('data-portal-global-surface');
  assertErrorCode(() => loaded.api.validate(), 'portal-global-surface-missing');
  assert.deepEqual(plainSnapshot(loaded.api.getRegistrationSnapshot()), snapshotBefore);

  network.setAttribute('data-portal-global-surface', 'SYSTEM');
  assertErrorCode(() => loaded.api.validate(), 'portal-global-surface-invalid');
  network.setAttribute('data-portal-global-surface', 'NETWORK');

  const missingIdRoot = createFakeElement('', { 'data-portal-global-surface': 'NETWORK' });
  missingIdRoot.parentNode = modules;
  assertErrorCode(() => loadRegistry(loaded.nodes.concat([missingIdRoot])), 'portal-surface-registration-unstable');

  const unsafeIdRoot = createFakeElement('bad:id', { 'data-portal-global-surface': 'NETWORK' });
  unsafeIdRoot.parentNode = modules;
  assertErrorCode(() => loadRegistry(loaded.nodes.concat([unsafeIdRoot])), 'portal-surface-registration-unstable');

  const duplicateRoot = createFakeElement('networkTwin', { 'data-portal-global-surface': 'NETWORK' });
  duplicateRoot.parentNode = modules;
  assertErrorCode(() => loadRegistry(loaded.nodes.concat([duplicateRoot])), 'portal-global-surface-duplicate');

  const duplicateIdRoot = createFakeElement('networkMod', { 'data-portal-global-surface': 'NETWORK' });
  duplicateIdRoot.parentNode = modules;
  assertErrorCode(() => loadRegistry(loaded.nodes.concat([duplicateIdRoot])), 'portal-surface-registration-duplicate');

  network.setAttribute('data-portal-primary-surface', 'TRANSFER');
  assertErrorCode(() => loaded.api.validate(), 'portal-surface-registration-dual-role');
  network.removeAttribute('data-portal-primary-surface');

  network.setAttribute('data-portal-contextual-surface', 'SYSTEM');
  assertErrorCode(() => loaded.api.validate(), 'portal-surface-registration-dual-role');
  network.removeAttribute('data-portal-contextual-surface');

  network.setAttribute('data-portal-primary-surface', 'TRANSFER');
  network.setAttribute('data-portal-contextual-surface', 'SYSTEM');
  assertErrorCode(() => loaded.api.validate(), 'portal-surface-registration-dual-role');
  network.removeAttribute('data-portal-primary-surface');
  network.removeAttribute('data-portal-contextual-surface');

  network.parentNode = transfer;
  assertErrorCode(() => loaded.api.validate(), 'portal-global-surface-nested');
  network.parentNode = verification;
  assertErrorCode(() => loaded.api.validate(), 'portal-global-surface-nested');
  network.parentNode = null;
  assertErrorCode(() => loaded.api.validate(), 'portal-global-surface-outside-region');
});

test('validate rescans current metadata without mutating original snapshot', () => {
  const loaded = loadRegistry();
  const snapshotBefore = plainSnapshot(loaded.api.getRegistrationSnapshot());
  const ccIntake = loaded.nodes.find((node) => node.id === 'ccIntake');
  const transfer = loaded.nodes.find((node) => node.id === 'transferMod');
  const companion = loaded.nodes.find((node) => node.id === 'companion');

  ccIntake.removeAttribute('data-portal-primary-surface');
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
    ...snapshot.primary.RECIPIENTS,
    ...snapshot.primary.ACTIVITY,
    ...snapshot.contextual.VERIFICATION,
    ...snapshot.contextual.SYSTEM,
    ...snapshot.global.NETWORK,
  ];
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const entry of registered) {
    assert.equal(byId.get(entry.id).id, entry.id);
    assert.equal(entry.selector, `#${entry.id}`);
    assert.deepEqual(Object.keys(entry).sort(), ['category', 'id', 'selector', 'surface']);
    assert.equal(Object.prototype.hasOwnProperty.call(entry, 'element'), false);
    if (entry.id === 'networkMod') {
      assert.equal(entry.category, 'GLOBAL');
    }
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

test('primary navigation remains outside surface registration', () => {
  const source = read(registryModulePath);
  const html = read(portalIndexPath);
  const api = loadRegistry().api;
  const snapshot = api.getRegistrationSnapshot();

  assert.doesNotMatch(source, /\bIX_PORTAL_NAVIGATION_COORDINATOR\b/);
  assert.doesNotMatch(source, /\bdata-portal-navigation-destination\b/);
  assert.doesNotMatch(source, /\baria-current\b/);
  assert.equal(ids(snapshot.primary.TRANSFER).join(','), 'ccIntake,companion,transferMod');
  assert.equal(ids(snapshot.primary.RECIPIENTS).join(','), 'recipientsMod');
  assert.equal(ids(snapshot.primary.ACTIVITY).join(','), 'activityMod');
  assert.equal(ids(snapshot.contextual.VERIFICATION).join(','), 'verificationMod');
  assert.equal(ids(snapshot.contextual.SYSTEM).join(','), 'portalFooter,telemetry');
  assert.equal(ids(snapshot.global.NETWORK).join(','), 'networkMod');
  assert.equal(
    snapshot.primary.TRANSFER.map((entry) => entry.selector).join(','),
    '#ccIntake,#companion,#transferMod'
  );

  if (html.includes('id="portalPrimaryNav"')) {
    const navStart = html.indexOf('<nav id="portalPrimaryNav"');
    const statusStart = html.indexOf('<p id="portalPrimaryNavStatus"');
    const navTag = html.slice(navStart, html.indexOf('>', navStart) + 1);
    const statusTag = html.slice(statusStart, html.indexOf('>', statusStart) + 1);

    assert.doesNotMatch(navTag, /data-portal-(primary|contextual|global)-surface=/);
    assert.doesNotMatch(statusTag, /data-portal-(primary|contextual|global)-surface=/);
    assert.doesNotMatch(navTag, /aria-controls=/);
    assert.doesNotMatch(statusTag, /aria-controls=/);
  }
});
