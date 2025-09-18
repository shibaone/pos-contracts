// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ValidatorShareTest {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Transfer(address indexed from, address indexed to, uint256 value);

    function activeAmount() external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function amountStaked(address user) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function buyVoucher(uint256 _amount, uint256 _minSharesToMint) external returns (uint256 amountToDeposit);
    function commissionRate_deprecated() external view returns (uint256);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function delegation() external view returns (bool);
    function drain(address token, address payable destination, uint256 amount) external;
    function eventsHub() external view returns (address);
    function exchangeRate() external view returns (uint256);
    function getLiquidRewards(address user) external view returns (uint256);
    function getRewardPerShare() external view returns (uint256);
    function getTotalStake(address user) external view returns (uint256, uint256);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function initalRewardPerShare(address) external view returns (uint256);
    function initialize(uint256 _validatorId, address _stakingLogger, address _stakeManager) external;
    function isOwner() external view returns (bool);
    function lastCommissionUpdate_deprecated() external view returns (uint256);
    function lock() external;
    function locked() external view returns (bool);
    function migrateIn(address user, uint256 amount) external;
    function migrateOut(address user, uint256 amount) external;
    function minAmount() external view returns (uint256);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function restake() external returns (uint256, uint256);
    function rewardPerShare() external view returns (uint256);
    function sellVoucher(uint256 claimAmount, uint256 maximumSharesToBurn) external;
    function sellVoucher_new(uint256 claimAmount, uint256 maximumSharesToBurn) external;
    function slash(uint256 validatorStake, uint256 delegatedAmount, uint256 totalAmountToSlash)
        external
        returns (uint256);
    function stakeManager() external view returns (address);
    function stakingLogger() external view returns (address);
    function totalStake_deprecated() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transferOwnership(address newOwner) external;
    function unbondNonces(address) external view returns (uint256);
    function unbonds(address) external view returns (uint256 shares, uint256 withdrawEpoch);
    function unbonds_new(address, uint256) external view returns (uint256 shares, uint256 withdrawEpoch);
    function unlock() external;
    function unstakeClaimTokens() external;
    function unstakeClaimTokens_new(uint256 unbondNonce) external;
    function updateDelegation(bool _delegation) external;
    function validatorId() external view returns (uint256);
    function validatorRewards_deprecated() external view returns (uint256);
    function withdrawExchangeRate() external view returns (uint256);
    function withdrawPool() external view returns (uint256);
    function withdrawRewards() external;
    function withdrawShares() external view returns (uint256);
}
