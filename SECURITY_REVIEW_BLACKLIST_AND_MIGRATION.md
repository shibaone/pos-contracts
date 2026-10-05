# Security Review — WithdrawManager Blacklist & StakeManager Force Migration

Scope: custom Shibarium changes vs upstream Polygon pos-contracts.
- `contracts/root/withdrawManager/WithdrawManager.sol` (+Storage, +IWithdrawManager) — exit blacklist/deferral
- `contracts/staking/stakeManager/StakeManager.sol` — `forceMigrateDelegation`, `forceMigrateMultipleDelegations`, address blacklist
- Supporting: `ValidatorShare.sol` (`migrateOut`/`migrateIn`/`_buyShares`/`_transfer`), `StakingNFT.sol`, `PriorityQueue.sol`

Severity: Critical > High > Medium > Low > Info.

---

## WithdrawManager

### W-1 HIGH — `updateExitPeriod` can reintroduce the infinite-loop bug and overflow

`processExits` deferral relies on `deferredAt = block.timestamp + (2 * HALF_EXIT_PERIOD)` being strictly in the future. `updateExitPeriod` has no bounds:

- `halfExitPeriod = 0` → `deferredAt == block.timestamp` → the `exitableAt > block.timestamp` guard fails → the same blacklisted exit is popped, deferred, and re-popped in one tx until gas runs out. This is exactly the bug fixed in `b8d1dace`, reachable again via one owner call.
- `2 * HALF_EXIT_PERIOD` and `createdAt + 2 * HALF_EXIT_PERIOD` (in `getExitableAt`) use raw arithmetic (no SafeMath, Solidity 0.5). A huge value overflows and produces a tiny `deferredAt` → same loop, plus broken `exitableAt` for new exits.

Fix:

```solidity
function updateExitPeriod(uint256 halfExitPeriod) public onlyOwner {
    require(halfExitPeriod >= 1 hours && halfExitPeriod <= 4 weeks, "HALF_EXIT_PERIOD out of bounds");
    emit ExitPeriodUpdate(HALF_EXIT_PERIOD, halfExitPeriod);
    HALF_EXIT_PERIOD = halfExitPeriod;
}
```

Optionally also make the deferral strictly future-safe regardless of config:

```solidity
uint256 deferredAt = block.timestamp + Math.max(2 * HALF_EXIT_PERIOD, 1 hours);
```

### W-2 MEDIUM — blacklist bookkeeping is never cleared

`isBlacklistedExit[stable]` and `blacklistedExitOriginalId[stable]` persist forever after the exit is processed, or after its NFT is burned by `challengeExit`. Risks:

- `blacklistedExitOriginalId` is consulted for **every** popped queue entry. If any future exit ever collides on the lower 128 bits (currently prevented only by the subtle interplay of `isKnownExit`/`ownerExits` across predicates — and `ownerExits` is itself never cleared), processing is silently redirected to the *old* exit struct (old owner, old amount). That failure mode is fund misdirection, so the cleanup is cheap insurance.
- Stale `isBlacklistedExit` entries make on-chain state misleading for ops/monitoring.

Fix — clear both in the terminal paths of `processExits`:

```solidity
// after the NFT-existence check fails (exit was challenged):
if (!exitNft.exists(fullExitId)) {
    delete blacklistedExitOriginalId[stableExitId];
    delete isBlacklistedExit[stableExitId];
    continue;
}
...
// in the success path, right after exitNft.burn(fullExitId):
delete blacklistedExitOriginalId[stableExitId];
```

### W-3 MEDIUM — `setBlacklistExit` accepts non-existent exits and ambiguous ids

`setBlacklistExit(exitId, value)` truncates any uint256 to uint128 and writes the flag. A typo'd or stale id emits a successful-looking `ExitBlacklistUpdated` while blacklisting nothing (or a different stable id than intended). The function also accepts either a full exitId or a bare stable id, so the `fullExitId` field in the event is unreliable for indexers.

Fix — require the full exitId and prove the exit exists when enabling:

