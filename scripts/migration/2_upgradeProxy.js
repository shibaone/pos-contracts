/**
 * Step 2: Upgrade StakeManagerProxy to new implementation
 *
 * Calls updateImplementation() on the proxy as the proxy owner.
 * Must be run with the PROXY OWNER's private key (PRIVATE_KEY in .env).
 *
 * Run:
 *   NEW_IMPL=0x<address from Step 1> npx hardhat run scripts/migration/2_upgradeProxy.js --network <network>
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
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const newImpl = process.env.NEW_IMPL;
  if (!newImpl || !ethers.isAddress(newImpl)) {
    throw new Error("Set NEW_IMPL=0x<address from Step 1> before running");
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

  const proxy = await ethers.getContractAt("StakeManagerProxy", addrs.STAKE_MANAGER_PROXY);

  const owner = await proxy.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Proxy owner is ${owner} — run with the correct private key`);
  }

  const code = await ethers.provider.getCode(newImpl);
  if (code === "0x") throw new Error(`${newImpl} has no bytecode — wrong address?`);

  const currentImpl = await proxy.implementation();
  console.log("Current implementation:", currentImpl);
  console.log("New implementation:    ", newImpl);

  if (currentImpl.toLowerCase() === newImpl.toLowerCase()) {
    console.log("⚠️  Already on this implementation — nothing to do.");
    return;
  }

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = (feeData.gasPrice * BigInt(12)) / BigInt(10);

  console.log("\nUpgrading proxy...");
  const tx = await proxy.updateImplementation(newImpl, { gasPrice });
  console.log("Tx hash:", tx.hash);
  await tx.wait();

  const updatedImpl = await proxy.implementation();
  if (updatedImpl.toLowerCase() !== newImpl.toLowerCase()) {
    throw new Error("Implementation mismatch after upgrade!");
  }
  console.log("✅ Proxy upgraded to:", updatedImpl);
  console.log("\nNext: forceUnstake the validator via governance, then run Step 3.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
