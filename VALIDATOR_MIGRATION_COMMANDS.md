# Validator Migration — Command Guide

This guide covers closing a validator and migrating its delegations to another validator.

**Access required:**
- **Proxy owner key** — for upgrading the StakeManager implementation
- **Governance key** — for `forceUnstake`
- **StakeManager owner key** — for delegation migration (same as proxy owner)

---

## Step 1 — Deploy new StakeManager implementation

```bash
npx hardhat run scripts/migration/1_deployStakeManager.js --network <network>
```

**Output:** Prints the new implementation address. Copy it for Step 2.

---

## Step 2 — Upgrade StakeManagerProxy to new implementation

Fill in `TODO_MAINNET_STAKE_MANAGER_PROXY` in `2_upgradeProxy.js` first (for mainnet).

```bash
NEW_IMPL=0x<address from Step 1> npx hardhat run scripts/migration/2_upgradeProxy.js --network <network>
```

**Verifies:**
- Caller is proxy owner
- New address has bytecode
- Confirms implementation slot updated

---

## Step 3 — Force unstake the validator (manual, via governance)

This must be done **before** running the delegation migration script.

Encode the calldata:
```bash
# forceUnstake(<validatorId>)
# Selector: 0x91460149
# Example for validator 7:
cast calldata "forceUnstake(uint256)" 7
# → 0x914601490000000000000000000000000000000000000000000000000000000000000007
```

Then submit to the **Governance contract** (via multisig or governance owner):

```
Function: update(address target, bytes data)
  target → StakeManagerProxy address
  data   → calldata from above
```

**What this does:** Removes the validator from the active set immediately and locks its delegation contract.

---

## Step 4 — Update delegator list in the migration script

Open `scripts/migration/3_migrateDelegations.js` and fill in:

```js
const FROM_VALIDATOR_ID = <validator being closed>;   // e.g. 7
const TO_VALIDATOR_ID   = <target validator>;          // e.g. 5

const DELEGATORS = [
  "0xADDRESS_1",  // ~X BONE
  "0xADDRESS_2",  // ~X BONE
  // ...
];
```

To get the delegator list on-chain, scan `Transfer(from=0x0)` events on the validator's
`ValidatorShare` contract (delegation contract address from `stakeManager.validators(id).contractAddress`),
then check `getTotalStake(address)` to filter for non-zero balances.

Quick scan example:
```bash
node -e "
const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('<RPC_URL>');
async function main() {
  const vsAddr = '<VALIDATOR_SHARE_CONTRACT>';
  const vs = new ethers.Contract(vsAddr, [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'function getTotalStake(address) view returns (uint256, uint256)',
    'function totalSupply() view returns (uint256)',
  ], provider);
  const block = await provider.getBlockNumber();
  const holders = new Set();
  for (let f = 0; f < block; f += 49999) {
    const events = await vs.queryFilter(vs.filters.Transfer(ethers.ZeroAddress), f, Math.min(f+49999, block));
    events.forEach(e => holders.add(e.args.to));
  }
  for (const h of holders) {
    const [s] = await vs.getTotalStake(h);
    if (s > 0n) console.log(h, ethers.formatUnits(s, 18));
  }
}
main();
"
```

---

## Step 5 — Run the delegation migration script

```bash
npx hardhat run scripts/migration/3_migrateDelegations.js --network <network>
```

**What this does:**
- Verifies source validator is inactive (will throw if still active)
- Verifies target validator is active
- Prints per-delegator stakes before migration
- Calls `forceMigrateMultipleDelegations(from, to, delegators)` directly as StakeManager owner
- Verifies all delegator balances on source are zero after migration
- Prints per-delegator stakes on target after migration

---

## Network addresses

| | Sepolia (testnet) | Mainnet |
|---|---|---|
| StakeManagerProxy | `0xC0568572887E9687D7b57c1fC83332F8d1d38A6a` | `TODO` |
| GovernanceProxy | `0x1FFEdE2984dd324C0E63EdFfc44d5b6795826bfC` | `TODO` |

---

## Access key summary

| Step | Required key |
|---|---|
| Deploy implementation (Step 1) | Any funded EOA |
| Upgrade proxy (Step 2) | Proxy owner |
| forceUnstake (Step 3) | Governance owner (via governance.update) |
| Migrate delegations (Step 5) | StakeManager owner |
