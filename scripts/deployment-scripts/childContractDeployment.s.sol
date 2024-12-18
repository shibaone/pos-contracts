// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {ChildChain} from "../helpers/interfaces/ChildChain.generated.sol";
import {ChildERC20Proxified} from "../helpers/interfaces/ChildERC20Proxified.generated.sol";
import {ChildTokenProxy} from "../helpers/interfaces/ChildTokenProxy.generated.sol";

contract ChildContractDeploymentScript is Script {
  ChildChain childChain; 
  ChildERC20Proxified childMaticWethPRoxified;
  ChildTokenProxy childMaticWethProxy;

  function run() public {
     uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    vm.startBroadcast(deployerPrivateKey);
    

    childChain = ChildChain(payable(deployCode("out/ChildChain.sol/ChildChain.json")));
    console.log("childChain address : ", address(childChain));

    // Deploy MaticWeth (ERC20) child contract and its proxy.
    // Initialize the contract, update the child chain and map the token with its root contract.

    childMaticWethPRoxified = ChildERC20Proxified(payable(deployCode("out/ChildERC20Proxified.sol/ChildERC20Proxified.json")));
    console.log("Child MaticWethProxified deployed at : ", address(childMaticWethPRoxified));

    childMaticWethProxy = ChildTokenProxy(payable(deployCode("out/ChildTokenProxy.sol/ChildTokenProxy.json", abi.encode(address(childMaticWethPRoxified)))));
    console.log("Child MaticWeth Proxy deployed! at : ", address(childMaticWethProxy));

    ChildERC20Proxified childMaticWeth = ChildERC20Proxified(address(childMaticWethProxy));
    console.log("Abstraction successful!");

    childMaticWeth.initialize(0x0, 'Eth on Matic', 'ETH', 18);
    console.log('Child MaticWeth contract initialized');

    childMaticWeth.changeChildChain(address(childChain));
    console.log("Child MaticWeth child chain updated");

    childChain.mapToken(0x0, address(childMaticWeth), false);
    console.log("Root and child MaticWeth contracts mapped");

    // Same thing for TestToken(ERC20)
    ChildERC20Proxified childTestTokenProxified = ChildERC20Proxified.new();
    console.log('\nChild TestTokenProxified contract deployed');

    ChildTokenProxy childTestTokenProxy = ChildTokenProxy.new(address(childTestTokenProxified));
    console.log('Child TestToken proxy contract deployed');


    vm.stopBroadcast();
  }
}
