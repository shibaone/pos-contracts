// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface WithdrawManagerHeader {
    event ExitCancelled(uint256 indexed exitId);
    event ExitPeriodUpdate(uint256 indexed oldExitPeriod, uint256 indexed newExitPeriod);
    event ExitStarted(
        address indexed exitor, uint256 indexed exitId, address indexed token, uint256 amount, bool isRegularExit
    );
    event ExitUpdated(uint256 indexed exitId, uint256 indexed age, address signer);
    event Withdraw(uint256 indexed exitId, address indexed user, address indexed token, uint256 amount);
}
