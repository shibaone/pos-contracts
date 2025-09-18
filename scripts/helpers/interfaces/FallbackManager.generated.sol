// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface FallbackManager {
    fallback() external payable;

    function setFallbackHandler(address handler) external;
}
