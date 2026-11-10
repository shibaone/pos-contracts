# Validator Migration — Runbook

How to close validators and move their delegators to other validators, using one allocation file
and the force-migration build of StakeManager. Written for closing validators 9 and 10 into
11, 3, 2, 4 and 5, but every step takes the ids as arguments.

## How the scripts work

Every admin transaction is signed by the admin hardware wallet `0xBab4…5E96`. The scripts never
hold that key:

1. **prepare** runs the pre-checks, simulates the transaction from the admin, and writes a calldata
   file to `scripts/migration/out/` (target, data, gas limit, fee cap, the decoded call, the
   **admin nonce** to sign with and an **expiry block**).
2. The admin signs that file's transaction on the hardware wallet **with exactly the nonce in the
   file, before its expiry block**. A second person decodes the calldata independently first, for
   example `cast calldata-decode "update(address,bytes)" <data>`.
3. **verify --tx `<hash>`** finds the calldata file the transaction was sent from (or takes
   `--file <path>`), checks it used the nonce the file pins and was mined before the expiry block,
   then checks the result. Any `✗` means stop.

Only step 1 (deploying the implementation) signs anything, from a throwaway funded key.

Critical reads are checked against a second, independent RPC. Reads are pinned to a block, and the
chain id is pinned to 1.

**Exit codes of verify:** 0 verified, 1 a check failed (stop), 2 the L1 checks passed but the step
is **not verified** yet because the Heimdall gate is red or was skipped (steps 2b and 3 on mainnet).
Re-run the same verify until it exits 0 before starting the next step.

### Pinned values (no override on mainnet)

| Value | Where | Used by |
|---|---|---|
| Migration build codehash `0xe75e716f…ba06` | `REVIEWED_IMPL_CODEHASH` in `scripts/migration/lib.js` | steps 1, 2 and 3 refuse any other build |
| Pre-migration codehash `0x8c1e…c908` | `LIVE_IMPL_CODEHASH` | the rollback |
| Allocation hash | `REVIEWED_ALLOCATION_HASH`, empty until the allocation is reviewed | step 3 refuses to run on mainnet without it, and refuses any other allocation |

Changing any of them means a reviewed commit. `--codehash` and `--allocation-hash` exist only for
fork rehearsals; on mainnet the scripts refuse them.

## Setup (`.env`)

| Variable | Used for |
|---|---|
| `MAINNET_RPC_URL` | primary RPC (required; nothing is hard-coded) |
| `SECOND_RPC_URL` | independent RPC for cross-checks (required, or `ALLOW_SINGLE_RPC=1`) |
| `HEIMDALL_API` | Heimdall REST endpoint for the Heimdall gate (without it, steps 2b and 3 never verify on mainnet) |
| `ETHERSCAN_API_KEY` | optional, speeds up the event scan in step 0b |
| `MAX_FEE_GWEI` | fee cap printed with each calldata file (default 30) |
| `MIN_MARGIN_BONE` | BONE StakeManager must hold beyond everything it owes (default 50,000) |
| `PRIVATE_KEY` | only for step 1, a throwaway deployer; never the admin key |

## Sequence

| Phase | Command | Gate before the next phase |
|---|---|---|
| 0. Stop auctions | `node scripts/migration/2a_stopAuctions.js prepare`, sign, then `verify --tx <hash>` | `replacementCoolDown == currentEpoch + 1,000,000,000` |
| 1. Deploy the implementation | `npx hardhat run scripts/migration/1_deployStakeManager.js --network mainnet` | It refuses unless the build has `REVIEWED_IMPL_CODEHASH`; verified on Sourcify |
| 2. Upgrade | `node scripts/migration/2_upgradeProxy.js prepare --impl <impl>`, sign, `verify --tx <hash>` | New implementation with `REVIEWED_IMPL_CODEHASH`; owner, epoch, validator count and total stake unchanged; force functions available |
| 3. Close the validators | For each source: `node scripts/migration/2b_forceUnstakeValidator.js prepare --validator <id> --impl <impl>`, sign, `verify --tx <hash>` until it exits 0 | Exactly one `UnstakeInit` per validator; validator count and total stake dropped once each; signer set correct; Heimdall gate green |
| 4a. Allocation | `node scripts/migration/0b_buildAllocation.js --from 9,10 --to 11,3,2,4,5` | Review and share `allocation.json` / `allocation.csv`; then **freeze** it: set `REVIEWED_ALLOCATION_HASH` in `lib.js` to the printed hash in a reviewed commit |
| 4b. Pilot | `node scripts/migration/3_migrateDelegations.js prepare --pilot`, then for each file in order: sign, `verify --tx <hash>` until it exits 0 | All green, Heimdall gate green for the touched validators |
| 4c. Batches | `node scripts/migration/3_migrateDelegations.js prepare`, then **one batch at a time, in file order**: sign, `verify --tx <hash>` until it exits 0 | All green before the next batch; stop on any `✗`, failed delegator or "Out of gas" |
| 5. Finish | `node scripts/migration/3_migrateDelegations.js status`, handle excluded delegators, then `node scripts/migration/2_upgradeProxy.js prepare --rollback`, sign, `verify --tx <hash>` | Sources hold no delegation; implementation is `0x269C…b87A` with codehash `0x8c1e…c908`; force functions revert |

