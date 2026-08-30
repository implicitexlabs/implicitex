(function exposeHolderApiClient(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IXIDHolderApi = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function buildHolderApiClient() {
  'use strict';

  function normalizeBaseUrl(value) {
    const base = String(value || '').trim().replace(/\/+$/, '');
    if (!base || !/^\/(?!\/)/.test(base) || base.includes('\\')) {
      throw new Error('holderApiBase must be a same-origin absolute path');
    }
    return base;
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function createHolderApiClient(options) {
    const settings = options || {};
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    const fetchImpl = settings.fetchImpl || root.fetch;
    const timeoutMs = settings.timeoutMs || 12000;

    if (typeof fetchImpl !== 'function') {
      throw new Error('A fetch implementation is required');
    }

    async function request(path, token, init) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(function abortTimedOutRequest() { controller.abort(); }, timeoutMs)
        : null;

      try {
        const response = await fetchImpl(baseUrl + path, Object.assign({}, init, {
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller ? controller.signal : undefined,
          headers: Object.assign({
            Accept: 'application/json',
            Authorization: 'Bearer ' + token,
          }, init && init.headers),
        }));
        return { status: response.status, body: await readJson(response) };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    return Object.freeze({
      getWorkspace: function getWorkspace(token) {
        return request('/workspace', token, { method: 'GET' });
      },

      createAccount: function createAccount(token, operationId) {
        return request('/account', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation_id: operationId }),
        });
      },

      registerIxId: function registerIxId(token, operationId, handle) {
        return request('/ix-id', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation_id: operationId, handle: handle }),
        });
      },

      updateProfile: function updateProfile(token, fields) {
        return request('/profile', token, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
      },

      issueDomainChallenge: function issueDomainChallenge(token, domain) {
        return request('/domain-challenge', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domain }),
        });
      },

      verifyDomain: function verifyDomain(token, challengeId) {
        return request('/domain-verify', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge_id: challengeId }),
        });
      },

      getDomainStatus: function getDomainStatus(token) {
        return request('/domain-status', token, { method: 'GET' });
      },

      issueWalletChallenge: function issueWalletChallenge(token, destinationAddress) {
        return request('/wallet-challenge', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination_address: destinationAddress }),
        });
      },

      verifyWallet: function verifyWallet(token, challengeId, signature) {
        return request('/wallet-verify', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge_id: challengeId, signature: signature }),
        });
      },

      getPaymentRoute: function getPaymentRoute(token) {
        return request('/payment-route', token, { method: 'GET' });
      },

      disablePaymentRoute: function disablePaymentRoute(token) {
        return request('/payment-route/disable', token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      },
    });
  }

  return Object.freeze({ createHolderApiClient: createHolderApiClient });
}));
