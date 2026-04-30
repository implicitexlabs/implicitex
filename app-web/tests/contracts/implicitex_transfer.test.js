const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ImplicitExTransfer", function () {
  async function deployFixture(overrides = {}) {
    const [owner, treasury, sender, recipient, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    const feeBps = overrides.feeBps ?? 100; // 1%
    const minTransfer = overrides.minTransfer ?? 1n;
    const precision = overrides.precision ?? 1n;

    const transferContract = await ImplicitExTransfer.deploy(
      await usdc.getAddress(),
      treasury.address,
      feeBps,
      minTransfer,
      precision
    );
    await transferContract.waitForDeployment();

    return {
      owner,
      treasury,
      sender,
      recipient,
      other,
      usdc,
      transferContract,
      feeBps,
      minTransfer,
      precision
    };
  }

  async function fundAndApprove({ usdc, transferContract, sender, amount, feeBps }) {
    const fee = (amount * BigInt(feeBps)) / 10000n;
    const totalDebit = amount + fee;
    await usdc.mint(sender.address, totalDebit);
    await usdc.connect(sender).approve(await transferContract.getAddress(), totalDebit);
    return { fee, totalDebit };
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
    const [, treasury] = await ethers.getSigners();
    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");

    await expect(
      ImplicitExTransfer.deploy(ethers.ZeroAddress, treasury.address, 100, 1, 1)
    ).to.be.revertedWith("USDC_ZERO_ADDRESS");
  });

  it("constructor rejects zero treasury", async function () {
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
    const { transferContract, treasury, other } = await deployFixture();

    await expect(transferContract.setTreasury(other.address))
      .to.emit(transferContract, "TreasuryUpdated")
      .withArgs(treasury.address, other.address);

    expect(await transferContract.treasury()).to.equal(other.address);
  });

  it("non-owner cannot update treasury", async function () {
    const { transferContract, sender, other } = await deployFixture();

    await expect(
      transferContract.connect(sender).setTreasury(other.address)
    )
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("non-owner cannot setFeeBasisPoints", async function () {
    const { transferContract, sender } = await deployFixture();

    await expect(transferContract.connect(sender).setFeeBasisPoints(200))
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("non-owner cannot setMinTransferAmount", async function () {
    const { transferContract, sender } = await deployFixture();

    await expect(transferContract.connect(sender).setMinTransferAmount(10))
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("non-owner cannot setTransferPrecision", async function () {
    const { transferContract, sender } = await deployFixture();

    await expect(transferContract.connect(sender).setTransferPrecision(10))
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("non-owner cannot pause", async function () {
    const { transferContract, sender } = await deployFixture();

    await expect(transferContract.connect(sender).pause())
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("non-owner cannot unpause", async function () {
    const { transferContract, sender } = await deployFixture();

    await expect(transferContract.connect(sender).unpause())
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("owner can pause/unpause and emits events", async function () {
    const { transferContract, owner } = await deployFixture();

    await expect(transferContract.pause())
      .to.emit(transferContract, "Paused")
      .withArgs(owner.address);
    expect(await transferContract.paused()).to.equal(true);

    await expect(transferContract.unpause())
      .to.emit(transferContract, "Unpaused")
      .withArgs(owner.address);
    expect(await transferContract.paused()).to.equal(false);
  });

  it("setFeeBasisPoints owner success and emits event", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setFeeBasisPoints(250))
      .to.emit(transferContract, "FeeUpdated")
      .withArgs(100, 250);

    expect(await transferContract.feeBasisPoints()).to.equal(250);
  });

  it("setFeeBasisPoints rejects above MAX_FEE_BPS", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setFeeBasisPoints(1001)).to.be.revertedWith("FEE_TOO_HIGH");
  });

  it("setMinTransferAmount owner success and emits event", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setMinTransferAmount(55))
      .to.emit(transferContract, "MinTransferUpdated")
      .withArgs(1, 55);

    expect(await transferContract.minTransferAmount()).to.equal(55);
  });

  it("setTransferPrecision owner success and emits event", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setTransferPrecision(10))
      .to.emit(transferContract, "PrecisionUpdated")
      .withArgs(1, 10);

    expect(await transferContract.transferPrecision()).to.equal(10);
  });

  it("setTransferPrecision rejects zero", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setTransferPrecision(0)).to.be.revertedWith("PRECISION_ZERO");
  });

  it("non-owner cannot initiate ownership transfer", async function () {
    const { transferContract, sender, other } = await deployFixture();

    await expect(transferContract.connect(sender).transferOwnership(other.address))
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("transferOwnership is two-step: pending owner tracked and old owner stays until acceptance", async function () {
    const { transferContract, owner, other } = await deployFixture();

    await expect(transferContract.transferOwnership(other.address))
      .to.emit(transferContract, "OwnershipTransferStarted")
      .withArgs(owner.address, other.address);

    expect(await transferContract.owner()).to.equal(owner.address);
    expect(await transferContract.pendingOwner()).to.equal(other.address);
  });

  it("random account cannot accept ownership", async function () {
    const { transferContract, sender, other } = await deployFixture();

    await transferContract.transferOwnership(other.address);

    await expect(transferContract.connect(sender).acceptOwnership())
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  it("pending owner can accept ownership", async function () {
    const { transferContract, owner, other } = await deployFixture();

    await transferContract.transferOwnership(other.address);

    await expect(transferContract.connect(other).acceptOwnership())
      .to.emit(transferContract, "OwnershipTransferred")
      .withArgs(owner.address, other.address);

    expect(await transferContract.owner()).to.equal(other.address);
    expect(await transferContract.pendingOwner()).to.equal(ethers.ZeroAddress);
  });

  it("transferWithFee happy path transfers amount to recipient and fee to treasury", async function () {
    const { transferContract, usdc, sender, recipient, treasury, feeBps } = await deployFixture();

    const amount = ethers.parseUnits("100", 6);
    const { fee, totalDebit } = await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, fee, totalDebit);

    expect(await usdc.balanceOf(sender.address)).to.equal(0n);
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
    expect(await usdc.balanceOf(await transferContract.getAddress())).to.equal(0n);
  });

  it("zero-fee transfer path transfers exact amount and emits TransferExecuted", async function () {
    const { transferContract, usdc, sender, recipient, treasury } = await deployFixture({ feeBps: 0 });

    const amount = ethers.parseUnits("50", 6);
    const { fee, totalDebit } = await fundAndApprove({
      usdc,
      transferContract,
      sender,
      amount,
      feeBps: 0
    });

    expect(fee).to.equal(0n);
    expect(totalDebit).to.equal(amount);

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, 0n, amount);

    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);
    expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
  });

  it("fee math and rounding uses floor division", async function () {
    const { transferContract, usdc, sender, recipient, treasury, feeBps } = await deployFixture({ feeBps: 333 });

    const amount = 101n; // floor(101 * 333 / 10000) = 3
    const { fee, totalDebit } = await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    expect(fee).to.equal(3n);
    expect(totalDebit).to.equal(104n);

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, fee, totalDebit);

    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
  });

  it("transferWithFee enforces minTransferAmount", async function () {
    const { transferContract, usdc, sender, recipient } = await deployFixture({ minTransfer: 100n });

    await usdc.mint(sender.address, 1000n);
    await usdc.connect(sender).approve(await transferContract.getAddress(), 1000n);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, 99n)
    ).to.be.revertedWith("AMOUNT_BELOW_MINIMUM");
  });

  it("transferWithFee enforces transferPrecision", async function () {
    const { transferContract, usdc, sender, recipient } = await deployFixture({ precision: 10n });

    await usdc.mint(sender.address, 1000n);
    await usdc.connect(sender).approve(await transferContract.getAddress(), 1000n);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, 11n)
    ).to.be.revertedWith("INVALID_TRANSFER_PRECISION");
  });

  it("transferWithFee rejects zero recipient", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await expect(
      transferContract.connect(sender).transferWithFee(ethers.ZeroAddress, amount)
    ).to.be.revertedWith("RECIPIENT_ZERO_ADDRESS");
  });

  it("transferWithFee rejects while paused", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });
    await transferContract.pause();

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    ).to.be.revertedWithCustomError(transferContract, "EnforcedPause");
  });

  it("transferWithFee reverts when transferFrom fails", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });
    await usdc.setFailTransferFrom(true);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    )
      .to.be.revertedWithCustomError(transferContract, "SafeERC20FailedOperation")
      .withArgs(await usdc.getAddress());
  });

  it("transferWithFee reverts when recipient transfer fails", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });
    await usdc.setFailTransferOnCall(1);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    )
      .to.be.revertedWithCustomError(transferContract, "SafeERC20FailedOperation")
      .withArgs(await usdc.getAddress());
  });

  it("transferWithFee reverts when fee transfer fails", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture({ feeBps: 100 });

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });
    await usdc.setFailTransferOnCall(2);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    )
      .to.be.revertedWithCustomError(transferContract, "SafeERC20FailedOperation")
      .withArgs(await usdc.getAddress());
  });

  it("malicious reentrant token callback attempt cannot reenter transferWithFee", async function () {
    const [owner, treasury, sender, recipient] = await ethers.getSigners();

    const ReentrantERC20Mock = await ethers.getContractFactory("ReentrantERC20Mock");
    const reentrantToken = await ReentrantERC20Mock.deploy("Reentrant Mock", "rMOCK", 6);
    await reentrantToken.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    const transferContract = await ImplicitExTransfer.deploy(
      await reentrantToken.getAddress(),
      treasury.address,
      100,
      1,
      1
    );
    await transferContract.waitForDeployment();

    const amount = 100n;
    const fee = (amount * 100n) / 10000n;
    const totalDebit = amount + fee;

    await reentrantToken.mint(sender.address, totalDebit * 2n);
    await reentrantToken.connect(sender).approve(await transferContract.getAddress(), totalDebit * 2n);
    await reentrantToken.configureReentry(await transferContract.getAddress(), recipient.address, amount);
    await reentrantToken.setReentryEnabled(true);

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, fee, totalDebit);

    expect(await reentrantToken.reentryAttempted()).to.equal(true);
    expect(await reentrantToken.reentrySucceeded()).to.equal(false);
  });

  it("fee-on-transfer token behavior is unsupported and transferWithFee fails safely", async function () {
    const [owner, treasury, sender, recipient] = await ethers.getSigners();

    const FeeOnTransferERC20Mock = await ethers.getContractFactory("FeeOnTransferERC20Mock");
    const feeToken = await FeeOnTransferERC20Mock.deploy("Fee Mock", "fMOCK", 6, 500); // 5%
    await feeToken.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    const transferContract = await ImplicitExTransfer.deploy(
      await feeToken.getAddress(),
      treasury.address,
      100,
      1,
      1
    );
    await transferContract.waitForDeployment();

    const amount = 1000n;
    const fee = (amount * 100n) / 10000n;
    const totalDebit = amount + fee;

    await feeToken.mint(sender.address, totalDebit);
    await feeToken.connect(sender).approve(await transferContract.getAddress(), totalDebit);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    ).to.be.revertedWith("MOCK_INSUFFICIENT_BALANCE");
  });

  it("multiple sequential transfers preserve expected balances", async function () {
    const { transferContract, usdc, sender, recipient, treasury, feeBps } = await deployFixture({ feeBps: 100 });

    const amount1 = 1_000_000n; // 1.0 USDC (6 decimals)
    const amount2 = 2_500_000n; // 2.5 USDC
    const fee1 = (amount1 * 100n) / 10000n;
    const fee2 = (amount2 * 100n) / 10000n;
    const totalDebit = amount1 + fee1 + amount2 + fee2;

    await usdc.mint(sender.address, totalDebit);
    await usdc.connect(sender).approve(await transferContract.getAddress(), totalDebit);

    await transferContract.connect(sender).transferWithFee(recipient.address, amount1);
    await transferContract.connect(sender).transferWithFee(recipient.address, amount2);

    expect(await usdc.balanceOf(sender.address)).to.equal(0n);
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount1 + amount2);
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee1 + fee2);
    expect(await usdc.balanceOf(await transferContract.getAddress())).to.equal(0n);
  });

  it("pause blocks transferWithFee but owner config updates remain available", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await transferContract.pause();

    await expect(transferContract.setFeeBasisPoints(200)).to.emit(transferContract, "FeeUpdated");
    await expect(transferContract.setMinTransferAmount(2)).to.emit(transferContract, "MinTransferUpdated");
    await expect(transferContract.setTransferPrecision(2)).to.emit(transferContract, "PrecisionUpdated");

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    ).to.be.revertedWithCustomError(transferContract, "EnforcedPause");
  });
});
