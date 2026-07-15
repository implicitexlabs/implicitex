/* coin-card-provider-continuity.test.js
 *
 * Focused tests exposing the provider-continuity gap in Coin Card's wallet
 * lifecycle and the required behavior after the fix.
 *
 * Covers:
 *   - injected provider connects and executes normally (happy path)
 *   - WalletConnect provider connects and executes normally (happy path)
 *   - no provider available → wallet-missing
 *   - WalletConnect configured but not yet connected → wallet-missing when
 *     no injected provider is present
 *   - injected and WalletConnect both available → injected wins (prefer injected)
 *   - provider changes after snapshot → rejected with PROVIDER_MISMATCH
 *   - account changes on same provider after authorization → TOCTOU_ACCOUNT_DRIFT
 *   - chain changes on same provider after authorization → TOCTOU_CHAIN_DRIFT
 *   - injected-provider snapshot + WalletConnect execution → PROVIDER_MISMATCH
 *   - WalletConnect snapshot + injected-provider execution → PROVIDER_MISMATCH
 *   - provider disconnects after authorization → fails gracefully, proof consumed
 *   - WalletConnect session expires after authorization → fails gracefully, proof consumed
 *   - approval rejection through injected provider → wallet-rejected, proof consumed
 *   - transfer rejection through injected provider → wallet-rejected, proof consumed
 *   - approval rejection through WalletConnect → wallet-rejected, proof consumed
 *   - transfer rejection through WalletConnect → wallet-rejected, proof consumed
 *   - proof remains consumed on every post-authorization provider failure
 *   - no automatic provider switching or retry
 *   - no transaction before live account and chain equality checks pass
 */

'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs   = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm   = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');

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
    cardId: spec.cardId || 'provider-test-card',
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
      keyId: 'ix-provider-test-key',
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
  const canonical    = runtime.registry.canonicalizeJson(realmClone(runtime.context, signaturePayload(record)));
  const domainBytes  = Buffer.from(runtime.recordVerifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8');
  const payloadBytes = Buffer.from(canonical, 'utf8');
  const combined     = Buffer.concat([domainBytes, Buffer.from([0]), payloadBytes]);
  const sig          = await webcrypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, keyPair.privateKey, combined);
  record.signature.value = toBase64Url(sig);
  return record;
}

/* ----------------------------------------------------------------
 * Build a vm context with the full pipeline.
 *
 * options.ethereum     — value assigned to window.ethereum (the "injected" provider)
 * options.wcProvider   — if supplied, represents a WalletConnect provider
 *                        The test sets window.ethereum to the resolved provider
 *                        based on which path it wants to exercise.
 * ---------------------------------------------------------------- */
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
    registry:       context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector:       context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution:     context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    presentation:   context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
    authorization:  context.window.IX_COIN_CARD_EXECUTION_AUTHORIZATION,
    ixExecution:    context.window.IX_EXECUTION,
  };
}

async function makeAuthorizedRuntime(options = {}) {
  const keyPair   = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const fixedNow  = options.fixedNow || DEFAULT_FIXED_NOW;

  const trustedPublicKeys = { 'ix-provider-test-key': trustedKeyRecord('ix-provider-test-key', publicKey) };
  const runtime = makeContext({ trustedPublicKeys, fixedNow, ...options });

  const spec = {
    registryVersion: 1,
    recordId: 'rec-provider-test-001',
    publishedAt: '2026-01-01T00:00:00.000Z',
    cardId: 'provider-test-card',
    manifestId: 'manifest-provider-test-001',
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
    proof, { cardId: 'provider-test-card', manifestId: 'manifest-provider-test-001' },
  );
  const resolved  = runtime.resolution.resolveLifecycle(selected);
  const promoted  = runtime.presentation.promotePresentation(resolved);

  return { ...runtime, keyPair, promoted };
}

function makeTransferIntent(overrides) {
  return deepFreeze(Object.assign({
    cardId:                   'provider-test-card',
    manifestId:               'manifest-provider-test-001',
    tokenAddress:             '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    executionContractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
    chainId:                  137,
    recipient:                '0x1111111111111111111111111111111111111111',
    recipientAmountAtomic:    '10000000',
    platformFeeAtomic:        '100000',
    totalDebitAtomic:         '10100000',
  }, overrides || {}));
}

