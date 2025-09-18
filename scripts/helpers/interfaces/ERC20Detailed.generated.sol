// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ERC20Detailed {
    function decimals() external view returns (uint8);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}
