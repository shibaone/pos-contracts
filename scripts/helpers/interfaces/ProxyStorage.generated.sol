// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ProxyStorage {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
}
