// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {Script, console} from "forge-std/Script.sol";
import {StakeManager} from "./helpers/interfaces/StakeManager.generated.sol";

contract DeployStakeManager is Script {
    function run() public {
        // Get deployer private key from environment or use default for testing
        uint256 deployerPrivateKey = vm.envOr("DEPLOYER_PRIVATE_KEY");
        
        console.log("Deploying StakeManager contract...");
        console.log("Deployer address:", vm.addr(deployerPrivateKey));
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy StakeManager contract using deployCode
        StakeManager stakeManager = StakeManager(
            deployCode("out/StakeManager.sol/StakeManager.json")
        );
        
        console.log("StakeManager deployed at:", address(stakeManager));
        
        vm.stopBroadcast();
        
        console.log("Deployment completed successfully!");
        console.log("Contract address:", address(stakeManager));
    }
}
