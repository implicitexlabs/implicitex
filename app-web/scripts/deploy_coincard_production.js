#!/usr/bin/env node
/* deploy_coincard_production.js
 *
 * Target-locked Firebase deploy wrapper. Gate 1 uses --review only. The
 * execution mode remains unavailable until it is invoked explicitly during
 * an authorized Gate 2 from a clean worktree.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const VERIFY_SCRIPT = path.join(__dirname, 'verify_coincard_public_release.js');
const EXECUTE_ARGUMENT = '--execute-production-coincard';
const FIREBASE_ARGS = Object.freeze([
  'deploy',
  '--only',
  'hosting:coincard',
  '--project',
  'coincard',
]);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
  });
}

function requireSuccess(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ''}`);
  }
}

function verifyLocalRelease() {
  requireSuccess(run(process.execPath, [VERIFY_SCRIPT]), 'local release verification');
}

function requireCleanWorktree() {
  const result = run('git', ['status', '--porcelain', '--untracked-files=all']);
  requireSuccess(result, 'git status');
  if (result.stdout.trim()) {
    throw new Error('production deploy denied: worktree is not clean');
  }
}

function main(argv) {
  if (argv.length !== 1 || !['--review', EXECUTE_ARGUMENT].includes(argv[0])) {
    console.error('Production deploy denied.');
    console.error('Review locally: npm --prefix app-web run review:coincard-production-deploy');
    console.error(`Gate 2 only: npm --prefix app-web run deploy:coincard-production -- ${EXECUTE_ARGUMENT}`);
    return 64;
  }

  verifyLocalRelease();
  console.log(`Locked command: firebase ${FIREBASE_ARGS.join(' ')}`);
  console.log('Locked project: coincard-prod');
  console.log('Hosting site: coincard-prod');

  if (argv[0] === '--review') {
    console.log('Review mode: no authentication, Firebase request, or deployment performed.');
    return 0;
  }

  requireCleanWorktree();
  const deployed = run('firebase', FIREBASE_ARGS, { inherit: true });
  if (deployed.error) throw deployed.error;
  return deployed.status === null ? 1 : deployed.status;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`Production deploy denied: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ EXECUTE_ARGUMENT, FIREBASE_ARGS, main });
