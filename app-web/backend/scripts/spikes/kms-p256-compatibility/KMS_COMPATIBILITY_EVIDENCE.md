# KMS P-256 Compatibility Evidence

**Date:** 2026-07-21
**Status:** GATE PASSED — implementation sequence may proceed

---

## Question answered

> Can Cloud KMS `EC_SIGN_P256_SHA256` produce a registry signature accepted unchanged
> by the existing `coin-card-lifecycle-record-verification.js` verifier?

**Answer: Yes.**

---

## Correction to backend architecture document

The architecture document (`COIN_CARD_BACKEND_ARCHITECTURE_V1.md`) referenced
`EC_SIGN_SECP256K1_SHA256` and described the expected format as Ethereum-style
`r || s || v` (65 bytes). Both are incorrect.

The lifecycle record verifier (`coin-card-lifecycle-record-verification.js`) and
the trusted key record (`coin-card-trusted-keys.js`, key `ix-lifecycle-pub-v1`)
specify:

```
algorithm:         ECDSA_P256_SHA256
namedCurve:        P-256
signatureEncoding: ieee-p1363
signatureLengthBytes: 64
```

The correct KMS key type is **`EC_SIGN_P256_SHA256`**. The correct output format is
IEEE P1363 (64 bytes: 32-byte `r` + 32-byte `s`). There is no recovery identifier.
The architecture document must be updated before implementation begins.

---

## Signing contract (exact)

### Key type
`EC_SIGN_P256_SHA256` — P-256 curve, SHA-256 hash

### Payload construction

```
signed_bytes = UTF8("ImplicitEx Coin Card Lifecycle Registry Record v1")
             + 0x00
             + UTF8(canonicalizeJson(record_without_signature_value))
```

Where `canonicalizeJson`:
- Sorts object keys by Unicode code point
- No insignificant whitespace
- Custom string escaping (see `coin-card-lifecycle-registry.js`)
- Only safe integers (no floats, no -0)

The record passed to canonicalization has the `signature` object with all fields
**except** `value` — all other signature metadata (`mode`, `algorithm`, `keyId`,
`signedAt`, etc.) is included in the signed payload.

### KMS call

```
AsymmetricSign({
  name:   "projects/<project>/locations/<location>/keyRings/coincard/cryptoKeyVersions/<version>",
  digest: { sha256: sha256(signed_bytes) }
})
```

KMS returns an ASN.1 DER-encoded ECDSA signature.

### DER → P1363 conversion

```javascript
function derToP1363(derBytes) {
  // Parse DER SEQUENCE { INTEGER r, INTEGER s }
  // Strip DER 0x00 pad byte from r and s if present
  // Left-pad each to 32 bytes
  // Concatenate: r(32) || s(32) = 64 bytes
}
```

The conversion is deterministic given a DER input. It has no failure modes for
valid P-256 DER signatures. See `spike.test.js` for the full implementation and
edge-case tests.

### Signature value in the record

```javascript
signature.value = base64url_no_padding(p1363_64_bytes)  // always 86 characters
```

---

## Evidence

### Test run — 9/9 PASS

Run: `node backend/scripts/spikes/kms-p256-compatibility/spike.test.js`

```
ok 1 - derToP1363 — converts minimal DER SEQUENCE (no 0x00 pads) to 64-byte P1363
ok 2 - derToP1363 — strips DER 0x00 padding byte from r and s when high bit is set
ok 3 - derToP1363 — left-pads short integer values to 32 bytes
ok 4 - derToP1363 — rejects input that does not start with SEQUENCE tag 0x30
ok 5 - derToP1363 — rejects missing INTEGER tag for r
ok 6 - Node.js crypto.createSign (DER output) → derToP1363 → verifier: LIFECYCLE_RECORD_AUTHENTICATED
ok 7 - Two independent DER signatures on the same payload both verify (ECDSA non-determinism)
ok 8 - Web Crypto P1363 signature (no conversion needed) also verifies — establishes baseline
ok 9 - REVOKED record with DER-derived signature verifies — refund lifecycle works

# tests 9  pass 9  fail 0
```

### End-to-end signing evidence (run 1)

The test record used:

```json
{
  "registryId": "implicitex-production",
  "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
  "environment": "production",
  "cardId": "coincard:spike:kms-test-handle",
  "cardStatus": "CARD_ACTIVE",
  "manifestStatus": "MANIFEST_CURRENT",
  "authorityId": "implicitex-registry",
  "revision": 1
}
```

