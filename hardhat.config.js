require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// signing accounts are optional, so the config loads (compile, test, read-only scripts) without a key
const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

const forkEnabled = process.env.FORK_MAINNET === "true" || process.env.FORK_PUPPYNET === "true" || process.env.FORK_SEPOLIA === "true";
const forkUrl = process.env.FORK_SEPOLIA === "true"
  ? (process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com")
  : process.env.FORK_PUPPYNET === "true"
    ? (process.env.PUPPYNET_RPC_URL || "https://rpc.puppynet.shib.io")
    : process.env.MAINNET_RPC_URL;
if (forkEnabled && !forkUrl) {
  throw new Error("FORK_MAINNET=true needs MAINNET_RPC_URL in .env");
}

module.exports = {
  networks: {
    hardhat: {
      saveDeployments: false,
      gas: "auto",
      gasPrice: "auto",
      // tests deploy oversized builds; test/stakeManagerSize.test.js checks the real EIP-170 limit
      allowUnlimitedContractSize: true,
      forking: forkEnabled
        ? {
          url: forkUrl,
          blockNumber: process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : undefined,
          enabled: true,
        }
        : undefined,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // a forked node pulls state from the upstream RPC on first touch, so large
      // batch calls can sit well past the default timeout
      timeout: 600000,
    },
    puppynet: {
      url: process.env.PUPPYNET_RPC_URL || "https://rpc.puppynet.shib.io",
      chainId: 157,
      accounts,
      gas: "auto",
      gasPrice: "auto",
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts,
      gas: "auto",
      gasPrice: "auto",
    },
    // only defined when MAINNET_RPC_URL is set: no third-party RPC is baked into the repo
    ...(process.env.MAINNET_RPC_URL
      ? {
        mainnet: {
          url: process.env.MAINNET_RPC_URL,
          chainId: 1,
          accounts,
          gas: "auto",
          gasPrice: "auto",
        },
      }
      : {}),
    holesky: {
      url: `https://eth-holesky.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 17000,
      accounts,
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