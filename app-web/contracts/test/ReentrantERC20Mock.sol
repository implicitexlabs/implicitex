// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IImplicitExTransfer {
    function transferWithFee(address recipient, uint256 amount) external;
}

contract ReentrantERC20Mock {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public reentryEnabled;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    address public reentryTarget;
    address public reentryRecipient;
    uint256 public reentryAmount;

    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals) {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
    }

    function configureReentry(address target, address recipient, uint256 amount) external {
        reentryTarget = target;
        reentryRecipient = recipient;
        reentryAmount = amount;
    }

    function setReentryEnabled(bool enabled) external {
        reentryEnabled = enabled;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MOCK_INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        require(balanceOf[sender] >= amount, "MOCK_INSUFFICIENT_BALANCE");
        uint256 allowed = allowance[sender][msg.sender];
        require(allowed >= amount, "MOCK_INSUFFICIENT_ALLOWANCE");

        allowance[sender][msg.sender] = allowed - amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;

        if (reentryEnabled && reentryTarget != address(0)) {
            reentryAttempted = true;
            try IImplicitExTransfer(reentryTarget).transferWithFee(reentryRecipient, reentryAmount) {
                reentrySucceeded = true;
            } catch {
                reentrySucceeded = false;
            }
            reentryEnabled = false;
        }

        return true;
    }
}
