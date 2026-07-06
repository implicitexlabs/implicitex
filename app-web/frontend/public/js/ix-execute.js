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
    return window.ethereum.request({ method: 'eth_chainId' })
      .then(function (hex) {
        return parseInt(hex, 16);
      });
  }

  /* ----------------------------------------------------------------
   * switchChain — switch to chainId, adding the chain if unknown (4902)
   * ---------------------------------------------------------------- */
  function switchChain(chainId) {
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

  /* ----------------------------------------------------------------
   * Public API
   * ---------------------------------------------------------------- */
  window.IX_EXECUTE = {
    connectWallet:   connectWallet,
    getChainId:      getChainId,
    switchChain:     switchChain,
    approve:         approve,
    transferWithFee: transferWithFee,
    waitForReceipt:  waitForReceipt,
    chainConfig:     chainConfig,
    toRawUsdc:       toRawUsdc,
    calculateFee:    calculateFee,
  };

})();
