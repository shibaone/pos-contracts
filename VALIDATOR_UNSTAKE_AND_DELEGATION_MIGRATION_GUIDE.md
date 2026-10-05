# Validator Unstaking and Delegation Migration Guide

This document explains the complete process for validators to unstake and for delegators to migrate their stake or fully exit the system.

---

## Table of Contents

1. [Overview](#overview)
2. [Process 1: Validator Unstaking](#process-1-validator-unstaking)
3. [Process 2: Delegator Migration After Validator Unstake](#process-2-delegator-migration-after-validator-unstake)
4. [Process 3: Delegator Full Exit (Alternative)](#process-3-delegator-full-exit-alternative)
5. [Code Examples](#code-examples)
6. [Important Constants and Addresses](#important-constants-and-addresses)

---

## Overview

When a validator decides to close their node and exit the system, there are specific steps they must follow. Delegators who have staked with that validator have two options:
- **Option 1:** Migrate their stake to another active validator
- **Option 2:** Fully unstake and withdraw their funds

### Key Timeline Concepts

- **Epoch**: A checkpoint period in the system (updated when checkpoints are submitted)
- **Deactivation Epoch**: The epoch when a validator begins the unstaking process
- **Withdrawal Delay**: The number of epochs a user must wait before claiming unstaked funds
- **Checkpoint Submission**: The process that advances the current epoch

---

## Process 1: Validator Unstaking

### Overview
When a validator wants to close their node and unstake, they must initiate the unstaking process and wait for a withdrawal delay period before claiming their funds.

### Step 1.1: Check Validator Status

Before unstaking, verify there are no ongoing auctions for your validator.

**Contract:** `StakeManager.sol`  
**Function:**
```solidity
mapping(uint256 => Auction) public validatorAuction;
```

**Check:**
```javascript
const auction = await stakeManager.validatorAuction(validatorId);
require(auction.amount == 0, "Auction ongoing");
```

### Step 1.2: Initiate Unstake

The validator owner (NFT holder) calls the unstake function.

**Contract:** `StakeManager.sol` (line 356)  
**Function:**
```solidity
function unstake(uint256 validatorId) external onlyStaker(validatorId)
```

**Requirements:**
- Caller must be the owner of the validator NFT
- No ongoing auction for the validator
- Validator must be in Active or Locked status
- `activationEpoch > 0` and `deactivationEpoch == 0`

**What Happens Internally:**
```solidity
// Line 365
uint256 exitEpoch = currentEpoch.add(1); // notice period
_unstake(validatorId, exitEpoch);

// Inside _unstake (line 921-946):
// 1. Update rewards
_updateRewards(validatorId);

// 2. Set deactivation epoch
validators[validatorId].deactivationEpoch = exitEpoch;

// 3. Lock the ValidatorShare contract (prevents new delegations)
address delegationContract = validators[validatorId].contractAddress;
if (delegationContract != address(0)) {
    IValidatorShare(delegationContract).lock();
}

// 4. Remove signer and liquidate validator rewards
_removeSigner(validators[validatorId].signer);
_liquidateRewards(validatorId, validator);

// 5. Update timeline
updateTimeline(-(int256(amount) + delegationAmount), -1, targetEpoch);
```

**Code Example:**
```javascript
// Web3.js / Ethers.js example
const StakeManager = new ethers.Contract(
    STAKE_MANAGER_ADDRESS,
    STAKE_MANAGER_ABI,
    signer
);

// Initiate unstake
const tx = await StakeManager.unstake(validatorId);
await tx.wait();

console.log(`Validator ${validatorId} unstake initiated`);
console.log(`Deactivation Epoch: ${currentEpoch + 1}`);
```

### Step 1.3: Monitor Delegated Amount

After unstaking, monitor how many delegators have migrated or exited.

**Contract:** `StakeManager.sol`  
**Function:**
```solidity
function delegatedAmount(uint256 validatorId) public view returns (uint256)
```

**Code Example:**
```javascript
const delegatedAmt = await StakeManager.delegatedAmount(validatorId);
console.log(`Remaining delegated amount: ${ethers.utils.formatEther(delegatedAmt)} BONE`);
```

### Step 1.4: Wait for Withdrawal Delay

After the deactivation epoch plus withdrawal delay period has passed, you can claim your stake.

**Get Current Epoch:**
```solidity
uint256 public currentEpoch;
```

**Get Withdrawal Delay:**
```solidity
uint256 public WITHDRAWAL_DELAY;
```

**Code Example:**
```javascript
const validator = await StakeManager.validators(validatorId);
const currentEpoch = await StakeManager.currentEpoch();
const withdrawalDelay = await StakeManager.WITHDRAWAL_DELAY();

const deactivationEpoch = validator.deactivationEpoch;
const canClaimAtEpoch = deactivationEpoch.add(withdrawalDelay);

if (currentEpoch >= canClaimAtEpoch) {
    console.log("Can claim validator stake now!");
} else {
    console.log(`Must wait ${canClaimAtEpoch.sub(currentEpoch)} more epochs`);
}
```

### Step 1.5: Claim Validator Stake

Once the withdrawal delay has passed, claim your validator stake.

**Contract:** `StakeManager.sol` (line 392)  
**Function:**
```solidity
function unstakeClaim(uint256 validatorId) public onlyStaker(validatorId)
```

**Requirements:**
- Caller must be validator owner
- `deactivationEpoch > 0`
- `deactivationEpoch + WITHDRAWAL_DELAY <= currentEpoch`
- Validator status is not already Unstaked
- Caller must not be withdrawal-blacklisted

**What Happens:**
```solidity
// Line 400-417
uint256 amount = validators[validatorId].amount;
totalStaked = totalStaked.sub(amount);

// Claim last checkpoint reward if signed
_liquidateRewards(validatorId, msg.sender);

// Burn the validator NFT
NFTContract.burn(validatorId);

// Reset validator state
validators[validatorId].amount = 0;
validators[validatorId].status = Status.Unstaked;

// Transfer tokens to validator owner
_transferToken(msg.sender, amount);
```

**Code Example:**
```javascript
// Claim validator stake
const tx = await StakeManager.unstakeClaim(validatorId);
await tx.wait();

console.log("Validator stake claimed successfully!");
```

---

## Process 2: Delegator Migration After Validator Unstake

### Overview
Delegators can migrate their stake to another validator after the unstaking validator's checkpoint has passed. This allows them to continue earning rewards without going through a full unstake/restake cycle.

### Step 2.1: Wait for Checkpoint to Pass

**CRITICAL:** Migration is blocked during the unstaking epoch. Delegators must wait for the next checkpoint to be submitted.

**Contract:** `StakeManager.sol` (line 459-473)  
**Function Called During Migration:**
```solidity
function updateValidatorState(uint256 validatorId, int256 amount) public onlyDelegation(validatorId) {
    if (amount > 0) {
        // deposit during shares purchase
        require(delegationEnabled, "Delegation is disabled");
    }

    uint256 deactivationEpoch = validators[validatorId].deactivationEpoch;

    if (deactivationEpoch == 0) {
        // modify timeline only if validator didn't unstake
        updateTimeline(amount, 0, 0);
    } else if (deactivationEpoch > currentEpoch) {
        // ⚠️ MIGRATION BLOCKED: validator just unstaked, need to wait till next checkpoint
        revert("unstaking");
    }
    
    // ✅ After checkpoint passes (currentEpoch >= deactivationEpoch), this passes
    // and migration proceeds
}
```

**Checkpoint Submission Process:**

Checkpoints are submitted by validators through the RootChain contract:

**Contract:** `StakeManager.sol` (line 125-157)  
**Function:**
```solidity
function checkSignatures(
    uint256 blockInterval,
    bytes32 voteHash,
    bytes32 stateRoot,
    address proposer,
    uint[3][] calldata sigs
) external onlyRootChain returns (uint256)
```

This function is called by RootChain when a checkpoint is submitted. It internally calls:

```solidity
// Line 948-958
function _finalizeCommit() internal {
    uint256 _currentEpoch = currentEpoch;
    uint256 nextEpoch = _currentEpoch.add(1);

    StateChange memory changes = validatorStateChanges[nextEpoch];
    updateTimeline(changes.amount, changes.stakerCount, 0);

    delete validatorStateChanges[_currentEpoch];

    currentEpoch = nextEpoch;  // ✅ EPOCH ADVANCES HERE
}
```

**Check If Migration Is Available:**

```javascript
async function canMigrate(validatorId) {
    const validator = await stakeManager.validators(validatorId);
    const currentEpoch = await stakeManager.currentEpoch();
    
    // If validator hasn't unstaked, can always migrate
    if (validator.deactivationEpoch.eq(0)) {
        return {
            canMigrate: true,
            reason: "Validator is active"
        };
    }
    
    // If validator unstaked, check if checkpoint has passed
    if (currentEpoch.gte(validator.deactivationEpoch)) {
        return {
            canMigrate: true,
            reason: "Checkpoint has passed, migration available"
        };
    }
    
    return {
        canMigrate: false,
        reason: `Must wait for checkpoint. Current: ${currentEpoch}, Need: ${validator.deactivationEpoch}`,
        epochsToWait: validator.deactivationEpoch.sub(currentEpoch)
    };
}
```

### Step 2.2: Check Delegator's Current Stake

Before migrating, check how much is staked with the validator.

**Contract:** `ValidatorShare.sol` (line 80)  
**Function:**
```solidity
function getTotalStake(address user) public view returns (uint256, uint256)
```

**Returns:**
- `uint256`: Total staked amount for the user
- `uint256`: Current exchange rate

**Code Example:**
```javascript
const validatorShareAddress = validator.contractAddress;
const ValidatorShare = new ethers.Contract(
    validatorShareAddress,
    VALIDATOR_SHARE_ABI,
    provider
);

const [totalStake, rate] = await ValidatorShare.getTotalStake(delegatorAddress);
console.log(`Delegator has ${ethers.utils.formatEther(totalStake)} BONE staked`);
```

### Step 2.3: Execute Migration

Call the migration function to move stake to another validator.

**Contract:** `StakeManager.sol` (line 452)  
**Function:**
```solidity
function migrateDelegation(
    uint256 fromValidatorId, 
    uint256 toValidatorId, 
    uint256 amount
) public
```

**Requirements:**
- `toValidatorId > 7` (can only migrate to non-foundation validators)
- Delegator must have sufficient stake in `fromValidatorId`
- If `fromValidatorId` has unstaked: `currentEpoch >= deactivationEpoch` (checkpoint must have passed)

**What Happens Internally:**
```solidity
// Line 455-456
IValidatorShare(validators[fromValidatorId].contractAddress).migrateOut(msg.sender, amount);
IValidatorShare(validators[toValidatorId].contractAddress).migrateIn(msg.sender, amount);
```

**migrateOut Process (ValidatorShare.sol, line 165-180):**
```solidity
function migrateOut(address user, uint256 amount) external onlyOwner {
    // 1. Withdraw and transfer any pending rewards to user
    _withdrawAndTransferReward(user);
    
    // 2. Check user has enough stake
    (uint256 totalStaked, uint256 rate) = getTotalStake(user);
    require(totalStaked >= amount, "Migrating too much");

    // 3. Burn shares from user
    uint256 precision = _getRatePrecision();
    uint256 shares = amount.mul(precision).div(rate);
    _burn(user, shares);

    // 4. Update validator state and active amount
    stakeManager.updateValidatorState(validatorId, -int256(amount));
    activeAmount = activeAmount.sub(amount);
    
    // 5. Log events
    stakingLogger.logShareBurned(validatorId, user, amount, shares);
}
```

**migrateIn Process (ValidatorShare.sol, line 182-185):**
```solidity
function migrateIn(address user, uint256 amount) external onlyOwner {
    // 1. Withdraw and transfer any pending rewards to user
    _withdrawAndTransferReward(user);
    
    // 2. Buy shares in new validator (same as regular delegation)
    _buyShares(amount, 0, user);
}
```

**Code Example:**
```javascript
async function migrateStake(fromValidatorId, toValidatorId, amount) {
    // 1. Check if migration is available
    const migrationStatus = await canMigrate(fromValidatorId);
    if (!migrationStatus.canMigrate) {
        throw new Error(migrationStatus.reason);
    }
    
    // 2. Get user's stake
    const validator = await stakeManager.validators(fromValidatorId);
    const validatorShare = new ethers.Contract(
        validator.contractAddress,
        VALIDATOR_SHARE_ABI,
        signer
    );
    
    const [totalStake] = await validatorShare.getTotalStake(await signer.getAddress());
    
    if (totalStake.lt(amount)) {
        throw new Error("Insufficient stake to migrate");
    }
    
    // 3. Execute migration
    const tx = await stakeManager.migrateDelegation(
        fromValidatorId,
        toValidatorId,
        amount
    );
    
    console.log("Migration transaction submitted:", tx.hash);
    const receipt = await tx.wait();
    console.log("Migration successful!");
    
    return receipt;
}

// Example usage: Migrate all stake
const [totalStake] = await validatorShare.getTotalStake(delegatorAddress);
await migrateStake(oldValidatorId, newValidatorId, totalStake);
```

### Step 2.4: Verify Migration Success

After migration, verify the stake has moved to the new validator.

**Code Example:**
```javascript
// Check old validator
const oldValidatorShare = new ethers.Contract(
    oldValidator.contractAddress,
    VALIDATOR_SHARE_ABI,
    provider
);
const [oldStake] = await oldValidatorShare.getTotalStake(delegatorAddress);

// Check new validator
const newValidatorShare = new ethers.Contract(
    newValidator.contractAddress,
    VALIDATOR_SHARE_ABI,
    provider
);
const [newStake] = await newValidatorShare.getTotalStake(delegatorAddress);

console.log(`Old validator stake: ${ethers.utils.formatEther(oldStake)} BONE`);
console.log(`New validator stake: ${ethers.utils.formatEther(newStake)} BONE`);
```

---

## Process 3: Delegator Full Exit (Alternative)

### Overview
If a delegator prefers to fully exit instead of migrating, they can unstake their delegation and withdraw their funds after the withdrawal delay period.

### Step 3.1: Check Current Stake and Pending Rewards

**Contract:** `ValidatorShare.sol`  
**Functions:**
```solidity
// Line 80
function getTotalStake(address user) public view returns (uint256, uint256)

// Line 103
function getLiquidRewards(address user) public view returns (uint256)
```

**Code Example:**
```javascript
const validatorShare = new ethers.Contract(
    validator.contractAddress,
    VALIDATOR_SHARE_ABI,
    provider
);

const [totalStake] = await validatorShare.getTotalStake(delegatorAddress);
const liquidRewards = await validatorShare.getLiquidRewards(delegatorAddress);

console.log(`Staked: ${ethers.utils.formatEther(totalStake)} BONE`);
console.log(`Pending Rewards: ${ethers.utils.formatEther(liquidRewards)} BONE`);
```

### Step 3.2: (Optional) Withdraw Rewards First

Delegators can claim their pending rewards before unstaking.

**Contract:** `ValidatorShare.sol` (line 160)  
**Function:**
```solidity
function withdrawRewards() public
```

**Requirements:**
- Rewards must be >= `minAmount` (default: 1 BONE)

**Code Example:**
```javascript
const liquidRewards = await validatorShare.getLiquidRewards(delegatorAddress);
const minAmount = await validatorShare.minAmount();

if (liquidRewards.gte(minAmount)) {
    const tx = await validatorShare.connect(signer).withdrawRewards();
    await tx.wait();
    console.log("Rewards withdrawn successfully!");
}
```

### Step 3.3: Initiate Unstake (Sell Voucher)

Start the unstaking process by selling your validator shares.

**Contract:** `ValidatorShare.sol` (line 209)  
**Function (New API - Recommended):**
```solidity
function sellVoucher_new(uint256 claimAmount, uint256 maximumSharesToBurn) public
```

**Alternative (Legacy API):**
```solidity
// Line 146
function sellVoucher(uint256 claimAmount, uint256 maximumSharesToBurn) public
```

**Parameters:**
- `claimAmount`: Amount of tokens to unstake (in wei)
- `maximumSharesToBurn`: Maximum shares willing to burn (slippage protection)

**What Happens Internally:**
```solidity
// Calls _sellVoucher (line 304-324)
function _sellVoucher(uint256 claimAmount, uint256 maximumSharesToBurn) private {
    // 1. Check user has enough stake
    (uint256 totalStaked, uint256 rate) = getTotalStake(msg.sender);
    require(totalStaked >= claimAmount, "Too much requested");

    // 2. Calculate shares to burn
    uint256 shares = claimAmount.mul(precision).div(rate);
    require(shares <= maximumSharesToBurn, "too much slippage");

    // 3. Withdraw any pending rewards
    _withdrawAndTransferReward(msg.sender);

    // 4. Burn shares
    _burn(msg.sender, shares);
    
    // 5. Update validator state
    stakeManager.updateValidatorState(validatorId, -int256(claimAmount));
    activeAmount = activeAmount.sub(claimAmount);

    // 6. Add to withdraw pool
    uint256 _withdrawPoolShare = claimAmount.mul(precision).div(withdrawExchangeRate());
    withdrawPool = withdrawPool.add(claimAmount);
    withdrawShares = withdrawShares.add(_withdrawPoolShare);
}

// For new API, creates unbond record with nonce
uint256 unbondNonce = unbondNonces[msg.sender].add(1);
DelegatorUnbond memory unbond = DelegatorUnbond({
    shares: _withdrawPoolShare, 
    withdrawEpoch: stakeManager.epoch()
});
unbonds_new[msg.sender][unbondNonce] = unbond;
unbondNonces[msg.sender] = unbondNonce;
```

**Code Example:**
```javascript
async function initiateUnstake(amount) {
    const validatorShare = new ethers.Contract(
        validator.contractAddress,
        VALIDATOR_SHARE_ABI,
        signer
    );
    
    // Get current exchange rate for slippage calculation
    const [totalStake, rate] = await validatorShare.getTotalStake(
        await signer.getAddress()
    );
    
    // Calculate shares with 1% slippage tolerance
    const precision = validatorId < 8 ? 100 : ethers.BigNumber.from(10).pow(29);
    const shares = amount.mul(precision).div(rate);
    const maxShares = shares.mul(101).div(100); // 1% slippage
    
    // Initiate unstake using new API
    const tx = await validatorShare.sellVoucher_new(amount, maxShares);
    const receipt = await tx.wait();
    
    // Get unbond nonce from events
    const event = receipt.events.find(e => e.event === 'ShareBurnedWithId');
    const unbondNonce = event.args.nonce;
    
    console.log(`Unstake initiated! Unbond nonce: ${unbondNonce}`);
    
    return unbondNonce;
}

// Example: Unstake all
const [totalStake] = await validatorShare.getTotalStake(delegatorAddress);
const unbondNonce = await initiateUnstake(totalStake);
```

### Step 3.4: Wait for Withdrawal Delay

After initiating unstake, wait for the withdrawal delay period.

**Get Withdrawal Delay:**
```solidity
// StakeManager.sol
function withdrawalDelay() external view returns (uint256)
```

**Code Example:**
```javascript
async function canClaimUnstake(unbondNonce) {
    const validatorShare = new ethers.Contract(
        validator.contractAddress,
        VALIDATOR_SHARE_ABI,
        provider
    );
    
    const unbond = await validatorShare.unbonds_new(delegatorAddress, unbondNonce);
    const withdrawalDelay = await stakeManager.withdrawalDelay();
    const currentEpoch = await stakeManager.currentEpoch();
    
    const canClaimAt = unbond.withdrawEpoch.add(withdrawalDelay);
    
    if (currentEpoch.gte(canClaimAt)) {
        return {
            canClaim: true,
            message: "Can claim now!"
        };
    } else {
        return {
            canClaim: false,
            epochsRemaining: canClaimAt.sub(currentEpoch),
            message: `Must wait ${canClaimAt.sub(currentEpoch)} more epochs`
        };
    }
}
```

### Step 3.5: Claim Unstaked Tokens

After the withdrawal delay, claim your tokens.

**Contract:** `ValidatorShare.sol` (line 222)  
**Function (New API - Recommended):**
```solidity
function unstakeClaimTokens_new(uint256 unbondNonce) public
```

**Alternative (Legacy API):**
```solidity
// Line 187
function unstakeClaimTokens() public
```

**Requirements:**
- `withdrawEpoch + withdrawalDelay <= currentEpoch`
- Unbond must exist and have shares > 0

**What Happens:**
```solidity
// Line 327-337
function _unstakeClaimTokens(DelegatorUnbond memory unbond) private {
    uint256 shares = unbond.shares;
    require(
        unbond.withdrawEpoch.add(stakeManager.withdrawalDelay()) <= stakeManager.epoch() 
        && shares > 0, 
        "Incomplete withdrawal period"
    );

    // Calculate amount based on withdraw exchange rate
    uint256 _amount = withdrawExchangeRate().mul(shares).div(_getRatePrecision());
    
    // Update pool accounting
    withdrawShares = withdrawShares.sub(shares);
    withdrawPool = withdrawPool.sub(_amount);

    // Transfer tokens to delegator
    require(stakeManager.transferFunds(validatorId, _amount, msg.sender), "Insufficent rewards");
}

// Delete unbond record
delete unbonds_new[msg.sender][unbondNonce];
```

**Code Example:**
```javascript
async function claimUnstake(unbondNonce) {
    // Check if claim period has passed
    const claimStatus = await canClaimUnstake(unbondNonce);
    if (!claimStatus.canClaim) {
        throw new Error(claimStatus.message);
    }
    
    const validatorShare = new ethers.Contract(
        validator.contractAddress,
        VALIDATOR_SHARE_ABI,
        signer
    );
    
    // Get unbond details
    const unbond = await validatorShare.unbonds_new(
        await signer.getAddress(),
        unbondNonce
    );
    
    // Calculate expected amount
    const withdrawRate = await validatorShare.withdrawExchangeRate();
    const precision = validatorId < 8 ? 100 : ethers.BigNumber.from(10).pow(29);
    const expectedAmount = withdrawRate.mul(unbond.shares).div(precision);
    
    console.log(`Claiming ${ethers.utils.formatEther(expectedAmount)} BONE...`);
    
    // Claim tokens
    const tx = await validatorShare.unstakeClaimTokens_new(unbondNonce);
    await tx.wait();
    
    console.log("Tokens claimed successfully!");
}
```

---

## Code Examples

### Complete UI Integration Example

```javascript
// ============================================================================
// COMPLETE VALIDATOR UNSTAKE & DELEGATOR MIGRATION INTEGRATION
// ============================================================================

import { ethers } from 'ethers';

// Contract ABIs (import these from your artifacts)
import StakeManagerABI from './abis/StakeManager.json';
import ValidatorShareABI from './abis/ValidatorShare.json';

// Contract addresses (set these from your deployment)
const STAKE_MANAGER_ADDRESS = '0x...';

class DelegationManager {
    constructor(provider, signer) {
        this.provider = provider;
        this.signer = signer;
        this.stakeManager = new ethers.Contract(
            STAKE_MANAGER_ADDRESS,
            StakeManagerABI,
            provider
        );
    }

    // ========================================================================
    // VALIDATOR FUNCTIONS
    // ========================================================================

    /**
     * Unstake a validator
     */
    async unstakeValidator(validatorId) {
        const stakeManager = this.stakeManager.connect(this.signer);
        
        // Check if auction is ongoing
        const auction = await stakeManager.validatorAuction(validatorId);
        if (auction.amount.gt(0)) {
            throw new Error('Cannot unstake: auction ongoing');
        }
        
        // Initiate unstake
        const tx = await stakeManager.unstake(validatorId);
        console.log('Unstake transaction:', tx.hash);
        
        const receipt = await tx.wait();
        const currentEpoch = await stakeManager.currentEpoch();
        
        return {
            success: true,
            txHash: receipt.transactionHash,
            deactivationEpoch: currentEpoch.add(1)
        };
    }

    /**
     * Claim validator stake after withdrawal delay
     */
    async claimValidatorStake(validatorId) {
        const stakeManager = this.stakeManager.connect(this.signer);
        
        // Check if can claim
        const validator = await stakeManager.validators(validatorId);
        const currentEpoch = await stakeManager.currentEpoch();
        const withdrawalDelay = await stakeManager.WITHDRAWAL_DELAY();
        
        const canClaimAt = validator.deactivationEpoch.add(withdrawalDelay);
        
        if (currentEpoch.lt(canClaimAt)) {
            throw new Error(
                `Cannot claim yet. Need to wait ${canClaimAt.sub(currentEpoch)} more epochs`
            );
        }
        
        // Claim stake
        const tx = await stakeManager.unstakeClaim(validatorId);
        const receipt = await tx.wait();
        
        return {
            success: true,
            txHash: receipt.transactionHash,
            amount: validator.amount
        };
    }

    // ========================================================================
    // DELEGATOR FUNCTIONS - MIGRATION
    // ========================================================================

    /**
     * Check if migration is available for a validator
     */
    async canMigrate(fromValidatorId) {
        const validator = await this.stakeManager.validators(fromValidatorId);
        const currentEpoch = await this.stakeManager.currentEpoch();
        
        // Not unstaked yet - can always migrate
        if (validator.deactivationEpoch.eq(0)) {
            return {
                canMigrate: true,
                reason: 'Validator is active',
                epochsToWait: 0
            };
        }
        
        // Unstaked - check if checkpoint passed
        if (currentEpoch.gte(validator.deactivationEpoch)) {
            return {
                canMigrate: true,
                reason: 'Checkpoint has passed',
                epochsToWait: 0
            };
        }
        
        // Must wait for checkpoint
        return {
            canMigrate: false,
            reason: 'Waiting for checkpoint',
            epochsToWait: validator.deactivationEpoch.sub(currentEpoch).toNumber()
        };
    }

    /**
     * Get delegator's stake in a validator
     */
    async getDelegatorStake(validatorId, delegatorAddress) {
        const validator = await this.stakeManager.validators(validatorId);
        const validatorShare = new ethers.Contract(
            validator.contractAddress,
            ValidatorShareABI,
            this.provider
        );
        
        const [totalStake, rate] = await validatorShare.getTotalStake(delegatorAddress);
        const liquidRewards = await validatorShare.getLiquidRewards(delegatorAddress);
        
        return {
            totalStake,
            exchangeRate: rate,
            liquidRewards,
            totalStakeFormatted: ethers.utils.formatEther(totalStake),
            liquidRewardsFormatted: ethers.utils.formatEther(liquidRewards)
        };
    }

    /**
     * Migrate delegation from one validator to another
     */
    async migrateDelegation(fromValidatorId, toValidatorId, amount) {
        // Check if migration is available
        const migrationStatus = await this.canMigrate(fromValidatorId);
        if (!migrationStatus.canMigrate) {
            throw new Error(
                `Migration not available: ${migrationStatus.reason}. ` +
                `Wait ${migrationStatus.epochsToWait} epochs.`
            );
        }
        
        // Check stake
        const userAddress = await this.signer.getAddress();
        const stakeInfo = await this.getDelegatorStake(fromValidatorId, userAddress);
        
        if (stakeInfo.totalStake.lt(amount)) {
            throw new Error(
                `Insufficient stake. Have: ${stakeInfo.totalStakeFormatted}, ` +
                `Trying to migrate: ${ethers.utils.formatEther(amount)}`
            );
        }
        
        // Validate target validator
        if (toValidatorId <= 7) {
            throw new Error('Cannot migrate to foundation validators (ID must be > 7)');
        }
        
        // Execute migration
        const stakeManager = this.stakeManager.connect(this.signer);
        const tx = await stakeManager.migrateDelegation(
            fromValidatorId,
            toValidatorId,
            amount
        );
        
        console.log('Migration transaction:', tx.hash);
        const receipt = await tx.wait();
        
        return {
            success: true,
            txHash: receipt.transactionHash,
            amount,
            amountFormatted: ethers.utils.formatEther(amount),
            fromValidatorId,
            toValidatorId
        };
    }

    // ========================================================================
    // DELEGATOR FUNCTIONS - FULL EXIT
    // ========================================================================

    /**
     * Initiate unstake (sell voucher)
     */
    async initiateUnstake(validatorId, amount, slippagePercent = 1) {
        const userAddress = await this.signer.getAddress();
        const validator = await this.stakeManager.validators(validatorId);
        
        const validatorShare = new ethers.Contract(
            validator.contractAddress,
            ValidatorShareABI,
            this.signer
        );
        
        // Get exchange rate for slippage calculation
        const [totalStake, rate] = await validatorShare.getTotalStake(userAddress);
        
        if (totalStake.lt(amount)) {
            throw new Error('Insufficient stake');
        }
        
        // Calculate max shares with slippage
        const precision = validatorId < 8 
            ? ethers.BigNumber.from(100)
            : ethers.BigNumber.from(10).pow(29);
        
        const shares = amount.mul(precision).div(rate);
        const maxShares = shares.mul(100 + slippagePercent).div(100);
        
        // Sell voucher
        const tx = await validatorShare.sellVoucher_new(amount, maxShares);
        const receipt = await tx.wait();
        
        // Get unbond nonce from event
        const iface = new ethers.utils.Interface(ValidatorShareABI);
        const log = receipt.logs.find(log => {
            try {
                const parsed = iface.parseLog(log);
                return parsed.name === 'ShareBurnedWithId';
            } catch {
                return false;
            }
        });
        
        const parsedLog = iface.parseLog(log);
        const unbondNonce = parsedLog.args.nonce;
        
        const currentEpoch = await this.stakeManager.currentEpoch();
        
        return {
            success: true,
            txHash: receipt.transactionHash,
            unbondNonce,
            withdrawEpoch: currentEpoch,
            amount,
            amountFormatted: ethers.utils.formatEther(amount)
        };
    }

    /**
     * Check if unstake claim is available
     */
    async canClaimUnstake(validatorId, delegatorAddress, unbondNonce) {
        const validator = await this.stakeManager.validators(validatorId);
        const validatorShare = new ethers.Contract(
            validator.contractAddress,
            ValidatorShareABI,
            this.provider
        );
        
        const unbond = await validatorShare.unbonds_new(delegatorAddress, unbondNonce);
        
        if (unbond.shares.eq(0)) {
            return {
                canClaim: false,
                reason: 'Unbond not found or already claimed'
            };
        }
        
        const withdrawalDelay = await this.stakeManager.withdrawalDelay();
        const currentEpoch = await this.stakeManager.currentEpoch();
        const canClaimAt = unbond.withdrawEpoch.add(withdrawalDelay);
        
        if (currentEpoch.gte(canClaimAt)) {
            // Calculate expected amount
            const withdrawRate = await validatorShare.withdrawExchangeRate();
            const precision = validatorId < 8 
                ? ethers.BigNumber.from(100)
                : ethers.BigNumber.from(10).pow(29);
            const expectedAmount = withdrawRate.mul(unbond.shares).div(precision);
            
            return {
                canClaim: true,
                expectedAmount,
                expectedAmountFormatted: ethers.utils.formatEther(expectedAmount)
            };
        }
        
        return {
            canClaim: false,
            reason: 'Withdrawal period not complete',
            epochsRemaining: canClaimAt.sub(currentEpoch).toNumber(),
            canClaimAt: canClaimAt.toNumber()
        };
    }

    /**
     * Claim unstaked tokens
     */
    async claimUnstake(validatorId, unbondNonce) {
        const userAddress = await this.signer.getAddress();
        const claimStatus = await this.canClaimUnstake(
            validatorId,
            userAddress,
            unbondNonce
        );
        
        if (!claimStatus.canClaim) {
            throw new Error(`Cannot claim: ${claimStatus.reason}`);
        }
        
        const validator = await this.stakeManager.validators(validatorId);
        const validatorShare = new ethers.Contract(
            validator.contractAddress,
            ValidatorShareABI,
            this.signer
        );
        
        const tx = await validatorShare.unstakeClaimTokens_new(unbondNonce);
        const receipt = await tx.wait();
        
        return {
            success: true,
            txHash: receipt.transactionHash,
            amount: claimStatus.expectedAmount,
            amountFormatted: claimStatus.expectedAmountFormatted
        };
    }

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    /**
     * Get current epoch
     */
    async getCurrentEpoch() {
        return await this.stakeManager.currentEpoch();
    }

    /**
     * Get withdrawal delay
     */
    async getWithdrawalDelay() {
        return await this.stakeManager.withdrawalDelay();
    }

    /**
     * Monitor validator status
     */
    async getValidatorStatus(validatorId) {
        const validator = await this.stakeManager.validators(validatorId);
        const currentEpoch = await this.stakeManager.currentEpoch();
        const delegatedAmt = await this.stakeManager.delegatedAmount(validatorId);
        
        return {
            amount: validator.amount,
            delegatedAmount: delegatedAmt,
            activationEpoch: validator.activationEpoch,
            deactivationEpoch: validator.deactivationEpoch,
            status: validator.status,
            contractAddress: validator.contractAddress,
            isActive: validator.deactivationEpoch.eq(0),
            currentEpoch,
            amountFormatted: ethers.utils.formatEther(validator.amount),
            delegatedAmountFormatted: ethers.utils.formatEther(delegatedAmt)
        };
    }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

async function example() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const manager = new DelegationManager(provider, signer);
    
    // Example 1: Validator unstakes
    const unstakeResult = await manager.unstakeValidator(1);
    console.log('Validator unstaked:', unstakeResult);
    
    // Example 2: Check if delegators can migrate
    const migrationStatus = await manager.canMigrate(1);
    console.log('Can migrate:', migrationStatus);
    
    // Example 3: Delegator migrates stake
    if (migrationStatus.canMigrate) {
        const amount = ethers.utils.parseEther('100');
        const migrateResult = await manager.migrateDelegation(1, 8, amount);
        console.log('Migration complete:', migrateResult);
    }
    
    // Example 4: Delegator unstakes instead
    const unstakeResult = await manager.initiateUnstake(
        1,
        ethers.utils.parseEther('100')
    );
    console.log('Unstake initiated:', unstakeResult);
    
    // Example 5: Check if can claim
    const claimStatus = await manager.canClaimUnstake(
        1,
        await signer.getAddress(),
        unstakeResult.unbondNonce
    );
    console.log('Can claim:', claimStatus);
    
    // Example 6: Claim tokens
    if (claimStatus.canClaim) {
        const claimResult = await manager.claimUnstake(1, unstakeResult.unbondNonce);
        console.log('Claim complete:', claimResult);
    }
}
```

---

## Important Constants and Addresses

### Key Parameters

```solidity
// StakeManager.sol
uint256 public WITHDRAWAL_DELAY;  // Epochs to wait before claiming
uint256 public currentEpoch;      // Current checkpoint epoch
uint256 public minDeposit;        // Minimum validator deposit

// ValidatorShare.sol
uint256 public minAmount;         // Minimum amount (default: 1e18 = 1 BONE)
```

### Contract Addresses

```javascript
// Update these with your deployed addresses
const STAKE_MANAGER_ADDRESS = '0x...';
const GOVERNANCE_ADDRESS = '0x...';
const REGISTRY_ADDRESS = '0x...';
const BONE_TOKEN_ADDRESS = '0x...';
```

### Getting ValidatorShare Address

```javascript
// ValidatorShare address is stored in the validator struct
const validator = await stakeManager.validators(validatorId);
const validatorShareAddress = validator.contractAddress;
```

---

## Summary

### Validator Unstaking Flow
1. Call `unstake(validatorId)` → Sets deactivation epoch
2. Wait `WITHDRAWAL_DELAY` epochs
3. Call `unstakeClaim(validatorId)` → Receives validator stake

### Delegator Migration Flow (After Validator Unstakes)
1. Wait for checkpoint to pass (`currentEpoch >= deactivationEpoch`)
2. Call `migrateDelegation(fromId, toId, amount)` → Instant migration
3. Continue earning rewards on new validator

### Delegator Full Exit Flow
1. Call `sellVoucher_new(amount, maxShares)` → Initiates unbonding
2. Wait `withdrawalDelay` epochs
3. Call `unstakeClaimTokens_new(unbondNonce)` → Receives tokens

---

## Notes

- **Foundation Validators**: IDs 0-7 have different exchange rate precision (100 vs 10^29)
- **Slippage Protection**: Always set `maximumSharesToBurn` slightly higher than calculated shares
- **Checkpoint Timing**: Checkpoints are submitted by active validators; timing varies
- **Blacklist**: Users on withdrawal blacklist cannot claim funds
- **Rewards**: Pending rewards are automatically withdrawn during migration and unstaking

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-13  
**Network:** Shibarium (POS Contracts)

