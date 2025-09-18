// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ValidatorRegistry {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WhitelistUpdated(address indexed validator, bool isWhitelisted);

    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function toggleWhitelisting(bool _validatorWhitelistingEnable) external;
    function transferOwnership(address newOwner) external;
    function updateValidatorsPermission(address _validator, bool _isWhitelisted) external;
    function validatorWhitelistingEnable() external view returns (bool);
    function validators(address) external view returns (bool);
}
