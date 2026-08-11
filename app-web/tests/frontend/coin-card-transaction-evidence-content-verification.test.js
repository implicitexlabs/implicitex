const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const registryRuntimePath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-lifecycle-registry.js',
);
const canonicalJsonRuntimePath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-canonical-json-v1.js',
);
const verifierRuntimePath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-transaction-evidence-content-verification.js',
);
const fixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.transaction-evidence.fixtures.v1.json',
);

const registryRuntimeSource = fs.readFileSync(registryRuntimePath, 'utf8');
const canonicalJsonRuntimeSource = fs.readFileSync(canonicalJsonRuntimePath, 'utf8');
const verifierRuntimeSource = fs.readFileSync(verifierRuntimePath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function positiveEnvelope(authority = fixture.positive.authority) {
  return {
    authority: structuredClone(authority),
    authorityHash: fixture.positive.expectedAuthorityHash,
    keyId: fixture.positive.signatureVector.keyId,
    signature: fixture.positive.signatureVector.signature,
    signatureAlgorithm: fixture.positive.signatureVector.signatureAlgorithm,
  };
}

function digestImplementation(options = {}) {
  return {
    digest(algorithm, bytes) {
      assert.equal(algorithm, 'SHA-256');
      if (options.throwDigest) throw new Error('digest threw');
      if (options.rejectDigest) return Promise.reject(new Error('digest rejected'));
      if (options.shortDigest) return Promise.resolve(new Uint8Array(31).buffer);
      const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const digest = createHash('sha256').update(input).digest();
      return Promise.resolve(digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength));
    },
  };
}

function loadRuntime(options = {}) {
  const context = {
    Promise,
    String,
    Uint8Array,
    window: {},
  };
  context.globalThis = context;

  if (!options.textEncoderUnavailable) {
    let RuntimeTextEncoder = TextEncoder;
    if (options.textEncoderThrows === 'constructor') {
      RuntimeTextEncoder = class {
        constructor() {
          throw new Error('encoder constructor threw');
        }
      };
    } else if (options.textEncoderThrows === 'encode') {
      RuntimeTextEncoder = class {
        encode() {
          throw new Error('encoder encode threw');
        }
      };
    } else if (options.textEncoderReturnsObject) {
      RuntimeTextEncoder = class {
        encode() {
          return { bytes: 'not-a-Uint8Array' };
        }
      };
    }
    context.TextEncoder = RuntimeTextEncoder;
    context.window.TextEncoder = RuntimeTextEncoder;
  }

  if (!options.cryptoUnavailable) {
    context.window.crypto = { subtle: digestImplementation(options) };
  }

  if (Object.prototype.hasOwnProperty.call(options, 'canonicalizerResult')) {
    context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY = Object.freeze({
      canonicalizeJson() {
        return options.canonicalizerResult;
      },
    });
  } else if (options.canonicalizerThrows) {
    context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY = Object.freeze({
      canonicalizeJson() {
        throw new Error('canonicalizer threw');
      },
    });
  } else if (!options.canonicalizerUnavailable) {
    vm.runInNewContext(canonicalJsonRuntimeSource, context, { filename: canonicalJsonRuntimePath });
    vm.runInNewContext(registryRuntimeSource, context, { filename: registryRuntimePath });
  }

  vm.runInNewContext(verifierRuntimeSource, context, { filename: verifierRuntimePath });
  return {
    api: context.window.IX_COIN_CARD_TRANSACTION_EVIDENCE_CONTENT_VERIFICATION,
    context,
  };
}

function realmValue(context, value) {
  context.__evidenceJson = JSON.stringify(value);
  return vm.runInNewContext('JSON.parse(__evidenceJson)', context);
}

function positiveRealmEnvelope(context, authority = fixture.positive.authority) {
  return realmValue(context, positiveEnvelope(authority));
}

function clone(value) {
  return structuredClone(value);
}

function setPath(object, pathExpression, replacement) {
  const parts = pathExpression.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = replacement;
}

