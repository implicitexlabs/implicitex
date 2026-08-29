/**
 * payment-intent.js — IX ID Payment Intent
 * =========================================
 * Pure functions for: amount validation, fee calculation, route resolution,
 * payment intent construction, stale-route protection, and handoff URL building.
 *
 * Product boundary
 * ----------------
 * This module belongs to IX ID. It resolves the identity-to-route mapping and
 * constructs an immutable payment intent. It does NOT execute transfers.
 *
 * IX ID responsibilities (this module):
 *   - resolve the authoritative payment route for an IX ID
 *   - validate the payer's requested amount
 *   - detect a stale route before handoff (claim_id changed)
 *   - build the canonical handoff URL to the ImplicitEx transfer portal
 *
 * ImplicitEx responsibilities (ixid-handoff.js):
 *   - independently validate the handoff URL parameters
 *   - re-verify destination against the IX ID route API
 *   - apply amount/fee/asset/chain constraints
 *   - present the review screen before any wallet interaction
 *
 * Asset binding (frozen)
 * ----------------------
 * Chain:    Polygon (chain ID 137)
 * Asset:    Native USDC — Circle's canonical contract on Polygon PoS
 * Contract: 0x3c499c542cef5e3811e1192ce70d8cc03d5c3359 (lowercase)
 * Binding:  polygon-pos-native-usdc-v1
 *
 * Amount rules (from ImplicitEx chains.js, frozen)
 * -------------------------------------------------
 * Minimum:  1 USDC  (1_000_000 atomic units)
 * Maximum:  250 USDC (250_000_000 atomic units)
 * Fee:      1% of recipient amount (100 basis points)
 * At 250 USDC max, fee = 2.50 USDC — cap of 10 USDC does not activate.
 *
 * Arithmetic
 * ----------
 * All amount calculations use BigInt. Binary floating-point is never used
 * for monetary values. The URL transport uses a decimal string representation
 * derived from BigInt division, not from floating-point conversion.
 *
 * Stale-route invariant
 * ---------------------
 * claim_A resolved → payer enters amount → route mutated to claim_B:
 *   checkStaleRoute() re-fetches the route and detects the mismatch.
 *   The intent is invalidated. The payer is never handed to ImplicitEx with
 *   a destination that differs from what they reviewed.
 *
 * Node.js / browser dual export
 * ------------------------------
 * CommonJS (module.exports) when loaded in Node.js, window.IxidPaymentIntent
 * when loaded as a browser script.
 */
