pragma solidity ^0.5.2;

import {RLPReader} from "../../common/lib/RLPReader.sol";

import {Common} from "../../common/lib/Common.sol";
import {RLPEncode} from "../../common/lib/RLPEncode.sol";

import {IWithdrawManager} from "../withdrawManager/IWithdrawManager.sol";
import {IDepositManager} from "../depositManager/IDepositManager.sol";
import {ExitsDataStructure} from "../withdrawManager/WithdrawManagerStorage.sol";
import {ChainIdMixin} from "../../common/mixin/ChainIdMixin.sol";

interface IPredicate {
    /**
   * @notice Verify the deprecation of a state update
   * @param exit ABI encoded PlasmaExit data
   * @param inputUtxo ABI encoded Input UTXO data
   * @param challengeData RLP encoded data of the challenge reference tx that encodes the following fields
   * headerNumber Header block number of which the reference tx was a part of
   * blockProof Proof that the block header (in the child chain) is a leaf in the submitted merkle root
   * blockNumber Block number of which the reference tx is a part of
   * blockTime Reference tx block time
   * blocktxRoot Transactions root of block
   * blockReceiptsRoot Receipts root of block
   * receipt Receipt of the reference transaction
   * receiptProof Merkle proof of the reference receipt
   * branchMask Merkle proof branchMask for the receipt
   * logIndex Log Index to read from the receipt
   * tx Challenge transaction
   * txProof Merkle proof of the challenge tx
   * @return Whether or not the state is deprecated
   */
    function verifyDeprecation(
        bytes calldata exit,
        bytes calldata inputUtxo,
        bytes calldata challengeData
    ) external returns (bool);

    function interpretStateUpdate(bytes calldata state)
        external
        view
        returns (bytes memory);
    function onFinalizeExit(bytes calldata data) external;
}

