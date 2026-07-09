const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const verificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-verification.js');
const cardPath = path.join(repoRoot, 'app-web/frontend/public/card/card.js');
const verificationSource = fs.readFileSync(verificationPath, 'utf8');
const cardSource = fs.readFileSync(cardPath, 'utf8');

function loadVerification() {
  const context = {
    Object,
    String,
    window: {},
  };
  context.globalThis = context;
  vm.runInNewContext(verificationSource, context, { filename: verificationPath });
  return context.window.IX_COIN_CARD_VERIFICATION;
}

function makeElement(id) {
  const attributes = new Map();
  const listeners = new Map();
  const classListState = new Set();
  return {
    id,
    dataset: {},
    className: '',
    disabled: false,
    href: '',
    style: {},
    textContent: '',
    title: '',
    value: '',
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type) {
      const handler = listeners.get(type);
      if (handler) handler({ target: this });
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    classList: {
      toggle(name, enabled) {
        if (enabled) classListState.add(name);
        else classListState.delete(name);
      },
    },
  };
}

function loadCoinCard(options = {}) {
  const elements = new Map();
  const ids = [
    'ccFrame', 'ccChip', 'ccAmountInput', 'ccAmountField', 'ccTxLabel',
    'ccFeeValue', 'ccTotalValue', 'ccCardName', 'ccReviewName', 'ccExecName',
    'ccConfirmedName', 'ccErrorName', 'ccCardRecipient', 'ccReviewRecipient',
    'ccExecRecipient', 'ccConfirmedRecipient', 'ccErrorRecipient',
    'ccCardNetwork', 'ccAmountToken', 'ccFeePctLabel', 'ccReviewFeePct',
    'ccCardStatus', 'ccStatusDot', 'ccStatusLabel', 'ccErrorMessage',
    'ccErrorSub', 'ccSelfSendWarn', 'ccExecLabel', 'ccExecAmount',
    'ccReviewAmount', 'ccReviewFee', 'ccReviewTotal', 'ccErrorStateLabel',
    'ccCardError', 'ccTxHash', 'ccConfirmedAmount',
  ];
  ids.forEach((id) => elements.set(id, makeElement(id)));
  const frame = elements.get('ccFrame');
  if (options.manifestPointer !== null) {
    frame.setAttribute('data-ix-manifest', options.manifestPointer || 'coin-card-manifest.json');
  }

  const executionCalls = [];
  const verificationCalls = [];
  const verification = {
    readManifestPointer(root) {
      verificationCalls.push({ type: 'readManifestPointer', root });
      if (!root.getAttribute('data-ix-manifest')) {
        return {
          state: 'VERIFICATION_UNAVAILABLE',
          manifestUrl: null,
          error: 'manifest-pointer-missing',
        };
      }
      return { state: null, manifestUrl: 'coin-card-manifest.json', error: null };
    },
    canExecuteTransfer(state) {
      verificationCalls.push({ type: 'canExecuteTransfer', state });
      return options.canExecuteTransfer !== false && state === 'VERIFIED';
    },
  };

  const context = {
    console,
    Date,
    Error,
    Math,
    Number,
    Promise,
    String,
    encodeURIComponent,
    isFinite,
    parseFloat,
    setTimeout,
    document: {
      readyState: 'complete',
      getElementById(id) {
        return elements.get(id) || null;
      },
      addEventListener() {},
    },
    window: {
      IX_COIN_CARD_VERIFICATION: verification,
      IX_EXECUTION: {
        toRawUsdc(amount) {
          return BigInt(Math.round(Number(amount) * 1000000));
        },
        calculateFee(rawAmount) {
          return {
            fee: rawAmount / 100n,
            total: rawAmount + rawAmount / 100n,
          };
        },
        executeTransfer(request) {
          executionCalls.push(request);
          if (request.action === 'prepare') {
            return Promise.resolve({
              status: 'ready-to-send',
              sender: '0x1111111111111111111111111111111111111111',
            });
          }
          if (request.action === 'execute') {
            return Promise.resolve({
              status: 'confirmed',
              receipt: {
                txHash: '0x' + 'aa'.repeat(32),
                explorerUrl: 'https://polygonscan.com/tx/' + '0x' + 'aa'.repeat(32),
              },
            });
          }
          return Promise.resolve({ status: 'failed' });
        },
      },
      location: {
        pathname: '/card/demo-card',
      },
      parent: null,
      addEventListener() {},
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          schema: 'implicitex.coincard.v1',
          cardId: 'demo-card',
          status: 'active',
          recipient: '0x2222222222222222222222222222222222222222',
          chainId: 137,
          token: 'USDC',
          displayName: 'Demo Recipient',
        }),
      });
    },
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.window.parent = context.window;

  vm.runInNewContext(cardSource, context, { filename: cardPath });

  return { elements, executionCalls, verificationCalls };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('VERIFIED allows execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.VERIFIED), true);
});

test('INTEGRITY_FAILED blocks execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.INTEGRITY_FAILED), false);
});

test('CARD_REVOKED blocks execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.CARD_REVOKED), false);
});

test('VERIFICATION_UNAVAILABLE blocks execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.VERIFICATION_UNAVAILABLE), false);
});

test('missing manifest pointer becomes VERIFICATION_UNAVAILABLE', () => {
  const verification = loadVerification();
  const result = verification.readManifestPointer({
    getAttribute() {
      return null;
    },
  });

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.manifestUrl, null);
  assert.equal(result.error, 'manifest-pointer-missing');
});

test('Coin Card does not call IX_EXECUTION.executeTransfer unless verification gate passes', async () => {
  const runtime = loadCoinCard({ canExecuteTransfer: false });

  await settle();
  const input = runtime.elements.get('ccAmountInput');
  const chip = runtime.elements.get('ccChip');

  input.value = '10';
  input.dispatch('input');
  chip.dispatch('click');
  await settle();

  assert.deepEqual(runtime.executionCalls, []);
  assert.equal(runtime.elements.get('ccCardError').textContent, 'Coin Card verification unavailable. Transfer disabled.');
  assert(runtime.verificationCalls.some((call) => call.type === 'canExecuteTransfer'));
});
