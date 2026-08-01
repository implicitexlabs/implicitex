const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const modulePath = path.join(repoRoot, 'app-web/frontend/public/js/portal-view-state.js');

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

function createVmContextWithForbiddenTraps() {
  const window = {};
  const context = { window };

  defineThrowingGetter(context, 'document');
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

  defineThrowingGetter(window, 'document');
  defineThrowingGetter(window, 'localStorage');
  defineThrowingGetter(window, 'sessionStorage');
  defineThrowingGetter(window, 'indexedDB');
  defineThrowingGetter(window, 'location');
  defineThrowingGetter(window, 'history');
  defineThrowingGetter(window, 'IX_EXECUTION');
  defineThrowingGetter(window, 'IX_COIN_CARD_VERIFICATION');
  defineThrowingGetter(window, 'IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION');
  defineThrowingGetter(window, 'IX_COIN_CARD_LIFECYCLE_RESOLUTION');

  return context;
}

function loadPortalViewState(options = {}) {
  const context = options.trapForbiddenAuthorities
    ? createVmContextWithForbiddenTraps()
    : { window: {} };
  const windowKeysBeforeLoad = Reflect.ownKeys(context.window);

  vm.runInNewContext(read(modulePath), context, { filename: modulePath });
  return {
    api: context.window.IX_PORTAL_VIEW_STATE,
    context,
    windowKeysBeforeLoad,
  };
}

function assertImmutable(value) {
  assert.equal(Object.isFrozen(value), true);
  const original = value.primaryDestination;
  try {
    value.primaryDestination = 'ACTIVITY';
  } catch (error) {
    assert(error instanceof TypeError || error.name === 'TypeError');
  }
  assert.equal(value.primaryDestination, original);
}

function assertErrorCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

test('default state is deterministic Transfer with no contextual layer', () => {
  const { api } = loadPortalViewState();
  const state = api.createDefaultState();

  assert.equal(state.primaryDestination, api.PRIMARY_DESTINATIONS.TRANSFER);
  assert.equal(state.contextualLayer, null);
  assert.equal(api.DEFAULT_STATE.primaryDestination, api.PRIMARY_DESTINATIONS.TRANSFER);
  assert.equal(api.DEFAULT_STATE.contextualLayer, null);
  assertImmutable(state);
  assert.notEqual(state, api.DEFAULT_STATE);
});

test('valid primary destination transitions preserve contextual layer', () => {
  const { api } = loadPortalViewState();
  let state = api.createDefaultState();
  state = api.openContextualLayer(state, api.CONTEXTUAL_LAYERS.SYSTEM);

  const recipients = api.setPrimaryDestination(state, api.PRIMARY_DESTINATIONS.RECIPIENTS);
  assert.equal(recipients.primaryDestination, api.PRIMARY_DESTINATIONS.RECIPIENTS);
  assert.equal(recipients.contextualLayer, api.CONTEXTUAL_LAYERS.SYSTEM);

  const activity = api.setPrimaryDestination(recipients, api.PRIMARY_DESTINATIONS.ACTIVITY);
  assert.equal(activity.primaryDestination, api.PRIMARY_DESTINATIONS.ACTIVITY);
  assert.equal(activity.contextualLayer, api.CONTEXTUAL_LAYERS.SYSTEM);

  const transfer = api.setPrimaryDestination(activity, api.PRIMARY_DESTINATIONS.TRANSFER);
  assert.equal(transfer.primaryDestination, api.PRIMARY_DESTINATIONS.TRANSFER);
  assert.equal(transfer.contextualLayer, api.CONTEXTUAL_LAYERS.SYSTEM);
});

test('valid contextual layer opening and closing preserves primary destination', () => {
  const { api } = loadPortalViewState();
  const recipients = api.setPrimaryDestination(
    api.createDefaultState(),
    api.PRIMARY_DESTINATIONS.RECIPIENTS
  );

  const verification = api.openContextualLayer(recipients, api.CONTEXTUAL_LAYERS.VERIFICATION);
  assert.equal(verification.primaryDestination, api.PRIMARY_DESTINATIONS.RECIPIENTS);
  assert.equal(verification.contextualLayer, api.CONTEXTUAL_LAYERS.VERIFICATION);

  const system = api.openContextualLayer(verification, api.CONTEXTUAL_LAYERS.SYSTEM);
  assert.equal(system.primaryDestination, api.PRIMARY_DESTINATIONS.RECIPIENTS);
  assert.equal(system.contextualLayer, api.CONTEXTUAL_LAYERS.SYSTEM);

  const closed = api.closeContextualLayer(system);
  assert.equal(closed.primaryDestination, api.PRIMARY_DESTINATIONS.RECIPIENTS);
  assert.equal(closed.contextualLayer, null);
  assertImmutable(closed);
});

test('Verification and System are rejected as primary destinations', () => {
  const { api } = loadPortalViewState();
  const state = api.createDefaultState();

  assertErrorCode(
    () => api.setPrimaryDestination(state, api.CONTEXTUAL_LAYERS.VERIFICATION),
    'portal-primary-destination-invalid'
  );
  assertErrorCode(
    () => api.setPrimaryDestination(state, api.CONTEXTUAL_LAYERS.SYSTEM),
    'portal-primary-destination-invalid'
  );
});

