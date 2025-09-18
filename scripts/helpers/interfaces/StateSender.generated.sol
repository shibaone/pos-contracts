// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface StateSender {
    event NewRegistration(address indexed user, address indexed sender, address indexed receiver);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RegistrationUpdated(address indexed user, address indexed sender, address indexed receiver);
    event StateSynced(uint256 indexed id, address indexed contractAddress, bytes data);

    function counter() external view returns (uint256);
    function isOwner() external view returns (bool);
    function owner() external view returns (address);
    function register(address sender, address receiver) external;
    function registrations(address) external view returns (address);
    function renounceOwnership() external;
    function syncState(address receiver, bytes memory data) external;
    function transferOwnership(address newOwner) external;
}
