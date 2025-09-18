// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ChildERC721Mintable {
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event ChildChainChanged(address indexed previousAddress, address indexed newAddress);
    event Deposit(address indexed token, address indexed from, uint256 tokenId);
    event LogFeeTransfer(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 input1,
        uint256 input2,
        uint256 output1,
        uint256 output2
    );
    event LogTransfer(address indexed token, address indexed from, address indexed to, uint256 tokenId);
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ParentChanged(address indexed previousAddress, address indexed newAddress);
    event StateSyncerAddressChanged(address indexed previousAddress, address indexed newAddress);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Withdraw(address indexed token, address indexed from, uint256 tokenId);

    function CHAINID() external view returns (uint256);
    function EIP712_DOMAIN_HASH() external view returns (bytes32);
    function EIP712_DOMAIN_SCHEMA_HASH() external view returns (bytes32);
    function EIP712_TOKEN_TRANSFER_ORDER_SCHEMA_HASH() external view returns (bytes32);
    function addMinter(address account) external;
    function approve(address to, uint256 tokenId) external;
    function balanceOf(address owner) external view returns (uint256);
    function changeChildChain(address newAddress) external;
    function changeStateSyncerAddress(address newAddress) external;
    function childChain() external view returns (address);
    function deposit(address user, uint256 tokenId) external;
    function disabledHashes(bytes32) external view returns (bool);
    function ecrecovery(bytes32 hash, bytes memory sig) external pure returns (address result);
    function getApproved(uint256 tokenId) external view returns (address operator);
    function getTokenTransferOrderHash(address spender, uint256 tokenIdOrAmount, bytes32 data, uint256 expiration)
        external
        view
        returns (bytes32 orderHash);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function isMinter(address account) external view returns (bool);
    function isOnlyStateSyncerContract() external view returns (bool);
    function isOwner() external view returns (bool);
    function mint(address to, uint256 tokenId) external returns (bool);
    function mintWithTokenURI(address to, uint256 tokenId, string memory tokenURI) external returns (bool);
    function name() external view returns (string memory);
    function networkId() external view returns (bytes memory);
    function onStateReceive(uint256, bytes memory data) external;
    function owner() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function parent() external view returns (address);
    function renounceMinter() external;
    function renounceOwnership() external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory _data) external;
    function setApprovalForAll(address operator, bool _approved) external;
    function setParent(address newAddress) external;
    function stateSyncer() external view returns (address);
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function symbol() external view returns (string memory);
    function token() external view returns (address);
    function tokenByIndex(uint256 index) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function transferOwnership(address newOwner) external;
    function transferWithSig(bytes memory sig, uint256 tokenId, bytes32 data, uint256 expiration, address to)
        external
        returns (address);
    function withdraw(uint256 tokenId) external payable;
}