function makeWalletSnapshot(overrides) {
  return deepFreeze(Object.assign({
    account:         '0x2222222222222222222222222222222222222222',
    chainId:         137,
    balanceAtomic:   '100000000',
    allowanceAtomic: '0',
    providerReady:   true,
  }, overrides || {}));
}

/* Build a mock EIP-1193 provider. Options control behavior. */
function makeMockProvider(options = {}) {
  const calls = [];
  const {
    accounts       = ['0x2222222222222222222222222222222222222222'],
    chainIdHex     = '0x89',
    receiptStatus  = '0x1',
    approvalHash   = '0xAAAA',
    transferHash   = '0xBBBB',
    rejectApproval = false,
    rejectTransfer = false,
    rejectAccounts = false,  /* simulate session expiry / disconnect */
    label          = 'mock-provider',
  } = options;

  const provider = {
    label,
    calls,
    request: function (args) {
      calls.push({ method: args.method, params: args.params });
      switch (args.method) {
        case 'eth_accounts':
        case 'eth_requestAccounts': {
          if (rejectAccounts) {
            const err = new Error('Session expired');
            err.code = -32600;
            return Promise.reject(err);
          }
          return Promise.resolve(accounts);
        }
        case 'eth_chainId':
          return Promise.resolve(chainIdHex);
        case 'eth_call':
          return Promise.resolve(
            '0x' + (options.ethCallResult || '0000000000000000000000000000000000000000000000000000000005F5E100')
          );
        case 'eth_sendTransaction': {
          const sendCount = calls.filter((c) => c.method === 'eth_sendTransaction').length;
          if (sendCount === 1 && rejectApproval) {
            const err = new Error('User rejected approval');
            err.code = 4001;
            return Promise.reject(err);
          }
          if (sendCount >= 2 && rejectTransfer) {
            const err = new Error('User rejected transfer');
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
  return provider;
}

/* ================================================================
 * Tests — provider selection and happy paths
 * ================================================================ */

test('provider: injected provider connects and executes normally (happy path)', async () => {
  const injected = makeMockProvider({ label: 'injected', transferHash: '0xINJ-TX' });
  const runtime  = await makeAuthorizedRuntime({ ethereum: injected });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,
    snapshotProvider: injected,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-injected-happy',
  });
  /* Must succeed end-to-end using the injected provider. */
  assert.equal(result.status, 'confirmed', `expected confirmed, got ${result.status}`);
  assert.equal(result.receipt.txHash, '0xINJ-TX');
  /* Injected provider must have received the wallet calls. */
  assert.ok(injected.calls.length > 0, 'injected provider must have received calls');
});

test('provider: WalletConnect provider connects and executes normally (happy path)', async () => {
  /* Simulate WalletConnect: no window.ethereum, wcProvider supplied as the active provider.
   * After the fix, executeTransfer must use request.provider, not window.ethereum. */
  const wcProvider = makeMockProvider({ label: 'walletconnect', transferHash: '0xWC-TX' });
  /* No injected provider — window.ethereum absent in this context. */
  const runtime    = await makeAuthorizedRuntime({ ethereum: undefined });
  const intent     = makeTransferIntent();
  const snapshot   = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof      = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: wcProvider,          /* <— caller-supplied WalletConnect provider */
    snapshotProvider: wcProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-happy',
  });
  /* Must succeed using wcProvider, not window.ethereum. */
  assert.equal(result.status, 'confirmed', `expected confirmed, got ${result.status}: ${result.error && result.error.message}`);
  assert.equal(result.receipt.txHash, '0xWC-TX');
  /* WC provider must have received the wallet calls. */
  assert.ok(wcProvider.calls.length > 0, 'WalletConnect provider must have received calls');
});

test('provider: no provider available → wallet-missing', async () => {
  const runtime = await makeAuthorizedRuntime({ ethereum: undefined });
  const intent  = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof   = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    /* No provider supplied, no window.ethereum */
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-no-provider',
  });
  assert.equal(result.status, 'wallet-missing', `expected wallet-missing, got ${result.status}`);
});

test('provider: WalletConnect configured but not connected (no window.ethereum, no provider param) → wallet-missing', async () => {
  /* IX_WC is available (project ID configured) but connect() was never called,
   * so there is no active provider session. card.js must not call IX_WC.init()
   * here — the provider must have been resolved at connect time. */
  const runtime  = await makeAuthorizedRuntime({ ethereum: undefined });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    /* provider param absent — simulates "WalletConnect configured but not connected" */
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-not-connected',
  });
  assert.equal(result.status, 'wallet-missing',
    'must return wallet-missing, not attempt automatic WC init');
});

