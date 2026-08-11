'use strict';

/**
 * coin-card-canonical-json-v1.test.js
 *
 * Direct conformance tests for the coin-card-canonical-json.v1 protocol
 * primitive.  These tests verify the algorithm itself — not artifact hashes,
 * not lifecycle registry behavior, not integration paths.
 *
 * A change that causes any test here to fail is a cryptographic protocol
 * change, not a refactor.  fingerprint_version: 1 is only meaningful if this
 * corpus pins exactly what version 1 produces.
 */

const assert = require('node:assert/strict');
const path   = require('node:path');
const test   = require('node:test');

const { canonicalizeJson } = require(
  path.resolve(__dirname, '../../frontend/public/card/coin-card-canonical-json-v1.js'),
);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function ok(value, expected) {
  assert.equal(canonicalizeJson(value), expected);
}

function rejects(value) {
  assert.equal(canonicalizeJson(value), null);
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

test('null serializes as `null`', () => {
  ok(null, 'null');
});

test('true serializes as `true`', () => {
  ok(true, 'true');
});

test('false serializes as `false`', () => {
  ok(false, 'false');
});

test('zero serializes as `0`', () => {
  ok(0, '0');
});

test('positive integer serializes as decimal string', () => {
  ok(137, '137');
});

test('negative integer serializes as signed decimal string', () => {
  ok(-1, '-1');
});

test('Number.MAX_SAFE_INTEGER (9007199254740991) is accepted', () => {
  ok(Number.MAX_SAFE_INTEGER, '9007199254740991');
});

test('Number.MIN_SAFE_INTEGER (-9007199254740991) is accepted', () => {
  ok(Number.MIN_SAFE_INTEGER, '-9007199254740991');
});

test('Number.MAX_SAFE_INTEGER + 1 is rejected', () => {
  rejects(Number.MAX_SAFE_INTEGER + 1);
});

test('negative zero is rejected', () => {
  rejects(-0);
});

test('NaN is rejected', () => {
  rejects(NaN);
});

test('Infinity is rejected', () => {
  rejects(Infinity);
});

test('-Infinity is rejected', () => {
  rejects(-Infinity);
});

test('decimal (non-integer) number is rejected', () => {
  rejects(1.5);
});

// ---------------------------------------------------------------------------
// String handling
// ---------------------------------------------------------------------------

test('empty string serializes as `""`', () => {
  ok('', '""');
});

test('plain ASCII string passes through', () => {
  ok('hello', '"hello"');
});

test('double-quote character is escaped as \\"', () => {
  ok('"', '"\\""');
});

test('backslash is escaped as \\\\', () => {
  ok('\\', '"\\\\"');
});

test('tab (U+0009) is escaped as \\t', () => {
  ok('\t', '"\\t"');
});

test('newline (U+000A) is escaped as \\n', () => {
  ok('\n', '"\\n"');
});

test('carriage return (U+000D) is escaped as \\r', () => {
  ok('\r', '"\\r"');
});

test('backspace (U+0008) is escaped as \\b', () => {
  ok('\b', '"\\b"');
});

test('form feed (U+000C) is escaped as \\f', () => {
  ok('\f', '"\\f"');
});

test('U+0000 is escaped as \\u0000', () => {
  ok('\u0000', '"\\u0000"');
});

test('U+001F (last C0 control) is escaped as \\u001f', () => {
  ok('\u001f', '"\\u001f"');
});

test('U+0020 (space, first non-control) is not escaped', () => {
  ok(' ', '" "');
});

test('forward slash is NOT escaped', () => {
  ok('/', '"/"');
});

test('NFC-normalized string with non-ASCII characters is accepted', () => {
  // é (U+00E9) is already NFC
  ok('café', '"café"');
});

test('emoji (supplementary code point, valid surrogate pair) is accepted', () => {
  ok('😀', '"😀"');
});

test('non-NFC string is rejected', () => {
  // e + combining acute (NFD form of é) — not NFC
  rejects('cafe\u0301');
});

test('lone high surrogate is rejected', () => {
  rejects('\uD800');
});

test('lone low surrogate is rejected', () => {
  rejects('\uDC00');
});

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

test('empty array serializes as `[]`', () => {
  ok([], '[]');
});

test('array of primitives preserves element order', () => {
  ok([3, 1, 2], '[3,1,2]');
});

test('array of strings serializes elements in order', () => {
  ok(['z', 'a', 'm'], '["z","a","m"]');
});

test('nested array', () => {
  ok([[1, 2], [3, 4]], '[[1,2],[3,4]]');
});

// ---------------------------------------------------------------------------
// Objects — key ordering
// ---------------------------------------------------------------------------

test('empty object serializes as `{}`', () => {
  ok({}, '{}');
});

test('single-key object', () => {
  ok({ a: 1 }, '{"a":1}');
});

test('ASCII key order: a < b', () => {
  ok({ b: 2, a: 1 }, '{"a":1,"b":2}');
});

test('ASCII key order: uppercase A (65) < lowercase a (97)', () => {
  ok({ a: 2, A: 1 }, '{"A":1,"a":2}');
});

test('Unicode code point ordering: a < é < Ω < 𐀀 < 😀', () => {
  // a=61, é=E9, Ω=03A9, 𐀀=10000, 😀=1F600
  ok(
    { '😀': 5, '𐀀': 4, 'Ω': 3, 'é': 2, 'a': 1 },
    '{"a":1,"é":2,"Ω":3,"𐀀":4,"😀":5}',
  );
});

test('numeric-looking keys are sorted as strings by code point', () => {
  // '10' (0x31 0x30) vs '9' (0x39): '1' < '9', so '10' sorts before '9'
  ok({ '9': 'nine', '10': 'ten' }, '{"10":"ten","9":"nine"}');
});

test('nested object key ordering is applied recursively', () => {
  ok(
    { z: { b: 2, a: 1 }, a: { d: 4, c: 3 } },
    '{"a":{"c":3,"d":4},"z":{"a":1,"b":2}}',
  );
});

// ---------------------------------------------------------------------------
// Mixed / nested structures
// ---------------------------------------------------------------------------

test('object containing array containing object', () => {
  ok(
    { routes: [{ chain: 137, token: 'USDC' }] },
    '{"routes":[{"chain":137,"token":"USDC"}]}',
  );
});

test('null value inside object', () => {
  ok({ x: null }, '{"x":null}');
});

test('boolean values inside object', () => {
  ok({ enabled: true, visible: false }, '{"enabled":true,"visible":false}');
});

// ---------------------------------------------------------------------------
// Unsupported / non-canonical inputs
// ---------------------------------------------------------------------------

test('undefined is rejected', () => {
  rejects(undefined);
});

// eslint-disable-next-line no-new-func
test('function is rejected', () => {
  rejects(function () {});
});

test('Symbol is rejected', () => {
  rejects(Symbol('x'));
});

test('object with class prototype is rejected', () => {
  rejects(new Date());
});

test('object with null-prototype is accepted (treated as plain object)', () => {
  const o = Object.create(null);
  o.key = 'value';
  ok(o, '{"key":"value"}');
});

test('object with accessor property is rejected', () => {
  const o = {};
  Object.defineProperty(o, 'x', { get() { return 1; }, enumerable: true });
  rejects(o);
});

test('object with symbol-keyed property is rejected', () => {
  const o = { a: 1 };
  o[Symbol('s')] = 2;
  rejects(o);
});

test('object with function-valued property is rejected', () => {
  rejects({ fn: function () {} });
});

test('object with undefined-valued property is rejected', () => {
  rejects({ x: undefined });
});

test('circular reference (object) is rejected', () => {
  const o = { a: 1 };
  o.self = o;
  rejects(o);
});

test('circular reference (array) is rejected', () => {
  const a = [1];
  a.push(a);
  rejects(a);
});

// ---------------------------------------------------------------------------
// Golden vector (pinned hash input)
// ---------------------------------------------------------------------------

test('golden vector: canonical text matches pinned hash test vector from lifecycle registry', () => {
  // This vector is shared with the lifecycle registry's hashProtectedPayload
  // golden test.  Any change here indicates a protocol-level divergence.
  const payload = {
    cardId: 'card_test_001',
    recipient: {
      address: '0x1111111111111111111111111111111111111111',
    },
    amountPolicy: {
      type: 'FIXED_AMOUNT',
      amountBaseUnits: '50000000',
    },
  };
  assert.equal(
    canonicalizeJson(payload),
    '{"amountPolicy":{"amountBaseUnits":"50000000","type":"FIXED_AMOUNT"},"cardId":"card_test_001","recipient":{"address":"0x1111111111111111111111111111111111111111"}}',
  );
});
