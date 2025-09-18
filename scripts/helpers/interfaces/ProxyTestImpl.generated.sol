// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ProxyTestImpl {
    function a() external view returns (uint256);
    function b() external view returns (uint256);
    function ctorInit() external view returns (uint256);
    function init() external;
}