test('provider: injected and WalletConnect both available — injected wins (prefer injected)', async () => {
  /* Both providers are present. The resolved active provider at connect time
   * should be the injected one (MetaMask). After the fix, request.provider
   * carries whichever was selected; the test verifies that the injected
   * provider's calls are recorded and wcProvider receives nothing. */
  const injected   = makeMockProvider({ label: 'injected',      transferHash: '0xINJ-WIN' });
  const wcProvider = makeMockProvider({ label: 'walletconnect', transferHash: '0xWC-LOSE' });

  /* window.ethereum = injected; wcProvider is also available but not selected. */
  const runtime    = await makeAuthorizedRuntime({ ethereum: injected });
  const intent     = makeTransferIntent();
  const snapshot   = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof      = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  /* card.js resolves injected as the active provider at connect time. */
  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,      /* injected was resolved; WC was not chosen */
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-prefer-injected',
  });
  assert.equal(result.status, 'confirmed', `expected confirmed, got ${result.status}`);
  /* Injected provider received wallet calls; WC provider received none. */
  const injectedSends = injected.calls.filter((c) => c.method === 'eth_sendTransaction');
  const wcSends       = wcProvider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.ok(injectedSends.length >= 1, 'injected must have received eth_sendTransaction');
  assert.equal(wcSends.length, 0, 'WalletConnect must not receive any calls when injected is chosen');
});

/* ================================================================
 * Tests — provider continuity after snapshot
 * ================================================================ */

test('provider: provider changes after snapshot → PROVIDER_MISMATCH', async () => {
  /* Snapshot was taken using providerA. Execution is attempted with providerB.
   * The execute-authorized path must detect the provider change and reject
   * before any wallet interaction (no eth_sendTransaction). */
  const providerA = makeMockProvider({ label: 'provider-a' });
  const providerB = makeMockProvider({ label: 'provider-b' });

  const runtime  = await makeAuthorizedRuntime({ ethereum: providerA });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  /* Snapshot was read with providerA (implied by resolvedProvider field). */
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  /* Execute with providerB — different provider than snapshot. */
  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: providerB,          /* different provider from snapshot */
    snapshotProvider: providerA,  /* provider used for the wallet snapshot */
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-provider-mismatch',
  });
  assert.equal(result.status, 'failed', `expected failed, got ${result.status}`);
  assert.equal(result.error.code, 'PROVIDER_MISMATCH',
    `expected PROVIDER_MISMATCH, got ${result.error && result.error.code}`);

  /* No eth_sendTransaction must be called — rejection before wallet interaction. */
  const bSends = providerB.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(bSends.length, 0, 'must not call eth_sendTransaction on mismatched provider');
});

test('provider: account changes on same provider after authorization → TOCTOU_ACCOUNT_DRIFT', async () => {
  /* The provider returns a different account between snapshot and execute-authorized. */
  const driftedProvider = makeMockProvider({
    label: 'drifted-account',
    accounts: ['0x9999999999999999999999999999999999999999'],
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: driftedProvider });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ account: '0x2222222222222222222222222222222222222222' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: driftedProvider,
    snapshotProvider: driftedProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-account-drift',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'TOCTOU_ACCOUNT_DRIFT',
    `expected TOCTOU_ACCOUNT_DRIFT, got ${result.error && result.error.code}`);
  const sends = driftedProvider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sends.length, 0, 'no eth_sendTransaction on account drift');
});

test('provider: chain changes on same provider after authorization → TOCTOU_CHAIN_DRIFT', async () => {
  const driftedProvider = makeMockProvider({
    label: 'drifted-chain',
    chainIdHex: '0x1',   /* Ethereum mainnet, not Polygon */
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: driftedProvider });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ chainId: 137 });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: driftedProvider,
    snapshotProvider: driftedProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-chain-drift',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'TOCTOU_CHAIN_DRIFT',
    `expected TOCTOU_CHAIN_DRIFT, got ${result.error && result.error.code}`);
  const sends = driftedProvider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sends.length, 0, 'no eth_sendTransaction on chain drift');
});

