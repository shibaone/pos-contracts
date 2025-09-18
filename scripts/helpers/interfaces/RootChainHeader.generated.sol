// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface RootChainHeader {
    event NewHeaderBlock(
        address indexed proposer,
        uint256 indexed headerBlockId,
        uint256 indexed reward,
        uint256 start,
        uint256 end,
        bytes32 root
    );
    event ResetHeaderBlock(address indexed proposer, uint256 indexed headerBlockId);
}