function authorityHashFor(context, authority) {
  const canonicalizer = context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY;
  const canonicalAuthority = canonicalizer.canonicalizeJson(realmValue(context, authority));
  const bytes = Buffer.concat([
    Buffer.from(fixture.domains.authority),
    Buffer.from([0]),
    Buffer.from(canonicalAuthority),
  ]);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function resultFor(value, options = {}) {
  const runtime = loadRuntime(options);
  return {
    api: runtime.api,
    result: await runtime.api.validateAndHashEvidence(realmValue(runtime.context, value)),
  };
}

function assertFailureResult(api, result, expectedOutcome, id) {
  assert.equal(result.outcome, expectedOutcome, id);
  assert.equal(result.contentValidated, false, id);
  assert.equal(result.authorityHashEstablished, false, id);
  assert.equal(result.signatureEncodingValidated, false, id);
  assert.equal(result.signatureVerified, false, id);
  assert.equal(result.authenticated, false, id);
  assert.equal(result.current, false, id);
  assert.equal(result.executionEligible, false, id);
  assert.equal(result.envelope, null, id);
  assert.equal(result.authority, null, id);
  assert.equal(result.canonicalAuthority, null, id);
  assert.equal(result.authorityHash, null, id);
  assert.equal(Object.isFrozen(result), true, id);
  assert.equal(api.isValidatedEvidenceContentResult(result), false, id);
}

test('runtime API exposes branded content validation without authentication authority', async () => {
  const { api, context } = loadRuntime();
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.OUTCOMES), true);
  assert.equal(api.EVIDENCE_DOMAIN, 'ImplicitEx.CoinCard.TransactionEvidence');
  assert.equal(api.EVIDENCE_SCHEMA_VERSION, 'transaction-evidence.v1');
  assert.equal(
    api.LIFECYCLE_REGISTRY_SCHEMA_VERSION,
    'coin-card-lifecycle-registry-record.v1',
  );
  assert.equal(api.AUTHORITY_HASH_DOMAIN, fixture.domains.authority);
  assert.equal(api.SIGNATURE_ALGORITHM, 'ECDSA_P256_SHA256_P1363');

  const result = await api.validateAndHashEvidence(positiveRealmEnvelope(context));
  assert.equal(result.outcome, 'TRANSACTION_EVIDENCE_CONTENT_VALIDATED');
  assert.equal(result.contentValidated, true);
  assert.equal(result.authorityHashEstablished, true);
  assert.equal(result.signatureEncodingValidated, true);
  assert.equal(result.signatureVerified, false);
  assert.equal(result.authenticated, false);
  assert.equal(result.current, false);
  assert.equal(result.executionEligible, false);
  assert.equal(
    result.authority.lifecycleRegistrySchemaVersion,
    api.LIFECYCLE_REGISTRY_SCHEMA_VERSION,
  );
  assert.equal(api.isValidatedEvidenceContentResult(result), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.envelope), true);
  assert.equal(Object.isFrozen(result.authority), true);
  assert.equal(Object.isFrozen(result.authority.feePolicy), true);
});

test('positive fixture pins canonical authority text and domain-separated authority hash', async () => {
  const { api, context } = loadRuntime();
  const result = await api.validateAndHashEvidence(positiveRealmEnvelope(context));

  assert.equal(result.canonicalAuthority, fixture.positive.expectedAuthorityCanonicalJson);
  assert.equal(result.authorityHash, fixture.positive.expectedAuthorityHash);
  assert.equal(result.authorityHash, result.envelope.authorityHash);
});

test('authority and envelope property insertion order do not change canonical content', async () => {
  const { api, context } = loadRuntime();
  const envelope = positiveEnvelope(fixture.positive.authorityPropertyOrderVariant);
  const reorderedEnvelope = Object.fromEntries(Object.entries(envelope).reverse());
  const result = await api.validateAndHashEvidence(realmValue(context, reorderedEnvelope));

  assert.equal(result.outcome, 'TRANSACTION_EVIDENCE_CONTENT_VALIDATED');
  assert.equal(result.canonicalAuthority, fixture.positive.expectedAuthorityCanonicalJson);
  assert.equal(result.authorityHash, fixture.positive.expectedAuthorityHash);
});

