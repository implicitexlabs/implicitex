'use strict';

/**
 * production-deploy-guard.test.js
 *
 * Tests for scripts/production_deploy_guard.js.
 *
 * Design decisions:
 *
 *   - The guard is launched as a child process with `cwd: repoDir` pointing at
 *     an isolated temporary git repository. This mirrors how the guard resolves
 *     its repository root in production: via `git rev-parse --show-toplevel`
 *     from the process working directory. No environment-variable override is
 *     used or permitted.
 *
 *   - Manifests are written outside the repo dir (/tmp) so they never appear as
 *     untracked files in git status.
 *
 *   - Each test starts from a fully committed clean state. Tests that need a dirty
 *     tree modify committed files after setup.
 *
 *   - The test repo's .gitignore mirrors production: build-info.json is gitignored,
 *     so gitignored-file detection in the guard is exercised on its real path.
 *
 * Tests never contact Firebase or perform a deployment.
 * Tests never read from or write to the production public directory.
 */

const assert  = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execSync, spawnSync } = require('node:child_process');
const fs      = require('node:fs');
const os      = require('node:os');
const path    = require('node:path');

const GUARD        = path.resolve(__dirname, '../../scripts/production_deploy_guard.js');
const GENERATOR    = path.resolve(__dirname, '../../scripts/generate_production_manifest.js');
const REAL_REPO    = path.resolve(__dirname, '../../..');
const FIREBASE_JSON = path.join(REAL_REPO, 'firebase.json');

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('ok - ' + name);
    passed++;
  } catch (err) {
    console.error('not ok - ' + name);
    console.error('  ' + (err.message || err));
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function sha256(buf) {
  return createHash('sha256').update(typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf).digest('hex');
}

/**
 * Compute the canonical manifest hash: SHA-256 of sorted "path:sha256:bytes" lines.
 * Must stay in sync with the guard's computeManifestHash() implementation.
 */
function computeManifestHash(files) {
  const sorted = files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const lines  = sorted.map(f => f.path + ':' + f.sha256 + ':' + f.bytes).join('\n');
  return createHash('sha256').update(lines, 'utf8').digest('hex');
}

/** Initialize an empty git repo in dir (no initial commit). */
function initRepo(dir) {
  const g = cmd => execSync('git ' + cmd, { cwd: dir, stdio: 'pipe' });
  g('init -b main');
  g('config user.email "test@implicitex.com"');
  g('config user.name "Test Guard"');
}

/** Stage all tracked and untracked content and commit. Returns new HEAD SHA. */
function commitAll(dir, msg) {
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "' + (msg || 'test setup') + '"', { cwd: dir, stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
}

/** Write .firebaserc and firebase.json into the repo root. */
function writeFirebaseConfig(dir, opts) {
  opts = opts || {};
  const project    = opts.project    !== undefined ? opts.project    : 'implicitex';
  const mainPublic = opts.mainPublic !== undefined ? opts.mainPublic : 'app-web/frontend/public';
  const mainTarget = opts.mainTarget !== undefined ? opts.mainTarget : 'main';

  fs.writeFileSync(path.join(dir, '.firebaserc'), JSON.stringify({
    projects: { default: 'implicitex-236f2', production: project },
  }, null, 2));

  fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
    hosting: [{ target: mainTarget, public: mainPublic, predeploy: ['echo ok'] }],
  }, null, 2));
}

/** Write a public directory containing one index.html. Returns absolute path. */
function writePublicDir(dir, content) {
  const publicDir = path.join(dir, 'app-web', 'frontend', 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), content || '<html>ImplicitEx</html>');
  return publicDir;
}

/** Walk a directory and return sorted { path, sha256, bytes } entries. */
function walkDir(dir) {
  const results = [];
  (function walk(current, prefix) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel  = (prefix ? prefix + '/' : '') + entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        const buf = fs.readFileSync(full);
        results.push({ path: rel, sha256: sha256(buf), bytes: buf.length });
      }
      // Symlinks and special files skipped here (tests for those verify guard detects them)
    }
  }(dir, ''));
  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Build a manifest object from the current public directory.
 *   opts.emptyFiles      — replace files array with []
 *   opts.schemaVersion   — override schema_version
 *   opts.badHash         — set manifest_hash to 'c'.repeat(64)
 *   opts.manifestCommit  — override manifest.commit field (default: commitSHA)
 *   opts.manifestPublicDir — override manifest.public_dir field
 *   opts.manifestFileCount — override manifest.file_count field
 */
