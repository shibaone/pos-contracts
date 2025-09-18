// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface DelegateProxy {
    function implementation() external view returns (address);
    function proxyType() external pure returns (uint256 proxyTypeId);
}
