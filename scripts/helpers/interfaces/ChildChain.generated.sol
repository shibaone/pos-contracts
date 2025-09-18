// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ChildChain {
    event NewToken(address indexed rootToken, address indexed token, uint8 _decimals);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event StateSyncerAddressChanged(address indexed previousAddress, address indexed newAddress);
    event TokenDeposited(
        address indexed rootToken,
        address indexed childToken,
        address indexed user,
        uint256 amount,
        uint256 depositCount
    );
    event TokenWithdrawn(
        address indexed rootToken,
        address indexed childToken,
        address indexed user,
        uint256 amount,
        uint256 withrawCount
    );

    function addToken(
        address _owner,
        address _rootToken,
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        bool _isERC721
    ) external returns (address token);
    function changeStateSyncerAddress(address newAddress) external;
    function deposits(uint256) external view returns (bool);
    function isERC721(address) external view returns (bool);
    function isOnlyStateSyncerContract() external view returns (bool);
    function isOwner() external view returns (bool);
    function mapToken(address rootToken, address token, bool isErc721) external;
    function onStateReceive(uint256, bytes memory data) external;
    function owner() external view returns (address);
    function renounceOwnership() external;
    function stateSyncer() external view returns (address);
    function tokens(address) external view returns (address);
    function transferOwnership(address newOwner) external;
    function withdrawTokens(address rootToken, address user, uint256 amountOrTokenId, uint256 withdrawCount) external;
    function withdraws(uint256) external view returns (bool);
}
