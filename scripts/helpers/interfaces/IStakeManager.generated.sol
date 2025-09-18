// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IStakeManager {
    function checkSignatures(
        uint256 blockInterval,
        bytes32 voteHash,
        bytes32 stateRoot,
        address proposer,
        uint256[3][] memory sigs
    ) external returns (uint256);
    function confirmAuctionBid(uint256 validatorId, uint256 heimdallFee) external;
    function decreaseValidatorDelegatedAmount(uint256 validatorId, uint256 amount) external;
    function delegatedAmount(uint256 validatorId) external view returns (uint256);
    function delegationDeposit(uint256 validatorId, uint256 amount, address delegator) external returns (bool);
    function delegatorsReward(uint256 validatorId) external view returns (uint256);
    function dethroneAndStake(
        address auctionUser,
        uint256 heimdallFee,
        uint256 validatorId,
        uint256 auctionAmount,
        bool acceptDelegation,
        bytes memory signerPubkey
    ) external;
    function epoch() external view returns (uint256);
    function getRegistry() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function rescueBone(address tokenAddress, address recipient) external;
    function slash(bytes memory slashingInfoList) external returns (uint256);
    function stakeFor(
        address user,
        uint256 amount,
        uint256 heimdallFee,
        bool acceptDelegation,
        bytes memory signerPubkey
    ) external;
    function startAuction(uint256 validatorId, uint256 amount, bool acceptDelegation, bytes memory signerPubkey)
        external;
    function totalStakedFor(address addr) external view returns (uint256);
    function transferFunds(uint256 validatorId, uint256 amount, address delegator) external returns (bool);
    function unstake(uint256 validatorId) external;
    function updateValidatorState(uint256 validatorId, int256 amount) external;
    function validatorStake(uint256 validatorId) external view returns (uint256);
    function withdrawDelegatorsReward(uint256 validatorId) external returns (uint256);
    function withdrawalDelay() external view returns (uint256);
}
