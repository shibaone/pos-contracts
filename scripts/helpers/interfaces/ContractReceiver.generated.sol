// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ContractReceiver {
    function tokenFallback(address _from, uint256 _value, bytes memory _data) external;
}
