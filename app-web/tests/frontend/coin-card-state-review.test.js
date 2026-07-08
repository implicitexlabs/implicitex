const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer');

const appRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(appRoot, '..');
const contract = require(path.join(appRoot, 'frontend/public/coincard/state-review-contract.generated.js'));
const core = require(path.join(appRoot, 'frontend/public/coincard/state-review-core.js'));
const polygonDeployment = require(path.join(appRoot, 'deployments/polygon.json'));

function assertContractEvaluation() {
  const contractValidation = core.validateContract(contract);
  assert.equal(contractValidation.valid, true, contractValidation.errors.join('; '));
  assert.deepEqual(contract.fixtures.requiredFutureFixtures, [], 'fixture inventory must be complete');
  contract.fixtures.fixtures.forEach((fixture) => {
    if (fixture.event) {
      const result = core.evaluateEvent(fixture);
      if (typeof fixture.expectAccepted === 'boolean') assert.equal(result.accepted, fixture.expectAccepted, `${fixture.id} event accepted expectation`);
      if (typeof fixture.expectRejected === 'boolean') assert.equal(!result.accepted, fixture.expectRejected, `${fixture.id} event rejected expectation`);
      return;
    }

    const result = core.evaluateState(contract, fixture);
    assert.equal(result.legal, fixture.expectLegal, `${fixture.id} legality: ${result.errors.join('; ')}`);
    const selectors = core.selectors(contract, fixture.state, fixture.values || {});
    assert.doesNotThrow(() => selectors, `${fixture.id} selectors`);
    if (fixture.state && selectors.cta.action !== 'NONE') {
      const transitionAction = selectors.cta.action === 'EXECUTE'
        ? 'REQUEST_TRANSFER'
        : selectors.cta.action === 'APPROVE'
          ? 'REQUEST_APPROVAL'
          : selectors.cta.action;
      const transitionPayload = transitionAction === 'RETRY'
        ? { intentId: fixture.state.activeIntentId, newAttemptId: `${fixture.state.activeAttemptId || fixture.state.activeIntentId || 'attempt'}-test` }
        : {};
      const transition = core.evaluateTransition(contract, transitionAction, fixture.state, fixture.values || {}, transitionPayload);
      assert.equal(transition.allowed, selectors.cta.enabled, `${fixture.id} CTA/transition agreement`);
    }
  });
}

function assertProductionParameters() {
  const params = contract.state.productionParameters;
  const chainsConfig = fs.readFileSync(path.join(appRoot, 'frontend/public/config/chains.js'), 'utf8');
  assert.equal(params.network.chainId, 137, 'production chain ID');
  assert.equal(params.network.chainId, polygonDeployment.chainId, 'deployment chain ID');
  assert.equal(params.tokenAddress.value, polygonDeployment.usdc, 'USDC address from deployment');
  assert(chainsConfig.includes(`usdcAddress:       '${params.tokenAddress.value}'`), 'USDC address appears in active chain config');
  assert.equal(params.transferContractAddress.value, polygonDeployment.address, 'transfer contract address from deployment');
  assert(chainsConfig.includes(`contractAddress:   '${params.transferContractAddress.value}'`), 'contract address appears in active chain config');
  assert.equal(params.feeBasisPoints.value, polygonDeployment.feeBps, 'fee bps from deployment');
  assert.equal(params.minimumAmountUnits.value, String(polygonDeployment.minTransfer), 'min transfer from deployment');
  assert.equal(params.transferPrecisionUnits.value, String(polygonDeployment.precision), 'precision from deployment');
  assert.equal(contract.state.amountPolicy.decimals, params.usdcDecimals.value, 'USDC decimals');
  assert.equal(contract.state.amountPolicy.minimumAmountUnits, params.minimumAmountUnits.value, 'amount policy min');
  assert.equal(contract.state.amountPolicy.transferPrecisionUnits, params.transferPrecisionUnits.value, 'amount policy precision');
  assert.equal(contract.state.amountPolicy.feeBasisPoints, params.feeBasisPoints.value, 'amount policy fee');
}

