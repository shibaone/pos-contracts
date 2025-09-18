// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface RootChainable {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RootChainChanged(address indexed previousRootChain, address indexed newRootChain);

    function changeRootChain(address newRootChain) external;
    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function rootChain() external view returns (address);
    function transferOwnership(address newOwner) external;
}
