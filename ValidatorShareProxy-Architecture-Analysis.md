# ValidatorShareProxy Architecture Analysis

## Question

We have ValidatorShareProxy which has updateImplementation which can only be called by contract owner, in our case it is StakingManagerProxy. For doing that we added the same function in StakingManager but this doesn't update the implementation in ValidatorShareProxy. But when we update the same via Registry it updates, why? Can you explain this?

## Answer

This highlights a crucial architectural difference in how the ValidatorShareProxy works compared to a standard proxy.

### The Key Difference: ValidatorShareProxy vs Standard Proxy

#### **Standard Proxy Pattern:**
```solidity
// Standard UpgradableProxy stores implementation in storage
contract StandardProxy {
    bytes32 constant IMPLEMENTATION_SLOT = keccak256("implementation");

    function implementation() external view returns (address) {
        return loadImplementation(); // reads from storage slot
    }

    function updateImplementation(address newImpl) external onlyOwner {
        // writes to storage slot
        setImplementation(newImpl);
    }
}
```

#### **ValidatorShareProxy Pattern:**
```solidity
// ValidatorShareProxy gets implementation from Registry, NOT storage
contract ValidatorShareProxy is UpgradableProxy {
    constructor(address _registry) public UpgradableProxy(_registry) {}

    // @note ValidatorShareProxy gets implementation from Registry, NOT storage
    function loadImplementation() internal view returns (address) {
        return Registry(super.loadImplementation()).getValidatorShareAddress();
        //     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        //     Gets implementation from Registry, not local storage!
    }
}
```

### Why StakeManager's updateImplementation Doesn't Work:

1. **StakeManager calls:** `ValidatorShareProxy.updateImplementation(newImpl)`
2. **This would normally:** Write `newImpl` to the proxy's storage slot
3. **But ValidatorShareProxy.loadImplementation():** Ignores storage and reads from `Registry.getValidatorShareAddress()` instead
4. **Result:** The storage update is ignored because the proxy always asks the Registry for the implementation

### Why Registry Update Works:

1. **We call:** `Registry.updateContractMap(VALIDATOR_SHARE_KEY, newImpl)`
2. **This updates:** `Registry.contractMap[VALIDATOR_SHARE] = newImpl`
3. **ValidatorShareProxy.loadImplementation():** Calls `Registry.getValidatorShareAddress()` which returns the new implementation
4. **Result:** All ValidatorShareProxies immediately use the new implementation

### The Architecture Diagram:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  StakeManager   │───▶│ ValidatorShare   │───▶│   Registry      │
│                 │    │     Proxy        │    │                 │
│ updateValidator │    │                  │    │ contractMap     │
│ ShareImpl()     │    │ loadImpl() {     │    │ [VALIDATOR_     │
│                 │    │   return         │    │  SHARE] = addr  │
│ ❌ BROKEN       │    │   Registry.get   │    │                 │
│ (writes to      │    │   ValidatorShare │    │ ✅ WORKS        │
│  proxy storage  │    │   Address()      │    │ (updates        │
│  but ignored)   │    │ }                │    │  Registry map)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Why This Design Exists:

This centralized Registry pattern allows:
- **Global updates:** All ValidatorShare proxies update simultaneously
- **Governance control:** Only Registry governance can change implementations
- **Consistency:** All validators use the same ValidatorShare implementation

### Conclusion:

The StakeManager's `updateValidatorShareImplementation` function is essentially **broken by design** because it tries to update individual proxies, but the proxy architecture ignores individual updates in favor of the Registry's global implementation address.

The ValidatorShareProxy overrides the standard proxy behavior to always fetch the implementation from the Registry, making the Registry the single source of truth for all ValidatorShare implementations across the system.

This is why our Registry-based approach worked - we were working with the architecture, not against it!

## Key Takeaway

When working with ValidatorShareProxy:
- ❌ **Don't** try to update individual proxy implementations
- ✅ **Do** update the Registry's contractMap[VALIDATOR_SHARE] entry
- The Registry is the single source of truth for ValidatorShare implementations