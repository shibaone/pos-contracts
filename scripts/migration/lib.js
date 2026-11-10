/**
 * Shared helpers for the validator-closure scripts (0b, 2, 2a, 2b, 3, heimdallGate, forkExecute).
 *
 * None of these scripts sign a mainnet transaction. Each admin call is checked, simulated
 * from the admin wallet and written to a calldata file under scripts/migration/out/. The
 * admin reviews it and signs it on the hardware wallet with exactly the nonce in the file,
 * before its expiry block; after it is mined, the same script re-checks the result with
 * `verify --tx <hash> --file <calldata file>`. forkExecute.js replays the same calldata files
 * on a local fork, so a rehearsal runs exactly what will be signed.
 *
 * A calldata file pins the signer nonce, so the same file can never be mined twice: a second
 * send with that nonce only replaces the first. Files written by one prepare run get consecutive
 * nonces; send them in order, and re-run prepare if any other admin transaction goes in between.
 *
 * On mainnet, a step that changes validator stake (2b, 3) only counts as verified when the
 * Heimdall gate is green for the validators it touched; otherwise verify exits with code 2.
 *
 * Environment (.env):
 *   MAINNET_RPC_URL     primary RPC (required unless --fork)
 *   SECOND_RPC_URL      independent provider; critical reads must match it (required on mainnet
 *                       unless ALLOW_SINGLE_RPC=1)
 *   FORK_RPC_URL        local anvil/hardhat fork for --fork (default http://127.0.0.1:8545)
 *   HEIMDALL_API        Heimdall REST endpoint for the Heimdall gate (required to verify on mainnet)
 *   ETHERSCAN_API_KEY   optional, speeds up event scans in 0b_buildAllocation.js
 *   MAX_FEE_GWEI        max fee printed with each calldata file (default 30)
 *   MIN_MARGIN_BONE     BONE StakeManager must hold beyond everything it owes (default 50000)
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const MAINNET = {
  STAKE_MANAGER_PROXY: "0x65218A41Fb92637254B4f8c97448d3dF343A3064",
  GOVERNANCE_PROXY: "0xC476E20c2F7FA3B35aC242aBE71B59e902242f06",
  STAKING_INFO: "0x539964b3d225194717fb896D26c8b3E635b8A1aE",
  BONE: "0x9813037ee2218799597d83D4a5B6F3b6778218d9",
  // proxy owner of StakeManager and owner of Governance: the hardware wallet that signs everything
  ADMIN: "0xBab4F3e701F6d2e009Af3C7f1eF2e7dD68225E96",
  // implementation live before this operation; the proxy goes back to it when the migration is done
  LIVE_IMPL: "0x269C0ebb7a39995dB531Ccd61D015e431530b87A",
  LIVE_IMPL_CODEHASH: "0x8c1e6ae90322d08be42e195f31cad8d23fd2d224858132c9fbef89f99114c908",
  // runtime codehash of the reviewed migration build (StakeManager.sol as of 8dee45da, solc 0.5.17,
  // optimizer 200). Changing the build means changing this constant in a reviewed commit.
  REVIEWED_IMPL_CODEHASH: "0xe75e716f3f6bc6a8396f95c2798b0f915b72225004066babf0ef15ea9096ba06",
  // allocationHash() of the reviewed allocation. 0b_buildAllocation.js prints it; once the allocation
  // is reviewed, set it here in a reviewed commit. Step 3 refuses to run on mainnet without it.
  REVIEWED_ALLOCATION_HASH: "",
};

// how long a calldata file stays valid, in blocks (~12 s each)
const EXPIRY_BLOCKS = { short: 300, session: 3600 };

// EIP-7825 caps a transaction at 2^24 gas; stay clearly below it
const GAS_LIMIT_MAX = 16_000_000n;
const GAS_BUFFER_PCT = 120n;

const ABI = {
  stakeManager: [
    "function owner() view returns (address)",
    "function implementation() view returns (address)",
    "function governance() view returns (address)",
    "function currentEpoch() view returns (uint256)",
    "function replacementCoolDown() view returns (uint256)",
    "function delegationEnabled() view returns (bool)",
    "function isValidator(uint256) view returns (bool)",
    "function currentValidatorSetSize() view returns (uint256)",
    "function currentValidatorSetTotalStake() view returns (uint256)",
    "function NFTCounter() view returns (uint256)",
    "function signers(uint256) view returns (address)",
    "function signerToValidator(address) view returns (uint256)",
    "function validators(uint256) view returns (uint256 amount, uint256 reward, uint256 activationEpoch, uint256 deactivationEpoch, uint256 jailTime, address signer, address contractAddress, uint8 status, uint256 commissionRate, uint256 lastCommissionUpdate, uint256 delegatorsReward, uint256 delegatedAmount, uint256 initialRewardPerStake)",
    "function validatorAuction(uint256) view returns (uint256 amount, uint256 startEpoch, address user, bool acceptDelegation, bytes signerPubkey)",
    "function blacklist(address) view returns (bool depositBlocked, bool withdrawBlocked)",
    "function forceUnstake(uint256 validatorId)",
    "function stopAuctions(uint256 forNCheckpoints)",
    "function updateImplementation(address newImplementation)",
    "function forceMigrateDelegation(uint256 fromValidatorId, uint256 toValidatorId, address delegator)",
    "function forceMigrateMultipleDelegations(uint256 fromValidatorId, uint256 toValidatorId, address[] delegators)",
    "event DelegationForceMigrated(uint256 indexed fromValidatorId, uint256 indexed toValidatorId, address indexed delegator, uint256 amount)",
    "event DelegationForceMigrationFailed(uint256 indexed fromValidatorId, uint256 indexed toValidatorId, address indexed delegator, bytes reason)",
  ],
  governance: [
    "function owner() view returns (address)",
    "function update(address target, bytes data)",
  ],
  share: [
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function getTotalStake(address user) view returns (uint256, uint256)",
    "function getLiquidRewards(address user) view returns (uint256)",
    "function unbonds(address) view returns (uint256 shares, uint256 withdrawEpoch)",
    "function locked() view returns (bool)",
    "function delegation() view returns (bool)",
    "function withdrawPool() view returns (uint256)",
    "function activeAmount() view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ],
  stakingInfo: [
    "function validatorNonce(uint256) view returns (uint256)",
    "event UnstakeInit(address indexed user, uint256 indexed validatorId, uint256 nonce, uint256 deactivationEpoch, uint256 indexed amount)",
    "event StakeUpdate(uint256 indexed validatorId, uint256 indexed nonce, uint256 indexed newAmount)",
  ],
  erc20: [
    "function balanceOf(address) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ],
};

const IFACE = Object.fromEntries(Object.entries(ABI).map(([k, v]) => [k, new ethers.Interface(v)]));

// ── formatting ────────────────────────────────────────────────────────────────

const fmt = (wei, digits = 2) =>
  Number(ethers.formatUnits(wei, 18)).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const json = (value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// runs fn over items with at most `limit` calls in flight; remote RPCs time out on hundreds of serial calls
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function decodeRevert(data) {
  if (!data || data === "0x") {
    return "empty revert data (a bare require, OpenZeppelin 2.2 SafeMath, or out of gas)";
  }
  if (data.startsWith("0x08c379a0")) {
    return ethers.AbiCoder.defaultAbiCoder().decode(["string"], ethers.dataSlice(data, 4))[0];
  }
  return `custom revert ${data.slice(0, 10)}`;
}

function errorText(e) {
  const data = e?.data || e?.info?.error?.data || e?.error?.data;
  if (typeof data === "string") return decodeRevert(data);
  return e?.shortMessage || e?.message || String(e);
}

// ── providers ─────────────────────────────────────────────────────────────────

// methods that change state are never retried, so a flaky connection cannot send anything twice
const NO_RETRY = new Set(["eth_sendTransaction", "eth_sendRawTransaction", "anvil_impersonateAccount", "anvil_setBalance", "hardhat_impersonateAccount", "hardhat_setBalance"]);
const TRANSPORT_ERROR = /TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|502|503|504|429|rate limit/i;
// upstream failures that come back as a JSON-RPC error rather than a thrown one: a fork that could
// not fetch state, or a rate-limited provider. ethers reports any eth_call error as "missing revert
// data", so without this a flaky fork looks like a revert. Limits that never pass are not retried.
const UPSTREAM_ERROR = /Fork Error|Transport|HttpError|backend|timed? ?out|rate limit|too many requests|429|502|503|504/i;
const PERMANENT_ERROR = /not supported|block range|ranges? over|too large|response size/i;

class RetryingProvider extends ethers.JsonRpcProvider {
  async _send(payload) {
    const methods = (Array.isArray(payload) ? payload : [payload]).map((p) => p.method);
    const retryable = methods.every((m) => !NO_RETRY.has(m));
    const wait = (attempt) => new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    for (let attempt = 0; ; attempt++) {
      let results;
      try {
        results = await super._send(payload);
      } catch (e) {
        if (!retryable || attempt >= 5 || !TRANSPORT_ERROR.test(`${e.code} ${e.message}`)) throw e;
        await wait(attempt);
        continue;
      }
      const upstream = results.some((r) => {
        const text = `${r.error?.code} ${r.error?.message}`;
        return r.error && UPSTREAM_ERROR.test(text) && !PERMANENT_ERROR.test(text);
      });
      if (!upstream || !retryable || attempt >= 5) return results;
      await wait(attempt);
    }
  }
}

function makeProvider(url) {
  // batching off: free RPC tiers reject large JSON-RPC batches
  return new RetryingProvider(url, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}

/**
 * Connects to mainnet (pinned to chainId 1, cross-checked against SECOND_RPC_URL) or, with
 * fork=true, to a local anvil/hardhat fork. Reads are pinned to ctx.blockTag so both providers
 * answer for the same block.
 */
