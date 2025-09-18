// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ERC721Holder {
    function onERC721Received(address, address, uint256, bytes memory) external returns (bytes4);
}
