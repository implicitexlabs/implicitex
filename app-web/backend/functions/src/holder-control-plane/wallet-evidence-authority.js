/**
 * Holder-specific binder for genuine wallet-challenge verifier results.
 *
 * The wallet proof authenticates account/username/wallet/chain. This binder
 * adds the current opaque card, token, and route-revision context loaded by
 * the backend. The Firestore transaction rechecks that context before write.
 */

'use strict';

const { getAddress } = require('ethers');
const { HolderControlPlaneError, deepFreeze } = require('./contract');

function fail(code, message) {
  throw new HolderControlPlaneError(code, message);
}

function createHolderWalletEvidenceAuthority(options) {
  if (!options || !options.walletChallengeService
    || typeof options.walletChallengeService.isVerifiedWalletProofResult !== 'function') {
    throw new TypeError('wallet challenge proof authority is required');
  }
  const walletChallengeService = options.walletChallengeService;
  const evidenceResults = new WeakSet();

  function bindVerifiedProof(proof, context) {
    let genuine = false;
    try { genuine = walletChallengeService.isVerifiedWalletProofResult(proof) === true; } catch (_) {
      genuine = false;
    }
    if (!genuine || !proof || proof.verified !== true) {
      fail('WALLET_EVIDENCE_UNTRUSTED', 'Genuine wallet-verifier proof is required.');
    }
    if (!context || typeof context !== 'object' || !context.route) {
      fail('WALLET_EVIDENCE_CONTEXT_INVALID', 'Current holder route context is required.');
    }
    let proofWallet;
    try { proofWallet = getAddress(proof.walletAddress); } catch (_) {
      fail('WALLET_EVIDENCE_BINDING_MISMATCH', 'Wallet proof address is invalid.');
    }
    if (
      proof.accountId !== context.accountId
      || proof.handle !== context.username
      || proofWallet !== context.route.recipientAddress
      || proof.chainId !== context.route.chainId
    ) fail('WALLET_EVIDENCE_BINDING_MISMATCH', 'Wallet proof does not bind the current holder route.');

    const result = deepFreeze({
      status: 'VERIFIED',
      proofId: proof.proofId,
      accountId: context.accountId,
      username: context.username,
      cardId: context.cardId,
      walletAddress: proofWallet,
      chainId: context.route.chainId,
      tokenContractAddress: context.route.tokenContractAddress,
      routeRevision: context.routeRevision,
      verifiedAt: proof.verifiedAt,
      expiresAt: proof.expiresAt,
      proofAuthority: 'GENUINE_WALLET_CHALLENGE_VERIFIER_RESULT',
    });
    evidenceResults.add(result);
    return result;
  }

  function isVerifiedEvidence(value) {
    try { return evidenceResults.has(value); } catch (_) { return false; }
  }

  return Object.freeze({ bindVerifiedProof, isVerifiedEvidence });
}

module.exports = Object.freeze({ createHolderWalletEvidenceAuthority });
