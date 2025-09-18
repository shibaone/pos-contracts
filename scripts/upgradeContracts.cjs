const { ethers } = require("hardhat");

async function main() {
    console.log("Starting contract upgrades...");

    // Mainnet addresses
    const OWNER = "0xBab4F3e701F6d2e009Af3C7f1eF2e7dD68225E96";
    const STAKE_MANAGER_PROXY = "0x65218A41Fb92637254B4f8c97448d3dF343A3064";
    const VALIDATOR_SHARE_PROXY = "0xB817B7C987bE0a0Bc85c807Eb8Dc7848270Cc523";
    const REGISTRY = "0xF486e3B6A432Bdd6EDaAe85a565CD7682A7862BB";

    console.log("Owner address:", OWNER);

    // Impersonate the owner
    await ethers.provider.send("hardhat_impersonateAccount", [OWNER]);
    await ethers.provider.send("hardhat_setBalance", [OWNER, "0x1000000000000000000"]); // Set balance to 1 ETH
    console.log("Impersonated owner account and funded with ETH");
    
    const ownerSigner = await ethers.getSigner(OWNER);

    // Deploy new StakeManager implementation using test contract
    console.log("\n=== Deploying new StakeManager implementation ===");
    let newStakeManagerImpl;
    try {
        // Try using StakeManager which inherits from StakeManager and should be deployable
        const StakeManager = await ethers.getContractFactory("StakeManager", ownerSigner);
        newStakeManagerImpl = await StakeManager.deploy();
        await newStakeManagerImpl.waitForDeployment();
        const stakeManagerAddress = await newStakeManagerImpl.getAddress();
        console.log("New StakeManager implementation deployed at:", stakeManagerAddress);
    } catch (error) {
        console.log("Failed to deploy StakeManager, trying direct bytecode approach...");
        console.log("Error:", error.message);
        throw error;
    }

    // // Deploy ValidatorShareFactory first
    // console.log("\n=== Deploying ValidatorShareFactory ===");
    // let validatorShareFactory;
    // try {
    //     const ValidatorShareFactory = await ethers.getContractFactory("ValidatorShareFactory", ownerSigner);
    //     validatorShareFactory = await ValidatorShareFactory.deploy();
    //     await validatorShareFactory.waitForDeployment();
    //     const factoryAddress = await validatorShareFactory.getAddress();
    //     console.log("ValidatorShareFactory deployed at:", factoryAddress);
    // } catch (error) {
    //     console.log("Failed to deploy ValidatorShareFactory...");
    //     console.log("Error:", error.message);
    //     throw error;
    // }

    // Deploy new ValidatorShare implementation using test contract
    console.log("\n=== Deploying new ValidatorShare implementation ===");
    let newValidatorShareImpl;
    try {
        const ValidatorShare = await ethers.getContractFactory("ValidatorShare", ownerSigner);
        newValidatorShareImpl = await ValidatorShare.deploy();
        await newValidatorShareImpl.waitForDeployment();
        const validatorShareAddress = await newValidatorShareImpl.getAddress();
        console.log("New ValidatorShare implementation deployed at:", validatorShareAddress);
    } catch (error) {
        console.log("Failed to deploy ValidatorShare, trying direct bytecode approach...");
        console.log("Error:", error.message);
        throw error;
    }

    // // Create new ValidatorShare proxy using factory
    // console.log("\n=== Creating new ValidatorShare proxy using factory ===");
    // const validatorId = 1;
    // const loggerAddress = "0x539964b3d225194717fb896D26c8b3E635b8A1aE";
    // const registryAddress = "0xF486e3B6A432Bdd6EDaAe85a565CD7682A7862BB";

    // let newValidatorShareProxy;
    // try {
    //     const createTx = await validatorShareFactory.create(validatorId, loggerAddress, registryAddress);
    //     const createReceipt = await createTx.wait();

    //     // Extract the new proxy address from the transaction logs
    //     // The ValidatorShareProxy contract should emit events or we can get it from the transaction
    //     console.log("ValidatorShare proxy creation transaction:", createReceipt.transactionHash);

    //     // Get the proxy address from the transaction receipt logs
    //     const proxyCreatedLog = createReceipt.logs.find(log => log.address);
    //     if (proxyCreatedLog) {
    //         newValidatorShareProxy = proxyCreatedLog.address;
    //         console.log("New ValidatorShare proxy created at:", newValidatorShareProxy);
    //     } else {
    //         throw new Error("Could not find proxy address in transaction logs");
    //     }
    // } catch (error) {
    //     console.log("Failed to create ValidatorShare proxy using factory...");
    //     console.log("Error:", error.message);
    //     throw error;
    // }

    // Upgrade StakeManager
    console.log("\n=== Upgrading StakeManager ===");
    const stakeManagerProxy = await ethers.getContractAt("StakeManagerProxy", STAKE_MANAGER_PROXY, ownerSigner);
    const currentStakeManagerImpl = await stakeManagerProxy.implementation();
    console.log("Current StakeManager implementation:", currentStakeManagerImpl);

    const newStakeManagerImplAddress = await newStakeManagerImpl.getAddress();
    const upgradeStakeManagerTx = await stakeManagerProxy.updateImplementation(newStakeManagerImplAddress);
    await upgradeStakeManagerTx.wait();

    const currentStakeManagerImplAddress = await stakeManagerProxy.implementation();
    console.log("StakeManager upgraded to:", currentStakeManagerImplAddress);

    // Update ValidatorShare implementation for validator ID 1
    console.log("\n=== Updating ValidatorShare implementation for validator ID 1 ===");
    const validatorId = 1;
    const newValidatorShareImplAddress = await newValidatorShareImpl.getAddress();

    console.log("Calling updateValidatorShareImplementation with:");
    console.log("ValidatorId:", validatorId);
    console.log("New ValidatorShare implementation:", newValidatorShareImplAddress);

    const stakeManagerImplProxy = await ethers.getContractAt("StakeManager", STAKE_MANAGER_PROXY, ownerSigner);

    const updateValidatorShareTx = await stakeManagerImplProxy.updateValidatorShareImplementation(validatorId, newValidatorShareImplAddress);
    await updateValidatorShareTx.wait();

    console.log("ValidatorShare implementation updated for validator ID:", validatorId);

    // Stop impersonating
    await ethers.provider.send("hardhat_stopImpersonatingAccount", [OWNER]);

    console.log("\n=== Upgrade Summary ===");
    console.log("StakeManager Proxy:", STAKE_MANAGER_PROXY);
    console.log("New StakeManager Implementation:", await newStakeManagerImpl.getAddress());
    console.log("New ValidatorShare Implementation:", await newValidatorShareImpl.getAddress());
    console.log("ValidatorId updated:", validatorId);
    console.log("All upgrades completed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });