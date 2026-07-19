'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ethers, network } = require('hardhat');

const { loadCanonicalPolicy } = require('./ix-gas-policy-loader.js');

// All policy-owned facts derive from the canonical module. No address, hash,
// fee, amount, precision, or gas-limit literal may appear in this file.
const { policy: CANONICAL_POLICY } = loadCanonicalPolicy();
const _sec = CANONICAL_POLICY.security;

const SOURCE_CHAIN_ID = BigInt(_sec.chainId);
const LOCAL_CHAIN_ID = 31337n;

// Polygon mainnet block that was the chain head when this smoke test was authored.
// Used to verify the upstream RPC returns the same canonical chain history.
// Not a fork pin and not policy authority.
const SOURCE_HEAD_BLOCK = Object.freeze({
  kind: 'polygon-mainnet-block',
  number: 90359708n,
  hash: '0xd77aa1e133fc5e1b21b2f7a73e161ccaec2487c550449edf93802ca345bcc7be',
  timestamp: 1784244557n,
});

// Polygon mainnet block at which the local Hardhat fork is pinned. All state
// mutations happen only against this local fork. Upstream RPC and local Hardhat
// must agree on this hash to confirm reproducibility. Not policy authority.
const PINNED_FORK_BLOCK = Object.freeze({
  kind: 'polygon-mainnet-block',
  number: 90357660n,
  hash: '0x58957b1e043b07b47b2c6a2ff141ed2678e8c6555b6ccd5be914b319b41633d9',
  timestamp: 1784241485n,
});

const PIN_OFFSET_BLOCKS = SOURCE_HEAD_BLOCK.number - PINNED_FORK_BLOCK.number;

const USDC_ADDRESS = ethers.getAddress(_sec.token.address);
const EXECUTION_ADDRESS = ethers.getAddress(_sec.executionContract.address);
const ZERO_ADDRESS = ethers.ZeroAddress;
const PAYMENT_AMOUNT = 125_000_000n;
const HOLDER_FUNDING_AMOUNT = 300_000_000n;
const HOLDER_DISCOVERY_BLOCKS = 64n;
const HOLDER_CANDIDATE_LIMIT = 128;
const LOCAL_NATIVE_GAS_BALANCE = 10n ** 20n;

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
// The canonical implementation slot derives from the policy.
// No independent slot constant may be defined here.
const CANONICAL_IMPLEMENTATION_SLOT = _sec.token.implementationSlot;

const ERC20_INTERFACE = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function transfer(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

const EXECUTION_INTERFACE = new ethers.Interface([
  'function usdc() view returns (address)',
  'function treasury() view returns (address)',
  'function feeBasisPoints() view returns (uint16)',
  'function minTransferAmount() view returns (uint256)',
  'function transferPrecision() view returns (uint256)',
  'function paused() view returns (bool)',
  'function transferWithFee(address,uint256)',
]);

const LOCAL_EXCLUSIVE_METHODS = new Set([
  'hardhat_impersonateAccount',
  'hardhat_stopImpersonatingAccount',
  'hardhat_setBalance',
  'evm_mine',
  'evm_snapshot',
  'evm_revert',
  'eth_estimateGas',
  'eth_sendTransaction',
  'eth_getTransactionReceipt',
]);

function bigintHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function asBigInt(value) {
  return BigInt(value);
}

function codeIdentity(code) {
  assert.notEqual(code, '0x', 'deployed runtime code must be present');
  return {
    byteLength: BigInt((code.length - 2) / 2).toString(),
    keccak256: ethers.keccak256(code),
  };
}

function addressFromStorageWord(word) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(word) || BigInt(word) === 0n) return null;
  return ethers.getAddress(`0x${word.slice(-40)}`);
}

function loadCurrentIxExecution() {
  const sourcePath = path.resolve(__dirname, '../../frontend/public/js/ix-execution.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: sourcePath });
  return context.window.IX_EXECUTION;
}

function makeUpstreamReadGate(url) {
  const allowedMethods = new Set(['eth_chainId', 'eth_getBlockByNumber']);
  const observedMethods = [];
  const rejectedMethods = [];
  let requestId = 0;

  return {
    observedMethods,
    rejectedMethods,
    async request(method, params) {
      if (!allowedMethods.has(method)) {
        rejectedMethods.push(method);
        throw new Error('Upstream provider rejected a non-read checkpoint method');
      }
      observedMethods.push(method);
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
        });
      } catch {
        throw new Error('Sanitized upstream transport failure');
      }
      if (!response.ok) throw new Error('Sanitized upstream HTTP failure');
      const payload = await response.json();
      if (payload.error) throw new Error('Sanitized upstream JSON-RPC failure');
      return payload.result;
    },
  };
}