contract PredicateUtils is ExitsDataStructure, ChainIdMixin {
    using RLPReader for RLPReader.RLPItem;

    // Bonded exits collaterized at 0.1 ETH
    uint256 private constant BOND_AMOUNT = 10**17;

    IWithdrawManager internal withdrawManager;
    IDepositManager internal depositManager;
    address public souAdapter;

    event SOUAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);
    event SOUCompensationMinted(uint256 indexed exitId, address indexed user, address indexed token, uint256 amount);
    event SOUMintFailed(uint256 indexed exitId, address indexed user, address indexed token, uint256 amount);
    event PartialWithdrawal(uint256 indexed exitId, address indexed user, address indexed token, uint256 postHackAmount, uint256 preHackAmount);

    modifier onlyWithdrawManager() {
        require(
            msg.sender == address(withdrawManager),
            "ONLY_WITHDRAW_MANAGER"
        );
        _;
    }

    modifier isBondProvided() {
        require(msg.value == BOND_AMOUNT, "Invalid Bond amount");
        _;
    }

    /**
     * @notice Set the SOU adapter contract address
     * @dev Only owner can set this
     * @param _souAdapter Address of the SOU adapter contract
     */
    function setSOUAdapter(address _souAdapter) external {
        require(msg.sender == address(withdrawManager), "ONLY_WITHDRAW_MANAGER");
        emit SOUAdapterUpdated(souAdapter, _souAdapter);
        souAdapter = _souAdapter;
    }

    function onFinalizeExit(bytes calldata data) external onlyWithdrawManager {
        (uint256 exitId, address token, address exitor, uint256 tokenId) = decodeExitForProcessExit(
            data
        );

        // Check how much user deposited post-hack
        uint256 postHackBalance = depositManager.getPostHackDeposit(exitor, token);

        if (postHackBalance >= tokenId) {
            // User deposited enough post-hack to cover this withdrawal
            // Deduct from their balance and transfer tokens from pool
            depositManager.deductPostHackDeposit(exitor, token, tokenId);
            depositManager.transferAssets(token, exitor, tokenId);

        } else if (postHackBalance > 0) {
            // Partial post-hack deposit
            // User deposited SOME tokens post-hack, but not enough for full withdrawal
            uint256 preHackAmount = tokenId - postHackBalance;

            // Deduct the post-hack portion
            depositManager.deductPostHackDeposit(exitor, token, postHackBalance);

            // Try to transfer post-hack portion (might fail if pool is empty)
            // Using low-level call to avoid revert
            (bool transferSuccess, ) = address(depositManager).call(
                abi.encodeWithSignature("transferAssets(address,address,uint256)", token, exitor, postHackBalance)
            );

            if (!transferSuccess) {
                // Pool is empty even for post-hack portion
                // Mint SOU for everything
                preHackAmount = tokenId;
            }

            // Mint SOU for pre-hack portion
            if (preHackAmount > 0 && souAdapter != address(0)) {
                _mintSOUCompensation(exitId, exitor, token, preHackAmount);
            }

            emit PartialWithdrawal(exitId, exitor, token, postHackBalance, preHackAmount);

        } else {
            // postHackBalance == 0
            // User never deposited post-hack (pre-hack victim)
            // Mint SOU for entire amount
            if (souAdapter != address(0)) {
                _mintSOUCompensation(exitId, exitor, token, tokenId);
            }
        }
    }

    /**
     * @notice Internal function to mint SOU compensation
     * @param exitId Exit ID for event logging
     * @param user User address
     * @param token Token address
     * @param amount Amount to compensate
     */
    function _mintSOUCompensation(
        uint256 exitId,
        address user,
        address token,
        uint256 amount
    ) internal {
        // Low-level call to SOU adapter
        (bool souSuccess, bytes memory returnData) = souAdapter.call(
            abi.encodeWithSignature(
                "mintSOUForBridge(address,address,uint256)",
                user,
                token,
                amount
            )
        );

        if (souSuccess && returnData.length >= 32) {
            emit SOUCompensationMinted(exitId, user, token, amount);
        } else {
            emit SOUMintFailed(exitId, user, token, amount);
        }
    }

    function sendBond() internal {
        address(uint160(address(withdrawManager))).transfer(BOND_AMOUNT);
    }

    function getAddressFromTx(RLPReader.RLPItem[] memory txList)
        internal
        pure
        returns (address signer, bytes32 txHash)
    {
        bytes[] memory rawTx = new bytes[](9);
        for (uint8 i = 0; i <= 5; i++) {
            rawTx[i] = txList[i].toBytes();
        }
        rawTx[6] = networkId;
        rawTx[7] = hex""; // [7] and [8] have something to do with v, r, s values
        rawTx[8] = hex"";

        txHash = keccak256(RLPEncode.encodeList(rawTx));
        signer = ecrecover(
            txHash,
            Common.getV(txList[6].toBytes(), Common.toUint16(networkId)),
            bytes32(txList[7].toUint()),
            bytes32(txList[8].toUint())
        );
        require(signer != address(0), "Invalid signer");
    }

    function decodeExit(bytes memory data)
        internal
        pure
        returns (PlasmaExit memory)
    {
        (address owner, address token, uint256 amountOrTokenId, bytes32 txHash, bool isRegularExit) = abi
            .decode(data, (address, address, uint256, bytes32, bool));
        return
            PlasmaExit(
                amountOrTokenId,
                txHash,
                owner,
                token,
                isRegularExit,
                address(0) /* predicate value is not required */
            );
    }

    function decodeExitForProcessExit(bytes memory data)
        internal
        pure
        returns (uint256 exitId, address token, address exitor, uint256 tokenId)
    {
        (exitId, token, exitor, tokenId) = abi.decode(
            data,
            (uint256, address, address, uint256)
        );
    }

    function decodeInputUtxo(bytes memory data)
        internal
        pure
        returns (uint256 age, address signer, address predicate, address token)
    {
        (age, signer, predicate, token) = abi.decode(
            data,
            (uint256, address, address, address)
        );
    }

}

contract IErcPredicate is IPredicate, PredicateUtils {
    enum ExitType {Invalid, OutgoingTransfer, IncomingTransfer, Burnt}

    struct ExitTxData {
        uint256 amountOrToken;
        bytes32 txHash;
        address childToken;
        address signer;
        ExitType exitType;
    }

    struct ReferenceTxData {
        uint256 closingBalance;
        uint256 age;
        address childToken;
        address rootToken;
    }

    uint256 internal constant MAX_LOGS = 10;

    constructor(address _withdrawManager, address _depositManager) public {
        withdrawManager = IWithdrawManager(_withdrawManager);
        depositManager = IDepositManager(_depositManager);
    }
}