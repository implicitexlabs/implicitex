/* ix-execution-authorized-path.test.js
 *
 * Unit tests for IX_EXECUTION's execute-authorized action.
 *
 * Covers:
 *   - Missing / fabricated / blocked proof → rejected
 *   - Consumed proof → rejected (one-shot doctrine)
 *   - TOCTOU account drift → failed
 *   - TOCTOU chain drift → failed
 *   - TRANSFER_ONLY plan → no approve call, pinned recipientAmountAtomic used
 *   - APPROVE_THEN_TRANSFER plan → approve uses pinned totalDebitAtomic
 *   - Transfer uses pinned recipient and recipientAmountAtomic
 *   - Confirmed result built from pinned values (correct amount/fee/total)
 *   - wallet-rejected → returned (proof already consumed)
 *   - Auth module absent → AUTH_MODULE_UNAVAILABLE
 */

'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs   = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm   = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');

/* Load all sources needed to produce a branded authorization result. */
const trustedKeyResolutionPath   = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath      = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerifPath   = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');
const lifecycleBundleVerifPath   = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-bundle-verification.js');
const lifecycleSelectionPath     = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-selection.js');
const lifecycleResolutionPath    = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-resolution.js');
const lifecyclePresentationPath  = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-presentation.js');
const executionAuthorizationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-execution-authorization.js');
const ixExecutionPath            = path.join(repoRoot, 'app-web/frontend/public/js/ix-execution.js');

const trustedKeyResolutionSource   = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource      = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerifSource   = fs.readFileSync(lifecycleRecordVerifPath, 'utf8');
const lifecycleBundleVerifSource   = fs.readFileSync(lifecycleBundleVerifPath, 'utf8');
const lifecycleSelectionSource     = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource    = fs.readFileSync(lifecycleResolutionPath, 'utf8');
const lifecyclePresentationSource  = fs.readFileSync(lifecyclePresentationPath, 'utf8');
const executionAuthorizationSource = fs.readFileSync(executionAuthorizationPath, 'utf8');
const ixExecutionSource            = fs.readFileSync(ixExecutionPath, 'utf8');

const BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
const DEFAULT_FIXED_NOW     = '2026-07-12T10:00:00.000Z';

/* ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((k) => deepFreeze(value[k]));
  return Object.freeze(value);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function nodeAtob(v)  { return Buffer.from(v, 'base64').toString('binary'); }
function nodeBtoa(v)  { return Buffer.from(v, 'binary').toString('base64'); }

function toBase64Url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  const fixedTime = RealDate.parse(isoString);
  return class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) { super(isoString); } else { super(...args); }
    }
    static now() { return fixedTime; }
    static parse(v) { return RealDate.parse(v); }
    static UTC(...a) { return RealDate.UTC(...a); }
  };
}

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
}

function trustedKeyRecord(keyId, publicKey) {
  return deepFreeze({
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey,
    issuerId: 'implicitex-registry',
    usage: ['coin-card-registry-publication'],
    status: 'ACTIVE',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    revokedAt: null,
    revocationReason: null,
    revocationPolicy: null,
    successorKeyId: null,
    environment: 'production',
  });
}

function recordDefinition(spec) {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: spec.registryVersion,
    recordId: spec.recordId,
    publishedAt: spec.publishedAt,
    cardId: spec.cardId || 'ix-exec-test-card',
    manifestId: spec.manifestId,
    revision: spec.revision,
    previousManifestId: spec.previousManifestId,
    cardStatus: spec.cardStatus || 'CARD_ACTIVE',
    manifestStatus: spec.manifestStatus || 'MANIFEST_CURRENT',
    effectiveFrom: spec.effectiveFrom,
    effectiveUntil: spec.effectiveUntil,
    supersededByManifestId: spec.supersededByManifestId,
    reasonCode: null,
    authorityId: 'implicitex-registry',
    administrationEvidenceHash: null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: 'ix-exec-test-key',
      authorityId: 'implicitex-registry',
      signedAt: spec.publishedAt,
      value: '',
    },
  };
}

function signaturePayload(record) {
  const p = clone(record);
  delete p.signature.value;
  return p;
}

async function signRecord(runtime, keyPair, record) {
  const canonical   = runtime.registry.canonicalizeJson(realmClone(runtime.context, signaturePayload(record)));
  const domainBytes = Buffer.from(runtime.recordVerifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8');
  const payloadBytes = Buffer.from(canonical, 'utf8');
  const combined    = Buffer.concat([domainBytes, Buffer.from([0]), payloadBytes]);
  const sig         = await webcrypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, keyPair.privateKey, combined);
  record.signature.value = toBase64Url(sig);
  return record;
}

/* Build a context with the full pipeline (auth module + IX_EXECUTION).
 * ethereum is optional; supply a mock to test wallet interactions. */
