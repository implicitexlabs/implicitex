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
    ).to.be.revertedWithCustomError(ImplicitExTransfer, "UsdcZeroAddress");
  });

  it("constructor rejects zero treasury", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), ethers.ZeroAddress, 100, 1, 1)
    ).to.be.revertedWithCustomError(ImplicitExTransfer, "TreasuryZeroAddress");
  });

  it("constructor rejects treasury set to configured USDC token", async function () {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    const usdcAddress = await usdc.getAddress();

    await expect(
      ImplicitExTransfer.deploy(usdcAddress, usdcAddress, 100, 1, 1)
    )
      .to.be.revertedWithCustomError(ImplicitExTransfer, "InvalidTreasury")
      .withArgs(usdcAddress);
  });

  it("constructor rejects fee above max", async function () {
    const [, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), treasury.address, 101, 1, 1)
    )
      .to.be.revertedWithCustomError(ImplicitExTransfer, "FeeTooHigh")
      .withArgs(101, 100);
  });

  it("constructor rejects zero precision", async function () {
    const [, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), treasury.address, 100, 1, 0)
    ).to.be.revertedWithCustomError(ImplicitExTransfer, "PrecisionZero");
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

    await expect(transferContract.setFeeBasisPoints(50))
      .to.emit(transferContract, "FeeUpdated")
      .withArgs(100, 50);

    expect(await transferContract.feeBasisPoints()).to.equal(50);
  });

  it("setFeeBasisPoints rejects above MAX_FEE_BPS", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setFeeBasisPoints(101))
      .to.be.revertedWithCustomError(transferContract, "FeeTooHigh")
      .withArgs(101, 100);
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

    await expect(transferContract.setTransferPrecision(0))
      .to.be.revertedWithCustomError(transferContract, "PrecisionZero");
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

  it("production minimum rejects dust amounts", async function () {
    const minTransfer = ethers.parseUnits("1", 6);
    const { transferContract, sender, recipient } = await deployFixture({
      minTransfer,
      precision: minTransfer
    });

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, 1n)
    )
      .to.be.revertedWithCustomError(transferContract, "AmountBelowMinimum")
      .withArgs(1n, minTransfer);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, minTransfer - 1n)
    )
      .to.be.revertedWithCustomError(transferContract, "AmountBelowMinimum")
      .withArgs(minTransfer - 1n, minTransfer);
  });

  it("production minimum valid amount charges a nonzero one percent fee", async function () {
    const minTransfer = ethers.parseUnits("1", 6);
    const { transferContract, usdc, sender, recipient, treasury, feeBps } = await deployFixture({
      minTransfer,
      precision: minTransfer,
      feeBps: 100
    });

    const amount = minTransfer;
    const { fee, totalDebit } = await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    expect(fee).to.equal(10_000n);
    expect(totalDebit).to.equal(1_010_000n);

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, fee, totalDebit);

    expect(await usdc.balanceOf(recipient.address)).to.equal(amount);
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
    expect(await usdc.balanceOf(await transferContract.getAddress())).to.equal(0n);
  });

  it("production 100 USDC amount charges exactly 1 USDC fee", async function () {
    const minTransfer = ethers.parseUnits("1", 6);
    const { transferContract, usdc, sender, recipient, treasury, feeBps } = await deployFixture({
      minTransfer,
      precision: minTransfer,
      feeBps: 100
    });

    const amount = ethers.parseUnits("100", 6);
    const { fee, totalDebit } = await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    expect(fee).to.equal(1_000_000n);
    expect(totalDebit).to.equal(101_000_000n);

    await expect(transferContract.connect(sender).transferWithFee(recipient.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, recipient.address, amount, fee, totalDebit);

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
    // feeBps: 99 (0.99%) with amount 1001 → floor(1001 * 99 / 10000) = floor(99.099) = 99
    const { transferContract, usdc, sender, recipient, treasury, feeBps } = await deployFixture({ feeBps: 99 });

    const amount = 1001n;
    const { fee, totalDebit } = await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    expect(fee).to.equal(9n); // floor(1001 * 99 / 10000) = floor(9.9099) = 9
    expect(totalDebit).to.equal(1010n);

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
    )
      .to.be.revertedWithCustomError(transferContract, "AmountBelowMinimum")
      .withArgs(99n, 100n);
  });

  it("transferWithFee enforces transferPrecision", async function () {
    const { transferContract, usdc, sender, recipient } = await deployFixture({ precision: 10n });

    await usdc.mint(sender.address, 1000n);
    await usdc.connect(sender).approve(await transferContract.getAddress(), 1000n);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, 11n)
    )
      .to.be.revertedWithCustomError(transferContract, "InvalidTransferPrecision")
      .withArgs(11n, 10n);
  });

  it("transferWithFee rejects zero recipient", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await expect(
      transferContract.connect(sender).transferWithFee(ethers.ZeroAddress, amount)
    ).to.be.revertedWithCustomError(transferContract, "RecipientZeroAddress");
  });

  it("transferWithFee rejects the transfer contract as recipient", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await expect(
      transferContract.connect(sender).transferWithFee(await transferContract.getAddress(), amount)
    )
      .to.be.revertedWithCustomError(transferContract, "InvalidRecipient")
      .withArgs(await transferContract.getAddress());
  });

  it("transferWithFee rejects the configured USDC token contract as recipient", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await expect(
      transferContract.connect(sender).transferWithFee(await usdc.getAddress(), amount)
    )
      .to.be.revertedWithCustomError(transferContract, "InvalidRecipient")
      .withArgs(await usdc.getAddress());
  });

  it("transferWithFee allows treasury as recipient by explicit policy", async function () {
    const { transferContract, usdc, sender, treasury, feeBps } = await deployFixture();

    const amount = 100n;
    const { fee, totalDebit } = await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await expect(transferContract.connect(sender).transferWithFee(treasury.address, amount))
      .to.emit(transferContract, "TransferExecuted")
      .withArgs(sender.address, treasury.address, amount, fee, totalDebit);

    expect(await usdc.balanceOf(treasury.address)).to.equal(amount + fee);
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

  it("transferWithFee reverts when recipient transferFrom fails", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });
    await usdc.setFailTransferFromOnCall(1);

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    )
      .to.be.revertedWithCustomError(transferContract, "SafeERC20FailedOperation")
      .withArgs(await usdc.getAddress());
  });

  it("transferWithFee reverts when fee transferFrom fails", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture({ feeBps: 100 });

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });
    await usdc.setFailTransferFromOnCall(2);

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

  it("fee-on-transfer token: transaction completes but recipient receives less than amount", async function () {
    // With direct routing the contract never holds tokens, so there is no
    // "contract tried to send more than it received" revert path. Fee-on-transfer
    // tokens are not a supported use case (this contract is for USDC only).
    // The invariant that matters: contract balance remains zero; recipient
    // receives whatever the token delivers after its own internal fee.
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
    const implicitExFee = (amount * 100n) / 10000n;
    const totalDebit = amount + implicitExFee;

    await feeToken.mint(sender.address, totalDebit);
    await feeToken.connect(sender).approve(await transferContract.getAddress(), totalDebit);

    // Transaction succeeds; token takes 5% on each transferFrom leg
    await transferContract.connect(sender).transferWithFee(recipient.address, amount);

    // Recipient gets amount minus the token's 5% cut (950 of 1000)
    const tokenFeeOnAmount = (amount * 500n) / 10000n;
    expect(await feeToken.balanceOf(recipient.address)).to.equal(amount - tokenFeeOnAmount);

    // Contract holds nothing — direct routing leaves no residual balance
    expect(await feeToken.balanceOf(await transferContract.getAddress())).to.equal(0n);
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

  // ---- M2 fix: initialMinTransfer must be > 0 ----

  it("constructor rejects zero minTransfer", async function () {
    const [, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await usdc.waitForDeployment();

    const ImplicitExTransfer = await ethers.getContractFactory("ImplicitExTransfer");
    await expect(
      ImplicitExTransfer.deploy(await usdc.getAddress(), treasury.address, 100, 0, 1)
    ).to.be.revertedWithCustomError(ImplicitExTransfer, "MinTransferZero");
  });

  // ---- M1 fix: treasury cannot be set to the contract address ----

  it("setTreasury rejects contract's own address as treasury", async function () {
    const { transferContract } = await deployFixture();
    const contractAddr = await transferContract.getAddress();

    await expect(
      transferContract.setTreasury(contractAddr)
    )
      .to.be.revertedWithCustomError(transferContract, "InvalidTreasury")
      .withArgs(contractAddr);
  });

  it("setTreasury rejects the configured USDC token address as treasury", async function () {
    const { transferContract, usdc } = await deployFixture();

    await expect(
      transferContract.setTreasury(await usdc.getAddress())
    )
      .to.be.revertedWithCustomError(transferContract, "InvalidTreasury")
      .withArgs(await usdc.getAddress());
  });

  it("setMinTransferAmount rejects zero", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setMinTransferAmount(0))
      .to.be.revertedWithCustomError(transferContract, "MinTransferZero");
  });

  // ---- MAX_FEE_BPS boundary ----

  it("setFeeBasisPoints accepts MAX_FEE_BPS exactly (100 bps = 1%)", async function () {
    const { transferContract } = await deployFixture();

    // Already at 100; lower then raise back to verify exact boundary
    await transferContract.setFeeBasisPoints(50);
    await expect(transferContract.setFeeBasisPoints(100))
      .to.emit(transferContract, "FeeUpdated")
      .withArgs(50, 100);

    expect(await transferContract.feeBasisPoints()).to.equal(100);
  });

  it("setFeeBasisPoints rejects 101 bps — owner cannot exceed 1% cap", async function () {
    const { transferContract } = await deployFixture();

    await expect(transferContract.setFeeBasisPoints(101))
      .to.be.revertedWithCustomError(transferContract, "FeeTooHigh")
      .withArgs(101, 100);
  });

  // ---- M3 fix: rescueERC20 ----

  it("rescueERC20 owner can recover a non-USDC token stuck in the contract", async function () {
    const { transferContract, other } = await deployFixture();
    const contractAddr = await transferContract.getAddress();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const stuckToken = await MockERC20.deploy("Stuck Token", "STUCK", 18);
    await stuckToken.waitForDeployment();

    const stuckAmount = ethers.parseUnits("50", 18);
    await stuckToken.mint(contractAddr, stuckAmount);
    expect(await stuckToken.balanceOf(contractAddr)).to.equal(stuckAmount);

    await expect(
      transferContract.rescueERC20(await stuckToken.getAddress(), other.address, stuckAmount)
    )
      .to.emit(transferContract, "TokensRescued")
      .withArgs(await stuckToken.getAddress(), other.address, stuckAmount);

    expect(await stuckToken.balanceOf(other.address)).to.equal(stuckAmount);
    expect(await stuckToken.balanceOf(contractAddr)).to.equal(0n);
  });

  it("rescueERC20 cannot recover configured USDC by explicit no-owner-drain policy", async function () {
    const { transferContract, usdc, other } = await deployFixture();
    const contractAddr = await transferContract.getAddress();

    // Simulate USDC accidentally direct-transferred to the contract
    await usdc.mint(contractAddr, 500n);
    expect(await usdc.balanceOf(contractAddr)).to.equal(500n);

    await expect(
      transferContract.rescueERC20(await usdc.getAddress(), other.address, 500n)
    )
      .to.be.revertedWithCustomError(transferContract, "CannotRescueTransferToken")
      .withArgs(await usdc.getAddress());

    expect(await usdc.balanceOf(other.address)).to.equal(0n);
    expect(await usdc.balanceOf(contractAddr)).to.equal(500n);
  });

  it("non-owner cannot call rescueERC20", async function () {
    const { transferContract, sender, other } = await deployFixture();

    await expect(
      transferContract.connect(sender).rescueERC20(other.address, other.address, 100n)
    )
      .to.be.revertedWithCustomError(transferContract, "OwnableUnauthorizedAccount")
      .withArgs(sender.address);
  });

  // ---- Direct routing: contract holds zero USDC after transfer ----

  it("contract holds zero USDC balance after a successful transfer", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture({ feeBps: 100 });

    const amount = ethers.parseUnits("100", 6);
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await transferContract.connect(sender).transferWithFee(recipient.address, amount);

    expect(await usdc.balanceOf(await transferContract.getAddress())).to.equal(0n);
  });

  it("contract holds zero USDC balance after a zero-fee transfer", async function () {
    const { transferContract, usdc, sender, recipient } = await deployFixture({ feeBps: 0 });

    const amount = ethers.parseUnits("50", 6);
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps: 0 });

    await transferContract.connect(sender).transferWithFee(recipient.address, amount);

    expect(await usdc.balanceOf(await transferContract.getAddress())).to.equal(0n);
  });

  // ---- previewTransfer view helper ----

  it("previewTransfer returns correct fee, totalDebit, balance, allowance, and canTransfer", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture({ feeBps: 100 });

    const amount = ethers.parseUnits("100", 6);
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    const result = await transferContract.previewTransfer(sender.address, amount);

    expect(result.fee).to.equal((amount * 100n) / 10000n);
    expect(result.totalDebit).to.equal(amount + result.fee);
    expect(result.balance).to.equal(result.totalDebit);
    expect(result.allowance).to.equal(result.totalDebit);
    expect(result.canTransfer).to.equal(true);
  });

  it("previewTransfer returns canTransfer false when balance is insufficient", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture({ feeBps: 100 });

    const amount = ethers.parseUnits("100", 6);
    // Fund and approve only half
    const fee = (amount * 100n) / 10000n;
    await usdc.mint(sender.address, amount / 2n);
    await usdc.connect(sender).approve(await transferContract.getAddress(), amount + fee);

    const result = await transferContract.previewTransfer(sender.address, amount);

    expect(result.canTransfer).to.equal(false);
  });

  it("previewTransfer returns canTransfer false when allowance is insufficient", async function () {
    const { transferContract, usdc, sender, feeBps } = await deployFixture({ feeBps: 100 });

    const amount = ethers.parseUnits("100", 6);
    const fee = (amount * 100n) / 10000n;
    await usdc.mint(sender.address, amount + fee);
    // Approve less than totalDebit
    await usdc.connect(sender).approve(await transferContract.getAddress(), amount);

    const result = await transferContract.previewTransfer(sender.address, amount);

    expect(result.canTransfer).to.equal(false);
  });

  it("previewTransfer returns canTransfer false for zero address sender", async function () {
    const { transferContract } = await deployFixture();

    const result = await transferContract.previewTransfer(ethers.ZeroAddress, 1000000n);

    expect(result.canTransfer).to.equal(false);
    expect(result.balance).to.equal(0n);
    expect(result.allowance).to.equal(0n);
  });

  it("previewTransfer returns canTransfer false when amount is below minimum", async function () {
    const minTransfer = ethers.parseUnits("1", 6);
    const { transferContract, usdc, sender, feeBps } = await deployFixture({
      minTransfer,
      precision: minTransfer,
      feeBps: 100,
    });

    const amount = minTransfer - 1n;
    const fee = (amount * 100n) / 10000n;
    await usdc.mint(sender.address, amount + fee);
    await usdc.connect(sender).approve(await transferContract.getAddress(), amount + fee);

    const result = await transferContract.previewTransfer(sender.address, amount);

    expect(result.canTransfer).to.equal(false);
  });

  it("pause blocks transferWithFee but owner config updates remain available", async function () {
    const { transferContract, usdc, sender, recipient, feeBps } = await deployFixture();

    const amount = 100n;
    await fundAndApprove({ usdc, transferContract, sender, amount, feeBps });

    await transferContract.pause();

    await expect(transferContract.setFeeBasisPoints(50)).to.emit(transferContract, "FeeUpdated");
    await expect(transferContract.setMinTransferAmount(2)).to.emit(transferContract, "MinTransferUpdated");
    await expect(transferContract.setTransferPrecision(2)).to.emit(transferContract, "PrecisionUpdated");

    await expect(
      transferContract.connect(sender).transferWithFee(recipient.address, amount)
    ).to.be.revertedWithCustomError(transferContract, "EnforcedPause");
  });
});
