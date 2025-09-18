// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface MarketplaceToken {
    function transferWithSig(bytes memory sig, uint256 tokenIdOrAmount, bytes32 data, uint256 expiration, address to)
        external
        returns (address);
}
