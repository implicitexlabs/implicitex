(function () {
  'use strict';

  var contract = window.COIN_CARD_REVIEW_CONTRACT;
  var core = window.CoinCardReviewCore;
  var fixtures = contract.fixtures.fixtures;
  var selected = fixtures[0];
  var list = document.getElementById('fixtureList');
  var card = document.getElementById('coinCardReview');
  var result = document.getElementById('reviewResult');
  var actionDiagnostic = document.getElementById('actionDiagnostic');
  var json = document.getElementById('fixtureJson');

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
      approvalHash: null,
      transferHash: null,
    }, overrides || {});
  }

  function slot(cls, display, extra, accessible) {
    var div = document.createElement('div');
    var full = accessible || display;
    div.className = 'slot ' + cls + (extra ? ' ' + extra : '');
    div.textContent = display;
    div.title = full;
    div.setAttribute('aria-label', full);
    return div;
  }

  function buttonSlot(cls, label, ariaLabel) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'slot ' + cls;
    button.textContent = label;
    button.setAttribute('aria-label', ariaLabel);
    return button;
  }

  function valueForRow(rowId, values) {
    if (rowId === 'recipient') {
      return {
        display: core.middleTruncate(values.recipient, 8, 6),
        accessible: values.recipient || '-',
      };
    }
    if (rowId === 'route') return { display: values.route || '-', accessible: values.route || '-' };
    if (rowId === 'destination') return { display: values.destination || '-', accessible: values.destination || '-' };
    if (rowId === 'amount') return { display: core.formatUnits(contract, values.amountUnits), accessible: core.formatUnits(contract, values.amountUnits) };
    if (rowId === 'fee') return { display: core.formatUnits(contract, values.feeUnits), accessible: core.formatUnits(contract, values.feeUnits) };
    if (rowId === 'total') return { display: core.formatUnits(contract, values.totalUnits), accessible: core.formatUnits(contract, values.totalUnits) };
    return { display: '-', accessible: '-' };
  }

  function row(index, rowContract) {
    var labelSlot = slot('row-label row-' + index + ' row-id-' + rowContract.id, rowContract.label, 'slot-label');
    var valueSlot = slot('row-value row-' + index + ' row-id-' + rowContract.id, rowContract.display, 'slot-value', rowContract.accessible);
    labelSlot.id = 'cc-review-row-label-' + rowContract.id;
    valueSlot.id = 'cc-review-row-value-' + rowContract.id;
    if (rowContract.describedBy) valueSlot.setAttribute('aria-describedby', rowContract.describedBy);
    card.appendChild(labelSlot);
    card.appendChild(valueSlot);
  }

  function renderCollapsed(fixture, selectors) {
    var values = baseValues(fixture.values);
    card.appendChild(slot('collapsed-primary', values.primary));
    card.appendChild(slot('collapsed-secondary', selectors.primaryStatus));
    card.appendChild(slot('collapsed-status', '', '', selectors.primaryStatus));
    card.appendChild(slot('collapsed-mark', '', '', 'ImplicitEx mark'));
    var expand = buttonSlot('collapsed-expand-hit', '', 'Expand Coin Card');
    expand.addEventListener('click', function () {
      var allowed = core.evaluateTransition(contract, 'EXPAND', fixture.state, fixture.values || {}, {});
      actionDiagnostic.textContent = allowed.allowed ? 'Review action: EXPAND' : 'Rejected EXPAND: ' + allowed.errors.join('; ');
      if (allowed.allowed) renderFixture(core.transitionView(fixture, 'EXPANDED'));
      var nextControl = card.querySelector('.collapse-proposed');
      if (nextControl) nextControl.focus();
    });
    card.appendChild(expand);
  }

  function renderExpanded(fixture, selectors) {
    var values = baseValues(fixture.values);
    var body = core.bodyModel(contract, fixture.state, fixture.values || {});
    card.appendChild(slot('expanded-primary', values.primary));
    card.appendChild(slot('expanded-name', values.name));
    card.appendChild(slot('expanded-network', values.networkToken));
    card.appendChild(slot('expanded-product', values.product));
    card.appendChild(slot('expanded-attribution', values.attribution));
    card.appendChild(slot('expanded-mark', '', '', 'ImplicitEx mark'));
    card.appendChild(slot('expanded-divider', ''));
    var collapse = buttonSlot('collapse-proposed', '×', 'Collapse Coin Card. Proposed fixed control location.');
    collapse.addEventListener('click', function () {
      var allowed = core.evaluateTransition(contract, 'COLLAPSE', fixture.state, fixture.values || {}, {});
      actionDiagnostic.textContent = allowed.allowed ? 'Review action: COLLAPSE' : 'Rejected COLLAPSE: ' + allowed.errors.join('; ');
      if (allowed.allowed) renderFixture(core.transitionView(fixture, 'COLLAPSED'));
      var nextControl = card.querySelector('.collapsed-expand-hit');
      if (nextControl) nextControl.focus();
    });
    card.appendChild(collapse);

    body.rows.forEach(function (rowContract, index) {
      row(index, rowContract);
    });

    card.appendChild(slot('action-divider', ''));
    card.appendChild(slot('status-dot', '', '', selectors.primaryStatus));
    card.appendChild(slot('status-text', selectors.primaryStatus));
    var cta = buttonSlot('cta-slot', selectors.cta.label, selectors.cta.label);
    cta.disabled = !selectors.cta.enabled;
    cta.dataset.action = selectors.cta.action;
    cta.addEventListener('click', function () {
      var transition = selectors.cta.action === 'EXECUTE' ? 'REQUEST_TRANSFER' : selectors.cta.action === 'APPROVE' ? 'REQUEST_APPROVAL' : selectors.cta.action;
      var payload = selectors.cta.action === 'RETRY'
        ? { intentId: fixture.state.activeIntentId, newAttemptId: String(fixture.state.activeAttemptId || fixture.state.activeIntentId || 'attempt') + '-retry' }
        : {};
      var allowed = core.evaluateTransition(contract, transition, fixture.state, fixture.values || {}, payload);
      actionDiagnostic.textContent = allowed.allowed
        ? 'Review action: ' + selectors.cta.action
        : 'Rejected ' + selectors.cta.action + ': ' + allowed.errors.join('; ');
    });
    card.appendChild(cta);
  }

  function renderFixture(fixture) {
    var evaluation = fixture.event ? core.evaluateEvent(fixture) : core.evaluateState(contract, fixture);
    var selectors = fixture.state ? core.selectors(contract, fixture.state, fixture.values || {}) : { primaryStatus: 'Event rejected', cta: { label: 'Event', enabled: false, action: 'NONE' }, body: { rows: [] } };
    var assertionResult = evaluateAssertions(fixture, evaluation, selectors);

    card.replaceChildren();
    card.className = 'coin-card-review';
    if (fixture.state) {
      card.dataset.view = fixture.state.view;
      if (!evaluation.legal) card.classList.add('is-illegal');
      if (fixture.state.view === 'COLLAPSED') renderCollapsed(fixture, selectors);
      else renderExpanded(fixture, selectors);
    } else {
      card.dataset.view = 'EXPANDED';
      card.classList.add('is-illegal');
      card.appendChild(slot('status-text', 'Rejected stale event'));
    }

    var expected = fixture.expectLegal === true;
    var legalPass = fixture.event ? eventExpectationPasses(fixture, evaluation) : evaluation.legal === expected;
    var pass = legalPass && assertionResult.failed.length === 0;
    result.textContent = (pass ? 'PASS' : 'FAIL') + ' · ' + fixture.id +
      ' · assertions ' + assertionResult.passed.length + '/' + assertionResult.total +
      (pass ? '' : ' · ' + assertionResult.failed.concat(evaluation.errors || evaluation.rejectedReason || []).join('; '));
    json.textContent = JSON.stringify(fixture, null, 2);
  }

  function evaluateAssertions(fixture, evaluation, selectors) {
    var assertions = fixture.assert || [];
    var passed = [];
    var failed = [];
    assertions.forEach(function (assertion) {
      var ok = assertionPasses(assertion, fixture, evaluation, selectors);
      if (ok) passed.push(assertion);
      else failed.push(assertion);
    });
    return { total: assertions.length, passed: passed, failed: failed };
  }

  function assertionPasses(assertion, fixture, evaluation, selectors) {
    var state = fixture.state || {};
    var values = baseValues(fixture.values);
    if (assertion === 'outer=216x44') return state.view === 'COLLAPSED' && core.expectedGeometry(contract, state).width === 216 && core.expectedGeometry(contract, state).height === 44;
    if (assertion === 'outer=460x286') return state.view === 'EXPANDED' && core.expectedGeometry(contract, state).width === 460 && core.expectedGeometry(contract, state).height === 286;
    if (assertion === 'expand-only') return state.view === 'COLLAPSED' && selectors.cta.action === 'EXPAND';
    if (assertion === 'no-wallet-action') return state.view === 'COLLAPSED' && selectors.cta.action !== 'CONNECT' && selectors.cta.action !== 'EXECUTE';
    if (assertion === 'fee=em-dash') return core.formatUnits(contract, values.feeUnits) === '—';
    if (assertion === 'total=em-dash') return core.formatUnits(contract, values.totalUnits) === '—';
    if (assertion === 'connect-cta') return selectors.cta.label === 'Connect';
    if (assertion === 'no-approval') return selectors.cta.action !== 'EXECUTE';
    if (assertion.indexOf('amount=') === 0) return core.formatUnits(contract, values.amountUnits) === assertion.slice(7);
    if (assertion.indexOf('fee=') === 0) return core.formatUnits(contract, values.feeUnits) === assertion.slice(4);
    if (assertion.indexOf('total=') === 0) return core.formatUnits(contract, values.totalUnits) === assertion.slice(6);
    if (assertion === 'approval-or-transfer-cta') return selectors.cta.action === 'EXECUTE';
    if (assertion === 'approve-cta') return selectors.cta.action === 'APPROVE';
    if (assertion === 'hash-middle-truncated') return core.middleTruncate(values.transferHash, 8, 6).indexOf('...') !== -1;
    if (assertion === 'pending-precedence') return selectors.primaryStatus === 'Confirming transfer' || selectors.primaryStatus === 'Approval pending';
    if (assertion === 'confirmed-precedence') return selectors.primaryStatus === 'Confirmed';
    if (assertion === 'no-fund-moving-cta') return selectors.cta.action !== 'EXECUTE';
    if (assertion === 'reject-illegal-vector') return evaluation.legal === false;
    if (assertion === 'reject-active-mutation') return evaluation.accepted === false;
    if (assertion === 'archive-reconcile-only-if-matching-receipt') return evaluation.rejectedReason === 'stale intent';
    if (assertion === 'route-unavailable-status') return selectors.primaryStatus === 'Route unavailable';
    if (assertion === 'route-invalid-status') return selectors.primaryStatus === 'Route invalid';
    if (assertion === 'fix-amount-cta') return selectors.cta.label === 'Fix amount';
    if (assertion === 'insufficient-usdc-status') return selectors.primaryStatus === 'Insufficient USDC';
    if (assertion === 'insufficient-gas-status') return selectors.primaryStatus === 'Insufficient gas';
    if (assertion === 'approval-pending-status') return selectors.primaryStatus === 'Approval pending';
    if (assertion === 'approval-confirmed-status') return selectors.primaryStatus === 'Approval confirmed';
    if (assertion === 'transfer-requested-status') return selectors.primaryStatus === 'Confirm transfer';
    if (assertion === 'failed-retry-cta') return selectors.cta.label === 'Retry' || selectors.cta.label === 'Review error';
    if (assertion === 'interrupted-retry-cta') return selectors.cta.label === 'Retry' || selectors.cta.label === 'Review error';
    if (assertion === 'reconciling-precedence') return selectors.primaryStatus === 'Checking chain';
    if (assertion === 'unsupported-network-status') return selectors.primaryStatus === 'Unsupported network';
    if (assertion === 'unsupported-token-status') return selectors.primaryStatus === 'Unsupported token';
    if (assertion === 'connection-failed-status') return selectors.primaryStatus === 'Connection failed';
    if (assertion === 'reject-invalid-enum') return evaluation.legal === false;
    if (assertion === 'reject-missing-required') return evaluation.legal === false;
    if (assertion === 'new-intent-required') return fixture.event && evaluation.rejectedReason === 'stale intent';
    if (assertion === 'accepted-current-intent') return fixture.event && evaluation.accepted === true;
    if (assertion === 'reject-stale-attempt') return fixture.event && evaluation.rejectedReason === 'stale attempt';
    if (assertion === 'archive-attempt-mismatch') return fixture.event && evaluation.rejectedReason === 'archived attempt mismatch';
    if (assertion === 'archive-match') return fixture.event && evaluation.archived === true;
    if (assertion === 'archive-miss') return fixture.event && evaluation.archived === false && evaluation.rejectedReason === 'stale intent';
    if (assertion === 'collapsed-pending-legal') return evaluation.legal === true && state.view === 'COLLAPSED';
    if (assertion === 'post-broadcast-disconnect-legal') return evaluation.legal === true && state.wallet === 'DISCONNECTED';
    return false;
  }

  function eventExpectationPasses(fixture, evaluation) {
    if (typeof fixture.expectAccepted === 'boolean') return evaluation.accepted === fixture.expectAccepted;
    if (typeof fixture.expectRejected === 'boolean') return evaluation.accepted !== fixture.expectRejected;
    return !evaluation.accepted === fixture.expectLegal;
  }

  function renderList() {
    list.replaceChildren();
    fixtures.forEach(function (fixture) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'fixture-btn';
      button.textContent = fixture.id;
      button.setAttribute('aria-pressed', fixture === selected ? 'true' : 'false');
      button.addEventListener('click', function () {
        selected = fixture;
        renderList();
        renderFixture(selected);
      });
      list.appendChild(button);
    });
  }

  renderList();
  renderFixture(selected);
})();
