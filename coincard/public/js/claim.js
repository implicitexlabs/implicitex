/* claim.js — Coin Card progressive disclosure claim flow
 *
 * Sections reveal as the user builds trust:
 *   section-wallet   — always visible; connect wallet or enter address manually
 *   section-plan     — revealed after wallet is set
 *   section-address  — revealed after plan is selected
 *   section-identity — revealed after a valid address is entered
 *   section-submit   — revealed after name + email are filled
 *
 * ── Wallet verification paths ────────────────────────────────────────────────
 *
 *   Connected path (recommended):
 *     1. eth_requestAccounts → get address
 *     2. wallet_switchEthereumChain to Polygon (0x89 / 137)
 *     3. personal_sign ownership message → signature stored in payload
 *     Result: walletVerified: true, walletVerificationMethod: 'connected_sign'
 *
 *   Pasted path:
 *     1. User enters a syntactically valid 0x address
 *     2. Warning displayed: funds route here, control not yet proven
 *     3. Admin must verify wallet control before activating the card
 *     Result: walletVerified: false, walletVerificationMethod: 'paste_unverified'
 *
 * ── Phase 0 ownership proof ───────────────────────────────────────────────────
 *
 *   What walletProofCollected: true means in Phase 0:
 *     "The wallet was present and signed the message presented by this browser."
 *
 *   What it does NOT mean:
 *     "ImplicitEx independently verified wallet ownership using a trusted challenge."
 *
 *   walletOwnershipVerified stays false until the production verification path
 *   exists. The two-field model makes the distinction explicit in the data
 *   rather than relying on comments to qualify a single boolean.
 *
 *   Production challenge spec (server-issued, context-bound):
 *     domain, wallet address, proposed card slug, chain ID,
 *     issuedAt, expiresAt, nonce, purpose: 'claim_coin_card'
 *
 *   Server must verify before accepting submission:
 *     - challenge exists and is unused
 *     - not expired
 *     - recovered signer matches claimed wallet (ecrecover)
 *     - domain, chain, purpose, and card identity match submission
 *     - challenge atomically consumed before claim is written
 *
 *   This blocks replay across submissions AND across contexts — a signature
 *   collected for login, another domain, another slug, or another chain
 *   cannot become Coin Card ownership evidence.
 *
 * ── Firestore collection: coincard_requests ──────────────────────────────────
 *
 *   cardId, displayName, email, wallet
 *   walletVerified, walletVerificationMethod, walletSignature, walletNonce, walletVerifiedAt
 *   tier, platform (null if not selected)
 *   status: 'requested'
 *   createdAt
 *   source: 'coincard.click/claim'
 *
 *   activatedAt and registrationExpiresAt are absent here.
 *   The renewal clock belongs to the identity, not the request.
 *   Both fields are written when status transitions to "live".
 *   Email identifies and contacts the owner.
 *   Wallet signatures prove control of payment destinations.
 *   Email access alone does not authorize a wallet change.
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────────────
 *
 *   requested → approved → provisioned → live
 *   requested → rejected  (username released after REJECTED_HOLD_DAYS)
 *   requested → abandoned (no action after REQUEST_EXPIRY_DAYS; username released)
 *
 * ── Firestore security rules (Phase 0) ───────────────────────────────────────
 *
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /coincard_requests/{docId} {
 *         allow create: if true;
 *         allow read, update, delete: if false;
 *       }
 *     }
 *   }
 *
 *   Phase 1: App Check attestation
 *   Phase 2: request.auth.token.email_verified
 */