function makeContext(options = {}) {
  const context = {
    TextEncoder, Promise,
    window: {},
    atob: nodeAtob,
    btoa: nodeBtoa,
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = options.crypto || webcrypto;

  if (options.fixedNow) {
    const fixedDate = makeFixedDateClass(options.fixedNow);
    context.Date = fixedDate;
    context.window.Date = fixedDate;
  }

  if (options.ethereum !== undefined) {
    context.window.ethereum = options.ethereum;
  }

  if (options.trustedPublicKeys) {
    context.__trustedPublicKeysJson = JSON.stringify(options.trustedPublicKeys);
    vm.runInNewContext(`(() => {
      function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
        return Object.freeze(value);
      }
      window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = deepFreeze(JSON.parse(__trustedPublicKeysJson));
    })()`, context);
  }

  vm.runInNewContext(trustedKeyResolutionSource,   context, { filename: trustedKeyResolutionPath });
  vm.runInNewContext(lifecycleRegistrySource,      context, { filename: lifecycleRegistryPath });
  vm.runInNewContext(lifecycleRecordVerifSource,   context, { filename: lifecycleRecordVerifPath });
  vm.runInNewContext(lifecycleBundleVerifSource,   context, { filename: lifecycleBundleVerifPath });
  vm.runInNewContext(lifecycleSelectionSource,     context, { filename: lifecycleSelectionPath });
  vm.runInNewContext(lifecycleResolutionSource,    context, { filename: lifecycleResolutionPath });
  vm.runInNewContext(lifecyclePresentationSource,  context, { filename: lifecyclePresentationPath });
  vm.runInNewContext(executionAuthorizationSource, context, { filename: executionAuthorizationPath });
  vm.runInNewContext(ixExecutionSource,            context, { filename: ixExecutionPath });

  return {
    context,
    registry:      context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector:      context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution:    context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    presentation:  context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
    authorization: context.window.IX_COIN_CARD_EXECUTION_AUTHORIZATION,
    ixExecution:   context.window.IX_EXECUTION,
  };
}

/* Build a runtime with a valid signed bundle and return the promoted result. */
async function makeAuthorizedRuntime(options = {}) {
  const keyPair   = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const fixedNow  = options.fixedNow || DEFAULT_FIXED_NOW;

  const trustedPublicKeys = { 'ix-exec-test-key': trustedKeyRecord('ix-exec-test-key', publicKey) };
  const runtime = makeContext({ trustedPublicKeys, fixedNow, ...options });

  const spec = {
    registryVersion: 1,
    recordId: 'rec-ix-exec-active-001',
    publishedAt: '2026-01-01T00:00:00.000Z',
    cardId: 'ix-exec-test-card',
    manifestId: 'manifest-ix-exec-001',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
  };

  const record = recordDefinition(spec);
  await signRecord(runtime, keyPair, record);

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 1,
    generatedAt: fixedNow,
    entries: [record],
  });

  const bundleInput = realmClone(runtime.context, bundle);
  const proof       = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  const selected    = runtime.selector.selectLifecycleEvidence(
    proof, { cardId: 'ix-exec-test-card', manifestId: 'manifest-ix-exec-001' },
  );
  const resolved  = runtime.resolution.resolveLifecycle(selected);
  const promoted  = runtime.presentation.promotePresentation(resolved);

  return { ...runtime, keyPair, promoted };
}

