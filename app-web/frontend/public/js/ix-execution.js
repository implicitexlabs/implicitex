/**
 * ix-execution.js — Shared execution service for ImplicitEx transfers.
 *
 * Shared execution authority. Coin Card and Transfer Portal submit verified
 * intent through executeTransfer() and render normalized ExecutionResult values.
 * Provider calls, approval sequencing, transfer submission, and receipt polling
 * stay below this boundary.
 *
 * Exposes window.IX_EXECUTION with:
 *   executeTransfer(request, hooks?) → Promise<execution result>
 *   toRawUsdc(floatVal)           → BigInt
 *   calculateFee(rawAmount, chainId, feeBps?) → { fee, total }
 *   readWalletSnapshot(account, chainId, provider?) → Promise<snapshot|null>
 *
 * Provider resolution — execute-authorized path only:
 *   request.provider         — the active EIP-1193 provider (resolved at connect time)
 *   request.snapshotProvider — the provider used to read the wallet snapshot
 *
 *   If request.provider !== request.snapshotProvider the call is rejected with
 *   PROVIDER_MISMATCH before the proof is consumed.
 *   If request.provider is absent the path falls back to window.ethereum (injected).
 *
 *   The Transfer Portal uses action:'execute' which continues to use window.ethereum.
 *   No change to Transfer Portal behavior.
 *
 * Self-contained IIFE. No imports. No dependency on chains.js or wallet.js.
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Chain config — polygon mainnet only (card is isolated from chains.js)
   * ---------------------------------------------------------------- */
  var CHAINS = {
    137: {
      chainId:     137,
      chainHex:    '0x89',
      name:        'Polygon',
      rpcUrl:      'https://polygon-bor-rpc.publicnode.com',
      explorerUrl: 'https://polygonscan.com',
      usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      contractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
      nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
      feeBps:      100,   /* 1% platform fee */
    },
  };

  /* ----------------------------------------------------------------
   * ABI encoding helpers
   * ---------------------------------------------------------------- */

  /**
   * Pad a hex string (without 0x prefix) to 32 bytes (64 hex chars), left-padded with zeros.
   */
  function padHex32(hex) {
    var s = hex.replace(/^0x/i, '');
    while (s.length < 64) s = '0' + s;
    return s;
  }

  /**
   * Encode a uint256 BigInt as a 32-byte padded hex string.
   */
  function encodeUint256(bigintVal) {
    return padHex32(bigintVal.toString(16));
  }

  /**
   * Encode an Ethereum address as a 32-byte padded hex string.
   */
  function encodeAddress(addr) {
    return padHex32(addr.replace(/^0x/i, '').toLowerCase());
  }

  /**
   * Encode calldata for: approve(address spender, uint256 amount)
   * Selector: 0x095ea7b3
   */
  function encodeApprove(spender, amount) {
    return '0x095ea7b3' + encodeAddress(spender) + encodeUint256(amount);
  }

  /**
   * Encode calldata for: transferWithFee(address recipient, uint256 amount)
   * Selector: 0x08acece2
   */
  function encodeTransferWithFee(recipient, amount) {
    return '0x08acece2' + encodeAddress(recipient) + encodeUint256(amount);
  }

  /* ----------------------------------------------------------------
   * toRawUsdc — convert float to BigInt with 6 decimal places
   * Avoids float precision loss by rounding at the micro-USDC level.
   * ---------------------------------------------------------------- */
  function toRawUsdc(floatVal) {
    var rounded = Math.round(floatVal * 1e6);
    return BigInt(rounded);
  }

  /* ----------------------------------------------------------------
   * chainConfig — return config for a given chainId or null
   * ---------------------------------------------------------------- */
  function chainConfig(chainId) {
    return CHAINS[chainId] || null;
  }

  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { freezeDeep(value[key]); });
    return Object.freeze(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function canonicalizeValue(value) {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString(10);
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error('unsupported number in canonical payload');
      return String(value);
    }
    if (Array.isArray(value)) return value.map(canonicalizeValue);
    if (!isPlainObject(value)) throw new Error('unsupported non-plain object in canonical payload');
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      var next = value[key];
      if (typeof next === 'undefined' || typeof next === 'function' || typeof next === 'symbol') {
        throw new Error('unsupported canonical field value');
      }
      out[key] = canonicalizeValue(next);
    });
    return out;
  }

  function canonicalizeJson(value) {
    return JSON.stringify(canonicalizeValue(value));
  }

  function normalizeAtomicQuantity(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
    return null;
  }

  function getGasPolicyApi() {
    var external = window.IX_EXECUTION_GAS_POLICY;
    if (
      external &&
      typeof external.resolveGasPolicy === 'function' &&
      typeof external.validateGasPolicy === 'function' &&
      typeof external.getPolicySecurityPayload === 'function' &&
      typeof external.getCanonicalPolicyBinding === 'function' &&
      typeof external.getGasLimit === 'function' &&
      typeof external.validateExecutionDomain === 'function'
    ) {
      return external;
    }
    return null;
  }

  function loadValidatedGasPolicy(policyId) {
    var gasPolicyApi = getGasPolicyApi();
    if (!gasPolicyApi) {
      return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
    }
    var resolved;
    var validation;
    var payload;
    var binding;
    try {
      resolved = gasPolicyApi.resolveGasPolicy(policyId);
      if (!resolved || !resolved.security || resolved.security.policyId !== policyId) {
        return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
      }
      validation = gasPolicyApi.validateGasPolicy(policyId);
      if (!validation || validation.valid !== true) {
        return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
      }
      payload = gasPolicyApi.getPolicySecurityPayload(policyId);
      if (!payload || payload.policyId !== policyId) {
        return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
      }
      binding = gasPolicyApi.getCanonicalPolicyBinding(policyId);
      if (typeof binding !== 'string' || !binding.length) {
        return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
      }
    } catch (error) {
      return { ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' };
    }
    return {
      ok: true,
      api: gasPolicyApi,
      policy: resolved,
      security: payload,
      binding: binding,
    };
  }

  function providerUnavailableError() {
    var err = new Error('No wallet detected');
    err.code = 'NO_WALLET';
    return err;
  }

  function providerErrorCode(err) {
    return err && (
      err.code ||
      (err.info && err.info.error && err.info.error.code) ||
      (err.data && err.data.originalError && err.data.originalError.code)
    );
  }

  function providerErrorMessage(err, fallback) {
    return err && (
      err.message ||
      (err.info && err.info.error && err.info.error.message) ||
      (err.data && err.data.message)
    ) || fallback || 'Execution failed';
  }

  function walletBusyResult(sender) {
    return makeResult('wallet-busy', {
      sender: sender || null,
      error:  { code: 'WALLET_BUSY', message: 'Wallet already has a pending request.' },
    });
  }

  function ensureProvider() {
    if (!window.ethereum) throw providerUnavailableError();
  }

  /* ----------------------------------------------------------------
   * resolveActiveProvider — return an EIP-1193 provider for the
   * execute-authorized path.
   *
   * Preference order (execute-authorized only):
   *   1. caller-supplied provider (request.provider)
   *   2. window.ethereum (injected fallback when no explicit provider given)
   *   3. null — caller must handle wallet-missing
   *
   * The Transfer Portal (action:'execute') continues to use window.ethereum
   * directly via ensureProvider(). This helper is only called from the
   * execute-authorized handler.
   * ---------------------------------------------------------------- */
  function resolveActiveProvider(requestProvider) {
    if (requestProvider && typeof requestProvider.request === 'function') {
      return requestProvider;
    }
    return window.ethereum || null;
  }

  /* ----------------------------------------------------------------
   * Provider-scoped helpers — used only in the execute-authorized path.
   * All accept an explicit provider rather than reading window.ethereum.
   * ---------------------------------------------------------------- */

  function getCurrentAccountVia(provider) {
    return provider.request({ method: 'eth_accounts' })
      .then(function (accounts) {
        return (accounts && accounts.length) ? accounts[0] : null;
      });
  }

  function getChainIdVia(provider) {
    return provider.request({ method: 'eth_chainId' })
      .then(function (hex) { return parseInt(hex, 16); });
  }

  function approveVia(provider, chainId, sender, totalRaw) {
    var cfg = CHAINS[chainId];
    if (!cfg) return Promise.reject(new Error('Unsupported chainId: ' + chainId));
    var data = encodeApprove(cfg.contractAddress, totalRaw);
    return provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: sender, to: cfg.usdcAddress, data: data }],
    });
  }

  function transferWithFeeVia(provider, chainId, sender, recipient, amountRaw) {
    var cfg = CHAINS[chainId];
    if (!cfg) return Promise.reject(new Error('Unsupported chainId: ' + chainId));
    var data = encodeTransferWithFee(recipient, amountRaw);
    return provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: sender, to: cfg.contractAddress, data: data }],
    });
  }

  function waitForReceiptVia(provider, hash) {
    var MAX_ATTEMPTS = 90;
    var INTERVAL_MS  = 2000;
    var attempt = 0;
    return new Promise(function (resolve, reject) {
      function poll() {
        attempt++;
        provider.request({ method: 'eth_getTransactionReceipt', params: [hash] })
          .then(function (receipt) {
            if (receipt) { resolve(receipt); return; }
            if (attempt >= MAX_ATTEMPTS) {
              reject(new Error('Transaction not mined after ' + MAX_ATTEMPTS + ' attempts'));
              return;
            }
            setTimeout(poll, INTERVAL_MS);
          })
          .catch(function (err) { reject(err); });
      }
      poll();
    });
  }

  /* ----------------------------------------------------------------
   * calculateFee — single authority for platform fee math
   *
   * rawAmount  BigInt  USDC in base units (6 decimals)
   * chainId    number  numeric chain ID
   * feeBps     number? optional override (manifest-scoped rate); if
   *                    omitted the chain's default feeBps is used
   *
   * Returns { fee: BigInt, total: BigInt } where total = rawAmount + fee.
   * Integer division throughout — no float rounding ambiguity.
   *
   * Fee is 1% of rawAmount, capped at 10 USDC (10_000_000 atomic units).
   * Must mirror the calculateFee() function in implicitex_transfer.sol.
   * ---------------------------------------------------------------- */
  var MAX_FEE = 10_000_000n; // 10 USDC (6 decimals) — mirrors contract MAX_FEE

  function calculateFee(rawAmount, chainId, feeBps) {
    var cfg = CHAINS[chainId];
    var bps = BigInt(feeBps != null ? feeBps : ((cfg && cfg.feeBps != null) ? cfg.feeBps : 100));
    var percentageFee = (rawAmount * bps) / 10000n;
    var fee = percentageFee > MAX_FEE ? MAX_FEE : percentageFee;
    return { fee: fee, total: rawAmount + fee };
  }

  /* ----------------------------------------------------------------
   * connectWallet — request wallet accounts
   * ---------------------------------------------------------------- */
  function connectWallet() {
    ensureProvider();
    return window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(function (accounts) {
        if (!accounts || !accounts.length) throw new Error('No accounts returned');
        return accounts[0];
      });
  }

  /* ----------------------------------------------------------------
   * getChainId — return current chain as a number
   * ---------------------------------------------------------------- */
  function getChainId() {
    ensureProvider();
    return window.ethereum.request({ method: 'eth_chainId' })
      .then(function (hex) {
        return parseInt(hex, 16);
      });
  }

  /* ----------------------------------------------------------------
   * switchChain — switch to chainId, adding the chain if unknown (4902)
   * ---------------------------------------------------------------- */
  function switchChain(chainId) {
    ensureProvider();
    var cfg = CHAINS[chainId];
    var hexId = cfg ? cfg.chainHex : ('0x' + chainId.toString(16));

    return window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexId }],
    }).catch(function (err) {
      /* 4902 = chain not added to wallet */
      if (err && err.code === 4902 && cfg) {
        return window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:           cfg.chainHex,
            chainName:         cfg.name,
            rpcUrls:           [cfg.rpcUrl],
            blockExplorerUrls: [cfg.explorerUrl],
            nativeCurrency:    cfg.nativeCurrency,
          }],
        });
      }
      throw err;
    });
  }

  /* ----------------------------------------------------------------
   * approve — approve the ImplicitEx contract to spend totalRaw USDC
   * ---------------------------------------------------------------- */
  function approve(chainId, sender, totalRaw) {
    ensureProvider();
    var cfg = CHAINS[chainId];
    if (!cfg) return Promise.reject(new Error('Unsupported chainId: ' + chainId));

    var data = encodeApprove(cfg.contractAddress, totalRaw);

    return window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: sender,
        to:   cfg.usdcAddress,
        data: data,
      }],
    });
  }

  /* ----------------------------------------------------------------
   * transferWithFee — call ImplicitEx contract transferWithFee
   * ---------------------------------------------------------------- */
  function transferWithFee(chainId, sender, recipient, amountRaw) {
    ensureProvider();
    var cfg = CHAINS[chainId];
    if (!cfg) return Promise.reject(new Error('Unsupported chainId: ' + chainId));

    var data = encodeTransferWithFee(recipient, amountRaw);

    return window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: sender,
        to:   cfg.contractAddress,
        data: data,
      }],
    });
  }

  /* ----------------------------------------------------------------
   * waitForReceipt — poll eth_getTransactionReceipt every 2s
   * Gives up after 90 attempts (3 minutes).
   * ---------------------------------------------------------------- */
  function waitForReceipt(hash) {
    ensureProvider();
    var MAX_ATTEMPTS = 90;
    var INTERVAL_MS  = 2000;
    var attempt = 0;

    return new Promise(function (resolve, reject) {
      function poll() {
        attempt++;
        window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [hash],
        }).then(function (receipt) {
          if (receipt) {
            resolve(receipt);
            return;
          }
          if (attempt >= MAX_ATTEMPTS) {
            reject(new Error('Transaction not mined after ' + MAX_ATTEMPTS + ' attempts'));
            return;
          }
          setTimeout(poll, INTERVAL_MS);
        }).catch(function (err) {
          reject(err);
        });
      }
      poll();
    });
  }

  function receiptSucceeded(receipt) {
    if (!receipt || receipt.status == null) return false;
    return parseInt(receipt.status, 16) === 1 || Number(receipt.status) === 1;
  }

  /* ----------------------------------------------------------------
   * chainIdentity — public chain descriptor (name + id only)
   * Internal config (RPC, contract addresses) must not leave the service.
   * ---------------------------------------------------------------- */
  function chainIdentity(cfg) {
    if (!cfg) return null;
    return { name: cfg.name, chainId: cfg.chainId };
  }

  /* ----------------------------------------------------------------
   * makeResult — canonical ExecutionResult factory
   *
   * Every exit from executeTransfer goes through here. All four
   * non-status fields are always present; null where not applicable.
   * Consumers check status, then read the relevant field — no
   * conditional property existence.
   * ---------------------------------------------------------------- */
  function makeResult(status, fields) {
    return {
      status:  status,
      sender:  (fields && fields.sender  != null) ? fields.sender  : null,
      chain:   (fields && fields.chain   != null) ? fields.chain   : null,
      receipt: (fields && fields.receipt != null) ? fields.receipt : null,
      error:   (fields && fields.error   != null) ? fields.error   : null,
    };
  }

  /* ----------------------------------------------------------------
   * normalizeBlockNumber — coerce hex or decimal block number to integer
   * ---------------------------------------------------------------- */
  function normalizeBlockNumber(raw) {
    if (raw == null) return null;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.startsWith('0x')) return parseInt(raw, 16);
    return parseInt(raw, 10) || null;
  }

  /* ----------------------------------------------------------------
   * buildReceipt — construct a stable, serializable execution receipt
   *
   * All consumer-facing receipt fields live here. Raw provider receipts
   * (eth_getTransactionReceipt responses) must not leave this function.
   * ---------------------------------------------------------------- */
  function buildReceipt(request, approvalHash, transferHash, transferReceipt, cfg) {
    var amount = request.amountAtomic != null
      ? atomicToUsdcDecimalString(request.amountAtomic)
      : (request.amount != null ? Number(request.amount) : null);
    var total = request.totalAtomic != null
      ? atomicToUsdcDecimalString(request.totalAtomic)
      : (request.total != null ? Number(request.total) : null);
    var fee = request.feeAtomic != null
      ? atomicToUsdcDecimalString(request.feeAtomic)
      : (request.fee != null
        ? Number(request.fee)
        : (amount != null && total != null && typeof amount === 'number' && typeof total === 'number'
          ? total - amount
          : null));

    return {
      schema:       'implicitex.receipt.v1',
      txHash:       transferHash,
      approvalHash: approvalHash,
      sender:       request.sender    || null,
      recipient:    request.recipient || null,
      amount:       amount,
      fee:          fee,
      total:        total,
      token:        (request.token || 'USDC').toUpperCase(),
      chainId:      request.chainId   || null,
      chainName:    cfg ? cfg.name    : null,
      blockNumber:  normalizeBlockNumber(transferReceipt && transferReceipt.blockNumber),
      explorerUrl:  cfg ? cfg.explorerUrl + '/tx/' + transferHash : null,
      source:       request.source    || null,
      traceId:      request.traceId   || null,
      confirmedAt:  Date.now(),
    };
  }

  function executeTransferStep(chainId, request, approvalHash, amountRaw, cfg, hooks, onBroadcast) {
    if (hooks.onTransferRequested) hooks.onTransferRequested();
    return transferWithFee(chainId, request.sender, request.recipient, amountRaw)
      .then(function (transferHash) {
        if (onBroadcast) onBroadcast(transferHash);
        if (hooks.onTransferSubmitted) hooks.onTransferSubmitted(transferHash);
        return waitForReceipt(transferHash)
          .then(function (transferReceipt) {
            if (!receiptSucceeded(transferReceipt)) {
              var transferErr = { code: 'TRANSFER_FAILED', message: 'Transfer transaction failed' };
              if (hooks.onFailed) hooks.onFailed(transferErr);
              return makeResult('failed', { sender: request.sender, error: transferErr });
            }
            var receipt = buildReceipt(request, approvalHash, transferHash, transferReceipt, cfg);
            var confirmed = makeResult('confirmed', { sender: request.sender, receipt: receipt });
            if (hooks.onConfirmed) hooks.onConfirmed(confirmed);
            return confirmed;
          })
          .catch(function (receiptErr) {
            var ambiguousErr = {
              code:    'RECEIPT_UNAVAILABLE',
              message: receiptErr && receiptErr.message || 'Transfer broadcast but confirmation could not be verified.',
              txHash:  transferHash,
              explorerUrl: cfg.explorerUrl + '/tx/' + transferHash,
            };
            if (hooks.onFailed) hooks.onFailed(ambiguousErr);
            return makeResult('outcome-unknown', { sender: request.sender, error: ambiguousErr });
          });
      });
  }

  /* Provider-aware variant used only in the execute-authorized path. */
  function executeTransferStepVia(provider, chainId, request, approvalHash, amountRaw, cfg, hooks, onBroadcast) {
    if (hooks.onTransferRequested) hooks.onTransferRequested();
    return transferWithFeeVia(provider, chainId, request.sender, request.recipient, amountRaw)
      .then(function (transferHash) {
        if (onBroadcast) onBroadcast(transferHash);
        if (hooks.onTransferSubmitted) hooks.onTransferSubmitted(transferHash);
        return waitForReceiptVia(provider, transferHash)
          .then(function (transferReceipt) {
            if (!receiptSucceeded(transferReceipt)) {
              var transferErr = { code: 'TRANSFER_FAILED', message: 'Transfer transaction failed' };
              if (hooks.onFailed) hooks.onFailed(transferErr);
              return makeResult('failed', { sender: request.sender, error: transferErr });
            }
            var receipt = buildReceipt(request, approvalHash, transferHash, transferReceipt, cfg);
            var confirmed = makeResult('confirmed', { sender: request.sender, receipt: receipt });
            if (hooks.onConfirmed) hooks.onConfirmed(confirmed);
            return confirmed;
          })
          .catch(function (receiptErr) {
            var ambiguousErr = {
              code:    'RECEIPT_UNAVAILABLE',
              message: receiptErr && receiptErr.message || 'Transfer broadcast but confirmation could not be verified.',
              txHash:  transferHash,
              explorerUrl: cfg.explorerUrl + '/tx/' + transferHash,
            };
            if (hooks.onFailed) hooks.onFailed(ambiguousErr);
            return makeResult('outcome-unknown', { sender: request.sender, error: ambiguousErr });
          });
      });
  }

  /* ----------------------------------------------------------------
   * getCurrentAccount — silently read connected accounts (no popup)
   * ---------------------------------------------------------------- */
  function getCurrentAccount() {
    ensureProvider();
    return window.ethereum.request({ method: 'eth_accounts' })
      .then(function (accounts) {
        return (accounts && accounts.length) ? accounts[0] : null;
      });
  }

  /* ----------------------------------------------------------------
   * getChainParams — expose public chain parameters needed for transfer
   * intent construction. Internal config (RPC URL, fee bps) stays private.
   * ---------------------------------------------------------------- */
  function getChainParams(chainId) {
    var cfg = CHAINS[chainId];
    if (!cfg) return null;
    return Object.freeze({
      usdcAddress:     cfg.usdcAddress,
      contractAddress: cfg.contractAddress,
    });
  }

  /* ----------------------------------------------------------------
   * readWalletSnapshot — read USDC balance and allowance via eth_call.
   * Returns a frozen snapshot at the moment of the call, or null on
   * any failure (provider missing, unsupported chain, RPC error).
   *
   * provider  — optional EIP-1193 provider; falls back to window.ethereum
   *             when absent. Coin Card passes its resolved provider so the
   *             snapshot and execution always use the same session.
   *
   * balanceOf(address)       selector: 0x70a08231
   * allowance(address,address) selector: 0xdd62ed3e
   * ---------------------------------------------------------------- */
  function readWalletSnapshot(account, chainId, provider) {
    var p = (provider && typeof provider.request === 'function') ? provider : window.ethereum;
    if (!p) return Promise.resolve(null);
    var cfg = CHAINS[chainId];
    if (!cfg) return Promise.resolve(null);

    var balanceData   = '0x70a08231' + encodeAddress(account);
    var allowanceData = '0xdd62ed3e' + encodeAddress(account) + encodeAddress(cfg.contractAddress);

    return p.request({
      method: 'eth_call',
      params: [{ to: cfg.usdcAddress, data: balanceData }, 'latest'],
    }).then(function (balanceHex) {
      var balanceBig = (balanceHex && balanceHex !== '0x') ? BigInt(balanceHex) : 0n;
      return p.request({
        method: 'eth_call',
        params: [{ to: cfg.usdcAddress, data: allowanceData }, 'latest'],
      }).then(function (allowanceHex) {
        var allowanceBig = (allowanceHex && allowanceHex !== '0x') ? BigInt(allowanceHex) : 0n;
        return Object.freeze({
          account:         account,
          chainId:         chainId,
          providerReady:   true,
          balanceAtomic:   String(balanceBig),
          allowanceAtomic: String(allowanceBig),
        });
      });
    }).catch(function () { return null; });
  }

  function normalizeHexQuantity(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
    if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
    return null;
  }

  function atomicToUsdcDecimalString(value) {
    var atomic = normalizeAtomicQuantity(value);
    if (atomic == null) return null;
    var whole = atomic / 1000000n;
    var fraction = atomic % 1000000n;
    if (fraction === 0n) return whole.toString(10);
    var fractionString = fraction.toString(10);
    while (fractionString.length < 6) fractionString = '0' + fractionString;
    return whole.toString(10) + '.' + fractionString;
  }

  function deriveCanonicalExecutionPlan(request) {
    return request && request.requiresApproval === false ? 'TRANSFER_ONLY' : 'APPROVE_THEN_TRANSFER';
  }

  function buildAuthorizedTransactionRequests(input) {
    input = input || {};
    var cfg = CHAINS[input.chainId];
    if (!cfg) return null;
    if (!input.sender || !input.recipient || input.totalDebitAtomic == null || input.recipientAmountAtomic == null) return null;
    var totalDebit = BigInt(input.totalDebitAtomic);
    var recipientAmount = BigInt(input.recipientAmountAtomic);
    var allowance = BigInt(input.allowanceAtomic || '0');
    var gasPolicyId = input.gasPolicyId || null;
    if (gasPolicyId) {
      var gasPolicy = loadValidatedGasPolicy(gasPolicyId);
      if (!gasPolicy.ok) return null;
      var canonicalPlan = allowance < totalDebit ? 'APPROVE_THEN_TRANSFER' : 'TRANSFER_ONLY';
      if (input.executionPlan && input.executionPlan !== canonicalPlan) return null;
      var expectedFeeAtomic = (recipientAmount * BigInt(gasPolicy.security.amountPolicy.feeBasisPoints)) / 10000n;
      var expectedTotalAtomic = recipientAmount + expectedFeeAtomic;
      if (input.platformFeeAtomic != null) {
        var suppliedFeeAtomic = normalizeAtomicQuantity(input.platformFeeAtomic);
        if (suppliedFeeAtomic == null || suppliedFeeAtomic !== expectedFeeAtomic) return null;
      }
      if (input.totalDebitAtomic != null && totalDebit !== expectedTotalAtomic) return null;
      var validation;
      try {
        validation = gasPolicy.api.validateExecutionDomain(gasPolicyId, {
          executionPlan: canonicalPlan,
          amountAtomic: recipientAmount,
          totalDebitAtomic: totalDebit,
          platformFeeAtomic: expectedFeeAtomic,
        });
      } catch (error) {
        return null;
      }
      if (!validation || validation.ok !== true) return null;
    }
    var txs = [];
    if (allowance < totalDebit) {
      txs.push({
        from: input.sender,
        to: cfg.usdcAddress,
        data: encodeApprove(cfg.contractAddress, totalDebit),
      });
    }
    txs.push({
      from: input.sender,
      to: cfg.contractAddress,
      data: encodeTransferWithFee(input.recipient, recipientAmount),
    });
    return Object.freeze(txs.map(function (tx) { return Object.freeze(tx); }));
  }

  function readFeePerGas(provider) {
    function readGasPrice() {
      return provider.request({ method: 'eth_gasPrice' })
        .then(function (gasPrice) {
          var parsed = normalizeHexQuantity(gasPrice);
          return parsed != null && parsed > 0n ? parsed : null;
        })
        .catch(function () { return null; });
    }
    return provider.request({ method: 'eth_maxPriorityFeePerGas' })
      .then(function (priorityFee) {
        var priority = normalizeHexQuantity(priorityFee);
        if (priority == null || priority <= 0n) return readGasPrice();
        return provider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })
          .then(function (block) {
            var base = block && normalizeHexQuantity(block.baseFeePerGas);
            if (base == null || base <= 0n) return readGasPrice();
            return (base * 2n) + priority;
          }).catch(readGasPrice);
      })
      .catch(readGasPrice);
  }

  function estimateNativeGasRequirement(provider, input) {
    if (!provider || typeof provider.request !== 'function') {
      return Promise.resolve(Object.freeze({ status: 'UNAVAILABLE', reason: 'provider-unavailable' }));
    }
    var txs;
    try {
      txs = buildAuthorizedTransactionRequests(input);
    } catch (error) {
      return Promise.resolve(Object.freeze({ status: 'UNAVAILABLE', reason: 'plan-invalid' }));
    }
    if (!txs || !txs.length) {
      return Promise.resolve(Object.freeze({ status: 'UNAVAILABLE', reason: 'plan-unavailable' }));
    }
    return readFeePerGas(provider).then(function (feePerGas) {
      if (feePerGas == null) return Object.freeze({ status: 'UNAVAILABLE', reason: 'fee-data-unavailable' });
      var totalGas = 0n;
      var approvalRequired = txs.length > 1;
      var sequence = Promise.resolve();
      txs.forEach(function (tx) {
        if (approvalRequired && tx !== txs[0]) return;
        sequence = sequence.then(function () {
          return provider.request({ method: 'eth_estimateGas', params: [tx] })
            .then(function (gas) {
              var parsed = normalizeHexQuantity(gas);
              if (parsed == null || parsed <= 0n) throw new Error('gas-estimate-unavailable');
              totalGas += parsed;
            });
        });
      });
      return sequence.then(function () {
        if (approvalRequired) {
          return Object.freeze({
            status: 'UNAVAILABLE',
            reason: 'post-approval-transfer-gas-bound-unavailable',
            approvalGasLimit: totalGas.toString(10),
            transactionCount: txs.length,
          });
        }
        var required = totalGas * feePerGas;
        return Object.freeze({
          status: 'AVAILABLE',
          transactionCount: txs.length,
          gasLimitTotal: totalGas.toString(10),
          feePerGasAtomic: feePerGas.toString(10),
          nativeGasRequiredAtomic: required.toString(10),
        });
      }).catch(function () {
        return Object.freeze({ status: 'UNAVAILABLE', reason: 'gas-estimate-unavailable' });
      });
    });
  }

  /* ----------------------------------------------------------------
   * consumedAuthorizationProofs — one-shot consumption registry.
   * A proof is marked consumed before the first wallet interaction.
   * Wallet rejections still consume the proof — the caller must
   * request fresh authorization for the next attempt.
   * ---------------------------------------------------------------- */
  var consumedAuthorizationProofs = new WeakSet();

  function executeTransfer(request, hooks) {
    request = request || {};
    hooks = hooks || {};
    var action = request.action || 'execute';
    /* Normalize chainId: registry records serialize it as a JSON string ('137').
     * Convert to a number so provider comparisons (currentChainId !== chainId) are
     * type-safe. Null/undefined pass through unchanged → chainConfig returns null. */
    var chainId = (request.chainId != null) ? Number(request.chainId) : request.chainId;
    var cfg = chainConfig(chainId);

    /* execute-authorized derives its chain authority from proof.chainId, not request.chainId.
     * Skip the early chain guard for that path; it validates chain internally. */
    if (action !== 'execute-authorized' && !cfg) {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'UNSUPPORTED_CHAIN', message: 'Unsupported chainId: ' + chainId },
      }));
    }

    if (action === 'prepare') {
      if (hooks.onWalletRequested) hooks.onWalletRequested();
      return connectWallet()
        .then(function (address) {
          if (hooks.onWalletConnected) hooks.onWalletConnected(address);
          return getChainId().then(function (currentChainId) {
            if (currentChainId !== chainId) {
              if (hooks.onNetworkMismatch) hooks.onNetworkMismatch(currentChainId, chainId);
              return makeResult('wrong-network', { sender: address, chain: chainIdentity(cfg) });
            }
            return makeResult('ready-to-send', { sender: address, chain: chainIdentity(cfg) });
          });
        })
        .catch(function (err) {
          var code = providerErrorCode(err);
          if (code === 'NO_WALLET') return makeResult('wallet-missing');
          if (code === 4001)        return makeResult('wallet-rejected');
          if (code === -32002)      return walletBusyResult();
          return makeResult('failed', { error: { code: code, message: providerErrorMessage(err) } });
        });
    }

    if (action === 'switch-network') {
      return switchChain(chainId)
        .then(function () {
          return makeResult('ready-to-send', { chain: chainIdentity(cfg) });
        })
        .catch(function (err) {
          var code = providerErrorCode(err);
          if (code === 4001) {
            return makeResult('wrong-network', { chain: chainIdentity(cfg) });
          }
          if (code === -32002) return walletBusyResult();
          return makeResult('failed', { error: { code: code, message: providerErrorMessage(err) } });
        });
    }

    if (action === 'execute-authorized') {
      /* ----------------------------------------------------------------
       * Coin Card authorized execution path.
       *
       * Requires a branded IX_COIN_CARD_EXECUTION_AUTHORIZATION result:
       *   1. Validate proof via isExecutionAuthorizedResult (WeakSet check).
       *   2. Provider continuity: if request.snapshotProvider is supplied it
       *      must be the same object as request.provider; reject with
       *      PROVIDER_MISMATCH before consuming the proof.
       *   3. Consume before any wallet interaction (one-shot doctrine).
       *   4. Resolve the active provider (request.provider → window.ethereum).
       *   5. TOCTOU: silently re-read account and chainId via resolved provider.
       *   6. Use pinned values from proof for approval and transfer.
       *   7. Transfer Portal uses action:'execute' — this path is untouched.
       * ---------------------------------------------------------------- */
      var authModule = window.IX_COIN_CARD_EXECUTION_AUTHORIZATION || null;
      if (!authModule || typeof authModule.isExecutionAuthorizedResult !== 'function') {
        return Promise.resolve(makeResult('failed', {
          error: { code: 'AUTH_MODULE_UNAVAILABLE', message: 'Execution authorization module not available.' },
        }));
      }

      var proof = request.authorizationProof;

      if (!authModule.isExecutionAuthorizedResult(proof)) {
        return Promise.resolve(makeResult('failed', {
          error: { code: 'AUTHORIZATION_PROOF_INVALID', message: 'Authorization proof is missing, invalid, or blocked.' },
        }));
      }

      if (consumedAuthorizationProofs.has(proof)) {
        return Promise.resolve(makeResult('failed', {
          error: { code: 'AUTHORIZATION_PROOF_CONSUMED', message: 'Authorization proof has already been used.' },
        }));
      }
      /* A valid execution authorization is one-shot once submitted to the authorized
       * execution boundary. Provider discontinuity requires fresh snapshot authority. */
      consumedAuthorizationProofs.add(proof);

      /* Provider continuity check — after consuming the proof.
       * If the caller supplies both provider and snapshotProvider they must be
       * the same object (same session). A mismatch means the provider changed
       * between snapshot and execution, which must be rejected immediately. */
      var execProvider     = request.provider     || null;
      var snapshotProvider = request.snapshotProvider || null;
      if (execProvider && snapshotProvider && execProvider !== snapshotProvider) {
        return Promise.resolve(makeResult('failed', {
          error: { code: 'PROVIDER_MISMATCH', message: 'Execution provider does not match the provider used for the wallet snapshot.' },
        }));
      }

      /* Resolve the provider to use for all wallet operations in this path.
       * Preference: request.provider → window.ethereum → wallet-missing. */
      var activeProvider = resolveActiveProvider(execProvider);
      if (!activeProvider) {
        return Promise.resolve(makeResult('wallet-missing'));
      }

      var authorizedCfg = chainConfig(proof.chainId);
      if (!authorizedCfg) {
        return Promise.resolve(makeResult('failed', {
          error: { code: 'UNSUPPORTED_CHAIN', message: 'Unsupported chainId: ' + proof.chainId },
        }));
      }

      /* TOCTOU: silent account/chain check via the resolved provider — no wallet popup. */
      return getCurrentAccountVia(activeProvider)
        .then(function (currentAccount) {
          return getChainIdVia(activeProvider).then(function (currentChainId) {
            if (!currentAccount || currentAccount.toLowerCase() !== proof.sender.toLowerCase()) {
              return makeResult('failed', {
                error: { code: 'TOCTOU_ACCOUNT_DRIFT', message: 'Wallet account changed since authorization.' },
              });
            }
            if (currentChainId !== proof.chainId) {
              return makeResult('failed', {
                error: { code: 'TOCTOU_CHAIN_DRIFT', message: 'Network changed since authorization.' },
              });
            }

            var totalDebit    = BigInt(proof.totalDebitAtomic);
            var recipientAmt  = BigInt(proof.recipientAmountAtomic);
            var platformFee   = BigInt(proof.platformFeeAtomic);

            /* Construct a request-compatible object for receipt building. */
            var authorizedRequest = {
              sender:    proof.sender,
              recipient: proof.recipient,
              amount:    Number(recipientAmt) / 1e6,
              fee:       Number(platformFee)  / 1e6,
              total:     Number(totalDebit)   / 1e6,
              chainId:   proof.chainId,
              token:     request.token   || 'USDC',
              source:    request.source  || null,
              traceId:   request.traceId || null,
            };

            var transferSubmitted = false;
            var submittedHash     = null;
            var onBroadcast = function (hash) {
              transferSubmitted = true;
              submittedHash     = hash;
            };

            if (proof.executionPlan === 'TRANSFER_ONLY') {
              /* Allowance already sufficient — skip approval. */
              return executeTransferStepVia(
                activeProvider, proof.chainId, authorizedRequest, null, recipientAmt,
                authorizedCfg, hooks, onBroadcast
              );
            }

            /* APPROVE_THEN_TRANSFER — approval uses pinned totalDebit. */
            if (hooks.onApprovalRequested) hooks.onApprovalRequested();
            return approveVia(activeProvider, proof.chainId, proof.sender, totalDebit)
              .then(function (approvalHash) {
                if (hooks.onApprovalSubmitted) hooks.onApprovalSubmitted(approvalHash);
                return waitForReceiptVia(activeProvider, approvalHash).then(function (approvalReceipt) {
                  if (!receiptSucceeded(approvalReceipt)) {
                    var approveErr = { code: 'APPROVE_FAILED', message: 'Approval transaction failed' };
                    if (hooks.onFailed) hooks.onFailed(approveErr);
                    return makeResult('failed', { sender: proof.sender, error: approveErr });
                  }
                  if (hooks.onApprovalConfirmed) hooks.onApprovalConfirmed(approvalHash, approvalReceipt);
                  return executeTransferStepVia(
                    activeProvider, proof.chainId, authorizedRequest, approvalHash, recipientAmt,
                    authorizedCfg, hooks, onBroadcast
                  );
                });
              })
              .catch(function (err) {
                var code = providerErrorCode(err);
                if (code === 4001)    return makeResult('wallet-rejected', { sender: proof.sender });
                if (code === -32002)  return walletBusyResult(proof.sender);
                if (transferSubmitted) {
                  var postBroadcastErr = {
                    code: 'POST_BROADCAST_ERROR',
                    message: providerErrorMessage(err, 'Error after transfer broadcast.'),
                    txHash: submittedHash,
                    explorerUrl: authorizedCfg.explorerUrl + '/tx/' + submittedHash,
                  };
                  if (hooks.onFailed) hooks.onFailed(postBroadcastErr);
                  return makeResult('outcome-unknown', { sender: proof.sender, error: postBroadcastErr });
                }
                var execErr = {
                  code: code || 'EXECUTION_FAILED',
                  message: providerErrorMessage(err, 'Execution failed'),
                };
                if (hooks.onFailed) hooks.onFailed(execErr);
                return makeResult('failed', { sender: proof.sender, error: execErr });
              });
          });
        })
        .catch(function (err) {
          return makeResult('failed', {
            error: { code: 'TOCTOU_CHECK_FAILED', message: 'Cannot verify current wallet state before execution.' },
          });
        });
    }

    if (action !== 'execute') {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'UNSUPPORTED_ACTION', message: 'Unsupported execution action: ' + action },
      }));
    }

    var gasPolicyId = request.gasPolicyId || null;
    var gasPolicy = gasPolicyId ? loadValidatedGasPolicy(gasPolicyId) : null;
    if (gasPolicyId && (!gasPolicy || !gasPolicy.ok)) {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' },
      }));
    }

    var amountRaw = normalizeAtomicQuantity(request.amountAtomic);
    if (amountRaw == null) amountRaw = toRawUsdc(request.amount);
    if (amountRaw == null) {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'INVALID_AMOUNT', message: 'Execution amount must be provided.' },
      }));
    }

    var canonicalPlan = deriveCanonicalExecutionPlan(request);
    if (request.executionPlan && request.executionPlan !== canonicalPlan) {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'EXECUTION_PLAN_MISMATCH', message: 'Execution plan does not match the request behavior.' },
      }));
    }

    var feeBasisPoints = gasPolicy ? BigInt(gasPolicy.security.amountPolicy.feeBasisPoints) : 100n;
    var expectedFeeAtomic = (amountRaw * feeBasisPoints) / 10000n;
    var expectedTotalAtomic = amountRaw + expectedFeeAtomic;

    var suppliedFeeAtomic = request.platformFeeAtomic != null ? normalizeAtomicQuantity(request.platformFeeAtomic) : null;
    if (request.platformFeeAtomic != null && suppliedFeeAtomic !== expectedFeeAtomic) {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'PLATFORM_FEE_MISMATCH', message: 'Platform fee does not match the policy rate.' },
      }));
    }

    var totalRaw = normalizeAtomicQuantity(request.totalDebitAtomic);
    if (totalRaw == null) totalRaw = normalizeAtomicQuantity(request.totalAtomic);
    if (totalRaw == null) totalRaw = toRawUsdc(request.total);
    if (totalRaw != null && totalRaw !== expectedTotalAtomic) {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'TOTAL_DEBIT_MISMATCH', message: 'Amount, fee, and total debit must reconcile.' },
      }));
    }
    if (totalRaw == null) totalRaw = expectedTotalAtomic;

    if (gasPolicy) {
      var validation = gasPolicy.api.validateExecutionDomain(gasPolicyId, {
        executionPlan: canonicalPlan,
        amountAtomic: amountRaw,
        totalDebitAtomic: totalRaw,
        platformFeeAtomic: expectedFeeAtomic,
      });
      if (!validation || validation.ok !== true) {
        return Promise.resolve(makeResult('failed', {
          error: {
            code: validation && validation.code || 'GAS_POLICY_UNAVAILABLE',
            message: validation && validation.message || 'Gas policy validation failed.',
          },
        }));
      }
    }

    var executionRequest = request;
    if (gasPolicy) {
      executionRequest = Object.freeze(Object.assign({}, request, {
        amountAtomic: amountRaw.toString(10),
        totalAtomic: totalRaw.toString(10),
        feeAtomic: expectedFeeAtomic.toString(10),
        amount: atomicToUsdcDecimalString(amountRaw),
        total: atomicToUsdcDecimalString(totalRaw),
        fee: atomicToUsdcDecimalString(expectedFeeAtomic),
        executionPlan: canonicalPlan,
      }));
    }

    /* transferSubmitted tracks whether eth_sendTransaction returned a hash.
     * Any error after that point is outcome-unknown — we cannot assert that
     * funds did not move. submittedHash is used to surface the explorer link. */
    var transferSubmitted = false;
    var submittedHash     = null;

    var requiresApproval = canonicalPlan !== 'TRANSFER_ONLY';

    if (!requiresApproval) {
      return executeTransferStep(chainId, executionRequest, null, amountRaw, cfg, hooks, function (transferHash) {
        transferSubmitted = true;
        submittedHash = transferHash;
      });
    }

    if (hooks.onApprovalRequested) hooks.onApprovalRequested();
    return approve(chainId, executionRequest.sender, totalRaw)
      .then(function (approvalHash) {
        if (hooks.onApprovalSubmitted) hooks.onApprovalSubmitted(approvalHash);
        return waitForReceipt(approvalHash).then(function (approvalReceipt) {
          if (!receiptSucceeded(approvalReceipt)) {
            var approveErr = { code: 'APPROVE_FAILED', message: 'Approval transaction failed' };
            if (hooks.onFailed) hooks.onFailed(approveErr);
            return makeResult('failed', { sender: executionRequest.sender, error: approveErr });
          }
          if (hooks.onApprovalConfirmed) hooks.onApprovalConfirmed(approvalHash, approvalReceipt);
          return executeTransferStep(chainId, executionRequest, approvalHash, amountRaw, cfg, hooks, function (transferHash) {
            transferSubmitted = true;
            submittedHash = transferHash;
          });
        });
      })
      .catch(function (err) {
        var code = providerErrorCode(err);
        if (code === 4001) return makeResult('wallet-rejected', { sender: executionRequest.sender });
        if (code === -32002) {
          /* Wallet already has a pending request — no broadcast occurred, safe to retry. */
          return walletBusyResult(executionRequest.sender);
        }
        if (transferSubmitted) {
          /* Error after broadcast — outcome ambiguous. Surface hash for explorer lookup. */
          var postBroadcastErr = {
            code:       'POST_BROADCAST_ERROR',
            message:    providerErrorMessage(err, 'Error occurred after transfer was broadcast.'),
            txHash:     submittedHash,
            explorerUrl: cfg.explorerUrl + '/tx/' + submittedHash,
          };
          if (hooks.onFailed) hooks.onFailed(postBroadcastErr);
          return makeResult('outcome-unknown', { sender: executionRequest.sender, error: postBroadcastErr });
        }
        var execErr = { code: code || 'EXECUTION_FAILED', message: providerErrorMessage(err, 'Execution failed') };
        if (hooks.onFailed) hooks.onFailed(execErr);
        return makeResult('failed', { sender: executionRequest.sender, error: execErr });
      });
  }

  /* ----------------------------------------------------------------
   * Public API
   * ---------------------------------------------------------------- */
  window.IX_EXECUTION = {
    executeTransfer:    executeTransfer,
    toRawUsdc:          toRawUsdc,
    calculateFee:       calculateFee,
    resolveGasPolicy:   function (policyId) { var api = getGasPolicyApi(); return api ? api.resolveGasPolicy(policyId) : null; },
    validateGasPolicy:  function (policyId) { var api = getGasPolicyApi(); return api ? api.validateGasPolicy(policyId) : Object.freeze({ valid: false, errors: ['unknown policy'] }); },
    getPolicySecurityPayload: function (policyId) { var api = getGasPolicyApi(); return api ? api.getPolicySecurityPayload(policyId) : null; },
    getCanonicalPolicyBinding: function (policyId) { var api = getGasPolicyApi(); return api ? api.getCanonicalPolicyBinding(policyId) : null; },
    getGasLimit:        function (policyId, executionPlan, stepName) { var api = getGasPolicyApi(); return api ? api.getGasLimit(policyId, executionPlan, stepName) : null; },
    validateExecutionDomain: function (policyId, input) { var api = getGasPolicyApi(); return api ? api.validateExecutionDomain(policyId, input) : Object.freeze({ ok: false, code: 'GAS_POLICY_UNAVAILABLE', message: 'Gas policy unavailable.' }); },
    getChainParams:     getChainParams,
    readWalletSnapshot: readWalletSnapshot,
    buildAuthorizedTransactionRequests: buildAuthorizedTransactionRequests,
    estimateNativeGasRequirement: estimateNativeGasRequirement,
  };

})();
