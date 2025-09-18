// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Module {
    event ChangedMasterCopy(address masterCopy);

    function changeMasterCopy(address _masterCopy) external;
    function manager() external view returns (address);
}
