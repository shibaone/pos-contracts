pragma solidity 0.5.17;

/**
 * @title IOwnable
 * @dev Interface for Ownable contracts
 */
interface IOwnable {
    function owner() external view returns (address);
}
