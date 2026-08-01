/* check_qrcode_vendor.js
 *
 * Deterministic build verification for js/vendor/qrcode.min.js.
 *
 * Rebuilds qrcode.min.js from node_modules/qrcode/lib/browser.js using the
 * project-pinned esbuild version and compares the output SHA-256 against the
 * checked-in file. Fails with a non-zero exit code and a clear error message
 * if they differ.
 *
 * Usage:
 *   node scripts/check_qrcode_vendor.js          # compare only
 *   npm run check:qrcode-vendor                  # same, via package script
 *
 * Prerequisite: npm ci (installs esbuild@0.25.5 and qrcode@1.5.4).
 */

'use strict';

const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const checkedInPath = path.join(appRoot, 'frontend/public/js/vendor/qrcode.min.js');
const esbuildBin = path.join(appRoot, 'node_modules/.bin/esbuild');
const qrcodeEntry = path.join(appRoot, 'node_modules/qrcode/lib/browser.js');

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function main() {
  /* Verify prerequisites. */
  if (!fs.existsSync(esbuildBin)) {
    process.stderr.write(
      '[check:qrcode-vendor] esbuild not found at node_modules/.bin/esbuild.\n' +
      'Run "npm ci" to install the pinned esbuild@0.25.5.\n'
    );
    process.exit(1);
  }
  if (!fs.existsSync(qrcodeEntry)) {
    process.stderr.write(
      '[check:qrcode-vendor] qrcode package not found at node_modules/qrcode/lib/browser.js.\n' +
      'Run "npm ci" to install qrcode@1.5.4.\n'
    );
    process.exit(1);
  }
  if (!fs.existsSync(checkedInPath)) {
    process.stderr.write(
      '[check:qrcode-vendor] Checked-in file not found: ' + checkedInPath + '\n'
    );
    process.exit(1);
  }

  /* Rebuild to a temp file. */
  const tmpOut = path.join(os.tmpdir(), 'qrcode_vendor_check_' + process.pid + '.js');
  try {
    const result = spawnSync(
      esbuildBin,
      [
        qrcodeEntry,
        '--bundle',
        '--minify',
        '--global-name=QRCode',
        '--format=iife',
        '--outfile=' + tmpOut,
      ],
      { cwd: appRoot, encoding: 'utf8' }
    );
    if (result.status !== 0) {
      process.stderr.write(
        '[check:qrcode-vendor] esbuild rebuild failed:\n' + (result.stderr || '') + '\n'
      );
      process.exit(1);
    }

    /* Compare SHA-256. */
    const rebuiltBytes = fs.readFileSync(tmpOut);
    const checkedInBytes = fs.readFileSync(checkedInPath);
    const rebuiltHash = sha256Hex(rebuiltBytes);
    const checkedInHash = sha256Hex(checkedInBytes);

    if (rebuiltHash === checkedInHash) {
      process.stdout.write(
        '[check:qrcode-vendor] PASS — checked-in qrcode.min.js matches reproducible build.\n' +
        '  SHA-256: sha256:' + checkedInHash + '\n' +
        '  Size:    ' + checkedInBytes.length + ' bytes\n' +
        '  esbuild: ' + path.basename(path.dirname(path.dirname(esbuildBin))) + ' (local)\n'
      );
    } else {
      process.stderr.write(
        '[check:qrcode-vendor] FAIL — checked-in qrcode.min.js does not match reproducible build.\n' +
        '  Checked-in SHA-256: sha256:' + checkedInHash + ' (' + checkedInBytes.length + ' bytes)\n' +
        '  Rebuilt SHA-256:    sha256:' + rebuiltHash + ' (' + rebuiltBytes.length + ' bytes)\n' +
        '\n' +
        'To update the checked-in file, run:\n' +
        '  npm run build:qrcode-vendor\n' +
        'Then verify the SHA-256, update QRCODE_PROVENANCE.md, and commit all three.\n'
      );
      process.exit(1);
    }
  } finally {
    try { fs.unlinkSync(tmpOut); } catch (_) {}
  }
}

main();
