// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ERC721Mintable {
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function addMinter(address account) external;
    function approve(address to, uint256 tokenId) external;
    function balanceOf(address owner) external view returns (uint256);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function isMinter(address account) external view returns (bool);
    function mint(address to, uint256 tokenId) external returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
    function renounceMinter() external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory _data) external;
    function setApprovalForAll(address to, bool approved) external;
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function transferFrom(address from, address to, uint256 tokenId) external;
}
