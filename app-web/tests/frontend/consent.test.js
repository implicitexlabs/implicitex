const assert = require('node:assert/strict');
const path   = require('node:path');

// ---- test harness ----

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

// ---- loader ----
// consent.js is a browser IIFE that reads/writes localStorage and
// manipulates document.body. We mock the minimum browser surface needed.

function loadConsent(opts) {
  opts = opts || {};

  var storedConsent = opts.storedConsent !== undefined ? opts.storedConsent : null;
  var storedSchemaVersion = opts.storedSchemaVersion !== undefined ? opts.storedSchemaVersion : null;
  var cookieConsent = opts.cookieConsent !== undefined ? opts.cookieConsent : null;
  var cookieSchemaVersion = opts.cookieSchemaVersion !== undefined ? opts.cookieSchemaVersion : null;
  var preIX         = opts.preIX || {};
  var readyState    = opts.readyState || 'complete';

  var consentPath = path.resolve(__dirname, '../../frontend/public/js/consent.js');
  delete require.cache[consentPath];

  // Track DOM mutations
  var appendedChildren = [];
  var eventListeners   = {};
  var cookieJar = {};

  function setCookieFromString(value) {
    var segments = value.split(';').map(function (part) { return part.trim(); });
    var pair = segments.shift();
    var eqIndex = pair.indexOf('=');
    var key = pair.slice(0, eqIndex);
    var rawValue = pair.slice(eqIndex + 1);
    var maxAge = null;

    segments.forEach(function (segment) {
      var lower = segment.toLowerCase();
      if (lower.indexOf('max-age=') === 0) {
        maxAge = parseInt(segment.slice(8), 10);
      }
    });

    if (maxAge === 0) {
      delete cookieJar[key];
      return;
    }

    cookieJar[key] = decodeURIComponent(rawValue);
  }

  function cookieString() {
    return Object.keys(cookieJar).map(function (key) {
      return key + '=' + encodeURIComponent(cookieJar[key]);
    }).join('; ');
  }

  if (cookieConsent !== null) {
    cookieJar['implicitex-analytics-consent'] = cookieConsent;
  }
  if (cookieSchemaVersion !== null) {
    cookieJar['implicitex-analytics-consent-schema'] = cookieSchemaVersion;
  }

  global.document = {
    readyState: readyState,
    addEventListener: function (event, fn) {
      eventListeners[event] = fn;
    },
    getElementById: function (id) {
      // Return stub buttons for banner interactions
      var btn = {
        _handlers: {},
        addEventListener: function (evt, fn) { this._handlers[evt] = fn; },
        click: function () { if (this._handlers['click']) this._handlers['click'](); },
      };
      return btn;
    },
    createElement: function () {
      return {
        id: '',
        className: '',
        innerHTML: '',
        setAttribute: function () {},
        parentNode: { removeChild: function () {} },
      };
    },
    body: {
      appendChild: function (el) { appendedChildren.push(el); },
    },
  };

  Object.defineProperty(global.document, 'cookie', {
    configurable: true,
    enumerable: true,
    get: function () {
      return cookieString();
    },
    set: function (value) {
      setCookieFromString(value);
    },
  });

  global.localStorage = {
    _store: {
      'implicitex-analytics-consent': storedConsent,
      'implicitex-analytics-consent-schema': storedSchemaVersion,
    },
    getItem: function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem: function (k, v) { this._store[k] = v; },
  };

  global.window = {
    IX: Object.assign({ _analyticsEnabled: false, track: null }, preIX),
    location: { pathname: '/test-page' },
  };

  require(consentPath);

  return {
    IX:              global.window.IX,
    localStorage:    global.localStorage,
    cookieJar:       cookieJar,
    appendedChildren: appendedChildren,
    eventListeners:  eventListeners,
    triggerDOMReady: function () {
      if (eventListeners['DOMContentLoaded']) eventListeners['DOMContentLoaded']();
    },
  };
}

// ---- Stored consent: accepted ----

test('stored accepted: IX._analyticsEnabled becomes true', () => {
  var { IX } = loadConsent({ storedConsent: 'accepted' });
  assert.equal(IX._analyticsEnabled, true);
});

test('stored accepted: page_view fires via IX.track', () => {
  var received = null;
  var { IX } = loadConsent({
    storedConsent: 'accepted',
    preIX: { track: function (evt, props) { received = { evt, props }; } },
  });
  assert.equal(received.evt, 'page_view');
  assert.equal(received.props.page, '/test-page');
});

test('stored accepted: no banner injected into DOM', () => {
  var { appendedChildren } = loadConsent({ storedConsent: 'accepted' });
  assert.equal(appendedChildren.length, 0);
});

test('stored accepted in cookie: IX._analyticsEnabled becomes true', () => {
  var { IX } = loadConsent({ cookieConsent: 'accepted' });
  assert.equal(IX._analyticsEnabled, true);
});

// ---- Stored consent: declined ----

test('stored declined: IX._analyticsEnabled stays false', () => {
  var { IX } = loadConsent({ storedConsent: 'declined' });
  assert.equal(IX._analyticsEnabled, false);
});

test('stored declined: no banner injected into DOM', () => {
  var { appendedChildren } = loadConsent({ storedConsent: 'declined' });
  assert.equal(appendedChildren.length, 0);
});

test('stored declined in cookie: no banner injected into DOM', () => {
  var { appendedChildren } = loadConsent({ cookieConsent: 'declined' });
  assert.equal(appendedChildren.length, 0);
});

test('stored declined: IX.track is not called', () => {
  var called = false;
  loadConsent({
    storedConsent: 'declined',
    preIX: { track: function () { called = true; } },
  });
  assert.equal(called, false);
});

