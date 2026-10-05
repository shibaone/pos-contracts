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
const fs = require("fs");
const path = require("path");
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

// Validator being closed (must already be force-unstaked), env overrides the default
const FROM_VALIDATOR_ID = Number(process.env.FROM_VALIDATOR_ID || 0); // TODO: set validator ID to close

// Validator receiving the migrated delegations (must be active)
const TO_VALIDATOR_ID = Number(process.env.TO_VALIDATOR_ID || 0); // TODO: set target validator ID

// List of delegator addresses to migrate from FROM_VALIDATOR_ID → TO_VALIDATOR_ID.
// Leave empty to load them from the file written by 0_fetchDelegators.js:
//   node scripts/migration/0_fetchDelegators.js --validator <FROM_VALIDATOR_ID> --verify
// Override the path with DELEGATORS_FILE. Addresses with zero stake are silently
// skipped by the contract.
const DELEGATORS_OVERRIDE = [
  // "0xADDRESS_1",
  // "0xADDRESS_2",
];

const DELEGATORS_FILE = process.env.DELEGATORS_FILE || path.join(__dirname, "delegators.json");

function loadDelegators() {
  if (DELEGATORS_OVERRIDE.length > 0) {
    console.log(`Delegators: ${DELEGATORS_OVERRIDE.length} from DELEGATORS_OVERRIDE in this script`);
    return DELEGATORS_OVERRIDE;
  }
  if (!fs.existsSync(DELEGATORS_FILE)) {
    throw new Error(
      `No delegator list. Run:\n` +
        `  node scripts/migration/0_fetchDelegators.js --validator ${FROM_VALIDATOR_ID} --verify\n` +
        `or fill in DELEGATORS_OVERRIDE (looked for ${DELEGATORS_FILE})`
    );
  }
  const data = JSON.parse(fs.readFileSync(DELEGATORS_FILE, "utf8"));
  const entry = data.validators[String(FROM_VALIDATOR_ID)];
  if (!entry || entry.addresses.length === 0) {
    throw new Error(`${DELEGATORS_FILE} has no delegators for validator ${FROM_VALIDATOR_ID}`);
  }
  console.log(`Delegators: ${entry.addresses.length} from ${DELEGATORS_FILE} (fetched ${data.fetchedAt}, verified: ${data.verified})`);
  if (!data.verified) {
    console.log("⚠️  That list was not checked against chain — re-run 0_fetchDelegators.js with --verify");
  }
  return entry.addresses;
}

// Delegators per transaction — keeps each tx well under the block gas limit
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);

// migrateOut rounds shares down, so a few wei can remain on the source validator
const DUST_WEI = 1000n;

