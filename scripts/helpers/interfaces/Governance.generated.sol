// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Governance {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
    function update(address target, bytes memory data) external;
}
