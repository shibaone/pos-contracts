/**
 * Step 2b: Force-unstake a validator via Governance
 *
 * forceUnstake() does not check whether the validator is already unstaking. A second unstake
 * subtracts its stake from the active total again, decrements the validator count again and,
 * because _removeSigner cannot find the signer, drops signers[0]. Nothing on-chain prevents it,
 * so this script enforces the guard:
 *   - prepare refuses unless the validator is active with deactivationEpoch == 0, its signer is in
 *     the signer list, it has no auction bid and auctions are stopped (run 2a first);
 *   - verify confirms exactly one UnstakeInit for the validator and that the validator count and
 *     total stake dropped exactly once.
 *
 * The operator's own unstake() requires deactivationEpoch == 0, so once forceUnstake lands it cannot
 * unstake again; the only race is the operator unstaking just before our tx is included.
 *
 * Rules for the signer: run prepare immediately before signing; send through a private relay
 * (e.g. Flashbots Protect); sign once; to speed it up, replace it with the SAME nonce, never a new one.
 * If prepare finds deactivationEpoch != 0 (the operator unstaked first), do NOT send forceUnstake.
 *
 * Run:
 *   node scripts/migration/2b_forceUnstakeValidator.js prepare --validator <id> [--impl <expected implementation>]
 *   node scripts/migration/2b_forceUnstakeValidator.js verify --tx <hash>
 *
 * Add --fork to run against the local fork (FORK_RPC_URL).
 */

const lib = require("./lib");
const { ethers, MAINNET, IFACE, expectEq, fmt } = lib;

// read signers[] until it ends rather than trusting currentValidatorSetSize(): the two only
// disagree after exactly the double unstake this script guards against
async function signerList(sm, blockTag) {
  const out = [];
  for (let i = 0n; i < 1000n; i++) {
    try {
      out.push(await sm.signers(i, { blockTag }));
    } catch (_) {
      break;
    }
  }
  return out;
}

async function prepare(ctx, args) {
  const id = Number(args.validator);
  if (!id) throw new Error("Pass --validator <id>");
  const b = ctx.blockTag;

  console.log(`── Pre-checks: forceUnstake(${id}) ─────────────────────────────`);
  expectEq("StakeManager owner", await lib.crossCheck(ctx, "owner", (p, t) => lib.contracts(p).sm.owner({ blockTag: t })), MAINNET.ADMIN);
  expectEq("Governance owner", await lib.crossCheck(ctx, "Governance owner", (p, t) => lib.contracts(p).gov.owner({ blockTag: t })), MAINNET.ADMIN);
  const impl = await lib.crossCheck(ctx, "implementation", (p, t) => lib.contracts(p).sm.implementation({ blockTag: t }));
  const allowed = [MAINNET.LIVE_IMPL, args.impl].filter(Boolean).map((a) => a.toLowerCase());
  if (!allowed.includes(impl.toLowerCase())) throw new Error(`Implementation is ${impl}; expected ${allowed.join(" or ")} (pass --impl after the upgrade)`);
  console.log(`  ✓ implementation: ${impl}`);

  const state = await lib.crossCheck(ctx, `validator ${id}`, async (p, t) => {
    const sm = lib.contracts(p).sm;
    const [isVal, v, auction, epoch, cooldown] = await Promise.all([
      sm.isValidator(id, { blockTag: t }),
      sm.validators(id, { blockTag: t }),
      sm.validatorAuction(id, { blockTag: t }),
      sm.currentEpoch({ blockTag: t }),
      sm.replacementCoolDown({ blockTag: t }),
    ]);
    return { isVal, deactivationEpoch: v.deactivationEpoch, status: v.status, signer: v.signer, amount: v.amount, delegated: v.delegatedAmount, reward: v.reward, bid: auction.amount, epoch, cooldown };
  });
  expectEq("isValidator", state.isVal, true);
  expectEq("deactivationEpoch (must be 0, else it is already unstaking: do NOT send)", state.deactivationEpoch, 0n);
  expectEq("auction bid", state.bid, 0n);
  if (!(state.cooldown > state.epoch)) throw new Error(`Auctions are open (replacementCoolDown ${state.cooldown} <= currentEpoch ${state.epoch}); run 2a_stopAuctions.js first`);
  console.log(`  ✓ auctions stopped (replacementCoolDown ${state.cooldown} > currentEpoch ${state.epoch})`);

  const { sm } = lib.contracts(ctx.provider);
  const size = await sm.currentValidatorSetSize({ blockTag: b });
  const signers = await signerList(sm, b);
  expectEq("signers[] length matches currentValidatorSetSize", BigInt(signers.length), size);
  const index = signers.findIndex((s) => s.toLowerCase() === state.signer.toLowerCase());
  if (index < 0) throw new Error(`Signer ${state.signer} is not in signers[]; forceUnstake would drop signers[0] (${signers[0]})`);
  console.log(`  ✓ signer ${state.signer} is signers[${index}] of ${size}`);

  const total = await sm.currentValidatorSetTotalStake({ blockTag: b });
  const stake = state.amount + state.delegated;
  console.log(`  · removes ${fmt(stake)} BONE (self ${fmt(state.amount)}, delegated ${fmt(state.delegated)}) of ${fmt(total)} active stake`);
  console.log(`  · pays ${fmt(state.reward)} BONE of accrued validator rewards to the validator's NFT owner`);

  const inner = IFACE.stakeManager.encodeFunctionData("forceUnstake", [id]);
  const tx = { from: MAINNET.ADMIN, to: MAINNET.GOVERNANCE_PROXY, data: IFACE.governance.encodeFunctionData("update", [MAINNET.STAKE_MANAGER_PROXY, inner]) };
  Object.assign(tx, await lib.simulate(ctx, tx));
  console.log("  ✓ simulation from the admin succeeds");

  await lib.writeCalldata(ctx, `force-unstake-${id}`, tx, `Governance.update(StakeManager, forceUnstake(${id}))`, {
    validatorId: id,
    before: { validatorSetSize: size, totalStake: total, validatorStake: stake, signers0: signers[0], rewardPaidToOwner: state.reward },
  });
  console.log("\nSign once, send through a private relay, and replace only with the same nonce.");
  console.log(`After it is mined: node scripts/migration/2b_forceUnstakeValidator.js verify --tx <hash>${ctx.fork ? " --fork" : ""}`);
}