test('Transfer, Recipients, and Activity are rejected as contextual layers', () => {
  const { api } = loadPortalViewState();
  const state = api.createDefaultState();

  for (const destination of Object.values(api.PRIMARY_DESTINATIONS)) {
    assertErrorCode(
      () => api.openContextualLayer(state, destination),
      'portal-contextual-layer-invalid'
    );
  }
});

test('invalid values fail deterministically', () => {
  const { api } = loadPortalViewState();
  const state = api.createDefaultState();

  assertErrorCode(() => api.setPrimaryDestination(state, 'SYSTEM'), 'portal-primary-destination-invalid');
  assertErrorCode(() => api.openContextualLayer(state, 'TRANSFER'), 'portal-contextual-layer-invalid');
  assertErrorCode(() => api.normalizeState(null), 'portal-view-state-invalid');
  assertErrorCode(() => api.normalizeState([]), 'portal-view-state-invalid');
  assertErrorCode(() => api.normalizeState({ primaryDestination: 'TRANSFER' }), 'portal-view-state-invalid');
  assertErrorCode(
    () => api.normalizeState({
      primaryDestination: 'TRANSFER',
      contextualLayer: null,
      extra: true,
    }),
    'portal-view-state-invalid'
  );
});

test('state normalization rejects accessors, symbols, arrays, and custom prototypes', () => {
  const { api } = loadPortalViewState();
  const accessorState = {};
  Object.defineProperty(accessorState, 'primaryDestination', {
    get() {
      return 'TRANSFER';
    },
  });
  Object.defineProperty(accessorState, 'contextualLayer', {
    value: null,
    enumerable: true,
  });

  const symbolState = {
    primaryDestination: 'TRANSFER',
    contextualLayer: null,
  };
  symbolState[Symbol('hidden')] = true;

  const customPrototype = Object.create({ inherited: true });
  customPrototype.primaryDestination = 'TRANSFER';
  customPrototype.contextualLayer = null;

  assertErrorCode(() => api.normalizeState(accessorState), 'portal-view-state-invalid');
  assertErrorCode(() => api.normalizeState(symbolState), 'portal-view-state-invalid');
  assertErrorCode(() => api.normalizeState(customPrototype), 'portal-view-state-invalid');
});

test('returned states and exported constants are immutable', () => {
  const { api } = loadPortalViewState();
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.PRIMARY_DESTINATIONS), true);
  assert.equal(Object.isFrozen(api.CONTEXTUAL_LAYERS), true);
  assert.equal(Object.isFrozen(api.DEFAULT_STATE), true);

  const state = api.openContextualLayer(
    api.setPrimaryDestination(api.createDefaultState(), api.PRIMARY_DESTINATIONS.ACTIVITY),
    api.CONTEXTUAL_LAYERS.VERIFICATION
  );

  assertImmutable(state);
});

test('module has no forbidden static dependency mechanisms', () => {
  const source = read(modulePath);

  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bsessionStorage\b/);
  assert.doesNotMatch(source, /\bindexedDB\b/);
  assert.doesNotMatch(source, /\bdocument\b/);
  assert.doesNotMatch(source, /\bquerySelector\b/);
  assert.doesNotMatch(source, /\bgetElementById\b/);
  assert.doesNotMatch(source, /\baddEventListener\b/);
  assert.doesNotMatch(source, /\bdispatchEvent\b/);
  assert.doesNotMatch(source, /\bwindow\.location\b/);
  assert.doesNotMatch(source, /\bwindow\.history\b/);
  assert.doesNotMatch(source, /\bpushState\b/);
  assert.doesNotMatch(source, /\breplaceState\b/);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bIX_EXECUTION\b/);
  assert.doesNotMatch(source, /\bIX_COIN_CARD(?:_[A-Z0-9_]+)?\b/);
  assert.doesNotMatch(source, /receipt-store/);
  assert.doesNotMatch(source, /\brequire\s*\(/);
  assert.doesNotMatch(source, /\bimport\s+[^;(]/);
});

test('module does not access forbidden browser or product authorities at runtime', () => {
  const { api } = loadPortalViewState({ trapForbiddenAuthorities: true });
  const state = api.createDefaultState();
  const normalized = api.normalizeState(state);
  const activity = api.setPrimaryDestination(normalized, api.PRIMARY_DESTINATIONS.ACTIVITY);
  const verification = api.openContextualLayer(activity, api.CONTEXTUAL_LAYERS.VERIFICATION);
  const system = api.openContextualLayer(verification, api.CONTEXTUAL_LAYERS.SYSTEM);
  const closed = api.closeContextualLayer(system);

  assert.equal(closed.primaryDestination, api.PRIMARY_DESTINATIONS.ACTIVITY);
  assert.equal(closed.contextualLayer, null);
});

test('module exports only IX_PORTAL_VIEW_STATE on window', () => {
  const { context, windowKeysBeforeLoad } = loadPortalViewState({
    trapForbiddenAuthorities: true,
  });
  const windowKeysAfterLoad = Reflect.ownKeys(context.window);
  const addedKeys = windowKeysAfterLoad.filter(
    (key) => !windowKeysBeforeLoad.includes(key)
  );
  const removedKeys = windowKeysBeforeLoad.filter(
    (key) => !windowKeysAfterLoad.includes(key)
  );
  const addedSymbols = addedKeys.filter((key) => typeof key === 'symbol');

  assert.deepEqual(addedKeys, ['IX_PORTAL_VIEW_STATE']);
  assert.deepEqual(removedKeys, []);
  assert.deepEqual(addedSymbols, []);
});
