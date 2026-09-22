/**
 * Step 1: Deploy new StakeManager implementation
 *
 * Deploys the StakeManager contract which includes:
 *   - forceMigrateDelegation()         (onlyOwner)
 *   - forceMigrateMultipleDelegations() (onlyOwner)
 *
 * Run:
 *   npx hardhat run scripts/migration/1_deployStakeManager.js --network <network>
 *
 * Output: Copy the printed implementation address into Step 2 (NEW_IMPL env var).
 */

const { ethers, artifacts } = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("Network:  ", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer: ", deployer.address);
  console.log("Balance:  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const StakeManager = await ethers.getContractFactory("StakeManager");

  // EIP-170: mainnet rejects runtime bytecode above 24576 bytes (local hardhat allows it)
  const artifact = await artifacts.readArtifact("StakeManager");
  const runtimeSize = (artifact.deployedBytecode.length - 2) / 2;
  console.log(`Runtime bytecode size: ${runtimeSize} / 24576 bytes`);
  if (runtimeSize > 24576) {
    throw new Error("StakeManager exceeds the EIP-170 contract size limit — deployment would fail");
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice * BigInt(12)) / BigInt(10); // +20% buffer
  const estimate = await ethers.provider.estimateGas(await StakeManager.getDeployTransaction());
  const gasLimit = (estimate * BigInt(120)) / BigInt(100);
  console.log(`Gas estimate: ${estimate.toString()} (using ${gasLimit.toString()} with buffer)`);

  console.log("Deploying StakeManager implementation...");
  const stakeManager = await StakeManager.deploy({ gasPrice, gasLimit });
  await stakeManager.waitForDeployment();

  const implAddress = await stakeManager.getAddress();
  console.log("✅ StakeManager deployed:", implAddress);
  console.log("\nNext: run Step 2 with:");
  console.log(`  NEW_IMPL=${implAddress} npx hardhat run scripts/migration/2_upgradeProxy.js --network ${network.name}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
