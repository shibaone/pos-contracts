# Blacklist Implementation for WithdrawManager

## Overview

This document describes the implementation of the exit blacklisting mechanism for the Plasma bridge WithdrawManager contract, designed to prevent malicious actors from finalizing withdrawals after a bridge exploit.

## Problem Statement

### Initial Approach: Address-Based Blacklisting
The first implementation attempted to blacklist addresses:
```solidity
mapping(address => bool) public isBlacklisted;
address exitor = exitNft.ownerOf(exitId);
if (isBlacklisted[exitor]) { ... }
```

**Vulnerability:** An attacker can transfer the ExitNFT to a non-blacklisted address and bypass the restriction.

### Second Approach: NFT ID Blacklisting
Blacklisting the NFT token ID was considered, but this approach fails because:
- The ExitNFT token ID is the full `exitId`
- When an exit is deferred (re-queued), the `exitId` changes
- The new `exitId` would not match the blacklisted ID

## Solution: Stable ExitId Blacklisting (Lower 128 Bits)

### The ExitId Structure

The `exitId` in the WithdrawManager is a 256-bit value composed of:
```
exitId = (exitableAt << 128) | stableId

Where:
- Upper 128 bits: exitableAt (timestamp when exit becomes processable)
- Lower 128 bits: stableId (unique, immutable identifier)
```

### Why the Lower 128 Bits Are Stable

The priority queue implementation splits the exitId into two parts:
```solidity
// From _addExitToQueue (line 378):
queue.insert(exitId >> 128, uint256(uint128(exitId)));
//           ^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^
//           timestamp part    stable identifier

// From processExits (lines 235-236):
(exitableAt, exitId) = exitQueue.getMin();
exitId = (exitableAt << 128) | exitId;
```

When an exit is deferred, only the timestamp changes:
```solidity
uint256 deferredAt = exitableAt + (2 * HALF_EXIT_PERIOD);
exitQueue.insert(deferredAt, stableExitId);
//               ^^^^^^^^^^   ^^^^^^^^^^^^
//               new time     SAME stable ID
```

### Implementation Details

#### 1. Storage Mappings (WithdrawManagerStorage.sol:78-84)
```solidity
// blacklist mapping to restrict exits from being finalized
// Uses lower 128 bits of exitId as the stable identifier
mapping(uint128 => bool) public isBlacklistedExit;

// Mapping to store original full exitId for blacklisted exits
// This ensures NFT existence checks pass even after deferral
// Key: stableExitId (lower 128 bits), Value: original full exitId (with original timestamp)
mapping(uint128 => uint256) public blacklistedExitOriginalId;
```

#### 2. Blacklist Check in processExits (WithdrawManager.sol:234-273)
```solidity
(exitableAt, exitId) = exitQueue.getMin();
uint128 stableExitId = uint128(exitId);

// Check if this is a deferred blacklisted exit
// If so, use the original exitId for NFT checks to ensure they pass
uint256 originalExitId = blacklistedExitOriginalId[stableExitId];
uint256 fullExitId;

if (originalExitId != 0) {
    // This is a deferred blacklisted exit - use the stored original exitId
    fullExitId = originalExitId;
} else {
    // Normal exit or first-time blacklisted exit - reconstruct from timestamp
    fullExitId = (exitableAt << 128) | stableExitId;
}

// ... time and deletion checks ...

// Use fullExitId to ensure NFT check passes for deferred blacklisted exits
if (!exitNft.exists(fullExitId)) continue;
address exitor = exitNft.ownerOf(fullExitId);

// Check if exit is blacklisted using stable identifier (lower 128 bits)
if (isBlacklistedExit[stableExitId]) {
    // Store original exitId on first blacklist to preserve NFT reference
    if (blacklistedExitOriginalId[stableExitId] == 0) {
        blacklistedExitOriginalId[stableExitId] = fullExitId;
    }
    // Defer the exit by 2 * HALF_EXIT_PERIOD to push it to back of queue
    uint256 deferredAt = exitableAt + (2 * HALF_EXIT_PERIOD);
    exitQueue.insert(deferredAt, stableExitId);
    emit BlacklistBlocked(fullExitId, exitor, _token);
    continue;
}

exits[fullExitId].owner = exitor;
exitNft.burn(fullExitId);
```