// read calls issued at once during pre/post-flight — the checks are hundreds of
// calls, and running them one at a time times out against a remote RPC
const RPC_CONCURRENCY = Number(process.env.RPC_CONCURRENCY || 10);

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (FROM_VALIDATOR_ID === 0 || TO_VALIDATOR_ID === 0) {
    throw new Error("Set FROM_VALIDATOR_ID and TO_VALIDATOR_ID before running");
  }
  if (FROM_VALIDATOR_ID === TO_VALIDATOR_ID) {
    throw new Error("FROM_VALIDATOR_ID and TO_VALIDATOR_ID must differ");
  }
  const DELEGATORS = loadDelegators();
  if (!DELEGATORS.every((a) => ethers.isAddress(a))) {
    throw new Error(`DELEGATORS contains an invalid address: ${DELEGATORS.find((a) => !ethers.isAddress(a))}`);
  }
  if (new Set(DELEGATORS.map((a) => a.toLowerCase())).size !== DELEGATORS.length) {
    throw new Error("DELEGATORS contains duplicates");
  }

  const network = await ethers.provider.getNetwork();
  // resolve by chainId; a local fork (31337) follows the FORK_SEPOLIA flag used by hardhat.config.js
  const CHAIN_NAMES = { 1: "mainnet", 11155111: "sepolia", 31337: process.env.FORK_SEPOLIA === "true" ? "sepolia" : "mainnet" };
  const networkName = CHAIN_NAMES[Number(network.chainId)];
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

  // Verify deployer is the StakeManager owner — StakeManager.isOwner() (used by
  // onlyOwner) checks the proxy owner, which is what owner() returns through the proxy
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
  if (!(await stakeManager.delegationEnabled())) {
    throw new Error("Delegation is disabled on StakeManager — migrateIn would revert");
  }

  const fromVal = await stakeManager.validators(FROM_VALIDATOR_ID);
  const fromVS  = await ethers.getContractAt("ValidatorShare", fromVal.contractAddress);
  const toVal   = await stakeManager.validators(TO_VALIDATOR_ID);
  const toVS    = await ethers.getContractAt("ValidatorShare", toVal.contractAddress);

  if (await toVS.locked()) {
    throw new Error(`Validator ${TO_VALIDATOR_ID} delegation contract is locked — migrateIn would revert`);
  }
  if (!(await toVS.delegation())) {
    throw new Error(`Validator ${TO_VALIDATOR_ID} does not accept delegation — migrateIn would revert`);
  }

  console.log(`\nValidator ${FROM_VALIDATOR_ID} delegation contract: ${fromVal.contractAddress}`);
  console.log(`Validator ${FROM_VALIDATOR_ID} delegatedAmount:      ${ethers.formatUnits(fromVal.delegatedAmount, 18)} BONE`);
  console.log(`Validator ${FROM_VALIDATOR_ID} activeAmount:         ${ethers.formatUnits(await fromVS.activeAmount(), 18)} BONE`);
  console.log(`\nValidator ${TO_VALIDATOR_ID} delegatedAmount (before): ${ethers.formatUnits(toVal.delegatedAmount, 18)} BONE`);

  console.log(`\nDelegators to migrate: ${DELEGATORS.length}`);
  console.log("Checking current stakes...");

  // Delegators that will revert inside the batch — the contract skips them and
  // emits DelegationForceMigrationFailed, they need to be handled separately
  let totalStake = 0n;
  let activeCount2 = 0;
  const expectedFailures = [];
  for (const chunk of chunks(DELEGATORS, RPC_CONCURRENCY)) {
    const checks = await Promise.all(
      chunk.map(async (d) => ({
        d,
        stake: (await fromVS.getTotalStake(d))[0],
        bl: await stakeManager.blacklist(d),
        rewardsFrom: await fromVS.getLiquidRewards(d),
        rewardsTo: await toVS.getLiquidRewards(d),
        targetUnbond: await toVS.unbonds(d),
      }))
    );
    for (const { d, stake, bl, rewardsFrom, rewardsTo, targetUnbond } of checks) {
      if (stake === 0n) {
        console.log(`  - ${d}  (zero stake — will be skipped)`);
        continue;
      }
      console.log(`  ✓ ${d}  ${ethers.formatUnits(stake, 18)} BONE`);
      totalStake += stake;
      activeCount2++;

      if (bl.withdrawBlocked && (rewardsFrom > 0n || rewardsTo > 0n)) {
        expectedFailures.push(`${d}  withdraw-blacklisted with pending rewards`);
      }
      if (targetUnbond.shares > 0n) {
        expectedFailures.push(`${d}  ongoing exit on target validator`);
      }
    }
  }
  console.log(`\nTotal stake to migrate: ${ethers.formatUnits(totalStake, 18)} BONE across ${activeCount2} active delegators`);

  if (expectedFailures.length > 0) {
    console.log(`\n⚠️  ${expectedFailures.length} delegator(s) are expected to fail and will be skipped:`);
    expectedFailures.forEach((f) => console.log(`  ! ${f}`));
  }

  // ── Execute migration ──────────────────────────────────────────────────────
  console.log("\n── Migrating delegations ───────────────────────────────────────");
  console.log(`From validator ${FROM_VALIDATOR_ID} → To validator ${TO_VALIDATOR_ID}`);

  const batches = chunks(DELEGATORS, BATCH_SIZE);
  console.log(`${batches.length} batch(es) of up to ${BATCH_SIZE} delegators`);

  const failed = [];
  let migratedCount = 0;
  for (const [i, batch] of batches.entries()) {
    console.log(`\nBatch ${i + 1}/${batches.length} (${batch.length} delegators)`);

    const feeData = await ethers.provider.getFeeData();
    const gasPrice = (feeData.gasPrice * BigInt(12)) / BigInt(10);

    // No fallback limit: the contract reverts the batch on out-of-gas, so a
    // failed estimate means something is wrong and should be investigated
    const estimate = await stakeManager.forceMigrateMultipleDelegations.estimateGas(
      FROM_VALIDATOR_ID, TO_VALIDATOR_ID, batch
    );
    const gasLimit = (estimate * BigInt(120)) / BigInt(100);
    console.log(`Gas estimate: ${estimate.toString()} (using ${gasLimit.toString()} with buffer)`);

    const tx = await stakeManager.forceMigrateMultipleDelegations(
      FROM_VALIDATOR_ID,
      TO_VALIDATOR_ID,
      batch,
      { gasPrice, gasLimit }
    );
    console.log("Tx hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("Gas used:", receipt.gasUsed.toString());

    for (const log of receipt.logs) {
      let parsed;
      try { parsed = stakeManager.interface.parseLog(log); } catch (_) { continue; }
      if (!parsed) continue;
      if (parsed.name === "DelegationForceMigrated") {
        migratedCount++;
      } else if (parsed.name === "DelegationForceMigrationFailed") {
        let reason = parsed.args.reason;
        try { reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], ethers.dataSlice(parsed.args.reason, 4))[0]; } catch (_) {}
        failed.push({ delegator: parsed.args.delegator, reason });
        console.log(`  ✗ ${parsed.args.delegator}  failed: ${reason}`);
      }
    }
  }
  console.log(`\nMigrated: ${migratedCount}   Failed: ${failed.length}`);

  // ── Post-flight verification ───────────────────────────────────────────────
  console.log("\n── Post-flight verification ────────────────────────────────────");

  const toValAfter = await stakeManager.validators(TO_VALIDATOR_ID);
  console.log(`Validator ${TO_VALIDATOR_ID} delegatedAmount (after):  ${ethers.formatUnits(toValAfter.delegatedAmount, 18)} BONE`);

  const failedSet = new Set(failed.map((f) => f.delegator.toLowerCase()));
  console.log("\nDelegator stakes on source validator (should all be zero, up to rounding dust):");
  let residualFound = false;
  let dustTotal = 0n;
  const remaining = DELEGATORS.filter((d) => !failedSet.has(d.toLowerCase()));
  for (const chunk of chunks(remaining, RPC_CONCURRENCY)) {
    const stakes = await Promise.all(chunk.map((d) => fromVS.getTotalStake(d).then(([s]) => s)));
    for (const [i, stake] of stakes.entries()) {
      if (stake > DUST_WEI) {
        console.log(`  ✗ ${chunk[i]}  still has ${ethers.formatUnits(stake, 18)} BONE — NOT migrated!`);
        residualFound = true;
      } else if (stake > 0n) {
        dustTotal += stake;
        console.log(`  ~ ${chunk[i]}  ${stake.toString()} wei rounding dust left`);
      }
    }
  }
  if (!residualFound) {
    console.log(`  ✓ All migrated delegators cleared from source validator (${dustTotal} wei dust in total)`);
  }

  console.log(`\nDelegator stakes on target validator ${TO_VALIDATOR_ID}:`);
  let migratedTotal = 0n;
  for (const chunk of chunks(DELEGATORS, RPC_CONCURRENCY)) {
    const stakes = await Promise.all(chunk.map((d) => toVS.getTotalStake(d).then(([s]) => s)));
    for (const [i, stake] of stakes.entries()) {
      if (stake > 0n) {
        migratedTotal += stake;
        console.log(`  ✓ ${chunk[i]}  ${ethers.formatUnits(stake, 18)} BONE`);
      }
    }
  }
  console.log(`\nTotal now held by these delegators on validator ${TO_VALIDATOR_ID}: ${ethers.formatUnits(migratedTotal, 18)} BONE`);

  if (residualFound) {
    throw new Error("Some delegators were not fully migrated — check logs above");
  }
  if (failed.length > 0) {
    console.log(`\n⚠️  ${failed.length} delegator(s) failed and remain on validator ${FROM_VALIDATOR_ID}:`);
    failed.forEach((f) => console.log(`  ${f.delegator}  (${f.reason})`));
    console.log("Resolve the cause (e.g. blacklist, pending exit) and re-run with just these addresses.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ Done. All delegations migrated from validator ${FROM_VALIDATOR_ID} to validator ${TO_VALIDATOR_ID}.`);
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