async function connect({ fork = false } = {}) {
  const url = fork ? process.env.FORK_RPC_URL || "http://127.0.0.1:8545" : process.env.MAINNET_RPC_URL;
  if (!url) throw new Error("Set MAINNET_RPC_URL in .env, or pass --fork to use a local fork");
  const provider = makeProvider(url);
  const { chainId } = await provider.getNetwork();
  const client = await provider.send("web3_clientVersion", []).catch(() => "");
  const isLocal = /anvil|hardhat/i.test(client);

  if (fork && !isLocal) throw new Error(`--fork expects a local anvil or hardhat node, got "${client}"`);
  if (!fork && isLocal) throw new Error(`MAINNET_RPC_URL points at a local node ("${client}"); use --fork for rehearsals`);
  if (!fork && chainId !== 1n) throw new Error(`MAINNET_RPC_URL is chainId ${chainId}, expected 1`);
  if ((await provider.getCode(MAINNET.STAKE_MANAGER_PROXY)) === "0x") {
    throw new Error("StakeManager proxy has no code on this RPC");
  }

  let second = null;
  if (!fork) {
    if (process.env.SECOND_RPC_URL) {
      second = makeProvider(process.env.SECOND_RPC_URL);
      const c2 = (await second.getNetwork()).chainId;
      if (c2 !== 1n) throw new Error(`SECOND_RPC_URL is chainId ${c2}, expected 1`);
    } else if (process.env.ALLOW_SINGLE_RPC !== "1") {
      throw new Error("Set SECOND_RPC_URL to an independent provider (or ALLOW_SINGLE_RPC=1 to skip the cross-check)");
    } else {
      console.log("⚠️  ALLOW_SINGLE_RPC=1: critical reads are NOT cross-checked against a second provider");
    }
  }

  const head = await provider.getBlockNumber();
  // a couple of blocks behind head, so the second provider has the block too
  const blockTag = fork ? head : head - 2;
  const label = fork ? `FORK (${client.split("/")[0]}, chainId ${chainId})` : "MAINNET";
  console.log(`Network: ${label} | reads pinned to block ${blockTag}${second ? " | cross-checked against SECOND_RPC_URL" : ""}\n`);
  return { provider, second, fork, blockTag, label, chainId };
}

