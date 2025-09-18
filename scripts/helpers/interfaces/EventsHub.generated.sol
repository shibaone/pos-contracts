// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface EventsHub {
    event DelegatorUnstakeWithId(uint256 indexed validatorId, address indexed user, uint256 amount, uint256 nonce);
    event RewardParams(
        uint256 rewardDecreasePerCheckpoint, uint256 maxRewardedCheckpoints, uint256 checkpointRewardDelta
    );
    event ShareBurnedWithId(
        uint256 indexed validatorId, address indexed user, uint256 indexed amount, uint256 tokens, uint256 nonce
    );
    event SharesTransfer(uint256 indexed validatorId, address indexed from, address indexed to, uint256 value);
    event UpdateCommissionRate(
        uint256 indexed validatorId, uint256 indexed newCommissionRate, uint256 indexed oldCommissionRate
    );

    function initialize(address _registry) external;
    function logDelegatorUnstakedWithId(uint256 validatorId, address user, uint256 amount, uint256 nonce) external;
    function logRewardParams(
        uint256 rewardDecreasePerCheckpoint,
        uint256 maxRewardedCheckpoints,
        uint256 checkpointRewardDelta
    ) external;
    function logShareBurnedWithId(uint256 validatorId, address user, uint256 amount, uint256 tokens, uint256 nonce)
        external;
    function logSharesTransfer(uint256 validatorId, address from, address to, uint256 value) external;
    function logUpdateCommissionRate(uint256 validatorId, uint256 newCommissionRate, uint256 oldCommissionRate)
        external;
    function registry() external view returns (address);
}
