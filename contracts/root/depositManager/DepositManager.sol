pragma solidity ^0.5.2;

import {ERC721Holder} from "openzeppelin-solidity/contracts/token/ERC721/ERC721Holder.sol";
import {IERC20} from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "openzeppelin-solidity/contracts/token/ERC721/IERC721.sol";
import {SafeMath} from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import {SafeERC20} from "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

import {Registry} from "../../common/Registry.sol";
import {WETH} from "../../common/tokens/WETH.sol";
import {IDepositManager} from "./IDepositManager.sol";
import {DepositManagerStorage} from "./DepositManagerStorage.sol";
import {StateSender} from "../stateSyncer/StateSender.sol";
import {GovernanceLockable} from "../../common/mixin/GovernanceLockable.sol";
import {RootChain} from "../RootChain.sol";


contract DepositManager is DepositManagerStorage, IDepositManager, ERC721Holder {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    modifier isTokenMapped(address _token) {
        require(registry.isTokenMapped(_token), "TOKEN_NOT_SUPPORTED");
        _;
    }

    modifier isPredicateAuthorized() {
        require(uint8(registry.predicates(msg.sender)) != 0, "Not a valid predicate");
        _;
    }

    constructor() public GovernanceLockable(address(0x0)) {}

    // deposit ETH by sending to this contract
    function() external payable {
        depositEther();
    }

    function updateMaxErc20Deposit(uint256 maxDepositAmount) public onlyGovernance {
        require(maxDepositAmount != 0);
        emit MaxErc20DepositUpdate(maxErc20Deposit, maxDepositAmount);
        maxErc20Deposit = maxDepositAmount;
    }

    function transferAssets(
        address _token,
        address _user,
        uint256 _amountOrNFTId
    ) external isPredicateAuthorized {
        address wethToken = registry.getWethTokenAddress();
        if (registry.isERC721(_token)) {
            IERC721(_token).transferFrom(address(this), _user, _amountOrNFTId);
        } else if (_token == wethToken) {
            WETH t = WETH(_token);
            t.withdraw(_amountOrNFTId, _user);
        } else {
            require(IERC20(_token).transfer(_user, _amountOrNFTId), "TRANSFER_FAILED");
        }
    }

    function depositERC20(address _token, uint256 _amount) external {
        depositERC20ForUser(_token, msg.sender, _amount);
    }

    function depositERC721(address _token, uint256 _tokenId) external {
        depositERC721ForUser(_token, msg.sender, _tokenId);
    }

    function depositBulk(
        address[] calldata _tokens,
        uint256[] calldata _amountOrTokens,
        address _user
    )
        external
        onlyWhenUnlocked // unlike other deposit functions, depositBulk doesn't invoke _safeCreateDepositBlock
    {
        require(_tokens.length == _amountOrTokens.length, "Invalid Input");
        uint256 depositId = rootChain.updateDepositId(_tokens.length);
        Registry _registry = registry;

        for (uint256 i = 0; i < _tokens.length; i++) {
            // will revert if token is not mapped
            if (_registry.isTokenMappedAndIsErc721(_tokens[i])) {
                _safeTransferERC721(msg.sender, _tokens[i], _amountOrTokens[i]);
            } else {
                IERC20(_tokens[i]).safeTransferFrom(msg.sender, address(this), _amountOrTokens[i]);

                // Track post-hack deposit for ERC20 tokens only
                postHackDeposits[_user][_tokens[i]] = postHackDeposits[_user][_tokens[i]].add(_amountOrTokens[i]);
                emit PostHackDepositTracked(_user, _tokens[i], _amountOrTokens[i], postHackDeposits[_user][_tokens[i]]);
            }

            _createDepositBlock(_user, _tokens[i], _amountOrTokens[i], depositId);
            depositId = depositId.add(1);
        }
    }

    /**
     * @dev Caches childChain and stateSender (frequently used variables) from registry
     */
    function updateChildChainAndStateSender() public {
        (address _childChain, address _stateSender) = registry.getChildChainAndStateSender();
        require(
            _stateSender != address(stateSender) || _childChain != childChain,
            "Atleast one of stateSender or childChain address should change"
        );
        childChain = _childChain;
        stateSender = StateSender(_stateSender);
    }

    function depositERC20ForUser(
        address _token,
        address _user,
        uint256 _amount
    ) public {
        require(_amount <= maxErc20Deposit, "exceed maximum deposit amount");
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        // Track post-hack deposit
        postHackDeposits[_user][_token] = postHackDeposits[_user][_token].add(_amount);
        emit PostHackDepositTracked(_user, _token, _amount, postHackDeposits[_user][_token]);

        _safeCreateDepositBlock(_user, _token, _amount);
    }

    function depositERC721ForUser(
        address _token,
        address _user,
        uint256 _tokenId
    ) public {
        require(registry.isTokenMappedAndIsErc721(_token), "not erc721");

        _safeTransferERC721(msg.sender, _token, _tokenId);
        _safeCreateDepositBlock(_user, _token, _tokenId);
    }

    // @todo: write depositEtherForUser
    function depositEther() public payable {
        address wethToken = registry.getWethTokenAddress();
        WETH t = WETH(wethToken);
        t.deposit.value(msg.value)();

        // Track post-hack deposit for WETH
        postHackDeposits[msg.sender][wethToken] = postHackDeposits[msg.sender][wethToken].add(msg.value);
        emit PostHackDepositTracked(msg.sender, wethToken, msg.value, postHackDeposits[msg.sender][wethToken]);

        _safeCreateDepositBlock(msg.sender, wethToken, msg.value);
    }

    function _safeCreateDepositBlock(
        address _user,
        address _token,
        uint256 _amountOrToken
    ) internal onlyWhenUnlocked isTokenMapped(_token) {
        _createDepositBlock(
            _user,
            _token,
            _amountOrToken,
            rootChain.updateDepositId(1) /* returns _depositId */
        );
    }

    function _createDepositBlock(
        address _user,
        address _token,
        uint256 _amountOrToken,
        uint256 _depositId
    ) internal {
        deposits[_depositId] = DepositBlock(keccak256(abi.encodePacked(_user, _token, _amountOrToken)), now);
        stateSender.syncState(childChain, abi.encode(_user, _token, _amountOrToken, _depositId));
        emit NewDepositBlock(_user, _token, _amountOrToken, _depositId);
    }

    // Housekeeping function. @todo remove later
    function updateRootChain(address _rootChain) public onlyOwner {
        rootChain = RootChain(_rootChain);
    }

    /**
     * @notice Deduct from user's post-hack deposit balance
     * @dev Called by predicates during withdrawal to track user's deposited balance
     * @param _user Address of the user
     * @param _token Address of the token
     * @param _amount Amount to deduct
     */
    function deductPostHackDeposit(
        address _user,
        address _token,
        uint256 _amount
    ) external isPredicateAuthorized {
        require(postHackDeposits[_user][_token] >= _amount, "INSUFFICIENT_POST_HACK_DEPOSIT");
        postHackDeposits[_user][_token] = postHackDeposits[_user][_token].sub(_amount);
        emit PostHackDepositDeducted(_user, _token, _amount, postHackDeposits[_user][_token]);
    }

    /**
     * @notice Get user's post-hack deposit balance for a token
     * @param _user Address of the user
     * @param _token Address of the token
     * @return The amount of post-hack deposits for this user and token
     */
    function getPostHackDeposit(
        address _user,
        address _token
    ) external view returns (uint256) {
        return postHackDeposits[_user][_token];
    }

    function _safeTransferERC721(address _user, address _token, uint256 _tokenId) private {
        IERC721(_token).safeTransferFrom(_user, address(this), _tokenId);
    }
}
