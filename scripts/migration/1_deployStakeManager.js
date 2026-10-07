/**
 * Step 1: Deploy the new StakeManager implementation
 *
 * Deploys the StakeManager build with forceMigrateDelegation / forceMigrateMultipleDelegations.
 * Deploying an implementation needs no special rights: use any throwaway funded key in
 * PRIVATE_KEY, never the admin's. The script prints the runtime codehash; the admin compares it
 * with the hash pinned at review before signing the upgrade (2_upgradeProxy.js --codehash).
 *
 * Run:
 *   npx hardhat run scripts/migration/1_deployStakeManager.js --network mainnet     (MAINNET_RPC_URL, PRIVATE_KEY)
 *   npx hardhat run scripts/migration/1_deployStakeManager.js --network localhost   (fork rehearsal)
 *
 * Env: EXPECTED_CODEHASH to fail unless the compiled build matches the reviewed one,
 *      MAX_FEE_GWEI (default 30) cap on the deployment fee.
 */

const { ethers, artifacts, network: hhNetwork } = require("hardhat");
require("dotenv").config();

const ADMIN = "0xBab4F3e701F6d2e009Af3C7f1eF2e7dD68225E96";
const EIP170_LIMIT = 24576;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  if (deployer.address.toLowerCase() === ADMIN.toLowerCase()) {
    throw new Error("Deploy from a throwaway key, not the admin wallet");
  }

  console.log("Network:  ", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer: ", deployer.address);
  console.log("Balance:  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // EIP-170: mainnet rejects runtime bytecode above 24576 bytes (the hardhat test network allows it)
  const artifact = await artifacts.readArtifact("StakeManager");
  const runtimeSize = (artifact.deployedBytecode.length - 2) / 2;
  const builtCodehash = ethers.keccak256(artifact.deployedBytecode);
  console.log(`Runtime bytecode size: ${runtimeSize} / ${EIP170_LIMIT} bytes (headroom ${EIP170_LIMIT - runtimeSize})`);
  console.log(`Runtime codehash:      ${builtCodehash}`);
  if (runtimeSize > EIP170_LIMIT) {
    throw new Error("StakeManager exceeds the EIP-170 contract size limit — deployment would fail");
  }
  if (process.env.EXPECTED_CODEHASH && process.env.EXPECTED_CODEHASH.toLowerCase() !== builtCodehash.toLowerCase()) {
    throw new Error(`Compiled codehash ${builtCodehash} does not match EXPECTED_CODEHASH ${process.env.EXPECTED_CODEHASH}`);
  }

  const StakeManager = await ethers.getContractFactory("StakeManager");
  const fee = await ethers.provider.getFeeData();
  const cap = ethers.parseUnits(process.env.MAX_FEE_GWEI || "30", "gwei");
  const maxFeePerGas = fee.maxFeePerGas && fee.maxFeePerGas < cap ? fee.maxFeePerGas : cap;
  const maxPriorityFeePerGas = fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas < maxFeePerGas ? fee.maxPriorityFeePerGas : maxFeePerGas;
  const estimate = await ethers.provider.estimateGas(await StakeManager.getDeployTransaction());
  const gasLimit = (estimate * 120n) / 100n;
  console.log(`Gas estimate: ${estimate} (using ${gasLimit}), max fee ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);

  console.log("Deploying StakeManager implementation...");
  const stakeManager = await StakeManager.deploy({ gasLimit, maxFeePerGas, maxPriorityFeePerGas });
  await stakeManager.waitForDeployment();
  const implAddress = await stakeManager.getAddress();

  const deployedCodehash = ethers.keccak256(await ethers.provider.getCode(implAddress));
  if (deployedCodehash !== builtCodehash) {
    throw new Error(`Deployed codehash ${deployedCodehash} differs from the compiled ${builtCodehash}`);
  }
  console.log("✅ StakeManager deployed:", implAddress);
  console.log("   Runtime codehash:   ", deployedCodehash);
  console.log("\nNext: verify it on Sourcify, compare the codehash with the reviewed one, then:");
  console.log(`  node scripts/migration/2_upgradeProxy.js prepare --impl ${implAddress} --codehash ${deployedCodehash}${hhNetwork.name === "mainnet" ? "" : " --fork"}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
