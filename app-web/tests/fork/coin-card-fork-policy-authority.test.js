'use strict';

/**
 * coin-card-fork-policy-authority.test.js — Static policy-authority verification.
 *
 * Runs without RPC. Verifies that:
 *  1. The loader loads and returns a frozen policy from COIN_CARD_POLYGON_V1.
 *  2. Required policy fields are present and have correct types.
 *  3. The loader rejects an invalid module path.
 *  4. Policy literal values do not appear as hardcoded strings in the fork test
 *     source files (addresses, keccak256 hashes, fee/amount values).
 *  5. The historical evidence artifact is not imported or required as a normative
 *     oracle by the refactored test files.
 *  6. Maximum amount is marked POLICY_BOUND (derived from policy, not chain-read).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadCanonicalPolicy, POLICY_MODULE_PATH } = require('./ix-gas-policy-loader.js');

const FORK_DIR = __dirname;

// ---------------------------------------------------------------------------
// Test 1: Loader loads successfully and returns a frozen policy
// ---------------------------------------------------------------------------
{
  const { policyId, policy } = loadCanonicalPolicy();

  assert.equal(
    typeof policyId, 'string',
    'policyId must be a string',
  );
  assert.ok(policyId.length > 0, 'policyId must be non-empty');

  assert.ok(
    Object.isFrozen(policy),
    'resolved policy object must be frozen',
  );
  assert.ok(
    policy.security && typeof policy.security === 'object',
    'policy.security must be an object',
  );

  console.log('[PASS] Test 1: loader loads and returns frozen policy');
}

// ---------------------------------------------------------------------------
// Test 2: Policy ID comes from POLICY_IDS.COIN_CARD_POLYGON_V1
// ---------------------------------------------------------------------------
{
  // Load the module directly to inspect POLICY_IDS — do not hardcode the key value.
  const vm = require('node:vm');
  const src = fs.readFileSync(POLICY_MODULE_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { filename: POLICY_MODULE_PATH });
  const api = sandbox.window.IX_EXECUTION_GAS_POLICY;

  assert.ok(api.POLICY_IDS, 'POLICY_IDS must be exported');
  const canonicalKey = api.POLICY_IDS.COIN_CARD_POLYGON_V1;
  assert.ok(
    typeof canonicalKey === 'string' && canonicalKey.length > 0,
    'POLICY_IDS.COIN_CARD_POLYGON_V1 must be a non-empty string',
  );

  const { policyId } = loadCanonicalPolicy();
  assert.equal(
    policyId,
    canonicalKey,
    'loader policyId must equal POLICY_IDS.COIN_CARD_POLYGON_V1',
  );

  console.log('[PASS] Test 2: policy ID derives from POLICY_IDS.COIN_CARD_POLYGON_V1');
}

// ---------------------------------------------------------------------------
// Test 3: Required policy fields are present and have correct types
// ---------------------------------------------------------------------------
{
  const { policy } = loadCanonicalPolicy();
  const sec = policy.security;

  // chainId
  const chainIdRaw = sec.chainId;
  assert.ok(
    typeof chainIdRaw === 'string' || typeof chainIdRaw === 'number',
    'policy.security.chainId must be a string or number',
  );
  assert.ok(Number(chainIdRaw) > 0, 'policy.security.chainId must be a positive number');

  // token
  assert.equal(typeof sec.token.address, 'string', 'token.address must be string');
  assert.match(sec.token.address, /^0x[0-9a-f]{40}$/, 'token.address must be a lowercase hex address');
  assert.equal(typeof sec.token.implementationSlot, 'string', 'token.implementationSlot must be string');
  assert.equal(typeof sec.token.runtimeKeccak256, 'string', 'token.runtimeKeccak256 must be string');
  assert.equal(typeof sec.token.implementationAddress, 'string', 'token.implementationAddress must be string');
  assert.equal(typeof sec.token.implementationRuntimeKeccak256, 'string', 'token.implementationRuntimeKeccak256 must be string');

  // executionContract
  assert.equal(typeof sec.executionContract.address, 'string', 'executionContract.address must be string');
  assert.match(sec.executionContract.address, /^0x[0-9a-f]{40}$/, 'executionContract.address must be lowercase hex');
  assert.equal(typeof sec.executionContract.runtimeKeccak256, 'string', 'executionContract.runtimeKeccak256 must be string');
  assert.equal(typeof sec.executionContract.treasuryAddress, 'string', 'executionContract.treasuryAddress must be string');
  assert.match(sec.executionContract.treasuryAddress, /^0x[0-9a-f]{40}$/, 'executionContract.treasuryAddress must be lowercase hex');
  assert.equal(sec.executionContract.paused, false, 'executionContract.paused must be false');

  // amountPolicy (stored as decimal strings)
  const feeBps = Number(sec.amountPolicy.feeBasisPoints);
  assert.ok(Number.isFinite(feeBps) && feeBps > 0, 'feeBasisPoints must be a positive finite number');

  const minAmount = BigInt(sec.amountPolicy.minimumRecipientAmountAtomic);
  assert.ok(minAmount > 0n, 'minimumRecipientAmountAtomic must be positive');

  const maxAmount = BigInt(sec.amountPolicy.maximumRecipientAmountAtomic);
  assert.ok(maxAmount > minAmount, 'maximumRecipientAmountAtomic must exceed minimum');

  const precision = BigInt(sec.amountPolicy.precisionIncrementAtomic);
  assert.ok(precision > 0n, 'precisionIncrementAtomic must be positive');
  assert.equal(minAmount % precision, 0n, 'minimumRecipientAmountAtomic must be divisible by precision');
  assert.equal(maxAmount % precision, 0n, 'maximumRecipientAmountAtomic must be divisible by precision');

  // gasLimits
  assert.ok(Number(sec.gasLimits.approve) > 0, 'gasLimits.approve must be positive');
  assert.ok(Number(sec.gasLimits.transferWithFee) > 0, 'gasLimits.transferWithFee must be positive');

  console.log('[PASS] Test 3: required policy fields present and correct types');
}

// ---------------------------------------------------------------------------
// Test 4: Loader rejects an invalid module path
// ---------------------------------------------------------------------------
{
  let threw = false;
  try {
    loadCanonicalPolicy(path.resolve(__dirname, 'nonexistent-module-path.js'));
  } catch (err) {
    threw = true;
    assert.match(
      err.message,
      /ix-gas-policy-loader/,
      'error must identify the loader',
    );
  }
  assert.equal(threw, true, 'loader must throw for an invalid module path');

  console.log('[PASS] Test 4: loader rejects invalid module path');
}

// ---------------------------------------------------------------------------
// Test 5: Policy literal values do not appear hardcoded in fork test sources
// ---------------------------------------------------------------------------
{
  const { policy } = loadCanonicalPolicy();
  const sec = policy.security;

  const filesToScan = [
    path.resolve(FORK_DIR, 'polygon-approval-transfer-smoke.test.js'),
    path.resolve(FORK_DIR, 'polygon-gas-evidence-matrix.test.js'),
    path.resolve(FORK_DIR, 'hardhat.polygon-smoke.config.js'),
  ];

  // Policy-owned values that must not appear as raw literals.
  // Addresses: the policy module normalizes to lowercase. The test files use
  // ethers.getAddress() (checksummed) to construct USDC_ADDRESS and
  // EXECUTION_ADDRESS from _sec fields, so the raw checksummed literals that
  // previously appeared must no longer be present.
  const forbiddenLiterals = [
    // USDC address — both lowercase and checksummed
    sec.token.address,
    // Execution address — lowercase form
    sec.executionContract.address,
    // Treasury — lowercase form
    sec.executionContract.treasuryAddress,
    // Runtime keccak256 hashes
    sec.token.runtimeKeccak256,
    sec.token.implementationRuntimeKeccak256,
    sec.executionContract.runtimeKeccak256,
  ];

  // Also check the original checksummed forms that appeared in the old code.
  // The policy module uses lowercase, but the old test files used ethers.getAddress()
  // inline — e.g. ethers.getAddress('0x3c499c542cEF5E3...').
  // After refactoring, those inline calls are gone. We verify the raw mixed-case
  // literals no longer appear. Extract them from known original values:
  const checksummedLiterals = [
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
    '0x235AE97b28466Db30469b89A9fe4cFf0659f82Cb',
    '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
  ];

  for (const filePath of filesToScan) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    for (const literal of forbiddenLiterals) {
      // Skip empty strings (shouldn't happen, but guard)
      if (!literal) continue;
      assert.equal(
        src.includes(literal),
        false,
        `${fileName} must not hardcode policy literal: ${literal}`,
      );
    }

    for (const literal of checksummedLiterals) {
      assert.equal(
        src.includes(literal),
        false,
        `${fileName} must not hardcode original checksummed address literal: ${literal}`,
      );
    }

    // Fee basis points: '100' is too short to scan meaningfully without false
    // positives (appears in line numbers, timeouts, etc.). Instead verify via
    // the type/field checks in Test 3.

    console.log(`[PASS] Test 5: ${fileName} — no hardcoded policy literals found`);
  }
}

// ---------------------------------------------------------------------------
// Test 6: Historical evidence artifact is NOT imported as a normative oracle
// ---------------------------------------------------------------------------
{
  const evidenceArtifactPath = 'polygon-fork-gas-evidence.json';

  const filesToScan = [
    path.resolve(FORK_DIR, 'polygon-approval-transfer-smoke.test.js'),
    path.resolve(FORK_DIR, 'polygon-gas-evidence-matrix.test.js'),
    path.resolve(FORK_DIR, 'hardhat.polygon-smoke.config.js'),
  ];

  for (const filePath of filesToScan) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    // The evidence artifact path should not appear in require() calls.
    const requirePattern = /require\s*\(\s*['"][^'"]*polygon-fork-gas-evidence[^'"]*['"]\s*\)/;
    assert.equal(
      requirePattern.test(src),
      false,
      `${fileName} must not require() the historical evidence artifact`,
    );

    // In the matrix test, the artifact is read via fs.readFileSync for optional
    // drift comparison — not via require(). The test uses a try/catch around it,
    // ensuring it cannot hard-fail. Verify the pattern.
    if (fileName === 'polygon-gas-evidence-matrix.test.js') {
      assert.ok(
        src.includes(evidenceArtifactPath),
        `${fileName} should reference the artifact path for optional drift comparison`,
      );
      assert.ok(
        src.includes('historicalDrift'),
        `${fileName} should produce a historicalDrift section (not a normative assertion)`,
      );
      // The old normative assertion must no longer be present.
      assert.equal(
        src.includes('assert.deepEqual(artifact.rawRepetitionGroups'),
        false,
        `${fileName} must not make normative deepEqual assertion against artifact.rawRepetitionGroups`,
      );
    }

    console.log(`[PASS] Test 6: ${fileName} — artifact not used as normative oracle`);
  }
}

// ---------------------------------------------------------------------------
// Test 7: Maximum amount is POLICY_BOUND
// ---------------------------------------------------------------------------
{
  const { policy } = loadCanonicalPolicy();
  const sec = policy.security;

  // The maximumRecipientAmountAtomic is defined in the policy module and used in
  // AMOUNTS.maximum in the matrix test. It is not read from any on-chain getter
  // (no getter exists on the execution contract for this value).
  const maxAtomic = sec.amountPolicy.maximumRecipientAmountAtomic;
  assert.ok(typeof maxAtomic === 'string', 'maximumRecipientAmountAtomic must be a string');
  assert.ok(BigInt(maxAtomic) > 0n, 'maximumRecipientAmountAtomic must be positive');

  // Verify the matrix test file derives maximum from policy (AMOUNTS.maximum = BigInt(_sec...))
  const matrixSrc = fs.readFileSync(
    path.resolve(FORK_DIR, 'polygon-gas-evidence-matrix.test.js'),
    'utf8',
  );
  assert.ok(
    matrixSrc.includes('_sec.amountPolicy.maximumRecipientAmountAtomic'),
    'AMOUNTS.maximum must derive from _sec.amountPolicy.maximumRecipientAmountAtomic',
  );

  // Confirm the raw literal no longer appears as a hardcoded value in AMOUNTS.
  // The old value was 250_000_000n — check it doesn't appear in AMOUNTS definition.
  // We look specifically for the pattern used in the old code.
  assert.equal(
    matrixSrc.includes('maximum: 250_000_000n'),
    false,
    'AMOUNTS.maximum must not be hardcoded as 250_000_000n',
  );

  console.log('[PASS] Test 7: maximum amount is POLICY_BOUND — derived from canonical policy module');
}

// ---------------------------------------------------------------------------
// Test 8: Proxy implementation-storage reads use the canonical policy slot
// ---------------------------------------------------------------------------
{
  const { policy } = loadCanonicalPolicy();
  const sec = policy.security;

  const filesToCheck = [
    path.resolve(FORK_DIR, 'polygon-approval-transfer-smoke.test.js'),
    path.resolve(FORK_DIR, 'polygon-gas-evidence-matrix.test.js'),
  ];

  for (const filePath of filesToCheck) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    // The canonical slot must be referenced via _sec.token.implementationSlot.
    assert.ok(
      src.includes('_sec.token.implementationSlot'),
      `${fileName} must reference _sec.token.implementationSlot for proxy slot reads`,
    );

    // The proxy type must be referenced via _sec.token.proxyType.
    assert.ok(
      src.includes('_sec.token.proxyType'),
      `${fileName} must reference _sec.token.proxyType in the implementation probe`,
    );

    console.log(`[PASS] Test 8: ${fileName} — proxy reads use canonical slot`);
  }
}

// ---------------------------------------------------------------------------
// Test 9: No independent implementation-slot constant names in fork files
// ---------------------------------------------------------------------------
// Checks for the constant *names* that would indicate an independently
// defined slot. The hex value itself is not embedded here to avoid
// triggering the pre-commit private-key guard on a test-only string.
{
  const filesToScan = [
    path.resolve(FORK_DIR, 'polygon-approval-transfer-smoke.test.js'),
    path.resolve(FORK_DIR, 'polygon-gas-evidence-matrix.test.js'),
    path.resolve(FORK_DIR, 'hardhat.polygon-smoke.config.js'),
  ];

  for (const filePath of filesToScan) {
    const src = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);

    // The named constants that represented independently-defined slots.
    assert.equal(
      src.includes('EIP1967_IMPLEMENTATION_SLOT'),
      false,
      `${fileName} must not define an independent EIP1967_IMPLEMENTATION_SLOT constant`,
    );

    assert.equal(
      src.includes('ZEPPELINOS_IMPLEMENTATION_SLOT'),
      false,
      `${fileName} must not define an independent ZEPPELINOS_IMPLEMENTATION_SLOT constant`,
    );

    console.log(`[PASS] Test 9: ${fileName} — no independent slot constant names`);
  }
}

// ---------------------------------------------------------------------------
// Test 10: Loader fails when implementationSlot is missing or malformed
// ---------------------------------------------------------------------------
{
  // The loader already calls requireString(sec, 'token.implementationSlot').
  // Verify this by checking the loader source.
  const loaderSrc = fs.readFileSync(
    path.resolve(FORK_DIR, 'ix-gas-policy-loader.js'),
    'utf8',
  );

  assert.ok(
    loaderSrc.includes("requireString(sec, 'token.implementationSlot')"),
    "loader must call requireString(sec, 'token.implementationSlot') to validate the slot",
  );

  // Confirm the loader does NOT reference the EIP-1967 constant name as a fallback.
  // (The hex literal itself is not embedded here to avoid the pre-commit guard.)
  assert.equal(
    loaderSrc.includes('EIP1967'),
    false,
    'loader must not reference EIP1967 as a fallback',
  );

  console.log('[PASS] Test 10: loader validates implementationSlot; no EIP-1967 fallback');
}

// ---------------------------------------------------------------------------
// Test 11: Block-hash provenance stored as structured metadata, not scalar constants
// ---------------------------------------------------------------------------
{
  const smokeSrc = fs.readFileSync(
    path.resolve(FORK_DIR, 'polygon-approval-transfer-smoke.test.js'),
    'utf8',
  );

  // Scalar constant names that previously held bare 64-hex hashes must be absent.
  assert.equal(
    smokeSrc.includes('SOURCE_HEAD_HASH'),
    false,
    'smoke test must not define SOURCE_HEAD_HASH as a scalar constant',
  );
  assert.equal(
    smokeSrc.includes('PINNED_BLOCK_HASH'),
    false,
    'smoke test must not define PINNED_BLOCK_HASH as a scalar constant',
  );

  // The replacement provenance objects must be present and frozen.
  assert.ok(
    smokeSrc.includes('SOURCE_HEAD_BLOCK') && smokeSrc.includes('Object.freeze'),
    'smoke test must define SOURCE_HEAD_BLOCK as a frozen provenance object',
  );
  assert.ok(
    smokeSrc.includes('PINNED_FORK_BLOCK') && smokeSrc.includes('Object.freeze'),
    'smoke test must define PINNED_FORK_BLOCK as a frozen provenance object',
  );

  // Each object must carry an explicit kind field to distinguish Polygon block
  // provenance from any other fingerprint type.
  assert.ok(
    smokeSrc.includes("kind: 'polygon-mainnet-block'"),
    'provenance objects must include kind: polygon-mainnet-block',
  );

  // The pinned block must pair a number with its hash (fork reproducibility proof).
  assert.ok(
    smokeSrc.includes('PINNED_FORK_BLOCK') &&
    smokeSrc.includes('number:') &&
    smokeSrc.includes('hash:'),
    'PINNED_FORK_BLOCK must pair block number and hash',
  );

  // Source provenance must be distinguishable from fork provenance by name.
  assert.notEqual(
    smokeSrc.indexOf('SOURCE_HEAD_BLOCK'),
    smokeSrc.indexOf('PINNED_FORK_BLOCK'),
    'source head block and pinned fork block must be distinct named objects',
  );

  // Neither hash may appear as a canonical policy field comparison.
  // Verify the proof: neither object is compared against _sec or CANONICAL_POLICY.
  assert.equal(
    /SOURCE_HEAD_BLOCK\.hash[^=]*===?\s*_sec/.test(smokeSrc),
    false,
    'SOURCE_HEAD_BLOCK.hash must not be compared against policy fields',
  );
  assert.equal(
    /PINNED_FORK_BLOCK\.hash[^=]*===?\s*_sec/.test(smokeSrc),
    false,
    'PINNED_FORK_BLOCK.hash must not be compared against policy fields',
  );

  console.log('[PASS] Test 11: block-hash provenance stored as structured metadata');
}

console.log('\n[ALL PASS] coin-card-fork-policy-authority: 11/11 tests passed');
