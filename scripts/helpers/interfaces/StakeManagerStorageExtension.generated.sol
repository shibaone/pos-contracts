// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface StakeManagerStorageExtension {
    function checkpointRewardDelta() external view returns (uint256);
    function eventsHub() external view returns (address);
    function extensionCode() external view returns (address);
    function maxRewardedCheckpoints() external view returns (uint256);
    function prevBlockInterval() external view returns (uint256);
    function rewardDecreasePerCheckpoint() external view returns (uint256);
    function rewardPerStake() external view returns (uint256);
    function signers(uint256) external view returns (address);
}
