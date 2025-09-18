// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface Common {
    function getV(bytes memory v, uint16 chainId) external pure returns (uint8);
    function isContract(address _addr) external view returns (bool);
    function toUint16(bytes memory _arg) external pure returns (uint16);
    function toUint8(bytes memory _arg) external pure returns (uint8);
}
