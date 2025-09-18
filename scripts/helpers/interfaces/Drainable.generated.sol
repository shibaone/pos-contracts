// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Drainable {
    event MaxErc20DepositUpdate(uint256 indexed oldLimit, uint256 indexed newLimit);
    event NewDepositBlock(address indexed owner, address indexed token, uint256 amountOrNFTId, uint256 depositBlockId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function childChain() external view returns (address);
    function deposits(uint256) external view returns (bytes32 depositHash, uint256 createdAt);
    function drainErc20(address[] memory tokens, uint256[] memory values, address destination) external;
    function drainErc721(address[] memory tokens, uint256[] memory values, address destination) external;
    function drainEther(uint256 amount, address payable destination) external;
    function governance() external view returns (address);
    function isOwner() external view returns (bool);
    function lock() external;
    function locked() external view returns (bool);
    function maxErc20Deposit() external view returns (uint256);
    function owner() external view returns (address);
    function registry() external view returns (address);
    function renounceOwnership() external;
    function rootChain() external view returns (address);
    function stateSender() external view returns (address);
    function transferOwnership(address newOwner) external;
    function unlock() external;
}
