import { useSyncExternalStore } from "react";
import type { InterfaceAbi } from "ethers";

export type MstNetwork = "testnet" | "mainnet";
export type Environment = Record<string, string | undefined>;

export type MstNetworkConfig = {
  network: MstNetwork | "unsupported";
  networkName: string | undefined;
  chainId: string | undefined;
  rpcUrl: string | undefined;
  contractAddress: string | undefined;
  tokenContractAddress: string | undefined;
  stakingContractAddress?: string | undefined;
  tokenId?: string | undefined;
  explorerUrl: string | undefined;
};

export const DEFAULT_TESTNET_CHAIN_ID = "91562037";
export const DEFAULT_TESTNET_NETWORK_NAME = "MST Testnet";
export const DEFAULT_TESTNET_RPC_URL = "https://testnetrpc.mstblockchain.com";
export const DEFAULT_TESTNET_EXPLORER_URL = "https://testnet.mstscan.com/";

export const DEFAULT_MAINNET_CHAIN_ID = "4646";
export const DEFAULT_MAINNET_NETWORK_NAME = "MST Mainnet";
export const DEFAULT_MAINNET_RPC_URL = "https://mariorpc.mstblockchain.com/";
export const DEFAULT_MAINNET_EXPLORER_URL = "https://mstscan.com/";

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

export function isNetworkStakingConfigured(
  config: Pick<MstNetworkConfig, "network" | "chainId" | "stakingContractAddress">,
): boolean {
  return Boolean(
    config.network !== "unsupported" &&
    config.chainId?.trim() &&
    config.stakingContractAddress?.trim(),
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

const env = (
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : typeof process !== "undefined" && process.env
      ? process.env
      : {}
) as ImportMetaEnv & Environment;

export function resolveTestnetConfig(environment: Environment = env): MstNetworkConfig {
  const contractAddress =
    (
      environment["VITE_MST_TESTNET_CONTRACT_ADDRESS"] ?? environment["VITE_MST_CONTRACT_ADDRESS"]
    )?.trim() || undefined;

  const tokenContractAddress =
    (
      environment["VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS"] ??
      environment["VITE_MST_TOKEN_CONTRACT_ADDRESS"]
    )?.trim() || undefined;

  const stakingContractAddress =
    (
      environment["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"] ??
      environment["VITE_MST_STAKING_CONTRACT_ADDRESS"]
    )?.trim() || undefined;

  const tokenId =
    (environment["VITE_MST_TESTNET_TOKEN_ID"] ?? environment["VITE_MST_TOKEN_ID"])?.trim() ||
    undefined;

  const config: MstNetworkConfig = {
    network: "testnet",
    networkName:
      environment["VITE_MST_TESTNET_NETWORK_NAME"]?.trim() ||
      environment["VITE_MST_NETWORK_NAME"]?.trim() ||
      DEFAULT_TESTNET_NETWORK_NAME,
    chainId:
      environment["VITE_MST_TESTNET_CHAIN_ID"]?.trim() ||
      environment["VITE_MST_CHAIN_ID"]?.trim() ||
      DEFAULT_TESTNET_CHAIN_ID,
    rpcUrl:
      environment["VITE_MST_TESTNET_RPC_URL"]?.trim() ||
      environment["VITE_MST_RPC_URL"]?.trim() ||
      DEFAULT_TESTNET_RPC_URL,
    contractAddress,
    tokenContractAddress,
    explorerUrl:
      environment["VITE_MST_TESTNET_EXPLORER_URL"]?.trim() ||
      environment["VITE_MST_EXPLORER_URL"]?.trim() ||
      DEFAULT_TESTNET_EXPLORER_URL,
  };

  if (stakingContractAddress !== undefined) {
    config.stakingContractAddress = stakingContractAddress;
  }
  if (tokenId !== undefined) {
    config.tokenId = tokenId;
  }

  return config;
}

export function resolveMainnetConfig(environment: Environment = env): MstNetworkConfig {
  const contractAddress = environment["VITE_MST_MAINNET_CONTRACT_ADDRESS"]?.trim() || undefined;
  const tokenContractAddress =
    environment["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim() || undefined;
  const stakingContractAddress =
    environment["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim() || undefined;
  const tokenId = environment["VITE_MST_MAINNET_TOKEN_ID"]?.trim() || undefined;

  const config: MstNetworkConfig = {
    network: "mainnet",
    networkName:
      environment["VITE_MST_MAINNET_NETWORK_NAME"]?.trim() || DEFAULT_MAINNET_NETWORK_NAME,
    chainId: environment["VITE_MST_MAINNET_CHAIN_ID"]?.trim() || DEFAULT_MAINNET_CHAIN_ID,
    rpcUrl: environment["VITE_MST_MAINNET_RPC_URL"]?.trim() || DEFAULT_MAINNET_RPC_URL,
    // Strict address isolation: Mainnet NEVER falls back to Testnet addresses
    contractAddress,
    tokenContractAddress,
    explorerUrl:
      environment["VITE_MST_MAINNET_EXPLORER_URL"]?.trim() || DEFAULT_MAINNET_EXPLORER_URL,
  };

  if (stakingContractAddress !== undefined) {
    config.stakingContractAddress = stakingContractAddress;
  }
  if (tokenId !== undefined) {
    config.tokenId = tokenId;
  }

  return config;
}

export function resolveMstNetworkConfig(environment: Environment = env): MstNetworkConfig {
  const selected = environment["VITE_MST_NETWORK"]?.trim().toLowerCase() || "testnet";

  if (selected === "testnet") {
    return resolveTestnetConfig(environment);
  }

  if (selected === "mainnet") {
    return resolveMainnetConfig(environment);
  }

  return {
    network: "unsupported",
    networkName: undefined,
    chainId: undefined,
    rpcUrl: undefined,
    contractAddress: undefined,
    tokenContractAddress: undefined,
    stakingContractAddress: undefined,
    explorerUrl: undefined,
  };
}

export const NETWORK_STORAGE_KEY = "tokenestate_selected_network";

type NetworkChangeListener = (network: MstNetwork) => void;
const networkListeners = new Set<NetworkChangeListener>();

let currentActiveNetwork: MstNetwork = (() => {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(NETWORK_STORAGE_KEY)?.trim().toLowerCase();
      if (saved === "testnet" || saved === "mainnet") {
        return saved;
      }
    } catch {
      // Ignore localStorage access errors
    }
  }
  // Default to testnet (Requirement 1 & 2)
  const envSelected = env["VITE_MST_NETWORK"]?.trim().toLowerCase();
  if (envSelected === "mainnet") {
    return "mainnet";
  }
  return "testnet";
})();

export function getActiveNetwork(): MstNetwork {
  return currentActiveNetwork;
}

export function setActiveNetwork(network: MstNetwork): void {
  if (network !== "testnet" && network !== "mainnet") return;
  if (currentActiveNetwork === network) return;
  currentActiveNetwork = network;
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
    } catch {
      // Ignore localStorage access errors
    }
  }
  networkListeners.forEach((listener) => {
    try {
      listener(network);
    } catch (e) {
      console.error("Error in network change listener:", e);
    }
  });
}

