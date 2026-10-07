/**
 * Heimdall gate: for each validator, the L1 StakingInfo nonce must equal Heimdall's nonce and the
 * L1 stake must equal Heimdall's power (or, for a removed validator, Heimdall must show an end
 * epoch). Heimdall applies L1 events strictly in nonce order, so one dropped event freezes that
 * validator's power while every L1-only check still passes. Run it before each step.
 *
 * Run:
 *   HEIMDALL_API=<heimdall rest url> node scripts/migration/heimdallGate.js 2,3,4,5,9,10,11
 */

const lib = require("./lib");

async function main() {
  const args = lib.parseArgs();
  const ids = String(args._[0] || "").split(",").filter(Boolean).map(Number);
  if (!ids.length) throw new Error("Pass validator ids, e.g. 2,3,4,5,9,10,11");
  if (!process.env.HEIMDALL_API) throw new Error("Set HEIMDALL_API to a Heimdall REST endpoint");
  const ctx = await lib.connect({ fork: Boolean(args.fork) });
  const { ok } = await lib.heimdallGate(ctx, ids);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
