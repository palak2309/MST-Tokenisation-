import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { configVariable, defineConfig } from "hardhat/config";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Ignored if .env file is missing
  }
}

export default defineConfig({
  plugins: [hardhatEthers, hardhatEthersChaiMatchers, hardhatMocha],
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    mstTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 91562037,
      url: configVariable("MST_TESTNET_RPC_URL", {
        default: "https://testnetrpc.mstblockchain.com",
      }),
      accounts: [configVariable("MST_TESTNET_PRIVATE_KEY")],
    },
    mstMainnet: {
      type: "http",
      chainType: "l1",
      chainId: 4646,
      url: configVariable("MST_MAINNET_RPC_URL", {
        default: "https://mariorpc.mstblockchain.com/",
      }),
      accounts: [configVariable("MST_MAINNET_PRIVATE_KEY")],
    },
  },
});