/* Standard transfer intent for tests. */
function makeTransferIntent(overrides) {
  return deepFreeze(Object.assign({
    cardId:                   'ix-exec-test-card',
    manifestId:               'manifest-ix-exec-001',
    tokenAddress:             '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',  /* Polygon USDC */
    executionContractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
    chainId:                  137,
    recipient:                '0x1111111111111111111111111111111111111111',
    recipientAmountAtomic:    '10000000',  /* 10 USDC */
    platformFeeAtomic:        '100000',   /* 0.10 USDC */
    totalDebitAtomic:         '10100000', /* 10.10 USDC */
  }, overrides || {}));
}

/* Standard wallet snapshot matching Polygon (137). */
function makeWalletSnapshot(overrides) {
  return deepFreeze(Object.assign({
    account:         '0x2222222222222222222222222222222222222222',
    chainId:         137,
    balanceAtomic:   '100000000',
    allowanceAtomic: '10100000',
    providerReady:   true,
  }, overrides || {}));
}

/* Build a mock ethereum that records calls and returns scripted responses. */
function makeMockEthereum(options = {}) {
  const calls = [];
  const {
    accounts        = ['0x2222222222222222222222222222222222222222'],
    chainIdHex      = '0x89',       /* 137 = Polygon */
    receiptStatus   = '0x1',
    approvalHash    = '0xAAA',
    transferHash    = '0xBBB',
    rejectApproval  = false,
    rejectTransfer  = false,
  } = options;

  const ethereum = {
    calls,
    request: function (args) {
      calls.push({ method: args.method, params: args.params });
      switch (args.method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return Promise.resolve(accounts);
        case 'eth_chainId':
          return Promise.resolve(chainIdHex);
        case 'eth_call':
          /* balance/allowance — return 100 USDC (or customizable) */
          return Promise.resolve(
            '0x' + (options.ethCallResult || '0000000000000000000000000000000000000000000000000000000005F5E100')
          );
        case 'eth_sendTransaction': {
          /* First send = approval tx, second = transfer tx */
          const sendCount = calls.filter((c) => c.method === 'eth_sendTransaction').length;
          if (sendCount === 1 && rejectApproval) {
            const err = new Error('MetaMask Tx Signature: User denied.');
            err.code = 4001;
            return Promise.reject(err);
          }
          if (sendCount >= 2 && rejectTransfer) {
            const err = new Error('MetaMask Tx Signature: User denied.');
            err.code = 4001;
            return Promise.reject(err);
          }
          return Promise.resolve(sendCount === 1 ? approvalHash : transferHash);
        }
        case 'eth_getTransactionReceipt':
          return Promise.resolve({
            status: receiptStatus,
            blockNumber: '0x1',
            transactionHash: args.params[0],
          });
        default:
          return Promise.reject(new Error('Unhandled method: ' + args.method));
      }
    },
  };
  return ethereum;
}

/* ================================================================
 * Tests
 * ================================================================ */

/* ----------------------------------------------------------------
 * Proof validation gate
 * ---------------------------------------------------------------- */
