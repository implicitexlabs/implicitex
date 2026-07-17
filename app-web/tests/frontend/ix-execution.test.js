const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const policyPath = path.resolve(__dirname, '../../frontend/public/js/ix-execution-gas-policy.js');
const executePath = path.resolve(__dirname, '../../frontend/public/js/ix-execution.js');
const policySource = fs.readFileSync(policyPath, 'utf8');
const source = fs.readFileSync(executePath, 'utf8');
const approvalTxHash = '0x' + 'aa'.repeat(32);
const transferTxHash = '0x' + 'bb'.repeat(32);
const skippedApprovalTxHash = '0x' + 'cc'.repeat(32);

function pad64Hex(value) {
  return value.toString(16).padStart(64, '0');
}

function loadExecute(requestImpl) {
  return loadExecuteWithPolicy(requestImpl, true).IX_EXECUTION;
}

function loadExecuteWithoutPolicy(requestImpl) {
  return loadExecuteWithPolicy(requestImpl, false).IX_EXECUTION;
}

function loadExecuteWithPolicy(requestImpl, includePolicy, policyOverride) {
  const context = {
    BigInt,
    Date,
    Error,
    Number,
    Math,
    Promise,
    parseInt,
    setTimeout,
    window: {
      ethereum: {
        request: requestImpl,
      },
    },
  };
  context.globalThis = context;
  if (policyOverride) {
    context.window.IX_EXECUTION_GAS_POLICY = policyOverride;
  } else if (includePolicy) {
    vm.runInNewContext(policySource, context, { filename: policyPath });
  }
  vm.runInNewContext(source, context, { filename: executePath });
  return {
    IX_EXECUTION: context.window.IX_EXECUTION,
    IX_EXECUTION_GAS_POLICY: context.window.IX_EXECUTION_GAS_POLICY || null,
  };
}

test('prepare normalizes pending wallet request to wallet-busy', async () => {
  const IX_EXECUTION = loadExecute(async function () {
    const err = new Error('request already pending');
    err.code = -32002;
    throw err;
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'prepare',
    chainId: 137,
  });

  assert.equal(result.status, 'wallet-busy');
  assert.equal(result.error.code, 'WALLET_BUSY');
  assert.equal(result.receipt, null);
});

test('switch-network normalizes pending wallet request to wallet-busy', async () => {
  const IX_EXECUTION = loadExecute(async function () {
    const err = new Error('request already pending');
    err.code = -32002;
    throw err;
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'switch-network',
    chainId: 137,
  });

  assert.equal(result.status, 'wallet-busy');
  assert.equal(result.error.code, 'WALLET_BUSY');
});

test('execute normalizes pending approval request to wallet-busy', async () => {
  const IX_EXECUTION = loadExecute(async function (payload) {
    assert.equal(payload.method, 'eth_sendTransaction');
    const err = new Error('request already pending');
    err.code = -32002;
    throw err;
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: 1,
    total: 1.01,
  });

  assert.equal(result.status, 'wallet-busy');
  assert.equal(result.error.code, 'WALLET_BUSY');
  assert.equal(result.sender, '0x1111111111111111111111111111111111111111');
});

test('receipt failure after transfer hash returns outcome-unknown', async () => {
  const requests = [];
  const IX_EXECUTION = loadExecute(async function (payload) {
    requests.push(payload.method);
    if (payload.method === 'eth_sendTransaction') {
      return requests.filter(method => method === 'eth_sendTransaction').length === 1
        ? approvalTxHash
        : transferTxHash;
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      const hash = payload.params[0];
      if (hash.startsWith('0xaaaa')) {
        return { status: '0x1', blockNumber: '0x10' };
      }
      throw new Error('receipt unavailable');
    }
    throw new Error('unexpected method ' + payload.method);
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: 1,
    total: 1.01,
  });

  assert.equal(result.status, 'outcome-unknown');
  assert.equal(result.receipt, null);
  assert.equal(result.error.txHash, transferTxHash);
  assert.match(result.error.explorerUrl, /polygonscan\.com\/tx\/0xbb/);
});