export function onActiveNetworkChange(listener: NetworkChangeListener): () => void {
  networkListeners.add(listener);
  return () => {
    networkListeners.delete(listener);
  };
}

export function getActiveNetworkConfig(environment: Environment = env): MstNetworkConfig {
  return currentActiveNetwork === "mainnet"
    ? resolveMainnetConfig(environment)
    : resolveTestnetConfig(environment);
}

export function useNetwork() {
  const network = useSyncExternalStore(onActiveNetworkChange, getActiveNetwork, () => "testnet");
  const config = getActiveNetworkConfig();
  const statusInfo = getNetworkStatusInfo(config);

  return {
    network,
    config,
    statusInfo,
    setNetwork: setActiveNetwork,
    isMainnet: network === "mainnet",
    isTestnet: network === "testnet",
  };
}

// Dynamic configuration object that reflects the active network
export const NETWORK_CONFIG: MstNetworkConfig = {
  get network() {
    return getActiveNetworkConfig().network;
  },
  get networkName() {
    return getActiveNetworkConfig().networkName;
  },
  get chainId() {
    return getActiveNetworkConfig().chainId;
  },
  get rpcUrl() {
    return getActiveNetworkConfig().rpcUrl;
  },
  get contractAddress() {
    return getActiveNetworkConfig().contractAddress;
  },
  get tokenContractAddress() {
    return getActiveNetworkConfig().tokenContractAddress;
  },
  get stakingContractAddress() {
    return getActiveNetworkConfig().stakingContractAddress;
  },
  get explorerUrl() {
    return getActiveNetworkConfig().explorerUrl;
  },
};