function assertFixtureCoverage() {
  const fixtures = contract.fixtures.fixtures;
  const axisSeen = new Map();
  Object.keys(contract.state.axes).forEach((axis) => axisSeen.set(axis, new Set()));
  fixtures.forEach((fixture) => {
    if (!fixture.state) return;
    Object.keys(contract.state.axes).forEach((axis) => axisSeen.get(axis).add(fixture.state[axis]));
  });

  contract.state.coveragePolicy.axes.forEach((axis) => {
    contract.state.axes[axis].forEach((value) => {
      if (axis === 'amountValidity' && value === 'ABOVE_MAXIMUM' && contract.state.amountPolicy.maximumAmountUnits === null) return;
      assert(axisSeen.get(axis).has(value), `missing fixture coverage for ${axis}=${value}`);
    });
  });

  const ids = new Set(fixtures.map((fixture) => fixture.id));
  const hasAssert = (name) => fixtures.some((fixture) => (fixture.assert || []).includes(name));
  assert(hasAssert('collapsed-pending-legal'), 'missing collapsed pending execution scenario');
  assert(hasAssert('post-broadcast-disconnect-legal'), 'missing post-broadcast wallet disconnection scenario');
  assert(ids.has('reset-new-intent'), 'missing reset/new-intent scenario');
  assert(ids.has('current-intent-event'), 'missing current-intent acceptance scenario');
  assert(ids.has('current-intent-stale-attempt-event'), 'missing current-intent stale-attempt rejection scenario');
  assert(ids.has('stale-intent-event'), 'missing stale-intent rejection scenario');
  assert(ids.has('stale-archive-match'), 'missing stale archived-receipt match scenario');
  assert(ids.has('stale-archive-miss'), 'missing stale archived-receipt miss scenario');
  assert(ids.has('archived-attempt-mismatch'), 'missing archived-attempt mismatch scenario');
  assert(ids.has('delayed-old-approval-after-retry'), 'missing delayed old approval scenario');
  assert(ids.has('delayed-old-transfer-after-retry'), 'missing delayed old transfer scenario');
  assert(ids.has('confirmed-stale-precision-mismatch'), 'missing confirmed stale precision mismatch scenario');
  assert(ids.has('transfer-pending-route-unavailable'), 'missing transfer pending route unavailable scenario');
  assert(ids.has('approval-pending-wallet-disconnected'), 'missing approval pending wallet disconnected scenario');
  assert(ids.has('failed-invalid-amount'), 'missing failed invalid amount scenario');
  assert(ids.has('failed-retryable'), 'missing retryable failed scenario');
  assert(ids.has('failed-final-evidence'), 'missing non-retryable failed scenario');
  assert(ids.has('interrupted-retryable'), 'missing retryable interrupted scenario');
  assert(ids.has('interrupted-final-not-broadcast'), 'missing non-retryable interrupted scenario');
  assert(ids.has('receipt-none-none'), 'missing receipt none/none scenario');
  assert(ids.has('receipt-local-ready-none'), 'missing receipt local-ready/none scenario');
  assert(ids.has('receipt-submitted-unknown'), 'missing receipt submitted/unknown scenario');
  assert(ids.has('receipt-none-success-illegal'), 'missing illegal receipt none/success scenario');
  assert(ids.has('receipt-local-ready-reverted-illegal'), 'missing illegal receipt local-ready/reverted scenario');
  assert(ids.has('receipt-submitted-success-illegal'), 'missing illegal receipt submitted/success scenario');
  assert(ids.has('receipt-final-unknown-illegal'), 'missing illegal receipt final/unknown scenario');
  assert(ids.has('failed-not-broadcast-illegal'), 'missing illegal failed/not-broadcast scenario');
  assert(ids.has('interrupted-reverted-illegal'), 'missing illegal interrupted/reverted scenario');
  assert(ids.has('reconciling-success-illegal'), 'missing illegal reconciling/success scenario');
}

function assertAmountAndMathVectors() {
  const vectors = [
    ['', 'EMPTY', 'UNKNOWN', null],
    ['.', 'TEMPORARY_INCOMPLETE', 'UNKNOWN', null],
    ['1.', 'TEMPORARY_INCOMPLETE', 'UNKNOWN', null],
    ['.5', 'SYNTACTICALLY_COMPLETE', 'BELOW_MINIMUM', 500000n],
    ['0001.00', 'SYNTACTICALLY_COMPLETE', 'VALID', 1000000n],
    [' 1.00 ', 'SYNTACTICALLY_COMPLETE', 'VALID', 1000000n],
    ['1 0', 'SYNTAX_INVALID', 'INVALID_CHARACTER', null],
    ['1,000', 'SYNTAX_INVALID', 'INVALID_CHARACTER', null],
    ['+1', 'SYNTAX_INVALID', 'INVALID_CHARACTER', null],
    ['-1', 'SYNTAX_INVALID', 'INVALID_CHARACTER', null],
    ['1e3', 'SYNTAX_INVALID', 'INVALID_CHARACTER', null],
    ['1.000000', 'SYNTACTICALLY_COMPLETE', 'VALID', 1000000n],
    ['1.0000001', 'SYNTAX_INVALID', 'EXCESS_PRECISION', null],
    ['1.5', 'SYNTACTICALLY_COMPLETE', 'PRECISION_MISMATCH', 1500000n],
    ['0', 'SYNTACTICALLY_COMPLETE', 'BELOW_MINIMUM', 0n],
  ];

  vectors.forEach(([input, amountText, amountValidity, units]) => {
    const parsed = core.parseAmountUnits(contract, input);
    assert.equal(parsed.amountText, amountText, `${input} amountText`);
    assert.equal(parsed.amountValidity, amountValidity, `${input} amountValidity`);
    if (units === null) assert.equal(parsed.units, null, `${input} units`);
    else assert.equal(parsed.units, units, `${input} units`);
  });

  assert.equal(core.scaleFor(contract), 1000000n, 'scale derived from decimals');
  assert.equal(core.calculateFeeUnits(contract, '1000000'), 10000n, '1 percent fee');
  assert.equal(core.calculateFeeUnits(contract, '1500000'), 15000n, 'fee uses integer floor division');
  assert.equal(core.validateTransferPrecision(contract, '1500000'), 'PRECISION_MISMATCH', 'precision mismatch from production precision');
  assert.equal(core.calculateTotalUnits('1000000', 10000n), 1010000n, 'total adds canonical fee');
  assert.equal(core.formatUnits(contract, null), '—', 'unavailable money display');
  assert.equal(core.formatUnits(contract, '1000001'), '1.000001 USDC', 'exact six-decimal format');
}

