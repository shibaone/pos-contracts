// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IStakeManagerLocal {
    type Status is uint8;

    function accountStateRoot() external view returns (bytes32);
    function activeAmount() external view returns (uint256);
    function currentValidatorSetTotalStake() external view returns (uint256);
    function isValidator(uint256 validatorId) external view returns (bool);
    function signerToValidator(address validatorAddress) external view returns (uint256);
    function validatorRewards() external view returns (uint256);
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
            Status status
        );
}
