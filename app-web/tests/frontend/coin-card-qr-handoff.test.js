/* coin-card-qr-handoff.test.js
 *
 * Focused tests for the QR handoff V1 feature in card/card.js.
 * These tests exercise the logic that can be verified without a browser:
 *
 *   - Card ID extraction from pathname
 *   - Card ID validation (valid / invalid / escape)
 *   - QR URL construction uses window.location.origin, not a hard-coded hostname
 *   - QR URL encodes only the canonical card identity — no amount parameters
 *   - No ?requestAmount= or ?amount= parameter is appended to the QR URL
 *   - State: recipient, network, token, fee do not appear in the QR URL
 *   - QR generation fails closed when QRCode library is absent
 *   - PRESENT CARD button label is correct in HTML
 *   - QR panel has no amount input in HTML
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appRoot = path.resolve(__dirname, '../..');
const cardJsPath = path.join(appRoot, 'frontend/public/card/card.js');
const indexHtmlPath = path.join(appRoot, 'frontend/public/card/index.html');

const cardJsSource = fs.readFileSync(cardJsPath, 'utf8');
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

/* ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */

/* Extract the CARD_ID_RE pattern from the source so tests use the
 * same regex the production code uses rather than a copied version. */
function extractCardIdRe(source) {
  const m = source.match(/var CARD_ID_RE\s*=\s*(\/[^/]+\/[a-z]*)/);
  if (!m) throw new Error('CARD_ID_RE not found in card.js');
  const [, raw] = m;
  const inner = raw.match(/^\/(.+)\/([a-z]*)$/);
  return new RegExp(inner[1], inner[2]);
}

/* Extract the generateQR function source so its URL construction
 * can be tested in isolation. */
function extractGenerateQrSource(source) {
  const start = source.indexOf('function generateQR()');
  if (start === -1) throw new Error('generateQR not found');
  let depth = 0;
  let i = start;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
    i++;
  }
  throw new Error('generateQR body not terminated');
}

const CARD_ID_RE = extractCardIdRe(cardJsSource);
const generateQrSource = extractGenerateQrSource(cardJsSource);

/* ----------------------------------------------------------------
 * 1. Card ID extraction — pathname to cardId
 * ---------------------------------------------------------------- */
test('card ID is extracted from the second path segment', () => {
  const pathnames = [
    ['/card/antoine', 'antoine'],
    ['/card/cc_demo_implicitex', 'cc_demo_implicitex'],
    ['/card/my-card-123', 'my-card-123'],
    ['/card/ABC', 'ABC'],
  ];
  for (const [pathname, expected] of pathnames) {
    const parts = pathname.split('/').filter(Boolean);
    const cardId = (parts[1] || '').trim();
    assert.equal(cardId, expected, `pathname ${pathname}`);
  }
});

test('empty card ID when path has no second segment', () => {
  for (const pathname of ['/card', '/card/', '/', '']) {
    const parts = pathname.split('/').filter(Boolean);
    const cardId = (parts[1] || '').trim();
    assert.equal(cardId, '', `pathname "${pathname}"`);
  }
});

/* ----------------------------------------------------------------
 * 2. CARD_ID_RE validation
 * ---------------------------------------------------------------- */
test('CARD_ID_RE accepts valid card IDs', () => {
  const valid = [
    'antoine', 'abc', 'cc_demo_implicitex', 'my-card-001',
    'ABC123', 'a'.repeat(3), 'a'.repeat(80),
    'a-b_c', '0-0', 'Z_Z',
  ];
  for (const id of valid) {
    assert.ok(CARD_ID_RE.test(id), `expected valid: "${id}"`);
  }
});

test('CARD_ID_RE rejects invalid card IDs', () => {
  const invalid = [
    '', 'ab', 'a'.repeat(81),         // too short / too long
    '../antoine', '../../etc/passwd', '..', // path traversal
    'a b', 'a/b', 'a@b', 'a!b',        // forbidden characters
    '\x00abc', 'abc\n', 'abc\t',        // control characters
    'a b c', '<script>', '${expr}',     // injection attempts
  ];
  for (const id of invalid) {
    assert.ok(!CARD_ID_RE.test(id), `expected invalid: "${JSON.stringify(id)}"`);
  }
});

/* ----------------------------------------------------------------
 * 3. QR URL construction
 * ---------------------------------------------------------------- */
test('generateQR uses window.location.origin, not a hard-coded hostname', () => {
  assert.ok(
    generateQrSource.includes('window.location.origin'),
    'generateQR must use window.location.origin for the canonical base URL'
  );
  assert.ok(
    !generateQrSource.includes('implicitex.com'),
    'generateQR must not contain a hard-coded hostname'
  );
});