test('closed envelope rejects unknown, missing, native-number, array, hidden, and accessor data', async () => {
  const vectors = [];
  const unknown = positiveEnvelope();
  unknown.catalogUrl = 'https://example.invalid/evidence';
  vectors.push(['unknown envelope field', unknown]);

  const missing = positiveEnvelope();
  delete missing.keyId;
  vectors.push(['missing envelope field', missing]);

  const authorityUnknown = positiveEnvelope();
  authorityUnknown.authority.tokenSymbol = 'USDC';
  vectors.push(['unknown authority field', authorityUnknown]);

  const nativeNumber = positiveEnvelope();
  nativeNumber.authority.chainId = 137;
  vectors.push(['native number', nativeNumber]);

  const array = positiveEnvelope();
  array.authority.feePolicy = [array.authority.feePolicy];
  vectors.push(['array', array]);

  for (const [id, envelope] of vectors) {
    const { api, result } = await resultFor(envelope);
    assertFailureResult(api, result, 'EVIDENCE_CANONICALIZATION_INVALID', id);
  }

  const { api, context } = loadRuntime();
  context.__positiveJson = JSON.stringify(positiveEnvelope());
  const hidden = vm.runInNewContext(`(() => {
    const value = JSON.parse(__positiveJson);
    Object.defineProperty(value.authority, 'hidden', { value: 'x', enumerable: false });
    return value;
  })()`, context);
  assertFailureResult(
    api,
    await api.validateAndHashEvidence(hidden),
    'EVIDENCE_CANONICALIZATION_INVALID',
    'hidden property',
  );

  context.__getterRead = false;
  const accessor = vm.runInNewContext(`(() => {
    const value = JSON.parse(__positiveJson);
    Object.defineProperty(value, 'authorityHash', {
      enumerable: true,
      get() { __getterRead = true; return value.authorityHash; },
    });
    return value;
  })()`, context);
  assertFailureResult(
    api,
    await api.validateAndHashEvidence(accessor),
    'EVIDENCE_CANONICALIZATION_INVALID',
    'accessor property',
  );
  assert.equal(context.__getterRead, false, 'accessor must be rejected without invocation');
});

