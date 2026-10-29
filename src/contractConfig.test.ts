import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_MAINNET_CHAIN_ID,
  DEFAULT_MAINNET_EXPLORER_URL,
  DEFAULT_MAINNET_NETWORK_NAME,
  DEFAULT_MAINNET_RPC_URL,
  DEFAULT_TESTNET_CHAIN_ID,
  DEFAULT_TESTNET_EXPLORER_URL,
  DEFAULT_TESTNET_NETWORK_NAME,
  DEFAULT_TESTNET_RPC_URL,
  getActiveNetwork,
  getActiveNetworkConfig,
  getNetworkStatusInfo,
  isNetworkRegistryConfigured,
  isNetworkTokenConfigured,
  NETWORK_CONFIG,
  onActiveNetworkChange,
  resolveMainnetConfig,
  resolveMstNetworkConfig,
  resolveTestnetConfig,
  setActiveNetwork,
} from "./contractConfig";

describe("MST network profiles", () => {
  beforeEach(() => {
    setActiveNetwork("testnet");
  });

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

  it("resolves default testnet config with correct chain ID 91562037", () => {
    const config = resolveTestnetConfig({});
    expect(config.network).toBe("testnet");
    expect(config.chainId).toBe(DEFAULT_TESTNET_CHAIN_ID);
    expect(config.chainId).toBe("91562037");
    expect(config.networkName).toBe(DEFAULT_TESTNET_NETWORK_NAME);
    expect(config.rpcUrl).toBe(DEFAULT_TESTNET_RPC_URL);
    expect(config.explorerUrl).toBe(DEFAULT_TESTNET_EXPLORER_URL);
  });

  it("resolves default mainnet config with correct chain ID 4646", () => {
    const config = resolveMainnetConfig({});
    expect(config.network).toBe("mainnet");
    expect(config.chainId).toBe(DEFAULT_MAINNET_CHAIN_ID);
    expect(config.chainId).toBe("4646");
    expect(config.networkName).toBe(DEFAULT_MAINNET_NETWORK_NAME);
    expect(config.rpcUrl).toBe(DEFAULT_MAINNET_RPC_URL);
    expect(config.explorerUrl).toBe(DEFAULT_MAINNET_EXPLORER_URL);
  });

  it("strictly isolates Mainnet: never falls back to Testnet contract addresses", () => {
    const mainnetConfig = resolveMainnetConfig({
      VITE_MST_CONTRACT_ADDRESS: "0xTestnetRegistry123",
      VITE_MST_TOKEN_CONTRACT_ADDRESS: "0xTestnetToken123",
      VITE_MST_TESTNET_CONTRACT_ADDRESS: "0xTestnetRegistryExplicit",
      VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS: "0xTestnetTokenExplicit",
    });

    expect(mainnetConfig.contractAddress).toBeUndefined();
    expect(mainnetConfig.tokenContractAddress).toBeUndefined();
    expect(isNetworkRegistryConfigured(mainnetConfig)).toBe(false);
    expect(isNetworkTokenConfigured(mainnetConfig)).toBe(false);
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
      tokenContractAddress: undefined,
      explorerUrl: undefined,
    });
  });
});

describe("Active network state management & dynamic config", () => {
  beforeEach(() => {
    setActiveNetwork("testnet");
  });

  it("defaults active network to testnet", () => {
    expect(getActiveNetwork()).toBe("testnet");
    const activeConfig = getActiveNetworkConfig();
    expect(activeConfig.network).toBe("testnet");
    expect(activeConfig.chainId).toBe("91562037");
  });

  it("updates active network and notifies listeners on change", () => {
    const listener = vi.fn();
    const unsubscribe = onActiveNetworkChange(listener);

    try {
      setActiveNetwork("mainnet");
      expect(getActiveNetwork()).toBe("mainnet");
      expect(listener).toHaveBeenCalledWith("mainnet");
      expect(getActiveNetworkConfig().network).toBe("mainnet");
      expect(getActiveNetworkConfig().chainId).toBe("4646");

      // Switching back to testnet
      setActiveNetwork("testnet");
      expect(getActiveNetwork()).toBe("testnet");
      expect(listener).toHaveBeenCalledWith("testnet");
      expect(getActiveNetworkConfig().chainId).toBe("91562037");
    } finally {
      unsubscribe();
    }
  });

  it("NETWORK_CONFIG dynamic getters reflect the active network selection", () => {
    setActiveNetwork("testnet");
    expect(NETWORK_CONFIG.network).toBe("testnet");
    expect(NETWORK_CONFIG.chainId).toBe("91562037");

    setActiveNetwork("mainnet");
    expect(NETWORK_CONFIG.network).toBe("mainnet");
    expect(NETWORK_CONFIG.chainId).toBe("4646");

    setActiveNetwork("testnet");
    expect(NETWORK_CONFIG.network).toBe("testnet");
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
