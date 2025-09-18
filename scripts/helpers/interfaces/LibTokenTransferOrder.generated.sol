// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface LibTokenTransferOrder {
    function CHAINID() external view returns (uint256);
    function EIP712_DOMAIN_HASH() external view returns (bytes32);
    function EIP712_DOMAIN_SCHEMA_HASH() external view returns (bytes32);
    function EIP712_TOKEN_TRANSFER_ORDER_SCHEMA_HASH() external view returns (bytes32);
    function getTokenTransferOrderHash(address spender, uint256 tokenIdOrAmount, bytes32 data, uint256 expiration)
        external
        view
        returns (bytes32 orderHash);
    function networkId() external view returns (bytes memory);
}
