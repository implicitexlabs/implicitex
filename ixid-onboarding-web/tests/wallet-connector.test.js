'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  POLYGON_MAINNET_CHAIN_ID,
  createWalletConnector,
} = require(path.join(__dirname, '../public/wallet-connector.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Build a minimal EIP-1193 provider stub.
function makeProvider(options) {
  const opts = options || {};
  // accounts: array of addresses to return from eth_requestAccounts
  // chainId: raw chain ID to return from eth_chainId (decimal int or hex string)
  // rejectAccounts: if true, eth_requestAccounts rejects (user rejection)
  // rejectChain: if true, eth_chainId rejects
  return {
    request: function request(args) {
      if (args.method === 'eth_requestAccounts') {
        if (opts.rejectAccounts) {
          const err = new Error('User rejected');
          err.code = 4001;
          return Promise.reject(err);
        }
        return Promise.resolve(opts.accounts || []);
      }
      if (args.method === 'eth_chainId') {
        if (opts.rejectChain) {
          return Promise.reject(new Error('chain read failed'));
        }
        const id = opts.chainId !== undefined ? opts.chainId : POLYGON_MAINNET_CHAIN_ID;
        return Promise.resolve(id);
      }
      return Promise.reject(new Error('unsupported method: ' + args.method));
    },
  };
}

function connector(providerOrNull, chainId) {
  return createWalletConnector({
    chainId: chainId !== undefined ? chainId : POLYGON_MAINNET_CHAIN_ID,
    providerGetter: function () { return providerOrNull || null; },
  });
}

// ─── isAvailable ──────────────────────────────────────────────────────────────

test('isAvailable returns false when no provider is present', function () {
  const c = connector(null);
  assert.equal(c.isAvailable(), false);
});

test('isAvailable returns true when an EIP-1193 provider is present', function () {
  const c = connector(makeProvider());
  assert.equal(c.isAvailable(), true);
});

// ─── validateAddress ──────────────────────────────────────────────────────────

test('validateAddress accepts a valid lowercase EVM address', function () {
  assert.equal(
    createWalletConnector().validateAddress('0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb'),
    true,
  );
});

test('validateAddress accepts a mixed-case EVM address (EIP-55 checksum format)', function () {
  assert.equal(
    createWalletConnector().validateAddress('0xAb16A96D359eC26a11e2C2b3d8f8B8942d5Bfcdb'),
    true,
  );
});

test('validateAddress rejects an address without 0x prefix', function () {
  assert.equal(
    createWalletConnector().validateAddress('ab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb'),
    false,
  );
});

test('validateAddress rejects an address that is too short', function () {
  assert.equal(
    createWalletConnector().validateAddress('0xab16a96d359ec26a11e2c2b3d8f8b'),
    false,
  );
});

test('validateAddress rejects an address that is too long', function () {
  assert.equal(
    createWalletConnector().validateAddress('0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb00'),
    false,
  );
});

test('validateAddress rejects null and non-string inputs', function () {
  const c = createWalletConnector();
  assert.equal(c.validateAddress(null), false);
  assert.equal(c.validateAddress(undefined), false);
  assert.equal(c.validateAddress(42), false);
});

// ─── validateChainId ──────────────────────────────────────────────────────────

test('validateChainId accepts the correct decimal chain ID', function () {
  const c = connector(null, 137);
  assert.equal(c.validateChainId(137), true);
});

test('validateChainId accepts the correct hex string chain ID (0x89 = 137)', function () {
  const c = connector(null, 137);
  assert.equal(c.validateChainId('0x89'), true);
});

test('validateChainId rejects a different chain ID', function () {
  const c = connector(null, 137);
  assert.equal(c.validateChainId(1), false);   // Ethereum mainnet
  assert.equal(c.validateChainId(80001), false); // Polygon Amoy (testnet)
});

test('validateChainId works with a custom configured chain', function () {
  const c = createWalletConnector({
    chainId: 80002,
    providerGetter: function () { return null; },
  });
  assert.equal(c.validateChainId(80002), true);
  assert.equal(c.validateChainId(137), false);
});

// ─── connect — provider absent ─────────────────────────────────────────────────

test('connect resolves rejected=true with reason no_provider when no provider', async function () {
  const c = connector(null);
  const result = await c.connect();
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'no_provider');
});

// ─── connect — user rejection ──────────────────────────────────────────────────

test('connect resolves rejected=true with reason user_rejected when wallet declines', async function () {
  const provider = makeProvider({ rejectAccounts: true });
  const c = connector(provider);
  const result = await c.connect();
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'user_rejected');
  assert.equal(result.code, 4001);
});

