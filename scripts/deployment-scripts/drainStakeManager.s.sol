// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {DrainStakeManager} from "../helpers/interfaces/DrainStakeManager.generated.sol";

contract DrainStakeManagerDeployment is Script {
  DrainStakeManager drainStakeManager;

  function run() public {
     uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    vm.startBroadcast(deployerPrivateKey);
    
    // DrainStakeManager deploy : 
    drainStakeManager = DrainStakeManager(payable(deployCode("out/DrainStakeManager.sol/DrainStakeManager.json")));
    console.log("DrainStakeManager address : ", address(drainStakeManager));


    vm.stopBroadcast();
  }
}
