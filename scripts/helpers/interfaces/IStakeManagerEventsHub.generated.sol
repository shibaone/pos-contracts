// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IStakeManagerEventsHub {
    function validators(uint256)
        external
        view
        returns (
            uint256 amount,
            uint256 reward,
            uint256 activationEpoch,
            uint256 deactivationEpoch,
            uint256 jailTime,
            address signer,
            address contractAddress
        );
}
