#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(appRoot, 'shared/coin-card-canonical-username.js');
const targets = Object.freeze([
  path.join(appRoot, 'frontend/public/card/coin-card-canonical-username.js'),
  path.join(appRoot, 'backend/functions/src/shared/coin-card-canonical-username.js'),
]);
const generatedHeader = '/* GENERATED from app-web/shared/coin-card-canonical-username.js. Do not edit this copy. */\n';
const expected = generatedHeader + fs.readFileSync(sourcePath, 'utf8');
const check = process.argv.includes('--check');

for (const target of targets) {
  if (check) {
    assert.equal(fs.existsSync(target), true, `missing generated username contract: ${target}`);
    assert.equal(fs.readFileSync(target, 'utf8'), expected, `generated username contract drift: ${target}`);
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, expected, { encoding: 'utf8', mode: 0o644 });
}

console.log(check
  ? `Coin Card username contract: ${targets.length} generated copies current`
  : `Coin Card username contract: generated ${targets.length} runtime copies`);