#### 3. Admin Function (WithdrawManager.sol:273-277)
```solidity
function setBlacklistExit(uint128 exitId, bool value) external onlyOwner {
    require(exitId != 0, "INVALID_EXIT_ID");
    isBlacklistedExit[exitId] = value;
    emit ExitBlacklistUpdated(exitId, value);
}
```

#### 4. Events (WithdrawManagerStorage.sol:47)
```solidity
event ExitBlacklistUpdated(uint128 indexed exitId, bool value);
event BlacklistBlocked(uint256 indexed exitId, address indexed user, address indexed token);
```

## Critical Fix: NFT Existence Check After Deferral

### The Problem (Auditor Feedback)

The initial implementation had a critical flaw:

1. When an exit is first created, the NFT is minted with `exitId = (originalTimestamp << 128) | stableId`
2. When blacklisted and deferred, the queue stores `(deferredTimestamp, stableId)`
3. On reprocessing, the code reconstructed: `exitId = (deferredTimestamp << 128) | stableId`
4. **Problem**: The NFT existence check `exitNft.exists(exitId)` failed because the NFT has the ORIGINAL exitId
5. Result: Exit skipped permanently, could never be unblacklisted

### The Solution

Introduced `blacklistedExitOriginalId` mapping to track the original full exitId:

**Key Changes:**
1. **Store original exitId on first blacklist**: Preserves the NFT reference
2. **Use original exitId for all NFT operations**: exists(), ownerOf(), burn()
3. **Use deferred timestamp for queue priority**: Pushes exit to back of queue
4. **Use stable ID for blacklist check**: Remains constant across deferrals

**Flow:**
```
First Processing:
- exitId from queue: (time_original << 128) | stableId
- NFT check: uses exitId (matches NFT)
- Blacklist triggers: stores exitId in blacklistedExitOriginalId[stableId]
- Reinserts: (time_deferred, stableId)

Second Processing (After Deferral):
- exitId from queue: (time_deferred << 128) | stableId
- Retrieves: originalExitId = blacklistedExitOriginalId[stableId]
- NFT check: uses originalExitId ✅ (matches NFT)
- Blacklist still active: reinserts with newer timestamp

When Unblacklisted:
- Retrieves: originalExitId from mapping
- NFT check: passes ✅
- Blacklist check: false ✅
- Exit processes successfully with original exitId
```

## Security Properties

### ✅ Bypass Prevention
- **ExitNFT Transfer**: Blacklist check uses the stable exitId, not the NFT owner
- **Re-queueing**: The lower 128 bits remain constant across deferrals
- **Multiple Attempts**: Each time the exit reaches the front of the queue, it's deferred again
- **NFT Mismatch**: Original exitId is preserved in mapping, ensuring NFT checks always pass

### ✅ Correct Deferral Behavior
- Uses `continue` instead of `return` to allow other exits to process
- Defers by `2 * HALF_EXIT_PERIOD` to push blacklisted exits to back of queue
- Preserves the stable identifier across all re-insertions
- Maintains original exitId reference for NFT operations

### ✅ Reversibility
- Owner can remove an exit from the blacklist by calling `setBlacklistExit(exitId, false)`
- The exit will then process normally using the stored original exitId
- NFT existence check passes because we use the original exitId from the mapping

## Example Scenario

### Initial State
```solidity
exitableAt = 1000000
stableId = 999
exitId = (1000000 << 128) | 999 = 340282366920938463463374607431768210999
```

### First Processing Attempt
```solidity
// Exit reaches front of queue
(exitableAt, exitId) = exitQueue.getMin(); // (1000000, 999)
uint128 stableExitId = uint128(exitId); // = 999

// Check for deferred exit
uint256 originalExitId = blacklistedExitOriginalId[999]; // = 0 (not deferred yet)
uint256 fullExitId = (1000000 << 128) | 999; // Reconstruct from timestamp

// NFT checks use fullExitId
if (!exitNft.exists(fullExitId)) continue; // PASSES ✅
address exitor = exitNft.ownerOf(fullExitId);

// Owner blacklists this exit
setBlacklistExit(999, true);

// During processExits:
if (isBlacklistedExit[999]) { // TRUE
    // Store original exitId on first blacklist
    if (blacklistedExitOriginalId[999] == 0) {
        blacklistedExitOriginalId[999] = fullExitId; // Store original!
    }
    uint256 deferredAt = 1000000 + 604800; // = 1604800
    exitQueue.insert(1604800, 999); // Re-insert with new time
    continue;
}
```

