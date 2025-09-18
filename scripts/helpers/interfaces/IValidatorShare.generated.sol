// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IValidatorShare {
    function drain(address token, address payable destination, uint256 amount) external;
    function getLiquidRewards(address user) external view returns (uint256);
    function lock() external;
    function migrateIn(address user, uint256 amount) external;
    function migrateOut(address user, uint256 amount) external;
    function owner() external view returns (address);
    function restake() external returns (uint256, uint256);
    function slash(uint256 valPow, uint256 delegatedAmount, uint256 totalAmountToSlash) external returns (uint256);
    function unlock() external;
    function unstakeClaimTokens() external;
    function updateDelegation(bool delegation) external;
    function withdrawRewards() external;
}