```solidity
function setBlacklistExit(uint256 exitId, bool value) external onlyOwner {
    require(exitId != 0, "INVALID_EXIT_ID");
    uint128 stableExitId = uint128(exitId);
    if (value) {
        uint256 originalId = blacklistedExitOriginalId[stableExitId];
        uint256 checkId = originalId != 0 ? originalId : exitId;
        require(exitNft.exists(checkId), "EXIT_DOES_NOT_EXIST");
    }
    isBlacklistedExit[stableExitId] = value;
    emit ExitBlacklistUpdated(exitId, stableExitId, value);
}
```

### W-4 MEDIUM — un-blacklisting does not restore the exit; weekly re-processing churn

Once deferred, the queue entry carries `deferredAt`. If the owner un-blacklists the exit a minute later, the user still waits up to `2 * HALF_EXIT_PERIOD` (1 week). While blacklisted, every `processExits` pass re-pops and re-inserts the entry weekly, emitting `BlacklistBlocked` and paying heap costs forever.

Alternative design (cleaner): don't re-queue. Move blacklisted exits to a holding map and re-insert on un-blacklist:

```solidity
// in processExits, replace the deferral branch:
if (isBlacklistedExit[stableExitId]) {
    heldExits[stableExitId] = fullExitId;   // mapping(uint128 => uint256)
    emit BlacklistBlocked(fullExitId, exitor, _token);
    continue;                                // entry already delMin'd; not re-inserted
}

// in setBlacklistExit, when value == false:
uint256 held = heldExits[stableExitId];
if (held != 0) {
    PriorityQueue(exitsQueues[exits[held].token])
        .insert(Math.max(held >> 128, now), uint256(uint128(held)));
    delete heldExits[stableExitId];
}
```

This removes the need for `blacklistedExitOriginalId` entirely (one source of truth), stops the weekly churn, and restores priority immediately on un-blacklist. If you keep the current deferral design instead, document the up-to-one-week lag as intended.

### W-5 LOW — unchecked `send()` for bonds (upstream, inherited)

`challengeExit` → `msg.sender.send(BOND_AMOUNT)` and `processExits` → `address(uint160(exitor)).send(BOND_AMOUNT)` ignore the return value, and `send` forwards 2300 gas. A contract challenger/exitor with a non-trivial fallback silently loses the bond (it stays in WithdrawManager). Upstream behavior, but if you're hardening: track owed bonds and add a `claimBond()` pull-payment, or at minimum emit an event when `send` returns false.

### W-6 LOW — `startExitWithDepositedTokens` traps 0.1 ETH

The body is commented out (as upstream), but the function is still `payable` with `isBondProvided`: any caller who sends exactly 0.1 ETH donates it to the contract and gets nothing. Fix: `revert("DISABLED");` as the body (keeps the selector, refuses funds).

### W-7 INFO — design/centralization notes

- The owner can freeze any exit indefinitely via repeated deferral. This breaks Plasma's core "users can always exit" guarantee by design — make sure `owner` is governance/timelock, not an EOA, and document the trust assumption.
- Checks-effects-interactions in `processExits` is correct: `exits[fullExitId].owner` is set and the NFT burned before the revertless `predicate.call` — re-pop of the same exit is impossible (NFT gone). The unchecked low-level call is intentional (a reverting predicate must not block the queue).
- Storage layout: the two new mappings are appended at the end of `WithdrawManagerStorage` — safe for the proxy. Keep all future additions append-only.

---

## StakeManager

### S-1 HIGH — `forceMigrateDelegation` / `forceMigrateMultipleDelegations` missing validation

No checks that: `fromValidatorId != toValidatorId`; the target validator exists and has a share contract (`contractAddress != 0`); the target is active (`deactivationEpoch == 0`, not jailed/unstaked) and accepts delegation. Consequences: migrating into a deactivated validator strands delegators on a dead validator earning nothing; `from == to` round-trips burn/mint at the current exchange rate and leaks rounding dust for no reason; `contractAddress == 0` reverts late with an opaque error.

Fix (both functions):

```solidity
require(fromValidatorId != toValidatorId, "same validator");
address fromAddr = validators[fromValidatorId].contractAddress;
address toAddr = validators[toValidatorId].contractAddress;
require(fromAddr != address(0) && toAddr != address(0), "no share contract");
require(validators[toValidatorId].deactivationEpoch == 0, "target deactivated");
```

### S-2 HIGH — batch migration is all-or-nothing; several per-delegator states revert it

