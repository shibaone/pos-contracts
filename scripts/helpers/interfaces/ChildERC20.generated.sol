// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ChildERC20 {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event ChildChainChanged(address indexed previousAddress, address indexed newAddress);
    event Deposit(address indexed token, address indexed from, uint256 amount, uint256 input1, uint256 output1);
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
    event LogTransfer(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 input1,
        uint256 input2,
        uint256 output1,
        uint256 output2
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ParentChanged(address indexed previousAddress, address indexed newAddress);
    event StateSyncerAddressChanged(address indexed previousAddress, address indexed newAddress);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Withdraw(address indexed token, address indexed from, uint256 amount, uint256 input1, uint256 output1);

    function CHAINID() external view returns (uint256);
    function EIP712_DOMAIN_HASH() external view returns (bytes32);
    function EIP712_DOMAIN_SCHEMA_HASH() external view returns (bytes32);
    function EIP712_TOKEN_TRANSFER_ORDER_SCHEMA_HASH() external view returns (bytes32);
    function allowance(address, address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function changeChildChain(address newAddress) external;
    function changeStateSyncerAddress(address newAddress) external;
    function childChain() external view returns (address);
    function decimals() external view returns (uint8);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function deposit(address user, uint256 amount) external;
    function disabledHashes(bytes32) external view returns (bool);
    function ecrecovery(bytes32 hash, bytes memory sig) external pure returns (address result);
    function getTokenTransferOrderHash(address spender, uint256 tokenIdOrAmount, bytes32 data, uint256 expiration)
        external
        view
        returns (bytes32 orderHash);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function isOnlyStateSyncerContract() external view returns (bool);
    function isOwner() external view returns (bool);
    function name() external view returns (string memory);
    function networkId() external view returns (bytes memory);
    function onStateReceive(uint256, bytes memory data) external;
    function owner() external view returns (address);
    function parent() external view returns (address);
    function renounceOwnership() external;
    function setParent(address newAddress) external;
    function stateSyncer() external view returns (address);
    function symbol() external view returns (string memory);
    function token() external view returns (address);
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function transferOwnership(address newOwner) external;
    function transferWithSig(bytes memory sig, uint256 amount, bytes32 data, uint256 expiration, address to)
        external
        returns (address from);
    function withdraw(uint256 amount) external payable;
}
