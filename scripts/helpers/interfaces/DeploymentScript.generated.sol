// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface DeploymentScript {
    function IS_SCRIPT() external view returns (bool);
    function run() external;
}
