/**
 * Step 1: Deploy the new StakeManager implementation
 *
 * Deploys the StakeManager build with forceMigrateDelegation / forceMigrateMultipleDelegations.
 * Deploying an implementation needs no special rights: use any throwaway funded key in
 * PRIVATE_KEY, never the admin's. It refuses to deploy unless the compiled runtime codehash is
 * MAINNET.REVIEWED_IMPL_CODEHASH (lib.js), the same value 2_upgradeProxy.js requires.
 *
 * Run:
 *   npx hardhat run scripts/migration/1_deployStakeManager.js --network mainnet     (MAINNET_RPC_URL, PRIVATE_KEY)
 *   npx hardhat run scripts/migration/1_deployStakeManager.js --network localhost   (fork rehearsal)
 *
 * Env: EXPECTED_CODEHASH (not on mainnet) to rehearse another build on a fork,
 *      MAX_FEE_GWEI (default 30) cap on the deployment fee.
 */

const { ethers, artifacts, network: hhNetwork } = require("hardhat");
const { MAINNET } = require("./lib");

const ADMIN = MAINNET.ADMIN;
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
  // a fork reports chainId 1 too, so only the local network names may override
  if (process.env.EXPECTED_CODEHASH && !["localhost", "hardhat"].includes(hhNetwork.name)) {
    throw new Error("EXPECTED_CODEHASH cannot replace the reviewed codehash on mainnet; change REVIEWED_IMPL_CODEHASH in a reviewed commit");
  }
  const expected = process.env.EXPECTED_CODEHASH || MAINNET.REVIEWED_IMPL_CODEHASH;
  if (expected.toLowerCase() !== builtCodehash.toLowerCase()) {
    throw new Error(`Compiled codehash ${builtCodehash} is not the reviewed ${expected}; build from the reviewed commit`);
  }
  console.log(`  ✓ matches the ${process.env.EXPECTED_CODEHASH ? "EXPECTED_CODEHASH" : "reviewed"} codehash`);

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
  console.log("\nNext: verify it on Sourcify, then:");
  console.log(`  node scripts/migration/2_upgradeProxy.js prepare --impl ${implAddress}${hhNetwork.name === "mainnet" ? "" : ` --fork${process.env.EXPECTED_CODEHASH ? ` --codehash ${deployedCodehash}` : ""}`}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