test('evidence domain, schema, and executable-registry schema fail deterministically', async () => {
  const vectors = [
    ['domain', 'evidenceDomain', 'ImplicitEx.CoinCard.TransactionEvidence.v0', 'EVIDENCE_DOMAIN_MISMATCH'],
    ['schema', 'evidenceSchemaVersion', 'transaction-evidence.v2', 'EVIDENCE_SCHEMA_UNSUPPORTED'],
    ['registry schema', 'coinCardRegistrySchemaVersion', 'coin-card-registry-record.v1', 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED'],
  ];

  for (const [id, pathExpression, replacement, expectedOutcome] of vectors) {
    const envelope = positiveEnvelope();
    setPath(envelope.authority, pathExpression, replacement);
    const { api, result } = await resultFor(envelope);
    assertFailureResult(api, result, expectedOutcome, id);
  }
});

test('unsupported lifecycle schema wins before authority-hash comparison', async () => {
  const vector = fixture.authorityMutations.find(
    (candidate) => candidate.id === 'lifecycle-registry-schema-version',
  );
  assert.ok(vector, 'sealed lifecycle-schema mutation must exist');
  assert.equal(vector.expectedCode, 'LIFECYCLE_SCHEMA_MISMATCH');

  const freshRuntime = loadRuntime();
  const freshHashEnvelope = positiveEnvelope();
  setPath(freshHashEnvelope.authority, vector.path, vector.replacement);
  freshHashEnvelope.authorityHash = authorityHashFor(
    freshRuntime.context,
    freshHashEnvelope.authority,
  );
  assertFailureResult(
    freshRuntime.api,
    await freshRuntime.api.validateAndHashEvidence(
      realmValue(freshRuntime.context, freshHashEnvelope),
    ),
    vector.expectedCode,
    'unsupported lifecycle schema with recomputed authority hash',
  );

  const staleRuntime = loadRuntime();
  const staleHashEnvelope = positiveEnvelope();
  setPath(staleHashEnvelope.authority, vector.path, vector.replacement);
  assertFailureResult(
    staleRuntime.api,
    await staleRuntime.api.validateAndHashEvidence(
      realmValue(staleRuntime.context, staleHashEnvelope),
    ),
    vector.expectedCode,
    'unsupported lifecycle schema must precede stale authority hash',
  );
});

test('canonical identifiers, addresses, hashes, and uint256 strings are enforced', async () => {
  const vectors = [
    ['identifier whitespace', 'issuerId', ' implicitex-production', 'EVIDENCE_CANONICALIZATION_INVALID'],
    ['mixed-case address', 'recipientAddress', '0x111111111111111111111111111111111111111A', 'ADDRESS_ENCODING_INVALID'],
    ['zero address', 'tokenContractAddress', '0x0000000000000000000000000000000000000000', 'ADDRESS_ENCODING_INVALID'],
    ['short address', 'executionContractAddress', '0x3333', 'ADDRESS_ENCODING_INVALID'],
    ['leading zero revision', 'lifecycleRecordRevision', '07', 'INTEGER_ENCODING_INVALID'],
    ['negative chain', 'chainId', '-1', 'INTEGER_ENCODING_INVALID'],
    ['uint256 overflow', 'coinCardRegistryRecordRevision', (1n << 256n).toString(), 'INTEGER_ENCODING_INVALID'],
    ['uppercase hash', 'runtimeManifestId', `sha256:${'A'.repeat(64)}`, 'EVIDENCE_CANONICALIZATION_INVALID'],
  ];

  for (const [id, pathExpression, replacement, expectedOutcome] of vectors) {
    const envelope = positiveEnvelope();
    setPath(envelope.authority, pathExpression, replacement);
    const { api, result } = await resultFor(envelope);
    assertFailureResult(api, result, expectedOutcome, id);
  }
});

test('fee policy enforces canonical bounds without treating it as live reconciliation', async () => {
  const vectors = [
    ['basis points high', 'feeBasisPoints', '10001', 'FEE_POLICY_MISMATCH'],
    ['cap malformed', 'feeCapAtomic', '-1', 'INTEGER_ENCODING_INVALID'],
    ['minimum zero', 'minimumTransferAtomic', '0', 'INTEGER_ENCODING_INVALID'],
    ['maximum below minimum', 'maximumTransferAtomic', '999999', 'INTEGER_ENCODING_INVALID'],
    ['precision zero', 'transferPrecisionAtomic', '0', 'INTEGER_ENCODING_INVALID'],
    ['rounding unknown', 'roundingRule', 'ROUND_HALF_UP', 'FEE_POLICY_MISMATCH'],
    ['policy identifier', 'policyVersion', ' implicitex-fee-policy.v2', 'FEE_POLICY_MISMATCH'],
    ['fee recipient zero', 'feeRecipientAddress', '0x0000000000000000000000000000000000000000', 'ADDRESS_ENCODING_INVALID'],
  ];

  for (const [id, pathExpression, replacement, expectedOutcome] of vectors) {
    const envelope = positiveEnvelope();
    setPath(envelope.authority.feePolicy, pathExpression, replacement);
    const { api, result } = await resultFor(envelope);
    assertFailureResult(api, result, expectedOutcome, id);
  }

  const uncapped = positiveEnvelope();
  uncapped.authority.feePolicy.feeCapAtomic = null;
  const canonical = loadRuntime();
  uncapped.authorityHash = authorityHashFor(canonical.context, uncapped.authority);
  const { api, result } = await resultFor(uncapped);
  assert.equal(result.outcome, 'TRANSACTION_EVIDENCE_CONTENT_VALIDATED');
  assert.equal(api.isValidatedEvidenceContentResult(result), true);
});

test('declared authority hash must equal local recomputation before signature verification', async () => {
  const staleHash = positiveEnvelope();
  staleHash.authority.cardId = 'cc_merchant_002';
  let response = await resultFor(staleHash);
  assertFailureResult(response.api, response.result, 'EVIDENCE_HASH_MISMATCH', 'mutated authority');

  const wrongHash = positiveEnvelope();
  wrongHash.authorityHash = `sha256:${'f'.repeat(64)}`;
  response = await resultFor(wrongHash);
  assertFailureResult(response.api, response.result, 'EVIDENCE_HASH_MISMATCH', 'wrong declared hash');
});

test('signature envelope validates exact algorithm and canonical P-256 P1363 encoding only', async () => {
  const vectors = [
    ['wrong algorithm', 'signatureAlgorithm', 'ECDSA_P256_SHA256_DER', 'EVIDENCE_SCHEMA_UNSUPPORTED'],
    ['key identifier', 'keyId', ' fixture-key', 'EVIDENCE_CANONICALIZATION_INVALID'],
    ['padded signature', 'signature', `${fixture.positive.signatureVector.signature}==`, 'EVIDENCE_SIGNATURE_INVALID'],
    ['short signature', 'signature', fixture.positive.signatureVector.signature.slice(1), 'EVIDENCE_SIGNATURE_INVALID'],
    ['invalid alphabet', 'signature', `!${fixture.positive.signatureVector.signature.slice(1)}`, 'EVIDENCE_SIGNATURE_INVALID'],
    ['noncanonical trailing bits', 'signature', `${fixture.positive.signatureVector.signature.slice(0, -1)}B`, 'EVIDENCE_SIGNATURE_INVALID'],
  ];

  for (const [id, field, replacement, expectedOutcome] of vectors) {
    const envelope = positiveEnvelope();
    envelope[field] = replacement;
    const { api, result } = await resultFor(envelope);
    assertFailureResult(api, result, expectedOutcome, id);
  }
});

test('non-string canonicalizer results and exceptions cannot produce content evidence', async () => {
  const thenable = { then() { throw new Error('thenable must not be assimilated'); } };
  const vectors = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['object', { canonical: 'not text' }],
    ['Promise', Promise.resolve(fixture.positive.expectedAuthorityCanonicalJson)],
    ['thenable', thenable],
  ];

  for (const [id, canonicalizerResult] of vectors) {
    const { api, context } = loadRuntime({ canonicalizerResult });
    const result = await api.validateAndHashEvidence(positiveRealmEnvelope(context));
    assertFailureResult(api, result, 'TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE', id);
  }

  const throwing = loadRuntime({ canonicalizerThrows: true });
  assertFailureResult(
    throwing.api,
    await throwing.api.validateAndHashEvidence(positiveRealmEnvelope(throwing.context)),
    'TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE',
    'throwing canonicalizer',
  );
});

