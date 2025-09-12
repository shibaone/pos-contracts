// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {Script, console} from "forge-std/Script.sol";
import {StakeManager} from "../../helpers/interfaces/StakeManager.generated.sol";
import {StakeManagerProxy} from "../../helpers/interfaces/StakeManagerProxy.generated.sol";

contract UpdateStakeManagerImplementation is Script {
    // Proxy address to update
    address constant STAKE_MANAGER_PROXY = 0x65218A41Fb92637254B4f8c97448d3dF343A3064;
    
    // Hardcoded private key - REPLACE WITH YOUR ACTUAL PRIVATE KEY
    uint256 constant DEPLOYER_PRIVATE_KEY = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;

    function run() public {
        
        vm.startBroadcast(DEPLOYER_PRIVATE_KEY);

        // Deploy new StakeManager implementation
        StakeManager newStakeManagerImpl = StakeManager(
            deployCode("out/StakeManager.sol/StakeManager.json")
        );
        
        console.log("Deployed new StakeManager implementation at:", address(newStakeManagerImpl));
        
        // Get the proxy instance
        StakeManagerProxy stakeManagerProxy = StakeManagerProxy(payable(STAKE_MANAGER_PROXY));
        
        console.log("Updating StakeManager proxy at:", address(stakeManagerProxy));
        console.log("Current implementation:", stakeManagerProxy.implementation());
        console.log("New implementation:", address(newStakeManagerImpl));
        
        // Update the implementation
        stakeManagerProxy.updateImplementation(address(newStakeManagerImpl));
        
        console.log("Successfully updated StakeManager implementation!");
        console.log("New implementation address:", stakeManagerProxy.implementation());
        
        vm.stopBroadcast();
    }
}
