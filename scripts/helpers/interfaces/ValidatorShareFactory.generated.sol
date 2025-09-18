// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ValidatorShareFactory {
    function create(uint256 validatorId, address loggerAddress, address registry) external returns (address);
}
