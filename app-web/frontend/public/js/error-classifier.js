(function (root, factory) {
  'use strict';

  const statusApi = root && root.IX && root.IX.transferStatus
    ? root.IX.transferStatus
    : (typeof require === 'function' ? require('./transfer-status.js') : null);
  const api = factory(statusApi);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.errorClassifier = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (statusApi) {
  'use strict';

  const STATES = statusApi.IX_TRANSFER_STATES;

  function providerErrorCode(err) {
    return err && (
      err.code ||
      (err.info && err.info.error && err.info.error.code) ||
      (err.data && err.data.originalError && err.data.originalError.code)
    );
  }

  function cleanDetail(err) {
    const raw = err && (
      err.reason ||
      err.shortMessage ||
      (err.info && err.info.error && err.info.error.message) ||
      (err.data && err.data.message) ||
      err.message
    );
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/\s+at\s+.+/g, '')
      .replace(/0x[0-9a-fA-F]{64,}/g, '[transaction hash]')
      .slice(0, 180);
  }

  function base(result) {
    return Object.freeze(Object.assign({
      code: 'UNKNOWN_ERROR',
      state: STATES.FAILED,
      title: 'Transfer could not continue',
      message: 'The transfer could not continue.',
      fundsMoved: false,
      broadcastKnown: false,
      retryGuidance: 'Review the details, then try again if appropriate.',
      severity: 'blocking',
    }, result));
  }

  function classifyError(err, context = {}) {
    const code = providerErrorCode(err);
    const ethersCode = err && err.code; // ethers.js v6 uses string codes e.g. 'ACTION_REJECTED'
    const detail = cleanDetail(err);
    const broadcastKnown = context.broadcastKnown === true;
    const chainReceiptStatus = context.chainReceiptStatus;
    const phase = context.phase || '';

    if (broadcastKnown && chainReceiptStatus !== 0 && chainReceiptStatus !== 1) {
      return base({
        code: 'BROADCAST_OUTCOME_UNKNOWN',
        state: STATES.OUTCOME_UNKNOWN,
        title: 'Transaction outcome is unknown',
        message: 'A transaction hash exists, but final confirmation could not be verified.',
        fundsMoved: null,
        broadcastKnown: true,
        retryGuidance: 'Verify on explorer before retrying.',
        severity: 'warning',
      });
    }

    if (chainReceiptStatus === 1) {
      return base({
        code: 'CHAIN_CONFIRMED',
        state: STATES.CONFIRMED,
        title: 'Transfer confirmed',
        message: 'The transfer confirmed on-chain.',
        fundsMoved: true,
        broadcastKnown: true,
        retryGuidance: 'Save or export the proof packet.',
        severity: 'info',
      });
    }

    if (chainReceiptStatus === 0) {
      return base({
        code: 'CHAIN_REVERTED',
        state: STATES.FAILED,
        title: 'Transaction reverted on-chain',
        message: 'The transaction reached the network and reverted on-chain.',
        fundsMoved: false,
        broadcastKnown: true,
        retryGuidance: 'Check the reason, correct the issue, then retry only if appropriate.',
        severity: 'blocking',
      });
    }

    // 4001 = standard EIP-1193 user rejection
    // 5000 = WalletConnect v2 user rejection ("User rejected methods")
    // ACTION_REJECTED = ethers.js v6 string code for user rejection
    if (code === 4001 || code === 5000 || ethersCode === 'ACTION_REJECTED') {
      return base({
        code: 'USER_REJECTED',
        state: STATES.REJECTED,
        title: phase === 'authorization' ? 'Authorization declined' : 'Transfer rejected',
        message: phase === 'authorization'
          ? 'USDC authorization was declined in the wallet.'
          : 'The transfer was rejected in the wallet before broadcast.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Retry when ready, or do nothing.',
        severity: 'warning',
      });
    }

    if (code === -32002) {
      return base({
        code: 'WALLET_REQUEST_PENDING',
        state: STATES.INTERRUPTED,
        title: 'Wallet request already pending',
        message: 'MetaMask already has a pending request.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Open MetaMask, finish or cancel the pending request, then retry.',
        severity: 'warning',
      });
    }

    if (code === -32603) {
      return base({
        code: 'WALLET_INTERNAL_ERROR',
        state: STATES.INTERRUPTED,
        title: 'Wallet returned an internal error',
        message: 'MetaMask reported an internal error processing this request. No funds were sent.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Return to MetaMask, dismiss any pending prompts, then retry the transfer.',
        severity: 'warning',
      });
    }

    if (/insufficient allowance|allowance/i.test(detail)) {
      return base({
        code: 'INSUFFICIENT_ALLOWANCE',
        state: STATES.FAILED,
        title: 'USDC approval is too low',
        message: 'Your wallet has not approved enough USDC for the full total debit.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Approve amount plus platform fee, then try again.',
        severity: 'blocking',
      });
    }

    if (/insufficient funds|insufficient balance|exceeds balance/i.test(detail)) {
      return base({
        code: 'INSUFFICIENT_BALANCE',
        state: STATES.FAILED,
        title: 'Balance is too low',
        message: 'The wallet balance is not enough to cover the amount, fee, or gas.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Lower the amount or add funds before trying again.',
        severity: 'blocking',
      });
    }

    if (/gas|intrinsic gas|replacement fee/i.test(detail)) {
      return base({
        code: 'GAS_ISSUE',
        state: STATES.FAILED,
        title: 'Gas issue',
        message: 'The wallet or network reported a gas-related issue before confirmation.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Review wallet gas settings and network conditions before retrying.',
        severity: 'blocking',
      });
    }

    if (/paused/i.test(detail)) {
      return base({
        code: 'CONTRACT_PAUSED',
        state: STATES.FAILED,
        title: 'Transfers are paused',
        message: 'The transfer contract is paused.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Wait until transfers are enabled again.',
        severity: 'blocking',
      });
    }

    if (/network|chain/i.test(detail)) {
      return base({
        code: 'WRONG_NETWORK',
        state: STATES.FAILED,
        title: 'Wrong network',
        message: 'The wallet or provider reported a network mismatch.',
        fundsMoved: false,
        broadcastKnown: false,
        retryGuidance: 'Switch to Polygon and retry only after the wallet reports the correct network.',
        severity: 'blocking',
      });
    }

    return base({
      code: 'UNKNOWN_ERROR',
      state: STATES.FAILED,
      title: 'Transfer could not continue',
      message: detail ? 'The wallet or network returned an unclassified error.' : 'The transfer could not continue.',
      fundsMoved: false,
      broadcastKnown: false,
      retryGuidance: 'Review the details, then try again if appropriate.',
      severity: 'blocking',
    });
  }

  return Object.freeze({
    classifyError,
    providerErrorCode,
    cleanDetail,
  });
});
