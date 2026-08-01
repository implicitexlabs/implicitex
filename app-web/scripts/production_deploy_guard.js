#!/usr/bin/env node
/**
 * production_deploy_guard.js — fail-closed production deployment guard for hosting:main
 *
 * PURPOSE
 *   Prevents any firebase deploy --only hosting:main --project production from
 *   proceeding unless the operator has explicitly supplied externally approved
 *   authorization tokens: a commit SHA and a manifest of public-directory artifacts.
 *
 *   This guard is the repository's interim authorization layer. It does not replace
 *   CI-only deployment or Firebase IAM controls; it supplements them at the local
 *   predeploy stage until those controls are available.
 *
 * REPOSITORY ROOT RESOLUTION
 *   The guard always derives its repository root from the process working directory
 *   using `git rev-parse --show-toplevel`. There is no environment-variable or
 *   argument override. The guard validates whichever repository the operator is
 *   actually working in.
 *
 * WHAT IT CHECKS
 *   1.  IMPLICITEX_PRODUCTION_MODE === 'true'             (explicit opt-in)
 *   2.  IMPLICITEX_APPROVED_SHA is a 40-char hex SHA      (externally authorized)
 *   3.  IMPLICITEX_APPROVED_MANIFEST_PATH is readable     (externally approved)
 *   4.  Approved manifest is structurally valid           (manifest integrity)
 *       4a. schema_version, manifest_hash, files present and valid
 *       4b. manifest.commit is 40-char hex and equals IMPLICITEX_APPROVED_SHA
 *       4c. manifest.public_dir matches required artifact directory
 *       4d. manifest.file_count is a non-negative integer equal to files.length
 *       4e. No absolute paths, no ../ traversal, no backslash per entry
 *       4f. Valid 64-char lowercase hex sha256 per entry
 *       4g. Non-negative integer bytes per entry
 *       4h. No duplicate paths
 *   5.  git rev-parse HEAD === approved SHA               (worktree identity)
 *   6.  git status --porcelain is empty                   (clean working tree)
 *   7.  .firebaserc projects.production === 'implicitex'  (correct project alias)
 *   8.  firebase.json hosting:main public dir matches     (correct artifact source)
 *   9.  Public directory: no symlinks, no special files   (regular files only)
 *  10.  Live artifact tree matches approved manifest      (file-for-file SHA + bytes)
 *  11.  No unexpected build-info.json present             (no stale generated file)
 *  12.  Manifest hash is independently verified           (scalar covering path+sha+bytes)
 *
 * ON PASS: prints a concise approval record and exits 0.
 * ON FAIL: prints a specific failure reason and exits 1. No partial authorization.
 *
 * ENVIRONMENT VARIABLES (all required)
 *   IMPLICITEX_PRODUCTION_MODE          Must be the literal string "true"
 *   IMPLICITEX_APPROVED_SHA             Full 40-char lowercase hex commit SHA
 *   IMPLICITEX_APPROVED_MANIFEST_PATH   Absolute path to externally approved manifest JSON
 *
 * MANIFEST FORMAT: see generate_production_manifest.js
 */

'use strict';

const { execSync }   = require('node:child_process');
const { createHash } = require('node:crypto');
const fs             = require('node:fs');
const path           = require('node:path');

// ---------------------------------------------------------------------------
// Repository root — derived from the process working directory, no override
// ---------------------------------------------------------------------------

