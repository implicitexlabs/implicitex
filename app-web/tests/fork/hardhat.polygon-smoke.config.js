'use strict';

require('@nomicfoundation/hardhat-toolbox');

const { loadCanonicalPolicy } = require('./ix-gas-policy-loader.js');

const upstreamForkUrl = process.env.IMPLICITEX_RPC_URL_POLYGON;

if (!upstreamForkUrl) {
  throw new Error('Polygon fork RPC environment is required');
}

if (process.env.IMPLICITEX_DEPLOYER_KEY !== undefined) {
  throw new Error('The local fork smoke process must not load a deployer key');
}

// Load canonical policy at config time. Fails immediately if the module is
// unavailable or any required field is absent.
const { policy: CANONICAL_POLICY } = loadCanonicalPolicy();
const SOURCE_CHAIN_ID_NUMBER = Number(CANONICAL_POLICY.security.chainId);

// Build the Hardhat chains hardfork-history entry keyed by the policy chain ID.
// This is a fork configuration value (the specific fork block and hardfork schedule
// are determined by the test harness, not policy), but the chain ID key must match
// the policy-owned source chain.
const chainsHardforkConfig = {};
chainsHardforkConfig[SOURCE_CHAIN_ID_NUMBER] = {
  hardforkHistory: {
    shanghai: 0,
  },
};

module.exports = {
  defaultNetwork: 'hardhat',
  solidity: '0.8.24',
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: 'shanghai',
      chains: chainsHardforkConfig,
      forking: {
        url: upstreamForkUrl,
        blockNumber: 90357660,
      },
    },
  },
  paths: {
    sources: '../../contracts',
    tests: '.',
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
};
