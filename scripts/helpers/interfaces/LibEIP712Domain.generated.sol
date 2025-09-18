// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface LibEIP712Domain {
    function CHAINID() external view returns (uint256);
    function EIP712_DOMAIN_HASH() external view returns (bytes32);
    function EIP712_DOMAIN_SCHEMA_HASH() external view returns (bytes32);
    function networkId() external view returns (bytes memory);
}
