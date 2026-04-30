// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FeeOnTransferERC20Mock {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public feeBps;

    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals, uint256 transferFeeBps) {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        feeBps = transferFeeBps;
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
        uint256 fee = (amount * feeBps) / 10000;
        uint256 received = amount - fee;

        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += received;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        require(balanceOf[sender] >= amount, "MOCK_INSUFFICIENT_BALANCE");
        uint256 allowed = allowance[sender][msg.sender];
        require(allowed >= amount, "MOCK_INSUFFICIENT_ALLOWANCE");

        uint256 fee = (amount * feeBps) / 10000;
        uint256 received = amount - fee;

        allowance[sender][msg.sender] = allowed - amount;
        balanceOf[sender] -= amount;
        balanceOf[recipient] += received;
        return true;
    }
}
