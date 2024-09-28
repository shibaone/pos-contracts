require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY } = process.env;

module.exports = {
  networks: {
    hardhat: {
      saveDeployments: false,
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: true,
    },
    puppynet: {
      chainId: 157,
      url: 'https://puppynet.shibrpc.com',
      accounts: [PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    shibarium: {
      url: 'https://www.shibrpc.com',
      accounts: [PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    sepolia: {
      url: 'https://ethereum-sepolia-rpc.publicnode.com',
      accounts: [PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    },
    mainnet: {
      url: 'https://eth-mainnet.g.alchemy.com/v2/-jMryr_rjB18sfDARBTV-sJ6zq4Tv9Fh',
      accounts: [PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
    }
  },
  etherscan: {
    apiKey: {
      shibarium: "abc",
      puppynet: "abc",
      sepolia: "IINXVBXZX7UHXIQHGG4X8D7BTK1Z26KSTU",
      mainnet: "IINXVBXZX7UHXIQHGG4X8D7BTK1Z26KSTU"
    },
    customChains: [
      {
        network: "shibarium",
        chainId: 109,
        urls: {
          apiURL: "https://www.shibariumscan.io/api/",
          browserURL: "https://www.shibariumscan.io/"
        }
      },
      {
        network: "puppynet",
        chainId: 157,
        urls: {
          apiURL: "https://puppyscan.shib.io/api/",
          browserURL: "https://puppyscan.shib.io/"
        }
      },
    ]
  },
  solidity: {
    version: "0.5.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 5000,
      },
    },
  },
}