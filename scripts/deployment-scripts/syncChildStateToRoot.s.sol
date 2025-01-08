// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {Registry} from "../helpers/interfaces/Registry.generated.sol";
import {Governance} from "../helpers/interfaces/Governance.generated.sol";



contract SyncChildStateToRootScript is Script {
  function run() public {

    uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    vm.startBroadcast(deployerPrivateKey);
    string memory path = "contractAddresses.json";
    string memory json = vm.readFile(path);


    address registryAddress = vm.parseJsonAddress(json, '.registry');

    Governance governance = Governance(vm.parseJsonAddress(json, '.governance'));
    Registry registry = Registry(registryAddress);


    bytes memory tokenData = abi.encodeWithSelector("mapToken(address,address,bool)", vm.parseJsonAddress(json, '.maticWeth'), vm.parseJsonAddress(json, '.childToken'), true);
    governance.update(registryAddress, tokenData);

    bytes memory tokenData = abi.encodeWithSelector("mapToken(address,address,bool)", vm.parseJsonAddress(json, '.rootToken'), vm.parseJsonAddress(json, '.childToken'), true);
    governance.update(registryAddress, tokenData);

    bytes memory tokenData = abi.encodeWithSelector("mapToken(address,address,bool)", vm.parseJsonAddress(json, '.rootToken'), vm.parseJsonAddress(json, '.childToken'), true);
    governance.update(registryAddress, tokenData);

    bytes memory tokenData = abi.encodeWithSelector("mapToken(address,address,bool)", vm.parseJsonAddress(json, '.rootToken'), vm.parseJsonAddress(json, '.childToken'), true);
    governance.update(registryAddress, tokenData);
    
    

    vm.stopBroadcast();
    
  }
}
