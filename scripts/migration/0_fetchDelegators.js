/**
 * Step 0: Fetch the delegator list used by 3_migrateDelegations.js
 *
 * Pulls every delegator from the Shibarium staking squid, groups them by
 * validator and writes a JSON file that 3_migrateDelegations.js reads directly.
 *
 * The squid is an indexer, so --verify re-reads each delegator's stake from
 * ValidatorShare.getTotalStake() on chain before the list is used to move funds.
 *
 * Run:
 *   node scripts/migration/0_fetchDelegators.js
 *   node scripts/migration/0_fetchDelegators.js --validator 14 --verify
 *
 * Options:
 *   --validator <id>   only fetch delegators of this validator (repeatable)
 *   --include-zero     include fully-exited delegators (delegatedAmount == 0)
 *   --verify           cross-check every delegator against on-chain stake (needs MAINNET_RPC_URL)
 *   --out <path>       output file (default scripts/migration/delegators.json)
 *   --page-size <n>    rows per GraphQL request (default 1000)
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ── Config ────────────────────────────────────────────────────────────────────

const SUBSQUID_URL = process.env.SUBSQUID_URL || "https://kshibarium-squid.shib.io/graphql";
const RPC_URL = process.env.MAINNET_RPC_URL || process.env.RPC_URL;
const STAKE_MANAGER_PROXY = process.env.STAKEMANAGER || "0x65218A41Fb92637254B4f8c97448d3dF343A3064";

const DEFAULT_OUT = path.join(__dirname, "delegators.json");
const DEFAULT_PAGE_SIZE = 1000;

// getTotalStake calls issued at once during --verify
const VERIFY_CONCURRENCY = 20;

// squid and chain are read at different moments, so allow a small drift before
// flagging a delegator — anything larger means the list is stale
const VERIFY_TOLERANCE_BPS = 100n; // 1%

const QUERY = `query AllDelegators($limit: Int!, $offset: Int!, $where: DelegatorWhereInput) {
  delegators(
    limit: $limit
    offset: $offset
    orderBy: [validatorId_ASC, delegatedAmount_DESC, id_ASC]
    where: $where
  ) {
    id
    counter
    validatorId
    address
    delegatedAmount
    tokens
    claimedRewards
    unclaimedAmount
    claimedAmount
  }
}`;

const COUNT_QUERY = `query CountDelegators($where: DelegatorWhereInput) {
  delegatorsConnection(orderBy: id_ASC, where: $where) {
    totalCount
  }
}`;

// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { validators: [], includeZero: false, verify: false, out: DEFAULT_OUT, pageSize: DEFAULT_PAGE_SIZE };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--validator") {
      const id = Number(argv[++i]);
      if (!Number.isInteger(id) || id <= 0) throw new Error(`--validator needs a positive integer, got: ${argv[i]}`);
      opts.validators.push(id);
    } else if (arg === "--include-zero") {
      opts.includeZero = true;
    } else if (arg === "--verify") {
      opts.verify = true;
    } else if (arg === "--out") {
      opts.out = path.resolve(argv[++i]);
    } else if (arg === "--page-size") {
      opts.pageSize = Number(argv[++i]);
      if (!Number.isInteger(opts.pageSize) || opts.pageSize <= 0) throw new Error("--page-size needs a positive integer");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function gql(query, variables) {
  const res = await fetch(SUBSQUID_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Squid HTTP ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body.errors) throw new Error(`Squid error: ${JSON.stringify(body.errors)}`);
  return body.data;
}

function buildWhere(opts) {
  const where = {};
  if (!opts.includeZero) where.delegatedAmount_gt = "0";
  if (opts.validators.length === 1) where.validatorId_eq = String(opts.validators[0]);
  else if (opts.validators.length > 1) where.validatorId_in = opts.validators.map(String);
  return Object.keys(where).length > 0 ? where : null;
}

const fmt = (wei) => (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });

async function fetchAll(opts) {
  const where = buildWhere(opts);

  const { delegatorsConnection } = await gql(COUNT_QUERY, { where });
  const totalCount = delegatorsConnection.totalCount;
  console.log(`Squid:      ${SUBSQUID_URL}`);
  console.log(`Filter:     ${where ? JSON.stringify(where) : "none (all delegators)"}`);
  console.log(`Expecting:  ${totalCount} delegator rows\n`);

  const rows = [];
  const seen = new Set();
  for (let offset = 0; offset < totalCount; offset += opts.pageSize) {
    const data = await gql(QUERY, { limit: opts.pageSize, offset, where });
    const page = data.delegators;
    if (page.length === 0) {
      console.log(`  page @${offset}: empty, stopping early`);
      break;
    }
    // offset paging re-reads the table per request, so an indexer write between
    // pages can repeat or drop a row — dedupe on id and reconcile against totalCount below
    let duplicates = 0;
    for (const row of page) {
      if (seen.has(row.id)) {
        duplicates++;
        continue;
      }
      seen.add(row.id);
      rows.push(row);
    }
    console.log(`  page @${offset}: ${page.length} rows${duplicates ? ` (${duplicates} duplicate)` : ""} — ${rows.length}/${totalCount}`);
  }

  if (rows.length !== totalCount) {
    console.log(`\n⚠️  Fetched ${rows.length} unique rows but the squid reported ${totalCount}.`);
    console.log("   The indexer most likely advanced mid-fetch. Re-run and compare before migrating.");
  }
  return rows;
}

function group(rows) {
  const byValidator = new Map();
  for (const row of rows) {
    const id = Number(row.validatorId);
    if (!byValidator.has(id)) byValidator.set(id, []);
    byValidator.get(id).push({
      address: row.address.toLowerCase(),
      delegatedAmount: row.delegatedAmount,
      tokens: row.tokens,
      claimedRewards: row.claimedRewards,
      unclaimedAmount: row.unclaimedAmount,
      claimedAmount: row.claimedAmount,
      counter: row.counter,
    });
  }
  return new Map([...byValidator.entries()].sort((a, b) => a[0] - b[0]));
}

async function verifyOnChain(byValidator) {
  if (!RPC_URL) {
    throw new Error("--verify needs MAINNET_RPC_URL (or RPC_URL) in .env");
  }
  const { ethers } = require("ethers");
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const SM_ABI = [
    "function validators(uint256) view returns (uint256 amount, uint256 reward, uint256 activationEpoch, uint256 deactivationEpoch, uint256 jailTime, address signer, address contractAddress, uint8 status, uint256 commissionRate, uint256 lastCommissionUpdate, uint256 delegatorsReward, uint256 delegatedAmount, uint256 initialRewardPerStake)",
  ];
  const VS_ABI = ["function getTotalStake(address) view returns (uint256, uint256)"];
  const stakeManager = new ethers.Contract(STAKE_MANAGER_PROXY, SM_ABI, provider);

  console.log("\n── On-chain verification ───────────────────────────────────────");
  console.log(`StakeManager: ${STAKE_MANAGER_PROXY}`);

  const mismatches = [];
  for (const [validatorId, delegators] of byValidator) {
    const validator = await stakeManager.validators(validatorId);
    const shareAddress = validator.contractAddress;
    if (shareAddress === ethers.ZeroAddress) {
      console.log(`\nValidator ${validatorId}: no delegation contract on chain — skipping ${delegators.length} row(s)`);
      continue;
    }
    const share = new ethers.Contract(shareAddress, VS_ABI, provider);

    let checked = 0;
    let sum = 0n;
    for (let i = 0; i < delegators.length; i += VERIFY_CONCURRENCY) {
      const slice = delegators.slice(i, i + VERIFY_CONCURRENCY);
      const stakes = await Promise.all(slice.map((d) => share.getTotalStake(d.address).then(([s]) => s)));
      for (const [j, onChain] of stakes.entries()) {
        const d = slice[j];
        d.onChainStake = onChain.toString();
        sum += onChain;
        checked++;

        const indexed = BigInt(d.delegatedAmount);
        const diff = onChain > indexed ? onChain - indexed : indexed - onChain;
        const allowed = (indexed * VERIFY_TOLERANCE_BPS) / 10000n;
        if (diff > allowed) {
          mismatches.push({ validatorId, address: d.address, indexed: d.delegatedAmount, onChain: onChain.toString() });
        }
      }
    }

    // the sum of delegator stakes should track the validator's delegatedAmount;
    // a large gap means the list is missing delegators the migration would leave behind
    const delegated = validator.delegatedAmount;
    const gap = delegated > sum ? delegated - sum : 0n;
    const gapPct = delegated === 0n ? 0 : Number((gap * 10000n) / delegated) / 100;
    console.log(
      `\nValidator ${validatorId}: ${checked} delegator(s) checked` +
        `\n  sum(getTotalStake):        ${fmt(sum)} BONE` +
        `\n  validator.delegatedAmount: ${fmt(delegated)} BONE` +
        `\n  unaccounted:               ${fmt(gap)} BONE (${gapPct}%)`
    );
    if (gapPct > 1) {
      console.log("  ⚠️  more than 1% unaccounted — the delegator list may be incomplete");
    }
  }

  if (mismatches.length > 0) {
    console.log(`\n⚠️  ${mismatches.length} delegator(s) differ between squid and chain by more than ${Number(VERIFY_TOLERANCE_BPS) / 100}%:`);
    for (const m of mismatches.slice(0, 20)) {
      console.log(`  ${m.address}  validator ${m.validatorId}  indexed ${fmt(m.indexed)} vs chain ${fmt(m.onChain)} BONE`);
    }
    if (mismatches.length > 20) console.log(`  ... and ${mismatches.length - 20} more (see the output file)`);
    console.log("  The migration moves the on-chain amount, so this only affects the report, not the transfer.");
  } else {
    console.log("\n✓ Every delegator matches on-chain stake within tolerance");
  }
  return mismatches;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const rows = await fetchAll(opts);
  const byValidator = group(rows);

  let mismatches = [];
  if (opts.verify) mismatches = await verifyOnChain(byValidator);

  console.log("\n── Summary ─────────────────────────────────────────────────────");
  console.log("Validator | Delegators | Delegated (BONE)");
  console.log("-".repeat(50));
  let grandTotal = 0n;
  for (const [validatorId, delegators] of byValidator) {
    const total = delegators.reduce((acc, d) => acc + BigInt(d.delegatedAmount), 0n);
    grandTotal += total;
    console.log(`${String(validatorId).padStart(9)} | ${String(delegators.length).padStart(10)} | ${fmt(total).padStart(18)}`);
  }
  console.log("-".repeat(50));
  console.log(`${"total".padStart(9)} | ${String(rows.length).padStart(10)} | ${fmt(grandTotal).padStart(18)}`);

  const output = {
    fetchedAt: new Date().toISOString(),
    source: SUBSQUID_URL,
    filter: buildWhere(opts) || {},
    verified: opts.verify,
    totalDelegators: rows.length,
    mismatches,
    validators: Object.fromEntries(
      [...byValidator].map(([validatorId, delegators]) => [
        validatorId,
        {
          count: delegators.length,
          totalDelegated: delegators.reduce((acc, d) => acc + BigInt(d.delegatedAmount), 0n).toString(),
          // 3_migrateDelegations.js reads this array as its DELEGATORS list
          addresses: delegators.map((d) => d.address),
          delegators,
        },
      ])
    ),
  };

  fs.writeFileSync(opts.out, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote ${rows.length} delegators to ${opts.out}`);
  console.log("Use it with: npx hardhat run scripts/migration/3_migrateDelegations.js --network mainnet");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
