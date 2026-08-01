#!/usr/bin/env node
/**
 * generate_production_manifest.js — generate a release manifest for hosting:main
 *
 * PURPOSE
 *   Walk app-web/frontend/public/, compute a SHA-256 hash for every file,
 *   and write a structured manifest JSON. An operator reviews this manifest
 *   offline and supplies its path to the production deploy guard via
 *   IMPLICITEX_APPROVED_MANIFEST_PATH.
 *
 * IMPORTANT
 *   A manifest records what the public directory contains RIGHT NOW.
 *   Reviewing a manifest is the operator's confirmation that these are the
 *   exact artifacts they intend to publish to production. The guard will
 *   re-derive the same hash at deploy time and verify it matches.
 *
 * FAIL-CLOSED BEHAVIOR
 *   - Symlinks in the public directory: FATAL ERROR
 *   - Non-regular files (FIFOs, sockets, devices): FATAL ERROR
 *   - Dirty working tree: FATAL ERROR
 *   No file is silently omitted from the manifest.
 *
 * USAGE
 *   node app-web/scripts/generate_production_manifest.js [--output PATH]
 *
 *   --output PATH    Write manifest to this file (default: stdout)
 *
 * OUTPUT FORMAT
 *   {
 *     "schema_version": 1,
 *     "generated_at": "<ISO-8601>",
 *     "commit": "<40-char hex SHA>",
 *     "public_dir": "app-web/frontend/public",
 *     "file_count": <N>,
 *     "manifest_hash": "<64-char hex SHA>",
 *     "files": [
 *       { "path": "<relative/path>", "sha256": "<64-char hex>", "bytes": <N> },
 *       ...
 *     ]
 *   }
 *
 *   manifest_hash: SHA-256 of newline-joined sorted "path:sha256:bytes" lines.
 *   Including byte counts binds the hash to file size as well as content.
 */

'use strict';

const { execSync }   = require('node:child_process');
const { createHash } = require('node:crypto');
const fs             = require('node:fs');
const path           = require('node:path');

// Derive repo root from current working directory — no override
let REPO_ROOT;
try {
  REPO_ROOT = execSync('git rev-parse --show-toplevel', {
    cwd:      process.cwd(),
    encoding: 'utf8',
    stdio:    ['pipe', 'pipe', 'pipe'],
  }).trim();
} catch (e) {
  process.stderr.write('ERROR: Cannot determine repository root: ' + e.message + '\n');
  process.exit(1);
}

const PUBLIC_DIR_REL = 'app-web/frontend/public';
const PUBLIC_DIR_ABS = path.join(REPO_ROOT, PUBLIC_DIR_REL);

function git(cmd) {
  return execSync('git ' + cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function computeManifestHash(files) {
  const lines = files.map(f => f.path + ':' + f.sha256 + ':' + f.bytes).join('\n');
  return createHash('sha256').update(lines, 'utf8').digest('hex');
}

function walkDir(dir) {
  const results = [];
  (function walk(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full   = path.join(current, entry.name);
      const relPth = (prefix ? prefix + '/' : '') + entry.name;

      if (entry.isSymbolicLink()) {
        process.stderr.write('ERROR: Symbolic link found in public directory: ' + relPth + '\n');
        process.stderr.write('  Resolve or remove symlinks before generating a manifest.\n');
        process.exit(1);
      }
      if (entry.isDirectory()) {
        walk(full, relPth);
      } else if (entry.isFile()) {
        const buf = fs.readFileSync(full);
        results.push({ path: relPth, sha256: sha256(buf), bytes: buf.length });
      } else {
        // FIFO, socket, device node, etc.
        process.stderr.write('ERROR: Non-regular file found in public directory: ' + relPth + '\n');
        process.stderr.write('  Only regular files are permitted in the artifact tree.\n');
        process.exit(1);
      }
    }
  }(dir, ''));
  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// --- parse args ---
const args       = process.argv.slice(2);
const outputIdx  = args.indexOf('--output');
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

// --- precondition: clean working tree ---
const dirty = git('status --porcelain --untracked-files=all');
if (dirty !== '') {
  process.stderr.write(
    'ERROR: Working tree is not clean. Commit, ignore, or remove:\n' +
    dirty.split('\n').map(l => '  ' + l).join('\n') + '\n'
  );
  process.exit(1);
}

const commit = git('rev-parse HEAD');
const files  = walkDir(PUBLIC_DIR_ABS);
const mhash  = computeManifestHash(files);

const manifest = {
  schema_version: 1,
  generated_at:   new Date().toISOString(),
  commit,
  public_dir:     PUBLIC_DIR_REL,
  file_count:     files.length,
  manifest_hash:  mhash,
  files,
};

const json = JSON.stringify(manifest, null, 2) + '\n';

if (outputPath) {
  fs.writeFileSync(outputPath, json, 'utf8');
  process.stderr.write('Manifest written to: ' + outputPath + '\n');
  process.stderr.write('  commit:        ' + commit + '\n');
  process.stderr.write('  file_count:    ' + files.length + '\n');
  process.stderr.write('  manifest_hash: ' + mhash + '\n');
  process.stderr.write('\nReview the manifest contents before supplying it to the deploy guard.\n');
} else {
  process.stdout.write(json);
}
