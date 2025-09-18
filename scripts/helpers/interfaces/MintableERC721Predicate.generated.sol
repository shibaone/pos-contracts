// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface MintableERC721Predicate {
    function CHAINID() external view returns (uint256);
    function exitToMintableTokenInfo(uint256)
        external
        view
        returns (string memory uri, address minter, bool isVanillaMint);
    function interpretStateUpdate(bytes memory state) external view returns (bytes memory b);
    function networkId() external view returns (bytes memory);
    function onFinalizeExit(bytes memory data) external;
    function startExit(bytes memory data, bytes memory exitTx) external payable returns (bytes memory);
    function startExitForMetadataMintableBurntToken(bytes memory data, bytes memory mintTx) external;
    function startExitForMetadataMintableToken(bytes memory data, bytes memory mintTx, bytes memory exitTx)
        external
        payable;
    function startExitForMintableBurntToken(bytes memory data, bytes memory mintTx) external;
    function startExitForMintableToken(bytes memory data, bytes memory mintTx, bytes memory exitTx) external payable;
    function startExitWithBurntTokens(bytes memory data) external returns (bytes memory);
    function verifyDeprecation(bytes memory exit, bytes memory inputUtxo, bytes memory challengeData)
        external
        returns (bool);
}
