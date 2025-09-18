// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface StateSyncerVerifier {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event StateSyncerAddressChanged(address indexed previousAddress, address indexed newAddress);

    function changeStateSyncerAddress(address newAddress) external;
    function isOnlyStateSyncerContract() external view returns (bool);
    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function stateSyncer() external view returns (address);
    function transferOwnership(address newOwner) external;
}
