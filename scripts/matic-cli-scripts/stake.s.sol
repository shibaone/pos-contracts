// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {TestToken} from "../helpers/interfaces/TestToken.generated.sol";
import {StakeManager} from "../helpers/interfaces/StakeManager.generated.sol";

contract MaticStake is Script {

  string internal json;

  function run() public {

     uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    vm.startBroadcast(deployerPrivateKey);
    
    string memory path = "scripts/contractAddresses.json";
    json = vm.readFile(path);
    stake();

    vm.stopBroadcast();
  }

  function stake() public {
    
    address validatorAccount = vm.envAddress("VALIDATOR_1");
    bytes memory pubkey = "0x038318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed75";
    uint256 stakeAmount = 10**19;
    uint256 heimdallFee = 10**19;

    console.log("StakeAmount : ", stakeAmount, " for validatorAccount : ", validatorAccount);

    StakeManager stakeManager = StakeManager(vm.parseJsonAddress(json, ".stakeManagerProxy"));
    TestToken maticToken = TestToken(vm.parseJsonAddress(json, ".maticToken"));
    console.log("stakeToken : ", stakeManager.token());
    console.log("Sender account has a balance of : ", maticToken.balanceOf(validatorAccount));

    maticToken.approve(address(stakeManager), 10**20);
    console.log('sent approve tx, staking now...');
    stakeManager.stakeFor(validatorAccount, stakeAmount, heimdallFee, true, pubkey);



  }

  // function topUpForFee public() {
  //   address stakeFor = vm.envAddress(validator1);
  //
  // }
}
