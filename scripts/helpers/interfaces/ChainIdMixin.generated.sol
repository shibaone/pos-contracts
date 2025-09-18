// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ChainIdMixin {
    function CHAINID() external view returns (uint256);
    function networkId() external view returns (bytes memory);
}
