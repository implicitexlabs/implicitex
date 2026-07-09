const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const executePath = path.resolve(__dirname, '../../frontend/public/js/ix-execution.js');
const source = fs.readFileSync(executePath, 'utf8');
const approvalTxHash = '0x' + 'aa'.repeat(32);
const transferTxHash = '0x' + 'bb'.repeat(32);
const skippedApprovalTxHash = '0x' + 'cc'.repeat(32);

function loadExecute(requestImpl) {
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
  vm.runInNewContext(source, context, { filename: executePath });
  return context.window.IX_EXECUTION;
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
