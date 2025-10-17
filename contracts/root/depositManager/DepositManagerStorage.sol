pragma solidity ^0.5.2;

import {Registry} from "../../common/Registry.sol";
import {RootChain} from "../RootChain.sol";
import {ProxyStorage} from "../../common/misc/ProxyStorage.sol";
import {StateSender} from "../stateSyncer/StateSender.sol";
import {GovernanceLockable} from "../../common/mixin/GovernanceLockable.sol";


contract DepositManagerHeader {
    event NewDepositBlock(address indexed owner, address indexed token, uint256 amountOrNFTId, uint256 depositBlockId);
    event MaxErc20DepositUpdate(uint256 indexed oldLimit, uint256 indexed newLimit);
    event PostHackDepositTracked(address indexed user, address indexed token, uint256 amount, uint256 totalBalance);
    event PostHackDepositDeducted(address indexed user, address indexed token, uint256 amount, uint256 remainingBalance);

    struct DepositBlock {
        bytes32 depositHash;
        uint256 createdAt;
    }
}


contract DepositManagerStorage is ProxyStorage, GovernanceLockable, DepositManagerHeader {
    Registry public registry;
    RootChain public rootChain;
    StateSender public stateSender;

    mapping(uint256 => DepositBlock) public deposits;

    address public childChain;
    uint256 public maxErc20Deposit = 100 * (10**18);

    // Mapping to track post-hack deposits: user => token => amount
    // Used to differentiate between pre-hack victims and post-hack depositors
    mapping(address => mapping(address => uint256)) public postHackDeposits;
}
