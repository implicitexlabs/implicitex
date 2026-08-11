'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const sourcePath = path.join(repoRoot, 'app-web/shared/coin-card-canonical-username.js');
const browserPath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-canonical-username.js',
);
const functionsPath = path.join(
  repoRoot,
  'app-web/backend/functions/src/shared/coin-card-canonical-username.js',
);
const generatedHeader = '/* GENERATED from app-web/shared/coin-card-canonical-username.js. Do not edit this copy. */\n';
const api = require(sourcePath);

test('current Coin Card username policy has exact 4–32 hostname-compatible boundaries', () => {
  const accepted = [
    'abcd',
    'a1-b',
    'a--b',
    'a'.repeat(30),
    'a'.repeat(31),
    'a'.repeat(32),
  ];
  for (const username of accepted) {
    assert.equal(api.validateCurrentUsername(username).valid, true, username);
  }

  const rejected = [
    'abc',
    'a'.repeat(33),
    'Alice',
    ' alice',
    'alice ',
    'alice_name',
    '-alice',
    'alice-',
    'alïce',
    'ali.ce',
  ];
  for (const username of rejected) {
    assert.equal(api.validateCurrentUsername(username).valid, false, username);
  }
});

test('historical v1 verification remains distinct from current registration eligibility', () => {
  assert.equal(api.validateHistoricalV1Username('abc').valid, true);
  assert.equal(api.validateRegistryUsername('abc', api.REGISTRY_SCHEMA_V1).valid, true);
  assert.equal(api.validateCurrentUsername('abc').valid, false);
  assert.equal(api.validateRegistryUsername('a'.repeat(31), api.REGISTRY_SCHEMA_V1).valid, false);
  assert.equal(api.validateRegistryUsername('a'.repeat(31), api.REGISTRY_SCHEMA_V2).valid, true);
});

test('public route normalization is explicit while issuance remains strict', () => {
  assert.equal(api.canonicalizePublicRouteUsername('AntoineDennison'), 'antoinedennison');
  assert.equal(api.validateCurrentUsername('AntoineDennison').valid, false);
  assert.equal(api.canonicalizePublicRouteUsername('alice_name'), null);
  assert.equal(api.canonicalizePublicRouteUsername('abc'), null);
  assert.equal(api.canonicalizePublicRouteUsername('a'.repeat(32)), 'a'.repeat(32));
});

test('browser and Firebase Functions runtime copies are generated from one source', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.equal(fs.readFileSync(browserPath, 'utf8'), generatedHeader + source);
  assert.equal(fs.readFileSync(functionsPath, 'utf8'), generatedHeader + source);

  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(browserPath, 'utf8'), context, { filename: browserPath });
  assert.equal(context.window.IX_COIN_CARD_CANONICAL_USERNAME.CURRENT_POLICY.minimumLength, 4);
  assert.equal(context.window.IX_COIN_CARD_CANONICAL_USERNAME.CURRENT_POLICY.maximumLength, 32);
  assert.equal(
    context.window.IX_COIN_CARD_CANONICAL_USERNAME.validateCurrentUsername('alice_name').valid,
    false,
  );

  const functionsApi = require(functionsPath);
  assert.equal(functionsApi.CURRENT_POLICY.policyVersion, api.CURRENT_POLICY.policyVersion);
});