function assertRuleDispatchFailureModes() {
  const badTransition = JSON.parse(JSON.stringify(contract));
  badTransition.state.transitionGuards.REQUEST_TRANSFER = ['not-a-real-guard'];
  assert.equal(core.validateContract(badTransition).valid, false, 'unknown transition guard fails closed');

  const badStatus = JSON.parse(JSON.stringify(contract));
  badStatus.state.renderPrecedence.primaryStatus = ['not-a-real-status-rule'];
  assert.equal(core.validateContract(badStatus).valid, false, 'unknown status rule fails closed');

  const badCta = JSON.parse(JSON.stringify(contract));
  badCta.state.renderPrecedence.cta = ['not-a-real-cta-rule'];
  assert.equal(core.validateContract(badCta).valid, false, 'unknown CTA rule fails closed');
}

function assertResetTransition() {
  const source = contract.fixtures.fixtures.find((fixture) => fixture.id === 'interrupted-final-no-execution-found');
  const nextIntentId = 'intent-after-reset-001';
  const transition = core.applyTransition(contract, 'RESET', source.state, source.values || {}, { newIntentId: nextIntentId });
  assert.equal(transition.allowed, true, `reset transition: ${transition.errors.join('; ')}`);
  assert.notEqual(transition.nextState.activeIntentId, source.state.activeIntentId, 'reset creates new intent');
  assert.equal(transition.nextState.activeIntentId, nextIntentId, 'reset uses provided new intent');
  assert.equal(transition.nextState.view, source.state.view, 'reset preserves view');
  assert.equal(transition.nextState.routeAvailability, source.state.routeAvailability, 'reset preserves route availability');
  assert.equal(transition.nextState.routeValidity, source.state.routeValidity, 'reset preserves route validity');
  assert.equal(transition.nextState.routeMutability, source.state.routeMutability, 'reset preserves route mutability');
  assert.equal(transition.nextState.amountText, 'EMPTY', 'reset clears amount text');
  assert.equal(transition.nextState.amountValidity, 'UNKNOWN', 'reset clears amount validity');
  assert.equal(transition.nextValues.amountUnits, null, 'reset clears amount units');
  assert.equal(transition.nextValues.feeUnits, null, 'reset clears fee units');
  assert.equal(transition.nextValues.totalUnits, null, 'reset clears total units');
  assert.equal(transition.nextState.funding, 'UNKNOWN', 'reset clears funding');
  assert.equal(transition.nextState.allowance, 'UNKNOWN', 'reset clears allowance');
  assert.equal(transition.nextState.retryability, 'UNKNOWN', 'reset clears retryability');
  assert.deepEqual(transition.nextValues.recheckRequired, ['allowance', 'balance', 'gasReadiness', 'network'], 'reset requires preflight rechecks');
  assert(Array.isArray(transition.archivedEvidence) && transition.archivedEvidence.length === 1, 'reset archives finalized evidence');
  assert.equal(transition.archivedEvidence[0].receiptOutcome, source.state.receiptOutcome, 'reset preserves final outcome evidence');
  assert.equal(transition.archivedEvidence[0].finalized, true, 'reset archives finalized evidence as finalized');
  assert.equal(transition.archivedEvidence[0].transferHash, null, 'reset preserves no-transfer-hash final evidence');
  assert.equal(core.evaluateEvent({ event: { intentId: source.state.activeIntentId, activeIntentId: transition.nextState.activeIntentId } }).accepted, false, 'reset invalidates old intent events');
  assert.equal(transition.nextValues.invalidatedEventAttemptId, source.state.activeAttemptId, 'reset invalidates old attempt events');
}

