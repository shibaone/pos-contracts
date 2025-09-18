// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface TestToken {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterAdded(address indexed account);
    event MinterRemoved(address indexed account);
    event Transfer(address indexed from, address indexed to, uint256 value);

    function addMinter(address account) external;
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function decimals() external view returns (uint8);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function isMinter(address account) external view returns (bool);
    function mint(address to, uint256 value) external returns (bool);
    function name() external view returns (string memory);
    function renounceMinter() external;
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
