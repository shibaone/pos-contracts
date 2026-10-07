# Validator Migration — Runbook

How to close validators and move their delegators to other validators, using one allocation file
and the force-migration build of StakeManager. Written for closing validators 9 and 10 into
11, 3, 2, 4 and 5, but every step takes the ids as arguments.

## How the scripts work

Every admin transaction is signed by the admin hardware wallet `0xBab4…5E96`. The scripts never
hold that key:

1. **prepare** runs the pre-checks, simulates the transaction from the admin, and writes a calldata
   file to `scripts/migration/out/` (target, data, gas limit, fee cap and the decoded call).
2. The admin signs that file's transaction on the hardware wallet. A second person decodes the
   calldata independently first, for example `cast calldata-decode "update(address,bytes)" <data>`.
3. **verify --tx `<hash>`** checks the mined result. Any `✗` means stop.

Only step 1 (deploying the implementation) signs anything, from a throwaway funded key.

Critical reads are checked against a second, independent RPC. Reads are pinned to a block, and the
chain id is pinned to 1.

## Setup (`.env`)

| Variable | Used for |
|---|---|
| `MAINNET_RPC_URL` | primary RPC (required; nothing is hard-coded) |
| `SECOND_RPC_URL` | independent RPC for cross-checks (required, or `ALLOW_SINGLE_RPC=1`) |
| `HEIMDALL_API` | Heimdall REST endpoint for the Heimdall gate |
| `ETHERSCAN_API_KEY` | optional, speeds up the event scan in step 0b |
| `MAX_FEE_GWEI` | fee cap printed with each calldata file (default 30) |
| `PRIVATE_KEY` | only for step 1, a throwaway deployer; never the admin key |

## Sequence

| Phase | Command | Gate before the next phase |
|---|---|---|
| 0. Stop auctions | `node scripts/migration/2a_stopAuctions.js prepare`, sign, then `verify --tx <hash>` | `replacementCoolDown == currentEpoch + 1,000,000,000` |
| 1. Deploy the implementation | `npx hardhat run scripts/migration/1_deployStakeManager.js --network mainnet` | Printed codehash equals the one pinned at review; verified on Sourcify |
| 2. Upgrade | `node scripts/migration/2_upgradeProxy.js prepare --impl <impl> --codehash <pinned>`, sign, `verify --tx <hash> --codehash <pinned>` | New implementation; owner, epoch, validator count and total stake unchanged; force functions available |
| 3. Close the validators | For each source: `node scripts/migration/2b_forceUnstakeValidator.js prepare --validator <id> --impl <impl>`, sign, `verify --tx <hash>` | Exactly one `UnstakeInit` per validator; validator count and total stake dropped once each; signer set correct |
| 4a. Allocation | `node scripts/migration/0b_buildAllocation.js --from 9,10 --to 11,3,2,4,5` | Review and share `allocation.json` / `allocation.csv` |
| 4b. Pilot | `node scripts/migration/3_migrateDelegations.js prepare --pilot --codehash <pinned>`, sign each, `verify --tx <hash>` after each | All green, Heimdall gate green for the touched validators |
| 4c. Batches | `node scripts/migration/3_migrateDelegations.js prepare --codehash <pinned>`, then **one batch at a time**: sign, `verify --tx <hash>` | All green before the next batch; stop on any `✗`, failed delegator or "Out of gas" |
| 5. Finish | `node scripts/migration/3_migrateDelegations.js status`, handle excluded delegators, then `node scripts/migration/2_upgradeProxy.js prepare --rollback`, sign, `verify --tx <hash>` | Sources hold no delegation; implementation is `0x269C…b87A` with codehash `0x8c1e…c908`; force functions revert |

Run the Heimdall gate at any point with
`node scripts/migration/heimdallGate.js 2,3,4,5,9,10,11`.

## Rules

- **The rollback is mandatory.** Nothing from the migration build stays live.
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
- **StakeManager must hold the BONE it pays out.** `prepare` refuses unless the balance covers the
  rewards the moves pay, plus `MIN_MARGIN_BONE` (default 50,000). Refill it first.
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
the admin on the fork, so the rehearsal runs exactly what will be signed.

## Mainnet addresses

| | |
|---|---|
| StakeManagerProxy | `0x65218A41Fb92637254B4f8c97448d3dF343A3064` |
| GovernanceProxy | `0xC476E20c2F7FA3B35aC242aBE71B59e902242f06` |
| StakingInfo | `0x539964b3d225194717fb896D26c8b3E635b8A1aE` |
| Admin (proxy owner, Governance owner) | `0xBab4F3e701F6d2e009Af3C7f1eF2e7dD68225E96` |
| Pre-migration implementation | `0x269C0ebb7a39995dB531Ccd61D015e431530b87A`, codehash `0x8c1e6ae90322d08be42e195f31cad8d23fd2d224858132c9fbef89f99114c908` |