test('missing and malformed encoding or hashing dependencies fail without evidence or brand', async () => {
  const vectors = [
    ['canonicalizer unavailable', { canonicalizerUnavailable: true }, 'TRANSACTION_EVIDENCE_CANONICALIZER_UNAVAILABLE'],
    ['crypto unavailable', { cryptoUnavailable: true }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['encoder unavailable', { textEncoderUnavailable: true }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['encoder constructor throws', { textEncoderThrows: 'constructor' }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['encoder encode throws', { textEncoderThrows: 'encode' }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['encoder returns object', { textEncoderReturnsObject: true }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['digest throws', { throwDigest: true }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['digest rejects', { rejectDigest: true }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
    ['digest is short', { shortDigest: true }, 'TRANSACTION_EVIDENCE_HASH_UNAVAILABLE'],
  ];

  for (const [id, options, expectedOutcome] of vectors) {
    const { api, context } = loadRuntime(options);
    const result = await api.validateAndHashEvidence(positiveRealmEnvelope(context));
    assertFailureResult(api, result, expectedOutcome, id);
  }
});

test('validation snapshots mutable envelope and authority before asynchronous hashing', async () => {
  const { api, context } = loadRuntime();
  const envelope = positiveRealmEnvelope(context);
  const promise = api.validateAndHashEvidence(envelope);
  envelope.authority.recipientAddress = '0x9999999999999999999999999999999999999999';
  envelope.authority.feePolicy.feeBasisPoints = '9999';
  envelope.authorityHash = `sha256:${'f'.repeat(64)}`;
  const result = await promise;

  assert.equal(result.outcome, 'TRANSACTION_EVIDENCE_CONTENT_VALIDATED');
  assert.equal(result.authorityHash, fixture.positive.expectedAuthorityHash);
  assert.equal(result.authority.recipientAddress, fixture.positive.authority.recipientAddress);
  assert.equal(result.authority.feePolicy.feeBasisPoints, '100');
});

test('only genuine successful content results satisfy the private content brand', async () => {
  const { api, context } = loadRuntime();
  const success = await api.validateAndHashEvidence(positiveRealmEnvelope(context));
  const failure = await api.validateAndHashEvidence(null);
  const fabricated = Object.freeze({
    outcome: 'TRANSACTION_EVIDENCE_CONTENT_VALIDATED',
    contentValidated: true,
    authorityHashEstablished: true,
    signatureEncodingValidated: true,
    signatureVerified: false,
    authenticated: false,
    current: false,
    executionEligible: false,
    authorityHash: fixture.positive.expectedAuthorityHash,
  });

  assert.equal(api.isValidatedEvidenceContentResult(success), true);
  assert.equal(api.isValidatedEvidenceContentResult(failure), false);
  assert.equal(api.isValidatedEvidenceContentResult(fabricated), false);
  assert.equal(api.isValidatedEvidenceContentResult(null), false);
});
