pragma solidity ^0.5.2;

import {Ownable} from "openzeppelin-solidity/contracts/ownership/Ownable.sol";

/**
 * @title SOUAdapter
 * @notice Adapter contract to bridge between Solidity 0.5.2 contracts and SOU contract (0.8.x)
 * @dev This contract acts as a proxy to call the SOU contract's handleBridgeCompensation function
 */
contract SOUAdapter is Ownable {
    // keccak256("PRE_HACK") - Price snapshot ID for prehack compensation
    bytes32 public constant PRE_HACK_PRICE_SNAPSHOT_ID = keccak256("PRE_HACK");

    address public souContract;
    mapping(address => bool) public authorizedCallers;

    event SOUContractUpdated(address indexed oldAddress, address indexed newAddress);
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);
    event SOUMinted(address indexed user, address indexed token, uint256 amount, uint256 tokenId);
    event SOUMintFailed(address indexed user, address indexed token, uint256 amount, string reason);

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender], "SOUAdapter: NOT_AUTHORIZED");
        _;
    }

    constructor(address _souContract) public {
        require(_souContract != address(0), "SOUAdapter: INVALID_SOU_ADDRESS");
        souContract = _souContract;
    }

    /**
     * @notice Set the SOU contract address
     * @param _souContract Address of the SOU contract
     */
    function setSOUContract(address _souContract) external onlyOwner {
        require(_souContract != address(0), "SOUAdapter: INVALID_SOU_ADDRESS");
        emit SOUContractUpdated(souContract, _souContract);
        souContract = _souContract;
    }

    /**
     * @notice Authorize or deauthorize a caller (typically a predicate contract)
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether the caller should be authorized
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "SOUAdapter: INVALID_CALLER");
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /**
     * @notice Mint SOU NFT for bridge compensation
     * @param user Address of the user to receive the SOU NFT
     * @param token Address of the token being compensated
     * @param amount Amount of tokens being compensated
     * @return tokenId The ID of the minted SOU NFT (0 if failed)
     */
    function mintSOUForBridge(
        address user,
        address token,
        uint256 amount
    ) external onlyAuthorized returns (uint256) {
        require(user != address(0), "SOUAdapter: INVALID_USER");
        require(token != address(0), "SOUAdapter: INVALID_TOKEN");
        require(amount > 0, "SOUAdapter: INVALID_AMOUNT");
        require(souContract != address(0), "SOUAdapter: SOU_NOT_SET");

        // Low-level call to handle potential version incompatibilities
        // Call: handleBridgeCompensation(address to, address bridgedToken, uint256 bridgedAmount, bytes32 priceSnapshotId)
        (bool success, bytes memory returnData) = souContract.call(
            abi.encodeWithSignature(
                "handleBridgeCompensation(address,address,uint256,bytes32)",
                user,
                token,
                amount,
                PRE_HACK_PRICE_SNAPSHOT_ID
            )
        );

        if (success && returnData.length >= 32) {
            uint256 tokenId = abi.decode(returnData, (uint256));
            emit SOUMinted(user, token, amount, tokenId);
            return tokenId;
        } else {
            // Extract revert reason if available
            string memory reason = "Unknown error";
            if (returnData.length > 0) {
                // Try to decode the revert reason
                assembly {
                    reason := add(returnData, 0x04)
                }
            }
            emit SOUMintFailed(user, token, amount, reason);
            return 0;
        }
    }
}
