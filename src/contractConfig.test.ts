import { describe, expect, it } from "vitest";
import {
  getNetworkStatusInfo,
  isNetworkRegistryConfigured,
  isNetworkTokenConfigured,
  resolveMstNetworkConfig,
} from "./contractConfig";

describe("MST network profiles", () => {
  it("preserves the existing Testnet settings and legacy Testnet aliases", () => {
    const config = resolveMstNetworkConfig({
      VITE_MST_NETWORK: "testnet",
      VITE_MST_NETWORK_NAME: "MST Testnet",
      VITE_MST_CHAIN_ID: "91562037",
      VITE_MST_CONTRACT_ADDRESS: "0x6883929b0A46dC2f301D294719954313b979dc14",
      VITE_MST_EXPLORER_URL: "https://testnet.mstscan.com/",
      VITE_MST_TESTNET_RPC_URL: "https://testnetrpc.mstblockchain.com",
    });

    expect(config).toEqual({
      network: "testnet",
      networkName: "MST Testnet",
      chainId: "91562037",
      rpcUrl: "https://testnetrpc.mstblockchain.com",
      contractAddress: "0x6883929b0A46dC2f301D294719954313b979dc14",
      tokenContractAddress: undefined,
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
      VITE_MST_CONTRACT_ADDRESS: "0x6883929b0A46dC2f301D294719954313b979dc14",
    });

    expect(config).toEqual({
      network: "mainnet",
      networkName: "MST Mainnet",
      chainId: "4646",
      rpcUrl: "https://mariorpc.mstblockchain.com/",
      contractAddress: undefined,
      tokenContractAddress: undefined,
      explorerUrl: "https://mstscan.com/",
    });
    expect(isNetworkRegistryConfigured(config)).toBe(false);
    expect(isNetworkTokenConfigured(config)).toBe(false);
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

describe("getNetworkStatusInfo", () => {
  it("reports 'Mainnet contract not configured' when on mainnet without an address", () => {
    const status = getNetworkStatusInfo({
      network: "mainnet",
      networkName: "MST Mainnet",
      chainId: "4646",
      contractAddress: undefined,
    });
    expect(status.label).toBe("Mainnet contract not configured");
    expect(status.tone).toBe("warning");
  });

  it("reports 'Registry configured' truthfully when on testnet with a contract", () => {
    const status = getNetworkStatusInfo({
      network: "testnet",
      networkName: "MST Testnet",
      chainId: "91562037",
      contractAddress: "0x6883929b0A46dC2f301D294719954313b979dc14",
    });
    expect(status.label).toBe("MST Testnet · Registry configured");
    expect(status.tone).toBe("neutral");
    // Ensure it never claims 'Live' or 'Verified on-chain' without confirmed execution
    expect(status.label).not.toContain("Live");
    expect(status.label).not.toContain("Verified on-chain");
  });

  it("reports 'Demo Mode · Local Simulation' when on testnet without a contract", () => {
    const status = getNetworkStatusInfo({
      network: "testnet",
      networkName: "MST Testnet",
      chainId: undefined,
      contractAddress: undefined,
    });
    expect(status.label).toBe("Demo Mode · Local Simulation");
    expect(status.tone).toBe("neutral");
  });

  it("resolves token contract address when configured for testnet", () => {
    const tokenAddress = "0xTokenContractAddress12345678901234567890";
    const config = resolveMstNetworkConfig({
      VITE_MST_NETWORK: "testnet",
      VITE_MST_CHAIN_ID: "91562037",
      VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS: tokenAddress,
    });
    expect(config.tokenContractAddress).toBe(tokenAddress);
    expect(isNetworkTokenConfigured(config)).toBe(true);
  });

  it("reports 'Unsupported network configured' when network is unsupported", () => {
    const status = getNetworkStatusInfo({
      network: "unsupported",
      networkName: undefined,
      chainId: undefined,
      contractAddress: undefined,
    });
    expect(status.label).toBe("Unsupported network configured");
    expect(status.tone).toBe("destructive");
  });
});
