import { describe, expect, it } from "vitest";
import {
  isNetworkRegistryConfigured,
  resolveMstNetworkConfig,
} from "./contractConfig";

describe("MST network profiles", () => {
  it("preserves the existing Testnet settings and legacy Testnet aliases", () => {
    const config = resolveMstNetworkConfig({
      VITE_MST_NETWORK: "testnet",
      VITE_MST_NETWORK_NAME: "MST Testnet",
      VITE_MST_CHAIN_ID: "91562037",
      VITE_MST_CONTRACT_ADDRESS:
        "0x6883929b0A46dC2f301D294719954313b979dc14",
      VITE_MST_EXPLORER_URL: "https://testnet.mstscan.com/",
      VITE_MST_TESTNET_RPC_URL: "https://testnetrpc.mstblockchain.com",
    });

    expect(config).toEqual({
      network: "testnet",
      networkName: "MST Testnet",
      chainId: "91562037",
      rpcUrl: "https://testnetrpc.mstblockchain.com",
      contractAddress: "0x6883929b0A46dC2f301D294719954313b979dc14",
      explorerUrl: "https://testnet.mstscan.com/",
    });
  });

  it("selects Mainnet values without falling back to legacy Testnet values", () => {
    const config = resolveMstNetworkConfig({
      VITE_MST_NETWORK: "mainnet",
      VITE_MST_MAINNET_NETWORK_NAME: "MST Mainnet",
      VITE_MST_MAINNET_CHAIN_ID: "4646",
      VITE_MST_MAINNET_RPC_URL: "https://mariorpc.mstblockchain.com/",
      VITE_MST_MAINNET_EXPLORER_URL: "https://mstscan.com/",
      VITE_MST_CHAIN_ID: "91562037",
      VITE_MST_CONTRACT_ADDRESS:
        "0x6883929b0A46dC2f301D294719954313b979dc14",
    });

    expect(config).toEqual({
      network: "mainnet",
      networkName: "MST Mainnet",
      chainId: "4646",
      rpcUrl: "https://mariorpc.mstblockchain.com/",
      contractAddress: undefined,
      explorerUrl: "https://mstscan.com/",
    });
    expect(isNetworkRegistryConfigured(config)).toBe(false);
  });

  it("uses only the explicitly supplied Mainnet contract address", () => {
    const address = "0x1234567890123456789012345678901234567890";
    const config = resolveMstNetworkConfig({
      VITE_MST_NETWORK: "mainnet",
      VITE_MST_MAINNET_CHAIN_ID: "4646",
      VITE_MST_MAINNET_CONTRACT_ADDRESS: address,
    });

    expect(config.contractAddress).toBe(address);
    expect(isNetworkRegistryConfigured(config)).toBe(true);
  });

  it("rejects unknown profile names rather than choosing a network", () => {
    expect(resolveMstNetworkConfig({ VITE_MST_NETWORK: "production" })).toEqual({
      network: "unsupported",
      networkName: undefined,
      chainId: undefined,
      rpcUrl: undefined,
      contractAddress: undefined,
      explorerUrl: undefined,
    });
  });
});
