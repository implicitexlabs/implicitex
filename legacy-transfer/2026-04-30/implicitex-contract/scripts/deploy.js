const hre = require("hardhat");

async function main() {
  const ImplicitTransfer = await hre.ethers.getContractFactory("ImplicitTransfer");

  // Deploy the contract
  const contract = await ImplicitTransfer.deploy();

  // Wait for deployment to finish
  await contract.waitForDeployment();

  // Get the contract address
  const address = await contract.getAddress();

  console.log("ImplicitTransfer deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});