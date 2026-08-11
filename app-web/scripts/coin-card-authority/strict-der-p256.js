'use strict';

// Order of the NIST P-256 base point. ECDSA r and s are in [1, n - 1].
const P256_ORDER = BigInt([
  '0xffff',
  'ffff00000000ffffffffffffffff',
  'bce6faada7179e84f3b9cac2fc632551',
].join(''));
const P256_COMPONENT_BYTES = 32;
const P1363_SIGNATURE_BYTES = 64;

function asBytes(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError(`${label} must be bytes`);
}

function readShortDerLength(bytes, offset, label) {
  if (offset >= bytes.length) throw new Error(`${label}: missing DER length`);
  const length = bytes[offset];
  if ((length & 0x80) !== 0) {
    throw new Error(`${label}: long-form or indefinite DER length is not canonical`);
  }
  return { length, nextOffset: offset + 1 };
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function parsePositiveInteger(bytes, offset, label) {
  if (offset >= bytes.length || bytes[offset] !== 0x02) {
    throw new Error(`${label}: expected DER INTEGER`);
  }
  const lengthInfo = readShortDerLength(bytes, offset + 1, label);
  const length = lengthInfo.length;
  const start = lengthInfo.nextOffset;
  const end = start + length;
  if (length === 0 || end > bytes.length) {
    throw new Error(`${label}: empty or truncated DER INTEGER`);
  }

  const encoded = bytes.subarray(start, end);
  if ((encoded[0] & 0x80) !== 0) {
    throw new Error(`${label}: negative DER INTEGER`);
  }

  let magnitude = encoded;
  if (encoded[0] === 0x00) {
    if (encoded.length === 1) throw new Error(`${label}: zero DER INTEGER`);
    if ((encoded[1] & 0x80) === 0) {
      throw new Error(`${label}: unnecessary DER INTEGER leading zero`);
    }
    magnitude = encoded.subarray(1);
  }
  if (magnitude.length > P256_COMPONENT_BYTES) {
    throw new Error(`${label}: DER INTEGER exceeds P-256 width`);
  }

  const scalar = bytesToBigInt(magnitude);
  if (scalar === 0n || scalar >= P256_ORDER) {
    throw new Error(`${label}: DER INTEGER is outside the P-256 scalar range`);
  }

  const padded = Buffer.alloc(P256_COMPONENT_BYTES);
  Buffer.from(magnitude).copy(padded, P256_COMPONENT_BYTES - magnitude.length);
  return { value: padded, nextOffset: end };
}

function derP256ToP1363(input) {
  const bytes = asBytes(input, 'DER signature');
  if (bytes.length < 8 || bytes.length > 72) {
    throw new Error('DER signature length is invalid for P-256');
  }
  if (bytes[0] !== 0x30) throw new Error('DER signature must be a SEQUENCE');

  const sequenceLength = readShortDerLength(bytes, 1, 'signature');
  if (sequenceLength.length !== bytes.length - sequenceLength.nextOffset) {
    throw new Error('DER signature SEQUENCE length mismatch or trailing data');
  }

  const r = parsePositiveInteger(bytes, sequenceLength.nextOffset, 'r');
  const s = parsePositiveInteger(bytes, r.nextOffset, 's');
  if (s.nextOffset !== bytes.length) {
    throw new Error('DER signature contains trailing data');
  }

  const output = Buffer.concat([r.value, s.value]);
  if (output.length !== P1363_SIGNATURE_BYTES) {
    throw new Error('P1363 signature output length is invalid');
  }
  return output;
}

module.exports = Object.freeze({
  P256_ORDER,
  P256_COMPONENT_BYTES,
  P1363_SIGNATURE_BYTES,
  derP256ToP1363,
});
