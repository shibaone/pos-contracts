pragma solidity 0.5.17;

contract StakeManagerStorageExtension {
    uint256 public rewardPerStake;
    address public auctionImplementation;
    address[] public signers;

    uint256 constant CHK_REWARD_PRECISION = 100;
    uint256 public prevBlockInterval;
    // how much less reward per skipped checkpoint, 0 - 100%
    uint256 public rewardDecreasePerCheckpoint;
    // how many skipped checkpoints to reward
    uint256 public maxSkippedCheckpoints;
    // increase / decrease value for faster or slower checkpoints, 0 - 100%
    uint256 public checkpointRewardDelta;
}   