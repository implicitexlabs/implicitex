const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const toolsRoot = path.join(repoRoot, 'tools/coin-card-integrity');
const generator = path.join(toolsRoot, 'generate_manifest.py');
const verifier = path.join(toolsRoot, 'verify_manifest.py');
const cardIndex = path.join(publicRoot, 'card/index.html');
const manifestFilename = 'coin-card-manifest.json';
const protectedAssets = [
  'js/ix-execution.js',
  'card/coin-card-trusted-keys.js',
  'card/coin-card-trusted-key-resolution.js',
  'card/coin-card-lifecycle-registry.js',
  'card/coin-card-lifecycle-record-verification.js',
  'card/coin-card-lifecycle-bundle-verification.js',
  'card/coin-card-lifecycle-record-selection.js',
  'card/coin-card-lifecycle-resolution.js',
  'card/coin-card-verification.js',
  'card/card.js',
  'card/card.css',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function requireSuccess(label, command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.stdout.write(result.stdout || '');
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
  return result;
}

function compilePython(files) {
  const compileSource = [
    'import pathlib',
    'import sys',
    'for filename in sys.argv[1:]:',
    '    source = pathlib.Path(filename).read_text(encoding="utf-8")',
    '    compile(source, filename, "exec")',
  ].join('\n');

  requireSuccess('python compile', 'python', ['-c', compileSource, ...files]);
}

function copyProtectedAssets(targetRoot) {
  for (const asset of protectedAssets) {
    const source = path.join(publicRoot, asset);
    const target = path.join(targetRoot, asset);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function readRuntimeManifestPointer() {
  const html = fs.readFileSync(cardIndex, 'utf8');
  const match = html.match(/\sdata-ix-manifest="([^"]+)"/);
  assert(match, 'Coin Card runtime must declare data-ix-manifest');
  return match[1];
}

function assertGeneratedPackageShape(manifestPath) {
  assert.equal(path.basename(manifestPath), manifestFilename);
  assert.equal(readRuntimeManifestPointer(), manifestFilename);
  assert(fs.existsSync(manifestPath), 'generated manifest must exist at package root');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const declaredAssets = manifest.assets.map((asset) => asset.path).sort();
  assert.deepEqual(declaredAssets, [...protectedAssets].sort());
}

function main() {
  compilePython([generator, verifier]);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-integrity-'));
  const manifestPath = path.join(tempRoot, manifestFilename);
  const tamperRoot = path.join(tempRoot, 'tampered-public');

  requireSuccess('manifest generation', 'python', [
    generator,
    '--root',
    publicRoot,
    '--asset',
    'js/ix-execution.js',
    '--asset',
    'card/coin-card-trusted-keys.js',
    '--asset',
    'card/coin-card-trusted-key-resolution.js',
    '--asset',
    'card/coin-card-lifecycle-registry.js',
    '--asset',
    'card/coin-card-lifecycle-record-verification.js',
    '--asset',
    'card/coin-card-lifecycle-bundle-verification.js',
    '--asset',
    'card/coin-card-lifecycle-record-selection.js',
    '--asset',
    'card/coin-card-lifecycle-resolution.js',
    '--asset',
    'card/coin-card-verification.js',
    '--asset',
    'card/card.js',
    '--asset',
    'card/card.css',
    '--out',
    manifestPath,
    '--card-id',
    'cc_demo_implicitex',
    '--recipient',
    '0x0000000000000000000000000000000000000000',
    '--network',
    'polygon-mainnet',
  ]);

  requireSuccess('manifest verification', 'python', [
    verifier,
    '--root',
    publicRoot,
    manifestPath,
  ]);

  assertGeneratedPackageShape(manifestPath);

  copyProtectedAssets(tamperRoot);
  fs.appendFileSync(path.join(tamperRoot, 'card/coin-card-trusted-keys.js'), '\n/* tamper */\n', 'utf8');

  const tamperResult = run('python', [
    verifier,
    '--root',
    tamperRoot,
    manifestPath,
  ]);

  assert.notEqual(tamperResult.status, 0, 'tampered manifest verification must fail');
  assert.match(tamperResult.stderr, /asset hash mismatch for card\/coin-card-trusted-keys\.js/);
  assert.match(tamperResult.stderr, /asset size mismatch for card\/coin-card-trusted-keys\.js/);

  console.log('OK: Coin Card integrity proof tooling');
}

main();
