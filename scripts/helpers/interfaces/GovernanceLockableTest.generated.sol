// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface GovernanceLockableTest {
    function governance() external view returns (address);
    function lock() external;
    function locked() external view returns (bool);
    function unlock() external;
}
