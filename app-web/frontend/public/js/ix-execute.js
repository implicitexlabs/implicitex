/**
 * ix-execute.js — Shared execution primitives for ImplicitEx in-card transfers.
 *
 * Shared execution primitives. Used by card/card.js (in-card Coin Card flow)
 * and will be the target of a future wallet.js refactor to eliminate duplicate
 * execution code.
 *
 * Exposes window.IX_EXECUTE with:
 *   connectWallet()               → Promise<string address>
 *   getChainId()                  → Promise<number>
 *   switchChain(chainId)          → Promise<void>
 *   executeTransfer(request, hooks?) → Promise<execution result>
 *   approve(chainId, sender, totalRaw)                        → Promise<txHash>
 *   transferWithFee(chainId, sender, recipient, amountRaw)    → Promise<txHash>
 *   waitForReceipt(hash)          → Promise<receipt>
 *   chainConfig(chainId)          → object | null
 *   toRawUsdc(floatVal)           → BigInt
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

  function executeTransfer(request, hooks) {
    request = request || {};
    hooks = hooks || {};
    var action = request.action || 'execute';
    var chainId = request.chainId;
    var cfg = chainConfig(chainId);

    if (!cfg) return Promise.resolve({
      status: 'failed',
      error: { code: 'UNSUPPORTED_CHAIN', message: 'Unsupported chainId: ' + chainId },
    });

    if (action === 'prepare') {
      if (hooks.onWalletRequested) hooks.onWalletRequested();
      return connectWallet()
        .then(function (address) {
          if (hooks.onWalletConnected) hooks.onWalletConnected(address);
          return getChainId().then(function (currentChainId) {
            if (currentChainId !== chainId) {
              if (hooks.onNetworkMismatch) hooks.onNetworkMismatch(currentChainId, chainId);
              return {
                status: 'wrong-network',
                sender: address,
                chainId: currentChainId,
                expectedChainId: chainId,
                chain: cfg,
              };
            }
            return {
              status: 'ready-to-send',
              sender: address,
              chainId: currentChainId,
              chain: cfg,
            };
          });
        })
        .catch(function (err) {
          if (err && err.code === 'NO_WALLET') return { status: 'wallet-missing' };
          if (err && err.code === 4001)        return { status: 'wallet-rejected' };
          return { status: 'failed', error: { code: err && err.code, message: err && err.message } };
        });
    }

    if (action === 'switch-network') {
      return switchChain(chainId)
        .then(function () {
          return {
            status: 'ready-to-send',
            chainId: chainId,
            chain: cfg,
          };
        })
        .catch(function (err) {
          if (err && err.code === 4001) {
            return { status: 'wrong-network', chainId: chainId, chain: cfg };
          }
          return { status: 'failed', error: { code: err && err.code, message: err && err.message } };
        });
    }

    if (action !== 'execute') {
      return Promise.reject(new Error('Unsupported execution action: ' + action));
    }

    var amountRaw = toRawUsdc(request.amount);
    var totalRaw = toRawUsdc(request.total);

    if (hooks.onApprovalRequested) hooks.onApprovalRequested();
    return approve(chainId, request.sender, totalRaw)
      .then(function (approvalHash) {
        if (hooks.onApprovalSubmitted) hooks.onApprovalSubmitted(approvalHash);
        return waitForReceipt(approvalHash).then(function (approvalReceipt) {
          if (!receiptSucceeded(approvalReceipt)) {
            var approveErr = { code: 'APPROVE_FAILED', message: 'Approval transaction failed' };
            if (hooks.onFailed) hooks.onFailed(approveErr);
            return { status: 'failed', error: approveErr };
          }
          if (hooks.onTransferRequested) hooks.onTransferRequested(approvalReceipt);
          return transferWithFee(chainId, request.sender, request.recipient, amountRaw)
            .then(function (transferHash) {
              if (hooks.onTransferSubmitted) hooks.onTransferSubmitted(transferHash);
              return waitForReceipt(transferHash).then(function (transferReceipt) {
                if (!receiptSucceeded(transferReceipt)) {
                  var transferErr = { code: 'TRANSFER_FAILED', message: 'Transfer transaction failed' };
                  if (hooks.onFailed) hooks.onFailed(transferErr);
                  return { status: 'failed', error: transferErr };
                }
                var confirmed = {
                  status: 'confirmed',
                  approvalHash: approvalHash,
                  approvalReceipt: approvalReceipt,
                  transferHash: transferHash,
                  txHash: transferHash,
                  receipt: transferReceipt,
                  explorerUrl: cfg.explorerUrl + '/tx/' + transferHash,
                  chain: cfg,
                };
                if (hooks.onConfirmed) hooks.onConfirmed(confirmed);
                return confirmed;
              });
            });
        });
      })
      .catch(function (err) {
        if (err && err.code === 4001) return { status: 'wallet-rejected' };
        var execErr = { code: err && err.code || 'EXECUTION_FAILED', message: err && err.message || 'Execution failed' };
        if (hooks.onFailed) hooks.onFailed(execErr);
        return { status: 'failed', error: execErr };
      });
  }

  /* ----------------------------------------------------------------
   * Public API
   * ---------------------------------------------------------------- */
  window.IX_EXECUTE = {
    connectWallet:   connectWallet,
    getChainId:      getChainId,
    switchChain:     switchChain,
    executeTransfer: executeTransfer,
    approve:         approve,
    transferWithFee: transferWithFee,
    waitForReceipt:  waitForReceipt,
    chainConfig:     chainConfig,
    toRawUsdc:       toRawUsdc,
    calculateFee:    calculateFee,
  };

})();
