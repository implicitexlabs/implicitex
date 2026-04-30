// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract ImplicitExTransfer {
    IERC20 public immutable usdc;
    address public owner;
    address public treasury;

    uint16 public feeBasisPoints;
    uint16 public constant MAX_FEE_BPS = 1000; // 10.00%
    uint256 public minTransferAmount;
    uint256 public transferPrecision;

    bool public paused;
    bool private entered;

    event TransferExecuted(
        address indexed sender,
        address indexed recipient,
        uint256 amountSent,
        uint256 feeAmount,
        uint256 totalDebited
    );
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event FeeUpdated(uint16 previousFeeBps, uint16 newFeeBps);
    event MinTransferUpdated(uint256 previousMinTransfer, uint256 newMinTransfer);
    event PrecisionUpdated(uint256 previousPrecision, uint256 newPrecision);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    modifier onlyOwner() {
        require(msg.sender == owner, "OWNER_ONLY");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier nonReentrant() {
        require(!entered, "REENTRANCY");
        entered = true;
        _;
        entered = false;
    }

    constructor(
        address usdcAddress,
        address treasuryAddress,
        uint16 initialFeeBps,
        uint256 initialMinTransfer,
        uint256 initialPrecision
    ) {
        require(usdcAddress != address(0), "USDC_ZERO_ADDRESS");
        require(treasuryAddress != address(0), "TREASURY_ZERO_ADDRESS");
        require(initialFeeBps <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        require(initialPrecision > 0, "PRECISION_ZERO");

        usdc = IERC20(usdcAddress);
        owner = msg.sender;
        treasury = treasuryAddress;
        feeBasisPoints = initialFeeBps;
        minTransferAmount = initialMinTransfer;
        transferPrecision = initialPrecision;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferWithFee(address recipient, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        require(recipient != address(0), "RECIPIENT_ZERO_ADDRESS");
        require(amount >= minTransferAmount, "AMOUNT_BELOW_MINIMUM");
        require(amount % transferPrecision == 0, "INVALID_TRANSFER_PRECISION");

        uint256 fee = (amount * feeBasisPoints) / 10000;
        uint256 totalDebit = amount + fee;

        require(usdc.transferFrom(msg.sender, address(this), totalDebit), "TRANSFER_FROM_FAILED");
        require(usdc.transfer(recipient, amount), "RECIPIENT_TRANSFER_FAILED");
        if (fee > 0) {
            require(usdc.transfer(treasury, fee), "FEE_TRANSFER_FAILED");
        }

        emit TransferExecuted(msg.sender, recipient, amount, fee, totalDebit);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "TREASURY_ZERO_ADDRESS");
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    function setFeeBasisPoints(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        uint16 previous = feeBasisPoints;
        feeBasisPoints = newFeeBps;
        emit FeeUpdated(previous, newFeeBps);
    }

    function setMinTransferAmount(uint256 newMinTransfer) external onlyOwner {
        uint256 previous = minTransferAmount;
        minTransferAmount = newMinTransfer;
        emit MinTransferUpdated(previous, newMinTransfer);
    }

    function setTransferPrecision(uint256 newPrecision) external onlyOwner {
        require(newPrecision > 0, "PRECISION_ZERO");
        uint256 previous = transferPrecision;
        transferPrecision = newPrecision;
        emit PrecisionUpdated(previous, newPrecision);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OWNER_ZERO_ADDRESS");
        address previous = owner;
        owner = newOwner;
        emit OwnershipTransferred(previous, newOwner);
    }

    function pause() external onlyOwner {
        require(!paused, "ALREADY_PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        require(paused, "NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }
}