function assertRetryTransition() {
  const source = contract.fixtures.fixtures.find((fixture) => fixture.id === 'failed-retryable');
  const nextAttemptId = 'attempt-after-retry-001';
  const transition = core.applyTransition(contract, 'RETRY', source.state, source.values || {}, { intentId: source.state.activeIntentId, newAttemptId: nextAttemptId });
  assert.equal(transition.allowed, true, `retry transition: ${transition.errors.join('; ')}`);
  assert.equal(transition.nextState.activeIntentId, source.state.activeIntentId, 'retry preserves intent id');
  assert.equal(transition.nextState.activeAttemptId, nextAttemptId, 'retry creates new attempt id');
  assert.equal(transition.nextState.view, source.state.view, 'retry preserves view');
  assert.equal(transition.nextState.routeAvailability, source.state.routeAvailability, 'retry preserves route availability');
  assert.equal(transition.nextState.routeValidity, source.state.routeValidity, 'retry preserves route validity');
  assert.equal(transition.nextState.routeMutability, source.state.routeMutability, 'retry preserves route mutability');
  assert.equal(transition.nextValues.recipient, source.values.recipient, 'retry preserves recipient');
  assert.equal(transition.nextValues.route, source.values.route, 'retry preserves route display');
  assert.equal(transition.nextValues.destination, source.values.destination, 'retry preserves destination');
  assert.equal(transition.nextState.amountText, source.state.amountText, 'retry preserves amount text');
  assert.equal(transition.nextValues.amountUnits, source.values.amountUnits, 'retry preserves amount units');
  assert.equal(transition.nextValues.feeUnits, source.values.feeUnits, 'retry preserves fee units');
  assert.equal(transition.nextValues.totalUnits, source.values.totalUnits, 'retry preserves total units');
  assert.equal(transition.nextValues.transferHash, undefined, 'retry clears transfer hash');
  assert.equal(transition.nextValues.approvalHash, undefined, 'retry clears approval hash');
  assert.equal(transition.nextState.execution, 'PREVIEW_READY', 'retry returns to preview-ready');
  assert.equal(transition.nextState.funding, 'UNKNOWN', 'retry clears funding');
  assert.equal(transition.nextState.allowance, 'UNKNOWN', 'retry clears allowance');
  assert.equal(transition.nextState.retryability, 'UNKNOWN', 'retry clears retryability');
  assert.equal(transition.nextValues.invalidatedEventIntentId, source.state.activeIntentId, 'retry invalidates old intent events');
  assert.equal(transition.nextValues.invalidatedEventAttemptId, source.state.activeAttemptId, 'retry invalidates old attempt events');

  const staleApprovalEvent = core.evaluateEvent({
    event: {
      type: 'APPROVAL_CONFIRMED',
      intentId: source.state.activeIntentId,
      attemptId: source.state.activeAttemptId,
      activeIntentId: transition.nextState.activeIntentId,
      activeAttemptId: transition.nextState.activeAttemptId,
    },
  });
  assert.equal(staleApprovalEvent.accepted, false, 'retry rejects delayed approval from old attempt');
  assert.equal(staleApprovalEvent.rejectedReason, 'stale attempt', 'retry old approval rejected by attempt');

  const staleTransferEvent = core.evaluateEvent({
    event: {
      type: 'TRANSFER_RECEIPT_CONFIRMED',
      intentId: source.state.activeIntentId,
      attemptId: source.state.activeAttemptId,
      activeIntentId: transition.nextState.activeIntentId,
      activeAttemptId: transition.nextState.activeAttemptId,
    },
  });
  assert.equal(staleTransferEvent.accepted, false, 'retry rejects delayed transfer from old attempt');
  assert.equal(staleTransferEvent.rejectedReason, 'stale attempt', 'retry old transfer rejected by attempt');
}

