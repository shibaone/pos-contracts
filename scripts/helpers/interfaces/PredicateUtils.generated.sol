// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface PredicateUtils {
    function CHAINID() external view returns (uint256);
    function networkId() external view returns (bytes memory);
    function onFinalizeExit(bytes memory data) external;
}
