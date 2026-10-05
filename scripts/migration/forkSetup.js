/**
 * Fork-only setup for rehearsing the migration against mainnet state.
 *
 * Refuses to run anywhere except a local fork (chainId 31337). It:
 *   1. deploys the new StakeManager implementation
 *   2. points the mainnet proxy at it, as the impersonated proxy owner
 *   3. hands proxy ownership to the first local account, so 2b_forceUnstakeValidator.js
 *      and 3_migrateDelegations.js can then run completely unmodified
 *   4. reports the state of the source and target validators
 *
 * Run (against a node started with `npx hardhat node --fork <mainnet rpc>`):
 *   FROM_VALIDATOR_ID=14 TO_VALIDATOR_ID=8 npx hardhat run scripts/migration/forkSetup.js --network localhost
 */

const { ethers, network } = require("hardhat");
require("dotenv").config();

const STAKE_MANAGER_PROXY = "0x65218A41Fb92637254B4f8c97448d3dF343A3064";
const ETH_100 = "0x56BC75E2D63100000";

const FROM_VALIDATOR_ID = Number(process.env.FROM_VALIDATOR_ID || 0);
const TO_VALIDATOR_ID = Number(process.env.TO_VALIDATOR_ID || 0);

const STATUS = ["Inactive", "Active", "Locked", "Unstaked"];
const fmt = (wei) => Number(ethers.formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });

async function impersonate(address) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [address] });
  await network.provider.send("hardhat_setBalance", [address, ETH_100]);
  return ethers.getSigner(address);
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (Number(chainId) !== 31337) {
    throw new Error(`Refusing to run on chainId ${chainId} — this script is for a local fork only`);
  }

  const [local] = await ethers.getSigners();
  const proxy = await ethers.getContractAt("StakeManagerProxy", STAKE_MANAGER_PROXY);
  const currentOwner = await proxy.owner();
  const currentImpl = await proxy.implementation();

  console.log("── Fork setup ──────────────────────────────────────────────────");
  console.log("StakeManagerProxy:   ", STAKE_MANAGER_PROXY);
  console.log("Current impl:        ", currentImpl);
  console.log("Current proxy owner: ", currentOwner);
  console.log("Local account:       ", local.address);

  const owner = await impersonate(currentOwner);

  const newImpl = await (await ethers.getContractFactory("StakeManager")).deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  const size = (await ethers.provider.getCode(newImplAddress)).length / 2 - 1;
  console.log("\nNew impl deployed:   ", newImplAddress);
  console.log(`Runtime size:         ${size} bytes (limit 24576, headroom ${24576 - size})`);

  await (await proxy.connect(owner).updateImplementation(newImplAddress)).wait();
  console.log("Impl updated:        ", await proxy.implementation());

  // the real scripts sign with a local key, so move proxy ownership to it
  await (await proxy.connect(owner).transferOwnership(local.address)).wait();
  console.log("Proxy owner now:     ", await proxy.owner());

  await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [currentOwner] });

  const stakeManager = await ethers.getContractAt("StakeManager", STAKE_MANAGER_PROXY);
  console.log("\nStakeManager.owner():", await stakeManager.owner());
  console.log("currentEpoch:        ", (await stakeManager.currentEpoch()).toString());
  console.log("delegationEnabled:   ", await stakeManager.delegationEnabled());

  for (const id of [FROM_VALIDATOR_ID, TO_VALIDATOR_ID]) {
    if (!id) continue;
    const v = await stakeManager.validators(id);
    const label = id === FROM_VALIDATOR_ID ? "source" : "target";
    console.log(
      `\nValidator ${id} (${label}):` +
        `\n  status:          ${STATUS[Number(v.status)]} (isValidator: ${await stakeManager.isValidator(id)})` +
        `\n  share contract:  ${v.contractAddress}` +
        `\n  selfStake:       ${fmt(v.amount)} BONE` +
        `\n  delegatedAmount: ${fmt(v.delegatedAmount)} BONE`
    );
  }

  console.log("\n✅ Fork ready. Now run:");
  console.log(`   FROM_VALIDATOR_ID=${FROM_VALIDATOR_ID} TO_VALIDATOR_ID=${TO_VALIDATOR_ID} npx hardhat run scripts/migration/3_migrateDelegations.js --network localhost`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
