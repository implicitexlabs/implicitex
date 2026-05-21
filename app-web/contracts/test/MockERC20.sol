// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public failTransfer;
    bool public failTransferFrom;
    uint256 public failTransferOnCall;
    uint256 public transferCallCount;
    uint256 public failTransferFromOnCall;
    uint256 public transferFromCallCount;

    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals) {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
    }

    function setFailTransfer(bool shouldFail) external {
        failTransfer = shouldFail;
    }

    function setFailTransferFrom(bool shouldFail) external {
        failTransferFrom = shouldFail;
    }

    function setFailTransferOnCall(uint256 callNumber) external {
        failTransferOnCall = callNumber;
    }

    function setFailTransferFromOnCall(uint256 callNumber) external {
        failTransferFromOnCall = callNumber;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        transferCallCount += 1;

        if (failTransferOnCall != 0 && transferCallCount == failTransferOnCall) {
            return false;
        }

        if (failTransfer) {
            return false;
        }

        require(balanceOf[msg.sender] >= amount, "MOCK_INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        if (failTransferFrom) {
            return false;
        }

        transferFromCallCount += 1;
        if (failTransferFromOnCall != 0 && transferFromCallCount == failTransferFromOnCall) {
            return false;
        }

        require(balanceOf[sender] >= amount, "MOCK_INSUFFICIENT_BALANCE");
        uint256 allowed = allowance[sender][msg.sender];
        require(allowed >= amount, "MOCK_INSUFFICIENT_ALLOWANCE");

        allowance[sender][msg.sender] = allowed - amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        return true;
    }
}