function assertNewTransactionTransition() {
  const source = contract.fixtures.fixtures.find((fixture) => fixture.id === 'amount-precision-mismatch');
  const nextIntentId = 'intent-new-transaction-001';
  const transition = core.applyTransition(contract, 'NEW_TRANSACTION', source.state, source.values || {}, { newIntentId: nextIntentId, newAttemptId: 'attempt-new-transaction-001' });
  assert.equal(transition.allowed, true, `new transaction transition: ${transition.errors.join('; ')}`);
  assert.equal(transition.nextState.activeIntentId, nextIntentId, 'new transaction uses provided intent id');
  assert.equal(transition.nextState.amountText, 'EMPTY', 'new transaction clears amount text');
  assert.equal(transition.nextState.amountValidity, 'UNKNOWN', 'new transaction clears amount validity');
  assert.equal(transition.nextValues.amountUnits, null, 'new transaction clears amount units');
  assert.equal(transition.nextValues.feeUnits, null, 'new transaction clears fee units');
  assert.equal(transition.nextValues.totalUnits, null, 'new transaction clears total units');
  assert.equal(transition.nextValues.transferHash, undefined, 'new transaction clears transfer hash');
  assert.equal(transition.nextValues.approvalHash, undefined, 'new transaction clears approval hash');
  assert.equal(transition.nextState.funding, 'UNKNOWN', 'new transaction clears funding');
  assert.equal(transition.nextState.allowance, 'UNKNOWN', 'new transaction clears allowance');
  assert.equal(transition.nextValues.invalidatedEventIntentId, source.state.activeIntentId, 'new transaction invalidates old intent events');
  assert.equal(transition.nextValues.invalidatedEventAttemptId, source.state.activeAttemptId, 'new transaction invalidates old attempt events');
}

function assertEventCorrelation() {
  const current = contract.fixtures.fixtures.find((fixture) => fixture.id === 'current-intent-event');
  const stale = contract.fixtures.fixtures.find((fixture) => fixture.id === 'stale-intent-event');
  const staleAttempt = contract.fixtures.fixtures.find((fixture) => fixture.id === 'current-intent-stale-attempt-event');
  const archiveMatch = contract.fixtures.fixtures.find((fixture) => fixture.id === 'stale-archive-match');
  const archiveMiss = contract.fixtures.fixtures.find((fixture) => fixture.id === 'stale-archive-miss');
  const archiveAttemptMismatch = contract.fixtures.fixtures.find((fixture) => fixture.id === 'archived-attempt-mismatch');
  const delayedApproval = contract.fixtures.fixtures.find((fixture) => fixture.id === 'delayed-old-approval-after-retry');
  const delayedTransfer = contract.fixtures.fixtures.find((fixture) => fixture.id === 'delayed-old-transfer-after-retry');

  assert.equal(core.evaluateEvent(current).accepted, true, 'current intent/current attempt accepted');
  assert.equal(core.evaluateEvent(stale).accepted, false, 'stale intent rejected');
  assert.equal(core.evaluateEvent(stale).rejectedReason, 'stale intent', 'stale intent rejection reason');
  assert.equal(core.evaluateEvent(staleAttempt).accepted, false, 'current intent/stale attempt rejected');
  assert.equal(core.evaluateEvent(staleAttempt).rejectedReason, 'stale attempt', 'current intent/stale attempt rejection reason');
  assert.equal(core.evaluateEvent(archiveMatch).accepted, true, 'archived intent/attempt match accepted');
  assert.equal(core.evaluateEvent(archiveMatch).archived, true, 'archived intent/attempt match archived');
  assert.equal(core.evaluateEvent(archiveMiss).accepted, false, 'archived intent mismatch rejected');
  assert.equal(core.evaluateEvent(archiveMiss).rejectedReason, 'stale intent', 'archived intent mismatch rejection reason');
  assert.equal(core.evaluateEvent(archiveAttemptMismatch).accepted, false, 'archived attempt mismatch rejected');
  assert.equal(core.evaluateEvent(archiveAttemptMismatch).rejectedReason, 'archived attempt mismatch', 'archived attempt mismatch rejection reason');
  assert.equal(core.evaluateEvent(delayedApproval).accepted, false, 'delayed approval after retry rejected');
  assert.equal(core.evaluateEvent(delayedApproval).rejectedReason, 'stale attempt', 'delayed approval rejection reason');
  assert.equal(core.evaluateEvent(delayedTransfer).accepted, false, 'delayed transfer after retry rejected');
  assert.equal(core.evaluateEvent(delayedTransfer).rejectedReason, 'stale attempt', 'delayed transfer rejection reason');
}

