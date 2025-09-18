// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface DepositManagerHeader {
    event MaxErc20DepositUpdate(uint256 indexed oldLimit, uint256 indexed newLimit);
    event NewDepositBlock(address indexed owner, address indexed token, uint256 amountOrNFTId, uint256 depositBlockId);
}
