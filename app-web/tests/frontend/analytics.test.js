const assert = require('node:assert/strict');
const path   = require('node:path');

// ---- test harness (matches observability.test.js pattern) ----

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
// analytics.js is a browser IIFE that reads/writes window.IX and
// window.location. We reset global state between loads so each test
// group starts clean.

function loadAnalytics(preIX = {}) {
  const analyticsPath = path.resolve(
    __dirname, '../../frontend/public/js/analytics.js'
  );
  delete require.cache[analyticsPath];

  global.window = {
    IX: Object.assign({}, preIX),
    location: { pathname: '/test-page' },
  };

  require(analyticsPath);
  return global.window.IX;
}

// ---- Module shape ----

test('IX.track is a function after load', () => {
  const IX = loadAnalytics();
  assert.equal(typeof IX.track, 'function');
});

test('IX._bucketAmount is a function after load', () => {
  const IX = loadAnalytics();
  assert.equal(typeof IX._bucketAmount, 'function');
});

test('IX._analyticsEnabled is false by default', () => {
  const IX = loadAnalytics();
  assert.equal(IX._analyticsEnabled, false);
});

test('IX._analyticsBackend is null by default', () => {
  const IX = loadAnalytics();
  assert.equal(IX._analyticsBackend, null);
});

// ---- Consent gate ----

test('track() with consent denied does not call backend', () => {
  const IX = loadAnalytics();
  let called = false;
  IX._analyticsBackend = () => { called = true; };
  IX._analyticsEnabled = false;
  IX.track('portal_opened');
  assert.equal(called, false);
});

test('track() with consent granted calls backend', () => {
  const IX = loadAnalytics();
  let received = null;
  IX._analyticsBackend = (event, props) => { received = { event, props }; };
  IX._analyticsEnabled = true;
  IX.track('portal_opened');
  assert.equal(received.event, 'portal_opened');
});

test('track() passes props to backend', () => {
  const IX = loadAnalytics();
  let received = null;
  IX._analyticsBackend = (event, props) => { received = props; };
  IX._analyticsEnabled = true;
  IX.track('wallet_connected', { chain: 137 });
  assert.equal(received.chain, 137);
});

test('track() always stamps timestamp in props', () => {
  const IX = loadAnalytics();
  let received = null;
  IX._analyticsBackend = (_, props) => { received = props; };
  IX._analyticsEnabled = true;
  IX.track('review_reached');
  assert.ok(typeof received.timestamp === 'number');
});

// ---- Safety / no-throw guarantees ----

test('track() with no backend does not throw', () => {
  const IX = loadAnalytics();
  IX._analyticsEnabled = true;
  IX._analyticsBackend = null;
  assert.doesNotThrow(() => IX.track('portal_opened'));
});

test('track() with throwing backend does not propagate error', () => {
  const IX = loadAnalytics();
  IX._analyticsEnabled = true;
  IX._analyticsBackend = () => { throw new Error('backend exploded'); };
  assert.doesNotThrow(() => IX.track('transfer_confirmed'));
});

test('track() with null event does not throw', () => {
  const IX = loadAnalytics();
  IX._analyticsEnabled = true;
  IX._analyticsBackend = () => {};
  assert.doesNotThrow(() => IX.track(null));
});

test('track() with undefined props does not throw', () => {
  const IX = loadAnalytics();
  IX._analyticsEnabled = true;
  IX._analyticsBackend = () => {};
  assert.doesNotThrow(() => IX.track('portal_opened', undefined));
});

// ---- page_view auto-fire ----

test('page_view fires on load when backend is pre-wired and enabled', () => {
  const events = [];
  const IX = loadAnalytics({
    _analyticsEnabled: true,
    _analyticsBackend: (event, props) => events.push({ event, props }),
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'page_view');
  assert.equal(events[0].props.page, '/test-page');
});

test('page_view does not fire on load when consent is denied', () => {
  const events = [];
  loadAnalytics({
    _analyticsEnabled: false,
    _analyticsBackend: (event) => events.push(event),
  });
  assert.equal(events.length, 0);
});

// ---- Amount bucketing ----

test('bucket: 1 → "1-10"',   () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(1),   '1-10');    });
test('bucket: 10 → "1-10"',  () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(10),  '1-10');    });
test('bucket: 11 → "11-50"', () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(11),  '11-50');   });
test('bucket: 50 → "11-50"', () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(50),  '11-50');   });
test('bucket: 51 → "51-100"',  () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(51),  '51-100');  });
test('bucket: 100 → "51-100"', () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(100), '51-100');  });
test('bucket: 101 → "101-250"', () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(101), '101-250'); });
test('bucket: 250 → "101-250"', () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(250), '101-250'); });
test('bucket: 251 → "250+"',    () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(251), '250+');    });
test('bucket: 1000 → "250+"',   () => { const { _bucketAmount: b } = loadAnalytics(); assert.equal(b(1000),'250+');    });
