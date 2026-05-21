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
    uint16 public constant MAX_FEE_BPS = 100; // 1.00% — owner may lower but never raise above this
    uint256 public minTransferAmount;
    uint256 public transferPrecision;

    error UsdcZeroAddress();
    error TreasuryZeroAddress();
    error InvalidTreasury(address treasury);
    error RecipientZeroAddress();
    error InvalidRecipient(address recipient);
    error FeeTooHigh(uint16 attemptedFeeBps, uint16 maxFeeBps);
    error MinTransferZero();
    error PrecisionZero();
    error AmountBelowMinimum(uint256 amount, uint256 minimum);
    error InvalidTransferPrecision(uint256 amount, uint256 precision);
    error RescueTokenZeroAddress();
    error RescueToZeroAddress();
    error CannotRescueTransferToken(address token);

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
    event TokensRescued(address indexed token, address indexed to, uint256 amount);

    constructor(
        address usdcAddress,
        address treasuryAddress,
        uint16 initialFeeBps,
        uint256 initialMinTransfer,
        uint256 initialPrecision
    ) Ownable(msg.sender) {
        // Deployer becomes the initial owner. Production deployments should
        // transfer ownership to a Safe/multisig immediately after deployment.
        if (usdcAddress == address(0)) revert UsdcZeroAddress();
        if (treasuryAddress == address(0)) revert TreasuryZeroAddress();
        if (treasuryAddress == address(this) || treasuryAddress == usdcAddress) {
            revert InvalidTreasury(treasuryAddress);
        }
        if (initialFeeBps > MAX_FEE_BPS) revert FeeTooHigh(initialFeeBps, MAX_FEE_BPS);
        if (initialMinTransfer == 0) revert MinTransferZero();
        if (initialPrecision == 0) revert PrecisionZero();

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
        if (recipient == address(0)) revert RecipientZeroAddress();
        if (recipient == address(this) || recipient == address(usdc)) {
            revert InvalidRecipient(recipient);
        }
        if (amount < minTransferAmount) revert AmountBelowMinimum(amount, minTransferAmount);
        if (amount % transferPrecision != 0) {
            revert InvalidTransferPrecision(amount, transferPrecision);
        }

        // Floor fee math is intentional. The configured minimum transfer and
        // precision keep valid USDC transfers out of dust ranges.
        uint256 fee = (amount * feeBasisPoints) / 10000;
        uint256 totalDebit = amount + fee;

        // Route directly — funds never touch the contract balance.
        // SafeERC20 provides the balance/allowance failure surface on each leg.
        usdc.safeTransferFrom(msg.sender, recipient, amount);
        if (fee > 0) {
            usdc.safeTransferFrom(msg.sender, treasury, fee);
        }

        emit TransferExecuted(msg.sender, recipient, amount, fee, totalDebit);
    }

    /**
     * @notice Frontend helper: returns fee, total debit, sender balance,
     *         allowance, and transfer eligibility for a given amount.
     * @dev Pure view — no state changes. Returns canTransfer false for
     *      zero sender, zero amount, or when balance/allowance is insufficient.
     */
    function previewTransfer(
        address sender,
        uint256 amount
    ) external view returns (
        uint256 fee,
        uint256 totalDebit,
        uint256 balance,
        uint256 allowance,
        bool canTransfer
    ) {
        fee = (amount * feeBasisPoints) / 10000;
        totalDebit = amount + fee;

        if (sender == address(0) || amount == 0) {
            return (fee, totalDebit, 0, 0, false);
        }

        balance = usdc.balanceOf(sender);
        allowance = usdc.allowance(sender, address(this));
        canTransfer = amount >= minTransferAmount &&
                      amount % transferPrecision == 0 &&
                      balance >= totalDebit &&
                      allowance >= totalDebit;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert TreasuryZeroAddress();
        if (newTreasury == address(this) || newTreasury == address(usdc)) {
            revert InvalidTreasury(newTreasury);
        }
        address previous = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(previous, newTreasury);
    }

    function setFeeBasisPoints(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        uint16 previous = feeBasisPoints;
        feeBasisPoints = newFeeBps;
        emit FeeUpdated(previous, newFeeBps);
    }

    function setMinTransferAmount(uint256 newMinTransfer) external onlyOwner {
        if (newMinTransfer == 0) revert MinTransferZero();
        uint256 previous = minTransferAmount;
        minTransferAmount = newMinTransfer;
        emit MinTransferUpdated(previous, newMinTransfer);
    }

    function setTransferPrecision(uint256 newPrecision) external onlyOwner {
        if (newPrecision == 0) revert PrecisionZero();
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

    /**
     * @notice Recover ERC-20 tokens accidentally sent directly to this contract.
     * @dev The configured USDC transfer token cannot be rescued. Any USDC sent
     *      directly to this contract outside transferWithFee may be permanently
     *      unrecoverable; this is intentional to preserve the no-owner-drain
     *      property. Other ERC-20 tokens can be recovered by the owner.
     */
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) revert RescueTokenZeroAddress();
        if (token == address(usdc)) revert CannotRescueTransferToken(token);
        if (to == address(0)) revert RescueToZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }
}
