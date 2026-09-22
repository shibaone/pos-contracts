/**
 * Step 2b: Force-unstake a validator via governance
 *
 * Calls forceUnstake() on StakeManager through the Governance contract.
 * Must be run with the GOVERNANCE OWNER's private key (PRIVATE_KEY in .env).
 *
 * Prerequisite: Step 2 (proxy upgrade) must already be complete.
 * Next step:    Step 3 (3_migrateDelegations.js) — migrate delegator stakes.
 *
 * Run:
 *   npx hardhat run scripts/migration/2b_forceUnstakeValidator.js --network <network>
 */

const { ethers } = require("hardhat");
require("dotenv").config();

// ── Fill in before running ────────────────────────────────────────────────────

const ADDRESSES = {
  sepolia: {
    STAKE_MANAGER_PROXY: "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a",
    GOVERNANCE_PROXY:    "0x1FFEdE2984dd324C0E63EdFfc44d5b6795826bfC",
  },
  mainnet: {
    STAKE_MANAGER_PROXY: "0x65218A41Fb92637254B4f8c97448d3dF343A3064",
    GOVERNANCE_PROXY:    "0xC476E20c2F7FA3B35aC242aBE71B59e902242f06",
  },
};

// Validator to force-unstake (must be currently active)
const VALIDATOR_ID = 0; // TODO: set validator ID

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (VALIDATOR_ID === 0) {
    throw new Error("Set VALIDATOR_ID before running");
  }

  const network = await ethers.provider.getNetwork();
  // resolve by chainId; a local fork (31337) follows the FORK_SEPOLIA flag used by hardhat.config.js
  const CHAIN_NAMES = { 1: "mainnet", 11155111: "sepolia", 31337: process.env.FORK_SEPOLIA === "true" ? "sepolia" : "mainnet" };
  const networkName = CHAIN_NAMES[Number(network.chainId)];
  const addrs = ADDRESSES[networkName];
  if (!addrs) throw new Error(`No address config for network: ${networkName}`);
  if (addrs.GOVERNANCE_PROXY.startsWith("TODO")) {
    throw new Error(`Fill in GOVERNANCE_PROXY for network: ${networkName}`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Network:  ", networkName, `(chainId ${network.chainId})`);
  console.log("Deployer: ", deployer.address);
  console.log("Balance:  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const governance = await ethers.getContractAt("Governance", addrs.GOVERNANCE_PROXY);
  const stakeManager = await ethers.getContractAt("StakeManager", addrs.STAKE_MANAGER_PROXY);

  // Verify deployer is governance owner
  const govOwner = await governance.owner();
  if (govOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Governance owner is ${govOwner} — run with the correct private key`);
  }

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  console.log("── Pre-flight ──────────────────────────────────────────────────");

  const isActive = await stakeManager.isValidator(VALIDATOR_ID);
  console.log(`Validator ${VALIDATOR_ID} active: ${isActive}`);
  if (!isActive) {
    throw new Error(`Validator ${VALIDATOR_ID} is not active — already unstaked or invalid ID`);
  }

  const validator = await stakeManager.validators(VALIDATOR_ID);
  console.log(`Validator ${VALIDATOR_ID} delegatedAmount: ${ethers.formatUnits(validator.delegatedAmount, 18)} BONE`);
  console.log(`Validator ${VALIDATOR_ID} amount:          ${ethers.formatUnits(validator.amount, 18)} BONE`);
  console.log(`Validator ${VALIDATOR_ID} signer:          ${validator.signer}`);

  // ── Execute forceUnstake via governance ────────────────────────────────────
  console.log("\n── Executing forceUnstake via governance ───────────────────────");

  const calldata = stakeManager.interface.encodeFunctionData("forceUnstake", [VALIDATOR_ID]);
  console.log("Encoded calldata:", calldata);
  console.log(`Calling governance.update(stakeManager=${addrs.STAKE_MANAGER_PROXY}, data)`);

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice * BigInt(12)) / BigInt(10);

  let gasLimit;
  try {
    const estimate = await governance.update.estimateGas(addrs.STAKE_MANAGER_PROXY, calldata);
    gasLimit = (estimate * BigInt(120)) / BigInt(100);
    console.log(`Gas estimate: ${estimate.toString()} (using ${gasLimit.toString()} with buffer)`);
  } catch (e) {
    console.warn("Gas estimation failed, using fallback limit of 500,000:", e.shortMessage || e.message);
    gasLimit = 500_000n;
  }

  const tx = await governance.update(addrs.STAKE_MANAGER_PROXY, calldata, { gasPrice, gasLimit });
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Gas used:", receipt.gasUsed.toString());

  // ── Post-flight verification ───────────────────────────────────────────────
  console.log("\n── Post-flight verification ────────────────────────────────────");

  const isActiveAfter = await stakeManager.isValidator(VALIDATOR_ID);
  console.log(`Validator ${VALIDATOR_ID} active after: ${isActiveAfter}`);
  if (isActiveAfter) {
    throw new Error(`Validator ${VALIDATOR_ID} is still active after forceUnstake — check transaction`);
  }

  const validatorAfter = await stakeManager.validators(VALIDATOR_ID);
  console.log(`Validator ${VALIDATOR_ID} deactivationEpoch: ${validatorAfter.deactivationEpoch.toString()}`);

  console.log(`\n✅ Done. Validator ${VALIDATOR_ID} has been force-unstaked.`);
  console.log("Next: fill in DELEGATORS in 3_migrateDelegations.js and run Step 3.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
