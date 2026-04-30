const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ImplicitExTransfer", function () {
  async function deployFixture() {
    const [owner, treasury, sender, recipient, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    const feeBps = 100; // 1%
    const minTransfer = 1n;
    const precision = 1n;

    const transferContract = await ImplicitExTransfer.deploy(
      await usdc.getAddress(),
      treasury.address,
      feeBps,
      minTransfer,
      precision
    );
    await transferContract.waitForDeployment();

    return { owner, treasury, sender, recipient, other, usdc, transferContract, feeBps, minTransfer, precision };
  }

  it("constructor stores usdc, treasury, fee bps, min amount, precision, owner", async function () {
    const { owner, treasury, usdc, transferContract, feeBps, minTransfer, precision } = await deployFixture();

    expect(await transferContract.usdc()).to.equal(await usdc.getAddress());
    expect(await transferContract.treasury()).to.equal(treasury.address);
    expect(await transferContract.feeBasisPoints()).to.equal(feeBps);
    expect(await transferContract.minTransferAmount()).to.equal(minTransfer);
    expect(await transferContract.transferPrecision()).to.equal(precision);
    expect(await transferContract.owner()).to.equal(owner.address);
  });

  it("constructor rejects zero USDC", async function () {
    const [owner, treasury] = await ethers.getSigners();
    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");

    await expect(
      ImplicitExTransfer.deploy(ethers.ZeroAddress, treasury.address, 100, 1, 1)
    ).to.be.revertedWith("USDC_ZERO_ADDRESS");
  });

  it("constructor rejects zero treasury", async function () {
    const [, , , , ] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), ethers.ZeroAddress, 100, 1, 1)
    ).to.be.revertedWith("TREASURY_ZERO_ADDRESS");
  });

  it("constructor rejects fee above max", async function () {
    const [, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), treasury.address, 1001, 1, 1)
    ).to.be.revertedWith("FEE_TOO_HIGH");
  });

  it("constructor rejects zero precision", async function () {
    const [, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), treasury.address, 100, 1, 0)
    ).to.be.revertedWith("PRECISION_ZERO");
  });

  it("owner can update treasury", async function () {
    const { transferContract, other } = await deployFixture();

    await expect(transferContract.setTreasury(other.address))
      .to.emit(transferContract, "TreasuryUpdated");

    expect(await transferContract.treasury()).to.equal(other.address);
  });

  it("non-owner cannot update treasury", async function () {
    const { transferContract, sender, other } = await deployFixture();

    await expect(
      transferContract.connect(sender).setTreasury(other.address)
    ).to.be.revertedWith("OWNER_ONLY");
  });

  it("owner can pause/unpause", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.pause()).to.emit(transferContract, "Paused");
    expect(await transferContract.paused()).to.equal(true);

    await expect(transferContract.unpause()).to.emit(transferContract, "Unpaused");
    expect(await transferContract.paused()).to.equal(false);
  });

  it("transferWithFee happy path transfers amount to recipient and fee to treasury", async function () {
    const { transferContract, usdc, sender, recipient, treasury } = await deployFixture();

    const amount = ethers.parseUnits("100", 6);
    const fee = (amount * 100n) / 10000n;
    const totalDebit = amount + fee;

    await usdc.mint(sender.address, totalDebit);
    await usdc.connect(sender).approve(await transferContract.getAddress(), totalDebit);

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, fee, totalDebit);

    expect(await usdc.balanceOf(sender.address)).to.equal(0n);
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
    expect(await usdc.balanceOf(await transferContract.getAddress())).to.equal(0n);
  });
});
