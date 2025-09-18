// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IParentToken {
    function beforeTransfer(address sender, address to, uint256 value) external returns (bool);
}
