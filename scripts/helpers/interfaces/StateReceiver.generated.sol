// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface StateReceiver {
    function onStateReceive(uint256 id, bytes memory data) external;
}
