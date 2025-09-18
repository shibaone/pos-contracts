// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface PriorityQueue {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function currentSize() external view returns (uint256);
    function delMin() external returns (uint256, uint256);
    function getMin() external view returns (uint256, uint256);
    function insert(uint256 _priority, uint256 _value) external;
    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
}