// ─── connect — success ────────────────────────────────────────────────────────

test('connect resolves with address and chainId on successful connection', async function () {
  const provider = makeProvider({
    accounts: ['0xab16A96D359eC26a11e2C2b3d8f8B8942d5Bfcdb'],
    chainId: 137,
  });
  const c = connector(provider);
  const result = await c.connect();
  assert.equal(result.rejected, false);
  // Address is normalised to lowercase.
  assert.equal(result.address, '0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb');
  assert.equal(result.chainId, 137);
});

test('connect accepts hex chain ID string from provider', async function () {
  const provider = makeProvider({
    accounts: ['0xab16A96D359eC26a11e2C2b3d8f8B8942d5Bfcdb'],
    chainId: '0x89',  // hex 137
  });
  const c = connector(provider);
  const result = await c.connect();
  assert.equal(result.rejected, false);
  assert.equal(result.chainId, 137);
});

// ─── connect — chain mismatch ─────────────────────────────────────────────────

test('connect resolves rejected=true with reason wrong_chain when chain does not match', async function () {
  const provider = makeProvider({
    accounts: ['0xab16A96D359eC26a11e2C2b3d8f8B8942d5Bfcdb'],
    chainId: 1,  // Ethereum mainnet, not Polygon
  });
  const c = connector(provider);
  const result = await c.connect();
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'wrong_chain');
  assert.equal(result.chainId, 1);
  assert.equal(result.expected, 137);
});

// ─── connect — empty accounts ─────────────────────────────────────────────────

test('connect resolves rejected=true with reason no_accounts when provider returns empty list', async function () {
  const provider = makeProvider({ accounts: [], chainId: 137 });
  const c = connector(provider);
  const result = await c.connect();
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'no_accounts');
});

// ─── connect — chain read failure ─────────────────────────────────────────────

test('connect resolves rejected=true with reason chain_read_failed when eth_chainId rejects', async function () {
  const provider = makeProvider({
    accounts: ['0xab16A96D359eC26a11e2C2b3d8f8B8942d5Bfcdb'],
    rejectChain: true,
  });
  const c = connector(provider);
  const result = await c.connect();
  assert.equal(result.rejected, true);
  assert.equal(result.reason, 'chain_read_failed');
});

// ─── reconnection ─────────────────────────────────────────────────────────────

test('connect can be called again after a prior rejection (reconnection)', async function () {
  // First call: user rejects.
  let shouldReject = true;
  const provider = {
    request: function request(args) {
      if (args.method === 'eth_requestAccounts') {
        if (shouldReject) {
          const err = new Error('User rejected');
          err.code = 4001;
          return Promise.reject(err);
        }
        return Promise.resolve(['0xab16A96D359eC26a11e2C2b3d8f8B8942d5Bfcdb']);
      }
      if (args.method === 'eth_chainId') {
        return Promise.resolve(137);
      }
      return Promise.reject(new Error('unsupported'));
    },
  };

  const c = connector(provider);

  const first = await c.connect();
  assert.equal(first.rejected, true);
  assert.equal(first.reason, 'user_rejected');

  // Second call: user approves.
  shouldReject = false;
  const second = await c.connect();
  assert.equal(second.rejected, false);
  assert.equal(second.address, '0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb');
});

// ─── default providerGetter ───────────────────────────────────────────────────

test('createWalletConnector uses POLYGON_MAINNET_CHAIN_ID when no chainId option given', function () {
  const c = createWalletConnector({ providerGetter: function () { return null; } });
  assert.equal(c.isAvailable(), false);
  assert.equal(c.validateChainId(POLYGON_MAINNET_CHAIN_ID), true);
  assert.equal(c.validateChainId(1), false);
});

test('POLYGON_MAINNET_CHAIN_ID is 137', function () {
  assert.equal(POLYGON_MAINNET_CHAIN_ID, 137);
});

// ─── runner ───────────────────────────────────────────────────────────────────

(async function run() {
  let passed = 0;
  const failures = [];
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
    } catch (error) {
      failures.push({ name: entry.name, error });
    }
  }
  failures.forEach(function (failure) {
    process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
  });
  process.stdout.write('\n' + passed + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) process.exitCode = 1;
}());
