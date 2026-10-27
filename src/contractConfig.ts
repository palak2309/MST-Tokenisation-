import type { InterfaceAbi } from "ethers";

type MstNetwork = "testnet" | "mainnet";
type Environment = Record<string, string | undefined>;

export type MstNetworkConfig = {
  network: MstNetwork | "unsupported";
  networkName: string | undefined;
  chainId: string | undefined;
  rpcUrl: string | undefined;
  contractAddress: string | undefined;
  explorerUrl: string | undefined;
};

export function isNetworkRegistryConfigured(
  config: Pick<
    MstNetworkConfig,
    "network" | "chainId" | "contractAddress"
  >,
): boolean {
  return Boolean(
    config.network !== "unsupported" &&
      config.chainId?.trim() &&
      config.contractAddress?.trim(),
  );
}

const env = import.meta.env as ImportMetaEnv & Environment;

export function resolveMstNetworkConfig(
  environment: Environment,
): MstNetworkConfig {
  const selected = environment["VITE_MST_NETWORK"]?.trim().toLowerCase() || "testnet";

  if (selected === "testnet") {
    return {
      network: "testnet",
      networkName:
        environment["VITE_MST_TESTNET_NETWORK_NAME"] ??
        environment["VITE_MST_NETWORK_NAME"],
      chainId:
        environment["VITE_MST_TESTNET_CHAIN_ID"] ??
        environment["VITE_MST_CHAIN_ID"],
      rpcUrl: environment["VITE_MST_TESTNET_RPC_URL"],
      contractAddress:
        environment["VITE_MST_TESTNET_CONTRACT_ADDRESS"] ??
        environment["VITE_MST_CONTRACT_ADDRESS"],
      explorerUrl:
        environment["VITE_MST_TESTNET_EXPLORER_URL"] ??
        environment["VITE_MST_EXPLORER_URL"],
    };
  }

  if (selected === "mainnet") {
    return {
      network: "mainnet",
      networkName: environment["VITE_MST_MAINNET_NETWORK_NAME"],
      chainId: environment["VITE_MST_MAINNET_CHAIN_ID"],
      rpcUrl: environment["VITE_MST_MAINNET_RPC_URL"],
      contractAddress: environment["VITE_MST_MAINNET_CONTRACT_ADDRESS"],
      explorerUrl: environment["VITE_MST_MAINNET_EXPLORER_URL"],
    };
  }

  return {
    network: "unsupported",
    networkName: undefined,
    chainId: undefined,
    rpcUrl: undefined,
    contractAddress: undefined,
    explorerUrl: undefined,
  };
}

export const NETWORK_CONFIG = resolveMstNetworkConfig(env);
export const ACTIVE_NETWORK = NETWORK_CONFIG.network;
export const NETWORK_NAME = NETWORK_CONFIG.networkName;
export const CHAIN_ID = NETWORK_CONFIG.chainId;
export const RPC_URL = NETWORK_CONFIG.rpcUrl;
export const CONTRACT_ADDRESS = NETWORK_CONFIG.contractAddress;
export const EXPLORER_URL = NETWORK_CONFIG.explorerUrl;

export const CONTRACT_ABI = [
  "function registerDocument(string propertyId, bytes32 docHash)",
  "function getRecord(string propertyId, bytes32 docHash) view returns (address submitter, uint256 timestamp)",
  "event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp)",
] as const satisfies InterfaceAbi;
