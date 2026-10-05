require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  networks: {
    hardhat: {
      saveDeployments: false,
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
      forking: {
        url: process.env.FORK_SEPOLIA === "true"
          ? (process.env.SEPOLIA_RPC_URL || `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)
          : process.env.FORK_PUPPYNET === "true"
            ? (process.env.PUPPYNET_RPC_URL || "https://puppynet.shibrpc.com")
            : (process.env.MAINNET_RPC_URL || "https://mainnet.infura.io/v3/ebea9fbdc96a4a70b76fb3724097e8f7"),
        blockNumber: process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : undefined,
        enabled: process.env.FORK_MAINNET === "true" || process.env.FORK_PUPPYNET === "true" || process.env.FORK_SEPOLIA === "true"
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // a forked node pulls state from the upstream RPC on first touch, so large
      // batch calls can sit well past the default timeout
      timeout: 600000,
    },
    puppynet: {
      url: process.env.PUPPYNET_RPC_URL || "https://puppynet.shibrpc.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gas: "auto",
      gasPrice: "auto",
    },
    sepolia: {
      url: 'https://ethereum-sepolia-rpc.publicnode.com',
      accounts: [process.env.PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    mainnet: {
      url: `https://eth.drpc.org`,
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
    apiKey: process.env.ETHERSCAN_API_KEY,
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
  mocha: {
    timeout: 300000 // 5 minutes for fork tests
  },
}