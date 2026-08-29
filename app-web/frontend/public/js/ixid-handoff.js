/* ixid-handoff.js — IX ID → ImplicitEx Transfer Portal intake
 *
 * Fires when the Transfer Portal is opened via an IX ID payment handoff URL:
 *
 *   portal.implicitex.com/?src=ixid&ixid=alice&to=0x...&claim=<id>&amount=1.5&chain=137&asset=polygon-pos-native-usdc-v1
 *
 * Trust model (critical — read before modifying)
 * -----------------------------------------------
 * URL parameters are untrusted transport (claims). They are NEVER treated as
 * authoritative without cross-validation against the IX ID public route API.
 *
 *   src    — provenance marker only; activates this module
 *   ixid   — the IX ID handle; used to construct the API verification URL
 *   to     — claimed destination address; compared against API response
 *   claim  — claimed route revision; compared against API claim_id
 *   amount — claimed USDC amount; validated against ImplicitEx bounds
 *   chain  — claimed chain ID; must be 137
 *   asset  — claimed asset binding version; must be polygon-pos-native-usdc-v1
 *
 * Validation sequence (all steps must pass before prefill)
 * ---------------------------------------------------------
 *   1. src=ixid present → activate module
 *   2. chain=137 and asset=polygon-pos-native-usdc-v1 (exact match)
 *   3. amount parseable, ≥ 1 USDC, ≤ 250 USDC (6-decimal BigInt)
 *   4. to is a syntactically valid EVM address (0x + 40 hex chars)
 *   5. ixid is a valid handle pattern (3–30 lowercase letters/digits/hyphens)
 *   6. Fetch IX ID route API: https://{ixid}.ixid.me/api/public/route/{ixid}
 *      - Requires CORS: route endpoint serves Access-Control-Allow-Origin: *
 *   7. Verify route.payable === true
 *   8. Verify route.claim_id === claim (URL param)           — stale-route check
 *   9. Verify route.destination_address (lowercase) === to (lowercase)  — tampered-dest check
 *  10. Verify route.asset.asset_binding_version === asset   — tampered-asset check
 *  11. Prefill txRecipient (locked, read-only) and txAmount
 *  12. Show IX ID context banner with verification status
 *
 * Pre-execution TOCTOU gate (wired in wallet.js)
 * -----------------------------------------------
 * After step 10 passes, the verified route is stored. wallet.js calls
 * window.IXID_HANDOFF.revalidateBeforeExecution() immediately before
 * IX_EXECUTION.executeTransfer(). A changed claim_id, destination, or
 * asset binding version at that point aborts execution without substituting
 * the refreshed route into the payer's review.
 *
 * What this module does NOT do
 * ----------------------------
 *   - Does not execute transfers (no wallet calls)
 *   - Does not bypass the existing portal review/confirm flow
 *   - Does not trust any URL parameter without steps 6–10 passing
 *   - Does not prefill recipient from URL; only from API-confirmed route
 *
 * Cancel / no-execution guarantee
 * --------------------------------
 * This module only calls prefillPortal() after API validation. wallet.js,
 * app.js, and IX_EXECUTION are not touched. The user must still:
 *   a) Connect a wallet (wallet.js)
 *   b) Click "Review transfer" (app.js)
 *   c) Confirm the transaction in their wallet (IX_EXECUTION.executeTransfer)
 * Closing the tab, clicking "Edit details", or not connecting a wallet
 * all cause no execution.
 *
 * Node.js / browser dual export
 * ------------------------------
 * CommonJS (module.exports): exports _createHandoffContext for tests.
 * Browser IIFE: auto-inits from window.location.search.
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(null, null);
  } else {
    var exports = factory(root, root.document);
    var params = new URLSearchParams(root.location.search);
    var rawParams = {
      src:    params.get('src')    || '',
      ixid:   params.get('ixid')   || '',
      to:     params.get('to')     || '',
      claim:  params.get('claim')  || '',
      amount: params.get('amount') || '',
      chain:  params.get('chain')  || '',
      asset:  params.get('asset')  || '',
      /* Optional merchant/order context — untrusted display/receipt metadata */
      ptag:   params.get('ptag')   || '',
      ref:    params.get('ref')    || '',
      memo:   params.get('memo')   || '',
    };

    if (rawParams.src !== 'ixid') return;

    var ctx = exports._createHandoffContext(rawParams, {
      fetch:         root.fetch.bind(root),
      getElementById: function (id) { return root.document.getElementById(id); },
      openPortal:    function () {
        if (root.IX && typeof root.IX.openTransferPortal === 'function') {
          root.IX.openTransferPortal();
        } else {
          var modules = root.document.getElementById('modules');
          if (modules) {
            modules.removeAttribute('hidden');
            root.document.body.classList.add('portal-active');
          }
        }
      },
    });

    /* Expose the pre-execution revalidation gate for wallet.js */
    root.IXID_HANDOFF = {
      revalidateBeforeExecution: ctx.revalidateBeforeExecution,
    };

    function init() {
      if (root.IX && typeof root.IX.openTransferPortal === 'function') {
        ctx.processHandoff();
      } else {
        root.addEventListener('ix:ready', function () { ctx.processHandoff(); }, { once: true });
        /* Safety timeout: run anyway if ix:ready never fires */
        setTimeout(function () {
          var banner = root.document.getElementById('ixidIntake');
          if (!banner || banner.hasAttribute('hidden')) ctx.processHandoff();
        }, 2000);
      }
    }

    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, doc) {
  'use strict';

  /* ----------------------------------------------------------------
   * Frozen constants — must match payment-intent.js and chains.js
   * ---------------------------------------------------------------- */
  var REQUIRED_CHAIN        = '137';
  var REQUIRED_ASSET        = 'polygon-pos-native-usdc-v1';
  var NATIVE_USDC_CONTRACT  = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
  var MIN_AMOUNT_ATOMIC     = 1000000n;   // 1 USDC
  var MAX_AMOUNT_ATOMIC     = 250000000n; // 250 USDC
  /* Handle: 3–30 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen */
  var IXID_HANDLE_RE        = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$|^[a-z0-9]{3}$/;
  var EVM_ADDRESS_RE        = /^0x[0-9a-fA-F]{40}$/;

  /* ----------------------------------------------------------------
   * Merchant/order context constants — mirror wallet.js PURPOSE_TAGS
   * and getTransferMetadata() limits exactly.
   * Context is untrusted display/receipt metadata only; it never
   * determines destination, amount, chain, asset, or execution authority.
   * ---------------------------------------------------------------- */
  var VALID_PURPOSE_TAGS = new Set([
    'invoice', 'contractor', 'refund', 'family',
    'donation', 'purchase', 'subscription', 'test', 'other',
  ]);
  var REFERENCE_MAX_LENGTH = 80;
  var MEMO_MAX_LENGTH      = 140;

  /* ----------------------------------------------------------------
   * Amount parsing (BigInt — no float)
   * ---------------------------------------------------------------- */
  function parseAmountToAtomic(str) {
    str = (str || '').trim();
    if (!str || str.charAt(0) === '-') return null;
    if (!/^\d+(\.\d{1,6})?$/.test(str)) return null;
    var parts = str.split('.');
    var whole = BigInt(parts[0]) * 1000000n;
    var frac  = BigInt((parts[1] || '').padEnd(6, '0'));
    var total = whole + frac;
    return total === 0n ? null : total;
  }

  function atomicToDisplay(atomic) {
    var whole = atomic / 1000000n;
    var frac  = atomic % 1000000n;
    if (frac === 0n) return whole.toString();
    var fs = frac.toString().padStart(6, '0').replace(/0+$/, '');
    return whole.toString() + '.' + fs;
  }

  /* ----------------------------------------------------------------
   * _createHandoffContext — testable factory
   *
   * @param {object} rawParams - plain object {src, ixid, to, claim, amount, chain, asset}
   * @param {object} deps      - {fetch, getElementById, openPortal}
   * @returns {object} context with {validateParams, processHandoff, revalidateBeforeExecution, getVerifiedRoute}
   * ---------------------------------------------------------------- */
  function _createHandoffContext(rawParams, deps) {
    var ixid   = (rawParams && rawParams.ixid)   || '';
    var to     = (rawParams && rawParams.to)     || '';
    var claim  = (rawParams && rawParams.claim)  || '';
    var amount = (rawParams && rawParams.amount) || '';
    var chain  = (rawParams && rawParams.chain)  || '';
    var asset  = (rawParams && rawParams.asset)  || '';
    /* Optional merchant/order context — sanitised before any DOM write */
    var ptag   = (rawParams && rawParams.ptag)   || '';
    var ref    = (rawParams && rawParams.ref)    || '';
    var memo   = (rawParams && rawParams.memo)   || '';

    var _fetch      = (deps && deps.fetch)         || (typeof fetch !== 'undefined' ? fetch : null);
    var _getEl      = (deps && deps.getElementById) || function (id) { return doc && doc.getElementById(id); };
    var _openPortal = (deps && deps.openPortal)    || function () {};

    /* The route accepted during intake is retained as the payer's reviewed
     * authority. revalidateBeforeExecution() checks against it without ever
     * adopting a refreshed destination into the existing review. */
    var verifiedRoute = null;

    /* -------------------------------------------------------------- */
    /* DOM helpers (no-op when element not found)                      */
    /* -------------------------------------------------------------- */

    function setVerifyState(state, text) {
      var badge = _getEl('ixidIntakeStatus');
      if (!badge) return;
      badge.dataset.verifyState = state;
      badge.textContent = text;
    }

    function setLabel(text) {
      var label = _getEl('ixidIntakeLabel');
      if (label) label.textContent = text;
    }

    function showBanner() {
      var banner = _getEl('ixidIntake');
      if (banner) banner.removeAttribute('hidden');
    }

    function showError(message) {
      setVerifyState('failed', message);
      showBanner();
    }

    /* -------------------------------------------------------------- */
    /* Route API                                                       */
    /* -------------------------------------------------------------- */

    function routeApiUrl() {
      return 'https://' + encodeURIComponent(ixid) + '.ixid.me/api/public/route/' + encodeURIComponent(ixid);
    }

    function fetchAuthoritativeRoute() {
      return _fetch(routeApiUrl()).then(function (resp) {
        if (resp.status === 404) return { _notFound: true };
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      });
    }

    /* -------------------------------------------------------------- */
    /* Structural validation (before any network call)                 */
    /* Returns null on success, error-code string on failure.          */
    /* -------------------------------------------------------------- */

    function validateParams() {
      if (chain !== REQUIRED_CHAIN)   return 'WRONG_CHAIN';
      if (asset !== REQUIRED_ASSET)   return 'WRONG_ASSET';
      if (!EVM_ADDRESS_RE.test(to))   return 'INVALID_DESTINATION';
      if (!ixid || !IXID_HANDLE_RE.test(ixid)) return 'INVALID_HANDLE';
      if (!claim)                     return 'MISSING_CLAIM';
      var atomic = parseAmountToAtomic(amount);
      if (atomic === null)            return 'INVALID_AMOUNT';
      if (atomic < MIN_AMOUNT_ATOMIC) return 'AMOUNT_BELOW_MINIMUM';
      if (atomic > MAX_AMOUNT_ATOMIC) return 'AMOUNT_ABOVE_MAXIMUM';
      return null; // all clear
    }

    /* -------------------------------------------------------------- */
    /* Pre-execution TOCTOU gate                                       */
    /* Called by wallet.js immediately before IX_EXECUTION.executeTransfer */
    /* Never adopts a refreshed destination — caller must discard review */
    /* -------------------------------------------------------------- */

    function revalidateBeforeExecution() {
      if (!verifiedRoute) {
        return Promise.resolve({
          ok: false, code: 'HANDOFF_NOT_VERIFIED',
          message: 'IX ID payment route is not verified.',
        });
      }
      return fetchAuthoritativeRoute().then(function (route) {
        if (route._notFound || !route.payable) {
          return { ok: false, code: 'ROUTE_INACTIVE',
            message: "The recipient's IX ID payment route changed. Re-resolve the IX ID and review the transfer again." };
        }
        if (route.claim_id !== verifiedRoute.claim_id) {
          return { ok: false, code: 'ROUTE_REVISION_MISMATCH',
            message: "The recipient's IX ID payment route changed. Re-resolve the IX ID and review the transfer again." };
        }
        if (!route.destination_address ||
            route.destination_address.toLowerCase() !== verifiedRoute.destination_address.toLowerCase()) {
          return { ok: false, code: 'DESTINATION_MISMATCH',
            message: "The recipient's IX ID payment route changed. Re-resolve the IX ID and review the transfer again." };
        }
        if (!route.asset ||
            route.asset.asset_binding_version !== verifiedRoute.asset.asset_binding_version) {
          return { ok: false, code: 'ASSET_BINDING_MISMATCH',
            message: "The recipient's IX ID payment route changed. Re-resolve the IX ID and review the transfer again." };
        }
        return { ok: true, route: route };
      }).catch(function () {
        return { ok: false, code: 'ROUTE_API_UNAVAILABLE',
          message: "The recipient's IX ID payment route could not be revalidated. Re-resolve the IX ID and review the transfer again." };
      });
    }

    /* -------------------------------------------------------------- */
    /* Prefill                                                         */
    /* TRUST RULE: destination comes from API route only, never from   */
    /* the URL 'to' param directly.                                    */
    /* -------------------------------------------------------------- */

    function prefillPortal(route, amountAtomic) {
      var recipientEl = _getEl('txRecipient');
      if (recipientEl && route.destination_address) {
        recipientEl.value = route.destination_address.toLowerCase();
        recipientEl.dispatchEvent(new Event('input', { bubbles: true }));
        recipientEl.readOnly = true;
        recipientEl.classList.add('tx-field--locked');
        recipientEl.setAttribute('aria-label',
          'Recipient wallet address — verified from IX ID route');
      }

      if (amountAtomic) {
        var amountEl = _getEl('txAmount');
        if (amountEl) {
          amountEl.value = atomicToDisplay(amountAtomic);
          amountEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      var handleEl = _getEl('ixidRecipientHandle');
      var metaEl   = _getEl('ixidRecipientMeta');
      var ctxEl    = _getEl('ixidRecipientContext');

      if (handleEl) handleEl.textContent = '@' + ixid;
      if (metaEl)   metaEl.textContent   = 'IX ID \u00b7 Polygon \u00b7 Native USDC \u00b7 Route verified';
      if (ctxEl)    ctxEl.removeAttribute('hidden');

      /* Reference field:
       * - merchant reference wins when provided (trucated to contract limit)
       * - fallback to IX ID recipient identity when no merchant reference
       * This preserves both merchant context and IX ID identity without collision. */
      var refEl = _getEl('txReference');
      if (refEl) {
        var sanitisedRef = ref.trim().slice(0, REFERENCE_MAX_LENGTH);
        refEl.value = sanitisedRef || ('IX ID: @' + ixid);
        refEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      /* Purpose tag — only accepted if in the VALID_PURPOSE_TAGS set */
      var purposeTagEl = _getEl('txPurposeTag');
      if (purposeTagEl && VALID_PURPOSE_TAGS.has(ptag)) {
        purposeTagEl.value = ptag;
        purposeTagEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      /* Memo — truncated to contract limit */
      var memoEl = _getEl('txMemo');
      if (memoEl && memo) {
        memoEl.value = memo.trim().slice(0, MEMO_MAX_LENGTH);
        memoEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    /* -------------------------------------------------------------- */
    /* Main validation + prefill flow                                  */
    /* Returns a Promise for testability.                              */
    /* -------------------------------------------------------------- */

    function processHandoff() {
      var structErr = validateParams();
      if (structErr) {
        var msg = {
          WRONG_CHAIN:        'Unsupported chain — only Polygon (137) is supported.',
          WRONG_ASSET:        'Unsupported asset — only native Polygon USDC is supported.',
          INVALID_DESTINATION: 'Invalid destination address in handoff URL.',
          INVALID_HANDLE:     'Invalid IX ID handle in handoff URL.',
          MISSING_CLAIM:      'Missing route revision (claim) in handoff URL.',
          INVALID_AMOUNT:     'Invalid amount in handoff URL.',
          AMOUNT_BELOW_MINIMUM: 'Amount below minimum (1 USDC).',
          AMOUNT_ABOVE_MAXIMUM: 'Amount above maximum (250 USDC).',
        }[structErr] || structErr;
        showError('IX ID HANDOFF REJECTED');
        return Promise.resolve({ ok: false, code: structErr, message: msg });
      }

      var amountAtomic = parseAmountToAtomic(amount);

      setLabel('@' + ixid);
      setVerifyState('pending', 'VALIDATING IX ID ROUTE');
      showBanner();

      return fetchAuthoritativeRoute()
        .then(function (route) {
          if (route._notFound) {
            showError('IX ID NOT FOUND');
            return { ok: false, code: 'NOT_FOUND', message: 'IX ID not found.' };
          }

          if (!route.payable) {
            showError('IX ID NOT ACCEPTING PAYMENTS');
            return { ok: false, code: 'NOT_PAYABLE', message: 'IX ID is not currently accepting payments.' };
          }

          if (!route.claim_id || route.claim_id !== claim) {
            showError('ROUTE REVISION MISMATCH');
            return { ok: false, code: 'STALE_CLAIM', message: 'Route revision mismatch — handoff rejected.' };
          }

          if (!route.destination_address ||
              route.destination_address.toLowerCase() !== to.toLowerCase()) {
            showError('DESTINATION MISMATCH');
            return { ok: false, code: 'DESTINATION_MISMATCH', message: 'Destination mismatch — handoff rejected.' };
          }

          var routeAsset = route.asset;
          if (!routeAsset ||
              !routeAsset.asset_binding_version ||
              routeAsset.asset_binding_version !== REQUIRED_ASSET) {
            showError('ASSET BINDING MISMATCH');
            return { ok: false, code: 'ASSET_MISMATCH', message: 'Asset binding mismatch — handoff rejected.' };
          }

          /* All checks passed */
          setLabel('@' + ixid + ' \u00b7 Route verified');
          setVerifyState('verified', 'IX ID ROUTE VERIFIED');
          verifiedRoute = route;
          prefillPortal(route, amountAtomic);
          _openPortal();
          return { ok: true, verifiedRoute: route };
        })
        .catch(function () {
          showError('IX ID ROUTE API UNAVAILABLE');
          return { ok: false, code: 'API_UNAVAILABLE', message: 'IX ID route API unavailable — cannot verify.' };
        });
    }

    function getVerifiedRoute() { return verifiedRoute; }

    return {
      validateParams:            validateParams,
      processHandoff:            processHandoff,
      revalidateBeforeExecution: revalidateBeforeExecution,
      getVerifiedRoute:          getVerifiedRoute,
      /* internal helpers exported for fine-grained tests */
      _parseAmountToAtomic:      parseAmountToAtomic,
      _atomicToDisplay:          atomicToDisplay,
      _routeApiUrl:              routeApiUrl,
    };
  }

  return { _createHandoffContext: _createHandoffContext };
}));
