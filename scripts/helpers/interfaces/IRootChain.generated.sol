// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IRootChain {
    function currentHeaderBlock() external view returns (uint256);
    function getLastChildBlock() external view returns (uint256);
    function slash() external;
    function submitCheckpoint(bytes memory data, uint256[3][] memory sigs) external;
    function submitHeaderBlock(bytes memory data, bytes memory sigs) external;
}
