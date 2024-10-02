//Deploying child contracts
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { ethers } = require("hardhat");
require("dotenv").config();

module.exports = buildModule("ChildContracts", (m) => {
    
    const SafeMath = m.contract("contracts/common/gnosis/GnosisSafe.sol:SafeMath");

    const ChildChain = m.contract("ChildChain");

    const BoneToken = m.contractAt('MRC20', '0x0000000000000000000000000000000000001010');
    m.call(BoneToken, [ChildChain, 'BONETOKEN ADDRESS'])

    m.call(ChildChain, "mapToken", ["BONETOKEN ADDRESS", "0x0000000000000000000000000000000000001010", false]);
    return {
        ChildChain
    }
})