function contracts(provider) {
  return {
    sm: new ethers.Contract(MAINNET.STAKE_MANAGER_PROXY, ABI.stakeManager, provider),
    gov: new ethers.Contract(MAINNET.GOVERNANCE_PROXY, ABI.governance, provider),
    info: new ethers.Contract(MAINNET.STAKING_INFO, ABI.stakingInfo, provider),
    bone: new ethers.Contract(MAINNET.BONE, ABI.erc20, provider),
    share: (address) => new ethers.Contract(address, ABI.share, provider),
  };
}

/** Runs read(provider, blockTag) on both providers and throws if they disagree. */
async function crossCheck(ctx, label, read) {
  const a = await read(ctx.provider, ctx.blockTag);
  if (ctx.second) {
    const b = await read(ctx.second, ctx.blockTag);
    if (json(a) !== json(b)) {
      throw new Error(`${label}: providers disagree at block ${ctx.blockTag}\n  primary: ${json(a)}\n  second:  ${json(b)}`);
    }
  }
  return a;
}

/** Fails unless value === expected, with a readable message. */
function expectEq(label, value, expected) {
  const ok = typeof value === "string" && typeof expected === "string" ? value.toLowerCase() === expected.toLowerCase() : value === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${value}${ok ? "" : `  (expected ${expected})`}`);
  if (!ok) throw new Error(`${label} is ${value}, expected ${expected}`);
}

// ── transactions for the hardware wallet ──────────────────────────────────────

async function feeSuggestion(provider) {
  const fee = await provider.getFeeData();
  const cap = ethers.parseUnits(process.env.MAX_FEE_GWEI || "30", "gwei");
  const maxFeePerGas = fee.maxFeePerGas && fee.maxFeePerGas < cap ? fee.maxFeePerGas : cap;
  const priority = fee.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei");
  return { maxFeePerGas, maxPriorityFeePerGas: priority < maxFeePerGas ? priority : maxFeePerGas, capped: fee.maxFeePerGas > cap };
}

/** Simulates tx from its sender and returns a gas limit with a 20% buffer; never falls back to a guess. */
async function simulate(ctx, tx) {
  try {
    await ctx.provider.call({ from: tx.from, to: tx.to, data: tx.data });
  } catch (e) {
    throw new Error(`Simulation from ${tx.from} reverted: ${errorText(e)}`);
  }
  let estimate;
  try {
    estimate = await ctx.provider.estimateGas({ from: tx.from, to: tx.to, data: tx.data });
  } catch (e) {
    throw new Error(`Gas estimation failed, refusing to continue: ${errorText(e)}`);
  }
  const gasLimit = (estimate * GAS_BUFFER_PCT) / 100n;
  if (gasLimit >= GAS_LIMIT_MAX) {
    throw new Error(`Gas limit ${gasLimit} would reach the ${GAS_LIMIT_MAX} cap; use a smaller batch`);
  }
  return { estimate, gasLimit };
}

const OUT_DIR = path.join(__dirname, "out");

// The signer nonce for the next calldata file of this run. The first file takes the nonce at the
// pinned block, which must also be the latest and the pending nonce (nothing in flight, nothing
// mined since the reads); each further file of the same run takes the next one.
async function nextNonce(ctx, from) {
  if (ctx.nonce === undefined) {
    const at = await crossCheck(ctx, "signer nonce", (p, t) => p.getTransactionCount(from, t));
    const [latest, pending] = await Promise.all([ctx.provider.getTransactionCount(from, "latest"), ctx.provider.getTransactionCount(from, "pending")]);
    if (latest !== at || pending !== at) {
      throw new Error(`${from} nonce is ${at} at block ${ctx.blockTag}, ${latest} latest, ${pending} pending: a transaction from it is in flight or was just mined; wait for it, then re-run prepare`);
    }
    ctx.nonce = at;
  }
  return ctx.nonce++;
}

/**
 * Writes one transaction for the hardware wallet to scripts/migration/out/ and prints it with
 * its decoded call, so the signer and a second reviewer can check it independently. The file pins
 * the signer nonce and an expiry block (EXPIRY_BLOCKS[expiry] after the reads).
 */
async function writeCalldata(ctx, name, tx, decoded, meta = {}, { expiry = "short" } = {}) {
  const fees = await feeSuggestion(ctx.provider);
  const nonce = await nextNonce(ctx, tx.from);
  const record = {
    network: ctx.label,
    fork: ctx.fork,
    chainId: Number(ctx.chainId),
    simulatedAtBlock: ctx.blockTag,
    expiresAtBlock: ctx.blockTag + EXPIRY_BLOCKS[expiry],
    from: tx.from,
    nonce,
    to: tx.to,
    value: "0",
    data: tx.data,
    gasEstimate: tx.estimate,
    gasLimit: tx.gasLimit,
    maxFeePerGasGwei: ethers.formatUnits(fees.maxFeePerGas, "gwei"),
    maxPriorityFeePerGasGwei: ethers.formatUnits(fees.maxPriorityFeePerGas, "gwei"),
    decoded,
    ...meta,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(OUT_DIR, `${stamp}-${ctx.fork ? "fork-" : ""}${name}.json`);
  fs.writeFileSync(file, json(record));

  console.log(`\n── Transaction for the hardware wallet ${ctx.fork ? "(FORK REHEARSAL)" : ""}──────────────`);
  console.log(`  signer     ${tx.from}`);
  console.log(`  nonce      ${nonce}  (sign with exactly this nonce)`);
  console.log(`  to         ${tx.to}`);
  console.log(`  value      0`);
  console.log(`  call       ${decoded}`);
  console.log(`  gas limit  ${tx.gasLimit}  (estimate ${tx.estimate}, +20%)`);
  console.log(`  max fee    ${record.maxFeePerGasGwei} gwei, priority ${record.maxPriorityFeePerGasGwei} gwei${fees.capped ? "  (capped by MAX_FEE_GWEI)" : ""}`);
  console.log(`  data       ${tx.data}`);
  console.log(`  expires    after block ${record.expiresAtBlock}; do not sign it later, re-run prepare instead`);
  console.log(`  file       ${path.relative(process.cwd(), file)}`);
  return file;
}

/**
 * Finds the calldata file a mined tx was sent from: same chain, signer, target, data and nonce.
 * With `file`, only that file is considered.
 */
function findCalldataRecord(ctx, tx, file) {
  const files = file
    ? [file]
    : fs.existsSync(OUT_DIR)
      ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).sort().reverse().map((f) => path.join(OUT_DIR, f))
      : [];
  const sameCall = [];
  for (const f of files) {
    let r;
    try {
      r = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (e) {
      if (file) throw new Error(`Cannot read ${file}: ${e.message}`);
      continue;
    }
    if (r.chainId !== Number(ctx.chainId) || r.fork !== ctx.fork || r.nonce === undefined) continue;
    if (r.from?.toLowerCase() !== tx.from.toLowerCase() || r.to?.toLowerCase() !== tx.to?.toLowerCase() || r.data?.toLowerCase() !== tx.data.toLowerCase()) continue;
    sameCall.push({ file: f, record: r });
  }
  const match = sameCall.find((c) => c.record.nonce === tx.nonce);
  if (match) return match;
  if (sameCall.length) {
    throw new Error(`Sent with nonce ${tx.nonce}, but ${path.relative(process.cwd(), sameCall[0].file)} pins nonce ${sameCall[0].record.nonce} for this call`);
  }
  throw new Error(`${file ? path.relative(process.cwd(), file) : `No calldata file in ${path.relative(process.cwd(), OUT_DIR)}`} does not match this transaction (chain, signer, target, data and nonce ${tx.nonce}): it was not sent from a prepared file`);
}

/**
 * Loads a mined tx and its receipt and checks it succeeded, was sent by `from` to `to`, and came
 * from a calldata file with the nonce that file pins, before the file's expiry block.
 */
async function loadMinedTx(ctx, hash, { from, to, file }) {
  const [tx, receipt] = await Promise.all([ctx.provider.getTransaction(hash), ctx.provider.getTransactionReceipt(hash)]);
  if (!tx || !receipt) throw new Error(`Transaction ${hash} not found or not mined yet`);
  console.log(`Transaction ${hash}: block ${receipt.blockNumber}, status ${receipt.status === 1 ? "success" : "REVERTED"}, gas used ${receipt.gasUsed}`);
  if (from) expectEq("sent by", tx.from, from);
  if (to) expectEq("sent to", tx.to, to);
  const { file: source, record } = findCalldataRecord(ctx, tx, file);
  console.log(`  ✓ sent from ${path.relative(process.cwd(), source)} with the nonce it pins (${record.nonce})`);
  if (receipt.blockNumber > record.expiresAtBlock) {
    throw new Error(`Mined at block ${receipt.blockNumber}, after the file expired at block ${record.expiresAtBlock}: it was signed from a stale file; investigate before going on`);
  }
  console.log(`  ✓ mined at block ${receipt.blockNumber}, before the file's expiry block ${record.expiresAtBlock}`);
  if (receipt.status !== 1) {
    let reason = "unknown";
    try {
      await ctx.provider.call({ from: tx.from, to: tx.to, data: tx.data, blockTag: receipt.blockNumber - 1 });
    } catch (e) {
      reason = errorText(e);
    }
    throw new Error(`Transaction reverted: ${reason}`);
  }
  return { tx, receipt, record, file: source, block: receipt.blockNumber, before: receipt.blockNumber - 1 };
}

