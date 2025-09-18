// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface MockERC721 {
    event Approval(address indexed _owner, address indexed _approved, uint256 indexed _tokenId);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);
    event Transfer(address indexed _from, address indexed _to, uint256 indexed _tokenId);

    function approve(address spender, uint256 id) external payable;
    function balanceOf(address owner) external view returns (uint256);
    function getApproved(uint256 id) external view returns (address);
    function initialize(string memory name_, string memory symbol_) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function name() external view returns (string memory);
    function ownerOf(uint256 id) external view returns (address owner);
    function safeTransferFrom(address from, address to, uint256 id) external payable;
    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) external payable;
    function setApprovalForAll(address operator, bool approved) external;
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 id) external view returns (string memory);
    function transferFrom(address from, address to, uint256 id) external payable;
}