function buildManifest(publicDir, commitSHA, opts) {
  opts = opts || {};
  const files = walkDir(publicDir);
  const mhash = opts.badHash ? 'c'.repeat(64) : computeManifestHash(files);
  const fileList = opts.emptyFiles ? [] : files;
  return {
    schema_version: opts.schemaVersion !== undefined ? opts.schemaVersion : 1,
    generated_at:   '2026-07-31T00:00:00.000Z',
    commit:         opts.manifestCommit !== undefined ? opts.manifestCommit : commitSHA,
    public_dir:     opts.manifestPublicDir !== undefined ? opts.manifestPublicDir : 'app-web/frontend/public',
    file_count:     opts.manifestFileCount !== undefined ? opts.manifestFileCount : files.length,
    manifest_hash:  mhash,
    files:          fileList,
  };
}

/** Write manifest to a temp path outside the repo dir. Returns the path. */
function writeManifest(manifest) {
  const p = path.join(os.tmpdir(), 'ix-guard-test-' + process.pid + '-' + Date.now() + '.json');
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2));
  return p;
}

/**
 * Build a complete, committed, clean test environment.
 *
 * Returns { repoDir, sha, manifestPath, publicDir, env }.
 *
 * opts.firebaseOpts     — forwarded to writeFirebaseConfig
 * opts.fileContent      — content for public/index.html
 * opts.manifestOpts     — forwarded to buildManifest
 * opts.overrideEnv      — additional env overrides (applied last)
 * opts.extraGitignore   — extra lines appended to .gitignore before first commit
 */
function makeValidEnv(opts) {
  opts = opts || {};

  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-guard-test-'));
  initRepo(repoDir);

  // .gitignore: build-info.json mirrors production (gitignored there)
  // Additional entries can be added via opts.extraGitignore
  let gitignoreContent = 'app-web/frontend/public/build-info.json\n';
  if (opts.extraGitignore) gitignoreContent += opts.extraGitignore + '\n';
  fs.writeFileSync(path.join(repoDir, '.gitignore'), gitignoreContent);

  writeFirebaseConfig(repoDir, opts.firebaseOpts || {});
  const publicDir = writePublicDir(repoDir, opts.fileContent);

  const sha = commitAll(repoDir, 'test: initial committed state');

  const manifest     = buildManifest(publicDir, sha, opts.manifestOpts || {});
  const manifestPath = writeManifest(manifest);

  const env = Object.assign({}, process.env, {
    IMPLICITEX_PRODUCTION_MODE:        'true',
    IMPLICITEX_APPROVED_SHA:            sha,
    IMPLICITEX_APPROVED_MANIFEST_PATH: manifestPath,
  }, opts.overrideEnv || {});

  return { repoDir, sha, manifestPath, publicDir, env };
}

/**
 * Run the guard with cwd set to repoDir (or opts.cwd if specified).
 * The guard derives its repo root from git rev-parse --show-toplevel at that cwd.
 */