// ── pinned values ─────────────────────────────────────────────────────────────

/** The codehash the migration build must have. Only a fork run may use another one (--codehash). */
function expectedImplCodehash(ctx, args) {
  const reviewed = MAINNET.REVIEWED_IMPL_CODEHASH;
  if (!args.codehash || args.codehash.toLowerCase() === reviewed.toLowerCase()) return reviewed;
  if (!ctx.fork) throw new Error(`--codehash cannot replace the reviewed codehash ${reviewed} on mainnet; change REVIEWED_IMPL_CODEHASH in a reviewed commit`);
  console.log(`  ⚠️  fork run: expecting --codehash ${args.codehash} instead of the reviewed ${reviewed}`);
  return args.codehash;
}

/**
 * keccak256 over the rows that matter (address, from, to, stake in wei), one "address,from,to,wei"
 * line each, sorted by from, to and address. JSON and CSV of the same allocation hash the same.
 */
function allocationHash(rows) {
  const lines = rows
    .map((r) => ({ a: ethers.getAddress(r.address), from: Number(r.from), to: Number(r.to), wei: BigInt(r.stakeWei) }))
    .sort((x, y) => x.from - y.from || x.to - y.to || x.a.toLowerCase().localeCompare(y.a.toLowerCase()))
    .map((r) => `${r.a},${r.from},${r.to},${r.wei}\n`);
  return ethers.keccak256(ethers.toUtf8Bytes(lines.join("")));
}

