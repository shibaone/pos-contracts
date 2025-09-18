// Deploying StakeManager contract only
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { ethers } = require("hardhat");
require("dotenv").config();

const { FROM } = process.env;

module.exports = buildModule("StakeManagerDeployment", (m) => {
    
    // Deploy StakeManager contract with higher gas limit
    const StakeManager = m.contract("StakeManager", [], {
        gasLimit: 8000000  // 8M gas limit for large contract
    });
    
    // Deploy ValidatorShare implementation contract
    const ValidatorShare = m.contract("ValidatorShare", [], {
        gasLimit: 6000000  // allocate sufficient gas for bytecode size
    });
    
    return {
        StakeManager,
        ValidatorShare
    };
});
