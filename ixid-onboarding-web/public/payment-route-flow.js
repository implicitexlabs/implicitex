/**
 * IX ID Payment Route — In-Browser Signing Workflow (M3)
 * ========================================================
 * Implements the challenge → sign → verify ownership-proof flow.
 * Separated from register.js so the orchestration logic is independently
 * testable without a full DOM environment.
 *
 * Network contract (FROZEN M3)
 * ----------------------------
 * EIP-191 personal_sign operates at the application layer: it signs arbitrary
 * UTF-8 text. The text itself contains "chain_id=137" and "network=polygon",
 * binding the ownership proof to Polygon mainnet via the signed content —
 * not via the wallet's currently selected network.
 *
 * M3 does NOT require the wallet to currently report chainId 137 at signing
 * time. Imposing a network restriction at signing would be incorrect: the
 * same EVM private key exists on all EVM-compatible networks, and the
 * personal_sign operation is cryptographically independent of the selected
 * network. The server verifies signer identity by recovering the signing
 * address from the signature — a pure cryptographic operation that does not
 * consult the wallet's current network state.
 *
 * What M3 DOES enforce at the server:
 *   - challenge.chain_id === 137 (bound at issuance, in the signed text)
 *   - recovered signer address === challenge.destination_address
 *   - claim.chain_id === 137 (written at publish)
 *   - asset_contract === 0x3c499c542cef5e3811e1192ce70d8cc03d5c3359 (native USDC)
 *
 * Account-change detection
 * ------------------------
 * The connected wallet address is read from the onboarding state snapshot
 * (currentRouteWalletAddress in register.js). Before issuing a challenge and
 * again before signing, the current account is re-read from the provider via
 * wallet.getAccounts(). If the account has changed, the flow aborts with
 * code: 'account_changed' and requires the user to disconnect and reconnect.
 * This prevents a WRONG_SIGNER server rejection from a mid-flow account
 * switch and gives the user an unambiguous error.
 */

(function exposePaymentRouteFlow(root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IXIDPaymentRouteFlow = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildPaymentRouteFlow() {
  'use strict';

  /**
   * doSignAndPublish — orchestrate wallet challenge + in-browser sign + verify.
   *
   * @param {object} opts
   * @param {object} opts.api         API client (issueWalletChallenge, verifyWallet)
   * @param {object} opts.wallet      Connector (getAccounts, signMessage)
   * @param {Function} opts.getToken  async () => string|null  Firebase ID token
   * @param {string}  opts.address    Expected wallet address (from connected state)
   *
   * @returns {Promise<object>}
   *   { ok: true,  claim_id, ix_id, destination_address }
   *   { ok: false, code: string, message: string }
   *
   * The promise always resolves — it never rejects. All error paths set ok=false.
   */
  async function doSignAndPublish(opts) {
    var api = opts.api;
    var wallet = opts.wallet;
    var getToken = opts.getToken;
    var address = opts.address;

    if (!address) {
      return { ok: false, code: 'no_address', message: 'Connect your wallet first.' };
    }
    if (!wallet) {
      return { ok: false, code: 'no_wallet', message: 'Wallet connector not available.' };
    }

    // ── Step 1: Verify current account before issuing a challenge ──────────
    // Reads eth_accounts (no prompt). If the user has switched accounts since
    // connecting, abort before creating any challenge record.
    var accountsBefore = await wallet.getAccounts();
    if (accountsBefore.rejected || !accountsBefore.accounts || accountsBefore.accounts.length === 0) {
      return { ok: false, code: 'wallet_unavailable', message: 'Wallet not available. Reconnect and try again.' };
    }
    if (accountsBefore.accounts[0].toLowerCase() !== address.toLowerCase()) {
      return {
        ok: false,
        code: 'account_changed',
        message: 'Wallet account changed. Disconnect and reconnect with the correct account.',
      };
    }

    // ── Step 2: Get Firebase ID token ──────────────────────────────────────
    var token = await getToken();
    if (!token) {
      return { ok: false, code: 'unauthenticated', message: 'Sign in required.' };
    }

    // ── Step 3: Issue wallet challenge ─────────────────────────────────────
    var challengeResult = await api.issueWalletChallenge(token, address);
    if (challengeResult.status !== 201) {
      var challengeMsg = 'Could not issue challenge. Try again.';
      if (challengeResult.status === 429) challengeMsg = 'Too many attempts. Try again later.';
      else if (challengeResult.body && challengeResult.body.detail) challengeMsg = challengeResult.body.detail;
      return { ok: false, code: 'challenge_failed', message: challengeMsg };
    }
    var challengeId = challengeResult.body.challenge_id;
    var challengeText = challengeResult.body.challenge_text;

    // ── Step 4: Re-verify account has not changed between issuance and signing
    // If the user switched accounts after the challenge was issued but before
    // signing, the recovered signer would not match the challenge address and
    // the server would return WRONG_SIGNER. Detect this early for a clearer UX.
    var accountsAfter = await wallet.getAccounts();
    if (accountsAfter.rejected || !accountsAfter.accounts || accountsAfter.accounts.length === 0) {
      return { ok: false, code: 'wallet_unavailable', message: 'Wallet not available. Reconnect and try again.' };
    }
    if (accountsAfter.accounts[0].toLowerCase() !== address.toLowerCase()) {
      return {
        ok: false,
        code: 'account_changed_during_signing',
        message: 'Wallet account changed during signing. Start over.',
      };
    }

    // ── Step 5: Sign challenge text ────────────────────────────────────────
    // Network contract: personal_sign is network-agnostic. The challenge text
    // binds this proof to Polygon chain 137. No network check is performed here.
    var signResult = await wallet.signMessage(challengeText, address);
    if (signResult.rejected) {
      var signMsg = 'Signature cancelled.';
      if (signResult.reason === 'user_rejected') signMsg = 'Signature rejected in wallet.';
      else if (signResult.reason === 'no_provider') signMsg = 'Wallet not available.';
      return { ok: false, code: 'sign_rejected', message: signMsg };
    }

    // ── Step 6: Verify signature and publish route ─────────────────────────
    var verifyResult = await api.verifyWallet(token, challengeId, signResult.signature);
    if (verifyResult.status !== 200) {
      var errCode = verifyResult.body && verifyResult.body.error;
      var verifyMsg = 'Verification failed. Try again.';
      if (errCode === 'WRONG_SIGNER') verifyMsg = 'Signature does not match the wallet. Ensure you signed with the correct account.';
      else if (errCode === 'CHALLENGE_EXPIRED') verifyMsg = 'Challenge expired. Try again.';
      else if (errCode === 'INVALID_SIGNATURE') verifyMsg = 'Malformed signature. Try again.';
      else if (errCode === 'CHALLENGE_ALREADY_USED') verifyMsg = 'Challenge already used. Try again.';
      else if (verifyResult.status === 429) verifyMsg = 'Too many attempts. Try again later.';
      return { ok: false, code: 'verify_failed', message: verifyMsg };
    }

    return {
      ok: true,
      claim_id: verifyResult.body.claim_id,
      ix_id: verifyResult.body.ix_id,
      destination_address: verifyResult.body.destination_address,
    };
  }

  return Object.freeze({ doSignAndPublish: doSignAndPublish });
}));
