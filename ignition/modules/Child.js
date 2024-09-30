//Deploying child contracts
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { ethers } = require("hardhat");
require("dotenv").config();

module.exports = buildModule("ChildContracts", (m) => {
    
    const SafeMath = m.contract("contracts/common/gnosis/GnosisSafe.sol:SafeMath");

    const ChildChain = m.contract("ChildChain");

    return {
        ChildChain
    }
})