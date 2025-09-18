// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ERC721PlasmaMintable {
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function addMinter(address account) external;
    function approve(address to, uint256 tokenId) external;
    function balanceOf(address owner) external view returns (uint256);
    function exists(uint256 tokenId) external view returns (bool);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function isMinter(address account) external view returns (bool);
    function mint(address to, uint256 tokenId) external returns (bool);
    function mintWithTokenURI(address to, uint256 tokenId, string memory tokenURI) external returns (bool);
    function name() external view returns (string memory);
    function ownerOf(uint256 tokenId) external view returns (address);
    function renounceMinter() external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory _data) external;
    function setApprovalForAll(address to, bool approved) external;
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function transferFrom(address from, address to, uint256 tokenId) external;
}