test('execute-authorized: auth module absent → AUTH_MODULE_UNAVAILABLE', async () => {
  /* Build a runtime without IX_COIN_CARD_EXECUTION_AUTHORIZATION on window. */
  const context = {
    TextEncoder, Promise,
    window: {},
    atob: nodeAtob, btoa: nodeBtoa,
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = webcrypto;
  /* Do NOT load execution-authorization module — IX_COIN_CARD_EXECUTION_AUTHORIZATION absent. */
  vm.runInNewContext(ixExecutionSource, context, { filename: ixExecutionPath });
  const ix = context.window.IX_EXECUTION;

  const result = await ix.executeTransfer({ action: 'execute-authorized', authorizationProof: null, chainId: 137 });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AUTH_MODULE_UNAVAILABLE');
});

test('execute-authorized: null proof → AUTHORIZATION_PROOF_INVALID', async () => {
  const runtime = makeContext({ ethereum: makeMockEthereum() });
  const result  = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: null,
    chainId: 137,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AUTHORIZATION_PROOF_INVALID');
});

test('execute-authorized: fabricated plain object proof → AUTHORIZATION_PROOF_INVALID', async () => {
  const runtime = makeContext({ ethereum: makeMockEthereum() });
  const fakeProof = {
    fact: 'EXECUTION_AUTHORIZED',
    outcome: 'EXECUTION_AUTHORIZED',
    executionEligible: true,
    presentationEligible: true,
    sender: '0x2222222222222222222222222222222222222222',
    recipient: '0x1111111111111111111111111111111111111111',
    chainId: 137,
    tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    executionContractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
    executionPlan: 'APPROVE_THEN_TRANSFER',
  };
  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: fakeProof,
    chainId: 137,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AUTHORIZATION_PROOF_INVALID');
});

test('execute-authorized: blocked (non-authorized) proof → AUTHORIZATION_PROOF_INVALID', async () => {
  const runtime     = await makeAuthorizedRuntime({ ethereum: makeMockEthereum() });
  const intent      = makeTransferIntent();
  const snapshot    = makeWalletSnapshot();
  /* Omit the promoted presentation (null) → authorization returns a blocked result. */
  const blockedResult = runtime.authorization.authorizeExecution(null, intent, snapshot);
  assert.ok(!runtime.authorization.isExecutionAuthorizedResult(blockedResult), 'should be blocked');

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: blockedResult,
    chainId: 137,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AUTHORIZATION_PROOF_INVALID');
});

test('execute-authorized: consumed proof → AUTHORIZATION_PROOF_CONSUMED on second use', async () => {
  const ethereum = makeMockEthereum();
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot();
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  /* First call — consumes the proof (may succeed or fail, but consumes). */
  await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    chainId: 137,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-1',
  });

  /* Second call with the same proof object → must be rejected as consumed. */
  const result2 = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    chainId: 137,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-2',
  });
  assert.equal(result2.status, 'failed');
  assert.equal(result2.error.code, 'AUTHORIZATION_PROOF_CONSUMED');
});

/* ----------------------------------------------------------------
 * TOCTOU guard
 * ---------------------------------------------------------------- */
test('execute-authorized: account drift → TOCTOU_ACCOUNT_DRIFT', async () => {
  /* Proof sender = 0x2222..., but ethereum returns 0x9999... */
  const driftedEthereum = makeMockEthereum({
    accounts: ['0x9999999999999999999999999999999999999999'],
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: driftedEthereum });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot(); /* snapshot.account = 0x2222... (matches proof) */
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    chainId: 137,
    source: 'test',
    traceId: 'trace-toctou-acct',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'TOCTOU_ACCOUNT_DRIFT');
});

test('execute-authorized: chain drift → TOCTOU_CHAIN_DRIFT', async () => {
  /* Proof chainId = 137, but ethereum returns 0x1 (Ethereum mainnet). */
  const driftedEthereum = makeMockEthereum({ chainIdHex: '0x1' });
  const runtime  = await makeAuthorizedRuntime({ ethereum: driftedEthereum });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot();
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    chainId: 137,
    source: 'test',
    traceId: 'trace-toctou-chain',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'TOCTOU_CHAIN_DRIFT');
});

/* ----------------------------------------------------------------
 * Execution plans — pinned values
 * ---------------------------------------------------------------- */
test('execute-authorized: TRANSFER_ONLY plan → no eth_sendTransaction for approval', async () => {
  const ethereum = makeMockEthereum({
    /* Zero allowance in eth_call so authResult uses TRANSFER_ONLY... but wait:
     * snapshot.allowanceAtomic must >= totalDebitAtomic for TRANSFER_ONLY.
     * authorizeExecution sets plan based on snapshot, not live calls.
     * snapshot.allowanceAtomic = '10100000' (>= totalDebit '10100000') → TRANSFER_ONLY. */
    approvalHash: '0xNEVER',
    transferHash: '0xTRANSFER-ONLY',
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '10100000' }); /* exactly = total */
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));
  assert.equal(proof.executionPlan, 'TRANSFER_ONLY');

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-transfer-only',
  });

  /* Only one eth_sendTransaction (transfer), not two (approval + transfer). */
  const sendTxCalls = ethereum.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sendTxCalls.length, 1, 'TRANSFER_ONLY must not call approve');
  assert.equal(result.status, 'confirmed');
});