`forceMigrateMultipleDelegations` does `migrateOut` + `migrateIn` per delegator in one tx. Solidity 0.5.17 has no try/catch, so any one delegator reverts the whole batch. Known reverting states:

1. `_buyShares` requires `unbonds[user].shares == 0` — any delegator with a pending **legacy** unbond on the target validator reverts ("Ongoing exit").
2. **Cross-feature interaction with your own blacklist**: `migrateOut` → `_withdrawAndTransferReward` → `stakeManager.transferFunds` → `require(!blacklist[delegator].withdrawBlocked)`. A `withdrawBlocked` delegator with *any* pending rewards bricks the batch.
3. `_buyShares` requires the target's `delegation` flag on, global `delegationEnabled` on, and the target share contract unlocked.

Fix — pre-check and skip inside the loop, with an event for auditability:

```solidity
event ForceDelegationMigrated(uint256 indexed fromValidatorId, uint256 indexed toValidatorId, address indexed delegator, uint256 amount);
event ForceDelegationSkipped(uint256 indexed fromValidatorId, address indexed delegator, string reason);

for (uint256 i = 0; i < delegators.length; i++) {
    address d = delegators[i];
    (uint256 totalStake,) = ValidatorShare(fromAddr).getTotalStake(d);
    if (totalStake == 0) { emit ForceDelegationSkipped(fromValidatorId, d, "no stake"); continue; }
    (uint256 unbondShares,) = ValidatorShare(toAddr).unbonds(d);
    if (unbondShares != 0) { emit ForceDelegationSkipped(fromValidatorId, d, "ongoing exit"); continue; }
    if (blacklist[d].withdrawBlocked && ValidatorShare(fromAddr).getLiquidRewards(d) != 0) {
        emit ForceDelegationSkipped(fromValidatorId, d, "withdraw blocked"); continue;
    }
    fromContract.migrateOut(d, totalStake);
    toContract.migrateIn(d, totalStake);
    emit ForceDelegationMigrated(fromValidatorId, toValidatorId, d, totalStake);
}
```

(Also dry-run the full delegator list against a fork before the mainnet tx.)

### S-3 HIGH — address blacklist is bypassable by transferring the position

The blacklist keys on **address**, but both stake positions are transferable:

- Validators: `StakingNFT` allows transfers (only constraint: recipient owns no position). `unstakeClaim`/`withdrawRewards` check `blacklist[msg.sender]` — a `withdrawBlocked` validator transfers the NFT to a fresh address and withdraws from there.
- Delegators: `ValidatorShare._transfer` is enabled (settles rewards, then moves shares). If pending rewards are zero (or after they fail to settle, just wait/compound), a `withdrawBlocked` delegator transfers shares to a clean address, which can `sellVoucher_new` + claim freely.

Contrast: the WithdrawManager blacklist keys on exitId, which is transfer-proof. If the StakeManager blacklist must hold against motivated actors, block transfers too:

```solidity
// ValidatorShare._transfer
require(!stakeManager.isWithdrawBlocked(from) && !stakeManager.isWithdrawBlocked(to), "blacklisted");

// StakingNFT._transferFrom (needs a stakeManager reference, or route the check via StakeManager)
require(!stakeManager.isWithdrawBlocked(from) && !stakeManager.isWithdrawBlocked(to), "blacklisted");
```

Expose `isWithdrawBlocked(address) public view` on StakeManager for this.

### S-4 MEDIUM — `claimFee` is not blacklist-gated

`claimFee` proves the heimdall fee balance and calls `_transferToken(msg.sender, withdrawAmount)` with no `withdrawBlocked` check — a blacklisted validator can still extract their fee balance. Add:

```solidity
require(!blacklist[msg.sender].withdrawBlocked, "withdraw blocked");
```

(Confirm intended scope: if the blacklist is meant to freeze *all* outflows, also audit any other `_transferToken`/`token.transfer` call sites.)

### S-5 MEDIUM — `blacklist` mapping declared in the most-derived contract (proxy storage footgun)

