// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IWithdrawManager {
    function addExitToQueue(
        address exitor,
        address childToken,
        address rootToken,
        uint256 exitAmountOrTokenId,
        bytes32 txHash,
        bool isRegularExit,
        uint256 priority
    ) external;
    function addInput(uint256 exitId, uint256 age, address utxoOwner, address token) external;
    function challengeExit(uint256 exitId, uint256 inputId, bytes memory challengeData, address adjudicatorPredicate)
        external;
    function createExitQueue(address token) external;
    function verifyInclusion(bytes memory data, uint8 offset, bool verifyTxInclusion)
        external
        view
        returns (uint256 age);
}