Run the Heimdall gate at any point with
`node scripts/migration/heimdallGate.js 2,3,4,5,9,10,11`.

## Rules

- **The rollback is mandatory.** Nothing from the migration build stays live.
- **Sign with the file's nonce, before its expiry.** Each calldata file pins the admin nonce, so the
  same file can never be mined twice: a second send only replaces the first. One prepare run writes
  consecutive nonces; send those files in order. If any other admin transaction goes in between, or a
  file passes its expiry block (300 blocks, about an hour; 3,600 blocks for migration batches), throw
  the remaining files away and re-run prepare. prepare refuses while an admin transaction is pending.
- **No checkpoint wait after `forceUnstake`.** `forceUnstake` sets `deactivationEpoch = currentEpoch`,
  so migration can follow at once; a voluntary `unstake()` sets `currentEpoch + 1`, which is where a
  wait applies. Keep the gap short: after `forceUnstake`, the closed validators' delegators keep
  accruing rewards each checkpoint, which StakeManager has to pay out.
- **Heimdall gate instead of a wait.** Removal is immediate on L1 only. Heimdall follows ~3-5
  checkpoints later, and Bor at the next span. Heimdall applies L1 events strictly in nonce order,
  so one dropped event freezes a validator's power while every L1 check still passes.
- **`forceUnstake` has no on-chain guard against running twice.** A second unstake corrupts the
  active total and drops `signers[0]`. Step 2b enforces the guard: run `prepare` immediately before
  signing; never send it if `deactivationEpoch != 0`; send through a private relay; sign once and
  replace only with the **same** nonce. This rule stays after the rollback.
- **StakeManager must hold the BONE it owes.** Steps 2b and 3 refuse unless the balance covers every
  queued exit (the `withdrawPool` of every validator), plus what the step pays out (validator rewards
  for 2b, delegator rewards for 3), plus `MIN_MARGIN_BONE` (default 50,000). Refill it first.
- **No bids, auctions stopped.** Step 2b checks the validator it closes; step 3 checks every source
  and target in prepare, and both validators of the batch again in verify.
- **"Out of gas" means empty revert data.** The batch function reports any revert without a reason
  as `Out of gas`, including SafeMath underflows and bare `require`s. Re-run `prepare` with half the
  `--batch-size` to find the delegator.
- **Silent no-ops.** Addresses with no stake, and duplicates, emit nothing. Reconcile against the
  allocation (verify does), not against an event count.
- **The final check excludes `withdrawPool`.** Matured exits stay claimable on the closed validators'
  share contracts; that is expected.
- **Re-send `stopAuctions` after any dynasty change.** `updateDynastyValue` re-opens auctions.

## Contract behaviour

- `forceMigrateDelegation` and `forceMigrateMultipleDelegations` are `onlyOwner`: `isOwner()` checks
  the proxy owner (the admin). StakeManager's old `Ownable` owner in storage slot 1 (`0x80Cc…9004`)
  has no power.
- A migration reverts with `Invalid migration` if `from == to`, the source has no delegation
  contract, or the target is not active. The contract does **not** check that the source is closed;
  step 3 refuses unless it is.
- In a batch, a delegator whose move reverts with a reason is skipped and emits
  `DelegationForceMigrationFailed`; the rest of the batch goes through. Step 3 dry-runs every
  delegator on its own first and excludes any that would fail.
- Each move pays the delegator's pending rewards on both the source and the target.

## Fork rehearsal

Start `anvil --fork-url $MAINNET_RPC_URL --fork-block-number <block>`, then run
`node scripts/migration/forkSetup.js --from 9,10 --to 11,3,2,4,5` for the sequence. Every step takes
`--fork`; `node scripts/migration/forkExecute.js <calldata file>` sends a prepared transaction as
the admin on the fork, with the nonce the file pins, so the rehearsal runs exactly what will be
signed. It refuses an expired file or one that is out of nonce order. No Heimdall follows a fork, so
there verify gives its verdict on the L1 checks alone. Pass `--allocation-hash <hash>` to step 3 to
rehearse the allocation freeze too.

## Mainnet addresses

| | |
|---|---|
| StakeManagerProxy | `0x65218A41Fb92637254B4f8c97448d3dF343A3064` |
| GovernanceProxy | `0xC476E20c2F7FA3B35aC242aBE71B59e902242f06` |
| StakingInfo | `0x539964b3d225194717fb896D26c8b3E635b8A1aE` |
| Admin (proxy owner, Governance owner) | `0xBab4F3e701F6d2e009Af3C7f1eF2e7dD68225E96` |
| Pre-migration implementation | `0x269C0ebb7a39995dB531Ccd61D015e431530b87A`, codehash `0x8c1e6ae90322d08be42e195f31cad8d23fd2d224858132c9fbef89f99114c908` |