`struct BlacklistConfig` + `mapping(address => BlacklistConfig) public blacklist` live inside `StakeManager` itself. Linearization puts them *after* `StakeManagerStorageExtension`'s slots, so today's layout is consistent. But the extension contract is the designated append point: if anyone later appends a variable to `StakeManagerStorageExtension` (as upstream historically did), every `StakeManager`-declared slot shifts and the entire blacklist mapping silently reads empty after the upgrade — all blacklist flags drop.

Fix before mainnet: move the struct + mapping to the **end** of `StakeManagerStorageExtension` (layout-identical today since `StakeManager` previously declared no storage), and add a comment that all future storage goes there, append-only. Verify with `forge inspect StakeManager storage-layout` before/after.

### S-6 MEDIUM — rounding dust in migrate round-trip

`migrateOut` burns `shares = amount * precision / rate` (floor) — dust shares can remain with the old validator. `migrateIn` → `_buyShares` clamps `_amount = rate * shares / precision` (floor) — the re-staked amount can be a few wei below what was migrated out, so validator accounting (`updateValidatorState`) nets slightly negative and the delegator's stake shrinks by dust per hop. Wei-level per migration, but it compounds and can leave unkillable dust positions on the old validator.

Mitigations: accept and document it; or migrate by *shares* (burn exact `balanceOf(user)`) so the source position is always fully closed; or assert post-conditions in the migration script (source stake == 0, target stake within tolerance).

### S-7 LOW — admin-role inconsistency and missing top-level events

`forceUnstake`, `setCurrentEpoch`, `updateBlacklist` are `onlyGovernance`; `forceMigrateDelegation*` is `onlyOwner`. Two different keys can move user funds — confirm that's intended; otherwise standardize on `onlyGovernance` for the migration functions. Also add the `ForceDelegationMigrated` event (S-2) — `StakingInfo` logs ShareBurned/ShareMinted, but there is no single event tying a forced migration to the operator action.

### S-8 INFO — `WITHDRAWAL_DELAY = 1` epoch

Initialize sets a 1-epoch unbonding delay (upstream: 2^13). With slashing disabled in `ValidatorShare`, the delay isn't protecting slashing anymore, but it also removes the reaction window for governance to freeze a malicious validator's stake before it exits (the blacklist is your only brake, and see S-3). Only affects fresh deployments (initializer), but worth a conscious decision + comment.

---

## Tests to add

WithdrawManager (extend `test/withdrawManagerBlacklistFork.test.js`):

1. `updateExitPeriod(0)` reverts; fuzz `processExits` with small `HALF_EXIT_PERIOD` values asserting each blacklisted exit is deferred at most once per tx (count `BlacklistBlocked` emissions).
2. Blacklist → defer → un-blacklist → process: assert exit pays out correctly AND `blacklistedExitOriginalId[stable] == 0` after processing (post-W-2 fix).
3. Blacklist → defer → `challengeExit` burns NFT → next `processExits` skips and clears both mappings; bond goes to challenger.
4. `setBlacklistExit` with a non-existent exitId reverts (post-W-3 fix); with stable-only id vs full id behaves per the documented convention.
5. MoreVP (bonded) exit blacklisted then processed → bond refunded exactly once.
6. Invariant/fuzz: for randomized interleavings of start/blacklist/unblacklist/challenge/process, no exit is ever paid twice and no non-blacklisted exit is deferred.

StakeManager (extend `test/validatorMigrationPuppynet.test.js`):

7. `forceMigrateDelegation` reverts for: `from == to`, target without share contract, deactivated target (post-S-1 fix).
8. Batch with one delegator having a pending legacy unbond on the target → others still migrate, `ForceDelegationSkipped` emitted (post-S-2 fix).
9. Batch including a `withdrawBlocked` delegator with pending rewards → skipped, not reverted; same delegator with zero rewards → migrated (decide + pin the intended semantics).
10. Dust accounting: migrate, then assert source `getTotalStake == 0` (if migrating by shares) or document/assert the wei tolerance; assert sum of validator states before/after within tolerance.
11. Blacklist bypass regressions (post-S-3 fix): blacklisted validator NFT transfer reverts; blacklisted delegator share transfer reverts; `claimFee` for `withdrawBlocked` caller reverts (post-S-4 fix).
12. Storage layout snapshot test: `forge inspect` layout hash pinned in CI so any reordering of `blacklist`/extension slots fails the build.