// ---- No stored consent — banner display ----

test('no stored consent + DOM ready: banner injected', () => {
  var { appendedChildren } = loadConsent({ storedConsent: null, readyState: 'complete' });
  assert.equal(appendedChildren.length, 1);
});

test('no stored consent + DOM loading: banner deferred to DOMContentLoaded', () => {
  var { appendedChildren, triggerDOMReady } = loadConsent({
    storedConsent: null,
    readyState: 'loading',
  });
  // Should not appear before DOM is ready
  assert.equal(appendedChildren.length, 0);
  // Should appear after DOMContentLoaded fires
  triggerDOMReady();
  assert.equal(appendedChildren.length, 1);
});

test('no stored consent: IX._analyticsEnabled stays false until interaction', () => {
  var { IX } = loadConsent({ storedConsent: null });
  assert.equal(IX._analyticsEnabled, false);
});

// ---- localStorage writes ----

test('no stored consent: localStorage not written until user acts', () => {
  var { localStorage } = loadConsent({ storedConsent: null });
  assert.equal(localStorage.getItem('implicitex-analytics-consent'), null);
});

test('stored accepted: localStorage value is preserved', () => {
  var { localStorage } = loadConsent({ storedConsent: 'accepted' });
  assert.equal(localStorage.getItem('implicitex-analytics-consent'), 'accepted');
});

test('stored declined: localStorage value is preserved', () => {
  var { localStorage } = loadConsent({ storedConsent: 'declined' });
  assert.equal(localStorage.getItem('implicitex-analytics-consent'), 'declined');
});

test('stored accepted writes consent schema version', () => {
  var { localStorage, cookieJar } = loadConsent({ storedConsent: 'accepted' });
  assert.equal(localStorage.getItem('implicitex-analytics-consent-schema'), '1');
  assert.equal(cookieJar['implicitex-analytics-consent-schema'], '1');
});

test('stored declined writes consent schema version', () => {
  var { localStorage, cookieJar } = loadConsent({ storedConsent: 'declined' });
  assert.equal(localStorage.getItem('implicitex-analytics-consent-schema'), '1');
  assert.equal(cookieJar['implicitex-analytics-consent-schema'], '1');
});

// ---- Safety: no IX object ----

test('stored accepted with no IX object does not throw', () => {
  assert.doesNotThrow(() => {
    global.window = { location: { pathname: '/' } };
    // window.IX is absent
    var consentPath = path.resolve(__dirname, '../../frontend/public/js/consent.js');
    delete require.cache[consentPath];
    require(consentPath);
  });
});

test('stored accepted with no IX.track does not throw', () => {
  assert.doesNotThrow(() => {
    loadConsent({
      storedConsent: 'accepted',
      preIX: { _analyticsEnabled: false }, // track is absent
    });
  });
});

test('localStorage throws: does not crash, banner shows instead', () => {
  var consentPath = path.resolve(__dirname, '../../frontend/public/js/consent.js');
  delete require.cache[consentPath];

  var appendedChildren = [];
  global.localStorage = {
    getItem: function () { throw new Error('storage unavailable'); },
    setItem: function () { throw new Error('storage unavailable'); },
  };
  global.window = {
    IX: { _analyticsEnabled: false, track: null },
    location: { pathname: '/' },
  };
  global.document = {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: function () {
      return { addEventListener: function () {} };
    },
    createElement: function () {
      return { id: '', className: '', innerHTML: '', setAttribute: function () {},
                parentNode: { removeChild: function () {} } };
    },
    body: { appendChild: function (el) { appendedChildren.push(el); } },
  };

  assert.doesNotThrow(() => require(consentPath));
  // When storage is unavailable, banner should still appear (no stored preference readable)
  assert.equal(appendedChildren.length, 1);
});

test('schema version mismatch causes the banner to reappear', () => {
  var { appendedChildren } = loadConsent({
    storedConsent: 'accepted',
    storedSchemaVersion: '0',
  });

  assert.equal(appendedChildren.length, 1);
});

test('cookie persistence survives localStorage failure', () => {
  var consentPath = path.resolve(__dirname, '../../frontend/public/js/consent.js');
  delete require.cache[consentPath];

  global.localStorage = {
    getItem: function () { throw new Error('storage unavailable'); },
    setItem: function () { throw new Error('storage unavailable'); },
  };
  global.window = {
    IX: { _analyticsEnabled: false, track: null },
    location: { pathname: '/', protocol: 'https:' },
  };
  global.document = {
    readyState: 'complete',
    addEventListener: function () {},
    getElementById: function () {
      return { addEventListener: function () {} };
    },
    createElement: function () {
      return { id: '', className: '', innerHTML: '', setAttribute: function () {},
                parentNode: { removeChild: function () {} } };
    },
    body: { appendChild: function () {} },
  };

  var cookieJar = { 'implicitex-analytics-consent': 'accepted', 'implicitex-analytics-consent-schema': '1' };
  Object.defineProperty(global.document, 'cookie', {
    configurable: true,
    enumerable: true,
    get: function () {
      return Object.keys(cookieJar).map(function (key) {
        return key + '=' + encodeURIComponent(cookieJar[key]);
      }).join('; ');
    },
    set: function (value) {
      var segments = value.split(';').map(function (part) { return part.trim(); });
      var pair = segments.shift();
      var eqIndex = pair.indexOf('=');
      var key = pair.slice(0, eqIndex);
      cookieJar[key] = decodeURIComponent(pair.slice(eqIndex + 1));
    },
  });

  assert.doesNotThrow(() => require(consentPath));
  assert.equal(global.window.IX._analyticsEnabled, true);
});
