// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface ISignatureValidator {
    function isValidSignature(bytes memory _data, bytes memory _signature) external view returns (bytes4);
}
