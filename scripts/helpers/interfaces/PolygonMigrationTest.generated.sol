// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface PolygonMigrationTest {
    event Migrated(address indexed account, uint256 amount);

    function matic() external view returns (address);
    function migrate(uint256 amount) external;
    function polygon() external view returns (address);
    function setTokenAddresses(address matic_, address polygon_) external;
}
