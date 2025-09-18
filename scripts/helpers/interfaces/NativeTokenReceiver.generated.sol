// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface NativeTokenReceiver {
    event SafeReceived(address indexed sender, uint256 value);

    fallback() external payable;

    function SINGLETON_SLOT() external view returns (bytes32);
}
