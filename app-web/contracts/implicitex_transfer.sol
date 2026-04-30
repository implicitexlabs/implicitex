// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ImplicitExTransfer is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public treasury;

    uint16 public feeBasisPoints;
    uint16 public constant MAX_FEE_BPS = 1000; // 10.00%
    uint256 public minTransferAmount;
    uint256 public transferPrecision;

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

    constructor(
        address usdcAddress,
        address treasuryAddress,
        uint16 initialFeeBps,
        uint256 initialMinTransfer,
        uint256 initialPrecision
    ) Ownable(msg.sender) {
        require(usdcAddress != address(0), "USDC_ZERO_ADDRESS");
        require(treasuryAddress != address(0), "TREASURY_ZERO_ADDRESS");
        require(initialFeeBps <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        require(initialPrecision > 0, "PRECISION_ZERO");

        usdc = IERC20(usdcAddress);
        treasury = treasuryAddress;
        feeBasisPoints = initialFeeBps;
        minTransferAmount = initialMinTransfer;
        transferPrecision = initialPrecision;
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

        usdc.safeTransferFrom(msg.sender, address(this), totalDebit);
        usdc.safeTransfer(recipient, amount);
        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
