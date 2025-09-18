// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IPredicate {
    function interpretStateUpdate(bytes memory state) external view returns (bytes memory);
    function onFinalizeExit(bytes memory data) external;
    function verifyDeprecation(bytes memory exit, bytes memory inputUtxo, bytes memory challengeData)
        external
        returns (bool);
}