Signed payload SHA-256:
```
ffb4e3362def4cce2ce40ddb95a86a7b72e413c7efc232c917e14391f449cd49
```

DER signature returned by Node.js `createSign` (simulating KMS DER output):
```
3046022100d58a3868150dc6f5c080afbb04c83d28143a3f8729c80ad978c592a6276a43b9
022100b3c9a7fe2f548ca5a8455c8e7bfc6811206cc3c3341aac3fa21fef8571e0ef52
```

P1363 after `derToP1363` conversion:
```
d58a3868150dc6f5c080afbb04c83d28143a3f8729c80ad978c592a6276a43b9
b3c9a7fe2f548ca5a8455c8e7bfc6811206cc3c3341aac3fa21fef8571e0ef52
```

base64url value placed in `signature.value`:
```
1Yo4aBUNxvXAgK-7BMg9KBQ6P4cpyArZeMWSpidqQ7mzyaf-L1SMpahFXI57_GgRIGzDwzQarD-iH--FceDvUg
```

Verifier outcome: `LIFECYCLE_RECORD_AUTHENTICATED`

### Non-determinism evidence (run 2)

Two separate signing calls on the same payload produced different signatures.
Both authenticated:

```
signature 1: 269b2c14...
signature 2: 34fee6a5...
signatures differ: YES (expected)
both authenticated: true
```

### REVOKED lifecycle evidence

A revision-2 `CARD_REVOKED` + `MANIFEST_REVOKED` record signed with DER-derived
P1363 signature authenticated successfully. This confirms the refund publication
protocol (which produces a new signed REVOKED artifact) is supported by the
verifier without modification.

---

## What this does not prove

1. That the specific KMS key identified in the architecture (`ix-lifecycle-pub-v1`
   public key in `coin-card-trusted-keys.js`) is already provisioned in Cloud KMS.
   It is not. The public key in the trusted key file corresponds to a key generated
   offline (by `generate_signed_coin_card_acceptance.js`). Before implementation
   begins, a new KMS key must be created and its public key exported to replace the
   current `ix-lifecycle-pub-v1` trusted key record.

2. That the IAM configuration is correct. Service account permissions for
   `cloudkms.cryptoKeyVersions.useToSign` must be verified in step 2 of the
   implementation sequence.

3. That the production KMS key is provisioned. This spike used ephemeral in-process
   keys. KMS key provisioning is implementation step 2.

---

## Required architecture document correction

Update `COIN_CARD_BACKEND_ARCHITECTURE_V1.md` section "KMS signature-format
compatibility gate":

| Item | Was | Correct |
|---|---|---|
| Key algorithm | `EC_SIGN_SECP256K1_SHA256` | `EC_SIGN_P256_SHA256` |
| Expected format | `r \|\| s \|\| v` (65 bytes, Ethereum-style) | IEEE P1363, `r \|\| s` (64 bytes, no recovery ID) |
| Hash algorithm | Keccak-256 | SHA-256 (handled internally by KMS/Web Crypto) |
| DER conversion target | 65-byte `r \|\| s \|\| v` | 64-byte `r(32) \|\| s(32)` |

The gate section should reference the `derToP1363` function in `spike.test.js`
as the canonical conversion implementation to be promoted into the Registry Publisher
module at implementation step 6.

---

## Implementation notes for Registry Publisher (step 6)

The `derToP1363` function from `spike.test.js` is the exact conversion needed in
the Registry Publisher module. It should be:

1. Extracted into `backend/functions/src/registry-publisher/der-to-p1363.js`
2. Covered by unit tests mirroring tests 1–5 of this spike
3. Called immediately after the KMS `asymmetricSign` response is received
4. The output (64-byte Buffer) is base64url-encoded (no padding) for the
   `signature.value` field

The KMS call itself uses the digest form:

```javascript
const [kmsResponse] = await kmsClient.asymmetricSign({
  name: keyVersionName,
  digest: { sha256: createHash('sha256').update(signedPayloadBytes).digest() },
});
const derBytes = Buffer.from(kmsResponse.signature);
const p1363Bytes = derToP1363(derBytes);
const signatureValue = p1363Bytes.toString('base64url');
```
