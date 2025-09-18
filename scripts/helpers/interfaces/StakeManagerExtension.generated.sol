// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

library StakeManagerStorage {
    type Status is uint8;
}

interface StakeManagerExtension {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RootChainChanged(address indexed previousRootChain, address indexed newRootChain);

    function CHECKPOINT_REWARD() external view returns (uint256);
    function NFTContract() external view returns (address);
    function NFTCounter() external view returns (uint256);
    function WITHDRAWAL_DELAY() external view returns (uint256);
    function accountStateRoot() external view returns (bytes32);
    function auctionPeriod() external view returns (uint256);
    function changeRootChain(address newRootChain) external;
    function checkPointBlockInterval() external view returns (uint256);
    function checkValidatorWhitelisting(address validator) external view returns (bool);
    function checkpointRewardDelta() external view returns (uint256);
    function confirmAuctionBid(uint256 validatorId, uint256 heimdallFee, address stakeManager) external;
    function currentEpoch() external view returns (uint256);
    function delegationEnabled() external view returns (bool);
    function dynasty() external view returns (uint256);
    function eventsHub() external view returns (address);
    function extensionCode() external view returns (address);
    function governance() external view returns (address);
    function isOwner() external view returns (bool);
    function latestSignerUpdateEpoch(uint256) external view returns (uint256);
    function lock() external;
    function locked() external view returns (bool);
    function logger() external view returns (address);
    function maxRewardedCheckpoints() external view returns (uint256);
    function migrateValidatorsData(uint256 validatorIdFrom, uint256 validatorIdTo) external;
    function minDeposit() external view returns (uint256);
    function minHeimdallFee() external view returns (uint256);
    function owner() external view returns (address);
    function prevBlockInterval() external view returns (uint256);
    function proposerBonus() external view returns (uint256);
    function registry() external view returns (address);
    function renounceOwnership() external;
    function replacementCoolDown() external view returns (uint256);
    function rewardDecreasePerCheckpoint() external view returns (uint256);
    function rewardPerStake() external view returns (uint256);
    function rootChain() external view returns (address);
    function signerToValidator(address) external view returns (uint256);
    function signerUpdateLimit() external view returns (uint256);
    function signers(uint256) external view returns (address);
    function startAuction(uint256 validatorId, uint256 amount, bool _acceptDelegation, bytes memory _signerPubkey)
        external;
    function token() external view returns (address);
    function totalHeimdallFee() external view returns (uint256);
    function totalRewards() external view returns (uint256);
    function totalRewardsLiquidated() external view returns (uint256);
    function totalStaked() external view returns (uint256);
    function transferOwnership(address newOwner) external;
    function unlock() external;
    function updateCheckpointRewardParams(
        uint256 _rewardDecreasePerCheckpoint,
        uint256 _maxRewardedCheckpoints,
        uint256 _checkpointRewardDelta
    ) external;
    function updateCommissionRate(uint256 validatorId, uint256 newCommissionRate) external;
    function updateValidatorRegistry(address _newContract) external;
    function userFeeExit(address) external view returns (uint256);
    function validatorAuction(uint256)
        external
        view
        returns (uint256 amount, uint256 startEpoch, address user, bool acceptDelegation, bytes memory signerPubkey);
    function validatorRegistry() external view returns (address);
    function validatorShareFactory() external view returns (address);
    function validatorState() external view returns (uint256 amount, uint256 stakerCount);
    function validatorStateChanges(uint256) external view returns (int256 amount, int256 stakerCount);
    function validatorThreshold() external view returns (uint256);
    function validators(uint256)
        external
        view
        returns (
            uint256 amount,
            uint256 reward,
            uint256 activationEpoch,
            uint256 deactivationEpoch,
            uint256 jailTime,
            address signer,
            address contractAddress,
            StakeManagerStorage.Status status,
            uint256 commissionRate,
            uint256 lastCommissionUpdate,
            uint256 delegatorsReward,
            uint256 delegatedAmount,
            uint256 initialRewardPerStake
        );
}
