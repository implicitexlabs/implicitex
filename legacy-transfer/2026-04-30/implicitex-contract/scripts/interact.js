const hre = require("hardhat");

async function main() {
    const ImplicitTransfer = await hre.ethers.getContractFactory("ImplicitTransfer");

    const contract = await ImplicitTransfer.deploy();
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log("Deployed at:", address);
    
    const owner = await contract.getOwner();
    console.log("Owner:", owner);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});