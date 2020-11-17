require("@babel/polyfill");
require('chai/register-should');
const path = require("path");
require('dotenv').config();
const mnemonic = process.env.MAINNET_MNEMONIC;
const HDWalletProvider = require("@truffle/hdwallet-provider");
const LedgerWalletProvider = require('@umaprotocol/truffle-ledger-provider');

const ledgerOptions = {
  path: "44'/60'/0'/0/0", // ledger default derivation path
  askConfirm: false,
  accountsLength: 1,
  accountsOffset: 0
};

module.exports = {
  plugins: ["truffle-plugin-verify"],
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  api_keys: {
    etherscan: process.env.ETHERSCAN_KEY
  },
  compilers: {
    solc: {
      version: "0.6.12",
      settings: {
        optimizer: {
          enabled: true,
          runs: 30000
        }
      }
    }
  },
  networks: {
    kovan: {
      provider: () => new HDWalletProvider(mnemonic, 'https://kovan.infura.io/v3/' + process.env.INFURA_KEY),
      // provider: () => new LedgerWalletProvider({...ledgerOptions, networkId: 42}, 'https://kovan.infura.io/v3/' + process.env.INFURA_KEY),
      // provider: () => {
      //   console.log(HDWalletProvider)
      //   return new HDWalletProvider.TrezorProvider("m/44'/1'/0'/0/0", 'https://kovan.infura.io/v3' + process.env.INFURA_KEY)
      // },
      network_id: '42',
      gas: 700000,
      gasPrice: 5 * 1e9, // 5 gwei
      skipDryRun: true
    },
    // main ethereum network(mainnet)
    live: {
      // provider: () => new HDWalletProvider(mnemonic, "https://mainnet.infura.io/v3/" + process.env.INFURA_KEY),
      provider: () => new LedgerWalletProvider({...ledgerOptions, networkId: 1}, 'https://mainnet.infura.io/v3/' + process.env.INFURA_KEY),
      network_id: 1,
      gas: 700000,
      gasPrice: 35 * 1e9, // 90 gwei
      skipDryRun: true
    },
    local: {
      // provider: () => new HDWalletProvider(mnemonic, 'http://127.0.0.1:8545'),
      // provider: () => new LedgerWalletProvider({...ledgerOptions, networkId: 1}, 'http://127.0.0.1:8545'),
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
      skipDryRun: true,
      gas: 700000,
      gasPrice: 0x01
    },
    // test: {
    //   host: '127.0.0.1',
    //   port: 8545,
    //   network_id: '*',
    //   gasPrice: 1000000000,
    //   gasPrice: 0x01      // <-- Use this low gas price
    // },
    coverage: {
      host: "localhost",
      network_id: "*",
      port: 8555,         // <-- If you change this, also set the port option in .solcover.js.
      gas: 0xfffffffffff, // <-- Use this high gas value
      gasPrice: 0x01      // <-- Use this low gas price
    }
  },
  mocha: {
    useColors: true,
    // reporter: 'eth-gas-reporter',
    // reporterOptions : {
    //   currency: 'EUR',
    //   gasPrice: 5,
    //   onlyCalledMethods: false
    // }
  }
};
