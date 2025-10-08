// Deploying WithdrawManager implementation only
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
require("dotenv").config();

module.exports = buildModule("WithdrawManagerImplementation", (m) => {
    const WithdrawManager = m.contract("WithdrawManager", [], {
        gasLimit: 6000000
    });

    return {
        WithdrawManager
    };
});


