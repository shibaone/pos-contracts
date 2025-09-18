// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface stdStorageSafe {
    event SlotFound(address who, bytes4 fsig, bytes32 keysHash, uint256 slot);
    event WARNING_UninitedSlot(address who, uint256 slot);
}