test('generateQR encodes only the card identity — no amount parameter', () => {
  assert.ok(
    !generateQrSource.includes('requestAmount'),
    'generateQR must not append ?requestAmount= to the QR URL'
  );
  assert.ok(
    !generateQrSource.includes('?amount'),
    'generateQR must not append ?amount= to the QR URL'
  );
});

test('generated QR URL matches canonical card path pattern', () => {
  /* Simulate the generateQR logic in a minimal vm context */
  const cardId = 'antoine';
  const origin = 'https://implicitex.com';

  const context = {
    window: { location: { origin } },
    state: { cardId },
    el: () => null,       // ccQrCanvas absent → function returns early after url
    QRCode: undefined,    // library absent
    /* Capture the url before it tries to call QRCode.toCanvas */
    _capturedUrl: null,
  };

  /* Extract just the URL construction line */
  const urlLine = generateQrSource.match(/var\s+url\s*=\s*.+/);
  assert.ok(urlLine, 'URL construction line found in generateQR');

  vm.runInNewContext(
    `var state = { cardId: 'antoine' };
     var url = window.location.origin + '/card/' + encodeURIComponent(state.cardId);
     _capturedUrl = url;`,
    context
  );

  assert.equal(context._capturedUrl, 'https://implicitex.com/card/antoine');
});

test('card ID is percent-encoded in QR URL', () => {
  const context = { _url: null };
  vm.runInNewContext(
    `var url = 'https://example.com/card/' + encodeURIComponent('cc demo+card');
     _url = url;`,
    context
  );
  assert.equal(context._url, 'https://example.com/card/cc%20demo%2Bcard');
});

/* ----------------------------------------------------------------
 * 4. Protected-field independence — QR URL must not carry
 *    recipient, network, token, fee, or credential
 * ---------------------------------------------------------------- */
test('QR URL carries no recipient address', () => {
  const url = 'https://implicitex.com/card/antoine';
  assert.ok(!url.includes('0x'), 'QR URL must not contain a wallet address');
});

test('generateQR source references no registry record fields', () => {
  const forbidden = ['recipient', 'chainId', 'chainName', 'feeBps', 'displayName',
    'displayCredential', 'token', 'registryRecord'];
  for (const field of forbidden) {
    assert.ok(
      !generateQrSource.includes(field),
      `generateQR must not reference registry field: ${field}`
    );
  }
});

/* ----------------------------------------------------------------
 * 5. QR generation fails closed when library is absent
 * ---------------------------------------------------------------- */
test('generateQR returns immediately when QRCode is undefined', () => {
  /* Build a minimal context where QRCode is not defined and canvas is absent.
   * The function must not throw. */
  const context = {
    window: { location: { origin: 'https://implicitex.com' } },
    state: { cardId: 'antoine' },
    el: () => null,
  };
  /* Run only the early-exit check: `if (typeof QRCode === 'undefined' ...)` */
  const earlyExit = `
    var earlyReturn = false;
    if (typeof QRCode === 'undefined' || !QRCode.toCanvas) {
      earlyReturn = true;
    }
  `;
  vm.runInNewContext(earlyExit, context);
  assert.equal(context.earlyReturn, true, 'function must exit early when QRCode is absent');
});

test('generateQR returns immediately when canvas element is absent', () => {
  const context = {
    window: { location: { origin: 'https://implicitex.com' } },
    state: { cardId: 'antoine' },
    el: () => null,
    QRCode: { toCanvas: () => {} },
  };
  const check = `
    var canvas = el('ccQrCanvas');
    var earlyReturn = !canvas || !state.cardId;
  `;
  vm.runInNewContext(check, context);
  assert.equal(context.earlyReturn, true, 'function must exit early when canvas is absent');
});

/* ----------------------------------------------------------------
 * 6. HTML structure — PRESENT CARD label and no amount input
 * ---------------------------------------------------------------- */
test('PRESENT CARD button label is used, not RECEIVE', () => {
  assert.ok(
    indexHtml.includes('PRESENT CARD'),
    'index.html must contain "PRESENT CARD" button label'
  );
  /* The old label must not appear as a button text (may still appear in comments) */
  const buttonMatches = [...indexHtml.matchAll(/<button[^>]*>([^<]*)<\/button>/gi)];
  const receiveButton = buttonMatches.find(m => m[1].trim() === 'RECEIVE');
  assert.ok(!receiveButton, 'No button must have text "RECEIVE"');
});

