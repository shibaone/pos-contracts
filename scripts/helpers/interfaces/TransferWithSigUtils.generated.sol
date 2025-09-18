// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface TransferWithSigUtils {
    function getTokenTransferOrderHash(address token, address spender, uint256 amount, bytes32 data, uint256 expiration)
        external
        pure
        returns (bytes32 orderHash);
}