test('execute can skip approval when readiness verified allowance', async () => {
  const sendTargets = [];
  const IX_EXECUTION = loadExecute(async function (payload) {
    if (payload.method === 'eth_sendTransaction') {
      sendTargets.push(payload.params[0].to);
      return skippedApprovalTxHash;
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      return { status: '0x1', blockNumber: '0x20' };
    }
    throw new Error('unexpected method ' + payload.method);
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amount: 1,
    total: 1.01,
    requiresApproval: false,
  });

  assert.equal(result.status, 'confirmed');
  assert.deepEqual(sendTargets, ['0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0']);
  assert.equal(result.receipt.approvalHash, null);
  assert.equal(result.receipt.txHash, skippedApprovalTxHash);
});

test('unsupported actions stay inside the ExecutionResult contract', async () => {
  const IX_EXECUTION = loadExecute(async function () {
    throw new Error('should not be called');
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'unsupported',
    chainId: 137,
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'UNSUPPORTED_ACTION');
  assert.equal(result.sender, null);
  assert.equal(result.chain, null);
  assert.equal(result.receipt, null);
});

test('execution source does not contain a fallback gas-policy implementation', () => {
  assert.equal(source.includes('buildLocalGasPolicy'), false);
  assert.equal(source.includes('__IX_EXECUTION_GAS_POLICY_FALLBACK'), false);
});

test('policy-adopting execute rejects precision-mismatched atomic input before send', async () => {
  const requests = [];
  const IX_EXECUTION = loadExecute(async function (payload) {
    requests.push(payload.method);
    return '0x' + 'f'.repeat(64);
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '1005001',
    totalDebitAtomic: '1015051',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'PRECISION_MISMATCH');
  assert.deepEqual(requests, []);
});

test('buildAuthorizedTransactionRequests adopts policy with exact atomic values and no floating-point authority', () => {
  const IX_EXECUTION = loadExecute(async function () {
    throw new Error('should not be called');
  });

  const txs = IX_EXECUTION.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
  });

  assert.equal(Array.isArray(txs), true);
  assert.equal(txs.length, 2);
  assert.equal(txs[0].to, '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359');
  assert.equal(txs[1].to, '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0');
  assert.equal(txs[0].data.slice(-64), pad64Hex(126250000n));
  assert.equal(txs[1].data.slice(-64), pad64Hex(125000000n));
});

test('buildAuthorizedTransactionRequests enforces transfer-only adoption and rejects invalid policy-module states', () => {
  const valid = loadExecute(async function () {
    throw new Error('should not be called');
  });

  const transferOnly = valid.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    allowanceAtomic: '126250000',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    executionPlan: 'TRANSFER_ONLY',
  });

  assert.equal(Array.isArray(transferOnly), true);
  assert.equal(transferOnly.length, 1);
  assert.equal(transferOnly[0].to, '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0');

  const invalidFee = valid.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    platformFeeAtomic: '1250001',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
  });
  const invalidTotal = valid.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250001',
    platformFeeAtomic: '1250000',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
  });
  const fractional = valid.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '1005001',
    totalDebitAtomic: '1015051',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
  });
  const executionPlanMismatch = valid.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    executionPlan: 'TRANSFER_ONLY',
  });
  const missingPolicy = loadExecuteWithoutPolicy(async function () {
    throw new Error('should not be called');
  }).buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
  });
  const throwingPolicy = loadExecuteWithPolicy(async function () {
    throw new Error('should not be called');
  }, false, {
    resolveGasPolicy() { throw new Error('resolve failed'); },
    validateGasPolicy() { throw new Error('validate failed'); },
    getPolicySecurityPayload() { throw new Error('payload failed'); },
    getCanonicalPolicyBinding() { throw new Error('binding failed'); },
    getGasLimit() { throw new Error('gas failed'); },
    validateExecutionDomain() { throw new Error('domain failed'); },
  }).IX_EXECUTION.buildAuthorizedTransactionRequests({
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    recipientAmountAtomic: '125000000',
    totalDebitAtomic: '126250000',
    allowanceAtomic: '0',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
  });

  assert.equal(invalidFee, null);
  assert.equal(invalidTotal, null);
  assert.equal(fractional, null);
  assert.equal(executionPlanMismatch, null);
  assert.equal(missingPolicy, null);
  assert.equal(throwingPolicy, null);
});

