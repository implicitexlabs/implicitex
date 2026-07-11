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

Bundled reproducibly from the package's browser entry point:

```
npx esbuild node_modules/qrcode/lib/browser.js \
  --bundle --minify \
  --global-name=QRCode \
  --format=iife \
  --outfile=frontend/public/js/vendor/qrcode.min.js
```

Output size: ~24 KB. Global exposed: `QRCode`.

## Authority — accurate statement

This file is loaded as a same-page `<script>` in `card/index.html`. As ordinary
browser JavaScript it runs with the page's full ambient authority. It can
in principle read and modify the DOM, inspect globals, intercept events, or
monkey-patch browser APIs before later scripts load.

The *intended* call path is narrow:

- Called only inside `generateQR()` in `card/card.js`
- `QRCode.toCanvas(canvas, url, opts, cb)` — writes to `<canvas id="ccQrCanvas">`
- The `url` argument is built solely from `window.location.origin` and `state.cardId`
- No path to `state.registryRecord`, `state.intent`, recipient, fee, token, chain,
  or any protected execution state

However, the intended call path does not constrain the library's actual authority.

## Outstanding architecture decision (blocking production trust boundary)

Before this library can be treated as part of a governed trust surface, one of
the following must be resolved:

| Option | Description | Status |
|--------|-------------|--------|
| A | Add `qrcode.min.js` to the lifecycle integrity manifest with a recorded SHA-256 and tamper tests | Not done |
| B | Move QR rendering outside the protected card frame (separate presentation layer, e.g. a sandboxed iframe or worker with a narrow message contract) | Not done |
| C | Replace with governed first-party encoder code (~3 KB, audited, no npm dependency) | Not done |

Until one of these is completed, `qrcode.min.js` must not be treated as a
protected asset and its integrity is not verified by the Coin Card lifecycle
contracts.

**This is a release blocker for production deployment of the QR feature.**

## License text location

`node_modules/qrcode/LICENSE`
