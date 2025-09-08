pragma solidity 0.5.17;

interface IValidatorRegistry {
    function validators(address _validator) external view returns (bool);
    function validatorWhitelistingEnable() external view returns (bool);
    function updateValidatorsPermission(address _validator, bool _isWhitelisted) external;
    function toggleWhitelisting(bool _validatorWhitelistingEnable) external;
}
