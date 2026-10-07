/**
 * Step 2: Upgrade the StakeManager proxy (and the mandatory rollback afterwards)
 *
 * prepare: checks the proxy owner, the current implementation and the new implementation's
 *          codehash, simulates updateImplementation() from the admin and writes the calldata
 *          for the hardware wallet. Nothing is signed here.
 * verify:  after the admin has sent it, checks the mined tx: new implementation and codehash,
 *          and owner, epoch, validator count and total stake unchanged across the upgrade.
 *
 * Upgrade:
 *   node scripts/migration/2_upgradeProxy.js prepare --impl <new impl> --codehash <pinned runtime codehash>
 *   node scripts/migration/2_upgradeProxy.js verify --tx <hash>
 * Rollback to the pre-migration implementation (after the last batch):
 *   node scripts/migration/2_upgradeProxy.js prepare --rollback
 *   node scripts/migration/2_upgradeProxy.js verify --tx <hash>
 *
 * Add --fork to run against the local fork (FORK_RPC_URL).
 */

const lib = require("./lib");
const { ethers, MAINNET, IFACE, expectEq } = lib;

const SM = MAINNET.STAKE_MANAGER_PROXY;

// a call that only the migration build understands: it reverts with "Invalid migration"
// there, and with no reason at all on the live build, which has no such function
async function hasForceFunctions(ctx, blockTag) {
  const data = IFACE.stakeManager.encodeFunctionData("forceMigrateDelegation", [1, 1, ethers.ZeroAddress]);
  try {
    await ctx.provider.call({ from: MAINNET.ADMIN, to: SM, data, blockTag });
    return true;
  } catch (e) {
    return /Invalid migration/.test(lib.errorText(e));
  }
}

async function prepare(ctx, args) {
  const rollback = Boolean(args.rollback);
  const newImpl = rollback ? MAINNET.LIVE_IMPL : args.impl;
  const pinned = rollback ? MAINNET.LIVE_IMPL_CODEHASH : args.codehash;
  if (!newImpl || !ethers.isAddress(newImpl)) throw new Error("Pass --impl <address> (or --rollback)");
  if (!pinned || !/^0x[0-9a-fA-F]{64}$/.test(pinned)) throw new Error("Pass --codehash <runtime codehash pinned at review>");

  console.log(`── Pre-checks (${rollback ? "rollback" : "upgrade"}) ─────────────────────────────────────`);
  const owner = await lib.crossCheck(ctx, "proxy owner", (p, b) => lib.contracts(p).sm.owner({ blockTag: b }));
  expectEq("proxy owner", owner, MAINNET.ADMIN);
  const current = await lib.crossCheck(ctx, "implementation", (p, b) => lib.contracts(p).sm.implementation({ blockTag: b }));
  if (rollback) {
    if (current.toLowerCase() === MAINNET.LIVE_IMPL.toLowerCase()) throw new Error("Already on the pre-migration implementation; nothing to roll back");
    console.log(`  ✓ current implementation: ${current} (the migration build)`);
  } else if (current.toLowerCase() !== MAINNET.LIVE_IMPL.toLowerCase() && process.env.ALLOW_ANY_CURRENT !== "1") {
    throw new Error(`Current implementation is ${current}, expected ${MAINNET.LIVE_IMPL} (set ALLOW_ANY_CURRENT=1 if that is intended)`);
  } else {
    console.log(`  ✓ current implementation: ${current}`);
  }
  const codehash = await lib.crossCheck(ctx, "new implementation codehash", async (p, b) => {
    const code = await p.getCode(newImpl, b);
    if (code === "0x") throw new Error(`${newImpl} has no code`);
    return ethers.keccak256(code);
  });
  expectEq("new implementation codehash", codehash, pinned);

  const tx = { from: MAINNET.ADMIN, to: SM, data: IFACE.stakeManager.encodeFunctionData("updateImplementation", [newImpl]) };
  Object.assign(tx, await lib.simulate(ctx, tx));
  console.log(`  ✓ simulation from the admin succeeds`);

  const { sm } = lib.contracts(ctx.provider);
  await lib.writeCalldata(ctx, rollback ? "rollback-stakemanager" : "upgrade-stakemanager", tx, `StakeManagerProxy.updateImplementation(${newImpl})`, {
    rollback,
    expect: {
      implementation: newImpl,
      codehash: pinned,
      owner,
      currentEpoch: await sm.currentEpoch({ blockTag: ctx.blockTag }),
      validatorSetSize: await sm.currentValidatorSetSize({ blockTag: ctx.blockTag }),
    },
  });
  console.log(`\nAfter it is mined: node scripts/migration/2_upgradeProxy.js verify --tx <hash>${ctx.fork ? " --fork" : ""}`);
}

async function verify(ctx, args) {
  if (!args.tx) throw new Error("Pass --tx <hash>");
  const { tx, block, before } = await lib.loadMinedTx(ctx, args.tx, { from: MAINNET.ADMIN, to: SM });
  const call = IFACE.stakeManager.parseTransaction({ data: tx.data });
  if (!call || call.name !== "updateImplementation") throw new Error("That transaction is not updateImplementation()");
  const newImpl = call.args[0];
  const rollback = newImpl.toLowerCase() === MAINNET.LIVE_IMPL.toLowerCase();
  const { sm } = lib.contracts(ctx.provider);

  console.log(`\n── Verify ${rollback ? "rollback" : "upgrade"} ───────────────────────────────────────`);
  expectEq("implementation()", await sm.implementation({ blockTag: block }), newImpl);
  const codehash = ethers.keccak256(await ctx.provider.getCode(newImpl, block));
  if (rollback) expectEq("implementation codehash", codehash, MAINNET.LIVE_IMPL_CODEHASH);
  else if (args.codehash) expectEq("implementation codehash", codehash, args.codehash);
  else console.log(`  · implementation codehash ${codehash} (pass --codehash to compare with the pinned value)`);

  for (const [label, read] of [
    ["owner()", (b) => sm.owner({ blockTag: b })],
    ["currentEpoch()", (b) => sm.currentEpoch({ blockTag: b })],
    ["currentValidatorSetSize()", (b) => sm.currentValidatorSetSize({ blockTag: b })],
    ["currentValidatorSetTotalStake()", (b) => sm.currentValidatorSetTotalStake({ blockTag: b })],
  ]) {
    expectEq(`${label} unchanged across the upgrade`, String(await read(block)), String(await read(before)));
  }

  const present = await hasForceFunctions(ctx, block);
  if (rollback) {
    if (present) throw new Error("Force-migration functions still answer after the rollback");
    console.log("  ✓ force-migration functions are gone (calls revert)");
  } else {
    if (!present) throw new Error("Force-migration functions are not available on the new implementation");
    console.log("  ✓ force-migration functions are available");
  }
  console.log(`\n✅ ${rollback ? "Rollback" : "Upgrade"} verified.`);
}

async function main() {
  const args = lib.parseArgs();
  const [command] = args._;
  if (!["prepare", "verify"].includes(command)) throw new Error("Usage: 2_upgradeProxy.js prepare|verify [options]");
  const ctx = await lib.connect({ fork: Boolean(args.fork) });
  if (command === "prepare") await prepare(ctx, args);
  else await verify(ctx, args);
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