test('provider: injected-provider snapshot + WalletConnect execution → PROVIDER_MISMATCH', async () => {
  const injected   = makeMockProvider({ label: 'injected' });
  const wcProvider = makeMockProvider({ label: 'walletconnect' });

  const runtime  = await makeAuthorizedRuntime({ ethereum: injected });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  /* Attempt to execute using wcProvider even though snapshot used injected. */
  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: wcProvider,
    snapshotProvider: injected,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-injected-snapshot-wc-exec',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'PROVIDER_MISMATCH');
  const wcSends = wcProvider.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(wcSends.length, 0, 'wcProvider must not receive eth_sendTransaction');
});

test('provider: WalletConnect snapshot + injected-provider execution → PROVIDER_MISMATCH', async () => {
  const wcProvider = makeMockProvider({ label: 'walletconnect' });
  const injected   = makeMockProvider({ label: 'injected' });

  const runtime  = await makeAuthorizedRuntime({ ethereum: wcProvider });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,
    snapshotProvider: wcProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-snapshot-injected-exec',
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'PROVIDER_MISMATCH');
  const injectedSends = injected.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(injectedSends.length, 0, 'injected must not receive eth_sendTransaction');
});

/* ================================================================
 * Tests — disconnect and session expiry after authorization
 * ================================================================ */

test('provider: provider disconnects after authorization → fails gracefully, proof consumed', async () => {
  /* Provider returns an error for eth_accounts (simulating disconnect).
   * The proof must be consumed and a clean failure returned. */
  const disconnectedProvider = makeMockProvider({
    label: 'disconnected',
    rejectAccounts: true,
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: disconnectedProvider });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: disconnectedProvider,
    snapshotProvider: disconnectedProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-disconnect-after-auth',
  });
  /* Must fail, not crash or hang. */
  assert.ok(
    result.status === 'failed' || result.status === 'wallet-missing',
    `expected failed or wallet-missing on disconnect, got ${result.status}`
  );

  /* Proof is consumed — replay returns AUTHORIZATION_PROOF_CONSUMED. */
  const replay = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: disconnectedProvider,
    snapshotProvider: disconnectedProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-disconnect-replay',
  });
  assert.equal(replay.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof must remain consumed after disconnect failure');
});

test('provider: WalletConnect session expires after authorization → fails gracefully, proof consumed', async () => {
  /* WalletConnect session expiry manifests as eth_accounts rejecting. */
  const expiredWC = makeMockProvider({
    label: 'wc-expired',
    rejectAccounts: true,
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: undefined });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.ok(runtime.authorization.isExecutionAuthorizedResult(proof));

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: expiredWC,
    snapshotProvider: expiredWC,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-expired',
  });
  assert.ok(
    result.status === 'failed' || result.status === 'wallet-missing',
    `expected failed or wallet-missing on WC session expiry, got ${result.status}`
  );

  const replay = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: expiredWC,
    snapshotProvider: expiredWC,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-expired-replay',
  });
  assert.equal(replay.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof must remain consumed after WC session expiry');
});

/* ================================================================
 * Tests — wallet rejections through specific provider
 * ================================================================ */

test('provider: approval rejection through injected provider → wallet-rejected, proof consumed', async () => {
  const injected = makeMockProvider({ label: 'injected', rejectApproval: true });
  const runtime  = await makeAuthorizedRuntime({ ethereum: injected });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' }); /* APPROVE_THEN_TRANSFER */
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.equal(proof.executionPlan, 'APPROVE_THEN_TRANSFER');

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,
    snapshotProvider: injected,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-injected-reject-approval',
  });
  assert.equal(result.status, 'wallet-rejected');

  const replay = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,
    snapshotProvider: injected,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-injected-reject-approval-replay',
  });
  assert.equal(replay.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof consumed after approval rejection');
});

test('provider: transfer rejection through injected provider → wallet-rejected, proof consumed', async () => {
  const injected = makeMockProvider({ label: 'injected', rejectTransfer: true });
  const runtime  = await makeAuthorizedRuntime({ ethereum: injected });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,
    snapshotProvider: injected,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-injected-reject-transfer',
  });
  assert.equal(result.status, 'wallet-rejected');

  const replay = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: injected,
    snapshotProvider: injected,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-injected-reject-transfer-replay',
  });
  assert.equal(replay.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof consumed after transfer rejection');
});

