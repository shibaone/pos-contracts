// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {Governance} from "../helpers/interfaces/Governance.generated.sol";
import {GovernanceProxy} from "../helpers/interfaces/GovernanceProxy.generated.sol";
import {Registry} from "../helpers/interfaces/Registry.generated.sol";
import {ValidatorShareFactory} from "../helpers/interfaces/ValidatorShareFactory.generated.sol";

contract DeploymentScript is Script {
  Governance governance;
  GovernanceProxy governanceProxy;
  Registry registry;
  ValidatorShareFactory validatorShareFactory;

  function run() public {
    // uint256 deployerPrivateKey = vm.promptSecretUint("Enter deployer Private Key : ");

    uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    // Governance deployment : 
    vm.startBroadcast(deployerPrivateKey);
    governance = Governance(deployCode("out/Governance.sol/Governance.json"));

    console.log("Governance contract address : ", address(governance));

    // Governance Proxy deployment : 
    governanceProxy = GovernanceProxy(payable(deployCode("out/GovernanceProxy.sol/GovernanceProxy.json", abi.encode(address(governance)))));
    console.log("GovernanceProxy contract address : ", address(governanceProxy)); 

    //registry deployment : 
    // registry = Registry((deployCode("out/Registry.sol/Registry.json", abi.encode(address(governanceProxy)))));
    // console.log("Registry address : ", address(registry));

    // ValidatorShare deployment : 
    validatorShareFactory = ValidatorShareFactory(payable(deployCode("out/ValidatorShareFactory.sol/ValidatorShareFactory.json")));
    console.log("ValidatorShareFactory address : ", address(validatorShareFactory));

    vm.stopBroadcast();
  }
}