### Second Processing Attempt (After Deferral)
```solidity
// Exit reaches front of queue again
(exitableAt, exitId) = exitQueue.getMin(); // (1604800, 999)
uint128 stableExitId = uint128(exitId); // = 999

// Check for deferred exit
uint256 originalExitId = blacklistedExitOriginalId[999]; // = (1000000 << 128) | 999
uint256 fullExitId = originalExitId; // Use ORIGINAL exitId! ✅

// NFT checks use fullExitId (original)
if (!exitNft.exists(fullExitId)) continue; // PASSES ✅ (NFT has original ID)
address exitor = exitNft.ownerOf(fullExitId); // PASSES ✅

// During processExits:
if (isBlacklistedExit[999]) { // STILL TRUE
    // blacklistedExitOriginalId[999] already set, skip
    uint256 deferredAt = 1604800 + 604800; // = 2209600
    exitQueue.insert(2209600, 999); // Defer again
    continue;
}
```

### After Owner Removes from Blacklist
```solidity
setBlacklistExit(999, false);

// Next time it reaches front of queue:
(exitableAt, exitId) = exitQueue.getMin(); // (2209600, 999)
uint128 stableExitId = uint128(exitId); // = 999

// Check for deferred exit
uint256 originalExitId = blacklistedExitOriginalId[999]; // = (1000000 << 128) | 999
uint256 fullExitId = originalExitId; // Use ORIGINAL exitId! ✅

// NFT checks use fullExitId (original)
if (!exitNft.exists(fullExitId)) continue; // PASSES ✅
address exitor = exitNft.ownerOf(fullExitId); // PASSES ✅

if (isBlacklistedExit[999]) { // FALSE - no longer blacklisted
    // Skip deferral, continue processing exit normally
}

// Exit processes successfully!
exits[fullExitId].owner = exitor;
exitNft.burn(fullExitId); // Burns NFT with ORIGINAL exitId ✅
// ... finalize exit ...
```

## Comparison with Alternative Approaches

| Approach | Bypass by Transfer | Survives Deferral | NFT Check After Deferral | Implementation |
|----------|-------------------|-------------------|--------------------------|----------------|
| Address-based | ❌ No | N/A | N/A | Simple |
| Full exitId | ✅ Yes | ❌ No | ❌ No | Simple |
| Lower 128 bits (initial) | ✅ Yes | ✅ Yes | ❌ No* | Medium |
| Lower 128 bits + originalId mapping | ✅ Yes | ✅ Yes | ✅ Yes | **Implemented** |

*Note: Initial implementation failed because NFT check used reconstructed exitId instead of original.
The fix adds a mapping to preserve the original exitId for NFT operations.

## Usage

### To Blacklist an Exit
```solidity
// Get the stable exitId (lower 128 bits)
uint128 stableExitId = uint128(fullExitId);

// Blacklist the exit
withdrawManager.setBlacklistExit(stableExitId, true);
```

### To Remove from Blacklist
```solidity
withdrawManager.setBlacklistExit(stableExitId, false);
```

### To Check if an Exit is Blacklisted
```solidity
uint128 stableExitId = uint128(fullExitId);
bool isBlacklisted = withdrawManager.isBlacklistedExit(stableExitId);
```

## Gas Considerations

- **Blacklist check**: Single SLOAD (~2,100 gas)
- **Deferral cost**: One priority queue re-insertion (~20,000-30,000 gas)
- **No impact on non-blacklisted exits**: Zero overhead

## Conclusion

This implementation provides a robust, bypass-resistant blacklisting mechanism that:
1. Prevents ExitNFT transfer exploits
2. Survives exit deferrals and re-queueing
3. Allows reversibility for legitimate exits
4. Maintains efficient gas usage
5. Requires minimal code changes

The key insight is using the immutable lower 128 bits of the exitId as the blacklist key, which remains constant across all exit state changes.