(function () {
  'use strict';

  /* ── Firebase config ──────────────────────────────────────────────────────
   * Public values — not secret. Firebase security rules control access.
   * Replace placeholders from:
   * Firebase Console → Project settings → Your apps → Web app → Config
   * ──────────────────────────────────────────────────────────────────────── */
  var FIREBASE_CONFIG = {
    apiKey:            'REPLACE_WITH_FIREBASE_API_KEY',
    authDomain:        'implicitex.firebaseapp.com',
    projectId:         'implicitex',
    storageBucket:     'implicitex.appspot.com',
    messagingSenderId: 'REPLACE_WITH_SENDER_ID',
    appId:             'REPLACE_WITH_APP_ID',
  };

  /* ── Validation ──────────────────────────────────────────────────────────── */

  var CARD_ID_RE = /^[a-zA-Z0-9_-]{3,32}$/;
  var ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  var EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* RESERVED_SYSTEM — structural names that conflict with platform routing.
   * Reserved forever. Claiming "admin" or "claim" would break the product. */
  var RESERVED_SYSTEM = new Set([
    'admin','support','api','login','register','verify','wallet',
    'about','privacy','terms','help','docs','claim',
    'create','settings','dashboard','account','billing','status',
    'coincard','coin-card','implicitex',
  ]);

  /* RESERVED_PROTECTED — well-known brand and platform names held to prevent
   * impersonation and obvious abuse. Expand as patterns emerge. */
  var RESERVED_PROTECTED = new Set([
    'apple','google','microsoft','visa','mastercard','paypal',
    'stripe','amazon','cocacola','mcdonalds','tesla','nike','adidas',
    'facebook','instagram','tiktok','youtube','twitter','twitch',
    'business',
  ]);

  /* ── Polygon ─────────────────────────────────────────────────────────────── */

  var POLYGON_CHAIN_ID = '0x89'; /* 137 decimal */

  /* ── Application state ───────────────────────────────────────────────────── */

  var wallet = {
    address:    null,
    verified:   false,
    method:     null,      /* 'connected_sign' | 'paste_unverified' */
    signature:  null,
    nonce:      null,
    verifiedAt: null,
  };

  var form = {
    tier:        'creator',
    cardId:      '',
    displayName: '',
    email:       '',
    platform:    null,
  };

  /* ── Progressive disclosure ──────────────────────────────────────────────── */

  function reveal(id) {
    var el = document.getElementById(id);
    if (!el || el.dataset.revealed) return;
    el.dataset.revealed = '1';
    el.style.display = '';
    void el.getBoundingClientRect(); /* force layout so CSS initial state commits */
    el.style.opacity        = '1';
    el.style.transform      = 'translateY(0)';
    el.style.pointerEvents  = 'auto';
    setTimeout(function () {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
  }

  function isSectionRevealed(id) {
    var el = document.getElementById(id);
    return !!(el && el.dataset.revealed);
  }

  /* ── Error helpers ────────────────────────────────────────────────────────── */

  function showError(fieldId, msg) {
    var el = document.getElementById(fieldId + '-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-visible');
  }

  function clearError(fieldId) {
    var el = document.getElementById(fieldId + '-error');
    if (!el) return;
    el.textContent = '';
    el.classList.remove('is-visible');
  }

  /* ── Section 1: Wallet ───────────────────────────────────────────────────── */

  var connectWalletBtn      = document.getElementById('connectWalletBtn');
  var walletConnectArea     = document.getElementById('walletConnectArea');
  var walletVerifiedPanel   = document.getElementById('walletVerifiedPanel');
  var walletVerifiedAddr    = document.getElementById('walletVerifiedAddr');
  var walletUnverifiedPanel = document.getElementById('walletUnverifiedPanel');
  var walletUnverifiedAddr  = document.getElementById('walletUnverifiedAddr');
  var walletTroubleArea     = document.getElementById('walletTroubleArea');
  var walletFallbackToggle  = document.getElementById('walletFallbackToggle');
  var walletFallback        = document.getElementById('walletFallback');
  var walletPasteInput      = document.getElementById('walletPasteInput');
  var changeWalletBtn       = document.getElementById('changeWalletBtn');

  if (connectWalletBtn) {
    connectWalletBtn.addEventListener('click', handleConnectWallet);
  }

  /* Trouble toggle — reveals manual entry only after an explicit second step */
  if (walletFallbackToggle && walletFallback) {
    walletFallbackToggle.addEventListener('click', function () {
      var isHidden = walletFallback.style.display === 'none';
      walletFallback.style.display = isHidden ? '' : 'none';
      walletFallbackToggle.textContent = isHidden
        ? 'Hide \u2190'
        : 'Having trouble? Continue another way \u2192';
    });
  }

  if (walletPasteInput) {
    walletPasteInput.addEventListener('input', handleWalletPaste);
  }

  /* Change wallet — resets wallet state and restores connect area */
  if (changeWalletBtn) {
    changeWalletBtn.addEventListener('click', function () {
      wallet.address    = null;
      wallet.verified   = false;
      wallet.method     = null;
      wallet.signature  = null;
      wallet.nonce      = null;
      wallet.verifiedAt = null;

      if (walletVerifiedPanel)   walletVerifiedPanel.style.display   = 'none';
      if (walletUnverifiedPanel) walletUnverifiedPanel.style.display = 'none';
      if (walletConnectArea)     walletConnectArea.style.display     = '';
      if (walletTroubleArea)     walletTroubleArea.style.display     = 'none';
      if (walletFallback)        walletFallback.style.display        = 'none';
      if (walletFallbackToggle)  walletFallbackToggle.textContent    = 'Having trouble? Continue another way \u2192';
      if (walletPasteInput)      walletPasteInput.value              = '';
      clearError('walletPaste');
      clearError('wallet-connect');
    });
  }

  /* MetaMask connection + Polygon switch + personal_sign ownership proof */
  async function handleConnectWallet() {
    clearError('wallet-connect');
    setConnectBtnState('loading');

    if (!window.ethereum) {
      /* No wallet detected — surface the trouble area without a hard error.
       * The primary story stays intact; alternatives appear when needed. */
      if (walletTroubleArea) walletTroubleArea.style.display = '';
      setConnectBtnState('idle');
      return;
    }

    try {
      /* 1. Request account access */
      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts.length) throw new Error('No accounts returned.');
      var address = accounts[0];

      /* 2. Ensure Polygon network */
      await ensurePolygon();

      /* 3. Sign ownership message */
      var nonce   = generateNonce();
      var ts      = new Date().toISOString();
      var message = buildVerificationMessage(address, nonce, ts);

      var signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      /* 4. Commit verified wallet to state */
      wallet.address    = address;
      wallet.verified   = true;
      wallet.method     = 'connected_sign';
      wallet.signature  = signature;
      wallet.nonce      = nonce;
      wallet.verifiedAt = ts;

      /* 5. Update UI + advance form */
      if (walletPasteInput) walletPasteInput.value = '';
      clearError('walletPaste');
      showWalletVerified(address);
      onWalletSet();

    } catch (err) {
      if (err.code === 4001) {
        showError('wallet-connect', 'Connection or signature cancelled. Please try again.');
      } else if (err.message) {
        showError('wallet-connect', err.message);
      } else {
        showError('wallet-connect', 'Could not connect wallet. Please try again or enter your address below.');
      }
    }

    setConnectBtnState('idle');
  }

  async function ensurePolygon() {
    var chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId === POLYGON_CHAIN_ID) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: POLYGON_CHAIN_ID }],
      });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        /* Chain not yet in wallet — add it */
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:         POLYGON_CHAIN_ID,
            chainName:       'Polygon',
            nativeCurrency:  { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls:         ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com'],
          }],
        });
      } else if (switchErr.code === 4001) {
        throw new Error('Please switch to the Polygon network in your wallet and try again.');
      } else {
        throw switchErr;
      }
    }
  }

  function handleWalletPaste() {
    var raw = walletPasteInput.value.trim();
    clearError('walletPaste');

    if (!raw) {
      if (wallet.method === 'paste_unverified') {
        wallet.address = null;
        wallet.method  = null;
        if (walletUnverifiedPanel) walletUnverifiedPanel.style.display = 'none';
      }
      return;
    }

    if (!ADDRESS_RE.test(raw)) {
      if (raw.length >= 42) {
        showError('walletPaste', 'Wallet addresses start with 0x and are 42 characters long.');
      }
      return;
    }

    /* Valid address — mark unverified */
    wallet.address    = raw;
    wallet.verified   = false;
    wallet.method     = 'paste_unverified';
    wallet.signature  = null;
    wallet.nonce      = null;
    wallet.verifiedAt = null;

    if (walletUnverifiedPanel) {
      walletUnverifiedPanel.style.display = 'flex';
      if (walletUnverifiedAddr) walletUnverifiedAddr.textContent = raw;
    }
    if (walletVerifiedPanel) walletVerifiedPanel.style.display = 'none';

    onWalletSet();
  }

  function onWalletSet() {
    reveal('section-plan');
    rebuildSummaryIfVisible();
  }

  function showWalletVerified(address) {
    if (walletConnectArea)     walletConnectArea.style.display    = 'none';
    if (walletUnverifiedPanel) walletUnverifiedPanel.style.display = 'none';
    if (walletVerifiedPanel) {
      walletVerifiedPanel.style.display = 'flex';
      if (walletVerifiedAddr) walletVerifiedAddr.textContent = address;
    }
  }

  function setConnectBtnState(state) {
    if (!connectWalletBtn) return;
    var label = connectWalletBtn.querySelector('.cc-wallet-connect-label');
    if (state === 'loading') {
      connectWalletBtn.disabled = true;
      if (label) label.textContent = 'Connecting\u2026';
    } else {
      connectWalletBtn.disabled = false;
      if (label) label.textContent = 'Connect wallet';
    }
  }

  /* ── Crypto helpers ───────────────────────────────────────────────────────── */

  function generateNonce() {
    var chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < 16; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  function buildVerificationMessage(address, nonce, timestamp) {
    return [
      'Verify Coin Card wallet ownership',
      '',
      'Domain: coincard.click',
      'Wallet: '       + address,
      'Requested at: ' + timestamp,
      'Nonce: '        + nonce,
    ].join('\n');
  }

  /* ── Section 2: Plan ──────────────────────────────────────────────────────── */

  var tierRadios = document.querySelectorAll('input[name="tier"]');
  tierRadios.forEach(function (radio) {
    radio.addEventListener('change', function () {
      form.tier = radio.value;
      reveal('section-address');
      rebuildSummaryIfVisible();
    });
  });

  /* ── Section 3: Address ───────────────────────────────────────────────────── */

  var cardIdInput = document.getElementById('cardId');

  if (cardIdInput) {
    cardIdInput.addEventListener('input', function () {
      /* Auto-lowercase and strip disallowed characters */
      var raw   = cardIdInput.value;
      var clean = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (clean !== raw) cardIdInput.value = clean;

      clearError('cardId');
      var val = cardIdInput.value;

      if (val.length >= 3 && !CARD_ID_RE.test(val)) {
        showError('cardId', 'Use only letters, digits, hyphens, and underscores (3\u201332 chars).');
      }

      if (CARD_ID_RE.test(val)) {
        form.cardId = val;
        reveal('section-identity');
        rebuildSummaryIfVisible();
      }
    });
  }

  /* ── Section 4: Identity ──────────────────────────────────────────────────── */

  var displayNameInput = document.getElementById('displayName');
  var emailInput       = document.getElementById('email');
  var platformEl       = document.getElementById('platform');

  function checkIdentityComplete() {
    var name  = displayNameInput ? displayNameInput.value.trim() : '';
    var email = emailInput       ? emailInput.value.trim()       : '';
    if (name && email) {
      buildSubmitSummary(); /* populate before reveal so it's ready when section fades in */
      reveal('section-submit');
    }
  }

  if (displayNameInput) {
    displayNameInput.addEventListener('input', function () {
      clearError('displayName');
      checkIdentityComplete();
      rebuildSummaryIfVisible();
    });
  }

  if (emailInput) {
    emailInput.addEventListener('input', function () {
      clearError('email');
      checkIdentityComplete();
      rebuildSummaryIfVisible();
    });
  }

  if (platformEl) {
    platformEl.addEventListener('change', function () {
      form.platform = platformEl.value || null;
      rebuildSummaryIfVisible();
    });
  }

  /* ── Section 5: Submit ────────────────────────────────────────────────────── */

  /* Build / rebuild the lightweight summary shown above the submit button */
  function buildSubmitSummary() {
    var summaryEl = document.getElementById('submitSummary');
    if (!summaryEl || !wallet.address) return;

    var tierRadio = document.querySelector('input[name="tier"]:checked');
    var tier      = tierRadio ? tierRadio.value : 'creator';
    var cardId    = cardIdInput       ? cardIdInput.value.trim()       : '';
    var name      = displayNameInput  ? displayNameInput.value.trim()  : '';
    var email     = emailInput        ? emailInput.value.trim()        : '';
    var platform  = platformEl && platformEl.value ? platformEl.value : null;

    var shortAddr = wallet.address.slice(0, 6) + '\u2026' + wallet.address.slice(-4);
    var verifiedRow = wallet.verified
      ? { key: '',       val: '<span class="cc-review-badge cc-review-badge-verified">\u2713\u00a0Ownership verified</span>' }
      : { key: '',       val: '<span class="cc-review-badge cc-review-badge-unverified">\u26A0\u00a0Ownership not yet verified</span>' };

    var tierLabel = tier === 'business' ? 'Business \u2014 $25/year' : 'Creator \u2014 $10/year';

    var rows = [
      { key: 'Address',  val: 'coincard.click/' + escapeHtml(cardId) },
      { key: 'Wallet',   val: '<span class="cc-review-val--mono">' + escapeHtml(shortAddr) + '</span>' },
      verifiedRow,
      { key: 'Plan',     val: escapeHtml(tierLabel) },
      { key: 'Name',     val: escapeHtml(name) },
      { key: 'Email',    val: escapeHtml(email) },
    ];

    if (platform) rows.push({ key: 'Channel', val: escapeHtml(platform) });

    summaryEl.innerHTML =
      '<p class="cc-submit-summary-label">Coin Card</p>' +
      '<div class="cc-review-table">' +
      rows.map(function (r) {
        return '<div class="cc-review-row">' +
          '<span class="cc-review-key">' + r.key + '</span>' +
          '<span class="cc-review-val">' + r.val  + '</span>' +
          '</div>';
      }).join('') +
      '</div>';
  }

  /* Rebuild the summary only when the submit section is already visible */
  function rebuildSummaryIfVisible() {
    if (isSectionRevealed('section-submit')) buildSubmitSummary();
  }

  var submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitRequest);
  }

  function submitRequest() {
    clearError('submit');

    /* Wallet */
    if (!wallet.address) {
      showError('submit', 'Please connect a wallet before submitting.');
      return;
    }

    /* Card ID */
    var cardId = cardIdInput ? cardIdInput.value.trim() : '';
    if (!cardId) {
      showError('submit', 'Please choose a Coin Card address.');
      return;
    }
    if (!CARD_ID_RE.test(cardId)) {
      showError('submit', 'Coin Card address: letters, digits, hyphens, and underscores only (3\u201332 chars).');
      return;
    }
    if (RESERVED_SYSTEM.has(cardId.toLowerCase()) || RESERVED_PROTECTED.has(cardId.toLowerCase())) {
      showError('submit', 'That address is reserved. Please choose a different one.');
      if (cardIdInput) cardIdInput.focus();
      return;
    }

    /* Identity */
    var displayName = displayNameInput ? displayNameInput.value.trim() : '';
    if (!displayName) {
      showError('submit', 'Please enter your name.');
      return;
    }

    var email = emailInput ? emailInput.value.trim() : '';
    if (!email) {
      showError('submit', 'Please enter your email address.');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showError('submit', "That doesn\u2019t look like a valid email address.");
      return;
    }

    /* Collect final form values */
    var tierRadio = document.querySelector('input[name="tier"]:checked');
    form.tier        = tierRadio ? tierRadio.value : 'creator';
    form.cardId      = cardId;
    form.displayName = displayName;
    form.email       = email;
    form.platform    = platformEl && platformEl.value ? platformEl.value : null;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Sending\u2026';

    var payload = {
      cardId:                   form.cardId,
      displayName:              form.displayName,
      email:                    form.email,
      wallet:                   wallet.address,
      walletProofCollected:     wallet.verified,   /* true = browser-witnessed signature; see Phase 0 note above */
      walletOwnershipVerified:  false,              /* set true only after server-side ecrecover in production */
      walletVerificationMethod: wallet.method,
      walletSignature:          wallet.signature  || null,
      walletNonce:              wallet.nonce      || null,
      walletVerifiedAt:         wallet.verifiedAt || null,
      tier:                     form.tier,
      platform:                 form.platform,
      status:                   'requested',
      createdAt:                new Date().toISOString(),
      /* activatedAt / registrationExpiresAt absent — written at "live" transition */
      source:                   'coincard.click/claim',
    };

    Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    ])
    .then(function (modules) {
      var firebaseApp   = modules[0];
      var firebaseStore = modules[1];
      var app = firebaseApp.initializeApp(FIREBASE_CONFIG);
      var db  = firebaseStore.getFirestore(app);
      var col = firebaseStore.collection(db, 'coincard_requests');
      return firebaseStore.addDoc(col, payload);
    })
    .then(function () {
      showConfirmation(form.email, form.cardId);
    })
    .catch(function (err) {
      console.error('Firestore write failed:', err);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Coin Card request';
      showError('submit', 'Something went wrong. Please try again in a moment.');
    });
  }

  /* ── Confirmation ─────────────────────────────────────────────────────────── */

  function showConfirmation(email, cardId) {
    /* Hide all form sections and page chrome */
    ['section-wallet', 'section-plan', 'section-address', 'section-identity', 'section-submit']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

    var heading  = document.querySelector('.cc-claim-heading');
    var backLink = document.querySelector('.cc-claim-back');
    if (heading)  heading.style.display  = 'none';
    if (backLink) backLink.style.display = 'none';

    /* Show confirmation panel */
    var confirmPanel    = document.getElementById('confirmPanel');
    var confirmEmail    = document.getElementById('confirmEmail');
    var confirmCardIdEl = document.getElementById('confirmCardId');

    if (confirmEmail)    confirmEmail.textContent    = email;
    if (confirmCardIdEl) confirmCardIdEl.textContent = cardId;
    if (confirmPanel) {
      confirmPanel.style.display = '';
      confirmPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ── Utility ──────────────────────────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

  /* ── Pre-fill tier from URL ───────────────────────────────────────────────── */

  (function prefillTier() {
    var params = new URLSearchParams(window.location.search);
    var tier   = (params.get('tier') || '').toLowerCase();
    if (tier === 'business') {
      var radio = document.querySelector('input[name="tier"][value="business"]');
      if (radio) radio.checked = true;
      form.tier = 'business';
    }
  })();

})();
