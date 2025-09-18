const { ethers } = require("hardhat");

async function main() {
    console.log("Checking implementation addresses of proxy contracts...");

    // Contract addresses
    const STAKE_MANAGER_PROXY = "0x65218A41Fb92637254B4f8c97448d3dF343A3064";
    const VALIDATOR_SHARE_PROXY = "0xB817B7C987bE0a0Bc85c807Eb8Dc7848270Cc523";

    console.log("StakeManager Proxy:", STAKE_MANAGER_PROXY);
    console.log("ValidatorShare Proxy:", VALIDATOR_SHARE_PROXY);

    try {
        // Get StakeManager proxy implementation
        console.log("\n=== Checking StakeManager Proxy Implementation ===");
        const stakeManagerProxy = await ethers.getContractAt("StakeManagerProxy", STAKE_MANAGER_PROXY);
        const stakeManagerImplAddress = await stakeManagerProxy.implementation();
        console.log("StakeManager implementation address:", stakeManagerImplAddress);

        // Get ValidatorShare proxy implementation
        console.log("\n=== Checking ValidatorShare Proxy Implementation ===");
        const validatorShareProxy = await ethers.getContractAt("ValidatorShareProxy", VALIDATOR_SHARE_PROXY);
        const validatorShareImplAddress = await validatorShareProxy.implementation();
        console.log("ValidatorShare implementation address:", validatorShareImplAddress);

        console.log("\n=== Summary ===");
        console.log("StakeManager Proxy:", STAKE_MANAGER_PROXY);
        console.log("├── Implementation:", stakeManagerImplAddress);
        console.log("ValidatorShare Proxy:", VALIDATOR_SHARE_PROXY);
        console.log("└── Implementation:", validatorShareImplAddress);

    } catch (error) {
        console.error("Error checking implementations:", error.message);
        throw error;
    }

    console.log("\nImplementation check completed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });