# Why ChildChain Address Cannot Be Updated

## Overview
Despite the MRC20 contract having a `changeChildChain()` method, it is **impossible to update the childChain address** due to the current contract architecture.

## The Problem

### Contract Architecture

```
MRC20 Contract (0x0000000000000000000000000000000000001010)
├── owner: 0x69120F2Ad38593c84a80973260B1eCdad4085633 (ChildChain contract)
├── Has changeChildChain() function with onlyOwner modifier
└── Only the owner can call changeChildChain()

ChildChain Contract (0x69120F2Ad38593c84a80973260B1eCdad4085633)
├── owner: 0x8B066912dCDA9c9001A84b28F1aBD06e9E19114B (EOA)
├── Functions: addToken, mapToken, withdrawTokens, onStateReceive
└── Does NOT have any function to call changeChildChain() on child tokens
```

## Step-by-Step Explanation

### 1. The changeChildChain() Method Exists
In `ChildToken.sol:80-87`:
```solidity
function changeChildChain(address newAddress) public onlyOwner {
    require(
        newAddress != address(0),
        "Child token: new child address is the zero address"
    );
    emit ChildChainChanged(childChain, newAddress);
    childChain = newAddress;
}
```

This function has the `onlyOwner` modifier, which means **only the contract owner** can call it.

### 2. Who Is the Owner?
The owner of MRC20 is set during initialization in `MRC20.sol:31`:
```solidity
function initialize(address _childChain, address _token) public {
    require(!isInitialized, "The contract is already initialized");
    isInitialized = true;
    token = _token;
    _transferOwnership(_childChain);  // ChildChain contract becomes owner
}
```

The owner is the **ChildChain contract** at address `0x69120F2Ad38593c84a80973260B1eCdad4085633`.

### 3. The ChildChain Contract Cannot Call It
Looking at `ChildChain.sol`, the available functions are:
- `onStateReceive()` - Receives state sync data
- `addToken()` - Creates new child tokens
- `mapToken()` - Maps tokens (testnet only)
- `withdrawTokens()` - Processes withdrawals
- `depositTokens()` - Processes deposits
- Standard Ownable functions: `transferOwnership()`, `renounceOwnership()`

**There is NO function** that allows the ChildChain contract to call `changeChildChain()` on any of its child tokens.

### 4. The Owner of ChildChain Cannot Help
Even though:
- The ChildChain contract has an owner (`0x8B066912dCDA9c9001A84b28F1aBD06e9E19114B`)
- That owner is an EOA (regular wallet) that someone controls

The owner of ChildChain **cannot directly call functions on behalf of the ChildChain contract**. They can only call functions that exist in the ChildChain contract itself.

## Why This Happens

This is a **contract design limitation**:

1. **MRC20's owner is a contract** (ChildChain), not a wallet
2. **Contracts can only execute code they contain** - the ChildChain contract has no code to call `changeChildChain()`
3. **The ChildChain's owner cannot make arbitrary calls** on behalf of the contract
4. **ChildChain is not upgradeable** - it's not a proxy contract, so we cannot add new functionality

## Attempted Solutions That Don't Work

### ❌ Calling changeChildChain() Directly
```bash
cast send 0x0000000000000000000000000000000000001010 \
  "changeChildChain(address)" \
  <NEW_ADDRESS> \
  --rpc-url https://puppynet.shibrpc.com \
  --private-key <OWNER_KEY>
```
**Fails**: The caller is not the owner. Only the ChildChain contract address is the owner.

### ❌ Using ChildChain Owner's Key
Even if you control the ChildChain owner's private key, you cannot make the ChildChain contract execute arbitrary code. You can only call functions defined in ChildChain.sol.

### ❌ Upgrading ChildChain Contract
```bash
cast implementation 0x69120F2Ad38593c84a80973260B1eCdad4085633
# Returns: 0x0000000000000000000000000000000000000000
```
**Result**: ChildChain is not a proxy contract. It cannot be upgraded.

## The Same Problem Applies To

This issue affects all ownership and configuration functions on MRC20:
- ❌ `changeChildChain()` - Cannot be called
- ❌ `transferOwnership()` - Cannot be called
- ❌ `renounceOwnership()` - Cannot be called
- ❌ `setParent()` - Already disabled (reverts) in MRC20.sol:34-36

## Conclusion

The childChain address (and ownership) of the MRC20 contract is **permanently locked** due to an architectural limitation where:
1. The function exists but requires the owner to call it
2. The owner is a contract that has no mechanism to make the call
3. The owner contract is not upgradeable

This is an **irrevocable situation** with the current contract deployment.

## Contract Addresses (Puppynet)

- MRC20: `0x0000000000000000000000000000000000001010`
- ChildChain (MRC20 owner): `0x69120F2Ad38593c84a80973260B1eCdad4085633`
- ChildChain owner (EOA): `0x8B066912dCDA9c9001A84b28F1aBD06e9E19114B`

## Date
Generated: 2026-01-02
