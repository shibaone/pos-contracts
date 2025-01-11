// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {TestToken} from "../helpers/interfaces/TestToken.generated.sol";
import {StakeManager} from "../helpers/interfaces/StakeManager.generated.sol";

contract MaticStake is Script {

  string path = "contractAddresses.json";
  string json = vm.readFile(path);

  function run() public {

     uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    vm.startBroadcast(deployerPrivateKey);
    
    stake();
    // topUpForFee();

    vm.stopBroadcast();
  }

  function stake() public {
    
    address validatorAccount = vm.envAddress("VALIDATOR_1");
    bytes memory pubkey = "0x038318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed75";
    uint256 stakeAmount = 10**19;
    uint256 heimdallFee = 10**19;

    console.log("StakeAmount : ", stakeAmount, " for validatorAccount : ", validatorAccount);

    StakeManager stakeManager = StakeManager(vm.parseJsonAddress(json, ".root.StakeManager"));
    console.log("StakeManager address : ", address(stakeManager));
    TestToken maticToken = TestToken(vm.parseJsonAddress(json, ".root.tokens.MaticToken"));
    console.log(address(maticToken));
    console.log("stakeToken : ", stakeManager.token());
    console.log("Sender account has a balance of : ", maticToken.balanceOf(validatorAccount));

    maticToken.approve(address(stakeManager), 10**20);
    console.log('sent approve tx, staking now...');
    console.log("Current validator set size : ",stakeManager.currentValidatorSetSize());
    stakeManager.stakeFor(validatorAccount, stakeAmount, heimdallFee, true, pubkey);



  }

  function topUpForFee() public {
    address stakeFor = vm.envAddress("VALIDATOR_1");
    uint256 amount = 10**20;

    StakeManager stakeManager = StakeManager(vm.parseJsonAddress(json, ".stakeManagerProxy"));
    TestToken rootToken = TestToken(vm.parseJsonAddress(json, ".maticToken"));
    rootToken.approve(vm.parseJsonAddress(json, ".stakeManagerProxy"), amount);

    console.log("Approved!, staking now...");

    uint256 validatorId = stakeManager.signerToValidator(stakeFor);
    console.log("Validator ID : ",validatorId);
    stakeManager.topUpForFee(stakeFor, amount);

    console.log("Success!");


  }
}