test('execute-authorized: APPROVE_THEN_TRANSFER plan → two eth_sendTransaction calls', async () => {
  const ethereum = makeMockEthereum({
    approvalHash:  '0xAPPROVAL',
    transferHash:  '0xTRANSFER',
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent();
  /* allowanceAtomic < totalDebitAtomic → APPROVE_THEN_TRANSFER */
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));
  assert.equal(proof.executionPlan, 'APPROVE_THEN_TRANSFER');

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-approve-then-transfer',
  });

  const sendTxCalls = ethereum.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sendTxCalls.length, 2, 'APPROVE_THEN_TRANSFER must call approve then transfer');
  assert.equal(result.status, 'confirmed');
});

test('execute-authorized: approval tx uses pinned totalDebitAtomic', async () => {
  const ethereum = makeMockEthereum({ approvalHash: '0xAPPROVAL2', transferHash: '0xTRANSFER2' });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent({ totalDebitAtomic: '10100000' });
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-pinned-approval',
  });

  const approvalCall = ethereum.calls.find((c) => c.method === 'eth_sendTransaction');
  assert.ok(approvalCall, 'approval eth_sendTransaction must be present');
  const data = approvalCall.params[0].data;
  /* encodeApprove encodes the amount at bytes 32–64 of the calldata.
   * totalDebitAtomic = 10100000 = 0x9A1200 */
  const expectedAmountHex = BigInt('10100000').toString(16).padStart(64, '0');
  assert.ok(
    data.toLowerCase().endsWith(expectedAmountHex),
    `approval calldata must end with totalDebitAtomic hex (${expectedAmountHex}), got: ${data}`,
  );
});

test('execute-authorized: transfer tx uses pinned recipientAmountAtomic and recipient', async () => {
  const ethereum = makeMockEthereum({ approvalHash: '0xAPPROVAL3', transferHash: '0xTRANSFER3' });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent({
    recipient:             '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF',
    recipientAmountAtomic: '10000000',
  });
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-pinned-transfer',
  });

  const transferCall = ethereum.calls.filter((c) => c.method === 'eth_sendTransaction')[1];
  assert.ok(transferCall, 'transfer eth_sendTransaction must be present');
  const data = transferCall.params[0].data;
  /* encodeTransferWithFee encodes recipient at bytes 0–31 and amount at 32–63.
   * recipient lower = deadbeefdeadbeefdeadbeefdeadbeefdeadbeef */
  const expectedRecipientHex = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'.padStart(64, '0');
  assert.ok(
    data.toLowerCase().includes(expectedRecipientHex),
    `transfer calldata must include recipient hex (${expectedRecipientHex})`,
  );
  const expectedAmountHex = BigInt('10000000').toString(16).padStart(64, '0');
  assert.ok(
    data.toLowerCase().endsWith(expectedAmountHex),
    `transfer calldata must end with recipientAmountAtomic hex (${expectedAmountHex})`,
  );
});

test('execute-authorized: confirmed result has correct amount/fee/total from pinned values', async () => {
  const ethereum = makeMockEthereum({ approvalHash: '0xAPP', transferHash: '0xTX' });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent({
    recipientAmountAtomic: '10000000',  /* 10.00 USDC */
    platformFeeAtomic:     '100000',   /* 0.10 USDC */
    totalDebitAtomic:      '10100000', /* 10.10 USDC */
  });
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-confirmed-amounts',
  });
  assert.equal(result.status, 'confirmed');
  const receipt = result.receipt;
  assert.ok(receipt, 'confirmed result must have a receipt');
  /* amount, fee, total are derived from atomic values: /1e6 */
  assert.ok(Math.abs(receipt.amount - 10.0)  < 1e-9, `amount must be 10.0, got ${receipt.amount}`);
  assert.ok(Math.abs(receipt.fee   - 0.1)   < 1e-9, `fee must be 0.10, got ${receipt.fee}`);
  assert.ok(Math.abs(receipt.total - 10.1)  < 1e-9, `total must be 10.10, got ${receipt.total}`);
  assert.equal(receipt.recipient, proof.recipient);
  assert.equal(receipt.sender, proof.sender);
  assert.equal(receipt.txHash, '0xTX');
});

