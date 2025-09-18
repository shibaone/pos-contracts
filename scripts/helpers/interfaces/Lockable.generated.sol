// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Lockable {
    function lock() external;
    function locked() external view returns (bool);
    function unlock() external;
}
