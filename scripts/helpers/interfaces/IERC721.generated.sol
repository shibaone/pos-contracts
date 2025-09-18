// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface IERC721 {
    event Approval(address indexed _owner, address indexed _approved, uint256 indexed _tokenId);
    event ApprovalForAll(address indexed _owner, address indexed _operator, bool _approved);
    event Transfer(address indexed _from, address indexed _to, uint256 indexed _tokenId);

    function approve(address _approved, uint256 _tokenId) external payable;
    function balanceOf(address _owner) external view returns (uint256);
    function getApproved(uint256 _tokenId) external view returns (address);
    function isApprovedForAll(address _owner, address _operator) external view returns (bool);
    function ownerOf(uint256 _tokenId) external view returns (address);
    function safeTransferFrom(address _from, address _to, uint256 _tokenId) external payable;
    function safeTransferFrom(address _from, address _to, uint256 _tokenId, bytes memory data) external payable;
    function setApprovalForAll(address _operator, bool _approved) external;
    function supportsInterface(bytes4 interfaceID) external view returns (bool);
    function transferFrom(address _from, address _to, uint256 _tokenId) external payable;
}
