// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Receive {
    event SafeReceived(address indexed sender, uint256 value);

    fallback() external payable;
}