/** Fails unless the allocation hashes to the reviewed value. Only a fork run may skip or replace it. */
function requireReviewedAllocation(ctx, args, rows) {
  const hash = allocationHash(rows);
  const reviewed = MAINNET.REVIEWED_ALLOCATION_HASH;
  if (!ctx.fork) {
    if (args["allocation-hash"] && args["allocation-hash"].toLowerCase() !== reviewed.toLowerCase()) {
      throw new Error("--allocation-hash cannot replace REVIEWED_ALLOCATION_HASH on mainnet");
    }
    if (!reviewed) throw new Error(`REVIEWED_ALLOCATION_HASH is not set; once this allocation (${hash}) is reviewed, set it in lib.js in a reviewed commit`);
    expectEq("allocation hash (reviewed)", hash, reviewed);
    return hash;
  }
  const expected = args["allocation-hash"] || reviewed;
  if (expected) expectEq("allocation hash", hash, expected);
  else console.log(`  · allocation hash ${hash} (not pinned: fork run)`);
  return hash;
}

// ── state the migration depends on ────────────────────────────────────────────

/**
 * Fails unless auctions are stopped and none of `ids` has an auction bid, at ctx.blockTag.
 * A bid on a validator touched by the migration could change its stake or signer mid-way.
 */
async function requireNoBids(ctx, ids) {
  const state = await crossCheck(ctx, `auctions for ${ids.join(",")}`, async (p, t) => {
    const sm = contracts(p).sm;
    const [epoch, cooldown, bids] = await Promise.all([
      sm.currentEpoch({ blockTag: t }),
      sm.replacementCoolDown({ blockTag: t }),
      Promise.all(ids.map(async (id) => ({ id, ...(await sm.validatorAuction(id, { blockTag: t })).toObject() }))),
    ]);
    return { epoch, cooldown, bids: bids.filter((b) => b.amount > 0n).map((b) => ({ id: b.id, amount: b.amount, user: b.user })) };
  });
  if (!(state.cooldown > state.epoch)) throw new Error(`Auctions are open at block ${ctx.blockTag} (replacementCoolDown ${state.cooldown} <= currentEpoch ${state.epoch}); run 2a_stopAuctions.js first`);
  if (state.bids.length) throw new Error(`Auction bids at block ${ctx.blockTag}: ${state.bids.map((b) => `validator ${b.id}: ${fmt(b.amount)} BONE by ${b.user}`).join("; ")}`);
  console.log(`  ✓ auctions stopped and no bid on validators ${ids.join(", ")} at block ${ctx.blockTag}`);
}