function runGuard(env, repoDir, opts) {
  opts = opts || {};
  const r = spawnSync(process.execPath, [GUARD], {
    env,
    encoding: 'utf8',
    cwd: opts.cwd !== undefined ? opts.cwd : repoDir,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/** Clean up temp repo and manifest file. */
function cleanup(repoDir, manifestPath) {
  try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
  try { if (manifestPath) fs.unlinkSync(manifestPath); } catch (_) {}
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

// ── Baseline ────────────────────────────────────────────────────────────────

test('correct SHA and correct manifest — PASS', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 0, 'Expected exit 0. stderr:\n' + r.stderr);
    assert.ok(r.stdout.includes('Deployment authorized'));
    assert.ok(r.stdout.includes('All 12 guards passed'));
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── SHA / mode checks ───────────────────────────────────────────────────────

test('wrong approved SHA — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    overrideEnv: { IMPLICITEX_APPROVED_SHA: 'a'.repeat(40) },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('does not match'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('missing IMPLICITEX_APPROVED_SHA — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    overrideEnv: { IMPLICITEX_APPROVED_SHA: '' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('IMPLICITEX_APPROVED_SHA'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('IMPLICITEX_PRODUCTION_MODE not "true" — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    overrideEnv: { IMPLICITEX_PRODUCTION_MODE: 'yes' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('IMPLICITEX_PRODUCTION_MODE'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Working tree state ──────────────────────────────────────────────────────

test('dirty tracked file — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    fs.appendFileSync(path.join(repoDir, '.gitignore'), '# dirty\n');
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('not clean'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('staged file — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'staged');
    execSync('git add staged.txt', { cwd: repoDir, stdio: 'pipe' });
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('not clean'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('untracked non-ignored file — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    fs.writeFileSync(path.join(repoDir, 'surprise.txt'), 'oops');
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('not clean'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Firebase config checks ──────────────────────────────────────────────────

test('wrong Firebase project in .firebaserc — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    firebaseOpts: { project: 'implicitex-staging' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    // Error message includes the required project name and "production" alias context
    assert.ok(r.stderr.includes('implicitex') && r.stderr.includes('production'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('wrong public directory in firebase.json hosting:main — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    firebaseOpts: { mainPublic: 'app-web/frontend/other' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('public'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('firebase.json has no hosting:main target — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    firebaseOpts: { mainTarget: 'staging' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('no hosting target'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Artifact and manifest checks ────────────────────────────────────────────

test('gitignored public artifact modified after manifest approved — FAIL', () => {
  // build-info.json is gitignored so git status stays clean.
  // It is in the approved manifest. The guard must detect its SHA changed.
  const { repoDir, manifestPath, publicDir, sha, env } = makeValidEnv();
  try {
    const generatedFile = path.join(publicDir, 'build-info.json');
    fs.writeFileSync(generatedFile, JSON.stringify({ commit: sha }));

    // Rebuild manifest to include build-info.json (gitignored, so git status still clean)
    const updatedFiles    = walkDir(publicDir);
    const updatedManifest = {
      schema_version: 1,
      generated_at:   '2026-07-31T00:00:00.000Z',
      commit:         sha,
      public_dir:     'app-web/frontend/public',
      file_count:     updatedFiles.length,
      manifest_hash:  computeManifestHash(updatedFiles),
      files:          updatedFiles,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
    env.IMPLICITEX_APPROVED_MANIFEST_PATH = manifestPath;

    // NOW modify the gitignored file — git status still clean
    fs.writeFileSync(generatedFile, JSON.stringify({ commit: 'tampered' }));

    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(
      r.stderr.includes('SHA-256 MISMATCH') || r.stderr.includes('Manifest hash'),
      r.stderr
    );
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('stale build-info.json present but absent from manifest — FAIL (check 11)', () => {
  // build-info.json is gitignored → git status stays clean.
  // It is NOT in the approved manifest → guard must catch it at check 11.
  const { repoDir, manifestPath, publicDir, env } = makeValidEnv();
  try {
    fs.writeFileSync(
      path.join(publicDir, 'build-info.json'),
      JSON.stringify({ commit: 'stale', dirty: false })
    );
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('build-info.json'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Manifest file checks ────────────────────────────────────────────────────

test('approved manifest file is absent — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    overrideEnv: { IMPLICITEX_APPROVED_MANIFEST_PATH: '/nonexistent/ix-manifest.json' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('Cannot read or parse'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('IMPLICITEX_APPROVED_MANIFEST_PATH not set — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    overrideEnv: { IMPLICITEX_APPROVED_MANIFEST_PATH: '' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('IMPLICITEX_APPROVED_MANIFEST_PATH'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('malformed manifest JSON — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    fs.writeFileSync(manifestPath, '{ not valid json }');
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('Cannot read or parse'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('manifest with wrong schema_version — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { schemaVersion: 99 },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('schema_version'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('manifest with empty files array — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { emptyFiles: true },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('non-empty files array'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('manifest_hash field tampered — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { badHash: true },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('Manifest hash'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('approved manifest references file missing from disk — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const extra = { path: 'ghost-file.html', sha256: 'a'.repeat(64), bytes: 100 };
    m.files.push(extra);
    m.file_count    = m.files.length;   // keep file_count consistent so check 10 is reached
    m.manifest_hash = computeManifestHash(m.files);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('MISSING from disk') || r.stderr.includes('mismatch'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Symlink and special file checks ─────────────────────────────────────────

test('symlink in public directory — FAIL', () => {
  // The symlink is gitignored so git status stays clean (check 6 passes).
  // The walker must detect and reject it (check 9).
  const { repoDir, manifestPath, publicDir, env } = makeValidEnv({
    extraGitignore: 'app-web/frontend/public/link.html',
  });
  try {
    // Create a symlink to an existing file (target doesn't need to be valid for the test)
    fs.symlinkSync(
      path.join(publicDir, 'index.html'),
      path.join(publicDir, 'link.html')
    );
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('ymbol') || r.stderr.includes('ymlink'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Path-safety checks (manifest entries) ───────────────────────────────────

test('manifest path containing ../ — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.files[0].path = '../secret/file.txt';
    m.manifest_hash = computeManifestHash(m.files);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('..') || r.stderr.includes('traversal') || r.stderr.includes('path'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('absolute path in manifest entry — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.files[0].path = '/etc/passwd';
    m.manifest_hash = computeManifestHash(m.files);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('absolute') || r.stderr.includes('path'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('duplicate path in manifest — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.files.push(Object.assign({}, m.files[0]));  // exact duplicate
    m.file_count    = m.files.length;  // keep file_count consistent so duplicate check is reached
    m.manifest_hash = computeManifestHash(m.files);
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.toLowerCase().includes('duplicate'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('incorrect byte count with correct SHA — FAIL', () => {
  // SHA matches (content unchanged) but manifest byte count is wrong.
  // The manifest_hash covers bytes, so the hash check catches this.
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    m.files[0].bytes = m.files[0].bytes + 999;  // wrong bytes, correct sha256
    m.manifest_hash  = computeManifestHash(m.files);  // recompute with wrong bytes
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));

    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    // The live manifest_hash (correct bytes) won't match approved (wrong bytes)
    assert.ok(
      r.stderr.includes('Manifest hash') || r.stderr.includes('BYTE COUNT') || r.stderr.includes('byte'),
      r.stderr
    );
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── IMPLICITEX_GUARD_REPO_ROOT has no effect ─────────────────────────────────

test('IMPLICITEX_GUARD_REPO_ROOT env var is ignored — guard uses cwd', () => {
  // Setting this env var must not redirect validation. The guard uses cwd only.
  const { repoDir, manifestPath, env } = makeValidEnv();
  try {
    const tamperedEnv = Object.assign({}, env, {
      IMPLICITEX_GUARD_REPO_ROOT: '/nonexistent/attacker-controlled-repo',
    });
    // cwd is still repoDir — guard must succeed (proving env var was ignored)
    const r = runGuard(tamperedEnv, repoDir);
    assert.equal(r.status, 0,
      'Guard should pass when cwd is correct regardless of IMPLICITEX_GUARD_REPO_ROOT. stderr:\n' + r.stderr
    );
    assert.ok(r.stdout.includes('Deployment authorized'));
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Manifest metadata binding (check 4b–4d) ─────────────────────────────────

test('manifest commit differs from approved SHA — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { manifestCommit: 'b'.repeat(40) },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(
      r.stderr.includes('Manifest commit') || r.stderr.includes('commit'),
      r.stderr
    );
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('manifest commit field is invalid format — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { manifestCommit: 'not-a-sha' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('commit'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('manifest public_dir does not match required directory — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { manifestPublicDir: 'app-web/frontend/other' },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('public_dir'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

test('manifest file_count does not match files array length — FAIL', () => {
  const { repoDir, manifestPath, env } = makeValidEnv({
    manifestOpts: { manifestFileCount: 9999 },
  });
  try {
    const r = runGuard(env, repoDir);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes('file_count'), r.stderr);
  } finally {
    cleanup(repoDir, manifestPath);
  }
});

// ── Real repository configuration check ─────────────────────────────────────

test('firebase.json: guard:production is the final hosting:main predeploy hook', () => {
  let firebaseJson;
  try {
    firebaseJson = JSON.parse(fs.readFileSync(FIREBASE_JSON, 'utf8'));
  } catch (e) {
    assert.fail('Cannot read or parse firebase.json: ' + e.message);
  }

  const hosting = Array.isArray(firebaseJson.hosting)
    ? firebaseJson.hosting
    : [firebaseJson.hosting];

  const mainTarget = hosting.find(h => h && h.target === 'main');
  assert.ok(mainTarget, 'firebase.json must have a hosting target named "main"');
  assert.equal(mainTarget.public, 'app-web/frontend/public',
    'hosting:main public must be app-web/frontend/public');

  const predeploy = mainTarget.predeploy || [];
  assert.ok(predeploy.length > 0, 'hosting:main must have at least one predeploy hook');

  const guardHooks = predeploy.filter(cmd => cmd.includes('guard:production'));
  assert.equal(guardHooks.length, 1,
    'guard:production must appear exactly once in hosting:main predeploy. Found: ' + guardHooks.length);

  const lastHook = predeploy[predeploy.length - 1];
  assert.ok(lastHook.includes('guard:production'),
    'guard:production must be the FINAL predeploy hook.\n' +
    '  Last hook is: ' + lastHook + '\n' +
    '  Reason: the manifest check must run after all generators and tests have completed.');
});

// ---------------------------------------------------------------------------
// Generator tests
// ---------------------------------------------------------------------------
//
// These tests run generate_production_manifest.js as a child process against
// isolated temporary git repositories. They never contact Firebase and never
// read from the production public directory.

/**
 * Run the manifest generator with cwd set to repoDir.
 * Returns { status, stdout, stderr }.
 */
function runGenerator(repoDir, extraArgs) {
  const r = spawnSync(process.execPath, [GENERATOR].concat(extraArgs || []), {
    cwd:      repoDir,
    env:      process.env,
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * Set up a minimal clean git repo with a public dir for generator tests.
 * Returns { repoDir, sha, publicDir }.
 */
function makeGeneratorRepo(opts) {
  opts = opts || {};
  const repoDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-gen-test-'));
  initRepo(repoDir);

  fs.writeFileSync(path.join(repoDir, '.gitignore'), 'app-web/frontend/public/build-info.json\n');

  const publicDir = path.join(repoDir, 'app-web', 'frontend', 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), opts.fileContent || '<html>ImplicitEx</html>');
  if (opts.extraFiles) {
    for (const [name, content] of Object.entries(opts.extraFiles)) {
      fs.writeFileSync(path.join(publicDir, name), content);
    }
  }

  const sha = commitAll(repoDir, 'generator test: initial committed state');
  return { repoDir, sha, publicDir };
}

test('generator: produces valid manifest from clean repo — PASS', () => {
  const { repoDir, sha, publicDir } = makeGeneratorRepo();
  const outPath = path.join(os.tmpdir(), 'ix-gen-test-' + process.pid + '-' + Date.now() + '.json');
  try {
    const r = runGenerator(repoDir, ['--output', outPath]);
    assert.equal(r.status, 0, 'Expected exit 0. stderr:\n' + r.stderr);

    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(manifest.schema_version, 1);
    assert.equal(typeof manifest.manifest_hash, 'string');
    assert.equal(manifest.manifest_hash.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(manifest.manifest_hash));
    assert.ok(Array.isArray(manifest.files));
    assert.ok(manifest.files.length > 0);
  } finally {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
});

test('generator: emits the current full commit SHA', () => {
  const { repoDir, sha } = makeGeneratorRepo();
  const outPath = path.join(os.tmpdir(), 'ix-gen-test-' + process.pid + '-' + Date.now() + '.json');
  try {
    const r = runGenerator(repoDir, ['--output', outPath]);
    assert.equal(r.status, 0, r.stderr);
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(manifest.commit, sha,
      'Manifest commit must match git HEAD SHA.\n  Got: ' + manifest.commit + '\n  Expected: ' + sha);
  } finally {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
});

test('generator: emits correct public_dir and file_count', () => {
  const { repoDir, publicDir } = makeGeneratorRepo({
    extraFiles: { 'about.html': '<html>about</html>' },
  });
  const outPath = path.join(os.tmpdir(), 'ix-gen-test-' + process.pid + '-' + Date.now() + '.json');
  try {
    const r = runGenerator(repoDir, ['--output', outPath]);
    assert.equal(r.status, 0, r.stderr);
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(manifest.public_dir, 'app-web/frontend/public');
    assert.equal(manifest.file_count, manifest.files.length,
      'file_count must match files array length');
    // We wrote 2 files: index.html + about.html
    assert.equal(manifest.file_count, 2, 'Expected 2 files. Got: ' + manifest.file_count);
  } finally {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
});

test('generator: manifest hash matches guard computeManifestHash', () => {
  const { repoDir, publicDir } = makeGeneratorRepo();
  const outPath = path.join(os.tmpdir(), 'ix-gen-test-' + process.pid + '-' + Date.now() + '.json');
  try {
    const r = runGenerator(repoDir, ['--output', outPath]);
    assert.equal(r.status, 0, r.stderr);
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));

    // Re-derive the manifest hash from the files array using the same algorithm
    const rederived = computeManifestHash(manifest.files);
    assert.equal(rederived, manifest.manifest_hash,
      'Re-derived manifest hash must match generator output.\n' +
      '  Got:      ' + manifest.manifest_hash + '\n' +
      '  Expected: ' + rederived);
  } finally {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
});

test('generator: refuses dirty working tree — FAIL', () => {
  const { repoDir, publicDir } = makeGeneratorRepo();
  try {
    // Add an untracked non-ignored file after the commit
    fs.writeFileSync(path.join(repoDir, 'dirty.txt'), 'uncommitted');
    const r = runGenerator(repoDir);
    assert.equal(r.status, 1, 'Expected exit 1 for dirty tree. stdout:\n' + r.stdout);
    assert.ok(r.stderr.includes('not clean') || r.stderr.includes('dirty') || r.stderr.includes('clean'),
      r.stderr);
  } finally {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('generator: refuses symlink in public directory — FAIL', () => {
  const { repoDir, publicDir } = makeGeneratorRepo({
    // Gitignore the symlink so git status stays clean
    fileContent: '<html>ImplicitEx</html>',
  });
  // Write the symlink gitignore entry and commit it as part of the initial setup
  const newRepo   = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-gen-sym-'));
  const newPublic = path.join(newRepo, 'app-web', 'frontend', 'public');
  try {
    initRepo(newRepo);
    fs.writeFileSync(path.join(newRepo, '.gitignore'),
      'app-web/frontend/public/build-info.json\napp-web/frontend/public/link.html\n');
    fs.mkdirSync(newPublic, { recursive: true });
    fs.writeFileSync(path.join(newPublic, 'index.html'), '<html>ImplicitEx</html>');
    commitAll(newRepo, 'generator symlink test: setup');

    // Create symlink after commit — gitignored so git status stays clean
    fs.symlinkSync(
      path.join(newPublic, 'index.html'),
      path.join(newPublic, 'link.html')
    );

    const r = runGenerator(newRepo);
    assert.equal(r.status, 1, 'Expected exit 1 for symlink. stdout:\n' + r.stdout);
    assert.ok(r.stderr.includes('ymbol') || r.stderr.includes('ymlink'), r.stderr);
  } finally {
    try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(newRepo, { recursive: true, force: true }); } catch (_) {}
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
console.log(passed + '/' + (passed + failed) + ' tests passed');

if (failed > 0) {
  process.exit(1);
}