async function certifyInProcessLocalProvider() {
  assert.equal(network.name, 'hardhat', 'network name must be hardhat');
  const rawProvider = network.provider;
  const clientVersion = await rawProvider.request({ method: 'web3_clientVersion', params: [] });
  const metadata = await rawProvider.request({ method: 'hardhat_metadata', params: [] });
  const localChainId = asBigInt(await rawProvider.request({ method: 'eth_chainId', params: [] }));

  assert.match(clientVersion, /hardhat/i, 'client must identify as Hardhat');
  assert.equal(localChainId, LOCAL_CHAIN_ID, 'local chain ID must be deliberately distinct');
  assert.equal(asBigInt(metadata.chainId), LOCAL_CHAIN_ID, 'Hardhat metadata chain mismatch');
  assert.ok(metadata.instanceId, 'Hardhat instance ID is required');
  assert.ok(metadata.forkedNetwork, 'Hardhat must report a forked network');
  assert.equal(asBigInt(metadata.forkedNetwork.chainId), SOURCE_CHAIN_ID);
  assert.equal(asBigInt(metadata.forkedNetwork.forkBlockNumber), PINNED_FORK_BLOCK.number);
  assert.equal(metadata.forkedNetwork.forkBlockHash.toLowerCase(), PINNED_FORK_BLOCK.hash);

  return { rawProvider, clientVersion, metadata };
}

function makeLocalOnlyProvider(certificate) {
  const observedMethods = [];
  const exclusiveMethods = [];

  return {
    observedMethods,
    exclusiveMethods,
    async request({ method, params = [] }) {
      if (network.name !== 'hardhat' || network.provider !== certificate.rawProvider) {
        throw new Error(`Refusing ${method}: provider is not the certified in-process Hardhat instance`);
      }
      if (!certificate.metadata.instanceId) {
        throw new Error(`Refusing ${method}: local Hardhat certificate is incomplete`);
      }
      observedMethods.push(method);
      if (LOCAL_EXCLUSIVE_METHODS.has(method)) exclusiveMethods.push(method);
      return certificate.rawProvider.request({ method, params });
    },
  };
}

async function ethCall(localProvider, to, data, blockTag = 'latest') {
  return localProvider.request({
    method: 'eth_call',
    params: [{ to, data }, blockTag],
  });
}

async function decodedCall(localProvider, target, iface, functionName, args = [], blockTag = 'latest') {
  const result = await ethCall(localProvider, target, iface.encodeFunctionData(functionName, args), blockTag);
  return iface.decodeFunctionResult(functionName, result);
}

async function tokenBalance(localProvider, account, blockTag = 'latest') {
  return asBigInt((await decodedCall(
    localProvider,
    USDC_ADDRESS,
    ERC20_INTERFACE,
    'balanceOf',
    [account],
    blockTag,
  ))[0]);
}

async function tokenAllowance(localProvider, owner, spender, blockTag = 'latest') {
  return asBigInt((await decodedCall(
    localProvider,
    USDC_ADDRESS,
    ERC20_INTERFACE,
    'allowance',
    [owner, spender],
    blockTag,
  ))[0]);
}

async function waitForLocalReceipt(localProvider, transactionHash) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const receipt = await localProvider.request({
      method: 'eth_getTransactionReceipt',
      params: [transactionHash],
    });
    if (receipt) return receipt;
  }
  throw new Error('Local transaction receipt was not available');
}

function assertSuccessfulReceipt(receipt, label) {
  assert.equal(asBigInt(receipt.status), 1n, `${label} receipt must succeed`);
}

