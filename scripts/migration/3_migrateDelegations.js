/**
 * Step 3: Migrate delegations from closed validators, driven by one allocation file
 *
 * prepare: reads allocation.json (0b_buildAllocation.js), re-checks every row against the chain,
 *          dry-runs each delegator's move on its own, checks StakeManager holds enough BONE for the
 *          rewards the batches pay out, and writes one calldata file per batch for the hardware
 *          wallet. Nothing is signed here. Rows already moved are skipped, so prepare can be re-run
 *          at any point to resume.
 * verify:  checks one mined batch: every delegator moved exactly its stake to the planned target,
 *          nothing left on the source, no DelegationForceMigrationFailed, validator totals moved by
 *          the same amount, and the Heimdall gate for both validators. Run it before the next batch.
 * status:  progress over the whole allocation, and the final check (nothing left on the sources).
 *
 * The contract does not stop a migration out of an active validator, so prepare refuses unless
 * every source is already force-unstaked (isValidator false, deactivationEpoch set and reached).
 *
 * Run:
 *   node scripts/migration/3_migrateDelegations.js prepare --codehash <pinned> [--pilot] [--batch-size 50]
 *   node scripts/migration/3_migrateDelegations.js verify --tx <hash>
 *   node scripts/migration/3_migrateDelegations.js status
 *
 * Options: --allocation <path> (default scripts/migration/allocation.json), --fork
 * Env: ALLOW_DRIFT=1 to accept on-chain stakes that differ from the allocation,
 *      MIN_MARGIN_BONE (default 50000) BONE StakeManager must hold beyond the rewards to be paid.
 */

const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const { ethers, MAINNET, IFACE, expectEq, fmt, mapLimit } = lib;

const SM = MAINNET.STAKE_MANAGER_PROXY;
const MAX_BATCH = 50;
const DEFAULT_ALLOCATION = path.join(__dirname, "allocation.json");

function loadAllocation(args) {
  const file = args.allocation || DEFAULT_ALLOCATION;
  const alloc = lib.readAllocation(file);
  lib.validateAllocation(alloc.rows);
  console.log(`Allocation: ${path.relative(process.cwd(), file)}, ${alloc.rows.length} positions${alloc.snapshotBlock ? `, snapshot block ${alloc.snapshotBlock}` : ""}`);
  return { file, ...alloc };
}

async function shareOf(sm, id, blockTag) {
  return lib.contracts(sm.runner).share((await sm.validators(id, { blockTag })).contractAddress);
}

async function checkValidators(ctx, sources, targets) {
  const { sm } = lib.contracts(ctx.provider);
  const epoch = await sm.currentEpoch({ blockTag: ctx.blockTag });
  for (const id of sources) {
    const s = await lib.crossCheck(ctx, `source ${id}`, async (p, t) => {
      const c = lib.contracts(p).sm;
      const [isVal, v] = await Promise.all([c.isValidator(id, { blockTag: t }), c.validators(id, { blockTag: t })]);
      return { isVal, deactivationEpoch: v.deactivationEpoch, share: v.contractAddress };
    });
    if (s.isVal) throw new Error(`Source ${id} is still an active validator; force-unstake it first (2b)`);
    if (s.deactivationEpoch === 0n || s.deactivationEpoch > epoch) throw new Error(`Source ${id} has deactivationEpoch ${s.deactivationEpoch} (current ${epoch}); it is not closed`);
    console.log(`  ✓ source ${id} closed at epoch ${s.deactivationEpoch}`);
  }
  for (const id of targets) {
    const t = await lib.crossCheck(ctx, `target ${id}`, async (p, b) => {
      const c = lib.contracts(p);
      const [isVal, v] = await Promise.all([c.sm.isValidator(id, { blockTag: b }), c.sm.validators(id, { blockTag: b })]);
      const vs = c.share(v.contractAddress);
      const [locked, delegation] = await Promise.all([vs.locked({ blockTag: b }), vs.delegation({ blockTag: b })]);
      return { isVal, locked, delegation, commission: v.commissionRate };
    });
    if (!t.isVal || t.locked || !t.delegation) throw new Error(`Target ${id}: isValidator ${t.isVal}, locked ${t.locked}, accepts delegation ${t.delegation}`);
    console.log(`  ✓ target ${id} active, accepts delegation, commission ${t.commission}%`);
  }
}

