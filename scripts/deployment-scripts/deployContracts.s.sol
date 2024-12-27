// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;
import {Script, stdJson, console} from "forge-std/Script.sol";

import {Governance} from "../helpers/interfaces/Governance.generated.sol";
import {GovernanceProxy} from "../helpers/interfaces/GovernanceProxy.generated.sol";
import {Registry} from "../helpers/interfaces/Registry.generated.sol";
import {ValidatorShareFactory} from "../helpers/interfaces/ValidatorShareFactory.generated.sol";
import {ValidatorShare} from "../helpers/interfaces/ValidatorShare.generated.sol";
import {TestToken} from "../helpers/interfaces/TestToken.generated.sol";
import {RootERC721} from "../helpers/interfaces/RootERC721.generated.sol";
import {StakingInfo} from "../helpers/interfaces/StakingInfo.generated.sol";
import {StakingNFT} from "../helpers/interfaces/StakingNFT.generated.sol";
import {RootChain} from "../helpers/interfaces/RootChain.generated.sol";
import {RootChainProxy} from "../helpers/interfaces/RootChainProxy.generated.sol";
import {StateSender} from "../helpers/interfaces/StateSender.generated.sol";
import {StakeManagerTestable} from "../helpers/interfaces/StakeManagerTestable.generated.sol";
import {StakeManagerTest} from "../helpers/interfaces/StakeManagerTest.generated.sol";
import {DepositManager} from "../helpers/interfaces/DepositManager.generated.sol";
import {DepositManagerProxy} from "../helpers/interfaces/DepositManagerProxy.generated.sol";
import {ExitNFT} from "../helpers/interfaces/ExitNFT.generated.sol";
import {WithdrawManager} from "../helpers/interfaces/WithdrawManager.generated.sol";
import {WithdrawManagerProxy} from "../helpers/interfaces/WithdrawManagerProxy.generated.sol";
import {EventsHub} from "../helpers/interfaces/EventsHub.generated.sol";
import {EventsHubProxy} from "../helpers/interfaces/EventsHubProxy.generated.sol";
import {StakeManager} from "../helpers/interfaces/StakeManager.generated.sol";
import {StakeManagerProxy} from "../helpers/interfaces/StakeManagerProxy.generated.sol";
import {StakeManagerExtension} from "../helpers/interfaces/StakeManagerExtension.generated.sol";
import {SlashingManager} from "../helpers/interfaces/SlashingManager.generated.sol";
import {MaticWETH} from "../helpers/interfaces/MaticWETH.generated.sol";
// import {ERC20Predicate} from "../helpers/interfaces/ERC20Predicate.generated.sol";
// import {ERC721Predicate} from "../helpers/interfaces/ERC721Predicate.generated.sol";
// import {MintableERC721Predicate} from "../helpers/interfaces/MintableERC721Predicate.generated.sol";



