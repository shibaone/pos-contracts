// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IValidatorRegistry {
    function toggleWhitelisting(bool _validatorWhitelistingEnable) external;
    function updateValidatorsPermission(address _validator, bool _isWhitelisted) external;
    function validatorWhitelistingEnable() external view returns (bool);
    function validators(address _validator) external view returns (bool);
}
