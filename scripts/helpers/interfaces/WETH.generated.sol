// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.4;

interface WETH {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed dst, uint256 wad);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Withdrawal(address indexed src, uint256 wad);

    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function deposit() external payable;
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function withdraw(uint256 wad, address user) external;
    function withdraw(uint256 wad) external;
}
