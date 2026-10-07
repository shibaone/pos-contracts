/**
 * Step 0b: Build the migration allocation from chain events
 *
 * Lists every position on the source validators from the ERC-20 Transfer logs of their share
 * contracts (no indexer needed), re-reads each stake at one snapshot block, and assigns whole
 * delegators to the target validators so the targets end up as close to equal as possible.
 * An address with positions on several sources always goes to a single target, and goes to a
 * target it already delegates to when that keeps the balance.
 *
 * Writes allocation.json (read by 3_migrateDelegations.js) and allocation.csv (for review).
 * Regenerate right before the migration: delegators can move or exit during the notice period.
 *
 * Run:
 *   node scripts/migration/0b_buildAllocation.js --from 9,10 --to 11,3,2,4,5 [--block <n>] [--fork]
 *
 * Options:
 *   --from <ids>    source validators (comma separated)
 *   --to <ids>      target validators (comma separated)
 *   --block <n>     snapshot block (default: a couple of blocks behind head)
 *   --out <path>    output JSON (default scripts/migration/allocation.json; CSV written next to it)
 *   --fork          read from the local fork (FORK_RPC_URL) instead of mainnet
 */

const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { ethers, MAINNET, fmt, mapLimit } = lib;

const CREATION_SEARCH_FROM = 17_000_000;

async function findCreationBlock(provider, address, head) {
  let lo = CREATION_SEARCH_FROM;
  let hi = head;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await provider.getCode(address, mid)) === "0x") lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Etherscan returns at most 1000 logs per call; page by moving fromBlock past the last block seen
async function logsViaEtherscan(address, topic0, fromBlock, toBlock) {
  const key = process.env.ETHERSCAN_API_KEY;
  const seen = new Set();
  const out = [];
  let start = fromBlock;
  for (;;) {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs&address=${address}&topic0=${topic0}&fromBlock=${start}&toBlock=${toBlock}&page=1&offset=1000&apikey=${key}`;
    const body = await (await fetch(url)).json();
    if (!Array.isArray(body.result)) {
      if (/no records/i.test(body.message || "")) break;
      throw new Error(`Etherscan getLogs: ${JSON.stringify(body).slice(0, 200)}`);
    }
    for (const l of body.result) {
      const id = `${l.transactionHash}:${l.logIndex}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ topics: l.topics, data: l.data, blockNumber: parseInt(l.blockNumber, 16) });
      }
    }
    if (body.result.length < 1000) break;
    const last = parseInt(body.result[body.result.length - 1].blockNumber, 16);
    if (last === start) throw new Error("More than 1000 Transfer logs in one block; cannot page");
    start = last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

// plain eth_getLogs, halving the block range whenever the RPC refuses a request
async function logsViaRpc(provider, address, topic0, fromBlock, toBlock) {
  const out = [];
  let step = 200_000;
  for (let start = fromBlock; start <= toBlock; ) {
    const end = Math.min(start + step - 1, toBlock);
    try {
      const logs = await provider.getLogs({ address, topics: [topic0], fromBlock: start, toBlock: end });
      out.push(...logs.map((l) => ({ topics: l.topics, data: l.data, blockNumber: l.blockNumber })));
      start = end + 1;
      step = Math.min(step * 2, 1_000_000);
    } catch (e) {
      if (step <= 1_000) throw e;
      step = Math.floor(step / 2);
    }
  }
  return out;
}

async function transferLogs(ctx, address, fromBlock, toBlock) {
  const topic0 = lib.IFACE.share.getEvent("Transfer").topicHash;
  if (process.env.ETHERSCAN_API_KEY && !ctx.fork) return logsViaEtherscan(address, topic0, fromBlock, toBlock);
  return logsViaRpc(ctx.provider, address, topic0, fromBlock, toBlock);
}

/**
 * Greedy: largest delegators first, each to the target with the biggest remaining gap to the
 * common goal, preferring a target the delegator already holds a position on.
 */
function allocate(addresses, targets) {
  const k = BigInt(targets.length);
  const moving = addresses.reduce((s, a) => s + a.total, 0n);
  const goal = (targets.reduce((s, t) => s + t.before, 0n) + moving) / k;
  const gap = new Map(targets.map((t) => [t.id, goal - t.before]));
  const sorted = [...addresses].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : a.address.localeCompare(b.address)));
  const choice = new Map();
  for (const a of sorted) {
    const byGap = [...gap.entries()].sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : x[0] - y[0]));
    const preferred = byGap.find(([id, g]) => a.existingTargets.has(id) && g >= a.total);
    const [to] = preferred || byGap[0];
    choice.set(a.address, to);
    gap.set(to, gap.get(to) - a.total);
  }
  return { goal, choice };
}

