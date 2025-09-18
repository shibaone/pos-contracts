// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface DepositManagerProxy {
    event MaxErc20DepositUpdate(uint256 indexed oldLimit, uint256 indexed newLimit);
    event NewDepositBlock(address indexed owner, address indexed token, uint256 amountOrNFTId, uint256 depositBlockId);
    event OwnerUpdate(address _prevOwner, address _newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProxyUpdated(address indexed _new, address indexed _old);

    fallback() external payable;

    function childChain() external view returns (address);
    function deposits(uint256) external view returns (bytes32 depositHash, uint256 createdAt);
    function governance() external view returns (address);
    function implementation() external view returns (address);
    function isOwner() external view returns (bool);
    function lock() external;
    function locked() external view returns (bool);
    function maxErc20Deposit() external view returns (uint256);
    function owner() external view returns (address);
    function proxyType() external pure returns (uint256 proxyTypeId);
    function registry() external view returns (address);
    function renounceOwnership() external;
    function rootChain() external view returns (address);
    function stateSender() external view returns (address);
    function transferOwnership(address newOwner) external;
    function unlock() external;
    function updateImplementation(address _newProxyTo) external;
}