/**
 * Fails unless StakeManager's BONE covers every queued exit (the withdrawPool of every validator's
 * share contract), plus `paysOut` (what this step pays), plus MIN_MARGIN_BONE.
 */
async function requireBoneCover(ctx, paysOut, label) {
  const { exits, balance, validatorRewards } = await crossCheck(ctx, "StakeManager BONE and queued exits", async (p, t) => {
    const c = contracts(p);
    const count = Number(await c.sm.NFTCounter({ blockTag: t }));
    const ids = Array.from({ length: Math.max(count - 1, 0) }, (_, i) => i + 1);
    const rows = await mapLimit(ids, 4, async (id) => {
      const v = await c.sm.validators(id, { blockTag: t });
      const pool = v.contractAddress === ethers.ZeroAddress ? 0n : await c.share(v.contractAddress).withdrawPool({ blockTag: t });
      return { pool, reward: v.reward };
    });
    return {
      exits: rows.reduce((s, r) => s + r.pool, 0n),
      validatorRewards: rows.reduce((s, r) => s + r.reward, 0n),
      balance: await c.bone.balanceOf(MAINNET.STAKE_MANAGER_PROXY, { blockTag: t }),
    };
  });
  const margin = ethers.parseUnits(process.env.MIN_MARGIN_BONE || "50000", 18);
  const need = exits + paysOut + margin;
  console.log(`  · StakeManager BONE ${fmt(balance)}; needs ${fmt(need)} = queued exits ${fmt(exits)} + ${label} ${fmt(paysOut)} + margin ${fmt(margin)}`);
  console.log(`    (validators' own unclaimed rewards, not part of the requirement: ${fmt(validatorRewards)})`);
  if (balance < need) throw new Error(`StakeManager holds ${fmt(balance)} BONE, needs at least ${fmt(need)}; refill it first`);
  console.log("  ✓ StakeManager BONE covers the queued exits, this step's payouts and the margin");
}

