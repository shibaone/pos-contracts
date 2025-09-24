/*
  Usage:
  npx hardhat run scripts/findAffectedExits.js --network <network>

  Notes:
  - Configure the constants below (addresses, checkpoints, block range) before running.
*/

const hre = require("hardhat");
const { ethers } = hre;

// ========= CONFIGURE THESE =========
// Set your deployed contract addresses and scan window here
const WITHDRAW_MANAGER_ADDRESS = "0x5F683665ca87dbC3D1358913da80e3C71c328Fb0";   // <-- set me
const EXIT_NFT_ADDRESS = "0x7ad7f98f229c5C1EA5161bEd952c3007DBE1F307";        // <-- set to ExitNFT (optional)

// Root-chain block range to scan ExitStarted logs
// Use numbers or the string "latest" for TO_BLOCK
const FROM_BLOCK = 23348785;           // blocknumber of last correct submitted checkpoint
const TO_BLOCK = "latest";      // e.g., "latest" or a block number
// ===================================

const withdrawAbi = [
  "event ExitStarted(address indexed exitor, uint256 exitId, address indexed rootToken, uint256 amountOrTokenId, bool isRegularExit)",
  "event ExitUpdated(uint256 indexed exitId, uint256 indexed age, address signer)",
  "event ExitCancelled(uint256 indexed exitId)",
  "event Withdraw(uint256 indexed exitId, address indexed user, address indexed token, uint256 amount)"
];

const exitNftAbi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

async function main() {
  const withdrawManagerAddr = WITHDRAW_MANAGER_ADDRESS;
  const isAddr = (addr) => (ethers.isAddress ? ethers.isAddress(addr) : ethers.utils.isAddress(addr));
  if (!isAddr(withdrawManagerAddr)) {
    console.error("Please configure a valid WITHDRAW_MANAGER_ADDRESS in scripts/findAffectedExits.js");
    process.exit(1);
  }

  const provider = ethers.provider;
  const wm = new ethers.Contract(withdrawManagerAddr, withdrawAbi, provider);
  const exitNft = (EXIT_NFT_ADDRESS && EXIT_NFT_ADDRESS !== "0x0000000000000000000000000000000000000000")
    ? new ethers.Contract(EXIT_NFT_ADDRESS, exitNftAbi, provider)
    : null;

  const latest = await provider.getBlockNumber();
  const fromBlock = FROM_BLOCK === "latest" ? latest : Number(FROM_BLOCK);
  const toBlock = TO_BLOCK === "latest" ? latest : Number(TO_BLOCK);

  const filterExitStarted = wm.filters && wm.filters.ExitStarted ? wm.filters.ExitStarted() : null;
  const filterExitUpdated = wm.filters && wm.filters.ExitUpdated ? wm.filters.ExitUpdated() : null;
  const filterExitCancelled = wm.filters && wm.filters.ExitCancelled ? wm.filters.ExitCancelled() : null;
  const filterWithdraw = wm.filters && wm.filters.Withdraw ? wm.filters.Withdraw() : null;
  if (!filterExitStarted) {
    console.error("Unable to create ExitStarted filter from contract instance.");
    process.exit(1);
  }
  const logsStarted = await wm.queryFilter(filterExitStarted, fromBlock, toBlock);
  const logsUpdated = filterExitUpdated ? await wm.queryFilter(filterExitUpdated, fromBlock, toBlock) : [];
  const logsCancelled = filterExitCancelled ? await wm.queryFilter(filterExitCancelled, fromBlock, toBlock) : [];
  const logsWithdraw = filterWithdraw ? await wm.queryFilter(filterWithdraw, fromBlock, toBlock) : [];

  if (logsStarted.length) {
    console.log("ExitStarted txs:");
    console.table(logsStarted.map(l => ({ blockNumber: l.blockNumber, txHash: l.transactionHash })));
  }
  if (logsUpdated.length) {
    console.log("ExitUpdated txs:");
    console.table(logsUpdated.map(l => ({ blockNumber: l.blockNumber, txHash: l.transactionHash })));
  }
  if (logsCancelled.length) {
    console.log("ExitCancelled txs:");
    console.table(logsCancelled.map(l => ({ blockNumber: l.blockNumber, txHash: l.transactionHash })));
  }
  if (logsWithdraw.length) {
    console.log("Withdraw (finalized) txs:");
    console.table(logsWithdraw.map(l => ({ blockNumber: l.blockNumber, txHash: l.transactionHash })));
  }

  if (exitNft) {
    const zero = "0x0000000000000000000000000000000000000000";
    const transferFilter = exitNft.filters && exitNft.filters.Transfer ? exitNft.filters.Transfer(zero) : null;
    if (transferFilter) {
      const logsMint = await exitNft.queryFilter(transferFilter, fromBlock, toBlock);
      if (logsMint.length) {
        console.log("ExitNFT mint txs (Transfer from zero):");
        console.table(logsMint.map(l => ({ blockNumber: l.blockNumber, txHash: l.transactionHash })));
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


