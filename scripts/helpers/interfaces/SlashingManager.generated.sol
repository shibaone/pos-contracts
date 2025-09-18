// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface SlashingManager {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function VOTE_TYPE() external view returns (uint8);
    function drainTokens(uint256 value, address token, address destination) external;
    function heimdallId() external view returns (bytes32);
    function isOwner() external view returns (bool);
    function jailCheckpoints() external view returns (uint256);
    function logger() external view returns (address);
    function owner() external view returns (address);
    function proposerRate() external view returns (uint256);
    function registry() external view returns (address);
    function renounceOwnership() external;
    function reportRate() external view returns (uint256);
    function setHeimdallId(string memory _heimdallId) external;
    function slashingNonce() external view returns (uint256);
    function transferOwnership(address newOwner) external;
    function updateProposerRate(uint256 newProposerRate) external;
    function updateReportRate(uint256 newReportRate) external;
    function updateSlashedAmounts(bytes memory data, bytes memory sigs) external;
    function verifyConsensus(bytes32 voteHash, bytes memory sigs) external view returns (bool);
}
