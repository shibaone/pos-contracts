// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes memory data)
        external
        returns (bytes4);
}