async function implementationEvidence(localProvider, address, blockTag) {
  // Probe only the canonical policy-owned slot. The proxy type and slot are
  // authoritative from the policy; no independent slot constant is permitted.
  const slots = [
    [_sec.token.proxyType, CANONICAL_IMPLEMENTATION_SLOT],
  ];

  for (const [standard, slot] of slots) {
    const word = await localProvider.request({
      method: 'eth_getStorageAt',
      params: [address, slot, blockTag],
    });
    const implementation = addressFromStorageWord(word);
    if (!implementation) continue;
    const implementationCode = await localProvider.request({
      method: 'eth_getCode',
      params: [implementation, blockTag],
    });
    if (implementationCode === '0x') continue;
    return {
      proxyEvidence: standard,
      implementation,
      implementationCodeIdentity: codeIdentity(implementationCode),
    };
  }

  const runtimeCode = await localProvider.request({
    method: 'eth_getCode',
    params: [address, blockTag],
  });
  const minimalProxyMatch = runtimeCode.match(
    /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/,
  );
  if (minimalProxyMatch) {
    const implementation = ethers.getAddress(`0x${minimalProxyMatch[1]}`);
    const implementationCode = await localProvider.request({
      method: 'eth_getCode',
      params: [implementation, blockTag],
    });
    assert.notEqual(implementationCode, '0x', 'EIP-1167 implementation must contain code');
    return {
      proxyEvidence: 'eip-1167',
      implementation,
      implementationCodeIdentity: codeIdentity(implementationCode),
    };
  }

  return {
    proxyEvidence: null,
    implementation: null,
    implementationCodeIdentity: null,
  };
}

async function discoverFundedPublicHolder(localProvider, excludedAddresses) {
  const fromBlock = PINNED_FORK_BLOCK.number - HOLDER_DISCOVERY_BLOCKS + 1n;
  const logs = await localProvider.request({
    method: 'eth_getLogs',
    params: [{
      address: USDC_ADDRESS,
      fromBlock: bigintHex(fromBlock),
      toBlock: bigintHex(PINNED_FORK_BLOCK.number),
      topics: [TRANSFER_TOPIC],
    }],
  });
  assert.ok(logs.length > 0, 'bounded USDC Transfer-log window must contain candidates');

  const ranked = new Map();
  for (const log of logs) {
    if (!log.topics || log.topics.length < 3) continue;
    const value = asBigInt(log.data);
    for (const topic of [log.topics[1], log.topics[2]]) {
      const candidate = ethers.getAddress(`0x${topic.slice(-40)}`);
      if (candidate === ZERO_ADDRESS || excludedAddresses.has(candidate.toLowerCase())) continue;
      const previous = ranked.get(candidate) || 0n;
      if (value > previous) ranked.set(candidate, value);
    }
  }

  const candidates = [...ranked.entries()]
    .sort(([addressA, valueA], [addressB, valueB]) => {
      if (valueA !== valueB) return valueA > valueB ? -1 : 1;
      return addressA.localeCompare(addressB);
    })
    .slice(0, HOLDER_CANDIDATE_LIMIT);

  for (const [candidate] of candidates) {
    const [balance, code] = await Promise.all([
      tokenBalance(localProvider, candidate),
      localProvider.request({
        method: 'eth_getCode',
        params: [candidate, bigintHex(PINNED_FORK_BLOCK.number)],
      }),
    ]);
    if (balance >= HOLDER_FUNDING_AMOUNT && code === '0x') {
      return {
        address: candidate,
        balanceAtPinnedBlock: balance,
        discoveryFromBlock: fromBlock,
        discoveryToBlock: PINNED_FORK_BLOCK.number,
        transferLogCount: BigInt(logs.length),
        candidateLimit: BigInt(HOLDER_CANDIDATE_LIMIT),
      };
    }
  }

  throw new Error('No sufficiently funded EOA was found in the bounded discovery window');
}

