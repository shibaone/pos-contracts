// scripts/snapshot_state.js
const fs = require('fs');
const { ethers } = require('hardhat');

async function main() {
  const validatorId = parseInt(process.env.VALIDATOR_ID);
  const validatorShareAddr = process.env.VALIDATOR_SHARE;
  const stakeManagerAddr = process.env.STAKEMANAGER;
  const user = process.env.TARGET_USER;
  const VSABI = require("../artifacts/contracts/staking/validatorShare/ValidatorShare.sol/ValidatorShare.json").abi;
  const SMABI = require("../artifacts/contracts/staking/stakeManager/StakeManager.sol/StakeManager.json").abi;

  

  const VS = new ethers.Contract(validatorShareAddr, VSABI, ethers.provider);
  const SM = new ethers.Contract(stakeManagerAddr, SMABI, ethers.provider);

  console.log("VS: ", VS);
  console.log("SM: ", SM);
  const withdrawPool = await VS.withdrawPool();
  const withdrawShares = await VS.withdrawShares();
  const activeAmount = await VS.activeAmount();
  const exchangeRate = await VS.withdrawExchangeRate();

  // legacy unbonds[user]
  const unbondLegacy = await VS.unbonds(user);
  // determine nonces by reading unbondNonces if exported; otherwise we can probe until empty
  let nonces = [];
  for (let i = 1; i <= 20; i++) { // tweak limit if needed
    try {
      const entry = await VS.unbonds_new(user, i);
      if (entry.shares && entry.shares.toString() !== "0") {
        nonces.push({nonce:i, shares: entry.shares.toString(), withdrawEpoch: entry.withdrawEpoch.toString()});
      }
    } catch (e) {
      // if not implemented, break
    }
  }

  const validatorView = await SM.validators(validatorId);

  const snapshot = {
    blockNumber: (await ethers.provider.getBlockNumber()),
    validatorId,
    validatorShareAddr,
    stakeManagerAddr,
    user,
    withdrawPool: withdrawPool.toString(),
    withdrawShares: withdrawShares.toString(),
    activeAmount: activeAmount.toString(),
    exchangeRate: exchangeRate.toString(),
    unbondLegacy: { shares: unbondLegacy.shares.toString(), withdrawEpoch: unbondLegacy.withdrawEpoch.toString() },
    unbonds_new: nonces,
    validator: { contractAddress: validatorView.contractAddress, delegatedAmount: validatorView.delegatedAmount.toString() },
    tokenBalanceStakeManager: (await ethers.provider.getBalance(stakeManagerAddr)).toString()
  };

  fs.writeFileSync("snapshot.json", JSON.stringify(snapshot, null, 2));
  console.log("Snapshot saved -> snapshot.json");
}

main().catch(e=>{console.error(e); process.exit(1)});
