// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Proxy {
    event OwnerUpdate(address _prevOwner, address _newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProxyUpdated(address indexed _new, address indexed _old);

    fallback() external payable;

    function implementation() external view returns (address);
    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function proxyType() external pure returns (uint256 proxyTypeId);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
    function updateImplementation(address _newProxyTo) external;
}
