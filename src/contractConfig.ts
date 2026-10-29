import type { InterfaceAbi } from "ethers";

type MstNetwork = "testnet" | "mainnet";
type Environment = Record<string, string | undefined>;

export type MstNetworkConfig = {
  network: MstNetwork | "unsupported";
  networkName: string | undefined;
  chainId: string | undefined;
  rpcUrl: string | undefined;
  contractAddress: string | undefined;
  tokenContractAddress: string | undefined;
  explorerUrl: string | undefined;
};

export function isNetworkRegistryConfigured(
  config: Pick<MstNetworkConfig, "network" | "chainId" | "contractAddress">,
): boolean {
  return Boolean(
    config.network !== "unsupported" && config.chainId?.trim() && config.contractAddress?.trim(),
  );
}

export function isNetworkTokenConfigured(
  config: Pick<MstNetworkConfig, "network" | "chainId" | "tokenContractAddress">,
): boolean {
  return Boolean(
    config.network !== "unsupported" &&
    config.chainId?.trim() &&
    config.tokenContractAddress?.trim(),
  );
}

export type NetworkStatusTone = "warning" | "neutral" | "destructive";

export interface NetworkStatusInfo {
  label: string;
  tone: NetworkStatusTone;
  description: string;
}

export function getNetworkStatusInfo(
  config: Pick<MstNetworkConfig, "network" | "chainId" | "contractAddress" | "networkName">,
): NetworkStatusInfo {
  if (config.network === "mainnet" && !config.contractAddress?.trim()) {
    return {
      label: "Mainnet contract not configured",
      tone: "warning",
      description:
        "Mainnet selected, but no contract address is configured. Live operations are disabled.",
    };
  }

  if (config.network === "unsupported") {
    return {
      label: "Unsupported network configured",
      tone: "destructive",
      description: "VITE_MST_NETWORK must be set to testnet or mainnet.",
    };
  }

  if (isNetworkRegistryConfigured(config)) {
    return {
      label: `${config.networkName ?? "MST"} · Registry configured`,
      tone: "neutral",
      description: `Targeting ${config.networkName ?? "MST Testnet"} (Chain ${config.chainId}).`,
    };
  }

  return {
    label: "Demo Mode · Local Simulation",
    tone: "neutral",
    description: "Running with local simulation data. No contract address is configured.",
  };
}

const env = import.meta.env as ImportMetaEnv & Environment;

export function resolveMstNetworkConfig(environment: Environment): MstNetworkConfig {
  const selected = environment["VITE_MST_NETWORK"]?.trim().toLowerCase() || "testnet";

  if (selected === "testnet") {
    return {
      network: "testnet",
      networkName:
        environment["VITE_MST_TESTNET_NETWORK_NAME"] ?? environment["VITE_MST_NETWORK_NAME"],
      chainId: environment["VITE_MST_TESTNET_CHAIN_ID"] ?? environment["VITE_MST_CHAIN_ID"],
      rpcUrl: environment["VITE_MST_TESTNET_RPC_URL"],
      contractAddress:
        environment["VITE_MST_TESTNET_CONTRACT_ADDRESS"] ??
        environment["VITE_MST_CONTRACT_ADDRESS"],
      tokenContractAddress:
        environment["VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS"] ??
        environment["VITE_MST_TOKEN_CONTRACT_ADDRESS"],
      explorerUrl:
        environment["VITE_MST_TESTNET_EXPLORER_URL"] ?? environment["VITE_MST_EXPLORER_URL"],
    };
  }

  if (selected === "mainnet") {
    return {
      network: "mainnet",
      networkName: environment["VITE_MST_MAINNET_NETWORK_NAME"],
      chainId: environment["VITE_MST_MAINNET_CHAIN_ID"],
      rpcUrl: environment["VITE_MST_MAINNET_RPC_URL"],
      contractAddress: environment["VITE_MST_MAINNET_CONTRACT_ADDRESS"],
      tokenContractAddress: environment["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"],
      explorerUrl: environment["VITE_MST_MAINNET_EXPLORER_URL"],
    };
  }

  return {
    network: "unsupported",
    networkName: undefined,
    chainId: undefined,
    rpcUrl: undefined,
    contractAddress: undefined,
    tokenContractAddress: undefined,
    explorerUrl: undefined,
  };
}

export const NETWORK_CONFIG = resolveMstNetworkConfig(env);
export const ACTIVE_NETWORK = NETWORK_CONFIG.network;
export const NETWORK_NAME = NETWORK_CONFIG.networkName;
export const CHAIN_ID = NETWORK_CONFIG.chainId;
export const RPC_URL = NETWORK_CONFIG.rpcUrl;
export const CONTRACT_ADDRESS = NETWORK_CONFIG.contractAddress;
export const TOKEN_CONTRACT_ADDRESS = NETWORK_CONFIG.tokenContractAddress;
export const EXPLORER_URL = NETWORK_CONFIG.explorerUrl;

export const CONTRACT_ABI = [
  "function registerDocument(string propertyId, bytes32 docHash)",
  "function getRecord(string propertyId, bytes32 docHash) view returns (address submitter, uint256 timestamp)",
  "event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp)",
] as const satisfies InterfaceAbi;

export const PROPERTY_TOKEN_ABI = [
  "function registerProperty(bytes32 propertyRef, bytes32 documentHash, uint256 maxSupply, uint256 unitPriceReference, string metadataURI) returns (uint256 tokenId)",
  "function issueUnits(uint256 tokenId, address to, uint256 amount)",
  "function setInvestorEligibility(address investor, bool eligible)",
  "function setTransfersEnabled(uint256 tokenId, bool enabled)",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
  "function getProperty(uint256 tokenId) view returns (tuple(bytes32 propertyRef, bytes32 documentHash, uint256 maxSupply, uint256 unitPriceReference, string metadataURI, uint64 registeredAt, bool transfersEnabled))",
  "function remainingSupply(uint256 tokenId) view returns (uint256)",
  "function totalSupply(uint256 tokenId) view returns (uint256)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function tokenIdByPropertyRef(bytes32 propertyRef) view returns (uint256)",
  "function isEligibleInvestor(address account) view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",
  "function ISSUER_ROLE() view returns (bytes32)",
  "function COMPLIANCE_ROLE() view returns (bytes32)",
  "function PAUSER_ROLE() view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "event PropertyRegistered(uint256 indexed tokenId, bytes32 indexed propertyRef, bytes32 documentHash, uint256 maxSupply, uint256 unitPriceReference, string metadataURI)",
  "event UnitsIssued(uint256 indexed tokenId, address indexed to, uint256 amount, address indexed issuer)",
  "event InvestorEligibilityUpdated(address indexed investor, bool eligible, address indexed by)",
  "event TransfersEnabledUpdated(uint256 indexed tokenId, bool enabled, address indexed by)",
] as const satisfies InterfaceAbi;