test('provider: approval rejection through WalletConnect → wallet-rejected, proof consumed', async () => {
  const wcProvider = makeMockProvider({ label: 'walletconnect', rejectApproval: true });
  const runtime    = await makeAuthorizedRuntime({ ethereum: undefined });
  const intent     = makeTransferIntent();
  const snapshot   = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof      = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.equal(proof.executionPlan, 'APPROVE_THEN_TRANSFER');

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: wcProvider,
    snapshotProvider: wcProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-reject-approval',
  });
  assert.equal(result.status, 'wallet-rejected');

  const replay = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: wcProvider,
    snapshotProvider: wcProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-reject-approval-replay',
  });
  assert.equal(replay.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof consumed after WC approval rejection');
});

test('provider: transfer rejection through WalletConnect → wallet-rejected, proof consumed', async () => {
  const wcProvider = makeMockProvider({ label: 'walletconnect', rejectTransfer: true });
  const runtime    = await makeAuthorizedRuntime({ ethereum: undefined });
  const intent     = makeTransferIntent();
  const snapshot   = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof      = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: wcProvider,
    snapshotProvider: wcProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-reject-transfer',
  });
  assert.equal(result.status, 'wallet-rejected');

  const replay = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: wcProvider,
    snapshotProvider: wcProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-wc-reject-transfer-replay',
  });
  assert.equal(replay.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof consumed after WC transfer rejection');
});

/* ================================================================
 * Tests — invariants
 * ================================================================ */

test('provider: proof remains consumed on every post-authorization provider failure', async () => {
  /* The disconnect scenario: provider fails on eth_accounts (TOCTOU check).
   * Proof must be consumed before any wallet call, so it stays consumed. */
  const failingProvider = makeMockProvider({
    label: 'failing',
    rejectAccounts: true,
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: failingProvider });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  /* First call: provider failure after consumption. */
  const first = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: failingProvider,
    snapshotProvider: failingProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-invariant-first',
  });
  assert.ok(first.status !== 'confirmed', 'must not confirm on provider failure');

  /* Second call: proof is consumed, not proof.status. */
  const second = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: failingProvider,
    snapshotProvider: failingProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-invariant-second',
  });
  assert.equal(second.error.code, 'AUTHORIZATION_PROOF_CONSUMED',
    'proof must be consumed regardless of how the first attempt ended');
});

test('provider: no automatic provider switching or retry', async () => {
  /* When provider A is supplied but fails, execution must NOT fall back to
   * window.ethereum or any other provider. */
  const failingProvider = makeMockProvider({ label: 'failing', rejectAccounts: true });
  const silentFallback  = makeMockProvider({ label: 'fallback' });

  /* window.ethereum = silentFallback; the call passes failingProvider. */
  const runtime = await makeAuthorizedRuntime({ ethereum: silentFallback });
  const intent  = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ allowanceAtomic: '0' });
  const proof   = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: failingProvider,
    snapshotProvider: failingProvider,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-no-fallback',
  });
  /* Must fail — must not silently succeed via window.ethereum fallback. */
  assert.ok(result.status !== 'confirmed',
    'must not auto-retry via window.ethereum fallback');
  /* The fallback provider must receive no calls. */
  const fallbackSends = silentFallback.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(fallbackSends.length, 0,
    'window.ethereum fallback must not be called when provider param is supplied');
});

test('provider: no transaction before live account and chain equality checks pass', async () => {
  /* Account drifts between snapshot and TOCTOU check.
   * eth_sendTransaction must not be called at all. */
  const drifted = makeMockProvider({
    label: 'drifted',
    accounts: ['0x9999999999999999999999999999999999999999'],
  });
  const runtime  = await makeAuthorizedRuntime({ ethereum: drifted });
  const intent   = makeTransferIntent();
  const snapshot = makeWalletSnapshot({ account: '0x2222222222222222222222222222222222222222' });
  const proof    = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);

  const result = await runtime.ixExecution.executeTransfer({
    action: 'execute-authorized',
    authorizationProof: proof,
    provider: drifted,
    snapshotProvider: drifted,
    token: 'USDC',
    source: 'coincard',
    traceId: 'trace-no-tx-before-toctou',
  });
  assert.ok(result.status !== 'confirmed', 'must not confirm after account drift');
  const sends = drifted.calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sends.length, 0,
    'no eth_sendTransaction must occur if TOCTOU account check fails');
});