contract DeploymentScript is Script {
  Governance governance;
  GovernanceProxy governanceProxy;
  Registry registry;
  ValidatorShareFactory validatorShareFactory;
  ValidatorShare validatorShare;
  TestToken maticToken; 
  TestToken erc20Token;
  RootERC721 rootERC721;
  StakingInfo stakingInfo;
  StakingNFT stakingNFT;
  RootChain rootChain;
  RootChainProxy rootChainProxy; 
  StateSender stateSender;
  StakeManagerTestable stakeManagerTestable;
  StakeManagerTest stakeManagerTest;
  DepositManager depositManager;
  DepositManagerProxy depositManagerProxy;
  ExitNFT exitNFT;
  WithdrawManager withdrawManager;
  WithdrawManagerProxy withdrawManagerProxy;
  EventsHub eventsHubImpl;
  EventsHubProxy proxy;
  StakeManager stakeManager;
  StakeManagerProxy stakeManagerProxy;
  StakeManagerExtension auctionImpl;
  SlashingManager slashingManager;
  MaticWETH maticWETH;
  // ERC20Predicate erc20Predicate;
  // ERC721Predicate erc721Predicate;
  // MintableERC721Predicate mintableERC721Predicate;


  address ZeroAddress = 0x0000000000000000000000000000000000000000;

  function run() public {
    // uint256 deployerPrivateKey = vm.promptSecretUint("Enter deployer Private Key : ");

    uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    // Governance deployment : 
    vm.startBroadcast(deployerPrivateKey);
    string memory path = "scripts/contractAddresses.json";

    // Start with empty JSON object
    string memory json = "{}";

    governance = Governance(deployCode("out/Governance.sol/Governance.json"));
    json = vm.serializeAddress(
        "contracts",
        "governance",
        address(governance)
    );
    vm.writeJson(json, path);

    console.log("Governance contract address : ", address(governance));

    // Governance Proxy deployment : 
    governanceProxy = GovernanceProxy(payable(deployCode("out/GovernanceProxy.sol/GovernanceProxy.json", abi.encode(address(governance)))));
    console.log("GovernanceProxy contract address : ", address(governanceProxy)); 
    json = vm.serializeAddress(
        "contracts",
        "governanceProxy",
        address(governanceProxy)
    );
    vm.writeJson(json, path);

    //registry deployment : 
    registry = Registry((deployCode("out/Registry.sol/Registry.json", abi.encode(address(governanceProxy)))));
    console.log("Registry address : ", address(registry));

    json = vm.serializeAddress(
        "contracts",
        "registry",
        address(registry)
    );
    vm.writeJson(json, path);

    // ValidatorShareFactory deployment : 
    validatorShareFactory = ValidatorShareFactory(payable(deployCode("out/ValidatorShareFactory.sol/ValidatorShareFactory.json")));
    console.log("ValidatorShareFactory address : ", address(validatorShareFactory));

    json = vm.serializeAddress(
        "contracts",
        "validatorShareFactory",
        address(validatorShareFactory)
    );
    vm.writeJson(json, path);

    // ValidatorShare deployment 
    validatorShare = ValidatorShare(payable(deployCode("out/ValidatorShare.sol/ValidatorShare.json")));
    console.log("ValidatorShare address : ", address(validatorShare));

    json = vm.serializeAddress(
        "contracts",
        "validatorShare",
        address(validatorShare)
    );
    vm.writeJson(json, path);

    // Deploying test token 
    maticToken = TestToken(payable(deployCode("out/TestToken.sol/TestToken.json", abi.encode('MATIC', 'MATIC'))));
    console.log("Address of matic token : ", address(maticToken));

    json = vm.serializeAddress(
        "contracts",
        "maticToken",
        address(maticToken)
    );
    vm.writeJson(json, path);
    
    erc20Token = TestToken(payable(deployCode("out/TestToken.sol/TestToken.json", abi.encode('Test ERC20', 'TEST20'))));
  
    json = vm.serializeAddress(
        "contracts",
        "erc20Token",
        address(erc20Token)
    );
    vm.writeJson(json, path);

    rootERC721 = RootERC721(payable(deployCode("out/RootERC721.sol/RootERC721.json", abi.encode('Test ERC721', 'TST721'))));

    json = vm.serializeAddress(
        "contracts",
        "rootERC721",
        address(rootERC721)
    );
    vm.writeJson(json, path);

    console.log("rootERC721 : ", address(rootERC721));

    // StakingInfo deployment : 
    stakingInfo = StakingInfo(payable(deployCode("out/StakingInfo.sol/StakingInfo.json", abi.encode(address(registry)))));
    console.log("StakingInfo Address" ,address(stakingInfo));

    json = vm.serializeAddress(
        "contracts",
        "StakingInfo",
        address(stakingInfo)
    );
    vm.writeJson(json, path);

    // StakingNFT deployment : 
    stakingNFT = StakingNFT(payable(deployCode("out/StakingNFT.sol/StakingNFT.json", abi.encode('Matic Validator', 'MV'))));
    console.log("StakingNFT address : " ,address(stakingNFT));

    json = vm.serializeAddress(
        "contracts",
        "stakingNFT",
        address(stakingNFT)
    );
    vm.writeJson(json, path);
    
    //RootChain deployment : 
    rootChain = RootChain(payable(deployCode("out/RootChain.sol/RootChain.json")));
    console.log("RootChain address : ", address(rootChain));

    json = vm.serializeAddress(
        "contracts",
        "rootChain",
        address(rootChain)
    );
    vm.writeJson(json, path);

    rootChainProxy = RootChainProxy(payable(deployCode("out/RootChainProxy.sol/RootChainProxy.json", abi.encode(address(rootChain), address(registry), vm.envString("HEIMDALL_ID")))));
    console.log("rootChainProxy address : ", address(rootChainProxy));

    json = vm.serializeAddress(
        "contracts",
        "rootChainProxy",
        address(rootChainProxy)
    );
    vm.writeJson(json, path);

    //StateSender deployment : 
    stateSender = StateSender(payable(deployCode("out/StateSender.sol/StateSender.json")));
    console.log("StateSender address : ", address(stateSender));

    json = vm.serializeAddress(
        "contracts",
        "stateSender",
        address(stateSender)
    );
    vm.writeJson(json, path);

    //StakeManagerTestable deployment : 
    stakeManagerTestable = StakeManagerTestable(payable(deployCode("out/StakeManagerTestable.sol/StakeManagerTestable.json")));
    console.log("stakeManagerTestable : ", address(stakeManagerTestable));

    json = vm.serializeAddress(
        "contracts",
        "stakeManagerTestable",
        address(stakeManagerTestable)
    );
    vm.writeJson(json, path);

    stakeManagerTest = StakeManagerTest(payable(deployCode("out/StakeManagerTest.sol/StakeManagerTest.json")));
    console.log("stakeManagerTest address : ", address(stakeManagerTest));

    json = vm.serializeAddress(
        "contracts",
        "stakeManagerTest",
        address(stakeManagerTest)
    );
    vm.writeJson(json, path);

    // DepositManager deployment : 
    depositManager = DepositManager(payable(deployCode("out/DepositManager.sol/DepositManager.json")));
    console.log("Deposit Manager Address : ", address(depositManager));

    json = vm.serializeAddress(
        "contracts",
        "depositManager",
        address(depositManager)
    );
    vm.writeJson(json, path);
    
    depositManagerProxy = DepositManagerProxy(payable(deployCode("out/DepositManagerProxy.sol/DepositManagerProxy.json", abi.encode(address(depositManager), address(registry), address(rootChainProxy), address(governanceProxy)))));
    console.log("DepositManagerProxy address : ", address(depositManagerProxy));
    
    json = vm.serializeAddress(
        "contracts",
        "depositManagerProxy",
        address(depositManagerProxy)
    );
    vm.writeJson(json, path);

    // ExitNFT deployment : 
    exitNFT = ExitNFT(payable(deployCode("out/ExitNFT.sol/ExitNFT.json", abi.encode(address(registry)))));
    console.log("ExitNFT address : ", address(exitNFT));

    json = vm.serializeAddress(
        "contracts",
        "exitNFT",
        address(exitNFT)
    );
    vm.writeJson(json, path);

    // WithdrawManager Deployment : 
    withdrawManager = WithdrawManager(payable(deployCode("out/WithdrawManager.sol/WithdrawManager.json")));
    console.log("withdrawManager address : ", address(withdrawManager));

    json = vm.serializeAddress(
        "contracts",
        "withdrawManager",
        address(withdrawManager)
    );
    vm.writeJson(json, path);

    withdrawManagerProxy = WithdrawManagerProxy(payable(deployCode("out/WithdrawManagerProxy.sol/WithdrawManagerProxy.json", abi.encode(address(withdrawManager), address(registry), address(rootChainProxy), address(exitNFT)))));
    console.log("withdrawManagerProxy address : ", address(withdrawManagerProxy));

    json = vm.serializeAddress(
        "contracts",
        "withdrawManagerProxy",
        address(withdrawManagerProxy)
    );
    vm.writeJson(json, path);
    
    //EventsHub Deployment : 
    eventsHubImpl = EventsHub(payable(deployCode("out/EventsHub.sol/EventsHub.json")));
    console.log("EventsHub address : ", address(eventsHubImpl));

    proxy = EventsHubProxy(payable(deployCode("out/EventsHubProxy.sol/EventsHubProxy.json", abi.encode(ZeroAddress))));
    console.log("proxy address : ", address(proxy));

    bytes memory initCallData = abi.encodeWithSelector(eventsHubImpl.initialize.selector, address(registry));
    proxy.updateAndCall(address(eventsHubImpl), initCallData);
    console.log("initialization successfull!");

    // StakeManager deployment : 
    stakeManager = StakeManager(payable(deployCode("out/StakeManager.sol/StakeManager.json")));
    console.log("StakeManager address : ", address(stakeManager));
    json = vm.serializeAddress(
        "contracts",
        "stakeManager",
        address(stakeManager)
    );
    vm.writeJson(json, path);

    stakeManagerProxy = StakeManagerProxy(payable(deployCode("out/StakeManagerProxy.sol/StakeManagerProxy.json", abi.encode(ZeroAddress))));
    console.log("StakeManagerProxy address : ", address(stakeManagerProxy));
    json = vm.serializeAddress(
        "contracts",
        "stakeManagerProxy",
        address(stakeManagerProxy)
    );
    vm.writeJson(json, path);

    auctionImpl = StakeManagerExtension(payable(deployCode("out/StakeManagerExtension.sol/StakeManagerExtension.json")));
    console.log("Auction Impl : ", address(auctionImpl));

    bytes memory stakeManagerProxyCallData = abi.encodeWithSelector(stakeManager.initialize.selector, address(registry), address(rootChainProxy), address(maticToken), address(stakingNFT), address(stakingInfo), address(validatorShareFactory), address(governanceProxy), address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266), address(auctionImpl));
    
    stakeManagerProxy.updateAndCall(address(stakeManager), stakeManagerProxyCallData);

    slashingManager = SlashingManager(payable(deployCode("out/SlashingManager.sol/SlashingManager.json", abi.encode(address(registry), address(stakingInfo), vm.envString("HEIMDALL_ID")))));

    console.log("SlashingManager address : ", address(slashingManager));

    // flag 
    stakingNFT.transferOwnership(address(stakeManagerProxy));

    maticWETH = MaticWETH(payable(deployCode("out/MaticWETH.sol/MaticWETH.json")));
    console.log("MaticWETH address : ", address(maticWETH));

    json = vm.serializeAddress(
        "contracts",
        "maticWETH",
        address(maticWETH)
    );
    vm.writeJson(json, path);

   // ERC Predicate : 

   // erc20Predicate = ERC20Predicate(payable(deployCode("out/ERC20Predicate.sol/ERC20Predicate.json", abi.encode(address(withdrawManagerProxy), address(depositManagerProxy), address(registry)))));
   // console.log("ERC20Predicate address : ", address(erc20Predicate));
   //
   // erc721Predicate = ERC721Predicate(payable(deployCode("out/ERC721Predicate.sol/ERC721Predicate.json", abi.encode(address(withdrawManagerProxy), addres(depositManagerProxy)))));
   // console.log("ERC721Predicate address : ", address(erc721Predicate));
   //
   // mintableERC721Predicate = MintableERC721Predicate(payable(deployCode("out/MintableERC721Predicate.sol/MintableERC721Predicate.json", abi.encode(address(withdrawManagerProxy), address(depositManagerProxy)))));
   // console.log("MintableERC721Predicate address : ", address(mintableERC721Predicate));




    vm.stopBroadcast();
  }
}
