// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";
import {Governance} from "../helpers/interfaces/Governance.generated.sol";

contract Testing is Script {
  function run() public {
     uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    vm.startBroadcast(deployerPrivateKey);

    Governance gov = Governance(payable(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512));
    console.log(address(gov));
    // console.log(gov.owner());

    vm.stopBroadcast();
  }
}
