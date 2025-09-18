// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ERC721PredicateBurnOnly {
    function CHAINID() external view returns (uint256);
    function interpretStateUpdate(bytes memory state) external view returns (bytes memory b);
    function networkId() external view returns (bytes memory);
    function onFinalizeExit(bytes memory data) external;
    function startExitWithBurntTokens(bytes memory data) external returns (bytes memory);
    function verifyDeprecation(bytes memory exit, bytes memory inputUtxo, bytes memory challengeData)
        external
        returns (bool);
}
