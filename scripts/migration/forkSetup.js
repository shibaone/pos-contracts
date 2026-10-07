/**
 * Fork rehearsal: checks the local fork and prints the full sequence to run against it.
 *
 * The rehearsal runs exactly what the hardware wallet will sign: every prepare step writes a
 * calldata file, forkExecute.js sends it as the admin on the fork, and the matching verify step
 * checks the result. Nothing changes ownership.
 *
 * Start a fork first:
 *   anvil --fork-url $MAINNET_RPC_URL --fork-block-number <block>
 * Then:
 *   node scripts/migration/forkSetup.js --from 9,10 --to 11,3,2,4,5
 */

const lib = require("./lib");
const { MAINNET, fmt } = lib;

const STATUS = ["Inactive", "Active", "Locked", "Unstaked"];

async function main() {
  const args = lib.parseArgs();
  const from = String(args.from || "").split(",").filter(Boolean).map(Number);
  const to = String(args.to || "").split(",").filter(Boolean).map(Number);
  const ctx = await lib.connect({ fork: true });
  const { sm } = lib.contracts(ctx.provider);

  console.log("StakeManager proxy: ", MAINNET.STAKE_MANAGER_PROXY);
  console.log("implementation:     ", await sm.implementation());
  console.log("proxy owner:        ", await sm.owner());
  console.log("currentEpoch:       ", String(await sm.currentEpoch()));
  for (const id of [...from, ...to]) {
    const v = await sm.validators(id);
    console.log(`validator ${String(id).padStart(2)}: ${STATUS[Number(v.status)].padEnd(8)} isValidator ${String(await sm.isValidator(id)).padEnd(5)} self ${fmt(v.amount).padStart(10)}  delegated ${fmt(v.delegatedAmount).padStart(14)}`);
  }

  const f = "--fork";
  const x = "node scripts/migration/forkExecute.js scripts/migration/out/<file>.json";
  console.log(`
Rehearsal sequence (after each forkExecute, run the step's verify with the printed hash and ${f}):
  1. npx hardhat run scripts/migration/1_deployStakeManager.js --network localhost
  2. node scripts/migration/2_upgradeProxy.js prepare --impl <impl> --codehash <codehash> ${f}      then ${x}
  3. node scripts/migration/2a_stopAuctions.js prepare ${f}                                         then ${x}
  4. node scripts/migration/2b_forceUnstakeValidator.js prepare --validator <id> --impl <impl> ${f} (each source) then ${x}
  5. node scripts/migration/0b_buildAllocation.js --from ${from.join(",") || "<ids>"} --to ${to.join(",") || "<ids>"} --block <fork block>   (on mainnet: same rows as the fork)
  6. node scripts/migration/3_migrateDelegations.js prepare --pilot ${f}, then prepare ${f}         then ${x} per batch
  7. node scripts/migration/3_migrateDelegations.js status ${f}
  8. node scripts/migration/2_upgradeProxy.js prepare --rollback ${f}                               then ${x}`);
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
