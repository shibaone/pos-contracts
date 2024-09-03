// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../pol-upgrade/UpgradeStake_DepositManager_Mainnet.s.sol";

contract RevertPolUpgrade_Mainnet is UpgradeStake_DepositManager_Mainnet {
    using stdJson for string;

    address internal stakeManagerLegacyImpl;
    address internal validatorShareLegacyImpl;
    address internal depositManagerLegacyImpl;

    function run() public override {
        uint256 deployerPrivateKey = vm.promptSecretUint("Enter deployer private key: ");

        loadConfig();
        (
            StakeManager stakeManagerUnmigrateImpl,
            DepositManager depositManagerUnmigrateImpl
        ) = deployTemporaryUnmigrateImplementations(deployerPrivateKey);
        (bytes memory scheduleBatchPayload, bytes memory executeBatchPayload, bytes32 payloadId) = createPayload(
            stakeManagerUnmigrateImpl,
            depositManagerUnmigrateImpl
        );

        console.log("Expected batch ID: %s", vm.toString(payloadId));

        console.log("\n----------------------\n");

        console.log("Send scheduleBatchPayload to: ", address(timelock));
        console.logBytes(scheduleBatchPayload);

        console.log("\n----------------------\n");

        console.log("After at least 2 days send executeBatchPayload to: ", address(timelock));
        console.logBytes(executeBatchPayload);
    }

    function loadConfig() public override {
        console.log("Loading config \n");

        string memory input = vm.readFile("scripts/deployers/revert-pol-upgrade/input.json");
        string memory chainIdSlug = string(abi.encodePacked('["', vm.toString(block.chainid), '"]'));

        registry = Registry(input.readAddress(string.concat(chainIdSlug, ".registry")));
        stakeManagerProxy = StakeManager(input.readAddress(string.concat(chainIdSlug, ".stakeManagerProxy")));
        governance = Governance(input.readAddress(string.concat(chainIdSlug, ".governance")));
        polToken = ERC20(input.readAddress(string.concat(chainIdSlug, ".polToken")));
        migrationAddress = input.readAddress(string.concat(chainIdSlug, ".migration"));
        timelock = Timelock(payable(input.readAddress(string.concat(chainIdSlug, ".timelock"))));
        depositManagerProxy = DepositManager(
            payable(input.readAddress(string.concat(chainIdSlug, ".depositManagerProxy")))
        );
        maticToken = ERC20(input.readAddress(string.concat(chainIdSlug, ".matic")));
        nativeGasTokenAddress = input.readAddress(string.concat(chainIdSlug, ".nativGasToken"));
        gSafeAddress = input.readAddress(string.concat(chainIdSlug, ".gSafe"));

        stakeManagerLegacyImpl = input.readAddress(string.concat(chainIdSlug, ".stakeManagerLegacyImpl"));
        validatorShareLegacyImpl = input.readAddress(string.concat(chainIdSlug, ".validatorShareLegacyImpl"));
        depositManagerLegacyImpl = input.readAddress(string.concat(chainIdSlug, ".depositManagerLegacyImpl"));

        console.log("using Registry at: ", address(registry));
        console.log("using StakeManagerProxy at: ", address(stakeManagerProxy));
        console.log("using Governance at: ", address(governance));
        console.log("using Timelock at: ", address(timelock));
        console.log("using DepositManagerProxy at: ", address(depositManagerProxy));
        console.log("using Matic at: ", address(maticToken));
        console.log("using POL at: ", address(polToken));
        console.log("using PolygonMigration at: ", migrationAddress);
        console.log("using NativGasToken at: ", nativeGasTokenAddress);
        console.log("using gSafe at: ", gSafeAddress);

        console.log("using stakeManagerLegacyImpl at: ", stakeManagerLegacyImpl);
        console.log("using validatorShareLegacyImpl at: ", validatorShareLegacyImpl);
        console.log("using depositManagerLegacyImpl at: ", depositManagerLegacyImpl);
    }

    // @dev no unmigrate validatorShare needed
    function deployTemporaryUnmigrateImplementations(
        uint256 deployerPrivateKey
    ) public returns (StakeManager stakeManagerImpl, DepositManager depositManagerImpl) {
        vm.startBroadcast(deployerPrivateKey);
        stakeManagerImpl = StakeManager(deployCode("out/StakeManager.sol/StakeManager.json"));
        console.log("deployed StakeManager (unmigrate) implementation at: ", address(stakeManagerImpl));

        depositManagerImpl = DepositManager(payable(deployCode("out/DepositManager.sol/DepositManager.json")));
        console.log("deployed DepositManager (unmigrate) implementation at: ", address(depositManagerImpl));

        vm.stopBroadcast();
    }

    /** @dev
        pre: deploy stakeManagerUnmigrateImpl, depositManagerUnmigrateImpl
        #1 - update validatorShare registry entry to legacy implementation
        #2 - stakeManager
            a. update StakeManagerProxy to point to stakeManagerUnmigrateImpl
            b. StakeManagerProxy.unmigratePol() [unmigrate pol, reset appended storage]
            c. update StakeManagerProxy to point to *stakeManagerLegacyImpl*
        #3 - depositManager
            a. update DepositManagerProxy to point to depositManagerUnmigrateImpl
            b. DepositManagerProxy.unmigratePol() [unmigrate pol]
            c. update DepositManagerProxy to point to *depositManagerLegacyImpl*
     */
    function createPayload(
        StakeManager stakeManagerUnmigrateImpl,
        DepositManager depositManagerUnmigrateImpl
    ) public view returns (bytes memory scheduleBatchPayload, bytes memory executeBatchPayload, bytes32 payloadId) {
        console.log("----------------------");
        console.log("Generating payloads \n");

        // #1 update validatorShare registry entry to legacy implementation
        bytes memory payloadRegistry = abi.encodeCall(
            Governance.update,
            (
                address(registry),
                abi.encodeCall(
                    Registry.updateContractMap,
                    (keccak256("validatorShare"), address(validatorShareLegacyImpl)) // @notice validatorShareLegacyImpl
                )
            )
        );

        console.log("#1 payloadRegistry for: ", address(governance));
        console.logBytes(payloadRegistry);

        // #2.a update StakeManagerProxy to point to stakeManagerUnmigrateImpl
        bytes memory payloadStakeManager = abi.encodeCall(
            StakeManagerProxy.updateImplementation,
            (address(stakeManagerUnmigrateImpl))
        );

        console.log("#2.a payloadStakeManager for: ", address(stakeManagerProxy));
        console.logBytes(payloadStakeManager);

        // 2b. StakeManagerProxy.unmigratePol() [unmigrate pol, reset appended storage] (onlyGovernance)
        bytes memory payloadStakeManagerUnmigratePol = abi.encodeCall(
            Governance.update,
            (address(stakeManagerProxy), abi.encodeWithSignature("unmigratePol()"))
        );

        console.log("#2.b payloadStakeManagerUnmigratePol for: ", address(governance));
        console.logBytes(payloadStakeManagerUnmigratePol);

        // #2c. update StakeManagerProxy to point to *stakeManagerLegacyImpl*
        bytes memory payloadStakeManagerLegacy = abi.encodeCall(
            StakeManagerProxy.updateImplementation,
            (address(stakeManagerLegacyImpl))
        );

        console.log("#2.c payloadStakeManagerLegacy for: ", address(stakeManagerProxy));
        console.logBytes(payloadStakeManagerLegacy);

        // #3a. update DepositManagerProxy to point to depositManagerUnmigrateImpl
        bytes memory payloadDepositManagerProxy = abi.encodeCall(
            DepositManagerProxy.updateImplementation,
            (address(depositManagerUnmigrateImpl))
        );

        console.log("#3.a payloadDepositManagerProxy for: ", address(depositManagerProxy));
        console.logBytes(payloadDepositManagerProxy);

        // #3b. DepositManagerProxy.unmigratePol() [unmigrate pol]
        bytes memory payloadDepositManagerUnmigratePol = abi.encodeCall(
            Governance.update,
            (address(depositManagerProxy), abi.encodeWithSignature("unmigratePol()"))
        );

        console.log("3.b payloadDepositManagerUnmigratePol for: ", address(governance));
        console.logBytes(payloadDepositManagerUnmigratePol);

        // #2c. update DepositManagerProxy to point to *depositManagerLegacyImpl*
        bytes memory payloadDepositManagerLegacy = abi.encodeCall(
            DepositManagerProxy.updateImplementation,
            (address(depositManagerLegacyImpl))
        );

        console.log("3.c payloadDepositManagerLegacy for: ", address(depositManagerProxy));
        console.logBytes(payloadDepositManagerLegacy);

        console.log("----------------------");
        console.log("Batching payloads \n");

        address[] memory targets = new address[](7);
        targets[0] = address(governance); // #1 - update validatorShare registry entry to legacy implementation
        targets[1] = address(stakeManagerProxy); // #2.a update StakeManagerProxy to point to stakeManagerUnmigrateImpl
        targets[2] = address(governance); // #2.b StakeManagerProxy.unmigratePol() [unmigrate pol, reset appended storage]
        targets[3] = address(stakeManagerProxy); // #2.c update StakeManagerProxy to point to *stakeManagerLegacyImpl*
        targets[4] = address(depositManagerProxy); // #3.a update DepositManagerProxy to point to depositManagerUnmigrateImpl
        targets[5] = address(governance); // #3.b DepositManagerProxy.unmigratePol() [unmigrate pol]
        targets[6] = address(depositManagerProxy); // #3.c update DepositManagerProxy to point to *depositManagerLegacyImpl*

        // Inits to 0
        uint256[] memory values = new uint256[](7);

        bytes[] memory payloads = new bytes[](7);
        payloads[0] = payloadRegistry;
        payloads[1] = payloadStakeManager;
        payloads[2] = payloadStakeManagerUnmigratePol;
        payloads[3] = payloadStakeManagerLegacy;
        payloads[4] = payloadDepositManagerProxy;
        payloads[5] = payloadDepositManagerUnmigratePol;
        payloads[6] = payloadDepositManagerLegacy;

        payloadId = timelock.hashOperationBatch(targets, values, payloads, "", "");

        // 0 timelock delay
        scheduleBatchPayload = abi.encodeCall(Timelock.scheduleBatch, (targets, values, payloads, "", "", 0));
        executeBatchPayload = abi.encodeCall(Timelock.executeBatch, (targets, values, payloads, "", ""));
    }
}