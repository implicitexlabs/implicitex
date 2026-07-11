# qrcode.min.js — Provenance and Governance Record

## Package

| Field       | Value                                    |
|-------------|------------------------------------------|
| npm package | `qrcode`                                 |
| Version     | `1.5.4` (exact pin in package.json)      |
| Author      | Ryan Day <soldair@gmail.com>             |
| License     | MIT                                      |
| Source      | https://github.com/soldair/node-qrcode   |

## Build

Bundled reproducibly from the package's browser entry point using the
project-pinned esbuild version:

```
npm run build:qrcode-vendor
```

which expands to:

```
esbuild node_modules/qrcode/lib/browser.js \
  --bundle --minify \
  --global-name=QRCode \
  --format=iife \
  --outfile=frontend/public/js/vendor/qrcode.min.js
```

Prerequisites: `npm ci` (installs `esbuild@0.25.5` and `qrcode@1.5.4`).

To verify the checked-in bytes against a fresh rebuild:
```
npm run check:qrcode-vendor
```

### Build record

| Field         | Value                                                              |
|---------------|--------------------------------------------------------------------|
| esbuild       | `0.25.5` (exact pin in package.json devDependencies)              |
| qrcode        | `1.5.4` (exact pin in package.json devDependencies)               |
| Output size   | 24,303 bytes                                                       |
| SHA-256       | `sha256:d59af15f40bc321f78871fe9d892d1dbbf05e35e20ad22aa51203c68185b58b6` |
| SRI           | `sha256-1ZrxX0C8Mh94hx/p2JLR278F414grSKqUSA8aBhbWLY=`            |

## Authority — accurate statement

This file is **not** statically loaded. It is dynamically injected by
`loadQrLibrary()` in `card/card.js` only after the integrity manifest passes
verification. As ordinary browser JavaScript it runs with the page's full
ambient authority. It can in principle read and modify the DOM, inspect
globals, intercept events, or monkey-patch browser APIs.

The *intended* call path is narrow:

- Called only inside `generateQR()` in `card/card.js`
- `QRCode.toCanvas(canvas, url, opts, cb)` — writes to `<canvas id="ccQrCanvas">`
- The `url` argument is built solely from `window.location.origin` and `state.cardId`
- No path to `state.registryRecord`, `state.intent`, recipient, fee, token, chain,
  or any protected execution state

However, the intended call path does not constrain the library's actual authority.

## Governance architecture (Option A — COMPLETE)

`qrcode.min.js` is now a governed asset in the Coin Card integrity manifest.
The governance enforces the following properties:

1. **Verification gates execution.** The static `<script>` tag has been removed
   from `card/index.html`. The library is injected dynamically by `loadQrLibrary()`
   in `card/card.js`, which is called only after `canExecuteTransfer()` returns
   true — i.e., only after the integrity manifest has verified the SHA-256 of
   every protected asset including this file.

2. **Browser SRI enforcement.** `loadQrLibrary()` reads the SHA-256 from the
   verified manifest's asset list, converts it to SRI base64, and sets it as
   the `integrity` attribute on the dynamically created `<script>` element. The
   browser independently verifies the bytes before executing the script. If the
   SRI check fails, execution is blocked at the platform level.

3. **Manifest integrity.** `js/vendor/qrcode.min.js` is in `REQUIRED_ASSET_PATHS`
   in `coin-card-verification.js`. A manifest without this asset, or with a
   mismatched hash, fails the asset-policy check before any asset execution.

4. **Fail-closed chain.** If the manifest is absent, fails to load, or has a
   hash mismatch: `canExecuteTransfer()` returns false, `loadQrLibrary()` is
   never called, `QRCode` remains undefined, and `generateQR()` returns
   immediately (typeof guard at entry). Note: this gate applies specifically
   to `qrcode.min.js` execution. Other page assets (card.js, index.html) are
   loaded by ordinary browser mechanisms; the manifest verifies their hashes
   but does not dynamically inject them.

5. **Reproducible build.** The checked-in bytes are produced by a deterministic
   build from pinned `qrcode@1.5.4` + `esbuild@0.25.5`. SHA-256 is recorded
   above. `npm run check:qrcode-vendor` verifies the rebuild matches.

| Option | Description | Status |
|--------|-------------|--------|
| A | Add `qrcode.min.js` to the lifecycle integrity manifest with a recorded SHA-256, dynamic injection gated on verification, and browser SRI enforcement | **COMPLETE** |
| B | Move QR rendering outside the protected card frame | Not required — A implemented |
| C | Replace with governed first-party encoder | Not required — A implemented |

## License text location

`node_modules/qrcode/LICENSE`
