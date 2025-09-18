// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ERCProxy {
    function implementation() external view returns (address codeAddr);
    function proxyType() external pure returns (uint256 proxyTypeId);
}
