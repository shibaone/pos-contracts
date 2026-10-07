/**
 * Step 2a: Stop validator auctions before any forceUnstake
 *
 * Auctions are open whenever replacementCoolDown <= currentEpoch, and startAuction /
 * dethroneAndStake do not check the whitelist. A pending bid on a validator being closed could
 * also unstake it a second time. stopAuctions(n) sets replacementCoolDown = currentEpoch + n;
 * n = 1,000,000,000 keeps auctions off for good. updateDynastyValue resets it, so re-run this
 * after any dynasty change.
 *
 * Run:
 *   node scripts/migration/2a_stopAuctions.js prepare [--checkpoints 1000000000]
 *   node scripts/migration/2a_stopAuctions.js verify --tx <hash>
 *
 * Add --fork to run against the local fork (FORK_RPC_URL).
 */

const lib = require("./lib");
const { MAINNET, IFACE, expectEq } = lib;

const DEFAULT_CHECKPOINTS = 1_000_000_000n;

async function prepare(ctx, args) {
  const n = BigInt(args.checkpoints || DEFAULT_CHECKPOINTS);
  console.log("── Pre-checks ──────────────────────────────────────────────────");
  expectEq("Governance owner", await lib.crossCheck(ctx, "Governance owner", (p, b) => lib.contracts(p).gov.owner({ blockTag: b })), MAINNET.ADMIN);
  expectEq("StakeManager governance", await lib.crossCheck(ctx, "governance", (p, b) => lib.contracts(p).sm.governance({ blockTag: b })), MAINNET.GOVERNANCE_PROXY);
  const { sm } = lib.contracts(ctx.provider);
  const [epoch, cooldown] = await Promise.all([sm.currentEpoch({ blockTag: ctx.blockTag }), sm.replacementCoolDown({ blockTag: ctx.blockTag })]);
  console.log(`  · currentEpoch ${epoch}, replacementCoolDown ${cooldown} (auctions ${cooldown > epoch ? "already stopped" : "OPEN"})`);

  const inner = IFACE.stakeManager.encodeFunctionData("stopAuctions", [n]);
  const tx = { from: MAINNET.ADMIN, to: MAINNET.GOVERNANCE_PROXY, data: IFACE.governance.encodeFunctionData("update", [MAINNET.STAKE_MANAGER_PROXY, inner]) };
  Object.assign(tx, await lib.simulate(ctx, tx));
  console.log("  ✓ simulation from the admin succeeds");
  await lib.writeCalldata(ctx, "stop-auctions", tx, `Governance.update(StakeManager, stopAuctions(${n}))`, { checkpoints: n });
  console.log(`\nAfter it is mined: node scripts/migration/2a_stopAuctions.js verify --tx <hash>${ctx.fork ? " --fork" : ""}`);
}

async function verify(ctx, args) {
  if (!args.tx) throw new Error("Pass --tx <hash>");
  const { tx, block } = await lib.loadMinedTx(ctx, args.tx, { from: MAINNET.ADMIN, to: MAINNET.GOVERNANCE_PROXY });
  const outer = IFACE.governance.parseTransaction({ data: tx.data });
  const inner = IFACE.stakeManager.parseTransaction({ data: outer.args.data });
  if (inner?.name !== "stopAuctions") throw new Error("That transaction is not Governance.update(StakeManager, stopAuctions(n))");
  const n = inner.args[0];
  const { sm } = lib.contracts(ctx.provider);
  const [epoch, cooldown] = await Promise.all([sm.currentEpoch({ blockTag: block }), sm.replacementCoolDown({ blockTag: block })]);
  console.log("\n── Verify ──────────────────────────────────────────────────────");
  expectEq("replacementCoolDown == currentEpoch + n", cooldown, epoch + n);
  console.log("\n✅ Auctions stopped.");
}

async function main() {
  const args = lib.parseArgs();
  const [command] = args._;
  if (!["prepare", "verify"].includes(command)) throw new Error("Usage: 2a_stopAuctions.js prepare|verify [options]");
  const ctx = await lib.connect({ fork: Boolean(args.fork) });
  if (command === "prepare") await prepare(ctx, args);
  else await verify(ctx, args);
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
