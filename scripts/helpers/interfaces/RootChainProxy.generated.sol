// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface RootChainProxy {
    event NewHeaderBlock(
        address indexed proposer,
        uint256 indexed headerBlockId,
        uint256 indexed reward,
        uint256 start,
        uint256 end,
        bytes32 root
    );
    event OwnerUpdate(address _prevOwner, address _newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProxyUpdated(address indexed _new, address indexed _old);
    event ResetHeaderBlock(address indexed proposer, uint256 indexed headerBlockId);

    fallback() external payable;

    function CHAINID() external view returns (uint256);
    function VOTE_TYPE() external view returns (uint8);
    function _nextHeaderBlock() external view returns (uint256);
    function headerBlocks(uint256)
        external
        view
        returns (bytes32 root, uint256 start, uint256 end, uint256 createdAt, address proposer);
    function heimdallId() external view returns (bytes32);
    function implementation() external view returns (address);
    function isOwner() external view returns (bool);
    function networkId() external view returns (bytes memory);
    function owner() external view returns (address);
    function proxyType() external pure returns (uint256 proxyTypeId);
    function renounceOwnership() external;
    function transferOwnership(address newOwner) external;
    function updateImplementation(address _newProxyTo) external;
}
