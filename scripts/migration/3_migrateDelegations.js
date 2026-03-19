/**
 * Step 3: Migrate delegations from a closed validator to a target validator
 *
 * Prerequisite: The validator being closed must already be force-unstaked
 * via governance before running this script.
 *
 * This script calls forceMigrateMultipleDelegations() directly as the
 * StakeManager owner (onlyOwner) — no governance wrapper needed.
 *
 * Run:
 *   npx hardhat run scripts/migration/3_migrateDelegations.js --network <network>
 */

const { ethers } = require("hardhat");
require("dotenv").config();

// ── Fill in before running ────────────────────────────────────────────────────

const ADDRESSES = {
  sepolia: {
    STAKE_MANAGER_PROXY: "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a",
  },
  mainnet: {
    STAKE_MANAGER_PROXY: "0x65218A41Fb92637254B4f8c97448d3dF343A3064",
  },
};

// Validator being closed (must already be force-unstaked)
const FROM_VALIDATOR_ID = 0; // TODO: set validator ID to close

// Validator receiving the migrated delegations (must be active)
const TO_VALIDATOR_ID = 0; // TODO: set target validator ID

// List of delegator addresses to migrate from FROM_VALIDATOR_ID → TO_VALIDATOR_ID
// Get this list by scanning on-chain events (see MIGRATION_COMMANDS.md).
// Addresses with zero stake are silently skipped by the contract.
const DELEGATORS = [
  // "0xADDRESS_1",
  // "0xADDRESS_2",
  // TODO: fill in delegator addresses
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (FROM_VALIDATOR_ID === 0 || TO_VALIDATOR_ID === 0) {
    throw new Error("Set FROM_VALIDATOR_ID and TO_VALIDATOR_ID before running");
  }
  if (DELEGATORS.length === 0) {
    throw new Error("DELEGATORS list is empty — fill it in before running");
  }
  if (DELEGATORS.some((a) => a.startsWith("TODO"))) {
    throw new Error("Replace all TODO placeholders in DELEGATORS");
  }

  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "mainnet" : network.name;
  const addrs = ADDRESSES[networkName];
  if (!addrs) throw new Error(`No address config for network: ${networkName}`);
  if (addrs.STAKE_MANAGER_PROXY.startsWith("TODO")) {
    throw new Error(`Fill in STAKE_MANAGER_PROXY for network: ${networkName}`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Network:  ", networkName, `(chainId ${network.chainId})`);
  console.log("Deployer: ", deployer.address);
  console.log("Balance:  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const stakeManager = await ethers.getContractAt("StakeManager", addrs.STAKE_MANAGER_PROXY);

  // Verify deployer is StakeManager owner
  const owner = await stakeManager.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`StakeManager owner is ${owner} — run with the correct private key`);
  }

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  console.log("── Pre-flight ──────────────────────────────────────────────────");
  const activeCount = await stakeManager.currentValidatorSetSize();
  console.log("Active validators:", activeCount.toString());

  const isFromActive = await stakeManager.isValidator(FROM_VALIDATOR_ID);
  const isToActive   = await stakeManager.isValidator(TO_VALIDATOR_ID);
  console.log(`Validator ${FROM_VALIDATOR_ID} active:`, isFromActive);
  console.log(`Validator ${TO_VALIDATOR_ID} active:  `, isToActive);

  if (isFromActive) {
    throw new Error(
      `Validator ${FROM_VALIDATOR_ID} is still active — run forceUnstake first via governance`
    );
  }
  if (!isToActive) {
    throw new Error(`Validator ${TO_VALIDATOR_ID} is not active — cannot migrate to it`);
  }

  const fromVal = await stakeManager.validators(FROM_VALIDATOR_ID);
  const fromVS  = await ethers.getContractAt("ValidatorShare", fromVal.contractAddress);
  const toVal   = await stakeManager.validators(TO_VALIDATOR_ID);

  console.log(`\nValidator ${FROM_VALIDATOR_ID} delegation contract: ${fromVal.contractAddress}`);
  console.log(`Validator ${FROM_VALIDATOR_ID} delegatedAmount:      ${ethers.formatUnits(fromVal.delegatedAmount, 18)} BONE`);
  console.log(`Validator ${FROM_VALIDATOR_ID} activeAmount:         ${ethers.formatUnits(await fromVS.activeAmount(), 18)} BONE`);
  console.log(`\nValidator ${TO_VALIDATOR_ID} delegatedAmount (before): ${ethers.formatUnits(toVal.delegatedAmount, 18)} BONE`);

  console.log(`\nDelegators to migrate: ${DELEGATORS.length}`);
  console.log("Checking current stakes...");

  let totalStake = 0n;
  let activeCount2 = 0;
  for (const d of DELEGATORS) {
    const [stake] = await fromVS.getTotalStake(d);
    if (stake > 0n) {
      console.log(`  ✓ ${d}  ${ethers.formatUnits(stake, 18)} BONE`);
      totalStake += stake;
      activeCount2++;
    } else {
      console.log(`  - ${d}  (zero stake — will be skipped)`);
    }
  }
  console.log(`\nTotal stake to migrate: ${ethers.formatUnits(totalStake, 18)} BONE across ${activeCount2} active delegators`);

  // ── Execute migration ──────────────────────────────────────────────────────
  console.log("\n── Migrating delegations ───────────────────────────────────────");
  console.log(`From validator ${FROM_VALIDATOR_ID} → To validator ${TO_VALIDATOR_ID}`);

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice * BigInt(12)) / BigInt(10);

  // Estimate gas then add 20% buffer
  let gasLimit;
  try {
    const estimate = await stakeManager.forceMigrateMultipleDelegations.estimateGas(
      FROM_VALIDATOR_ID, TO_VALIDATOR_ID, DELEGATORS
    );
    gasLimit = (estimate * BigInt(120)) / BigInt(100);
    console.log(`Gas estimate: ${estimate.toString()} (using ${gasLimit.toString()} with buffer)`);
  } catch (e) {
    console.warn("Gas estimation failed, using fallback limit of 8,000,000:", e.shortMessage || e.message);
    gasLimit = 8_000_000n;
  }

  const tx = await stakeManager.forceMigrateMultipleDelegations(
    FROM_VALIDATOR_ID,
    TO_VALIDATOR_ID,
    DELEGATORS,
    { gasPrice, gasLimit }
  );
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Gas used:", receipt.gasUsed.toString());

  // ── Post-flight verification ───────────────────────────────────────────────
  console.log("\n── Post-flight verification ────────────────────────────────────");

  const toValAfter = await stakeManager.validators(TO_VALIDATOR_ID);
  console.log(`Validator ${TO_VALIDATOR_ID} delegatedAmount (after):  ${ethers.formatUnits(toValAfter.delegatedAmount, 18)} BONE`);

  console.log("\nDelegator stakes on source validator (should all be zero):");
  let residualFound = false;
  for (const d of DELEGATORS) {
    const [stake] = await fromVS.getTotalStake(d);
    if (stake > 0n) {
      console.log(`  ✗ ${d}  still has ${ethers.formatUnits(stake, 18)} BONE — NOT migrated!`);
      residualFound = true;
    }
  }
  if (!residualFound) {
    console.log("  ✓ All delegators cleared from source validator");
  }

  const toVS = await ethers.getContractAt("ValidatorShare", toVal.contractAddress);
  console.log(`\nDelegator stakes on target validator ${TO_VALIDATOR_ID}:`);
  for (const d of DELEGATORS) {
    const [stake] = await toVS.getTotalStake(d);
    if (stake > 0n) {
      console.log(`  ✓ ${d}  ${ethers.formatUnits(stake, 18)} BONE`);
    }
  }

  if (residualFound) {
    throw new Error("Some delegators were not fully migrated — check logs above");
  }

  console.log(`\n✅ Done. All delegations migrated from validator ${FROM_VALIDATOR_ID} to validator ${TO_VALIDATOR_ID}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
