// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface MinterRole {
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);

    function addMinter(address account) external;
    function isMinter(address account) external view returns (bool);
    function renounceMinter() external;
}