(function exposePaymentIntent(root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.IxidPaymentIntent = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Frozen asset and chain constants
  // -------------------------------------------------------------------------

  var ASSET_BINDING_VERSION = 'polygon-pos-native-usdc-v1';
  var NATIVE_USDC_CONTRACT  = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'; // lowercase
  var POLYGON_CHAIN_ID      = 137;

  // -------------------------------------------------------------------------
  // Amount bounds (atomic USDC — 6 decimal places)
  // -------------------------------------------------------------------------

  var MIN_AMOUNT_ATOMIC = 1000000n;    // 1 USDC
  var MAX_AMOUNT_ATOMIC = 250000000n;  // 250 USDC
  var FEE_BASIS_POINTS  = 100n;        // 1%
  var FEE_DENOMINATOR   = 10000n;

  // -------------------------------------------------------------------------
  // Merchant/order context — mirrors the ImplicitEx portal contract exactly
  // -------------------------------------------------------------------------

  // Must stay in sync with wallet.js PURPOSE_TAGS — these are the only values
  // the portal will accept into getTransferMetadata().
  var VALID_PURPOSE_TAGS = new Set([
    'invoice', 'contractor', 'refund', 'family',
    'donation', 'purchase', 'subscription', 'test', 'other',
  ]);

  var REFERENCE_MAX_LENGTH = 80;   // wallet.js: referenceId.slice(0, 80)
  var MEMO_MAX_LENGTH      = 140;  // wallet.js: memo.slice(0, 140)

  // -------------------------------------------------------------------------
  // Decimal ↔ atomic conversion (BigInt only — no float)
  // -------------------------------------------------------------------------

  /**
   * Parse a human-readable USDC string to atomic BigInt (6 decimal places).
   *
   * Accepts: "1", "1.5", "250", "1.000001", "0.01"
   * Rejects: "", null, "-1", "0", "0.0", "abc", "1.1234567" (>6 decimal)
   *
   * All arithmetic uses BigInt. Binary floating-point is never consulted.
   *
   * @param {string|*} input
   * @returns {BigInt|null} null on any validation failure
   */
  function parseAmountToAtomic(input) {
    if (typeof input === 'number') {
      if (!Number.isFinite(input) || input <= 0) return null;
      input = input.toString();
    } else if (typeof input !== 'string') {
      return null;
    }

    input = input.trim();
    if (!input) return null;

    // Reject negative sign
    if (input.charAt(0) === '-') return null;

    // Must match non-negative decimal with at most 6 fractional digits.
    // Rejects NaN strings, infinity, exponential notation.
    if (!/^\d+(\.\d{1,6})?$/.test(input)) return null;

    var parts = input.split('.');
    var wholeStr = parts[0];
    var fracStr  = (parts[1] || '').padEnd(6, '0');

    var whole = BigInt(wholeStr) * 1000000n;
    var frac  = BigInt(fracStr);
    var total = whole + frac;

    if (total === 0n) return null; // zero rejected

    return total;
  }

  /**
   * Convert an atomic BigInt to a human-readable USDC decimal string.
   * Trailing zeros are stripped: 1_500_000n → "1.5", 1_000_000n → "1"
   *
   * @param {BigInt} atomic
   * @returns {string}
   */
  function atomicToDisplay(atomic) {
    var whole = atomic / 1000000n;
    var frac  = atomic % 1000000n;
    if (frac === 0n) return whole.toString();
    var fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
    return whole.toString() + '.' + fracStr;
  }

  // -------------------------------------------------------------------------
  // Amount validation
  // -------------------------------------------------------------------------

  /**
   * Validate a human-readable USDC amount string.
   *
   * @param {string} input
   * @returns {{ ok: boolean, atomic?: BigInt, code?: string, message?: string }}
   */
  function validateAmount(input) {
    var atomic = parseAmountToAtomic(input);
    if (atomic === null) {
      return {
        ok:      false,
        code:    'INVALID_AMOUNT',
        message: 'Amount must be a positive number with at most 6 decimal places.',
      };
    }
    if (atomic < MIN_AMOUNT_ATOMIC) {
      return {
        ok:      false,
        code:    'BELOW_MINIMUM',
        message: 'Minimum transfer amount is 1 USDC.',
      };
    }
    if (atomic > MAX_AMOUNT_ATOMIC) {
      return {
        ok:      false,
        code:    'ABOVE_MAXIMUM',
        message: 'Maximum transfer amount is 250 USDC.',
      };
    }
    return { ok: true, atomic: atomic };
  }

  // -------------------------------------------------------------------------
  // Fee calculation (integer arithmetic — no float)
  // -------------------------------------------------------------------------

  /**
   * Calculate the ImplicitEx platform fee for a given atomic amount.
   *
   * Fee is 1% (100 basis points) of amountAtomic.
   * At the current 250 USDC ceiling the 10 USDC cap does not activate.
   * Integer division throughout — matches the on-chain calculateFee() formula.
   *
   * @param {BigInt} amountAtomic
   * @returns {{ feeAtomic: BigInt, totalAtomic: BigInt }}
   */
  function calculateFee(amountAtomic) {
    var fee   = (amountAtomic * FEE_BASIS_POINTS) / FEE_DENOMINATOR;
    var total = amountAtomic + fee;
    return { feeAtomic: fee, totalAtomic: total };
  }

  // -------------------------------------------------------------------------
  // Route resolution
  // -------------------------------------------------------------------------

  /**
   * Fetch the current payment route for an IX ID from the public edge API.
   *
   * This is the authoritative source for destination_address and claim_id.
   * No destination from any other source (URL params, user input) is ever
   * trusted without first being confirmed against this response.
   *
   * @param {string}   ixId       — the IX ID handle (e.g. "alice")
   * @param {string}   [apiBasePath='/api'] — base path for the API
   * @param {Function} [fetchFn]  — optional fetch override (for tests)
   * @returns {Promise<{ ok: boolean, route?: object, code?: string, message?: string }>}
   */
  function resolveRoute(ixId, apiBasePath, fetchFn) {
    var base   = typeof apiBasePath === 'string' ? apiBasePath : '/api';
    var _fetch = typeof fetchFn === 'function' ? fetchFn : fetch;

    return _fetch(base + '/public/route/' + encodeURIComponent(ixId))
      .then(function (resp) {
        return resp.json().then(function (body) {
          return { httpStatus: resp.status, body: body };
        });
      })
      .then(function (result) {
        if (result.httpStatus === 404) {
          return { ok: false, code: 'NOT_FOUND', message: 'IX ID not found.' };
        }
        if (result.httpStatus !== 200 || !result.body) {
          return { ok: false, code: 'API_ERROR', message: 'Route API returned an unexpected response.' };
        }
        return { ok: true, route: result.body };
      })
      .catch(function (err) {
        return {
          ok:      false,
          code:    'FETCH_ERROR',
          message: (err && err.message) ? err.message : 'Network error resolving route.',
        };
      });
  }

  // -------------------------------------------------------------------------
  // Context sanitisation
  // -------------------------------------------------------------------------

  /**
   * Sanitise optional merchant/order context against the ImplicitEx portal
   * contract. Rules mirror wallet.js getTransferMetadata() exactly so values
   * written into the portal DOM match what the portal produces itself.
   *
   *   purpose_tag — must be in VALID_PURPOSE_TAGS; empty string if absent/invalid
   *   reference   — trimmed, truncated to 80 chars  (wallet.js: slice(0, 80))
   *   memo        — trimmed, truncated to 140 chars (wallet.js: slice(0, 140))
   *
   * Context is display/receipt metadata only. It does not determine destination,
   * amount, chain, asset, or any execution authority.
   *
   * @param {object|*} context
   * @returns {{ purpose_tag: string, reference: string, memo: string }}
   */
  function sanitizeContext(context) {
    if (!context || typeof context !== 'object') {
      return { purpose_tag: '', reference: '', memo: '' };
    }
    var tag = (typeof context.purpose_tag === 'string' &&
               VALID_PURPOSE_TAGS.has(context.purpose_tag))
      ? context.purpose_tag : '';
    var ref = typeof context.reference === 'string'
      ? context.reference.trim().slice(0, REFERENCE_MAX_LENGTH) : '';
    var memo = typeof context.memo === 'string'
      ? context.memo.trim().slice(0, MEMO_MAX_LENGTH) : '';
    return { purpose_tag: tag, reference: ref, memo: memo };
  }

  // -------------------------------------------------------------------------
  // Intent construction
  // -------------------------------------------------------------------------

  /**
   * Construct a canonical, immutable payment intent.
   *
   * Security invariant: destination_address comes ONLY from the API route
   * response — never from user input, URL parameters, or any other untrusted
   * source. The caller must pass the object returned by resolveRoute().
   *
   * Returns null if the route is not payable or the amount is invalid.
   *
   * @param {string}  ixId      — the IX ID handle
   * @param {object}  route     — the route body from resolveRoute().route
   * @param {string}  amountStr — human-readable USDC amount string
   * @param {object}  [context] — optional { purpose_tag?, reference?, memo? }
   * @returns {object|null}
   */
  function buildIntent(ixId, route, amountStr, context) {
    if (!ixId || typeof ixId !== 'string') return null;
    if (!route || !route.payable) return null;
    if (!route.destination_address || !route.claim_id) return null;

    // Validate asset binding — reject any route that deviates from the frozen
    // Polygon native USDC asset binding.
    var asset = route.asset;
    if (
      !asset ||
      !asset.contract ||
      !asset.asset_binding_version ||
      asset.contract.toLowerCase() !== NATIVE_USDC_CONTRACT ||
      asset.asset_binding_version !== ASSET_BINDING_VERSION
    ) {
      return null;
    }

    var amountResult = validateAmount(amountStr);
    if (!amountResult.ok) return null;

    var feeResult = calculateFee(amountResult.atomic);
    var ctx       = sanitizeContext(context);

    return {
      schema:               'ixid.payment-intent.v1',
      ix_id:                ixId,
      claim_id:             route.claim_id,
      // Destination is authoritative from the route API — never user-supplied.
      destination_address:  route.destination_address.toLowerCase(),
      chain_id:             POLYGON_CHAIN_ID,
      asset_contract:       NATIVE_USDC_CONTRACT,
      asset_binding_version: ASSET_BINDING_VERSION,
      // Atomic representations (BigInt serialized as strings for JSON safety)
      amount_atomic:        String(amountResult.atomic),
      fee_atomic:           String(feeResult.feeAtomic),
      total_atomic:         String(feeResult.totalAtomic),
      // Human-readable display values derived from BigInt (no float)
      amount_display:       atomicToDisplay(amountResult.atomic),
      fee_display:          atomicToDisplay(feeResult.feeAtomic),
      total_display:        atomicToDisplay(feeResult.totalAtomic),
      resolved_at:          new Date().toISOString(),
      // Optional merchant/order context — display/receipt metadata only
      purpose_tag:          ctx.purpose_tag,
      reference:            ctx.reference,
      memo:                 ctx.memo,
    };
  }

  // -------------------------------------------------------------------------
  // Stale-route protection
  // -------------------------------------------------------------------------

  /**
   * Re-verify that the current route still matches the expected claim_id.
   *
   * Called immediately before building the handoff URL. If the route has
   * changed (claim_B ≠ claim_A), the intent is stale and must be rejected.
   * The payer is never handed to ImplicitEx with a destination they did not review.
   *
   * @param {string}   ixId            — the IX ID handle
   * @param {string}   expectedClaimId — the claim_id captured at resolution time
   * @param {string}   [apiBasePath]   — base path for the API
   * @param {Function} [fetchFn]       — optional fetch override (for tests)
   * @returns {Promise<{ ok: boolean, stale?: boolean, code?: string, message?: string }>}
   */
  function checkStaleRoute(ixId, expectedClaimId, apiBasePath, fetchFn) {
    return resolveRoute(ixId, apiBasePath, fetchFn).then(function (result) {
      if (!result.ok) {
        return { ok: false, code: result.code, message: result.message };
      }
      var route = result.route;
      if (!route.payable || !route.claim_id) {
        return { ok: false, stale: true, code: 'ROUTE_INACTIVE', message: 'Payment route is no longer active.' };
      }
      if (route.claim_id !== expectedClaimId) {
        return {
          ok:      false,
          stale:   true,
          code:    'STALE_ROUTE',
          message: 'The payment destination changed since you opened this page. Please refresh and try again.',
        };
      }
      return { ok: true, stale: false, route: route };
    });
  }

  // -------------------------------------------------------------------------
  // Handoff URL construction
  // -------------------------------------------------------------------------

  /**
   * Build the ImplicitEx Transfer Portal URL for an IX ID payment intent.
   *
   * URL parameters:
   *   src    — 'ixid' provenance marker (ImplicitEx uses this to activate intake)
   *   ixid   — the IX ID handle
   *   to     — authoritative destination address (from route API)
   *   claim  — route revision / claim_id (stale-route binding)
   *   amount — human-readable USDC amount (e.g., "1.5")
   *   chain  — chain ID (137 = Polygon)
   *   asset  — asset binding version (polygon-pos-native-usdc-v1)
   *
   * Optional merchant/order context (omitted when empty):
   *   ptag   — purpose tag (one of VALID_PURPOSE_TAGS)
   *   ref    — merchant reference (≤ 80 chars)
   *   memo   — transfer memo (≤ 140 chars)
   *
   * ImplicitEx must validate all parameters independently against the IX ID
   * route API — it does not trust URL params as authoritative.
   * Context params are untrusted display/receipt metadata; they do not determine
   * destination, amount, chain, asset, or execution authority.
   *
   * @param {object} intent           — from buildIntent()
   * @param {string} [implicitexBase] — base URL of the ImplicitEx portal
   * @returns {string}
   */
  function buildHandoffUrl(intent, implicitexBase) {
    var base = typeof implicitexBase === 'string'
      ? implicitexBase.replace(/\/$/, '')
      : 'https://portal.implicitex.com';

    var p = new URLSearchParams();
    p.set('src',    'ixid');
    p.set('ixid',   intent.ix_id);
    p.set('to',     intent.destination_address);
    p.set('claim',  intent.claim_id);
    p.set('amount', intent.amount_display);
    p.set('chain',  String(intent.chain_id));
    p.set('asset',  intent.asset_binding_version);

    // Optional context — only appended when non-empty
    if (intent.purpose_tag) p.set('ptag', intent.purpose_tag);
    if (intent.reference)   p.set('ref',  intent.reference);
    if (intent.memo)        p.set('memo', intent.memo);

    return base + '/?' + p.toString();
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  return {
    // Constants
    ASSET_BINDING_VERSION:  ASSET_BINDING_VERSION,
    NATIVE_USDC_CONTRACT:   NATIVE_USDC_CONTRACT,
    POLYGON_CHAIN_ID:       POLYGON_CHAIN_ID,
    MIN_AMOUNT_ATOMIC:      MIN_AMOUNT_ATOMIC,
    MAX_AMOUNT_ATOMIC:      MAX_AMOUNT_ATOMIC,
    VALID_PURPOSE_TAGS:     VALID_PURPOSE_TAGS,
    REFERENCE_MAX_LENGTH:   REFERENCE_MAX_LENGTH,
    MEMO_MAX_LENGTH:        MEMO_MAX_LENGTH,

    // Core functions
    parseAmountToAtomic: parseAmountToAtomic,
    atomicToDisplay:     atomicToDisplay,
    validateAmount:      validateAmount,
    calculateFee:        calculateFee,
    resolveRoute:        resolveRoute,
    sanitizeContext:     sanitizeContext,
    buildIntent:         buildIntent,
    checkStaleRoute:     checkStaleRoute,
    buildHandoffUrl:     buildHandoffUrl,
  };
}));
