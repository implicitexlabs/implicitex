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
   * calculateFee — single authority for platform fee math
   *
   * rawAmount  BigInt  USDC in base units (6 decimals)
   * chainId    number  numeric chain ID
   * feeBps     number? optional override (manifest-scoped rate); if
   *                    omitted the chain's default feeBps is used
   *
   * Returns { fee: BigInt, total: BigInt } where total = rawAmount + fee.
   * Integer division throughout — no float rounding ambiguity.
   * ---------------------------------------------------------------- */
  function calculateFee(rawAmount, chainId, feeBps) {
    var cfg = CHAINS[chainId];
    var bps = BigInt(feeBps != null ? feeBps : ((cfg && cfg.feeBps != null) ? cfg.feeBps : 100));
    var fee = (rawAmount * bps) / 10000n;
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
    var amount = request.amount != null ? Number(request.amount) : null;
    var total  = request.total  != null ? Number(request.total)  : null;
    var fee    = request.fee    != null
      ? Number(request.fee)
      : (amount != null && total != null ? total - amount : null);

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

  function executeTransfer(request, hooks) {
    request = request || {};
    hooks = hooks || {};
    var action = request.action || 'execute';
    var chainId = request.chainId;
    var cfg = chainConfig(chainId);

    if (!cfg) return Promise.resolve(makeResult('failed', {
      error: { code: 'UNSUPPORTED_CHAIN', message: 'Unsupported chainId: ' + chainId },
    }));

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

    if (action !== 'execute') {
      return Promise.resolve(makeResult('failed', {
        error: { code: 'UNSUPPORTED_ACTION', message: 'Unsupported execution action: ' + action },
      }));
    }

    var amountRaw = toRawUsdc(request.amount);
    var totalRaw = toRawUsdc(request.total);

    /* transferSubmitted tracks whether eth_sendTransaction returned a hash.
     * Any error after that point is outcome-unknown — we cannot assert that
     * funds did not move. submittedHash is used to surface the explorer link. */
    var transferSubmitted = false;
    var submittedHash     = null;

    var requiresApproval = request.requiresApproval !== false;

    if (!requiresApproval) {
      return executeTransferStep(chainId, request, null, amountRaw, cfg, hooks, function (transferHash) {
        transferSubmitted = true;
        submittedHash = transferHash;
      });
    }

    if (hooks.onApprovalRequested) hooks.onApprovalRequested();
    return approve(chainId, request.sender, totalRaw)
      .then(function (approvalHash) {
        if (hooks.onApprovalSubmitted) hooks.onApprovalSubmitted(approvalHash);
        return waitForReceipt(approvalHash).then(function (approvalReceipt) {
          if (!receiptSucceeded(approvalReceipt)) {
            var approveErr = { code: 'APPROVE_FAILED', message: 'Approval transaction failed' };
            if (hooks.onFailed) hooks.onFailed(approveErr);
            return makeResult('failed', { sender: request.sender, error: approveErr });
          }
          if (hooks.onApprovalConfirmed) hooks.onApprovalConfirmed(approvalHash, approvalReceipt);
          return executeTransferStep(chainId, request, approvalHash, amountRaw, cfg, hooks, function (transferHash) {
            transferSubmitted = true;
            submittedHash = transferHash;
          });
        });
      })
      .catch(function (err) {
        var code = providerErrorCode(err);
        if (code === 4001) return makeResult('wallet-rejected', { sender: request.sender });
        if (code === -32002) {
          /* Wallet already has a pending request — no broadcast occurred, safe to retry. */
          return walletBusyResult(request.sender);
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
          return makeResult('outcome-unknown', { sender: request.sender, error: postBroadcastErr });
        }
        var execErr = { code: code || 'EXECUTION_FAILED', message: providerErrorMessage(err, 'Execution failed') };
        if (hooks.onFailed) hooks.onFailed(execErr);
        return makeResult('failed', { sender: request.sender, error: execErr });
      });
  }

  /* ----------------------------------------------------------------
   * Public API
   * ---------------------------------------------------------------- */
  window.IX_EXECUTION = {
    executeTransfer: executeTransfer,
    toRawUsdc:       toRawUsdc,
    calculateFee:    calculateFee,
  };

})();
