// One-off mainnet read: shows stake of all 11 validators, computes 2/3+1 threshold,
// and finds the minimum subset of dead validators needed to resume consensus.

const { ethers } = require("ethers");

const RPC = "https://mainnet.infura.io/v3/ebea9fbdc96a4a70b76fb3724097e8f7";
const STAKE_MANAGER = "0x65218A41Fb92637254B4f8c97448d3dF343A3064";

const ALIVE = [1, 3, 5, 7, 8, 11];
const DEAD  = [2, 4, 6, 9, 10];
const ALL   = [1,2,3,4,5,6,7,8,9,10,11];

const ABI = [
  "function validators(uint256) view returns (uint256 amount, uint256 reward, uint256 activationEpoch, uint256 deactivationEpoch, uint256 jailTime, address signer, address contractAddress, uint8 status, uint256 commissionRate, uint256 lastCommissionUpdate, uint256 delegatorsReward, uint256 delegatedAmount, uint256 initialRewardPerStake)",
  "function currentValidatorSetTotalStake() view returns (uint256)",
  "function currentValidatorSetSize() view returns (uint256)",
  "function currentEpoch() view returns (uint256)",
  "function isValidator(uint256) view returns (bool)",
];

const STATUS = ["Inactive", "Active", "Locked", "Unstaked"];
const fmt = (x) => Number(ethers.formatUnits(x, 18)).toLocaleString(undefined, {maximumFractionDigits: 2});

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const sm = new ethers.Contract(STAKE_MANAGER, ABI, provider);

  const epoch = await sm.currentEpoch();
  const setSize = await sm.currentValidatorSetSize();
  const setTotal = await sm.currentValidatorSetTotalStake();
  console.log(`Network:        Ethereum mainnet`);
  console.log(`StakeManager:   ${STAKE_MANAGER}`);
  console.log(`currentEpoch:   ${epoch}`);
  console.log(`validatorSet:   size=${setSize}, totalStake=${fmt(setTotal)} BONE\n`);

  const rows = [];
  for (const id of ALL) {
    const v = await sm.validators(id);
    const active = await sm.isValidator(id);
    const total = v.amount + v.delegatedAmount;
    rows.push({
      id,
      isAliveAssumed: ALIVE.includes(id),
      status: STATUS[Number(v.status)],
      contractActive: active,
      self: v.amount,
      deleg: v.delegatedAmount,
      total,
      deactivationEpoch: v.deactivationEpoch,
      signer: v.signer,
    });
  }

  console.log("=".repeat(118));
  console.log("ID  |  Alive?  | Status     | onchainActive | selfStake             | delegated             | total                  | signer");
  console.log("-".repeat(118));
  for (const r of rows) {
    console.log(
      `${String(r.id).padStart(2)} |  ${r.isAliveAssumed ? "YES " : "DEAD"}   | ${r.status.padEnd(10)} | ${String(r.contractActive).padEnd(13)} | ${fmt(r.self).padStart(20)}  | ${fmt(r.deleg).padStart(20)}  | ${fmt(r.total).padStart(22)} | ${r.signer}`
    );
  }
  console.log("=".repeat(118));

  // sums
  const sumOf = (list) => list.reduce((acc, id) => acc + rows.find(r => r.id === id).total, 0n);
  const A = sumOf(ALIVE);
  const D = sumOf(DEAD);
  const T = A + D;

  console.log(`\nAlive total stake (6 validators):  ${fmt(A)} BONE`);
  console.log(`Dead total stake  (5 validators):  ${fmt(D)} BONE`);
  console.log(`Grand total:                        ${fmt(T)} BONE`);
  console.log(`Alive share of total:               ${Number(A * 10000n / T) / 100}%`);

  // Required: signedStakePower * 3 > totalStake * 2  (equivalently >= 2T/3 + 1 wei)
  // We need to find minimum subset S of DEAD such that A + sum(S) > 2T/3
  // i.e. sum(S) > 2T/3 - A
  const needed = (T * 2n) / 3n + 1n - A;
  console.log(`\nNeeded extra signed-stake to clear 2/3+1: ${needed > 0n ? fmt(needed) + " BONE" : "ALREADY ABOVE THRESHOLD"}`);

  if (needed <= 0n) {
    console.log("\nThe 6 alive validators ALREADY meet 2/3+1 on rootchain math. Heimdall is the only blocker.");
    return;
  }

  // Greedy: sort dead by stake descending, pick smallest count that covers `needed`
  const deadSorted = DEAD
    .map(id => ({ id, total: rows.find(r => r.id === id).total }))
    .sort((a, b) => (b.total > a.total ? 1 : -1));

  console.log("\nDead validators sorted by stake (highest first):");
  for (const d of deadSorted) console.log(`  validator ${d.id}: ${fmt(d.total)} BONE`);

  // Try all 1-validator subsets, then 2-validator subsets, etc., to find minimum count.
  // Also report the single best subset of that count by total stake.
  const combinations = (arr, k) => {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [head, ...tail] = arr;
    return [...combinations(tail, k - 1).map(c => [head, ...c]), ...combinations(tail, k)];
  };

  let solution = null;
  for (let k = 1; k <= DEAD.length; k++) {
    const combos = combinations(DEAD, k);
    const passing = combos
      .map(ids => ({ ids, sum: sumOf(ids) }))
      .filter(c => c.sum >= needed)
      .sort((a, b) => (a.sum > b.sum ? 1 : -1)); // smallest passing sum first (least overshoot)
    if (passing.length > 0) {
      solution = { k, options: passing };
      break;
    }
  }

  if (!solution) {
    console.log("\n❌ Even bringing back ALL 5 dead validators is not enough. (Should not happen — sanity check the input.)");
    return;
  }

  console.log(`\n✅ Minimum number of dead validators to bring back online: ${solution.k}`);
  console.log(`\nAll subsets of size ${solution.k} that pass the 2/3+1 check (sorted least overshoot → most):`);
  for (const opt of solution.options.slice(0, 10)) {
    const ratio = Number((A + opt.sum) * 10000n / T) / 100;
    console.log(`  validators [${opt.ids.join(", ")}]  → adds ${fmt(opt.sum)} BONE → alive+revived = ${ratio}% of total`);
  }

  // Also show recommended "safety margin" subsets (one more than minimum)
  if (solution.k < DEAD.length) {
    const k = solution.k + 1;
    const margin = combinations(DEAD, k)
      .map(ids => ({ ids, sum: sumOf(ids) }))
      .sort((a, b) => (b.sum > a.sum ? 1 : -1))
      .slice(0, 5);
    console.log(`\n💡 Safer option — bring back ${k} validators (extra margin against another dropout):`);
    for (const opt of margin) {
      const ratio = Number((A + opt.sum) * 10000n / T) / 100;
      console.log(`  validators [${opt.ids.join(", ")}]  → alive+revived = ${ratio}% of total`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
