pragma solidity 0.5.17;

import {Ownable} from "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract ValidatorRegistry is Ownable {
    mapping(address => bool) public validators;
    bool public validatorWhitelistingEnable;

    event WhitelistUpdated(address indexed validator, bool isWhitelisted);

    constructor() public {
        validatorWhitelistingEnable = true;
    }

    function updateValidatorsPermission(address _validator, bool _isWhitelisted) external onlyOwner {
        validators[_validator] = _isWhitelisted;
        emit WhitelistUpdated(_validator, _isWhitelisted);
    }

    function toggleWhitelisting(bool _validatorWhitelistingEnable) external onlyOwner {
        validatorWhitelistingEnable = _validatorWhitelistingEnable;
    }
}