async function verify(ctx, args) {
  if (!args.tx) throw new Error("Pass --tx <hash>");
  const { tx, receipt, block, before } = await lib.loadMinedTx(ctx, args.tx, { from: MAINNET.ADMIN, to: MAINNET.GOVERNANCE_PROXY });
  const outer = IFACE.governance.parseTransaction({ data: tx.data });
  const inner = IFACE.stakeManager.parseTransaction({ data: outer.args.data });
  if (inner?.name !== "forceUnstake") throw new Error("That transaction is not Governance.update(StakeManager, forceUnstake(id))");
  const id = Number(inner.args[0]);
  const { sm, info } = lib.contracts(ctx.provider);

  console.log(`\n── Verify forceUnstake(${id}) ─────────────────────────────────`);
  const inits = lib.parseLogs(receipt, IFACE.stakingInfo, MAINNET.STAKING_INFO).filter((e) => e.name === "UnstakeInit" && Number(e.args.validatorId) === id);
  expectEq("UnstakeInit events in this tx", inits.length, 1);

  // A second unstake (the operator's own, a re-sent tx, an auction) is the corruption case. unstake()
  // needs deactivationEpoch == 0, so it can only come BEFORE ours: either in an earlier block (then the
  // validator was already unstaking just before our block) or earlier in our own block.
  const topic = IFACE.stakingInfo.getEvent("UnstakeInit").topicHash;
  const idTopic = ethers.zeroPadValue(ethers.toBeHex(id), 32);
  const inBlock = await ctx.provider.getLogs({ address: MAINNET.STAKING_INFO, topics: [topic, null, idTopic], fromBlock: block, toBlock: block });
  expectEq(`UnstakeInit events for validator ${id} in block ${block}`, inBlock.length, 1);

  const [vBefore, vAfter, epoch, isVal] = await Promise.all([
    sm.validators(id, { blockTag: before }),
    sm.validators(id, { blockTag: block }),
    sm.currentEpoch({ blockTag: block }),
    sm.isValidator(id, { blockTag: block }),
  ]);
  expectEq("deactivationEpoch was 0 right before this block (not unstaked twice)", vBefore.deactivationEpoch, 0n);
  expectEq("isValidator after", isVal, false);
  expectEq("deactivationEpoch == currentEpoch", vAfter.deactivationEpoch, epoch);

  const [sizeBefore, sizeAfter, totalBefore, totalAfter] = await Promise.all([
    sm.currentValidatorSetSize({ blockTag: before }),
    sm.currentValidatorSetSize({ blockTag: block }),
    sm.currentValidatorSetTotalStake({ blockTag: before }),
    sm.currentValidatorSetTotalStake({ blockTag: block }),
  ]);
  expectEq("validator count dropped by exactly 1", sizeAfter, sizeBefore - 1n);
  expectEq("active stake dropped by exactly the validator's stake", totalAfter, totalBefore - (vBefore.amount + vBefore.delegatedAmount));

  const signersBefore = await signerList(sm, before);
  const signersAfter = await signerList(sm, block);
  const removed = vBefore.signer.toLowerCase();
  const expected = signersBefore.filter((s) => s.toLowerCase() !== removed).map((s) => s.toLowerCase()).sort();
  const sameSet = JSON.stringify(signersAfter.map((s) => s.toLowerCase()).sort()) === JSON.stringify(expected);
  expectEq(`signer set is the previous ${signersBefore.length} minus this validator's signer`, sameSet, true);
  console.log(`  · L1 nonce for validator ${id} is now ${await info.validatorNonce(id, { blockTag: block })}`);

  await lib.heimdallGate(ctx, [id]);
  console.log(`\n✅ forceUnstake(${id}) verified on L1. Heimdall follows in ~3-5 checkpoints: re-run the gate before migrating.`);
}

async function main() {
  const args = lib.parseArgs();
  const [command] = args._;
  if (!["prepare", "verify"].includes(command)) throw new Error("Usage: 2b_forceUnstakeValidator.js prepare|verify [options]");
  const ctx = await lib.connect({ fork: Boolean(args.fork) });
  if (command === "prepare") await prepare(ctx, args);
  else await verify(ctx, args);
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
