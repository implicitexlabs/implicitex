const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ethers } = require('hardhat');

function normalizeAddress(value) {
  return value == null ? null : String(value).toLowerCase();
}

function normalizeScalar(value) {
  return value == null ? null : String(value);
}

function compareSourceSet({ live, deployment, chains, state, normalize = normalizeScalar, required = { deployment: true, chains: true, state: true } }) {
  const normalized = {
    live: normalize(live),
    deployment: deployment.present ? normalize(deployment.value) : null,
    chains: chains.present ? normalize(chains.value) : null,
    state: state.present ? normalize(state.value) : null,
  };
  const matches = {
    deployment: deployment.present ? normalized.live === normalized.deployment : null,
    chains: chains.present ? normalized.live === normalized.chains : null,
    state: state.present ? normalized.live === normalized.state : null,
  };
  const requiredMismatch = Object.entries(required).some(([key, needed]) => needed && matches[key] === false);
  return { live, deployment, chains, state, normalized, matches, requiredMismatch };
}

function compareAddressSet({ live, deployment, chains, state, required }) {
  return compareSourceSet({
    live,
    deployment,
    chains,
    state,
    normalize: normalizeAddress,
    required,
  });
}

function compareScalarSet({ live, deployment, chains, state, required }) {
  return compareSourceSet({
    live,
    deployment,
    chains,
    state,
    normalize: normalizeScalar,
    required,
  });
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const deploymentPath = path.join(repoRoot, 'app-web/deployments/polygon.json');
  const chainsPath = path.join(repoRoot, 'app-web/frontend/public/config/chains.js');
  const contractPath = path.join(repoRoot, 'docs/product/coin-card/coin-card.state.v1.json');
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
  const stateContract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const chainsSource = fs.readFileSync(chainsPath, 'utf8');
  const rpcUrl = process.env.IMPLICITEX_RPC_URL_POLYGON || 'https://polygon-bor-rpc.publicnode.com';

  const context = { window: {} };
  vm.runInNewContext(chainsSource, context, { filename: 'chains.js', timeout: 1000 });
  const chainConfig = context.window.IX_CHAINS[String(deployment.chainId)] || {};

  const provider = new ethers.JsonRpcProvider(rpcUrl, 137);
  const chain = await provider.getNetwork();
  const contract = new ethers.Contract(
    deployment.address,
    [
      'function usdc() view returns (address)',
      'function treasury() view returns (address)',
      'function feeBasisPoints() view returns (uint16)',
      'function minTransferAmount() view returns (uint256)',
      'function transferPrecision() view returns (uint256)',
    ],
    provider
  );
  const token = new ethers.Contract(
    deployment.usdc,
    ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
    provider
  );

  const onChain = {
    chainId: Number(chain.chainId),
    contractAddress: await contract.getAddress(),
    usdcAddress: await contract.usdc(),
    treasury: await contract.treasury(),
    feeBasisPoints: Number(await contract.feeBasisPoints()),
    minTransferAmount: (await contract.minTransferAmount()).toString(),
    transferPrecision: (await contract.transferPrecision()).toString(),
    usdcDecimals: Number(await token.decimals()),
    usdcSymbol: await token.symbol(),
  };

  const scale = 10n ** BigInt(stateContract.productionParameters.usdcDecimals.value);
  const expected = {
    chainId: stateContract.productionParameters.network.chainId,
    contractAddress: stateContract.productionParameters.transferContractAddress.value,
    usdcAddress: stateContract.productionParameters.tokenAddress.value,
    treasury: deployment.treasury,
    feeBasisPoints: stateContract.productionParameters.feeBasisPoints.value,
    minTransferAmount: stateContract.productionParameters.minimumAmountUnits.value,
    transferPrecision: stateContract.productionParameters.transferPrecisionUnits.value,
    usdcDecimals: stateContract.productionParameters.usdcDecimals.value,
  };

  const comparisons = {
    chainId: compareScalarSet({
      live: onChain.chainId,
      deployment: { present: true, value: deployment.chainId },
      chains: { present: true, value: Number(chainConfig.chainId || deployment.chainId) || deployment.chainId },
      state: { present: true, value: stateContract.productionParameters.network.chainId },
      required: { deployment: true, chains: true, state: true },
    }),
    tokenAddress: compareAddressSet({
      live: onChain.usdcAddress,
      deployment: { present: true, value: deployment.usdc },
      chains: { present: !!chainConfig.usdcAddress, value: chainConfig.usdcAddress || null },
      state: { present: true, value: stateContract.productionParameters.tokenAddress.value },
      required: { deployment: true, chains: !!chainConfig.usdcAddress, state: true },
    }),
    transferContractAddress: compareAddressSet({
      live: onChain.contractAddress,
      deployment: { present: true, value: deployment.address },
      chains: { present: !!chainConfig.contractAddress, value: chainConfig.contractAddress || null },
      state: { present: true, value: stateContract.productionParameters.transferContractAddress.value },
      required: { deployment: true, chains: !!chainConfig.contractAddress, state: true },
    }),
    treasury: compareAddressSet({
      live: onChain.treasury,
      deployment: { present: true, value: deployment.treasury },
      chains: { present: false, value: null },
      state: { present: false, value: null },
      required: { deployment: true, chains: false, state: false },
    }),
    feeBasisPoints: compareScalarSet({
      live: onChain.feeBasisPoints,
      deployment: { present: true, value: deployment.feeBps },
      chains: { present: true, value: chainConfig.feeBasisPoints },
      state: { present: true, value: stateContract.productionParameters.feeBasisPoints.value },
      required: { deployment: true, chains: true, state: true },
    }),
    minTransferAmount: compareScalarSet({
      live: onChain.minTransferAmount,
      deployment: { present: true, value: String(deployment.minTransfer) },
      chains: { present: true, value: String(BigInt(chainConfig.minTransferUsdc || 0) * scale) },
      state: { present: true, value: stateContract.productionParameters.minimumAmountUnits.value },
      required: { deployment: true, chains: true, state: true },
    }),
    transferPrecision: compareScalarSet({
      live: onChain.transferPrecision,
      deployment: { present: true, value: String(deployment.precision) },
      chains: { present: false, value: null },
      state: { present: true, value: stateContract.productionParameters.transferPrecisionUnits.value },
      required: { deployment: true, chains: false, state: true },
    }),
    usdcDecimals: compareScalarSet({
      live: onChain.usdcDecimals,
      deployment: { present: false, value: null },
      chains: { present: false, value: null },
      state: { present: true, value: stateContract.productionParameters.usdcDecimals.value },
      required: { deployment: false, chains: false, state: true },
    }),
  };

  const mismatches = Object.entries(comparisons)
    .filter(([, comparison]) => comparison.requiredMismatch)
    .map(([name]) => name);

  if (mismatches.length) {
    console.error('Coin Card production parameter mismatch:', mismatches.join(', '));
    console.error(JSON.stringify(comparisons, null, 2));
    process.exit(1);
  }

  const evidence = {
    date: new Date().toISOString(),
    rpcUrl: rpcUrl.replace(/:\/\/[^@/]+@/, '://***@'),
    deployment,
    chainsConfig: {
      chainId: chainConfig.chainId || deployment.chainId,
      usdcAddress: chainConfig.usdcAddress || null,
      contractAddress: chainConfig.contractAddress || null,
      feeBasisPoints: chainConfig.feeBasisPoints ?? null,
      minTransferUsdc: chainConfig.minTransferUsdc ?? null,
      maxTransferUsdc: chainConfig.maxTransferUsdc ?? null,
      transfersEnabled: chainConfig.transfersEnabled ?? null,
    },
    onChain,
    expected,
    comparisons,
  };

  const evidencePath = path.join(repoRoot, 'docs/operations/evidence/coin-card-production-parameters-2026-07-07.json');
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Coin Card production parameters verified. Evidence written to ${path.relative(repoRoot, evidencePath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