// eth_getLogs in fixed windows: public RPCs refuse wide ranges, and a fork forwards to them
async function getLogsChunked(provider, filter, fromBlock, toBlock, step = 1_000) {
  const out = [];
  for (let start = fromBlock; start <= toBlock; start += step) {
    out.push(...(await provider.getLogs({ ...filter, fromBlock: start, toBlock: Math.min(start + step - 1, toBlock) })));
  }
  return out;
}

function parseLogs(receipt, iface, address) {
  const out = [];
  for (const log of receipt.logs) {
    if (address && log.address.toLowerCase() !== address.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed) out.push(parsed);
    } catch (_) {
      // not an event of this interface
    }
  }
  return out;
}

// ── Heimdall gate ─────────────────────────────────────────────────────────────

/**
 * For each validator: the L1 StakingInfo nonce must equal Heimdall's nonce, and Heimdall's power
 * must equal the L1 stake (active validators) or show an end epoch (removed ones). Heimdall applies
 * L1 events strictly in nonce order, so a nonce behind L1 means an event is pending or was dropped.
 */
async function heimdallGate(ctx, ids) {
  const api = (process.env.HEIMDALL_API || "").replace(/\/$/, "");
  if (!api) {
    console.log("⚠️  HEIMDALL_API not set: Heimdall gate SKIPPED. Do not move to the next step without it.");
    return { ok: null, rows: [] };
  }
  const { sm, info } = contracts(ctx.provider);
  const rows = await mapLimit(ids, 4, async (id) => {
    const [l1Nonce, v, active] = await Promise.all([info.validatorNonce(id), sm.validators(id), sm.isValidator(id)]);
    let h;
    try {
      const res = await fetch(`${api}/staking/validator/${id}`, { signal: AbortSignal.timeout(15000) });
      const body = await res.json();
      h = body.result || body.validator || body;
    } catch (e) {
      return { id, ok: false, note: `Heimdall unreachable: ${e.message}` };
    }
    const hNonce = BigInt(h.nonce ?? -1);
    const hPower = BigInt(h.power ?? h.voting_power ?? 0);
    const hEnd = BigInt(h.endEpoch ?? h.end_epoch ?? 0);
    const l1Power = (v.amount + v.delegatedAmount) / 10n ** 18n;
    const nonceOk = hNonce === l1Nonce;
    const stateOk = active ? hPower === l1Power : hEnd !== 0n;
    return { id, ok: nonceOk && stateOk, l1Nonce, hNonce, l1Power, hPower, hEnd, active };
  });
  console.log("\n── Heimdall gate ───────────────────────────────────────────────");
  for (const r of rows) {
    if (r.note) console.log(`  ✗ validator ${r.id}: ${r.note}`);
    else {
      const state = r.active ? `power L1 ${r.l1Power} / Heimdall ${r.hPower}` : `removed on L1, Heimdall endEpoch ${r.hEnd}`;
      console.log(`  ${r.ok ? "✓" : "✗"} validator ${r.id}: nonce L1 ${r.l1Nonce} / Heimdall ${r.hNonce}; ${state}`);
    }
  }
  const ok = rows.every((r) => r.ok);
  console.log(ok ? "  Gate green." : "  Gate NOT green: wait for Heimdall to catch up (3-5 checkpoints) and re-run before the next step.");
  return { ok, rows };
}

