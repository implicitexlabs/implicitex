require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const deployerKey      = process.env.IMPLICITEX_DEPLOYER_KEY;
const rpcAmoy          = process.env.IMPLICITEX_RPC_URL_AMOY;
const rpcPolygon       = process.env.IMPLICITEX_RPC_URL_POLYGON;
const etherscanApiKey  = process.env.POLYGONSCAN_API_KEY;

// Networks are only included when the required env vars are present.
// Local `npm test` runs against the default Hardhat in-memory network with
// no env vars required.
const networks = {};

if (rpcAmoy && deployerKey) {
  networks["polygon-amoy"] = {
    url:     rpcAmoy,
    accounts: [deployerKey],
    chainId: 80002
  };
}

if (rpcPolygon && deployerKey) {
  networks["polygon"] = {
    url:      rpcPolygon,
    accounts: [deployerKey],
    chainId:  137
  };
}

module.exports = {
  solidity: "0.8.24",
  paths: {
    sources:   "./contracts",
    tests:     "./tests",
    cache:     "./cache",
    artifacts: "./artifacts"
  },
  networks,
  // Etherscan API V2 uses a single key across all chains (Ethereum, Polygon, etc.)
  // The flat string format is required — the per-network keyed object is V1 (deprecated).
  // Key from etherscan.io — works for Polygonscan verification via the V2 API.
  etherscan: {
    apiKey: etherscanApiKey || ""
  }
};