async function main() {
  const args = lib.parseArgs();
  const sources = String(args.from || "").split(",").filter(Boolean).map(Number);
  const targetIds = String(args.to || "").split(",").filter(Boolean).map(Number);
  if (!sources.length || !targetIds.length) throw new Error("Pass --from <ids> and --to <ids>");
  if (sources.some((s) => targetIds.includes(s))) throw new Error("A validator cannot be both source and target");
  const out = args.out || path.join(__dirname, "allocation.json");

  const ctx = await lib.connect({ fork: Boolean(args.fork) });
  const block = args.block ? Number(args.block) : ctx.blockTag;
  const { sm, share } = lib.contracts(ctx.provider);
  const at = { blockTag: block };

  const targetShares = {};
  const targets = [];
  for (const id of targetIds) {
    const v = await sm.validators(id, at);
    if (!(await sm.isValidator(id, at))) throw new Error(`Target ${id} is not an active validator at block ${block}`);
    targetShares[id] = share(v.contractAddress);
    targets.push({ id, before: v.amount + v.delegatedAmount, share: v.contractAddress });
  }

  // positions on each source, from the share contract's Transfer logs
  const positions = [];
  const sourceInfo = [];
  for (const id of sources) {
    const v = await sm.validators(id, at);
    const vs = share(v.contractAddress);
    const created = await findCreationBlock(ctx.provider, v.contractAddress, block);
    const logs = await transferLogs(ctx, v.contractAddress, created, block);
    const holders = new Set();
    for (const l of logs) {
      const to = ethers.getAddress("0x" + l.topics[2].slice(26));
      if (to !== ethers.ZeroAddress) holders.add(to);
    }
    console.log(`Validator ${id}: share ${v.contractAddress}, created block ${created}, ${logs.length} Transfer logs, ${holders.size} addresses ever held shares`);

    const rows = await mapLimit([...holders], 8, async (address) => {
      const bal = await vs.balanceOf(address, at);
      if (bal === 0n) return null;
      const [[stake], rewards, code] = await Promise.all([vs.getTotalStake(address, at), vs.getLiquidRewards(address, at), ctx.provider.getCode(address, block)]);
      if (stake === 0n) return null;
      return { address, from: id, stakeWei: stake, rewardsWei: rewards, hasCode: code !== "0x" };
    });
    const live = rows.filter(Boolean);
    const sum = live.reduce((s, r) => s + r.stakeWei, 0n);
    const activeAmount = await vs.activeAmount(at);
    const diff = sum > v.delegatedAmount ? sum - v.delegatedAmount : v.delegatedAmount - sum;
    console.log(`  ${live.length} positions, ${fmt(sum, 6)} BONE; delegatedAmount ${fmt(v.delegatedAmount, 6)}, activeAmount ${fmt(activeAmount, 6)} (difference ${diff} wei)`);
    // shares round down per position, so allow at most 1 wei per position
    if (diff > BigInt(live.length)) throw new Error(`Validator ${id}: positions do not add up to delegatedAmount; the list is incomplete`);
    positions.push(...live);
    sourceInfo.push({ id, share: v.contractAddress, createdBlock: created, positions: live.length, sumWei: sum, delegatedAmountWei: v.delegatedAmount, activeAmountWei: activeAmount, holdersWithCode: live.filter((r) => r.hasCode).length });
  }

  // group positions by address and record which targets each address already uses
  const byAddress = new Map();
  for (const p of positions) {
    const a = byAddress.get(p.address) || { address: p.address, total: 0n, existingTargets: new Set() };
    a.total += p.stakeWei;
    byAddress.set(p.address, a);
  }
  const addresses = [...byAddress.values()];
  await mapLimit(addresses, 8, async (a) => {
    for (const t of targets) {
      const [stake] = await targetShares[t.id].getTotalStake(a.address, at);
      if (stake > 0n) a.existingTargets.add(t.id);
    }
  });

  const { goal, choice } = allocate(addresses, targets);
  const rows = positions
    .map((p) => ({ address: p.address, from: p.from, to: choice.get(p.address), stakeWei: p.stakeWei, rewardsWei: p.rewardsWei }))
    .sort((a, b) => a.from - b.from || a.to - b.to || a.address.localeCompare(b.address));

  const summary = targets.map((t) => {
    const mine = rows.filter((r) => r.to === t.id);
    const receives = mine.reduce((s, r) => s + r.stakeWei, 0n);
    const fromCounts = Object.fromEntries(sources.map((s) => [s, mine.filter((r) => r.from === s).length]));
    return { id: t.id, beforeWei: t.before, receivesWei: receives, afterWei: t.before + receives, positions: mine.length, fromCounts };
  });

  const result = {
    generatedAt: new Date().toISOString(),
    network: ctx.label,
    snapshotBlock: block,
    sources: sourceInfo,
    targets: summary,
    goalWei: goal,
    rows,
  };
  fs.writeFileSync(out, lib.json(result));
  const csv = ["address,from,to,stake_wei,stake_bone", ...rows.map((r) => `${r.address},${r.from},${r.to},${r.stakeWei},${ethers.formatUnits(r.stakeWei, 18)}`)].join("\n");
  fs.writeFileSync(out.replace(/\.json$/, ".csv"), csv + "\n");

  console.log(`\nSnapshot block ${block}; ${rows.length} positions, ${addresses.length} addresses; goal per target ${fmt(goal)} BONE\n`);
  console.log("target        before        receives          after   positions (" + sources.map((s) => `from ${s}`).join(" / ") + ")");
  for (const s of summary) {
    console.log(`${String(s.id).padStart(6)}  ${fmt(s.beforeWei).padStart(14)}  ${fmt(s.receivesWei).padStart(14)}  ${fmt(s.afterWei).padStart(14)}   ${s.positions} (${sources.map((x) => s.fromCounts[x]).join(" / ")})`);
  }
  const afters = summary.map((s) => s.afterWei);
  const spread = afters.reduce((m, x) => (x > m ? x : m), 0n) - afters.reduce((m, x) => (x < m ? x : m), afters[0]);
  console.log(`\nSpread between targets: ${fmt(spread)} BONE`);
  console.log(`Written: ${path.relative(process.cwd(), out)} and ${path.relative(process.cwd(), out.replace(/\.json$/, ".csv"))}`);
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