/**
 * Ends a verify run whose L1 checks all passed. On mainnet the step only counts as verified when
 * the Heimdall gate is green for `ids`; a skipped or red gate prints NOT VERIFIED and sets exit
 * code 2. A fork has no Heimdall following it, so there the L1 checks are the verdict.
 */
async function finishVerify(ctx, ids, what) {
  if (ctx.fork) {
    console.log(`\n✅ ${what} verified on the fork (L1 only: no Heimdall follows a fork).`);
    return true;
  }
  const { ok } = await heimdallGate(ctx, ids);
  if (ok === true) {
    console.log(`\n✅ ${what} verified (L1 and Heimdall).`);
    return true;
  }
  console.log(`\n⛔ ${what}: L1 checks passed, but NOT VERIFIED: the Heimdall gate ${ok === null ? "was skipped (HEIMDALL_API not set)" : "is not green"}.`);
  console.log(`   ${ok === null ? "Set HEIMDALL_API and re-run this verify" : "Re-run this verify once Heimdall has caught up"}. Do not start the next step before it passes.`);
  process.exitCode = 2;
  return false;
}

// ── allocation file ───────────────────────────────────────────────────────────

/**
 * Reads the allocation written by 0b_buildAllocation.js (JSON), or a CSV with columns
 * address, from, to and stake_wei (header names are matched loosely).
 */
function readAllocation(file) {
  if (!fs.existsSync(file)) throw new Error(`Allocation file not found: ${file} (run 0b_buildAllocation.js)`);
  if (file.endsWith(".json")) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      snapshotBlock: data.snapshotBlock,
      rows: data.rows.map((r) => ({ address: ethers.getAddress(r.address), from: Number(r.from), to: Number(r.to), stakeWei: BigInt(r.stakeWei) })),
    };
  }
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const col = (...names) => {
    const i = header.findIndex((h) => names.includes(h));
    if (i < 0) throw new Error(`${file}: no column named ${names.join(" / ")}`);
    return i;
  };
  const ia = col("address", "delegator");
  const ifrom = col("from", "from_validator", "source");
  const ito = col("to", "to_validator", "target");
  const istake = header.findIndex((h) => ["stake_wei", "stakewei", "stake"].includes(h));
  if (istake < 0) throw new Error(`${file}: no stake_wei column`);
  const isWei = header[istake] !== "stake";
  return {
    snapshotBlock: null,
    rows: lines.slice(1).filter(Boolean).map((line) => {
      const c = line.split(",").map((x) => x.trim());
      return {
        address: ethers.getAddress(c[ia]),
        from: Number(c[ifrom]),
        to: Number(c[ito]),
        stakeWei: isWei ? BigInt(c[istake]) : ethers.parseUnits(c[istake], 18),
      };
    }),
  };
}

/** Each (address, source) once, and every position of one address goes to the same target. */
function validateAllocation(rows) {
  const seen = new Set();
  const targetOf = new Map();
  for (const r of rows) {
    const key = `${r.address.toLowerCase()}:${r.from}`;
    if (seen.has(key)) throw new Error(`Allocation lists ${r.address} twice for validator ${r.from}`);
    seen.add(key);
    const prev = targetOf.get(r.address.toLowerCase());
    if (prev !== undefined && prev !== r.to) throw new Error(`Allocation sends ${r.address} to both ${prev} and ${r.to}`);
    targetOf.set(r.address.toLowerCase(), r.to);
    if (r.from === r.to) throw new Error(`Allocation moves ${r.address} from ${r.from} to itself`);
    if (r.stakeWei <= 0n) throw new Error(`Allocation has non-positive stake for ${r.address}`);
  }
}

module.exports = {
  MAINNET,
  ABI,
  IFACE,
  GAS_LIMIT_MAX,
  EXPIRY_BLOCKS,
  OUT_DIR,
  ethers,
  fmt,
  short,
  json,
  chunks,
  mapLimit,
  parseArgs,
  decodeRevert,
  errorText,
  connect,
  contracts,
  crossCheck,
  expectEq,
  simulate,
  writeCalldata,
  loadMinedTx,
  expectedImplCodehash,
  allocationHash,
  requireReviewedAllocation,
  requireNoBids,
  requireBoneCover,
  getLogsChunked,
  parseLogs,
  heimdallGate,
  finishVerify,
  readAllocation,
  validateAllocation,
};
