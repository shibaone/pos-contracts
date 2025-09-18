// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ISlashingManager {
    function VOTE_TYPE() external view returns (uint8);
    function heimdallId() external view returns (bytes32);
    function jailCheckpoints() external view returns (uint256);
    function logger() external view returns (address);
    function proposerRate() external view returns (uint256);
    function registry() external view returns (address);
    function reportRate() external view returns (uint256);
    function slashingNonce() external view returns (uint256);
}