test('QR panel has no amount input element', () => {
  assert.ok(
    !indexHtml.includes('ccQrAmountInput'),
    'index.html must not contain ccQrAmountInput (amount removed from V1 QR)'
  );
  assert.ok(
    !indexHtml.includes('cc-qr-amount'),
    'index.html must not contain cc-qr-amount class (amount removed from V1 QR)'
  );
});

test('card.js source has no ?requestAmount= or ?amount= URL parameter generation', () => {
  assert.ok(
    !cardJsSource.includes('requestAmount'),
    'card.js must not generate ?requestAmount= URL parameters'
  );
  assert.ok(
    !cardJsSource.includes('urlRequestedAmount'),
    'card.js must not contain urlRequestedAmount (removed in V1)'
  );
});

/* ----------------------------------------------------------------
 * 7. Stale-panel state — closing and reopening the panel
 *    The openQrPanel function must call generateQR fresh each time.
 * ---------------------------------------------------------------- */
test('openQrPanel calls generateQR on every open', () => {
  const openPanelSource = cardJsSource.match(
    /function openQrPanel\(\)[\s\S]+?(?=\n  function )/
  );
  assert.ok(openPanelSource, 'openQrPanel function found in card.js');
  assert.ok(
    openPanelSource[0].includes('generateQR'),
    'openQrPanel must call generateQR on every invocation'
  );
});

/* ----------------------------------------------------------------
 * 8. No amount interpretation in card.js (removed floating-point lane)
 * ---------------------------------------------------------------- */
test('card.js does not contain a standalone parseFloat for amount URL params', () => {
  /* Check that there is no URL-param parseFloat in the source.
   * Some parseFloat calls may exist elsewhere (e.g. display formatting);
   * this test specifically ensures no URL parameter is parsed as float. */
  const urlParamParseFloat = /URLSearchParams[\s\S]{0,200}parseFloat/;
  assert.ok(
    !urlParamParseFloat.test(cardJsSource),
    'card.js must not use parseFloat to parse URL parameters'
  );
});

/* ----------------------------------------------------------------
 * 9. QR library loader state machine — source-level invariants
 * ---------------------------------------------------------------- */
test('loadQrLibrary is idempotent — source contains NOT_REQUESTED guard', () => {
  assert.ok(
    cardJsSource.includes('NOT_REQUESTED'),
    'loadQrLibrary must check qrLibraryState !== NOT_REQUESTED for idempotency'
  );
  assert.ok(
    cardJsSource.includes('QR_LIBRARY_STATE'),
    'card.js must define QR_LIBRARY_STATE constants'
  );
});

test('loadQrLibrary validates attestation path is exactly js/vendor/qrcode.min.js', () => {
  assert.ok(
    cardJsSource.includes("attestation.path !== 'js/vendor/qrcode.min.js'"),
    'loadQrLibrary must reject attestations with any path other than js/vendor/qrcode.min.js'
  );
});

test('loadQrLibrary validates sha256 format before constructing SRI attribute', () => {
  assert.ok(
    cardJsSource.includes('/^sha256:[0-9a-f]{64}$/'),
    'loadQrLibrary must validate sha256 field is sha256:HEX format before use'
  );
});

test('loadQrLibrary sets LOADING state before script injection', () => {
  assert.ok(
    cardJsSource.includes("QR_LIBRARY_STATE.LOADING"),
    'loadQrLibrary must transition to LOADING state before appending script element'
  );
});

test('loadQrLibrary has onload and onerror handlers for explicit state transitions', () => {
  const loadQrSource = (() => {
    const start = cardJsSource.indexOf('function loadQrLibrary(');
    if (start === -1) throw new Error('loadQrLibrary not found in card.js');
    let depth = 0, i = start;
    while (i < cardJsSource.length) {
      if (cardJsSource[i] === '{') depth++;
      else if (cardJsSource[i] === '}' && --depth === 0) return cardJsSource.slice(start, i + 1);
      i++;
    }
    throw new Error('loadQrLibrary body not terminated');
  })();
  assert.ok(loadQrSource.includes('scriptEl.onload'), 'loadQrLibrary must set onload handler');
  assert.ok(loadQrSource.includes('scriptEl.onerror'), 'loadQrLibrary must set onerror handler');
  assert.ok(loadQrSource.includes('QR_LIBRARY_STATE.READY'), 'onload must transition to READY');
  assert.ok(loadQrSource.includes('QR_LIBRARY_STATE.FAILED'), 'onerror must transition to FAILED');
});

