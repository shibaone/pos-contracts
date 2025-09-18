// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ContractWitRevertingFallback {
    fallback() external payable;

    function deposit(address depositManager, address token, uint256 amount) external;
    function startExitWithDepositedTokens(
        address payable withdrawManager,
        uint256 depositId,
        address token,
        uint256 amountOrToken
    ) external payable;
}
