/**
 * IX ID Public Identity Page — v0.1
 * ==================================
 * Browser module (also Node.js-importable for tests).
 *
 * This module is a dumb consumer of the frozen public edge.
 * It renders what the API returns; it does not re-derive status labels,
 * expiry judgements, or domain-selection logic.
 *
 * Governing invariant
 * -------------------
 * The browser renders presentation authority; it does not reconstruct it.
 *
 *   CORRECT:   element.textContent = view.domain.label
 *   FORBIDDEN: if (status === 'ACTIVE') { element.textContent = 'Official Website Verified'; }
 *
 * Architecture
 * ------------
 * Layer 1 — parseIxId(hostname)         pure; no DOM, no network
 * Layer 2 — buildDisplayModel(response) pure; converts API response to display model
 * Layer 3 — applyDisplayModel(root, m)  DOM mutations; tested via applyDisplayModel directly
 * Layer 4 — bootstrap()                 wires layers 1-3 in the browser
 *
 * The tests cover layers 1 and 2 in Node.js without a DOM.
 */
(function (global) {
  'use strict';

  // -------------------------------------------------------------------------
  // Layer 1: IX ID resolution
  // -------------------------------------------------------------------------

  /**
   * Parse the IX ID from a hostname.
   *
   * Production:   mariastacos.ixid.me → 'mariastacos'
   * Dev override: localhost/?ix_id=alice → 'alice'  (localhost/127.0.0.1 only)
   * Not found:    → null
   *
   * Security invariant
   * ------------------
   * On any *.ixid.me hostname the IX ID is derived exclusively from the
   * hostname. The query string is never consulted, so
   * ``mariastacos.ixid.me?ix_id=attacker`` always returns ``mariastacos``.
   *
   * The dev override is recognised only when the hostname is an explicitly
   * listed local-development host (localhost, 127.0.0.1). It is never
   * applied when the page is served from any other hostname, including
   * production subdomains, staging, or preview URLs.
   *
   * Multi-level subdomains (foo.bar.ixid.me) are rejected in v0.1.
   * IX IDs occupy exactly one subdomain label.
   *
   * @param {string} hostname - window.location.hostname (no port)
   * @param {string} [search]  - window.location.search (dev override only)
   * @returns {string|null}
   */
  function parseIxId(hostname, search) {
    if (typeof hostname !== 'string') return null;

    const parts = hostname.split('.');

    // Production path: exactly <id>.ixid.me — one subdomain label, no more.
    // Rejects: ixid.me (no subdomain), foo.bar.ixid.me (multi-level).
    if (
      parts.length === 3 &&
      parts[1] === 'ixid' &&
      parts[2] === 'me'
    ) {
      return parts[0] || null;
    }

    // Dev override — accepted only on explicitly recognised local hosts.
    // Never applied on ixid.me or any other public hostname.
    var DEV_HOSTS = ['localhost', '127.0.0.1'];
    if (DEV_HOSTS.indexOf(hostname) !== -1 && typeof search === 'string') {
      var params = new URLSearchParams(search);
      var id = params.get('ix_id');
      return id || null;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Layer 2: display model derivation (pure — no DOM, no network)
  // -------------------------------------------------------------------------

  /**
   * Format an ISO datetime string for human display.
   * Returns null if the input is null or unparseable.
   *
   * @param {string|null} iso
   * @returns {string|null}
   */
  function formatVerifiedSince(iso) {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (_) {
      return iso;
    }
  }

  /**
   * Build the display model from an API response.
   *
   * The display model is a plain data object containing exactly what the
   * page should render. All values come from the API response; none are
   * re-derived from status codes or lifecycle constants defined in this file.
   *
   * @param {object|null} apiResponse - JSON-parsed edge response body
   * @param {number} httpStatus - HTTP status code from the fetch
   * @returns {object} display model
   */
  function buildDisplayModel(apiResponse, httpStatus) {
    // 404: IX ID not found — deliberate public state, not a broken-page error.
    // Identified by HTTP status, not by field presence, to distinguish from
    // server errors that also lack an ix_id field.
    if (httpStatus === 404) {
      return {
        state: 'NOT_FOUND',
        ixId: null,
        domainStatus: null,
        domainLabel: null,
        domainSubject: null,
        verifiedSince: null,
        evaluatedAt: null,
      };
    }

    // Network or server error: any non-200 response, or a 200 without ix_id
    if (!apiResponse || !apiResponse.ix_id) {
      return {
        state: 'ERROR',
        ixId: null,
        domainStatus: null,
        domainLabel: null,
        domainSubject: null,
        verifiedSince: null,
        evaluatedAt: null,
      };
    }

    const domain = apiResponse.domain || {};

    // All display values come directly from the API response.
    // The Presentation Kernel is the sole presentation authority.
    return {
      state: 'FOUND',
      ixId: apiResponse.ix_id,
      // domain fields drive display — sourced from API, not re-derived
      domainStatus: domain.status,        // VERIFIED | RECHECK_PENDING | EXPIRED | NOT_CURRENT | NONE
      domainLabel: domain.label,          // human-readable string from kernel; may be null for NONE
      domainSubject: domain.subject,      // the domain string, e.g. "mariastacos.com"; null if NONE
      verifiedSince: formatVerifiedSince(domain.verified_since),
      evaluatedAt: apiResponse.evaluated_at,
    };
  }

  // -------------------------------------------------------------------------
  // Layer 3: DOM mutations
  // -------------------------------------------------------------------------

  /**
   * Apply a display model to the page DOM.
   *
   * The rootEl must contain elements with the following data-ix attributes:
   *   data-ix="id"            — the IX ID string
   *   data-ix="status-badge"  — receives data-status attribute + text
   *   data-ix="label"         — human-readable label (may be empty)
   *   data-ix="subject"       — verified domain string
   *   data-ix="verified-since"— formatted verification date
   *   data-ix="evaluated-at"  — ISO timestamp of evaluation
   *
   * The root element itself receives a data-page-state attribute:
   *   "loading" | "found" | "not-found" | "error"
   *
   * @param {Element} rootEl
   * @param {object} model - from buildDisplayModel()
   */
  function applyDisplayModel(rootEl, model) {
    const pageState = model.state === 'FOUND'
      ? 'found'
      : model.state === 'NOT_FOUND'
        ? 'not-found'
        : 'error';

    rootEl.dataset.pageState = pageState;

    function set(attr, value) {
      const el = rootEl.querySelector(`[data-ix="${attr}"]`);
      if (!el) return;
      el.textContent = value != null ? value : '';
    }

    function setAttr(attr, attrName, value) {
      const el = rootEl.querySelector(`[data-ix="${attr}"]`);
      if (!el) return;
      if (value != null) {
        el.setAttribute(attrName, value);
      } else {
        el.removeAttribute(attrName);
      }
    }

    set('id', model.ixId);
    set('label', model.domainLabel);
    set('subject', model.domainSubject);
    set('verified-since', model.verifiedSince);
    set('evaluated-at', model.evaluatedAt);

    // Status badge: text from API, data-status attribute for CSS
    set('status-badge', model.domainLabel || model.domainStatus || '');
    setAttr('status-badge', 'data-status', model.domainStatus);
  }

  // -------------------------------------------------------------------------
  // Layer 4: browser bootstrap
  // -------------------------------------------------------------------------

  /**
   * Wire layers 1–3 in the browser.
   *
   * Called by index.html after the DOM is ready.
   * Fetches from the same-origin API path ``/api/public/identity/{ix_id}``.
   * No CORS configuration is required because the page and the API share
   * the same origin under the *.ixid.me wildcard ingress.
   *
   * The apiBasePath parameter defaults to '/api' and should not normally
   * need to change. It exists so the integration can be verified before
   * the wildcard ingress is configured.
   *
   * @param {string} [apiBasePath='/api'] - base path for same-origin API calls
   */
  function bootstrap(apiBasePath) {
    var base = typeof apiBasePath === 'string' ? apiBasePath : '/api';
    var root = document.getElementById('ix-root');
    if (!root) return;

    root.dataset.pageState = 'loading';

    var ixId = parseIxId(window.location.hostname, window.location.search);
    if (!ixId) {
      applyDisplayModel(root, buildDisplayModel(null, 404));
      return;
    }

    var el = root.querySelector('[data-ix="id"]');
    if (el) el.textContent = ixId;

    fetch(base + '/public/identity/' + encodeURIComponent(ixId))
      .then(function (resp) {
        return resp.json().then(function (body) {
          return { httpStatus: resp.status, body: body };
        });
      })
      .then(function (result) {
        var model = buildDisplayModel(result.body, result.httpStatus);
        applyDisplayModel(root, model);
      })
      .catch(function () {
        applyDisplayModel(root, buildDisplayModel(null, 503));
      });
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseIxId, buildDisplayModel, formatVerifiedSince };
  } else {
    global.IxIdentity = {
      parseIxId: parseIxId,
      buildDisplayModel: buildDisplayModel,
      formatVerifiedSince: formatVerifiedSince,
      applyDisplayModel: applyDisplayModel,
      bootstrap: bootstrap,
    };
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
