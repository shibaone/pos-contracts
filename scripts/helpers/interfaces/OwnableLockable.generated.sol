// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface OwnableLockable {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function isOwner() external view returns (bool);
    function lock() external;
    function locked() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
    function unlock() external;
}
