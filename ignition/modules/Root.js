//Deploying root contracts
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { ethers } = require("hardhat");
require("dotenv").config();
// const ethUtils = require('ethereumjs-util');


const { HEIMDALL_ID, FROM } = process.env;

module.exports = buildModule("RootContracts", (m) => {

    //Library files
    // const BytesLib = m.library("BytesLib");
    const Common = m.library("Common");
    // const ECVerify = m.library("ECVerify");
    // const Merkle = m.library("Merkle");
    // const MerklePatriciaProof = m.library("MerklePatriciaProof");
    // const PriorityQueue = m.library("PriorityQueue");
    // const RLPEncode = m.library("RLPEncode");
    // const RLPReader = m.library("RLPReader");
    // const SafeMath = m.library("contracts/common/gnosis/GnosisSafe.sol:SafeMath");
    const TransferWithSigUtils = m.library("TransferWithSigUtils");

    //Contracts
    const Governance = m.contract("Governance");
    const GovernanceProxy = m.contract("GovernanceProxy", [Governance]);
    const Registry = m.contract("Registry", [GovernanceProxy]);

    const RootChain = m.contract("RootChain")
    const RootChainProxy = m.contract("RootChainProxy", [RootChain, Registry, HEIMDALL_ID]);

    const ValidatorShareFactory = m.contract("ValidatorShareFactory");
    const StakingInfo = m.contract("StakingInfo", [Registry]);
    const StakingNFT = m.contract("StakingNFT", ['Shiba Validator', 'SV']);

    //Deploying tokens
    const BoneToken = m.contract("BoneToken", ['BONE', 'BONE']);

    const StakeManager = m.contract("StakeManager", []);
    const StakeManagerExtension = m.contract("StakeManagerExtension");
    const StakeManagerProxy = m.contract("StakeManagerProxy", ["0x0000000000000000000000000000000000000000"]);
    const initializeCallData = m.encodeFunctionCall(StakeManager, "initialize", [Registry, RootChainProxy, BoneToken, StakingNFT, StakingInfo, ValidatorShareFactory, GovernanceProxy, FROM, StakeManagerExtension]);
    m.call(StakeManagerProxy, "updateAndCall", [StakeManager, initializeCallData]);

    const SlashingManager = m.contract("SlashingManager", [Registry, StakingInfo, StakeManagerProxy]);

    const ValidatorShare = m.contract("ValidatorShare");
    const ValidatorRegistry = m.contract("ValidatorRegistry")

    const StateSender = m.contract("StateSender", []);

    const DepositManager = m.contract("DepositManager");
    const DepositManagerProxy = m.contract("DepositManagerProxy", [DepositManager, Registry, RootChainProxy, GovernanceProxy]);

    const WithdrawManager = m.contract("WithdrawManager", []);
    const ExitNFT = m.contract("ExitNFT", [Registry]);
    const WithdrawManagerProxy = m.contract("WithdrawManagerProxy", [WithdrawManager, Registry, RootChainProxy, ExitNFT]);

    const EventsHub = m.contract("EventsHub");
    const EventsHubProxy = m.contract("EventsHubProxy", [EventsHub]);

    // Deploying predicates
    const ERC20Predicate = m.contract("ERC20Predicate", [WithdrawManagerProxy, DepositManagerProxy, Registry], {
        libraries: {
            Common: Common
        }
    });
    const ERC721Predicate = m.contract("ERC721Predicate", [WithdrawManagerProxy, DepositManagerProxy], {
        libraries: {
            Common: Common
        }
    })
    const MarketplacePredicate = m.contract("MarketplacePredicate", [RootChainProxy, WithdrawManagerProxy, Registry], {
        libraries: {
            Common: Common,
            TransferWithSigUtils: TransferWithSigUtils
        }
    });
    const TransferWithSigPredicate = m.contract("TransferWithSigPredicate", [RootChainProxy, WithdrawManagerProxy, Registry], {
        libraries: {
            Common: Common,
            TransferWithSigUtils: TransferWithSigUtils
        }
    });

    // Governance config setup
    const proxy = m.contractAt("Governance", GovernanceProxy, { id: "GovernanceProxyID" });

    // Call to update the contract map for depositManager
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("depositManager")), DepositManagerProxy],
            { id: "encodeDepositManagerUpdate" }
        )
    ], { id: "callDepositManagerUpdate" });

    // Call to update the contract map for validatorShare
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("validatorShare")), ValidatorShare],
            { id: "encodeValidatorShareUpdate" }
        )
    ], { id: "callValidatorShareUpdate" });

    // Call to update the contract map for withdrawManager
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("withdrawManager")), WithdrawManagerProxy],
            { id: "encodeWithdrawManagerUpdate" }
        )
    ], { id: "callWithdrawManagerUpdate" });

    // Call to update the contract map for stakeManager
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("stakeManager")), StakeManagerProxy],
            { id: "encodeStakeManagerUpdate" }
        )
    ], { id: "callStakeManagerUpdate" });

    // Call to update the contract map for slashingManager
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("slashingManager")), SlashingManager],
            { id: "encodeSlashingManagerUpdate" }
        )
    ], { id: "callSlashingManagerUpdate" });

    // Call to update the contract map for stateSender
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("stateSender")), StateSender],
            { id: "encodeStateSenderUpdate" }
        )
    ], { id: "callStateSenderUpdate" });

    // Call to update the contract map for eventsHub
    m.call(proxy, 'update', [
        Registry,
        m.encodeFunctionCall(Registry, 'updateContractMap',
            [ethers.keccak256(ethers.toUtf8Bytes("eventsHub")), EventsHubProxy],
            { id: "encodeEventsHubUpdate" }
        )
    ], { id: "callEventsHubUpdate" });



    return {
        Governance,
        GovernanceProxy,
        Registry,
        RootChain,
        RootChainProxy,
        ValidatorShareFactory,
        StakingInfo,
        StakingNFT,
        BoneToken,
        StakeManager,
        StakeManagerProxy,
        SlashingManager,
        ValidatorShare,
        StateSender,
        DepositManager,
        DepositManagerProxy,
        WithdrawManager,
        WithdrawManagerProxy,
        ExitNFT,
        EventsHub,
        EventsHubProxy,
        ERC20Predicate,
        ERC721Predicate,
        MarketplacePredicate,
        TransferWithSigPredicate
    }

})