test('execute-authorized: wallet-rejected returns wallet-rejected status (proof consumed)', async () => {
  const ethereum = makeMockEthereum({ rejectApproval: true });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    source: 'test',
    traceId: 'trace-rejected',
  });
  assert.equal(result.status, 'wallet-rejected');

  /* Proof is consumed — second call must fail as consumed. */
  const result2 = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    source: 'test',
    traceId: 'trace-rejected-replay',
  });
  assert.equal(result2.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof must remain consumed even after wallet-rejected');
});

test('user rejects transfer: proof consumed, no retry, explicit wallet-rejected result', async () => {
  /* APPROVE_THEN_TRANSFER: approval succeeds, transfer is rejected by the user.
   * Verifies:
   *   1. result.status === 'wallet-rejected' (not a generic failure)
   *   2. No automatic retry
   *   3. Proof permanently consumed — second call returns AUTHORIZATION_PROOF_CONSUMED
   *   4. eth_sendTransaction called twice (approval + transfer attempt)
   *   5. No substitute or incorrect status returned */
  const ethereum = makeMockEthereum({ rejectTransfer: true });
  const runtime  = await makeAuthorizedRuntime({ ethereum });
  const intent   = makeTransferIntent();
  /* allowanceAtomic < totalDebitAtomic → APPROVE_THEN_TRANSFER */
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));
  assert.equal(proof.executionPlan, 'APPROVE_THEN_TRANSFER');

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-transfer-rejected',
  });

  /* 1. Result must be wallet-rejected (user explicitly denied the transfer tx). */
  assert.equal(result.status, 'wallet-rejected',
    `expected wallet-rejected, got ${result.status}`);

  /* 4. Approval was sent (sendCount 1) and transfer was attempted (sendCount 2) then rejected. */
  const sendTxCalls = ethereum.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sendTxCalls.length, 2,
    'must have exactly 2 eth_sendTransaction calls: approval + transfer attempt');

  /* 5. No substitute status — must not be 'failed', 'confirmed', or 'outcome-unknown'. */
  assert.notEqual(result.status, 'failed');
  assert.notEqual(result.status, 'confirmed');
  assert.notEqual(result.status, 'outcome-unknown');

  /* 3. Proof is permanently consumed — replay returns AUTHORIZATION_PROOF_CONSUMED. */
  const result2 = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    token: 'USDC',
    source: 'test',
    traceId: 'trace-transfer-rejected-replay',
  });
  assert.equal(result2.status, 'failed');
  assert.equal(result2.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof must remain consumed even after transfer-rejected');

  /* 2. No automatic retry — ethereum received no additional calls after the rejection. */
  const sendTxCallsAfterReplay = ethereum.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sendTxCallsAfterReplay.length, 2,
    'no additional eth_sendTransaction calls must occur after rejection or replay');
});

test('execute-authorized: no DOM value reread — no eth_sendTransaction before authorization', async () => {
  /* This test verifies the gate order: authorization must resolve before
   * any wallet interaction is attempted. With a fabricated proof (which
   * IX_EXECUTION rejects), eth_sendTransaction is never called. */
  const ethereum = makeMockEthereum();
  const runtime  = makeContext({ ethereum });  /* no valid lifecycle data */
  /* No authorized proof available — just use a plain object. */
  const fakeProof = { fact: 'EXECUTION_AUTHORIZED', executionPlan: 'TRANSFER_ONLY' };

  await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: fakeProof,
    chainId: 137,
  });

  const sendTxCalls = ethereum.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sendTxCalls.length, 0, 'eth_sendTransaction must not be called with fabricated proof');
});