test('policy-adopting execute fails closed when the loaded policy module validates as invalid', async () => {
  const requests = [];
  const environment = loadExecuteWithPolicy(async function (payload) {
    requests.push(payload.method);
    return '0x' + 'd'.repeat(64);
  }, false, {
    resolveGasPolicy() {
      return { security: { policyId: 'COIN_CARD_POLYGON_V1' } };
    },
    validateGasPolicy() {
      return { valid: false, errors: ['policyRevision mismatch'] };
    },
    getPolicySecurityPayload() {
      return { policyId: 'COIN_CARD_POLYGON_V1' };
    },
    getCanonicalPolicyBinding() {
      return 'invalid-binding';
    },
    getGasLimit() {
      return null;
    },
    validateExecutionDomain() {
      return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
    },
  });
  const IX_EXECUTION = environment.IX_EXECUTION;

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '1000000',
    totalDebitAtomic: '1010000',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'GAS_POLICY_UNAVAILABLE');
  assert.deepEqual(requests, []);
});

test('policy-adopting execute uses whole-USDC atomic input and preserves portal defaults', async () => {
  const sendTargets = [];
  const IX_EXECUTION = loadExecute(async function (payload) {
    if (payload.method === 'eth_sendTransaction') {
      sendTargets.push(payload.params[0].to);
      return approvalTxHash;
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      return { status: '0x1', blockNumber: '0x1' };
    }
    return '0x0';
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '1000000',
    totalDebitAtomic: '1010000',
    requiresApproval: false,
  });

  assert.equal(result.status, 'confirmed');
  assert.deepEqual(sendTargets, ['0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0']);
  assert.equal(IX_EXECUTION.resolveGasPolicy('COIN_CARD_POLYGON_V1').security.policyId, 'COIN_CARD_POLYGON_V1');
  assert.equal(result.receipt.amount, '1');
  assert.equal(result.receipt.fee, '0.010000');
  assert.equal(result.receipt.total, '1.010000');
});

test('policy-adopting execute fails closed when the dedicated policy module is absent', async () => {
  const requests = [];
  const IX_EXECUTION = loadExecuteWithoutPolicy(async function (payload) {
    requests.push(payload.method);
    return '0x' + 'a'.repeat(64);
  });

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '1000000',
    totalDebitAtomic: '1010000',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'GAS_POLICY_UNAVAILABLE');
  assert.deepEqual(requests, []);
});

test('policy-adopting execute rejects arbitrary policy-like objects and execution-plan disagreement', async () => {
  const requests = [];
  const IX_EXECUTION = loadExecute(async function (payload) {
    requests.push(payload.method);
    return '0x' + 'b'.repeat(64);
  });

  assert.equal(IX_EXECUTION.resolveGasPolicy({ policyId: 'COIN_CARD_POLYGON_V1' }), null);
  assert.equal(IX_EXECUTION.getCanonicalPolicyBinding({ policyId: 'COIN_CARD_POLYGON_V1' }), null);

  const result = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '1000000',
    totalDebitAtomic: '1010000',
    requiresApproval: true,
    executionPlan: 'TRANSFER_ONLY',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'EXECUTION_PLAN_MISMATCH');
  assert.deepEqual(requests, []);
});

test('policy-adopting execute rejects incorrect supplied fee and total before send', async () => {
  const requests = [];
  const IX_EXECUTION = loadExecute(async function (payload) {
    requests.push(payload.method);
    return '0x' + 'c'.repeat(64);
  });

  const badFee = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '125000000',
    platformFeeAtomic: '1250001',
    totalDebitAtomic: '126250000',
  });

  assert.equal(badFee.status, 'failed');
  assert.equal(badFee.error.code, 'PLATFORM_FEE_MISMATCH');
  assert.deepEqual(requests, []);

  const badTotal = await IX_EXECUTION.executeTransfer({
    action: 'execute',
    gasPolicyId: 'COIN_CARD_POLYGON_V1',
    chainId: 137,
    sender: '0x1111111111111111111111111111111111111111',
    recipient: '0x2222222222222222222222222222222222222222',
    amountAtomic: '125000000',
    platformFeeAtomic: '1250000',
    totalDebitAtomic: '126250001',
  });

  assert.equal(badTotal.status, 'failed');
  assert.equal(badTotal.error.code, 'TOTAL_DEBIT_MISMATCH');
  assert.deepEqual(requests, []);
});