async function prepare(ctx, args) {
  const alloc = loadAllocation(args);
  const batchSize = Number(args["batch-size"] || MAX_BATCH);
  if (!(batchSize >= 1 && batchSize <= MAX_BATCH)) throw new Error(`--batch-size must be 1..${MAX_BATCH}`);
  const sources = [...new Set(alloc.rows.map((r) => r.from))];
  const targets = [...new Set(alloc.rows.map((r) => r.to))];
  const b = ctx.blockTag;

  console.log("\n── Pre-checks ──────────────────────────────────────────────────");
  expectEq("StakeManager owner", await lib.crossCheck(ctx, "owner", (p, t) => lib.contracts(p).sm.owner({ blockTag: t })), MAINNET.ADMIN);
  const impl = await lib.crossCheck(ctx, "implementation", (p, t) => lib.contracts(p).sm.implementation({ blockTag: t }));
  if (impl.toLowerCase() === MAINNET.LIVE_IMPL.toLowerCase()) throw new Error("StakeManager is still on the pre-migration implementation; upgrade first (2)");
  const codehash = ethers.keccak256(await ctx.provider.getCode(impl, b));
  if (args.codehash) expectEq("implementation codehash", codehash, args.codehash);
  else if (!ctx.fork) throw new Error("Pass --codehash <runtime codehash pinned at review>");
  else console.log(`  · implementation ${impl}, codehash ${codehash} (not pinned: fork run)`);
  expectEq("delegation enabled", await lib.crossCheck(ctx, "delegationEnabled", (p, t) => lib.contracts(p).sm.delegationEnabled({ blockTag: t })), true);
  await checkValidators(ctx, sources, targets);

  const { sm } = lib.contracts(ctx.provider);
  const shares = {};
  for (const id of [...sources, ...targets]) shares[id] = await shareOf(sm, id, b);

  console.log(`\n── Checking ${alloc.rows.length} positions at block ${b} ──────────────────────────`);
  const checked = await mapLimit(alloc.rows, 8, async (r) => {
    const [[stake], rewardsFrom, rewardsTo, unbondTo] = await Promise.all([
      shares[r.from].getTotalStake(r.address, { blockTag: b }),
      shares[r.from].getLiquidRewards(r.address, { blockTag: b }),
      shares[r.to].getLiquidRewards(r.address, { blockTag: b }),
      shares[r.to].unbonds(r.address, { blockTag: b }),
    ]);
    if (stake === 0n) return { ...r, state: "nothing-left" };
    let blacklisted = false;
    try {
      blacklisted = (await sm.blacklist(r.address, { blockTag: b })).withdrawBlocked;
    } catch (_) {
      // older builds have no blacklist
    }
    if (blacklisted && rewardsFrom + rewardsTo > 0n) return { ...r, stake, state: "excluded", reason: "withdraw-blacklisted with pending rewards" };
    if (unbondTo.shares > 0n) return { ...r, stake, state: "excluded", reason: "legacy unbond in progress on the target" };
    // the single-delegator call reverts with the real reason, where the batch would only emit an event
    const single = IFACE.stakeManager.encodeFunctionData("forceMigrateDelegation", [r.from, r.to, r.address]);
    try {
      await ctx.provider.call({ from: MAINNET.ADMIN, to: SM, data: single, blockTag: b });
    } catch (e) {
      return { ...r, stake, state: "excluded", reason: `dry-run reverts: ${lib.errorText(e)}` };
    }
    return { ...r, stake, rewards: rewardsFrom + rewardsTo, state: stake === r.stakeWei ? "pending" : "drift" };
  });

  const by = (s) => checked.filter((c) => c.state === s);
  const drift = by("drift");
  const excluded = by("excluded");
  console.log(`  pending ${by("pending").length + drift.length}, already moved/exited ${by("nothing-left").length}, excluded ${excluded.length}, stake changed since snapshot ${drift.length}`);
  for (const x of excluded) console.log(`  ! ${x.address} (from ${x.from}): ${x.reason}`);
  if (drift.length) {
    for (const d of drift.slice(0, 20)) console.log(`  ~ ${d.address} (from ${d.from}): allocation ${fmt(d.stakeWei, 6)}, now ${fmt(d.stake, 6)}`);
    if (process.env.ALLOW_DRIFT !== "1") throw new Error(`${drift.length} stakes changed since the snapshot; regenerate the allocation (0b) or set ALLOW_DRIFT=1`);
  }

  const pending = [...by("pending"), ...drift];
  const rewards = pending.reduce((s, p) => s + p.rewards, 0n);
  const balance = await lib.crossCheck(ctx, "StakeManager BONE balance", (p, t) => lib.contracts(p).bone.balanceOf(SM, { blockTag: t }));
  const margin = ethers.parseUnits(process.env.MIN_MARGIN_BONE || "50000", 18);
  console.log(`\nStakeManager BONE ${fmt(balance)}; rewards these moves pay out ${fmt(rewards)}; required margin ${fmt(margin)}`);
  if (balance < rewards + margin) throw new Error(`StakeManager holds ${fmt(balance)} BONE, needs at least ${fmt(rewards + margin)}; refill it first`);

  let batches;
  if (args.pilot) {
    // one small delegator into each target, preferring the first source
    batches = targets.map((t) => {
      const forTarget = pending.filter((p) => p.to === t).sort((x, y) => (x.from - y.from) || (x.stake < y.stake ? -1 : 1));
      return forTarget.length ? [forTarget[0]] : null;
    }).filter(Boolean);
  } else {
    batches = [];
    const groups = new Map();
    for (const p of pending) {
      const key = `${p.from}:${p.to}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const key of [...groups.keys()].sort()) batches.push(...lib.chunks(groups.get(key), batchSize));
  }
  if (!batches.length) {
    console.log("\nNothing left to migrate.");
    return;
  }

  console.log(`\n── ${batches.length} ${args.pilot ? "pilot " : ""}transaction(s) ─────────────────────────────────`);
  const files = [];
  for (const [i, batch] of batches.entries()) {
    const { from, to } = batch[0];
    const addresses = batch.map((p) => p.address);
    const tx = { from: MAINNET.ADMIN, to: SM, data: IFACE.stakeManager.encodeFunctionData("forceMigrateMultipleDelegations", [from, to, addresses]) };
    Object.assign(tx, await lib.simulate(ctx, tx));
    const sum = batch.reduce((s, p) => s + p.stake, 0n);
    const name = `${args.pilot ? "pilot" : "migrate"}-${String(i + 1).padStart(2, "0")}-of-${batches.length}-from${from}-to${to}`;
    files.push(
      await lib.writeCalldata(ctx, name, tx, `StakeManager.forceMigrateMultipleDelegations(${from}, ${to}, [${addresses.length} delegators])`, {
        batch: i + 1,
        of: batches.length,
        fromValidatorId: from,
        toValidatorId: to,
        expectedSumWei: sum,
        delegators: batch.map((p) => ({ address: p.address, stakeWei: p.stake })),
      })
    );
    console.log(`  batch ${i + 1}/${batches.length}: ${from} → ${to}, ${addresses.length} delegators, ${fmt(sum)} BONE, gas ${tx.gasLimit}`);
  }
  console.log("\nSend one batch at a time. After each: node scripts/migration/3_migrateDelegations.js verify --tx <hash>" + (ctx.fork ? " --fork" : ""));
  console.log("Stop on any failure, DelegationForceMigrationFailed event or \"Out of gas\".");
}

async function verify(ctx, args) {
  if (!args.tx) throw new Error("Pass --tx <hash>");
  const alloc = fs.existsSync(args.allocation || DEFAULT_ALLOCATION) ? loadAllocation(args) : null;
  let mined;
  try {
    mined = await lib.loadMinedTx(ctx, args.tx, { from: MAINNET.ADMIN, to: SM });
  } catch (e) {
    if (/Out of gas/.test(e.message)) {
      console.error("\nThe batch reverted with \"Out of gas\": the contract reports any revert with EMPTY data that way,");
      console.error("including SafeMath underflows and bare requires. Re-run prepare with half the --batch-size to find the delegator.");
    }
    throw e;
  }
  const { tx, receipt, block, before } = mined;
  const call = IFACE.stakeManager.parseTransaction({ data: tx.data });
  if (!call || !call.name.startsWith("forceMigrate")) throw new Error("That transaction is not a force migration");
  const from = Number(call.args[0]);
  const to = Number(call.args[1]);
  const delegators = call.name === "forceMigrateMultipleDelegations" ? [...call.args[2]] : [call.args[2]];
  console.log(`\n── Verify batch: ${from} → ${to}, ${delegators.length} delegators ───────────────────`);

  const events = lib.parseLogs(receipt, IFACE.stakeManager, SM);
  const moved = new Map(events.filter((e) => e.name === "DelegationForceMigrated").map((e) => [e.args.delegator.toLowerCase(), e.args.amount]));
  const failed = events.filter((e) => e.name === "DelegationForceMigrationFailed");
  for (const f of failed) console.log(`  ✗ ${f.args.delegator}: ${lib.decodeRevert(f.args.reason)}`);

  const { sm, bone } = lib.contracts(ctx.provider);
  const fromShare = await shareOf(sm, from, before);
  const toShare = await shareOf(sm, to, before);
  const planned = new Map((alloc?.rows || []).filter((r) => r.from === from).map((r) => [r.address.toLowerCase(), r]));

  const problems = [];
  let sum = 0n;
  await mapLimit(delegators, 8, async (d) => {
    const key = d.toLowerCase();
    const [[sBefore], [sAfter], [tBefore], [tAfter]] = await Promise.all([
      fromShare.getTotalStake(d, { blockTag: before }),
      fromShare.getTotalStake(d, { blockTag: block }),
      toShare.getTotalStake(d, { blockTag: before }),
      toShare.getTotalStake(d, { blockTag: block }),
    ]);
    const amount = moved.get(key);
    const row = planned.get(key);
    if (alloc && !row) problems.push(`${d} is not in the allocation for validator ${from}`);
    if (row && row.to !== to) problems.push(`${d} was planned for validator ${row.to}, sent to ${to}`);
    if (amount === undefined) {
      // the contract emits nothing for zero stake, so a missing event is only fine if there was nothing to move
      if (sBefore !== 0n) problems.push(`${d}: no event, ${fmt(sBefore, 6)} BONE still on validator ${from}`);
      return;
    }
    sum += amount;
    if (amount !== sBefore) problems.push(`${d}: moved ${amount}, held ${sBefore} before`);
    if (sAfter !== 0n) problems.push(`${d}: ${sAfter} wei left on validator ${from}`);
    if (tAfter !== tBefore + amount) problems.push(`${d}: target stake ${tBefore} → ${tAfter}, expected +${amount}`);
    if (row && row.stakeWei !== amount) console.log(`  ~ ${d}: allocation said ${fmt(row.stakeWei, 6)}, moved ${fmt(amount, 6)}`);
  });

  const [vfB, vfA, vtB, vtA] = await Promise.all([
    sm.validators(from, { blockTag: before }),
    sm.validators(from, { blockTag: block }),
    sm.validators(to, { blockTag: before }),
    sm.validators(to, { blockTag: block }),
  ]);
  const [balB, balA] = await Promise.all([bone.balanceOf(SM, { blockTag: before }), bone.balanceOf(SM, { blockTag: block })]);
  const paid = lib
    .parseLogs(receipt, IFACE.erc20, MAINNET.BONE)
    .filter((e) => e.name === "Transfer" && e.args.from.toLowerCase() === SM.toLowerCase())
    .reduce((s, e) => s + e.args.value, 0n);

  console.log(`  moved ${moved.size} delegators, ${fmt(sum, 6)} BONE; failed ${failed.length}`);
  expectEq(`validator ${from} delegatedAmount dropped by the moved amount`, vfB.delegatedAmount - vfA.delegatedAmount, sum);
  expectEq(`validator ${to} delegatedAmount rose by the moved amount`, vtA.delegatedAmount - vtB.delegatedAmount, sum);
  if (balB - balA === paid) console.log(`  ✓ StakeManager BONE balance dropped by exactly the ${fmt(paid)} BONE of rewards paid in this tx`);
  // other users' claims in the same block also move this balance, so a mismatch is a warning, not a stop
  else console.log(`  ⚠️  StakeManager BONE balance dropped by ${fmt(balB - balA)}, this tx paid ${fmt(paid)}: check the other transactions in block ${block}`);
  console.log(`  · StakeManager now holds ${fmt(balA)} BONE`);

  if (problems.length || failed.length) {
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    throw new Error(`${problems.length} problem(s), ${failed.length} failed delegator(s): STOP and investigate before the next batch`);
  }
  console.log("  ✓ every delegator moved exactly its stake to the planned target, nothing left on the source");

  const gate = await lib.heimdallGate(ctx, [from, to]);
  console.log(gate.ok === false ? "\nL1 verified; wait for the Heimdall gate before the next batch." : "\n✅ Batch verified.");
}

async function status(ctx, args) {
  const alloc = loadAllocation(args);
  const json = alloc.file.endsWith(".json") ? JSON.parse(fs.readFileSync(alloc.file, "utf8")) : null;
  const { sm } = lib.contracts(ctx.provider);
  const b = ctx.blockTag;
  const sources = [...new Set(alloc.rows.map((r) => r.from))];
  const targets = [...new Set(alloc.rows.map((r) => r.to))];
  const shares = {};
  for (const id of [...sources, ...targets]) shares[id] = await shareOf(sm, id, b);

  const left = await mapLimit(alloc.rows, 8, async (r) => (await shares[r.from].getTotalStake(r.address, { blockTag: b }))[0]);
  const remaining = alloc.rows.filter((_, i) => left[i] > 0n);
  console.log(`\nPositions moved or emptied: ${alloc.rows.length - remaining.length}/${alloc.rows.length}`);

  console.log("\nsource   delegatedAmount     withdrawPool (claimable exits, stays)");
  let done = true;
  for (const id of sources) {
    const v = await sm.validators(id, { blockTag: b });
    const pool = await shares[id].withdrawPool({ blockTag: b });
    if (v.delegatedAmount !== 0n) done = false;
    console.log(`${String(id).padStart(6)}   ${fmt(v.delegatedAmount).padStart(15)}   ${fmt(pool).padStart(15)}`);
  }
  console.log("\ntarget   now (self+delegated)   planned after");
  for (const id of targets) {
    const v = await sm.validators(id, { blockTag: b });
    const plan = json?.targets?.find((t) => t.id === id);
    console.log(`${String(id).padStart(6)}   ${fmt(v.amount + v.delegatedAmount).padStart(20)}   ${plan ? fmt(BigInt(plan.afterWei)).padStart(13) : "-"}`);
  }
  console.log(done ? "\n✅ Sources hold no delegation. Next: handle any skipped delegators, then roll back (2_upgradeProxy.js prepare --rollback)." : `\n${remaining.length} position(s) still to move.`);
}

async function main() {
  const args = lib.parseArgs();
  const [command] = args._;
  if (!["prepare", "verify", "status"].includes(command)) throw new Error("Usage: 3_migrateDelegations.js prepare|verify|status [options]");
  const ctx = await lib.connect({ fork: Boolean(args.fork) });
  if (command === "prepare") await prepare(ctx, args);
  else if (command === "verify") await verify(ctx, args);
  else await status(ctx, args);
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