async function assertRenderedGeometry() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(appRoot, 'frontend/public/coincard/state-review.html')).href);
    await page.waitForSelector('#coinCardReview');

    const results = await page.evaluate(() => {
      const contract = window.COIN_CARD_REVIEW_CONTRACT;
      const buttons = Array.from(document.querySelectorAll('.fixture-btn'));
      return buttons.map((button, index) => {
        button.click();
        const fixture = contract.fixtures.fixtures[index];
        const card = document.getElementById('coinCardReview');
        const rect = card.getBoundingClientRect();
        const expected = fixture.state && fixture.state.view === 'COLLAPSED'
          ? contract.state.geometry.collapsed.outer
          : contract.state.geometry.expanded.outer;
        const slots = Array.from(card.querySelectorAll('.slot')).map((node) => {
          const style = window.getComputedStyle(node);
          return {
            id: node.id,
            className: node.className,
            text: node.textContent,
            title: node.getAttribute('title'),
            ariaLabel: node.getAttribute('aria-label'),
            describedBy: node.getAttribute('aria-describedby'),
            disabled: node.disabled === true,
            action: node.dataset.action || '',
            left: Number.parseFloat(style.left) || 0,
            top: Number.parseFloat(style.top) || 0,
            width: Number.parseFloat(style.width) || 0,
            height: Number.parseFloat(style.height) || 0,
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
          };
        });
        return {
          id: fixture.id,
          fixture,
          pass: document.getElementById('reviewResult').textContent.startsWith('PASS'),
          diagnostic: document.getElementById('actionDiagnostic').textContent,
          width: rect.width,
          height: rect.height,
          scrollWidth: card.scrollWidth,
          scrollHeight: card.scrollHeight,
          expectedWidth: expected.width,
          expectedHeight: expected.height,
          view: fixture.state ? fixture.state.view : 'EVENT',
          slots,
          collapsedButton: !!card.querySelector('.collapsed-expand-hit[aria-label="Expand Coin Card"]'),
          expandedCollapseButton: !!card.querySelector('.collapse-proposed[aria-label^="Collapse Coin Card"]'),
          recipientTitle: card.querySelector('.row-value.row-0') && card.querySelector('.row-value.row-0').getAttribute('title'),
        };
      });
    });

    results.forEach((result) => {
      assert.equal(result.pass, true, `${result.id} browser assertions must pass`);
      assert.equal(result.width, result.expectedWidth, `${result.id} width`);
      assert.equal(result.height, result.expectedHeight, `${result.id} height`);
      assert(result.scrollWidth <= result.expectedWidth, `${result.id} card scrollWidth containment`);
      assert(result.scrollHeight <= result.expectedHeight, `${result.id} card scrollHeight containment`);

      if (result.view === 'COLLAPSED') {
        assert.equal(result.width, 216, `${result.id} collapsed width`);
        assert.equal(result.height, 44, `${result.id} collapsed height`);
        assert.equal(result.collapsedButton, true, `${result.id} collapsed full-card expansion control`);
      }

      if (result.view === 'EXPANDED') {
        assert.equal(result.width, 460, `${result.id} expanded width`);
        assert.equal(result.height, 286, `${result.id} expanded height`);
        assert.equal(result.expandedCollapseButton, true, `${result.id} expanded collapse control`);
        assert(result.slots.some((slot) => slot.className.includes('expanded-primary')), `${result.id} identity primary slot`);
        assert(result.slots.some((slot) => slot.className.includes('expanded-name')), `${result.id} identity name slot`);
        assert(result.slots.some((slot) => slot.className.includes('status-text')), `${result.id} status slot`);
        assert(result.slots.some((slot) => slot.className.includes('cta-slot')), `${result.id} CTA slot`);
        assertExpandedSlotRectangles(result);
        assertRenderedText(result);
        assert.equal(result.slots.filter((slot) => slot.className.includes('row-label')).length, 6, `${result.id} row label count`);
        assert.equal(result.slots.filter((slot) => slot.className.includes('row-value')).length, 6, `${result.id} row value count`);
      }

      if (result.id === 'transfer-pending-long-hash') {
        assert.equal(result.recipientTitle, '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', 'full recipient remains accessible');
      }
    });
  } finally {
    await browser.close();
  }
}

function assertExpandedSlotRectangles(result) {
  const byClass = (name) => result.slots.find((slot) => slot.className.includes(name));
  const identity = contract.tokens.formFactors.expandedHorizontal.slots.identityHeader;
  const credential = contract.tokens.formFactors.expandedHorizontal.slots.credential;
  const action = contract.tokens.formFactors.expandedHorizontal.slots.action;
  assert.equal(byClass('expanded-primary').left, identity.primaryClaim.x, `${result.id} primary x`);
  assert.equal(byClass('expanded-primary').top, identity.primaryClaim.y, `${result.id} primary y`);
  assert.equal(byClass('expanded-name').left, identity.recipientName.x, `${result.id} name x`);
  assert.equal(byClass('expanded-network').top, identity.networkToken.y, `${result.id} network y`);
  assert.equal(byClass('status-text').left, action.statusText.x, `${result.id} status x`);
  assert.equal(byClass('cta-slot').width, action.cta.width, `${result.id} CTA width`);
  credential.rows.forEach((row, index) => {
    const label = result.slots.find((slot) => slot.className.includes(`row-label row-${index}`));
    const value = result.slots.find((slot) => slot.className.includes(`row-value row-${index}`));
    assert.equal(label.top, row.y, `${result.id} row ${row.id} label y`);
    assert.equal(value.top, row.y, `${result.id} row ${row.id} value y`);
    assert(value.scrollWidth <= value.clientWidth, `${result.id} row ${row.id} overflow containment`);
  });
}

