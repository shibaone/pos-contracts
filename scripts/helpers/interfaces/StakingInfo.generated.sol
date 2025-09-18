// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface StakingInfo {
    event ClaimFee(address indexed user, uint256 indexed fee);
    event ClaimRewards(uint256 indexed validatorId, uint256 indexed amount, uint256 indexed totalAmount);
    event ConfirmAuction(uint256 indexed newValidatorId, uint256 indexed oldValidatorId, uint256 indexed amount);
    event DelegatorClaimedRewards(uint256 indexed validatorId, address indexed user, uint256 indexed rewards);
    event DelegatorRestaked(uint256 indexed validatorId, address indexed user, uint256 indexed totalStaked);
    event DelegatorUnstaked(uint256 indexed validatorId, address indexed user, uint256 amount);
    event DynastyValueChange(uint256 newDynasty, uint256 oldDynasty);
    event Jailed(uint256 indexed validatorId, uint256 indexed exitEpoch, address indexed signer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProposerBonusChange(uint256 newProposerBonus, uint256 oldProposerBonus);
    event Restaked(uint256 indexed validatorId, uint256 amount, uint256 total);
    event RewardUpdate(uint256 newReward, uint256 oldReward);
    event ShareBurned(uint256 indexed validatorId, address indexed user, uint256 indexed amount, uint256 tokens);
    event ShareMinted(uint256 indexed validatorId, address indexed user, uint256 indexed amount, uint256 tokens);
    event SignerChange(
        uint256 indexed validatorId,
        uint256 nonce,
        address indexed oldSigner,
        address indexed newSigner,
        bytes signerPubkey
    );
    event Slashed(uint256 indexed nonce, uint256 indexed amount);
    event StakeUpdate(uint256 indexed validatorId, uint256 indexed nonce, uint256 indexed newAmount);
    event Staked(
        address indexed signer,
        uint256 indexed validatorId,
        uint256 nonce,
        uint256 indexed activationEpoch,
        uint256 amount,
        uint256 total,
        bytes signerPubkey
    );
    event StartAuction(uint256 indexed validatorId, uint256 indexed amount, uint256 indexed auctionAmount);
    event ThresholdChange(uint256 newThreshold, uint256 oldThreshold);
    event TopUpFee(address indexed user, uint256 indexed fee);
    event UnJailed(uint256 indexed validatorId, address indexed signer);
    event UnstakeInit(
        address indexed user,
        uint256 indexed validatorId,
        uint256 nonce,
        uint256 deactivationEpoch,
        uint256 indexed amount
    );
    event Unstaked(address indexed user, uint256 indexed validatorId, uint256 amount, uint256 total);
    event UpdateCommissionRate(
        uint256 indexed validatorId, uint256 indexed newCommissionRate, uint256 indexed oldCommissionRate
    );

    function getAccountStateRoot() external view returns (bytes32 accountStateRoot);
    function getStakerDetails(uint256 validatorId)
        external
        view
        returns (
            uint256 amount,
            uint256 reward,
            uint256 activationEpoch,
            uint256 deactivationEpoch,
            address signer,
            uint256 _status
        );
    function getValidatorContractAddress(uint256 validatorId) external view returns (address ValidatorContract);
    function isOwner() external view returns (bool);
    function logClaimFee(address user, uint256 fee) external;
    function logClaimRewards(uint256 validatorId, uint256 amount, uint256 totalAmount) external;
    function logConfirmAuction(uint256 newValidatorId, uint256 oldValidatorId, uint256 amount) external;
    function logDelegatorClaimRewards(uint256 validatorId, address user, uint256 rewards) external;
    function logDelegatorRestaked(uint256 validatorId, address user, uint256 totalStaked) external;
    function logDelegatorUnstaked(uint256 validatorId, address user, uint256 amount) external;
    function logDynastyValueChange(uint256 newDynasty, uint256 oldDynasty) external;
    function logJailed(uint256 validatorId, uint256 exitEpoch, address signer) external;
    function logProposerBonusChange(uint256 newProposerBonus, uint256 oldProposerBonus) external;
    function logRestaked(uint256 validatorId, uint256 amount, uint256 total) external;
    function logRewardUpdate(uint256 newReward, uint256 oldReward) external;
    function logShareBurned(uint256 validatorId, address user, uint256 amount, uint256 tokens) external;
    function logShareMinted(uint256 validatorId, address user, uint256 amount, uint256 tokens) external;
    function logSignerChange(uint256 validatorId, address oldSigner, address newSigner, bytes memory signerPubkey)
        external;
    function logSlashed(uint256 nonce, uint256 amount) external;
    function logStakeUpdate(uint256 validatorId) external;
    function logStaked(
        address signer,
        bytes memory signerPubkey,
        uint256 validatorId,
        uint256 activationEpoch,
        uint256 amount,
        uint256 total
    ) external;
    function logStartAuction(uint256 validatorId, uint256 amount, uint256 auctionAmount) external;
    function logThresholdChange(uint256 newThreshold, uint256 oldThreshold) external;
    function logTopUpFee(address user, uint256 fee) external;
    function logUnjailed(uint256 validatorId, address signer) external;
    function logUnstakeInit(address user, uint256 validatorId, uint256 deactivationEpoch, uint256 amount) external;
    function logUnstaked(address user, uint256 validatorId, uint256 amount, uint256 total) external;
    function logUpdateCommissionRate(uint256 validatorId, uint256 newCommissionRate, uint256 oldCommissionRate)
        external;
    function owner() external view returns (address);
    function registry() external view returns (address);
    function renounceOwnership() external;
    function totalValidatorStake(uint256 validatorId) external view returns (uint256 validatorStake);
    function transferOwnership(address newOwner) external;
    function updateNonce(uint256[] memory validatorIds, uint256[] memory nonces) external;
    function validatorNonce(uint256) external view returns (uint256);
}
