// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface RootChain {
    event NewHeaderBlock(
        address indexed proposer,
        uint256 indexed headerBlockId,
        uint256 indexed reward,
        uint256 start,
        uint256 end,
        bytes32 root
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ResetHeaderBlock(address indexed proposer, uint256 indexed headerBlockId);

    function CHAINID() external view returns (uint256);
    function VOTE_TYPE() external view returns (uint8);
    function _nextHeaderBlock() external view returns (uint256);
    function currentHeaderBlock() external view returns (uint256);
    function getLastChildBlock() external view returns (uint256);
    function headerBlocks(uint256)
        external
        view
        returns (bytes32 root, uint256 start, uint256 end, uint256 createdAt, address proposer);
    function heimdallId() external view returns (bytes32);
    function isOwner() external view returns (bool);
    function networkId() external view returns (bytes memory);
    function owner() external view returns (address);
    function renounceOwnership() external;
    function setHeimdallId(string memory _heimdallId) external;
    function setNextHeaderBlock(uint256 _value) external;
    function slash() external;
    function submitCheckpoint(bytes memory data, uint256[3][] memory sigs) external;
    function submitHeaderBlock(bytes memory data, bytes memory sigs) external;
    function transferOwnership(address newOwner) external;
    function updateDepositId(uint256 numDeposits) external returns (uint256 depositId);
}