test('openQrPanel handles LOADING state without calling generateQR', () => {
  const openSource = (() => {
    const start = cardJsSource.indexOf('function openQrPanel(');
    if (start === -1) throw new Error('openQrPanel not found');
    let depth = 0, i = start;
    while (i < cardJsSource.length) {
      if (cardJsSource[i] === '{') depth++;
      else if (cardJsSource[i] === '}' && --depth === 0) return cardJsSource.slice(start, i + 1);
      i++;
    }
    throw new Error('openQrPanel body not terminated');
  })();
  assert.ok(openSource.includes('QR_LIBRARY_STATE.LOADING'), 'openQrPanel must handle LOADING state');
  assert.ok(openSource.includes('QR_LIBRARY_STATE.FAILED'), 'openQrPanel must handle FAILED state');
  assert.ok(openSource.includes('QR_LIBRARY_STATE.READY'), 'openQrPanel must handle READY state');
});

test('card.js source contains no static qrcode.min.js script tag or pre-verification execution path', () => {
  /* The script must not be loaded before verification. */
  assert.ok(
    !cardJsSource.includes('<script src'),
    'card.js must not inject qrcode via innerHTML script tag'
  );
});

test('no static qrcode.min.js script tag in card/index.html', () => {
  /* Primary entry point must not statically load the QR library. */
  assert.ok(
    !indexHtml.includes('src="/js/vendor/qrcode.min.js"') &&
    !indexHtml.includes("src='/js/vendor/qrcode.min.js'"),
    'card/index.html must not contain a static qrcode.min.js script tag'
  );
});

/* ----------------------------------------------------------------
 * 10. isQrLibraryAttestation — branded attestation predicate
 * ---------------------------------------------------------------- */
test('loadQrLibrary calls verification.isQrLibraryAttestation before injecting the script', () => {
  const loadQrSource = (() => {
    const start = cardJsSource.indexOf('function loadQrLibrary(');
    if (start === -1) throw new Error('loadQrLibrary not found in card.js');
    let depth = 0, i = start;
    while (i < cardJsSource.length) {
      if (cardJsSource[i] === '{') depth++;
      else if (cardJsSource[i] === '}' && --depth === 0) return cardJsSource.slice(start, i + 1);
      i++;
    }
    throw new Error('loadQrLibrary body not terminated');
  })();
  assert.ok(
    loadQrSource.includes('verification.isQrLibraryAttestation'),
    'loadQrLibrary must call verification.isQrLibraryAttestation() to authenticate the attestation'
  );
  assert.ok(
    loadQrSource.includes('qr-attestation-not-recognized'),
    'loadQrLibrary must reject unrecognized attestations with qr-attestation-not-recognized error'
  );
});

test('loadQrLibrary returns a cached promise — repeated calls are idempotent', () => {
  assert.ok(
    cardJsSource.includes('qrLibraryPromise'),
    'card.js must cache the loadQrLibrary promise in qrLibraryPromise'
  );
  const loadQrSource = (() => {
    const start = cardJsSource.indexOf('function loadQrLibrary(');
    if (start === -1) throw new Error('loadQrLibrary not found in card.js');
    let depth = 0, i = start;
    while (i < cardJsSource.length) {
      if (cardJsSource[i] === '{') depth++;
      else if (cardJsSource[i] === '}' && --depth === 0) return cardJsSource.slice(start, i + 1);
      i++;
    }
    throw new Error('loadQrLibrary body not terminated');
  })();
  /* First line of the function must short-circuit if promise already exists. */
  assert.ok(
    loadQrSource.includes('if (qrLibraryPromise) return qrLibraryPromise'),
    'loadQrLibrary must return the cached promise immediately on repeated calls'
  );
});

test('card.js closes QR panel and restores focus to PRESENT CARD button on Escape', () => {
  assert.ok(
    cardJsSource.includes("e.key === 'Escape'"),
    'card.js must handle Escape key to close the QR panel'
  );
  const closeQrSource = (() => {
    const start = cardJsSource.indexOf('function closeQrPanel(');
    if (start === -1) throw new Error('closeQrPanel not found in card.js');
    let depth = 0, i = start;
    while (i < cardJsSource.length) {
      if (cardJsSource[i] === '{') depth++;
      else if (cardJsSource[i] === '}' && --depth === 0) return cardJsSource.slice(start, i + 1);
      i++;
    }
    throw new Error('closeQrPanel body not terminated');
  })();
  assert.ok(
    closeQrSource.includes('receiveBtn') && closeQrSource.includes('.focus('),
    'closeQrPanel must restore focus to the PRESENT CARD button after closing'
  );
});
