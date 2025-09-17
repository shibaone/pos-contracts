pragma solidity 0.5.17;

// note this contract interface is only for stakeManager use
contract IValidatorShare {
    function withdrawRewards() public;

    function unstakeClaimTokens() public;

    function getLiquidRewards(address user) public view returns (uint256);
    
    function owner() public view returns (address);

    function restake() public returns(uint256, uint256);

    function unlock() external;

    function lock() external;

    function drain(
        address token,
        address payable destination,
        uint256 amount
    ) external;

    function slash(uint256 valPow, uint256 delegatedAmount, uint256 totalAmountToSlash) external returns (uint256);

    function updateDelegation(bool delegation) external;

    function migrateOut(address user, uint256 amount) external;

    function migrateIn(address user, uint256 amount) external;

    /*
     * New admin functions (added per emergency remediation plan)
     *
     * - updateImplementation: called by StakeManager (owner) to instruct the
     *   ValidatorShare to switch to a new implementation contract. ValidatorShare
     *   implementation should protect this with onlyOwner.
     *
     * - adminConsumeLegacyUnbond: admin method to wipe legacy unbond(s) for a
     *   given user and reconcile withdrawPool/withdrawShares/activeAmount and
     *   optionally call back to StakeManager to decrease delegated amount.
     *   This must be owner-only in the ValidatorShare implementation.
     */
    function updateImplementation(address newImplementation) external;

    function adminConsumeLegacyUnbond(address user) external;
}