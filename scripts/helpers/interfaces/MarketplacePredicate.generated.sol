// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface MarketplacePredicate {
    function CHAINID() external view returns (uint256);
    function networkId() external view returns (bytes memory);
    function onFinalizeExit(bytes memory data) external;
    function registry() external view returns (address);
    function rootChain() external view returns (address);
    function startExit(bytes memory data, bytes memory exitTx) external payable;
    function verifyDeprecation(bytes memory exit, bytes memory inputUtxo, bytes memory challengeData)
        external
        view
        returns (bool);
}
