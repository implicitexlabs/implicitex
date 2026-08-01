'use strict';

/**
 * generate_build_info.js
 *
 * Writes app-web/frontend/public/build-info.json from the current git HEAD.
 *
 * Requirements:
 *   - Working tree must be clean. A dirty tree is a fatal error.
 *   - Output file is not committed (gitignored). It is regenerated at deploy time.
 *   - Run from any directory inside the repository.
 *
 * Usage:
 *   node app-web/scripts/generate_build_info.js
 *   npm --prefix app-web run generate:build-info
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const SCRIPT_DIR  = __dirname;
const PUBLIC_ROOT  = path.join(SCRIPT_DIR, '../frontend/public');
const OUT_PATH     = path.join(PUBLIC_ROOT, 'build-info.json');

function git(cmd) {
  return execSync(`git ${cmd}`, {
    cwd:      SCRIPT_DIR,
    encoding: 'utf8',
  }).trim();
}

// Fail fast on any uncommitted content — tracked modifications, staged
// modifications, or untracked non-ignored files.
//
// Ignored files (node_modules/, .firebase/, build-info.json) are excluded
// by git's own ignore rules and will not appear. Untracked deployable source
// files will appear and are correctly rejected: Firebase uploads every file
// in the public directory regardless of git tracking status, so an untracked
// file in frontend/public/ would reach production without belonging to any
// identified commit.
//
// "dirty: false" in the output means: no tracked modifications, staged
// modifications, or untracked non-ignored files existed at generation time.
const dirtyLines = git('status --porcelain --untracked-files=all');

if (dirtyLines !== '') {
  console.error('ERROR: working tree contains uncommitted content.');
  console.error('Commit, ignore, or remove every item before generating build metadata.');
  console.error('');
  dirtyLines.split('\n').forEach(function (line) {
    console.error('  ' + line);
  });
  process.exit(1);
}

const commitHash = git('rev-parse HEAD');
const shortHash  = git('rev-parse --short HEAD');
const buildTime  = new Date().toISOString();

const info = {
  app:         'implicitex-portal',
  environment: 'production',
  commit:      commitHash,
  shortCommit: shortHash,
  buildTime,
  dirty:       false,
  hosting: {
    project: 'implicitex',
    site:    'implicitex-portal',
  },
};

fs.writeFileSync(OUT_PATH, JSON.stringify(info, null, 2) + '\n', 'utf8');

console.log('build-info.json written to ' + OUT_PATH);
console.log('  commit:    ' + commitHash);
console.log('  short:     ' + shortHash);
console.log('  buildTime: ' + buildTime);
console.log('  dirty:     false');