let REPO_ROOT;
try {
  REPO_ROOT = execSync('git rev-parse --show-toplevel', {
    cwd:      process.cwd(),
    encoding: 'utf8',
    stdio:    ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch (e) {
  process.stderr.write(
    '\nPRODUCTION GUARD FAIL: Cannot determine repository root.\n' +
    '  Run this guard from inside a git repository.\n' +
    '  Detail: ' + (e.message || String(e)) + '\n\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_PROJECT    = 'implicitex';
const REQUIRED_TARGET     = 'main';
const REQUIRED_PUBLIC_DIR = 'app-web/frontend/public';
const BUILD_INFO_NAME     = 'build-info.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(msg) {
  process.stderr.write('\nPRODUCTION GUARD FAIL: ' + msg + '\n\n');
  process.exit(1);
}

function git(cmd) {
  return execSync('git ' + cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/**
 * Validate a path entry from the approved manifest.
 * Returns an error string or null if valid.
 */
function validateManifestPath(p) {
  if (typeof p !== 'string' || p === '') return 'empty or non-string path';
  if (path.isAbsolute(p))               return 'absolute path not permitted: ' + p;
  if (p.includes('\\'))                 return 'backslash in path not permitted: ' + p;
  const parts = p.split('/');
  for (const part of parts) {
    if (part === '..')  return '"../" traversal not permitted: ' + p;
    if (part === '.')   return '"." component not permitted: ' + p;
    if (part === '')    return 'empty path component not permitted: ' + p;
  }
  return null;
}

/**
 * Compute the canonical manifest hash.
 * Input: sorted array of { path, sha256, bytes }.
 * Hash: SHA-256 of newline-joined "path:sha256:bytes" lines, sorted by path.
 * Including bytes binds the hash to file size as well as content.
 */
function computeManifestHash(files) {
  const sorted = files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const lines  = sorted.map(f => f.path + ':' + f.sha256 + ':' + f.bytes).join('\n');
  return createHash('sha256').update(lines, 'utf8').digest('hex');
}

/**
 * Walk the public directory recursively.
 * Returns a sorted array of { path, sha256, bytes }.
 * Fails on any symlink or non-regular-file entry — nothing is silently omitted.
 */
function walkPublicDir(dir) {
  const results = [];
  (function walk(current, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      fail('Cannot read public directory "' + current + '": ' + e.message);
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relPath  = (prefix ? prefix + '/' : '') + entry.name;

      if (entry.isSymbolicLink()) {
        fail(
          'Symbolic link found in public directory — deployment refused.\n' +
          '  Path: ' + relPath + '\n' +
          '  Symbolic links are not permitted in the artifact tree. Use regular files only.\n' +
          '  A symlink could reference content outside the approved artifact set.'
        );
      }
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const buf = fs.readFileSync(fullPath);
        results.push({
          path:   relPath,
          sha256: createHash('sha256').update(buf).digest('hex'),
          bytes:  buf.length,
        });
      } else {
        // FIFO, socket, device, etc.
        fail(
          'Non-regular file found in public directory — deployment refused.\n' +
          '  Path: ' + relPath + '\n' +
          '  Only regular files are permitted in the artifact tree.'
        );
      }
    }
  }(dir, ''));
  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ===========================================================================
// GUARD CHECKS — ordered; each failure is fatal
// ===========================================================================

// --- Check 1: explicit production mode ---
if (process.env.IMPLICITEX_PRODUCTION_MODE !== 'true') {
  fail(
    'IMPLICITEX_PRODUCTION_MODE must be set to the literal string "true".\n' +
    '  Production deployment requires explicit operator authorization.\n' +
    '  Do not set this variable unless you have reviewed and approved the release.'
  );
}

// --- Check 2: approved SHA present and well-formed ---
const approvedSHA = (process.env.IMPLICITEX_APPROVED_SHA || '').trim();
if (!/^[0-9a-f]{40}$/.test(approvedSHA)) {
  fail(
    'IMPLICITEX_APPROVED_SHA must be a 40-character lowercase hex commit SHA.\n' +
    '  Current value: ' + (approvedSHA || '(not set)')
  );
}

// --- Check 3: approved manifest path present and readable ---
const manifestPath = (process.env.IMPLICITEX_APPROVED_MANIFEST_PATH || '').trim();
if (!manifestPath) {
  fail('IMPLICITEX_APPROVED_MANIFEST_PATH must be set to the path of the approved manifest file.');
}

let approvedManifest;
try {
  approvedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
  fail('Cannot read or parse approved manifest at "' + manifestPath + '": ' + e.message);
}

// --- Check 4: manifest structural validation ---
if (!approvedManifest || typeof approvedManifest !== 'object' || Array.isArray(approvedManifest)) {
  fail('Approved manifest is not a JSON object.');
}
if (approvedManifest.schema_version !== 1) {
  fail('Approved manifest schema_version must be 1. Got: ' + JSON.stringify(approvedManifest.schema_version));
}
if (typeof approvedManifest.manifest_hash !== 'string' || !/^[0-9a-f]{64}$/.test(approvedManifest.manifest_hash)) {
  fail('Approved manifest must contain a valid 64-char lowercase hex manifest_hash.');
}
if (!Array.isArray(approvedManifest.files) || approvedManifest.files.length === 0) {
  fail('Approved manifest must contain a non-empty files array.');
}

// --- Check 4b: manifest.commit format and binding to approved SHA ---
if (typeof approvedManifest.commit !== 'string' || !/^[0-9a-f]{40}$/.test(approvedManifest.commit)) {
  fail(
    'Approved manifest "commit" field must be a 40-char lowercase hex SHA.\n' +
    '  Got: ' + JSON.stringify(approvedManifest.commit)
  );
}
if (approvedManifest.commit !== approvedSHA) {
  fail(
    'Approved manifest commit does not match IMPLICITEX_APPROVED_SHA.\n' +
    '  Manifest commit: ' + approvedManifest.commit + '\n' +
    '  Approved SHA:    ' + approvedSHA + '\n' +
    '  The manifest was generated for a different commit than the one being deployed.'
  );
}

// --- Check 4c: manifest.public_dir binding ---
if (approvedManifest.public_dir !== REQUIRED_PUBLIC_DIR) {
  fail(
    'Approved manifest public_dir does not match the required artifact directory.\n' +
    '  Manifest public_dir: ' + JSON.stringify(approvedManifest.public_dir) + '\n' +
    '  Required:            "' + REQUIRED_PUBLIC_DIR + '"'
  );
}

// --- Check 4d: manifest.file_count consistency ---
if (typeof approvedManifest.file_count !== 'number' ||
    !Number.isInteger(approvedManifest.file_count) ||
    approvedManifest.file_count < 0) {
  fail(
    'Approved manifest "file_count" must be a non-negative integer.\n' +
    '  Got: ' + JSON.stringify(approvedManifest.file_count)
  );
}
if (approvedManifest.file_count !== approvedManifest.files.length) {
  fail(
    'Approved manifest file_count does not match files array length.\n' +
    '  file_count:   ' + approvedManifest.file_count + '\n' +
    '  files.length: ' + approvedManifest.files.length
  );
}

// --- Check 4e-4h: per-entry path and field validation + duplicate detection ---
const seenPaths = new Set();
for (const entry of approvedManifest.files) {
  if (typeof entry !== 'object' || entry === null) {
    fail('Each entry in approved manifest files must be an object.');
  }

  // Path safety
  const pathErr = validateManifestPath(entry.path);
  if (pathErr) {
    fail('Invalid path in approved manifest: ' + pathErr);
  }

  // SHA-256 format
  if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
    fail('Invalid sha256 in approved manifest for "' + entry.path + '": must be 64 lowercase hex chars. Got: ' + JSON.stringify(entry.sha256));
  }

  // Byte count
  if (typeof entry.bytes !== 'number' || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
    fail('Invalid bytes in approved manifest for "' + entry.path + '": must be a non-negative integer. Got: ' + JSON.stringify(entry.bytes));
  }

  // Duplicate paths
  if (seenPaths.has(entry.path)) {
    fail('Duplicate path in approved manifest: "' + entry.path + '"');
  }
  seenPaths.add(entry.path);
}

// --- Check 5: git HEAD matches approved SHA ---
let headSHA;
try {
  headSHA = git('rev-parse HEAD');
} catch (e) {
  fail('Cannot determine git HEAD: ' + e.message);
}
if (headSHA !== approvedSHA) {
  fail(
    'Git HEAD does not match the approved commit SHA.\n' +
    '  HEAD (actual): ' + headSHA + '\n' +
    '  Approved:      ' + approvedSHA + '\n' +
    '  Deploy from the exact approved commit, not any other.'
  );
}

// --- Check 6: clean working tree ---
let statusOutput;
try {
  statusOutput = git('status --porcelain --untracked-files=all');
} catch (e) {
  fail('Cannot determine git status: ' + e.message);
}
if (statusOutput !== '') {
  fail(
    'Working tree is not clean.\n' +
    '  All tracked modifications, staged modifications, and untracked\n' +
    '  files (excluding gitignored files) must be absent before deploying.\n\n' +
    statusOutput.split('\n').map(l => '  ' + l).join('\n')
  );
}

// --- Check 7: .firebaserc production alias ---
const firebasercPath = path.join(REPO_ROOT, '.firebaserc');
let firebaserc;
try {
  firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
} catch (e) {
  fail('Cannot read .firebaserc: ' + e.message);
}
const productionProject = (firebaserc && firebaserc.projects && firebaserc.projects.production) || null;
if (productionProject !== REQUIRED_PROJECT) {
  fail(
    '.firebaserc "production" alias must resolve to "' + REQUIRED_PROJECT + '".\n' +
    '  Found: ' + JSON.stringify(productionProject)
  );
}

// --- Check 8: firebase.json hosting:main public directory ---
const firebaseJsonPath = path.join(REPO_ROOT, 'firebase.json');
let firebaseJson;
try {
  firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
} catch (e) {
  fail('Cannot read firebase.json: ' + e.message);
}
const hostingConfig = Array.isArray(firebaseJson.hosting) ? firebaseJson.hosting : [firebaseJson.hosting];
const mainTarget    = hostingConfig.find(h => h && h.target === REQUIRED_TARGET);
if (!mainTarget) {
  fail('firebase.json has no hosting target named "' + REQUIRED_TARGET + '".');
}
if (mainTarget.public !== REQUIRED_PUBLIC_DIR) {
  fail(
    'firebase.json hosting:' + REQUIRED_TARGET + ' public directory must be "' + REQUIRED_PUBLIC_DIR + '".\n' +
    '  Found: ' + JSON.stringify(mainTarget.public)
  );
}

// --- Check 9: walk public dir — fail on symlinks and special files ---
const publicAbsPath = path.join(REPO_ROOT, REQUIRED_PUBLIC_DIR);
if (!fs.existsSync(publicAbsPath)) {
  fail('Public directory does not exist: ' + publicAbsPath);
}
const liveFiles = walkPublicDir(publicAbsPath);  // exits on symlink/special file

// --- Check 11: build-info.json must not be present unless in approved manifest ---
const buildInfoInLive     = liveFiles.find(f => f.path === BUILD_INFO_NAME);
const buildInfoInApproved = approvedManifest.files.find(f => f.path === BUILD_INFO_NAME);
if (buildInfoInLive && !buildInfoInApproved) {
  fail(
    '"' + BUILD_INFO_NAME + '" exists in the public directory but is absent from the approved manifest.\n' +
    '  This file is generated by predeploy:portal and must not be present for hosting:main.\n' +
    '  Remove it before proceeding.\n' +
    '  (It is gitignored and will not appear in git status — this is a deliberate separate check.)'
  );
}

// --- Check 10: file-for-file manifest comparison (SHA + bytes) ---
const approvedByPath = new Map(approvedManifest.files.map(f => [f.path, f]));
const liveByPath     = new Map(liveFiles.map(f => [f.path, f]));
const errors         = [];

for (const [p] of approvedByPath) {
  if (!liveByPath.has(p)) errors.push('MISSING from disk: ' + p);
}
for (const [p] of liveByPath) {
  if (!approvedByPath.has(p)) errors.push('UNEXPECTED on disk (not in approved manifest): ' + p);
}
for (const [p, live] of liveByPath) {
  const approved = approvedByPath.get(p);
  if (!approved) continue;
  if (approved.sha256 !== live.sha256) {
    errors.push(
      'SHA-256 MISMATCH: ' + p + '\n' +
      '    approved: ' + approved.sha256 + '\n' +
      '    on disk:  ' + live.sha256
    );
  } else if (approved.bytes !== live.bytes) {
    // SHA matches but byte count differs — manifest was tampered
    errors.push(
      'BYTE COUNT MISMATCH (SHA matches — manifest tampered?): ' + p + '\n' +
      '    approved bytes: ' + approved.bytes + '\n' +
      '    on disk bytes:  ' + live.bytes
    );
  }
}

if (errors.length > 0) {
  fail('Artifact manifest mismatch:\n' + errors.map(e => '  - ' + e).join('\n'));
}

// --- Check 12: manifest hash (covers path + sha256 + bytes) ---
const liveManifestHash = computeManifestHash(liveFiles);
if (liveManifestHash !== approvedManifest.manifest_hash) {
  fail(
    'Manifest hash does not match approved value.\n' +
    '  Approved: ' + approvedManifest.manifest_hash + '\n' +
    '  Live:     ' + liveManifestHash + '\n' +
    '  The manifest hash covers file paths, SHA-256 digests, and byte counts.\n' +
    '  Any discrepancy in those fields will cause this mismatch.'
  );
}

// ===========================================================================
// ALL CHECKS PASSED — print approval record
// ===========================================================================

process.stdout.write([
  '',
  '╔═══════════════════════════════════════════════════════════════╗',
  '║        IMPLICITEX PRODUCTION DEPLOYMENT AUTHORIZATION         ║',
  '╚═══════════════════════════════════════════════════════════════╝',
  '',
  '  Absolute path : ' + REPO_ROOT,
  '  Commit SHA    : ' + headSHA,
  '  Project       : ' + productionProject,
  '  Target        : ' + REQUIRED_TARGET,
  '  Public dir    : ' + REQUIRED_PUBLIC_DIR,
  '  Artifact count: ' + liveFiles.length,
  '  Manifest hash : ' + liveManifestHash,
  '',
  '  All 12 guards passed. Deployment authorized.',
  '',
].join('\n'));
