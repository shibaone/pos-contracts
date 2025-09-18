// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface DepositManager {
    event MaxErc20DepositUpdate(uint256 indexed oldLimit, uint256 indexed newLimit);
    event NewDepositBlock(address indexed owner, address indexed token, uint256 amountOrNFTId, uint256 depositBlockId);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    fallback() external payable;

    function childChain() external view returns (address);
    function depositBulk(address[] memory _tokens, uint256[] memory _amountOrTokens, address _user) external;
    function depositERC20(address _token, uint256 _amount) external;
    function depositERC20ForUser(address _token, address _user, uint256 _amount) external;
    function depositERC721(address _token, uint256 _tokenId) external;
    function depositERC721ForUser(address _token, address _user, uint256 _tokenId) external;
    function depositEther() external payable;
    function deposits(uint256) external view returns (bytes32 depositHash, uint256 createdAt);
    function governance() external view returns (address);
    function isOwner() external view returns (bool);
    function lock() external;
    function locked() external view returns (bool);
    function maxErc20Deposit() external view returns (uint256);
    function onERC721Received(address, address, uint256, bytes memory) external returns (bytes4);
    function owner() external view returns (address);
    function registry() external view returns (address);
    function renounceOwnership() external;
    function rootChain() external view returns (address);
    function stateSender() external view returns (address);
    function transferAssets(address _token, address _user, uint256 _amountOrNFTId) external;
    function transferOwnership(address newOwner) external;
    function unlock() external;
    function updateChildChainAndStateSender() external;
    function updateMaxErc20Deposit(uint256 maxDepositAmount) external;
    function updateRootChain(address _rootChain) external;
}