function assertRenderedText(result) {
  if (!result.fixture.state) return;
  const selectors = core.selectors(contract, result.fixture.state, result.fixture.values || {});
  const status = result.slots.find((slot) => slot.className.includes('status-text'));
  const cta = result.slots.find((slot) => slot.className.includes('cta-slot'));
  assert.equal(status.text, selectors.primaryStatus, `${result.id} rendered status`);
  assert.equal(cta.text, selectors.cta.label, `${result.id} rendered CTA label`);
  assert.equal(cta.disabled, !selectors.cta.enabled, `${result.id} rendered CTA disabled state`);

  const body = selectors.body;
  assert.equal(body.mode, expectedBodyMode(result.fixture.state), `${result.id} body mode`);
  assert.equal(body.result, expectedBodyResult(result.fixture.state), `${result.id} body result`);
  assert.deepEqual(body.rows.map((row) => row.id), contract.state.bodySchemas[body.mode], `${result.id} body schema row order`);
  body.rows.forEach((row, index) => {
    const label = result.slots.find((slot) => slot.className.includes(`row-label row-${index}`));
    const value = result.slots.find((slot) => slot.className.includes(`row-value row-${index}`));
    assert.equal(value.id, `cc-review-row-value-${row.id}`, `${result.id} row ${index} slot id`);
    assert.equal(label.text, row.label, `${result.id} row ${index} label`);
    assert.equal(value.text, row.display, `${result.id} row ${index} value`);
    assert.equal(value.title, row.accessible, `${result.id} row ${index} accessible value`);
    if (row.describedBy) assert.equal(value.describedBy, row.describedBy, `${result.id} row ${index} described-by`);
  });
  if (body.mode === 'FORM_VALIDATION_ERROR' && result.fixture.state.amountValidity === 'PRECISION_MISMATCH') {
    const validationStatus = result.slots.find((slot) => slot.id === 'cc-review-row-value-validationTitle');
    const validationExplanation = result.slots.find((slot) => slot.id === 'cc-review-row-value-validationExplanation');
    const amountRow = result.slots.find((slot) => slot.id === 'cc-review-row-value-amount');
    assert.equal(validationStatus.text, 'Whole USDC required', `${result.id} precision status`);
    assert.equal(validationExplanation.text, 'Enter an amount in whole USDC increments.', `${result.id} precision explanation`);
    assert.equal(amountRow.describedBy, 'cc-review-row-value-validationExplanation', `${result.id} precision described by`);
    assert.equal(cta.text, 'Fix amount', `${result.id} precision CTA label`);
    assert.equal(cta.disabled, true, `${result.id} precision CTA disabled`);
  }
  if (result.fixture.state.execution === 'CONFIRMED') {
    assert(body.rows.some((row) => row.label === 'Transfer hash'), `${result.id} confirmed transfer hash slot`);
  }
  if (result.fixture.state.execution === 'TRANSFER_PENDING') {
    assert(body.rows.some((row) => row.label === 'Transfer hash'), `${result.id} transfer hash slot`);
  }
  if (result.fixture.state.execution === 'APPROVAL_PENDING' || result.fixture.state.execution === 'APPROVAL_CONFIRMED') {
    assert(body.rows.some((row) => row.label === 'Approval hash'), `${result.id} approval hash slot`);
  }
}

function expectedBodyMode(state) {
  if (state.execution === 'CONFIRMED') return 'CONFIRMED_RESULT';
  if (state.execution === 'RECONCILING') return 'RECONCILIATION_FACTS';
  if (state.execution === 'APPROVAL_REQUESTED') return 'APPROVAL_REQUESTED';
  if (state.execution === 'APPROVAL_PENDING') return 'APPROVAL_PENDING';
  if (state.execution === 'APPROVAL_CONFIRMED') return 'APPROVAL_CONFIRMED';
  if (state.execution === 'TRANSFER_REQUESTED') return 'TRANSFER_REQUESTED';
  if (state.execution === 'TRANSFER_PENDING') return 'TRANSFER_PENDING';
  if (state.execution === 'FAILED') return 'FAILED';
  if (state.execution === 'INTERRUPTED') return 'INTERRUPTED';
  if (state.routeAvailability === 'UNAVAILABLE' || state.routeValidity === 'INVALID' || state.networkSupport === 'UNSUPPORTED' || state.tokenSupport === 'UNSUPPORTED' || state.wallet === 'CONNECTION_FAILED' || state.wallet === 'CONNECTED_WRONG_NETWORK') return 'ROUTE_ERROR';
  if (state.amountValidity === 'PRECISION_MISMATCH' || state.amountValidity === 'INVALID_CHARACTER' || state.amountValidity === 'EXCESS_PRECISION' || state.amountValidity === 'BELOW_MINIMUM' || state.amountValidity === 'ABOVE_MAXIMUM') return 'FORM_VALIDATION_ERROR';
  return 'EDITABLE_FORM';
}

