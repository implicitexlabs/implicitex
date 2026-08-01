# Coin Card Publisher MVP Smoke - 2026-06-28

## Scope

Implementation smoke for the first Coin Card Publisher MVP surface.

Files under test:

- `frontend/public/js/coincard-publisher-core.js`
- `frontend/public/js/coincard-publisher-mvp.js`
- `frontend/public/coincard/publisher-mvp.html`
- `frontend/public/css/main.css`

This smoke verifies the MVP implementation path only. It does not deploy, write
to the production registry, execute transfers, or mutate legacy Coin Card
registry files.

## Authority

This smoke is governed by:

- `docs/product/IMPLICITEX_ARCHITECTURAL_PRINCIPLES.md`
- `docs/product/coin-card/COIN_CARD_TRUST_MODEL.md`
- `docs/product/coin-card/MANIFEST_SCHEMA.md`
- `docs/product/coin-card/REGISTRY_MODEL.md`
- `docs/product/coin-card/REVOCATION_MODEL.md`
- `docs/product/coin-card/COIN_CARD_VERIFICATION_LANGUAGE.md`
- `docs/product/coin-card/PUBLISHER_SPEC.md`
- `docs/product/coin-card/COIN_CARD_PUBLISHER_MVP.md`

## Static Validation

Command:

```bash
npm run check:static
```

Result:

```text
Static public check passed (1374 local references checked).
```

## Core Primitive Smoke

Command:

```bash
node -e "globalThis.ethers=require('ethers'); const core=require('./frontend/public/js/coincard-publisher-core.js'); ..."
```

Observed output:

```json
{
  "card_id": "coincard:creator:publisher-mvp",
  "payload_hash": "sha256:ca5cc8e545d1b228e552bc2be977b0e70ceff33643a3da058bfd5346d36e034d",
  "manifest_hash": "sha256:b56ca083c8e9fa07a31b13cf4d768cb8ec3291cb33288b7c5aa67c4b72ba5a29",
  "verification_state": "pending",
  "uncertainty_reason": "registry_signature_pending"
}
```

Assessment:

- Canonical manifest generation worked.
- Payload hash generation worked.
- EIP-191 creator signature verification worked.
- Registry draft generation worked.
- Verification output preserved uncertainty because no registry signature exists.
- Evidence archive marked `registry_signature` as missing.

## Browser Smoke

Local server:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Target:

```text
http://127.0.0.1:4173/coincard/publisher-mvp.html
```

### Desktop Manifest Generation

Viewport:

```text
1280 x 900
```

Observed:

```json
{
  "title": "ImplicitEx - Coin Card Publisher MVP",
  "cardId": "coincard:creator:publisher-mvp",
  "payloadHash": "sha256:69df71dcc224...818ebd97",
  "notice": "Canonical manifest generated. Review the payload before signing.",
  "bodyW": 1280,
  "innerW": 1280,
  "manifestLen": 695,
  "canonicalLen": 575
}
```

Result:

- No console errors.
- No page errors.
- No horizontal overflow.
- Manifest and canonical payload rendered.

### Mobile Manifest Generation

Viewport:

```text
390 x 844
```

Observed:

```json
{
  "title": "ImplicitEx - Coin Card Publisher MVP",
  "cardId": "coincard:creator:publisher-mvp",
  "payloadHash": "sha256:4467ea43ccce...fb6fce28",
  "notice": "Canonical manifest generated. Review the payload before signing.",
  "bodyW": 390,
  "innerW": 390,
  "manifestLen": 695,
  "canonicalLen": 575
}
```

Result:

- No console errors.
- No page errors.
- No horizontal overflow.
- Mobile layout remained within viewport.

## Fake-Wallet End-to-End Smoke

Method:

- Puppeteer injected a fake EIP-1193 provider.
- The provider returned a deterministic ethers wallet address.
- The provider signed the canonical payload through `personal_sign`.

Observed:

```json
{
  "errors": [],
  "data": {
    "issuer": "0xA010e68FaB27FBA39F787FB80689de0b1B62E8Df",
    "verificationState": "pending",
    "uncertainty": "registry_signature_pending",
    "missing": [
      "registry_signature"
    ],
    "observed": [
      "signed_manifest",
      "registry_record",
      "verification_output"
    ],
    "bodyW": 1280,
    "innerW": 1280
  }
}
```

Result:

- Issuer wallet selection worked.
- Canonical manifest generation worked.
- Creator signature path worked.
- Registry draft path worked.
- Verification output path worked.
- Evidence archive path worked.
- Operational validity remained `pending` because registry signature evidence was absent.

## Reconciliation

The implementation demonstrates the authorized MVP path:

```text
Input
    -> canonical manifest generation
    -> creator signature
    -> registry draft
    -> verification output
    -> evidence archive
```

The implementation intentionally does not:

- write to the production registry,
- execute a transfer,
- create a generalized publisher dashboard,
- create an account system,
- customize card presentation,
- imply business verification,
- imply payment success,
- treat card appearance as proof.

## Status

```text
Coin Card Publisher MVP implementation smoke
    OBSERVED
    RECONCILED
    ARCHIVED

Result
    PASS
```
