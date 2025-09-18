// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IErcPredicate {
    function CHAINID() external view returns (uint256);
    function interpretStateUpdate(bytes memory state) external view returns (bytes memory);
    function networkId() external view returns (bytes memory);
    function onFinalizeExit(bytes memory data) external;
    function verifyDeprecation(bytes memory exit, bytes memory inputUtxo, bytes memory challengeData)
        external
        returns (bool);
}