function expectedBodyResult(state) {
  if (state.execution === 'CONFIRMED') return 'Confirmed';
  if (state.execution === 'RECONCILING') return 'Reconciling';
  if (state.execution === 'APPROVAL_REQUESTED') return 'Approval requested';
  if (state.execution === 'APPROVAL_PENDING') return 'Approval pending';
  if (state.execution === 'APPROVAL_CONFIRMED') return 'Approval confirmed';
  if (state.execution === 'TRANSFER_REQUESTED') return 'Transfer requested';
  if (state.execution === 'TRANSFER_PENDING') return 'Transfer pending';
  if (state.execution === 'FAILED') return 'Failed';
  if (state.execution === 'INTERRUPTED') return 'Interrupted';
  if (state.routeAvailability === 'UNAVAILABLE' || state.routeValidity === 'INVALID' || state.networkSupport === 'UNSUPPORTED' || state.tokenSupport === 'UNSUPPORTED' || state.wallet === 'CONNECTION_FAILED' || state.wallet === 'CONNECTED_WRONG_NETWORK') return 'Route error';
  if (state.amountValidity === 'PRECISION_MISMATCH') return 'Whole USDC required';
  if (state.amountValidity === 'INVALID_CHARACTER') return 'Invalid amount';
  if (state.amountValidity === 'EXCESS_PRECISION') return 'Too many decimals';
  if (state.amountValidity === 'BELOW_MINIMUM') return 'Below minimum';
  if (state.amountValidity === 'ABOVE_MAXIMUM') return 'Above maximum';
  return 'Editable form';
}

async function assertReviewTransitions() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(appRoot, 'frontend/public/coincard/state-review.html')).href);
    await page.waitForSelector('#coinCardReview');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.fixture-btn'));
      const target = buttons.find((button) => button.textContent === 'collapsed-execution-ready');
      if (target) target.click();
    });
    await page.click('.collapsed-expand-hit');
    let state = await page.evaluate(() => {
      const card = document.getElementById('coinCardReview');
      const rect = card.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        focusClass: document.activeElement.className,
        diagnostic: document.getElementById('actionDiagnostic').textContent,
        json: document.getElementById('fixtureJson').textContent,
      };
    });
    assert.equal(state.width, 460, 'expanded transition width');
    assert.equal(state.height, 286, 'expanded transition height');
    assert.match(state.focusClass, /collapse-proposed/, 'focus moves to collapse control');
    assert.match(state.diagnostic, /EXPAND/, 'expand diagnostic');
    const original = JSON.parse(state.json);

    await page.click('.collapse-proposed');
    state = await page.evaluate(() => {
      const card = document.getElementById('coinCardReview');
      const rect = card.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        focusClass: document.activeElement.className,
        diagnostic: document.getElementById('actionDiagnostic').textContent,
        json: document.getElementById('fixtureJson').textContent,
      };
    });
    assert.equal(state.width, 216, 'collapsed transition width');
    assert.equal(state.height, 44, 'collapsed transition height');
    assert.match(state.focusClass, /collapsed-expand-hit/, 'focus moves to expand control');
    assert.match(state.diagnostic, /COLLAPSE/, 'collapse diagnostic');
    const collapsed = JSON.parse(state.json);
    delete original.state.view;
    delete collapsed.state.view;
    assert.deepEqual(collapsed.state, original.state, 'view transition preserves non-view state');
    assert.deepEqual(collapsed.values || {}, original.values || {}, 'view transition preserves values');
    assert.match(state.diagnostic, /COLLAPSE/, 'collapse diagnostic recorded');
  } finally {
    await browser.close();
  }
}

(async () => {
  assertContractEvaluation();
  assertProductionParameters();
  assertFixtureCoverage();
  assertAmountAndMathVectors();
  assertRuleDispatchFailureModes();
  assertResetTransition();
  assertRetryTransition();
  assertNewTransactionTransition();
  assertEventCorrelation();
  await assertRenderedGeometry();
  await assertReviewTransitions();
  console.log('Coin Card state review contract and DOM geometry checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
