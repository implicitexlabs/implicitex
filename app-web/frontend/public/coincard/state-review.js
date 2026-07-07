(function () {
  'use strict';

  var fixtures = [
    {
      id: 'collapsed-acceptance-mark',
      expectLegal: true,
      state: baseState({ view: 'COLLAPSED' }),
      values: baseValues(),
    },
    {
      id: 'expanded-empty-amount',
      expectLegal: true,
      state: baseState({ view: 'EXPANDED' }),
      values: baseValues(),
    },
    {
      id: 'preview-ready-disconnected',
      expectLegal: true,
      state: baseState({
        view: 'EXPANDED',
        amountText: 'SYNTACTICALLY_COMPLETE',
        amountValidity: 'VALID',
        funding: 'UNKNOWN',
        wallet: 'DISCONNECTED',
        execution: 'PREVIEW_READY',
        receipt: 'LOCAL_READY',
      }),
      values: baseValues({
        amountUnits: '1000000',
        feeUnits: '10000',
        totalUnits: '1010000',
      }),
    },
    {
      id: 'execution-ready-connected',
      expectLegal: true,
      state: baseState({
        view: 'EXPANDED',
        amountText: 'SYNTACTICALLY_COMPLETE',
        amountValidity: 'VALID',
        funding: 'SUFFICIENT',
        wallet: 'CONNECTED_READY',
        execution: 'EXECUTION_READY',
        receipt: 'LOCAL_READY',
        activeIntentId: 'intent-ready-001',
      }),
      values: baseValues({
        amountUnits: '1000000',
        feeUnits: '10000',
        totalUnits: '1010000',
        sender: '0x1111111111111111111111111111111111111111',
      }),
    },
    {
      id: 'long-content-transfer-pending',
      expectLegal: true,
      state: baseState({
        view: 'EXPANDED',
        amountText: 'SYNTACTICALLY_COMPLETE',
        amountValidity: 'VALID',
        funding: 'SUFFICIENT',
        wallet: 'CONNECTED_READY',
        execution: 'TRANSFER_PENDING',
        receipt: 'SUBMITTED',
        activeIntentId: 'intent-transfer-001',
      }),
      values: baseValues({
        name: 'A very long recipient display name that must never move card geometry',
        recipient: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        transferHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    },
    {
      id: 'confirmed-final',
      expectLegal: true,
      state: baseState({
        view: 'EXPANDED',
        amountText: 'SYNTACTICALLY_COMPLETE',
        amountValidity: 'VALID',
        funding: 'UNKNOWN',
        wallet: 'DISCONNECTED',
        execution: 'CONFIRMED',
        receipt: 'FINAL',
        activeIntentId: 'intent-final-001',
      }),
      values: baseValues({
        transferHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        receiptStatus: 'success',
      }),
    },
    {
      id: 'illegal-collapsed-execution-ready',
      expectLegal: false,
      state: baseState({
        view: 'COLLAPSED',
        amountText: 'SYNTACTICALLY_COMPLETE',
        amountValidity: 'VALID',
        funding: 'SUFFICIENT',
        wallet: 'CONNECTED_READY',
        execution: 'EXECUTION_READY',
        receipt: 'LOCAL_READY',
        activeIntentId: 'intent-illegal-001',
      }),
      values: baseValues(),
    },
  ];

  var selected = fixtures[0];
  var list = document.getElementById('fixtureList');
  var card = document.getElementById('coinCardReview');
  var result = document.getElementById('reviewResult');
  var json = document.getElementById('fixtureJson');

  function baseState(overrides) {
    return Object.assign({
      view: 'EXPANDED',
      routeAvailability: 'AVAILABLE',
      routeValidity: 'VALID',
      routeMutability: 'LOCKED',
      networkSupport: 'SUPPORTED',
      tokenSupport: 'SUPPORTED',
      amountText: 'EMPTY',
      amountValidity: 'UNKNOWN',
      funding: 'UNKNOWN',
      wallet: 'DISCONNECTED',
      execution: 'IDLE',
      receipt: 'NONE',
      error: 'NONE',
      activeIntentId: null,
    }, overrides || {});
  }

  function baseValues(overrides) {
    return Object.assign({
      primary: 'USDC accepted here',
      name: 'ImplicitEx Demo Treasury',
      networkToken: 'POLYGON / USDC',
      product: 'COIN CARD',
      attribution: 'Powered by ImplicitEx',
      recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
      route: 'Route valid',
      destination: 'Polygon USDC',
      amountUnits: null,
      feeUnits: null,
      totalUnits: null,
      transferHash: null,
      receiptStatus: null,
    }, overrides || {});
  }

  function legal(fixture) {
    var s = fixture.state;
    var v = fixture.values || {};
    if (s.view === 'COLLAPSED' && s.execution === 'EXECUTION_READY') return false;
    if ((s.execution === 'PREVIEW_READY' || s.execution === 'EXECUTION_READY') &&
        (s.routeAvailability !== 'AVAILABLE' || s.routeValidity !== 'VALID' ||
         s.networkSupport !== 'SUPPORTED' || s.tokenSupport !== 'SUPPORTED' ||
         s.amountValidity !== 'VALID')) return false;
    if (s.execution === 'EXECUTION_READY' &&
        (s.view !== 'EXPANDED' || s.wallet !== 'CONNECTED_READY' ||
         s.funding !== 'SUFFICIENT' || !s.activeIntentId)) return false;
    if (s.execution === 'TRANSFER_PENDING' && !v.transferHash) return false;
    if (s.execution === 'CONFIRMED' &&
        (!v.transferHash || s.receipt !== 'FINAL' || v.receiptStatus !== 'success')) return false;
    return true;
  }

  function formatUnits(value) {
    if (value === null || value === undefined) return '-';
    var raw = BigInt(value);
    var sign = raw < 0n ? '-' : '';
    var abs = raw < 0n ? -raw : raw;
    var whole = abs / 1000000n;
    var frac = (abs % 1000000n).toString().padStart(6, '0');
    var trimmed = frac.replace(/0+$/, '');
    if (trimmed.length < 2) trimmed = frac.slice(0, 2);
    return sign + whole.toString() + '.' + trimmed + ' USDC';
  }

  function mid(value) {
    if (!value) return '-';
    if (value.length <= 18) return value;
    return value.slice(0, 8) + '...' + value.slice(-6);
  }

  function statusFor(state) {
    if (state.execution === 'CONFIRMED') return 'Confirmed';
    if (state.execution === 'RECONCILING') return 'Checking chain';
    if (state.execution === 'TRANSFER_PENDING') return 'Confirming';
    if (state.execution === 'TRANSFER_REQUESTED') return 'Confirm transfer';
    if (state.execution === 'APPROVAL_PENDING') return 'Approval pending';
    if (state.execution === 'APPROVAL_REQUESTED') return 'Approve in wallet';
    if (state.execution === 'FAILED') return 'Failed';
    if (state.execution === 'INTERRUPTED') return 'Interrupted';
    if (state.routeValidity === 'INVALID') return 'Route error';
    if (state.wallet === 'CONNECTED_WRONG_NETWORK') return 'Wrong network';
    if (state.funding === 'INSUFFICIENT_USDC') return 'Insufficient USDC';
    if (state.funding === 'INSUFFICIENT_GAS') return 'Insufficient gas';
    if (state.amountValidity !== 'VALID' && state.amountValidity !== 'UNKNOWN') return 'Amount error';
    if (state.execution === 'EXECUTION_READY') return 'Ready';
    if (state.execution === 'PREVIEW_READY') return 'Preview ready';
    return 'Enter amount';
  }

  function ctaFor(state) {
    if (state.view === 'COLLAPSED') return 'Expand';
    if (state.execution === 'CONFIRMED') return 'Receipt';
    if (state.execution.indexOf('PENDING') !== -1 || state.execution.indexOf('REQUESTED') !== -1) return 'Pending';
    if (state.execution === 'FAILED' || state.execution === 'INTERRUPTED') return 'Retry';
    if (state.routeValidity !== 'VALID' || state.amountValidity !== 'VALID') return 'Disabled';
    if (state.wallet === 'DISCONNECTED') return 'Connect';
    if (state.wallet === 'CONNECTED_WRONG_NETWORK') return 'Switch';
    if (state.execution === 'EXECUTION_READY') return 'Send';
    return 'Inspect';
  }

  function slot(cls, text, extra) {
    var div = document.createElement('div');
    div.className = 'slot ' + cls + (extra ? ' ' + extra : '');
    div.textContent = text;
    div.title = text;
    return div;
  }

  function renderCollapsed(fixture) {
    var values = fixture.values || {};
    card.appendChild(slot('collapsed-primary', values.primary || '-'));
    card.appendChild(slot('collapsed-secondary', statusFor(fixture.state)));
    card.appendChild(slot('collapsed-status', ''));
    card.appendChild(slot('collapsed-mark', ''));
  }

  function renderExpanded(fixture) {
    var s = fixture.state;
    var v = fixture.values || {};
    card.appendChild(slot('expanded-primary', v.primary || '-'));
    card.appendChild(slot('expanded-name', v.name || '-'));
    card.appendChild(slot('expanded-network', v.networkToken || '-'));
    card.appendChild(slot('expanded-product', v.product || '-'));
    card.appendChild(slot('expanded-attribution', v.attribution || '-'));
    card.appendChild(slot('expanded-mark', ''));
    card.appendChild(slot('expanded-divider', ''));
    card.appendChild(slot('collapse-proposed', ''));

    row(0, 'Recipient', mid(v.recipient));
    row(1, 'Route', v.route || '-');
    row(2, 'Destination', v.destination || '-');
    row(3, 'Amount', formatUnits(v.amountUnits));
    row(4, 'Fee', formatUnits(v.feeUnits));
    row(5, 'Total', formatUnits(v.totalUnits));

    card.appendChild(slot('action-divider', ''));
    card.appendChild(slot('status-dot', ''));
    card.appendChild(slot('status-text', statusFor(s)));
    card.appendChild(slot('cta-slot', ctaFor(s)));
  }

  function row(index, label, value) {
    card.appendChild(slot('row-label row-' + index, label, 'slot-label'));
    card.appendChild(slot('row-value row-' + index, value, 'slot-value'));
  }

  function renderFixture(fixture) {
    selected = fixture;
    var isLegal = legal(fixture);
    card.className = 'coin-card-review';
    card.textContent = '';
    card.dataset.view = fixture.state.view;

    if (!isLegal) {
      card.classList.add('is-illegal');
      card.textContent = 'Illegal state vector rejected';
    } else if (fixture.state.view === 'COLLAPSED') {
      renderCollapsed(fixture);
    } else {
      renderExpanded(fixture);
    }

    result.textContent = (isLegal === fixture.expectLegal ? 'PASS' : 'FAIL') + ' / ' + fixture.id;
    json.textContent = JSON.stringify(fixture, null, 2);
    syncButtons();
  }

  function syncButtons() {
    Array.from(list.querySelectorAll('button')).forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.fixtureId === selected.id ? 'true' : 'false');
    });
  }

  function init() {
    fixtures.forEach(function (fixture) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'fixture-btn';
      button.dataset.fixtureId = fixture.id;
      button.textContent = fixture.id;
      button.addEventListener('click', function () { renderFixture(fixture); });
      list.appendChild(button);
    });
    renderFixture(selected);
  }

  init();
})();
