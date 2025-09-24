require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  networks: {
    hardhat: {
      saveDeployments: false,
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
    },
    sepolia: {
      url: 'https://ethereum-sepolia-rpc.publicnode.com',
      accounts: [process.env.PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/ebea9fbdc96a4a70b76fb3724097e8f7`,
      accounts: [process.env.PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    holesky: {
      url: `https://eth-holesky.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    }
  },
  etherscan: {
    apiKey: {
      sepolia: `${process.env.ETHERSCAN_API_KEY}`,
      mainnet: `${process.env.ETHERSCAN_API_KEY}`,
      holesky: `${process.env.ETHERSCAN_API_KEY}`
    },
    customChains: [
      {
        network: "holesky",
        chainId: 17000,
        urls: {
          apiURL: "https://api-holesky.etherscan.io/api",
          browserURL: "https://holesky.etherscan.io/"
        }
      },
    ]
  },
  solidity: {
    version: "0.5.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
}