describe('controlled Polygon fork approval and transfer smoke', function () {
  this.timeout(180_000);

  it('runs exactly one sequential approval-and-transfer scenario locally', async function () {
    assert.ok(process.env.IMPLICITEX_RPC_URL_POLYGON, 'fork RPC environment is required');
    assert.equal(process.env.IMPLICITEX_DEPLOYER_KEY, undefined, 'deployer key must be absent');

    const upstream = makeUpstreamReadGate(process.env.IMPLICITEX_RPC_URL_POLYGON);
    await assert.rejects(
      upstream.request('eth_sendTransaction', []),
      /rejected a non-read checkpoint method/,
    );
    await assert.rejects(
      upstream.request('eth_sendRawTransaction', []),
      /rejected a non-read checkpoint method/,
    );
    const sourceChainId = asBigInt(await upstream.request('eth_chainId', []));
    const sourceHead = await upstream.request(
      'eth_getBlockByNumber',
      [bigintHex(SOURCE_HEAD_BLOCK.number), false],
    );
    const sourcePinned = await upstream.request(
      'eth_getBlockByNumber',
      [bigintHex(PINNED_FORK_BLOCK.number), false],
    );
    assert.equal(sourceChainId, SOURCE_CHAIN_ID);
    assert.equal(asBigInt(sourceHead.number), SOURCE_HEAD_BLOCK.number);
    assert.equal(sourceHead.hash.toLowerCase(), SOURCE_HEAD_BLOCK.hash);
    assert.equal(asBigInt(sourceHead.timestamp), SOURCE_HEAD_BLOCK.timestamp);
    assert.equal(SOURCE_HEAD_BLOCK.number - PINNED_FORK_BLOCK.number, PIN_OFFSET_BLOCKS);
    assert.equal(asBigInt(sourcePinned.number), PINNED_FORK_BLOCK.number);
    assert.equal(sourcePinned.hash.toLowerCase(), PINNED_FORK_BLOCK.hash);
    assert.equal(asBigInt(sourcePinned.timestamp), PINNED_FORK_BLOCK.timestamp);

    const certificate = await certifyInProcessLocalProvider();
    const localProvider = makeLocalOnlyProvider(certificate);
    const localPinned = await localProvider.request({
      method: 'eth_getBlockByNumber',
      params: [bigintHex(PINNED_FORK_BLOCK.number), false],
    });
    const localLatestBeforeMutation = await localProvider.request({
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
    });
    assert.equal(localPinned.hash.toLowerCase(), PINNED_FORK_BLOCK.hash);
    assert.equal(localLatestBeforeMutation.hash.toLowerCase(), PINNED_FORK_BLOCK.hash);
    assert.equal(asBigInt(localPinned.timestamp), PINNED_FORK_BLOCK.timestamp);

    // Hardhat 2.28/EDR does not apply its user-supplied chain-137 hardfork
    // history to calls tagged at the fork block. Mine one empty local block so
    // EVM reads execute under the explicitly configured local hardfork. The
    // forked state is unchanged and no upstream transaction path is involved.
    await localProvider.request({ method: 'evm_mine', params: [] });
    const localStateReadBlock = await localProvider.request({
      method: 'eth_getBlockByNumber',
      params: ['latest', false],
    });
    assert.equal(asBigInt(localStateReadBlock.number), PINNED_FORK_BLOCK.number + 1n);

    const pinnedBlockTag = bigintHex(PINNED_FORK_BLOCK.number);
    const stateBlockTag = 'latest';
    const usdcCode = await localProvider.request({
      method: 'eth_getCode',
      params: [USDC_ADDRESS, pinnedBlockTag],
    });
    const executionCode = await localProvider.request({
      method: 'eth_getCode',
      params: [EXECUTION_ADDRESS, pinnedBlockTag],
    });
    const usdcCodeIdentity = codeIdentity(usdcCode);
    const executionCodeIdentity = codeIdentity(executionCode);
    const usdcProxy = await implementationEvidence(localProvider, USDC_ADDRESS, pinnedBlockTag);
    const executionProxy = await implementationEvidence(localProvider, EXECUTION_ADDRESS, pinnedBlockTag);

    const usdcDecimals = asBigInt((await decodedCall(
      localProvider,
      USDC_ADDRESS,
      ERC20_INTERFACE,
      'decimals',
      [],
      stateBlockTag,
    ))[0]);
    const usdcSymbol = (await decodedCall(
      localProvider,
      USDC_ADDRESS,
      ERC20_INTERFACE,
      'symbol',
      [],
      stateBlockTag,
    ))[0];
    assert.equal(usdcDecimals, 6n);
    assert.equal(usdcSymbol, 'USDC');

    const onchainUsdc = ethers.getAddress((await decodedCall(
      localProvider,
      EXECUTION_ADDRESS,
      EXECUTION_INTERFACE,
      'usdc',
      [],
      stateBlockTag,
    ))[0]);
    const treasury = ethers.getAddress((await decodedCall(
      localProvider,
      EXECUTION_ADDRESS,
      EXECUTION_INTERFACE,
      'treasury',
      [],
      stateBlockTag,
    ))[0]);
    const feeBasisPoints = asBigInt((await decodedCall(
      localProvider,
      EXECUTION_ADDRESS,
      EXECUTION_INTERFACE,
      'feeBasisPoints',
      [],
      stateBlockTag,
    ))[0]);
    const minTransferAmount = asBigInt((await decodedCall(
      localProvider,
      EXECUTION_ADDRESS,
      EXECUTION_INTERFACE,
      'minTransferAmount',
      [],
      stateBlockTag,
    ))[0]);
    const transferPrecision = asBigInt((await decodedCall(
      localProvider,
      EXECUTION_ADDRESS,
      EXECUTION_INTERFACE,
      'transferPrecision',
      [],
      stateBlockTag,
    ))[0]);
    const paused = (await decodedCall(
      localProvider,
      EXECUTION_ADDRESS,
      EXECUTION_INTERFACE,
      'paused',
      [],
      stateBlockTag,
    ))[0];
    assert.equal(onchainUsdc, USDC_ADDRESS);
    assert.equal(paused, false);

    const ixExecution = loadCurrentIxExecution();
    const currentChainParams = ixExecution.getChainParams(Number(SOURCE_CHAIN_ID));
    assert.equal(ethers.getAddress(currentChainParams.usdcAddress), USDC_ADDRESS);
    assert.equal(ethers.getAddress(currentChainParams.contractAddress), EXECUTION_ADDRESS);
    const currentFee = ixExecution.calculateFee(PAYMENT_AMOUNT, Number(SOURCE_CHAIN_ID));
    const fee = asBigInt(currentFee.fee);
    const totalDebit = asBigInt(currentFee.total);
    // Expected fee basis points come from the canonical policy module, not a literal.
    const expectedFeeBasisPoints = BigInt(_sec.amountPolicy.feeBasisPoints);
    assert.equal(feeBasisPoints, expectedFeeBasisPoints);
    assert.equal(fee, (PAYMENT_AMOUNT * feeBasisPoints) / 10_000n);
    assert.ok(PAYMENT_AMOUNT >= minTransferAmount);
    assert.equal(PAYMENT_AMOUNT % transferPrecision, 0n);

    const accounts = await localProvider.request({ method: 'eth_accounts', params: [] });
    assert.ok(accounts.length >= 3, 'deterministic local accounts are required');
    const payer = ethers.getAddress(accounts[1]);
    const recipient = ethers.getAddress(accounts[2]);
    const excluded = new Set([
      payer.toLowerCase(),
      recipient.toLowerCase(),
      treasury.toLowerCase(),
      USDC_ADDRESS.toLowerCase(),
      EXECUTION_ADDRESS.toLowerCase(),
    ]);
    const holder = await discoverFundedPublicHolder(localProvider, excluded);

    await localProvider.request({
      method: 'hardhat_impersonateAccount',
      params: [holder.address],
    });
    try {
      await localProvider.request({
        method: 'hardhat_setBalance',
        params: [holder.address, bigintHex(LOCAL_NATIVE_GAS_BALANCE)],
      });
      const setupHash = await localProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: holder.address,
          to: USDC_ADDRESS,
          data: ERC20_INTERFACE.encodeFunctionData('transfer', [payer, HOLDER_FUNDING_AMOUNT]),
        }],
      });
      const setupReceipt = await waitForLocalReceipt(localProvider, setupHash);
      assertSuccessfulReceipt(setupReceipt, 'holder setup transfer');
    } finally {
      await localProvider.request({
        method: 'hardhat_stopImpersonatingAccount',
        params: [holder.address],
      });
    }

    await localProvider.request({
      method: 'hardhat_setBalance',
      params: [payer, bigintHex(LOCAL_NATIVE_GAS_BALANCE)],
    });
    assert.equal(await tokenBalance(localProvider, payer), HOLDER_FUNDING_AMOUNT);

    const snapshotId = await localProvider.request({ method: 'evm_snapshot', params: [] });
    let smoke;
    try {
      const payerBalanceBefore = await tokenBalance(localProvider, payer);
      const recipientBalanceBefore = await tokenBalance(localProvider, recipient);
      const treasuryBalanceBefore = await tokenBalance(localProvider, treasury);
      const allowanceBefore = await tokenAllowance(localProvider, payer, EXECUTION_ADDRESS);
      assert.ok(payerBalanceBefore >= totalDebit);
      assert.equal(allowanceBefore, 0n, 'smoke requires a zero initial allowance');

      const transactionRequests = ixExecution.buildAuthorizedTransactionRequests({
        chainId: Number(SOURCE_CHAIN_ID),
        sender: payer,
        recipient,
        totalDebitAtomic: totalDebit.toString(),
        recipientAmountAtomic: PAYMENT_AMOUNT.toString(),
        allowanceAtomic: allowanceBefore.toString(),
      });
      assert.equal(transactionRequests.length, 2);
      const approvalRequest = { ...transactionRequests[0] };
      const transferRequest = { ...transactionRequests[1] };
      assert.equal(ethers.getAddress(approvalRequest.to), USDC_ADDRESS);
      assert.equal(approvalRequest.data.slice(0, 10), ERC20_INTERFACE.getFunction('approve').selector);
      assert.equal(ethers.getAddress(transferRequest.to), EXECUTION_ADDRESS);
      assert.equal(
        transferRequest.data.slice(0, 10),
        EXECUTION_INTERFACE.getFunction('transferWithFee').selector,
      );

      const approvalEstimate = asBigInt(await localProvider.request({
        method: 'eth_estimateGas',
        params: [approvalRequest],
      }));
      const approvalHash = await localProvider.request({
        method: 'eth_sendTransaction',
        params: [approvalRequest],
      });
      const approvalReceipt = await waitForLocalReceipt(localProvider, approvalHash);
      assertSuccessfulReceipt(approvalReceipt, 'approval');
      const allowanceAfterApproval = await tokenAllowance(localProvider, payer, EXECUTION_ADDRESS);
      assert.ok(allowanceAfterApproval >= totalDebit);

      const transferEstimate = asBigInt(await localProvider.request({
        method: 'eth_estimateGas',
        params: [transferRequest],
      }));
      const transferHash = await localProvider.request({
        method: 'eth_sendTransaction',
        params: [transferRequest],
      });
      const transferReceipt = await waitForLocalReceipt(localProvider, transferHash);
      assertSuccessfulReceipt(transferReceipt, 'transferWithFee');

      const payerBalanceAfter = await tokenBalance(localProvider, payer);
      const recipientBalanceAfter = await tokenBalance(localProvider, recipient);
      const treasuryBalanceAfter = await tokenBalance(localProvider, treasury);
      const allowanceAfterTransfer = await tokenAllowance(localProvider, payer, EXECUTION_ADDRESS);
      const payerDelta = payerBalanceAfter - payerBalanceBefore;
      const recipientDelta = recipientBalanceAfter - recipientBalanceBefore;
      const treasuryDelta = treasuryBalanceAfter - treasuryBalanceBefore;
      assert.equal(payerDelta, -totalDebit);
      assert.equal(recipientDelta, PAYMENT_AMOUNT);
      assert.equal(treasuryDelta, fee);
      assert.equal(allowanceAfterTransfer, 0n);

      smoke = {
        payer,
        recipient,
        treasury,
        paymentAmount: PAYMENT_AMOUNT.toString(),
        fee: fee.toString(),
        totalDebit: totalDebit.toString(),
        approvalEstimate: approvalEstimate.toString(),
        approvalReceiptGasUsed: asBigInt(approvalReceipt.gasUsed).toString(),
        transferEstimate: transferEstimate.toString(),
        transferReceiptGasUsed: asBigInt(transferReceipt.gasUsed).toString(),
        payerDelta: payerDelta.toString(),
        recipientDelta: recipientDelta.toString(),
        treasuryDelta: treasuryDelta.toString(),
        allowanceBefore: allowanceBefore.toString(),
        allowanceAfterApproval: allowanceAfterApproval.toString(),
        allowanceAfterTransfer: allowanceAfterTransfer.toString(),
      };
    } finally {
      const reverted = await localProvider.request({ method: 'evm_revert', params: [snapshotId] });
      assert.equal(reverted, true, 'smoke snapshot must revert');
    }

    assert.equal(await tokenBalance(localProvider, payer), HOLDER_FUNDING_AMOUNT);
    assert.equal(await tokenAllowance(localProvider, payer, EXECUTION_ADDRESS), 0n);

    const result = {
      schemaVersion: 'implicitex-polygon-fork-sequential-smoke-checkpoint-draft.v1',
      toolVersions: {
        node: process.version,
        hardhat: require('hardhat/package.json').version,
        ethers: ethers.version,
      },
      providerSeparation: {
        upstreamEnvironmentPresent: true,
        upstreamAllowedMethods: ['eth_chainId', 'eth_getBlockByNumber'],
        upstreamObservedMethods: upstream.observedMethods,
        upstreamRejectedLocally: upstream.rejectedMethods,
        upstreamConfiguredForForkReadsOnly: true,
        localTransport: 'in-process Hardhat EIP-1193 provider',
        localNetworkName: network.name,
        localChainId: LOCAL_CHAIN_ID.toString(),
        localHardhatInstanceId: certificate.metadata.instanceId,
        localClientVersion: certificate.clientVersion,
        localExclusiveMethodsObserved: localProvider.exclusiveMethods,
      },
      fork: {
        sourceChainId: SOURCE_CHAIN_ID.toString(),
        sourceHeadNumber: asBigInt(sourceHead.number).toString(),
        sourceHeadHash: sourceHead.hash,
        sourceHeadTimestamp: asBigInt(sourceHead.timestamp).toString(),
        pinOffsetBlocks: PIN_OFFSET_BLOCKS.toString(),
        blockNumber: PINNED_FORK_BLOCK.number.toString(),
        blockHash: PINNED_FORK_BLOCK.hash,
        blockTimestamp: PINNED_FORK_BLOCK.timestamp.toString(),
        localForkBlockVerified: true,
        stateReadBlockNumber: asBigInt(localStateReadBlock.number).toString(),
        stateReadBlockWasEmptyLocalSuccessor: true,
      },
      deployedConfiguration: {
        usdc: {
          address: USDC_ADDRESS,
          runtimeCodeIdentity: usdcCodeIdentity,
          decimals: usdcDecimals.toString(),
          symbol: usdcSymbol,
          approveSelector: ERC20_INTERFACE.getFunction('approve').selector,
          ...usdcProxy,
        },
        execution: {
          address: EXECUTION_ADDRESS,
          runtimeCodeIdentity: executionCodeIdentity,
          transferWithFeeSelector: EXECUTION_INTERFACE.getFunction('transferWithFee').selector,
          usdc: onchainUsdc,
          treasury,
          feeBasisPoints: feeBasisPoints.toString(),
          minTransferAmount: minTransferAmount.toString(),
          transferPrecision: transferPrecision.toString(),
          paused,
          ...executionProxy,
        },
      },
      publicHolderDiscovery: {
        method: 'bounded deployed-USDC Transfer-log candidates, ranked deterministically, balance/code verified at pin',
        address: holder.address,
        balanceAtPinnedBlock: holder.balanceAtPinnedBlock.toString(),
        fromBlock: holder.discoveryFromBlock.toString(),
        toBlock: holder.discoveryToBlock.toString(),
        transferLogCount: holder.transferLogCount.toString(),
        candidateLimit: holder.candidateLimit.toString(),
        holderWasImpersonatedOnlyLocally: true,
        holderImpersonationStoppedAfterSetup: true,
        storageSlotsModified: false,
      },
      smoke,
      cleanup: {
        snapshotReverted: true,
        payerBalanceRestored: true,
        payerAllowanceRestored: true,
      },
      limitations: [
        'One representative sequential scenario is not a production gas bound.',
        'Nonzero-to-nonzero approval behavior was not exercised.',
        'No full scenario matrix or production gas policy was evaluated.',
      ],
      secrets: {
        rpcUrlIncluded: false,
        providerApiKeyIncluded: false,
        privateKeyIncluded: false,
        shellEnvironmentIncluded: false,
      },
    };

    console.log(`POLYGON_FORK_SMOKE_RESULT=${JSON.stringify(result)}`);
  });
});