export const ACTIVE_NETWORK = NETWORK_CONFIG.network;
export const NETWORK_NAME = NETWORK_CONFIG.networkName;
export const CHAIN_ID = NETWORK_CONFIG.chainId;
export const RPC_URL = NETWORK_CONFIG.rpcUrl;
export const CONTRACT_ADDRESS = NETWORK_CONFIG.contractAddress;
export const TOKEN_CONTRACT_ADDRESS = NETWORK_CONFIG.tokenContractAddress;
export const STAKING_CONTRACT_ADDRESS = NETWORK_CONFIG.stakingContractAddress;
export const EXPLORER_URL = NETWORK_CONFIG.explorerUrl;

export const CONTRACT_ABI = [
  "function registerDocument(string propertyId, bytes32 docHash)",
  "function getRecord(string propertyId, bytes32 docHash) view returns (address submitter, uint256 timestamp)",
  "event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp)",
] as const satisfies InterfaceAbi;

export const PROPERTY_TOKEN_ABI = [
  "function registerProperty(bytes32 propertyRef, bytes32 documentHash, uint256 maxSupply, uint256 unitPriceReference, string metadataURI) returns (uint256 tokenId)",
  "function issueUnits(uint256 tokenId, address to, uint256 amount)",
  "function purchaseDemoUnits(uint256 tokenId, uint256 amount)",
  "function setInvestorEligibility(address investor, bool eligible)",
  "function setTransfersEnabled(uint256 tokenId, bool enabled)",
  "function setStakingContractAuthorization(address stakingContract, bool authorized)",
  "function isAuthorizedStakingContract(address account) view returns (bool)",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
  "function getProperty(uint256 tokenId) view returns (tuple(bytes32 propertyRef, bytes32 documentHash, uint256 maxSupply, uint256 unitPriceReference, string metadataURI, uint64 registeredAt, bool transfersEnabled))",
  "function remainingSupply(uint256 tokenId) view returns (uint256)",
  "function totalSupply(uint256 tokenId) view returns (uint256)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
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
  "event DemoUnitsPurchased(uint256 indexed tokenId, address indexed investor, uint256 amount, uint256 totalDemoValue)",
  "event InvestorEligibilityUpdated(address indexed investor, bool eligible, address indexed by)",
  "event TransfersEnabledUpdated(uint256 indexed tokenId, bool enabled, address indexed by)",
  "event StakingContractAuthorizationUpdated(address indexed stakingContract, bool authorized, address indexed by)",
] as const satisfies InterfaceAbi;

export const PROPERTY_TOKEN_STAKING_ABI = [
  "function stake(uint256 tokenId, uint256 amount, uint64 lockDuration)",
  "function unstake(uint256 tokenId, uint256 amount)",
  "function claimRewards(uint256 tokenId) returns (uint256 rewardAmount)",
  "function emergencyWithdraw(uint256 tokenId)",
  "function fundRewards(uint256 tokenId) payable",
  "function configurePool(uint256 tokenId, uint64 minLockDuration, uint64 maxLockDuration, bool enabled)",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
  "function getStakeInfo(uint256 tokenId, address investor) view returns (uint256 amount, uint64 lockStartTime, uint64 lockEndTime, uint256 pendingRewards, bool isLocked)",
  "function getPendingRewards(uint256 tokenId, address investor) view returns (uint256)",
  "function getPoolInfo(uint256 tokenId) view returns (uint256 totalStaked, uint256 totalRewardsFunded, uint256 totalRewardsClaimed, uint64 minLockDuration, uint64 maxLockDuration, bool isEnabled, uint256 currentRewardBalance)",
  "function propertyToken() view returns (address)",
  "event Staked(uint256 indexed tokenId, address indexed investor, uint256 amount, uint64 lockEndTime)",
  "event Unstaked(uint256 indexed tokenId, address indexed investor, uint256 amount)",
  "event RewardsFunded(uint256 indexed tokenId, address indexed funder, uint256 amount, uint256 newAccumulatedPerToken)",
  "event RewardsClaimed(uint256 indexed tokenId, address indexed investor, uint256 amount)",
  "event EmergencyWithdrawn(uint256 indexed tokenId, address indexed investor, uint256 amount)",
  "event PoolConfigured(uint256 indexed tokenId, uint64 minLockDuration, uint64 maxLockDuration, bool isEnabled)",
] as const satisfies InterfaceAbi;
