// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface VmSafe {
    type AccountAccessKind is uint8;
    type ForgeContext is uint8;

    struct AccountAccess {
        ChainInfo chainInfo;
        AccountAccessKind kind;
        address account;
        address accessor;
        bool initialized;
        uint256 oldBalance;
        uint256 newBalance;
        bytes deployedCode;
        uint256 value;
        bytes data;
        bool reverted;
        StorageAccess[] storageAccesses;
        uint64 depth;
    }

    struct ChainInfo {
        uint256 forkId;
        uint256 chainId;
    }

    struct DirEntry {
        string errorMessage;
        string path;
        uint64 depth;
        bool isDir;
        bool isSymlink;
    }

    struct EthGetLogs {
        address emitter;
        bytes32[] topics;
        bytes data;
        bytes32 blockHash;
        uint64 blockNumber;
        bytes32 transactionHash;
        uint64 transactionIndex;
        uint256 logIndex;
        bool removed;
    }

    struct FfiResult {
        int32 exitCode;
        bytes stdout;
        bytes stderr;
    }

    struct FsMetadata {
        bool isDir;
        bool isSymlink;
        uint256 length;
        bool readOnly;
        uint256 modified;
        uint256 accessed;
        uint256 created;
    }

    struct Gas {
        uint64 gasLimit;
        uint64 gasTotalUsed;
        uint64 gasMemoryUsed;
        int64 gasRefunded;
        uint64 gasRemaining;
    }

    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    struct Rpc {
        string key;
        string url;
    }

    struct StorageAccess {
        address account;
        bytes32 slot;
        bool isWrite;
        bytes32 previousValue;
        bytes32 newValue;
        bool reverted;
    }

    struct Wallet {
        address addr;
        uint256 publicKeyX;
        uint256 publicKeyY;
        uint256 privateKey;
    }

    function accesses(address target) external returns (bytes32[] memory readSlots, bytes32[] memory writeSlots);
    function addr(uint256 privateKey) external pure returns (address keyAddr);
    function assertApproxEqAbs(uint256 left, uint256 right, uint256 maxDelta) external pure;
    function assertApproxEqAbs(int256 left, int256 right, uint256 maxDelta) external pure;
    function assertApproxEqAbs(int256 left, int256 right, uint256 maxDelta, string memory error) external pure;
    function assertApproxEqAbs(uint256 left, uint256 right, uint256 maxDelta, string memory error) external pure;
    function assertApproxEqAbsDecimal(uint256 left, uint256 right, uint256 maxDelta, uint256 decimals) external pure;
    function assertApproxEqAbsDecimal(int256 left, int256 right, uint256 maxDelta, uint256 decimals) external pure;
    function assertApproxEqAbsDecimal(
        uint256 left,
        uint256 right,
        uint256 maxDelta,
        uint256 decimals,
        string memory error
    ) external pure;
    function assertApproxEqAbsDecimal(
        int256 left,
        int256 right,
        uint256 maxDelta,
        uint256 decimals,
        string memory error
    ) external pure;
    function assertApproxEqRel(uint256 left, uint256 right, uint256 maxPercentDelta, string memory error)
        external
        pure;
    function assertApproxEqRel(uint256 left, uint256 right, uint256 maxPercentDelta) external pure;
    function assertApproxEqRel(int256 left, int256 right, uint256 maxPercentDelta, string memory error) external pure;
    function assertApproxEqRel(int256 left, int256 right, uint256 maxPercentDelta) external pure;
    function assertApproxEqRelDecimal(uint256 left, uint256 right, uint256 maxPercentDelta, uint256 decimals)
        external
        pure;
    function assertApproxEqRelDecimal(
        uint256 left,
        uint256 right,
        uint256 maxPercentDelta,
        uint256 decimals,
        string memory error
    ) external pure;
    function assertApproxEqRelDecimal(int256 left, int256 right, uint256 maxPercentDelta, uint256 decimals)
        external
        pure;
    function assertApproxEqRelDecimal(
        int256 left,
        int256 right,
        uint256 maxPercentDelta,
        uint256 decimals,
        string memory error
    ) external pure;
    function assertEq(bytes32[] memory left, bytes32[] memory right) external pure;
    function assertEq(int256[] memory left, int256[] memory right, string memory error) external pure;
    function assertEq(address left, address right, string memory error) external pure;
    function assertEq(string memory left, string memory right, string memory error) external pure;
    function assertEq(address[] memory left, address[] memory right) external pure;
    function assertEq(address[] memory left, address[] memory right, string memory error) external pure;
    function assertEq(bool left, bool right, string memory error) external pure;
    function assertEq(address left, address right) external pure;
    function assertEq(uint256[] memory left, uint256[] memory right, string memory error) external pure;
    function assertEq(bool[] memory left, bool[] memory right) external pure;
    function assertEq(int256[] memory left, int256[] memory right) external pure;
    function assertEq(int256 left, int256 right, string memory error) external pure;
    function assertEq(bytes32 left, bytes32 right) external pure;
    function assertEq(uint256 left, uint256 right, string memory error) external pure;
    function assertEq(uint256[] memory left, uint256[] memory right) external pure;
    function assertEq(bytes memory left, bytes memory right) external pure;
    function assertEq(uint256 left, uint256 right) external pure;
    function assertEq(bytes32 left, bytes32 right, string memory error) external pure;
    function assertEq(string[] memory left, string[] memory right) external pure;
    function assertEq(bytes32[] memory left, bytes32[] memory right, string memory error) external pure;
    function assertEq(bytes memory left, bytes memory right, string memory error) external pure;
    function assertEq(bool[] memory left, bool[] memory right, string memory error) external pure;
    function assertEq(bytes[] memory left, bytes[] memory right) external pure;
    function assertEq(string[] memory left, string[] memory right, string memory error) external pure;
    function assertEq(string memory left, string memory right) external pure;
    function assertEq(bytes[] memory left, bytes[] memory right, string memory error) external pure;
    function assertEq(bool left, bool right) external pure;
    function assertEq(int256 left, int256 right) external pure;
    function assertEqDecimal(uint256 left, uint256 right, uint256 decimals) external pure;
    function assertEqDecimal(int256 left, int256 right, uint256 decimals) external pure;
    function assertEqDecimal(int256 left, int256 right, uint256 decimals, string memory error) external pure;
    function assertEqDecimal(uint256 left, uint256 right, uint256 decimals, string memory error) external pure;
    function assertFalse(bool condition, string memory error) external pure;
    function assertFalse(bool condition) external pure;
    function assertGe(int256 left, int256 right) external pure;
    function assertGe(int256 left, int256 right, string memory error) external pure;
    function assertGe(uint256 left, uint256 right) external pure;
    function assertGe(uint256 left, uint256 right, string memory error) external pure;
    function assertGeDecimal(uint256 left, uint256 right, uint256 decimals) external pure;
    function assertGeDecimal(int256 left, int256 right, uint256 decimals, string memory error) external pure;
    function assertGeDecimal(uint256 left, uint256 right, uint256 decimals, string memory error) external pure;
    function assertGeDecimal(int256 left, int256 right, uint256 decimals) external pure;
    function assertGt(int256 left, int256 right) external pure;
    function assertGt(uint256 left, uint256 right, string memory error) external pure;
    function assertGt(uint256 left, uint256 right) external pure;
    function assertGt(int256 left, int256 right, string memory error) external pure;
    function assertGtDecimal(int256 left, int256 right, uint256 decimals, string memory error) external pure;
    function assertGtDecimal(uint256 left, uint256 right, uint256 decimals, string memory error) external pure;
    function assertGtDecimal(int256 left, int256 right, uint256 decimals) external pure;
    function assertGtDecimal(uint256 left, uint256 right, uint256 decimals) external pure;
    function assertLe(int256 left, int256 right, string memory error) external pure;
    function assertLe(uint256 left, uint256 right) external pure;
    function assertLe(int256 left, int256 right) external pure;
    function assertLe(uint256 left, uint256 right, string memory error) external pure;
    function assertLeDecimal(int256 left, int256 right, uint256 decimals) external pure;
    function assertLeDecimal(uint256 left, uint256 right, uint256 decimals, string memory error) external pure;
    function assertLeDecimal(int256 left, int256 right, uint256 decimals, string memory error) external pure;
    function assertLeDecimal(uint256 left, uint256 right, uint256 decimals) external pure;
    function assertLt(int256 left, int256 right) external pure;
    function assertLt(uint256 left, uint256 right, string memory error) external pure;
    function assertLt(int256 left, int256 right, string memory error) external pure;
    function assertLt(uint256 left, uint256 right) external pure;
    function assertLtDecimal(uint256 left, uint256 right, uint256 decimals) external pure;
    function assertLtDecimal(int256 left, int256 right, uint256 decimals, string memory error) external pure;
    function assertLtDecimal(uint256 left, uint256 right, uint256 decimals, string memory error) external pure;
    function assertLtDecimal(int256 left, int256 right, uint256 decimals) external pure;
    function assertNotEq(bytes32[] memory left, bytes32[] memory right) external pure;
    function assertNotEq(int256[] memory left, int256[] memory right) external pure;
    function assertNotEq(bool left, bool right, string memory error) external pure;
    function assertNotEq(bytes[] memory left, bytes[] memory right, string memory error) external pure;
    function assertNotEq(bool left, bool right) external pure;
    function assertNotEq(bool[] memory left, bool[] memory right) external pure;
    function assertNotEq(bytes memory left, bytes memory right) external pure;
    function assertNotEq(address[] memory left, address[] memory right) external pure;
    function assertNotEq(int256 left, int256 right, string memory error) external pure;
    function assertNotEq(uint256[] memory left, uint256[] memory right) external pure;
    function assertNotEq(bool[] memory left, bool[] memory right, string memory error) external pure;
    function assertNotEq(string memory left, string memory right) external pure;
    function assertNotEq(address[] memory left, address[] memory right, string memory error) external pure;
    function assertNotEq(string memory left, string memory right, string memory error) external pure;
    function assertNotEq(address left, address right, string memory error) external pure;
    function assertNotEq(bytes32 left, bytes32 right) external pure;
    function assertNotEq(bytes memory left, bytes memory right, string memory error) external pure;
    function assertNotEq(uint256 left, uint256 right, string memory error) external pure;
    function assertNotEq(uint256[] memory left, uint256[] memory right, string memory error) external pure;
    function assertNotEq(address left, address right) external pure;
    function assertNotEq(bytes32 left, bytes32 right, string memory error) external pure;
    function assertNotEq(string[] memory left, string[] memory right, string memory error) external pure;
    function assertNotEq(uint256 left, uint256 right) external pure;
    function assertNotEq(bytes32[] memory left, bytes32[] memory right, string memory error) external pure;
    function assertNotEq(string[] memory left, string[] memory right) external pure;
    function assertNotEq(int256[] memory left, int256[] memory right, string memory error) external pure;
    function assertNotEq(bytes[] memory left, bytes[] memory right) external pure;
    function assertNotEq(int256 left, int256 right) external pure;
    function assertNotEqDecimal(int256 left, int256 right, uint256 decimals) external pure;
    function assertNotEqDecimal(int256 left, int256 right, uint256 decimals, string memory error) external pure;
    function assertNotEqDecimal(uint256 left, uint256 right, uint256 decimals) external pure;
    function assertNotEqDecimal(uint256 left, uint256 right, uint256 decimals, string memory error) external pure;
    function assertTrue(bool condition) external pure;
    function assertTrue(bool condition, string memory error) external pure;
    function assume(bool condition) external pure;
    function breakpoint(string memory char) external;
    function breakpoint(string memory char, bool value) external;
    function broadcast() external;
    function broadcast(address signer) external;
    function broadcast(uint256 privateKey) external;
    function broadcastRawTransaction(bytes memory data) external;
    function closeFile(string memory path) external;
    function computeCreate2Address(bytes32 salt, bytes32 initCodeHash) external pure returns (address);
    function computeCreate2Address(bytes32 salt, bytes32 initCodeHash, address deployer)
        external
        pure
        returns (address);
    function computeCreateAddress(address deployer, uint256 nonce) external pure returns (address);
    function copyFile(string memory from, string memory to) external returns (uint64 copied);
    function createDir(string memory path, bool recursive) external;
    function createWallet(string memory walletLabel) external returns (Wallet memory wallet);
    function createWallet(uint256 privateKey) external returns (Wallet memory wallet);
    function createWallet(uint256 privateKey, string memory walletLabel) external returns (Wallet memory wallet);
    function deployCode(string memory artifactPath, bytes memory constructorArgs)
        external
        returns (address deployedAddress);
    function deployCode(string memory artifactPath) external returns (address deployedAddress);
    function deriveKey(string memory mnemonic, string memory derivationPath, uint32 index, string memory language)
        external
        pure
        returns (uint256 privateKey);
    function deriveKey(string memory mnemonic, uint32 index, string memory language)
        external
        pure
        returns (uint256 privateKey);
    function deriveKey(string memory mnemonic, uint32 index) external pure returns (uint256 privateKey);
    function deriveKey(string memory mnemonic, string memory derivationPath, uint32 index)
        external
        pure
        returns (uint256 privateKey);
    function ensNamehash(string memory name) external pure returns (bytes32);
    function envAddress(string memory name) external view returns (address value);
    function envAddress(string memory name, string memory delim) external view returns (address[] memory value);
    function envBool(string memory name) external view returns (bool value);
    function envBool(string memory name, string memory delim) external view returns (bool[] memory value);
    function envBytes(string memory name) external view returns (bytes memory value);
    function envBytes(string memory name, string memory delim) external view returns (bytes[] memory value);
    function envBytes32(string memory name, string memory delim) external view returns (bytes32[] memory value);
    function envBytes32(string memory name) external view returns (bytes32 value);
    function envExists(string memory name) external view returns (bool result);
    function envInt(string memory name, string memory delim) external view returns (int256[] memory value);
    function envInt(string memory name) external view returns (int256 value);
    function envOr(string memory name, string memory delim, bytes32[] memory defaultValue)
        external
        view
        returns (bytes32[] memory value);
    function envOr(string memory name, string memory delim, int256[] memory defaultValue)
        external
        view
        returns (int256[] memory value);
    function envOr(string memory name, bool defaultValue) external view returns (bool value);
    function envOr(string memory name, address defaultValue) external view returns (address value);
    function envOr(string memory name, uint256 defaultValue) external view returns (uint256 value);
    function envOr(string memory name, string memory delim, bytes[] memory defaultValue)
        external
        view
        returns (bytes[] memory value);
    function envOr(string memory name, string memory delim, uint256[] memory defaultValue)
        external
        view
        returns (uint256[] memory value);
    function envOr(string memory name, string memory delim, string[] memory defaultValue)
        external
        view
        returns (string[] memory value);
    function envOr(string memory name, bytes memory defaultValue) external view returns (bytes memory value);
    function envOr(string memory name, bytes32 defaultValue) external view returns (bytes32 value);
    function envOr(string memory name, int256 defaultValue) external view returns (int256 value);
    function envOr(string memory name, string memory delim, address[] memory defaultValue)
        external
        view
        returns (address[] memory value);
    function envOr(string memory name, string memory defaultValue) external view returns (string memory value);
    function envOr(string memory name, string memory delim, bool[] memory defaultValue)
        external
        view
        returns (bool[] memory value);
    function envString(string memory name, string memory delim) external view returns (string[] memory value);
    function envString(string memory name) external view returns (string memory value);
    function envUint(string memory name) external view returns (uint256 value);
    function envUint(string memory name, string memory delim) external view returns (uint256[] memory value);
    function eth_getLogs(uint256 fromBlock, uint256 toBlock, address target, bytes32[] memory topics)
        external
        returns (EthGetLogs[] memory logs);
    function exists(string memory path) external returns (bool result);
    function ffi(string[] memory commandInput) external returns (bytes memory result);
    function fsMetadata(string memory path) external view returns (FsMetadata memory metadata);
    function getBlobBaseFee() external view returns (uint256 blobBaseFee);
    function getBlockNumber() external view returns (uint256 height);
    function getBlockTimestamp() external view returns (uint256 timestamp);
    function getCode(string memory artifactPath) external view returns (bytes memory creationBytecode);
    function getDeployedCode(string memory artifactPath) external view returns (bytes memory runtimeBytecode);
    function getFoundryVersion() external view returns (string memory version);
    function getLabel(address account) external view returns (string memory currentLabel);
    function getMappingKeyAndParentOf(address target, bytes32 elementSlot)
        external
        returns (bool found, bytes32 key, bytes32 parent);
    function getMappingLength(address target, bytes32 mappingSlot) external returns (uint256 length);
    function getMappingSlotAt(address target, bytes32 mappingSlot, uint256 idx) external returns (bytes32 value);
    function getNonce(address account) external view returns (uint64 nonce);
    function getNonce(Wallet memory wallet) external returns (uint64 nonce);
    function getRecordedLogs() external returns (Log[] memory logs);
    function indexOf(string memory input, string memory key) external pure returns (uint256);
    function isContext(ForgeContext context) external view returns (bool result);
    function isDir(string memory path) external returns (bool result);
    function isFile(string memory path) external returns (bool result);
    function keyExists(string memory json, string memory key) external view returns (bool);
    function keyExistsJson(string memory json, string memory key) external view returns (bool);
    function keyExistsToml(string memory toml, string memory key) external view returns (bool);
    function label(address account, string memory newLabel) external;
    function lastCallGas() external view returns (Gas memory gas);
    function load(address target, bytes32 slot) external view returns (bytes32 data);
    function parseAddress(string memory stringifiedValue) external pure returns (address parsedValue);
    function parseBool(string memory stringifiedValue) external pure returns (bool parsedValue);
    function parseBytes(string memory stringifiedValue) external pure returns (bytes memory parsedValue);
    function parseBytes32(string memory stringifiedValue) external pure returns (bytes32 parsedValue);
    function parseInt(string memory stringifiedValue) external pure returns (int256 parsedValue);
    function parseJson(string memory json) external pure returns (bytes memory abiEncodedData);
    function parseJson(string memory json, string memory key) external pure returns (bytes memory abiEncodedData);
    function parseJsonAddress(string memory json, string memory key) external pure returns (address);
    function parseJsonAddressArray(string memory json, string memory key) external pure returns (address[] memory);
    function parseJsonBool(string memory json, string memory key) external pure returns (bool);
    function parseJsonBoolArray(string memory json, string memory key) external pure returns (bool[] memory);
    function parseJsonBytes(string memory json, string memory key) external pure returns (bytes memory);
    function parseJsonBytes32(string memory json, string memory key) external pure returns (bytes32);
    function parseJsonBytes32Array(string memory json, string memory key) external pure returns (bytes32[] memory);
    function parseJsonBytesArray(string memory json, string memory key) external pure returns (bytes[] memory);
    function parseJsonInt(string memory json, string memory key) external pure returns (int256);
    function parseJsonIntArray(string memory json, string memory key) external pure returns (int256[] memory);
    function parseJsonKeys(string memory json, string memory key) external pure returns (string[] memory keys);
    function parseJsonString(string memory json, string memory key) external pure returns (string memory);
    function parseJsonStringArray(string memory json, string memory key) external pure returns (string[] memory);
    function parseJsonType(string memory json, string memory typeDescription) external pure returns (bytes memory);
    function parseJsonType(string memory json, string memory key, string memory typeDescription)
        external
        pure
        returns (bytes memory);
    function parseJsonTypeArray(string memory json, string memory key, string memory typeDescription)
        external
        pure
        returns (bytes memory);
    function parseJsonUint(string memory json, string memory key) external pure returns (uint256);
    function parseJsonUintArray(string memory json, string memory key) external pure returns (uint256[] memory);
    function parseToml(string memory toml, string memory key) external pure returns (bytes memory abiEncodedData);
    function parseToml(string memory toml) external pure returns (bytes memory abiEncodedData);
    function parseTomlAddress(string memory toml, string memory key) external pure returns (address);
    function parseTomlAddressArray(string memory toml, string memory key) external pure returns (address[] memory);
    function parseTomlBool(string memory toml, string memory key) external pure returns (bool);
    function parseTomlBoolArray(string memory toml, string memory key) external pure returns (bool[] memory);
    function parseTomlBytes(string memory toml, string memory key) external pure returns (bytes memory);
    function parseTomlBytes32(string memory toml, string memory key) external pure returns (bytes32);
    function parseTomlBytes32Array(string memory toml, string memory key) external pure returns (bytes32[] memory);
    function parseTomlBytesArray(string memory toml, string memory key) external pure returns (bytes[] memory);
    function parseTomlInt(string memory toml, string memory key) external pure returns (int256);
    function parseTomlIntArray(string memory toml, string memory key) external pure returns (int256[] memory);
    function parseTomlKeys(string memory toml, string memory key) external pure returns (string[] memory keys);
    function parseTomlString(string memory toml, string memory key) external pure returns (string memory);
    function parseTomlStringArray(string memory toml, string memory key) external pure returns (string[] memory);
    function parseTomlUint(string memory toml, string memory key) external pure returns (uint256);
    function parseTomlUintArray(string memory toml, string memory key) external pure returns (uint256[] memory);
    function parseUint(string memory stringifiedValue) external pure returns (uint256 parsedValue);
    function pauseGasMetering() external;
    function projectRoot() external view returns (string memory path);
    function prompt(string memory promptText) external returns (string memory input);
    function promptAddress(string memory promptText) external returns (address);
    function promptSecret(string memory promptText) external returns (string memory input);
    function promptSecretUint(string memory promptText) external returns (uint256);
    function promptUint(string memory promptText) external returns (uint256);
    function randomAddress() external returns (address);
    function randomUint() external returns (uint256);
    function randomUint(uint256 min, uint256 max) external returns (uint256);
    function readDir(string memory path, uint64 maxDepth) external view returns (DirEntry[] memory entries);
    function readDir(string memory path, uint64 maxDepth, bool followLinks)
        external
        view
        returns (DirEntry[] memory entries);
    function readDir(string memory path) external view returns (DirEntry[] memory entries);
    function readFile(string memory path) external view returns (string memory data);
    function readFileBinary(string memory path) external view returns (bytes memory data);
    function readLine(string memory path) external view returns (string memory line);
    function readLink(string memory linkPath) external view returns (string memory targetPath);
    function record() external;
    function recordLogs() external;
    function rememberKey(uint256 privateKey) external returns (address keyAddr);
    function removeDir(string memory path, bool recursive) external;
    function removeFile(string memory path) external;
    function replace(string memory input, string memory from, string memory to)
        external
        pure
        returns (string memory output);
    function resumeGasMetering() external;
    function rpc(string memory urlOrAlias, string memory method, string memory params)
        external
        returns (bytes memory data);
    function rpc(string memory method, string memory params) external returns (bytes memory data);
    function rpcUrl(string memory rpcAlias) external view returns (string memory json);
    function rpcUrlStructs() external view returns (Rpc[] memory urls);
    function rpcUrls() external view returns (string[2][] memory urls);
    function serializeAddress(string memory objectKey, string memory valueKey, address[] memory values)
        external
        returns (string memory json);
    function serializeAddress(string memory objectKey, string memory valueKey, address value)
        external
        returns (string memory json);
    function serializeBool(string memory objectKey, string memory valueKey, bool[] memory values)
        external
        returns (string memory json);
    function serializeBool(string memory objectKey, string memory valueKey, bool value)
        external
        returns (string memory json);
    function serializeBytes(string memory objectKey, string memory valueKey, bytes[] memory values)
        external
        returns (string memory json);
    function serializeBytes(string memory objectKey, string memory valueKey, bytes memory value)
        external
        returns (string memory json);
    function serializeBytes32(string memory objectKey, string memory valueKey, bytes32[] memory values)
        external
        returns (string memory json);
    function serializeBytes32(string memory objectKey, string memory valueKey, bytes32 value)
        external
        returns (string memory json);
    function serializeInt(string memory objectKey, string memory valueKey, int256 value)
        external
        returns (string memory json);
    function serializeInt(string memory objectKey, string memory valueKey, int256[] memory values)
        external
        returns (string memory json);
    function serializeJson(string memory objectKey, string memory value) external returns (string memory json);
    function serializeJsonType(string memory typeDescription, bytes memory value)
        external
        pure
        returns (string memory json);
    function serializeJsonType(
        string memory objectKey,
        string memory valueKey,
        string memory typeDescription,
        bytes memory value
    ) external returns (string memory json);
    function serializeString(string memory objectKey, string memory valueKey, string[] memory values)
        external
        returns (string memory json);
    function serializeString(string memory objectKey, string memory valueKey, string memory value)
        external
        returns (string memory json);
    function serializeUint(string memory objectKey, string memory valueKey, uint256 value)
        external
        returns (string memory json);
    function serializeUint(string memory objectKey, string memory valueKey, uint256[] memory values)
        external
        returns (string memory json);
    function serializeUintToHex(string memory objectKey, string memory valueKey, uint256 value)
        external
        returns (string memory json);
    function setEnv(string memory name, string memory value) external;
    function sign(bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function sign(address signer, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function sign(Wallet memory wallet, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function signCompact(Wallet memory wallet, bytes32 digest) external returns (bytes32 r, bytes32 vs);
    function signCompact(address signer, bytes32 digest) external pure returns (bytes32 r, bytes32 vs);
    function signCompact(bytes32 digest) external pure returns (bytes32 r, bytes32 vs);
    function signCompact(uint256 privateKey, bytes32 digest) external pure returns (bytes32 r, bytes32 vs);
    function signP256(uint256 privateKey, bytes32 digest) external pure returns (bytes32 r, bytes32 s);
    function sleep(uint256 duration) external;
    function split(string memory input, string memory delimiter) external pure returns (string[] memory outputs);
    function startBroadcast() external;
    function startBroadcast(address signer) external;
    function startBroadcast(uint256 privateKey) external;
    function startMappingRecording() external;
    function startStateDiffRecording() external;
    function stopAndReturnStateDiff() external returns (AccountAccess[] memory accountAccesses);
    function stopBroadcast() external;
    function stopMappingRecording() external;
    function toBase64(string memory data) external pure returns (string memory);
    function toBase64(bytes memory data) external pure returns (string memory);
    function toBase64URL(string memory data) external pure returns (string memory);
    function toBase64URL(bytes memory data) external pure returns (string memory);
    function toLowercase(string memory input) external pure returns (string memory output);
    function toString(address value) external pure returns (string memory stringifiedValue);
    function toString(uint256 value) external pure returns (string memory stringifiedValue);
    function toString(bytes memory value) external pure returns (string memory stringifiedValue);
    function toString(bool value) external pure returns (string memory stringifiedValue);
    function toString(int256 value) external pure returns (string memory stringifiedValue);
    function toString(bytes32 value) external pure returns (string memory stringifiedValue);
    function toUppercase(string memory input) external pure returns (string memory output);
    function trim(string memory input) external pure returns (string memory output);
    function tryFfi(string[] memory commandInput) external returns (FfiResult memory result);
    function unixTime() external returns (uint256 milliseconds);
    function writeFile(string memory path, string memory data) external;
    function writeFileBinary(string memory path, bytes memory data) external;
    function writeJson(string memory json, string memory path, string memory valueKey) external;
    function writeJson(string memory json, string memory path) external;
    function writeLine(string memory path, string memory data) external;
    function writeToml(string memory json, string memory path, string memory valueKey) external;
    function writeToml(string memory json, string memory path) external;
}
