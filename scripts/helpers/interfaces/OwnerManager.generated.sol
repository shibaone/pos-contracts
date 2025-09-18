// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface OwnerManager {
    event AddedOwner(address owner);
    event ChangedThreshold(uint256 threshold);
    event RemovedOwner(address owner);

    function addOwnerWithThreshold(address owner, uint256 _threshold) external;
    function changeThreshold(uint256 _threshold) external;
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
    function removeOwner(address prevOwner, address owner, uint256 _threshold) external;
    function swapOwner(address prevOwner, address oldOwner, address newOwner) external;
}
