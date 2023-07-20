pragma solidity 0.5.17;

import {Ownable} from "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract ValidatorRegistry is Ownable {
    mapping(address => bool) public validators;
    bool public validationEnabled;

    event ValidatorUpdated(address indexed validator, bool isWhitelisted);

    constructor() public {
        validationEnabled = true;
    }

    function updateValidatorsPermission(address _validator, bool _isWhitelisted) external onlyOwner {
        validators[_validator] = _isWhitelisted;
        emit ValidatorUpdated(_validator, _isWhitelisted);
    }

    function toggleValidation(bool _validationEnabled) external onlyOwner {
        validationEnabled = _validationEnabled;
    }
}