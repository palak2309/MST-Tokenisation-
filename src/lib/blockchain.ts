import type { Eip1193Provider } from "ethers";
import {
  CONTRACT_ABI,
  DEFAULT_MAINNET_CHAIN_ID,
  DEFAULT_MAINNET_NETWORK_NAME,
  DEFAULT_MAINNET_RPC_URL,
  DEFAULT_TESTNET_CHAIN_ID,
  DEFAULT_TESTNET_NETWORK_NAME,
  DEFAULT_TESTNET_RPC_URL,
  getActiveNetworkConfig,
  isNetworkRegistryConfigured,
  isNetworkTokenConfigured,
  isNetworkStakingConfigured,
  type MstNetwork,
  onActiveNetworkChange,
  PROPERTY_TOKEN_ABI,
  PROPERTY_TOKEN_STAKING_ABI,
  resolveMainnetConfig,
  resolveTestnetConfig,
} from "../contractConfig";

export const chainConfig = {
  get network() {
    return getActiveNetworkConfig().network;
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
  get tokenId() {
    return getActiveNetworkConfig().tokenId;
  },
  get explorerUrl() {
    return getActiveNetworkConfig().explorerUrl;
  },
  get networkName() {
    return getActiveNetworkConfig().networkName;
  },
};

export const BRIDGEKEY_RDNS = "io.bridgekey.wallet";
const BRIDGEKEY_DISCOVERY_TIMEOUT_MS = 500;

type Eip6963ProviderInfo = {
  name: string;
  icon: string;
  rdns: string;
  uuid: string;
};

type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
};

export type BridgeKeyProvider = Eip1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type BridgeKeyProviderEvents = {
  accountsChanged: (accounts: string[]) => void;
  chainChanged: (chainId: string) => void;
  disconnect: () => void;
};

let pendingProviderDiscovery: Promise<BridgeKeyProvider> | null = null;

export const isLiveConfigured = () => isNetworkRegistryConfigured(chainConfig);

export const isTokenLiveConfigured = () =>
  isNetworkTokenConfigured({
    network: chainConfig.network,
    chainId: chainConfig.chainId,
    tokenContractAddress: chainConfig.tokenContractAddress,
  });

export const isStakingLiveConfigured = () =>
  isNetworkStakingConfigured({
    network: chainConfig.network,
    chainId: chainConfig.chainId,
    stakingContractAddress: chainConfig.stakingContractAddress,
  });

export function getStakingConfigurationMessage(): string {
  if (chainConfig.network === "mainnet" && !chainConfig.stakingContractAddress?.trim()) {
    return "Mainnet PropertyTokenStaking contract not deployed/configured. Live staking is disabled until VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS is set.";
  }

  if (chainConfig.network === "testnet" && !chainConfig.stakingContractAddress?.trim()) {
    return "MST Testnet PropertyTokenStaking contract address is not configured. Live staking is disabled until VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS is set.";
  }

  if (chainConfig.network === "unsupported") {
    return "Unsupported MST network selection. Set VITE_MST_NETWORK to testnet or mainnet.";
  }

  return `The ${chainConfig.networkName ?? "MST"} staking contract is not configured. Set its address in the matching environment variable.`;
}

export const isMainnetRegistryUnavailable = () =>
  chainConfig.network === "mainnet" && !isLiveConfigured();

export function getTokenRegistryConfigurationMessage(): string {
  if (chainConfig.network === "mainnet" && !chainConfig.tokenContractAddress?.trim()) {
    return "Mainnet PropertyToken contract not deployed/configured. Live token issuance and investor approvals are disabled until VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS is set.";
  }

  if (chainConfig.network === "testnet" && !chainConfig.tokenContractAddress?.trim()) {
    return "MST Testnet PropertyToken contract address is not configured. Live token issuance and investor approvals are disabled until VITE_MST_TOKEN_CONTRACT_ADDRESS is set.";
  }

  if (chainConfig.network === "unsupported") {
    return "Unsupported MST network selection. Set VITE_MST_NETWORK to testnet or mainnet.";
  }

  return `The ${chainConfig.networkName ?? "MST"} PropertyToken contract is not configured. Set its address in VITE_MST_TOKEN_CONTRACT_ADDRESS.`;
}

export function getRegistryConfigurationMessage(): string {
  if (chainConfig.network === "mainnet" && !chainConfig.contractAddress?.trim()) {
    return "Mainnet contract not deployed/configured. Mainnet registration and verification are disabled until VITE_MST_MAINNET_CONTRACT_ADDRESS contains the real deployed contract address.";
  }

  if (isMainnetRegistryUnavailable()) {
    return "Mainnet registry settings are incomplete. Set VITE_MST_MAINNET_CHAIN_ID and the real VITE_MST_MAINNET_CONTRACT_ADDRESS before enabling on-chain actions.";
  }

  if (chainConfig.network === "unsupported") {
    return "Unsupported MST network selection. Set VITE_MST_NETWORK to testnet or mainnet.";
  }

  return `The ${chainConfig.networkName ?? "MST"} registry is not configured. Set its chain ID and contract address in the matching VITE_MST_* environment variables.`;
}

export type FingerprintComparison = "Match" | "Mismatch" | "No Registered Reference";

export function getExpectedChainId(): bigint {
  const value = chainConfig.chainId?.trim();

  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid MST chain ID configuration: ${value || "missing"}`);
  }

  return BigInt(value);
}

function assertCorrectNetwork(actualChainId: bigint): void {
  const expectedChainId = getExpectedChainId();

  if (actualChainId !== expectedChainId) {
    throw new Error(
      `Wrong network. Connected chain ID: ${actualChainId.toString()}. ` +
        `Expected: ${expectedChainId.toString()} ` +
        `(${chainConfig.networkName || "MST Testnet"}). ` +
        `Select the expected network manually in BridgeKey; the app will not switch networks automatically.`,
    );
  }
}

export function compareOnChainFingerprint(
  candidateHash: string,
  referenceHash: string,
  candidateRegistered: boolean,
  referenceRegistered: boolean,
): FingerprintComparison {
  const candidate = normalizeFingerprint(candidateHash);
  if (!referenceHash.trim()) return "No Registered Reference";
  const reference = normalizeFingerprint(referenceHash);

  if (candidate === reference && candidateRegistered && referenceRegistered) {
    return "Match";
  }

  if (referenceRegistered) return "Mismatch";

  return "No Registered Reference";
}

export function discoverBridgeKeyProvider(
  timeoutMs = BRIDGEKEY_DISCOVERY_TIMEOUT_MS,
): Promise<BridgeKeyProvider> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("BridgeKey wallet access is only available in a browser."));
  }

  if (pendingProviderDiscovery) return pendingProviderDiscovery;

  const discovery = new Promise<BridgeKeyProvider>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("eip6963:announceProvider", handleAnnouncement);
      window.clearTimeout(timeout);
    };
    const finish = (provider?: BridgeKeyProvider) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (provider) {
        resolve(provider);
      } else {
        reject(
          new Error(
            "BridgeKey was not detected. Install or enable the BridgeKey browser extension, then refresh this page.",
          ),
        );
      }
    };
    const handleAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (
        detail?.info?.rdns === BRIDGEKEY_RDNS &&
        detail.provider &&
        typeof detail.provider.request === "function"
      ) {
        finish(detail.provider as BridgeKeyProvider);
      }
    };
    const timeout = window.setTimeout(() => finish(), timeoutMs);

    window.addEventListener("eip6963:announceProvider", handleAnnouncement);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  });

  const trackedDiscovery: Promise<BridgeKeyProvider> = discovery.finally(() => {
    if (pendingProviderDiscovery === trackedDiscovery) {
      pendingProviderDiscovery = null;
    }
  });
  pendingProviderDiscovery = trackedDiscovery;
  return trackedDiscovery;
}

export function subscribeToBridgeKeyEvents(
  provider: BridgeKeyProvider,
  handlers: BridgeKeyProviderEvents,
): () => void {
  if (!provider.on || !provider.removeListener) return () => {};

  const accountsChanged = (...args: unknown[]) => {
    const accounts = args[0];
    handlers.accountsChanged(
      Array.isArray(accounts)
        ? accounts.filter((account): account is string => typeof account === "string")
        : [],
    );
  };
  const chainChanged = (...args: unknown[]) => {
    handlers.chainChanged(String(args[0] ?? ""));
  };
  const disconnect = () => handlers.disconnect();

  provider.on("accountsChanged", accountsChanged);
  provider.on("chainChanged", chainChanged);
  provider.on("disconnect", disconnect);

  return () => {
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
    provider.removeListener?.("disconnect", disconnect);
  };
}

export function walletErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (code === 4001 || code === "ACTION_REJECTED") {
      return "The BridgeKey request was rejected. Approve it in BridgeKey to continue.";
    }
  }

  return error instanceof Error ? error.message : "The BridgeKey request failed.";
}

export async function connectWallet(): Promise<{
  address: string;
  chainId: string;
  provider: BridgeKeyProvider;
}> {
  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);

  if (accounts.length === 0) {
    throw new Error("BridgeKey did not return an available account.");
  }

  // Read the current chain ID directly from the wallet.
  const rawChainId = await eth.request({
    method: "eth_chainId",
  });

  const actualChainId = BigInt(String(rawChainId));

  // Check against the chain ID configured in .env.
  assertCorrectNetwork(actualChainId);

  return {
    address: accounts[0] ?? "",
    chainId: actualChainId.toString(),
    provider: eth,
  };
}

export function explorerTxUrl(txHash: string): string | undefined {
  return chainConfig.explorerUrl
    ? `${chainConfig.explorerUrl.replace(/\/$/, "")}/tx/${txHash}`
    : undefined;
}

function normalizeFingerprint(hexHash: string): string {
  const normalized = hexHash.replace(/^0x/i, "").toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid SHA-256 fingerprint. Expected 64 hexadecimal characters.");
  }

  return normalized;
}

export async function getRecordOnChain(
  propertyId: string,
  hexHash: string,
): Promise<{
  submitter: string;
  timestamp: string;
  exists: boolean;
}> {
  if (!isLiveConfigured()) {
    throw new Error(getRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();

  const address = chainConfig.contractAddress;

  if (!address) {
    throw new Error("The registry contract address is not configured.");
  }

  const fingerprint = normalizeFingerprint(hexHash);
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const contract = new Contract(address, CONTRACT_ABI, provider);

  const record = await contract.getFunction("getRecord")(propertyId.trim(), `0x${fingerprint}`);

  const submitter = String(record[0]);
  const timestamp = BigInt(String(record[1]));

  return {
    submitter,
    timestamp: timestamp.toString(),
    exists: timestamp > 0n,
  };
}

export async function registerOnChain(
  propertyId: string,
  hexHash: string,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isLiveConfigured()) {
    throw new Error(getRegistryConfigurationMessage());
  }

  const fingerprint = normalizeFingerprint(hexHash);
  const eth = await discoverBridgeKeyProvider();

  const address = chainConfig.contractAddress;

  if (!address) {
    throw new Error("The registry contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, CONTRACT_ABI, signer);

  const tx = await contract.getFunction("registerDocument")(propertyId.trim(), `0x${fingerprint}`);

  onPending(tx.hash);

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function sha256Hex(file: File | Blob): Promise<string> {
  let buffer: ArrayBuffer;
  if ("arrayBuffer" in file && typeof file.arrayBuffer === "function") {
    buffer = await file.arrayBuffer();
  } else if (typeof FileReader !== "undefined") {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  } else {
    buffer = await new Response(file).arrayBuffer();
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export const MAX_BYTES = 10 * 1024 * 1024;

export const ROLES = {
  ISSUER_ROLE: "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122",
  COMPLIANCE_ROLE: "0x442a94f1a1fac79af32856af2a64f63648cfa2ef3b98610a5bb7cbec4cee6985",
  PAUSER_ROLE: "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a",
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
} as const;

export const TESTNET_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const MAINNET_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const TESTNET_CHAIN_ID_NUM = 91562037n;
export const MAINNET_CHAIN_ID_NUM = 4646n;

export type UserRoleStatus = {
  isAdmin: boolean;
  isIssuer: boolean;
  isCompliance: boolean;
  isPauser: boolean;
};

export type OnChainPropertyTokenInfo = {
  tokenId: bigint;
  propertyRef: string;
  documentHash: string;
  maxSupply: bigint;
  unitPriceReference: bigint;
  metadataURI: string;
  registeredAt: bigint;
  transfersEnabled: boolean;
  totalSupply: bigint;
  remainingSupply: bigint;
  exists: boolean;
};

export type OnChainStakeInfo = {
  amount: bigint;
  lockStartTime: bigint;
  lockEndTime: bigint;
  pendingRewards: bigint;
  isLocked: boolean;
};

export type OnChainStakingPoolInfo = {
  totalStaked: bigint;
  totalRewardsFunded: bigint;
  totalRewardsClaimed: bigint;
  minLockDuration: bigint;
  maxLockDuration: bigint;
  isEnabled: boolean;
  currentRewardBalance: bigint;
};

export function parseContractError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;
    const message = String(err["message"] || "");
    const rawInfo = err["info"];
    const info =
      typeof rawInfo === "object" && rawInfo !== null ? (rawInfo as Record<string, unknown>) : {};
    const errStr = message + " " + JSON.stringify(info) + " " + String(err["data"] || "");

    if (errStr.includes("IneligibleInvestor")) {
      return "The recipient address is not an approved eligible investor. An account with COMPLIANCE_ROLE must whitelist this address first.";
    }
    if (errStr.includes("InvalidPropertyRef")) {
      return "Registration rejected: property ID cannot be empty.";
    }
    if (errStr.includes("InvalidDocumentHash")) {
      return "Registration rejected: document fingerprint cannot be zero.";
    }
    if (errStr.includes("InvalidMaxSupply")) {
      return "Registration rejected: maximum token supply must be greater than zero.";
    }
    if (errStr.includes("SupplyCapExceeded")) {
      return "Issuance rejected: the requested amount exceeds the remaining maximum supply cap.";
    }
    if (errStr.includes("InvalidRecipient")) {
      return "Invalid recipient address (cannot be zero address or token contract address).";
    }
    if (errStr.includes("ZeroAmount")) {
      return "Amount or units must be greater than zero.";
    }
    if (errStr.includes("LockPeriodActive")) {
      return "The lock period for this stake has not expired yet.";
    }
    if (errStr.includes("InvalidLockDuration")) {
      return "Selected lock duration is outside the allowed pool limits.";
    }
    if (errStr.includes("InsufficientStakedBalance")) {
      return "Requested amount exceeds your active staked balance.";
    }
    if (errStr.includes("StakingContractNotAuthorized")) {
      return "The staking contract has not been whitelisted by a compliance officer.";
    }
    if (errStr.includes("TransfersDisabledForToken")) {
      return "Secondary transfers are disabled for this property token.";
    }
    if (errStr.includes("NoPendingRewards")) {
      return "You have no pending rewards to claim.";
    }
    if (errStr.includes("RewardTransferFailed")) {
      return "Contract was unable to send native MST rewards.";
    }
    if (errStr.includes("DirectDepositNotAllowed")) {
      return "Direct transfer to staking contract rejected.";
    }
    if (errStr.includes("PropertyAlreadyRegistered")) {
      return "This property has already been registered on the token contract.";
    }
    if (errStr.includes("UnknownToken")) {
      return "This property token has not been registered on the token contract.";
    }
    if (errStr.includes("TransfersDisabled")) {
      return "Transfers are currently disabled for this property token.";
    }
    if (errStr.includes("EnforcedPause") || errStr.includes("Pausable: paused")) {
      return "The PropertyToken contract is currently paused.";
    }
    if (errStr.includes("AccessControlUnauthorizedAccount")) {
      return "Unauthorized: Connected wallet does not have the required role for this action.";
    }
  }
  return walletErrorMessage(error);
}

export async function getPropertyTokenOnChain(
  propertyId: string,
): Promise<OnChainPropertyTokenInfo> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract, id: keccak256Id } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);
  const propertyRef = keccak256Id(propertyId.trim());

  const tokenId: bigint = await contract.getFunction("tokenIdByPropertyRef")(propertyRef);
  if (tokenId === 0n) {
    return {
      tokenId: 0n,
      propertyRef,
      documentHash: "",
      maxSupply: 0n,
      unitPriceReference: 0n,
      metadataURI: "",
      registeredAt: 0n,
      transfersEnabled: false,
      totalSupply: 0n,
      remainingSupply: 0n,
      exists: false,
    };
  }

  const [propData, totalSupply, remainingSupply] = await Promise.all([
    contract.getFunction("getProperty")(tokenId),
    contract.getFunction("totalSupply")(tokenId),
    contract.getFunction("remainingSupply")(tokenId),
  ]);

  return {
    tokenId,
    propertyRef: String(propData[0]),
    documentHash: String(propData[1]),
    maxSupply: BigInt(String(propData[2])),
    unitPriceReference: BigInt(String(propData[3])),
    metadataURI: String(propData[4]),
    registeredAt: BigInt(String(propData[5])),
    transfersEnabled: Boolean(propData[6]),
    totalSupply: BigInt(String(totalSupply)),
    remainingSupply: BigInt(String(remainingSupply)),
    exists: true,
  };
}

export async function checkInvestorEligibilityOnChain(investorAddress: string): Promise<boolean> {
  if (!isTokenLiveConfigured()) {
    return false;
  }

  try {
    const eth = await discoverBridgeKeyProvider();
    const address = chainConfig.tokenContractAddress;
    if (!address) return false;

    const { BrowserProvider, Contract } = await import("ethers");
    const provider = new BrowserProvider(eth);
    const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);

    return await contract.getFunction("isEligibleInvestor")(investorAddress.trim());
  } catch {
    return false;
  }
}

export async function getInvestorTokenBalanceOnChain(
  investorAddress: string,
  tokenId: bigint,
): Promise<bigint> {
  if (!isTokenLiveConfigured() || tokenId === 0n) {
    return 0n;
  }

  try {
    const eth = await discoverBridgeKeyProvider();
    const address = chainConfig.tokenContractAddress;
    if (!address) return 0n;

    const { BrowserProvider, Contract } = await import("ethers");
    const provider = new BrowserProvider(eth);
    const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);

    const bal = await contract.getFunction("balanceOf")(investorAddress.trim(), tokenId);
    return BigInt(String(bal));
  } catch {
    return 0n;
  }
}

export async function checkUserRolesOnChain(accountAddress: string): Promise<UserRoleStatus> {
  const defaultStatus: UserRoleStatus = {
    isAdmin: false,
    isIssuer: false,
    isCompliance: false,
    isPauser: false,
  };

  if (!isTokenLiveConfigured() || !accountAddress?.trim()) {
    return defaultStatus;
  }

  try {
    const eth = await discoverBridgeKeyProvider();
    const address = chainConfig.tokenContractAddress;
    if (!address) return defaultStatus;

    const { BrowserProvider, Contract } = await import("ethers");
    const provider = new BrowserProvider(eth);
    const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);

    const [isAdmin, isIssuer, isCompliance, isPauser] = await Promise.all([
      contract.getFunction("hasRole")(ROLES.DEFAULT_ADMIN_ROLE, accountAddress.trim()),
      contract.getFunction("hasRole")(ROLES.ISSUER_ROLE, accountAddress.trim()),
      contract.getFunction("hasRole")(ROLES.COMPLIANCE_ROLE, accountAddress.trim()),
      contract.getFunction("hasRole")(ROLES.PAUSER_ROLE, accountAddress.trim()),
    ]);

    return {
      isAdmin: Boolean(isAdmin),
      isIssuer: Boolean(isIssuer),
      isCompliance: Boolean(isCompliance),
      isPauser: Boolean(isPauser),
    };
  } catch {
    return defaultStatus;
  }
}

export async function registerPropertyTokenOnChain(
  propertyId: string,
  documentHash: string,
  maxSupply: bigint,
  unitPriceReference: bigint,
  metadataURI: string,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number; tokenId?: bigint }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract, id: keccak256Id } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const propertyRef = keccak256Id(propertyId.trim());
  const normalizedDocHash = normalizeFingerprint(documentHash);

  const tx = await contract.getFunction("registerProperty")(
    propertyRef,
    `0x${normalizedDocHash}`,
    maxSupply,
    unitPriceReference,
    metadataURI.trim(),
  );

  onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function setInvestorEligibilityOnChain(
  investorAddress: string,
  eligible: boolean,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("setInvestorEligibility")(investorAddress.trim(), eligible);
  onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function issueUnitsOnChain(
  tokenId: bigint,
  recipientAddress: string,
  amount: bigint,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("issueUnits")(tokenId, recipientAddress.trim(), amount);
  onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function purchaseDemoUnitsOnChain(
  tokenId: bigint,
  amount: bigint,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (amount <= 0n) {
    throw new Error("Purchase amount must be greater than zero.");
  }

  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  // Pre-validate eligibility for clear investor error message
  const eligible: boolean = await contract.getFunction("isEligibleInvestor")(account);
  if (!eligible) {
    throw new Error(
      `Investor account ${account} is not KYC-whitelisted. KYC verification is required before demo purchases.`,
    );
  }

  // Pre-validate supply
  const remaining: bigint = await contract.getFunction("remainingSupply")(tokenId);
  if (amount > remaining) {
    throw new Error(
      `Requested quantity (${amount.toString()}) exceeds available supply (${remaining.toString()}).`,
    );
  }

  // Pure demo purchase: 0 payment token / MST transferred
  const tx = await contract.getFunction("purchaseDemoUnits")(tokenId, amount);
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Demo unit purchase transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function setTransfersEnabledOnChain(
  tokenId: bigint,
  enabled: boolean,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("setTransfersEnabled")(tokenId, enabled);
  onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function isContractPausedOnChain(): Promise<boolean> {
  if (!isTokenLiveConfigured()) {
    return false;
  }
  const address = chainConfig.tokenContractAddress;
  if (!address) return false;

  try {
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(chainConfig.rpcUrl);
    const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);
    const paused = await contract.getFunction("paused")();
    return Boolean(paused);
  } catch {
    return false;
  }
}

export async function pauseContractOnChain(
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("pause")();
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Emergency pause transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function unpauseContractOnChain(
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error("PropertyToken contract address is not configured.");
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("unpause")();
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Emergency unpause transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function switchWalletNetwork(
  targetNetwork: MstNetwork,
  providerOverride?: BridgeKeyProvider,
): Promise<void> {
  const provider = providerOverride ?? (await discoverBridgeKeyProvider());
  const config = targetNetwork === "mainnet" ? resolveMainnetConfig() : resolveTestnetConfig();
  const targetChainIdStr =
    config.chainId ||
    (targetNetwork === "mainnet" ? DEFAULT_MAINNET_CHAIN_ID : DEFAULT_TESTNET_CHAIN_ID);
  const targetChainIdNum = BigInt(targetChainIdStr);
  const hexChainId = `0x${targetChainIdNum.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError: unknown) {
    const err = switchError as { code?: number; message?: string };
    // 4902: Unrecognized chain error code according to EIP-3326 standard
    if (
      err?.code === 4902 ||
      (typeof err?.message === "string" &&
        /4902|unrecognized|not added|unknown chain/i.test(err.message))
    ) {
      const rpcUrl =
        config.rpcUrl ||
        (targetNetwork === "mainnet" ? DEFAULT_MAINNET_RPC_URL : DEFAULT_TESTNET_RPC_URL);
      const networkName =
        config.networkName ||
        (targetNetwork === "mainnet" ? DEFAULT_MAINNET_NETWORK_NAME : DEFAULT_TESTNET_NETWORK_NAME);

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexChainId,
            chainName: networkName,
            nativeCurrency: {
              name: "MST",
              symbol: "MST",
              decimals: 18,
            },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: config.explorerUrl ? [config.explorerUrl] : undefined,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

export async function grantRoleOnChain(
  role: string,
  accountAddress: string,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured()) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const address = chainConfig.tokenContractAddress;
  if (!address) {
    throw new Error(getTokenRegistryConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(address, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("grantRole")(role.trim(), accountAddress.trim());
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Role grant transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function hasRoleOnChain(role: string, accountAddress: string): Promise<boolean> {
  if (!isTokenLiveConfigured() || !accountAddress?.trim() || !role?.trim()) {
    return false;
  }
  const address = chainConfig.tokenContractAddress;
  if (!address || !chainConfig.rpcUrl) return false;

  try {
    const expectedChainId = getExpectedChainId();
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(
      chainConfig.rpcUrl,
      { chainId: Number(expectedChainId), name: chainConfig.networkName || "MST" },
      { staticNetwork: true },
    );
    const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);
    const has = await contract.getFunction("hasRole")(role.trim(), accountAddress.trim());
    return Boolean(has);
  } catch {
    return false;
  }
}

export async function isStakingApprovedOnChain(ownerAddress: string): Promise<boolean> {
  if (!isTokenLiveConfigured() || !isStakingLiveConfigured() || !ownerAddress?.trim()) {
    return false;
  }
  const tokenAddress = chainConfig.tokenContractAddress;
  const stakingAddress = chainConfig.stakingContractAddress;
  if (!tokenAddress || !stakingAddress || !chainConfig.rpcUrl) return false;

  try {
    const expectedChainId = getExpectedChainId();
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(
      chainConfig.rpcUrl,
      { chainId: Number(expectedChainId), name: chainConfig.networkName || "MST" },
      { staticNetwork: true },
    );
    const contract = new Contract(tokenAddress, PROPERTY_TOKEN_ABI, provider);
    const approved = await contract.getFunction("isApprovedForAll")(
      ownerAddress.trim(),
      stakingAddress.trim(),
    );
    return Boolean(approved);
  } catch {
    return false;
  }
}

export async function setStakingApprovalOnChain(
  approved: boolean,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isTokenLiveConfigured() || !isStakingLiveConfigured()) {
    throw new Error(getStakingConfigurationMessage());
  }

  const tokenAddress = chainConfig.tokenContractAddress;
  const stakingAddress = chainConfig.stakingContractAddress;
  if (!tokenAddress || !stakingAddress) {
    throw new Error(getStakingConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(tokenAddress, PROPERTY_TOKEN_ABI, signer);

  const tx = await contract.getFunction("setApprovalForAll")(stakingAddress.trim(), approved);
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Approval transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function stakeUnitsOnChain(
  tokenId: bigint,
  amount: bigint,
  lockDurationSeconds: bigint,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (amount <= 0n) {
    throw new Error("Staking units must be greater than zero.");
  }

  if (!isStakingLiveConfigured()) {
    throw new Error(getStakingConfigurationMessage());
  }

  const stakingAddress = chainConfig.stakingContractAddress;
  if (!stakingAddress) {
    throw new Error(getStakingConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(stakingAddress, PROPERTY_TOKEN_STAKING_ABI, signer);

  const tx = await contract.getFunction("stake")(tokenId, amount, lockDurationSeconds);
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Staking transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function unstakeUnitsOnChain(
  tokenId: bigint,
  amount: bigint,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (amount <= 0n) {
    throw new Error("Unstaking units must be greater than zero.");
  }

  if (!isStakingLiveConfigured()) {
    throw new Error(getStakingConfigurationMessage());
  }

  const stakingAddress = chainConfig.stakingContractAddress;
  if (!stakingAddress) {
    throw new Error(getStakingConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(stakingAddress, PROPERTY_TOKEN_STAKING_ABI, signer);

  const tx = await contract.getFunction("unstake")(tokenId, amount);
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Unstaking transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function claimStakingRewardsOnChain(
  tokenId: bigint,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isStakingLiveConfigured()) {
    throw new Error(getStakingConfigurationMessage());
  }

  const stakingAddress = chainConfig.stakingContractAddress;
  if (!stakingAddress) {
    throw new Error(getStakingConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(stakingAddress, PROPERTY_TOKEN_STAKING_ABI, signer);

  const tx = await contract.getFunction("claimRewards")(tokenId);
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Reward claim transaction failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function emergencyWithdrawStakedUnitsOnChain(
  tokenId: bigint,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isStakingLiveConfigured()) {
    throw new Error(getStakingConfigurationMessage());
  }

  const stakingAddress = chainConfig.stakingContractAddress;
  if (!stakingAddress) {
    throw new Error(getStakingConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(stakingAddress, PROPERTY_TOKEN_STAKING_ABI, signer);

  const tx = await contract.getFunction("emergencyWithdraw")(tokenId);
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Emergency withdrawal failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function fundStakingRewardsOnChain(
  tokenId: bigint,
  amountWei: bigint,
  onPending?: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (amountWei <= 0n) {
    throw new Error("Reward funding amount must be greater than zero.");
  }

  if (!isStakingLiveConfigured()) {
    throw new Error(getStakingConfigurationMessage());
  }

  const stakingAddress = chainConfig.stakingContractAddress;
  if (!stakingAddress) {
    throw new Error(getStakingConfigurationMessage());
  }

  const eth = await discoverBridgeKeyProvider();
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  if (!account) {
    throw new Error("BridgeKey did not return an account for signing.");
  }

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner(account);
  const contract = new Contract(stakingAddress, PROPERTY_TOKEN_STAKING_ABI, signer);

  const tx = await contract.getFunction("fundRewards")(tokenId, { value: amountWei });
  if (onPending) onPending(tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Reward funding failed on-chain.");
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function getStakeInfoOnChain(
  tokenId: bigint,
  investorAddress: string,
): Promise<OnChainStakeInfo> {
  const empty: OnChainStakeInfo = {
    amount: 0n,
    lockStartTime: 0n,
    lockEndTime: 0n,
    pendingRewards: 0n,
    isLocked: false,
  };

  if (!isStakingLiveConfigured() || !investorAddress?.trim()) {
    return empty;
  }
  const address = chainConfig.stakingContractAddress;
  if (!address || !chainConfig.rpcUrl) return empty;

  try {
    const expectedChainId = getExpectedChainId();
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(
      chainConfig.rpcUrl,
      { chainId: Number(expectedChainId), name: chainConfig.networkName || "MST" },
      { staticNetwork: true },
    );
    const contract = new Contract(address, PROPERTY_TOKEN_STAKING_ABI, provider);
    const data = await contract.getFunction("getStakeInfo")(tokenId, investorAddress.trim());
    return {
      amount: BigInt(String(data[0])),
      lockStartTime: BigInt(String(data[1])),
      lockEndTime: BigInt(String(data[2])),
      pendingRewards: BigInt(String(data[3])),
      isLocked: Boolean(data[4]),
    };
  } catch {
    return empty;
  }
}

export async function getPendingStakingRewardsOnChain(
  tokenId: bigint,
  investorAddress: string,
): Promise<bigint> {
  if (!isStakingLiveConfigured() || !investorAddress?.trim()) {
    return 0n;
  }
  const address = chainConfig.stakingContractAddress;
  if (!address || !chainConfig.rpcUrl) return 0n;

  try {
    const expectedChainId = getExpectedChainId();
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(
      chainConfig.rpcUrl,
      { chainId: Number(expectedChainId), name: chainConfig.networkName || "MST" },
      { staticNetwork: true },
    );
    const contract = new Contract(address, PROPERTY_TOKEN_STAKING_ABI, provider);
    const pending: bigint = await contract.getFunction("getPendingRewards")(
      tokenId,
      investorAddress.trim(),
    );
    return BigInt(String(pending));
  } catch {
    return 0n;
  }
}

export async function getStakingPoolInfoOnChain(tokenId: bigint): Promise<OnChainStakingPoolInfo> {
  const empty: OnChainStakingPoolInfo = {
    totalStaked: 0n,
    totalRewardsFunded: 0n,
    totalRewardsClaimed: 0n,
    minLockDuration: 0n,
    maxLockDuration: 0n,
    isEnabled: false,
    currentRewardBalance: 0n,
  };

  if (!isStakingLiveConfigured()) {
    return empty;
  }
  const address = chainConfig.stakingContractAddress;
  if (!address || !chainConfig.rpcUrl) return empty;

  try {
    const expectedChainId = getExpectedChainId();
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(
      chainConfig.rpcUrl,
      { chainId: Number(expectedChainId), name: chainConfig.networkName || "MST" },
      { staticNetwork: true },
    );
    const contract = new Contract(address, PROPERTY_TOKEN_STAKING_ABI, provider);
    const data = await contract.getFunction("getPoolInfo")(tokenId);
    return {
      totalStaked: BigInt(String(data[0])),
      totalRewardsFunded: BigInt(String(data[1])),
      totalRewardsClaimed: BigInt(String(data[2])),
      minLockDuration: BigInt(String(data[3])),
      maxLockDuration: BigInt(String(data[4])),
      isEnabled: Boolean(data[5]),
      currentRewardBalance: BigInt(String(data[6])),
    };
  } catch {
    return empty;
  }
}

export async function getPropertyTokenByIdOnChain(
  tokenId: bigint,
): Promise<OnChainPropertyTokenInfo> {
  const empty: OnChainPropertyTokenInfo = {
    tokenId,
    propertyRef: "",
    documentHash: "",
    maxSupply: 0n,
    unitPriceReference: 0n,
    metadataURI: "",
    registeredAt: 0n,
    transfersEnabled: false,
    totalSupply: 0n,
    remainingSupply: 0n,
    exists: false,
  };

  if (!isTokenLiveConfigured() || tokenId === 0n) {
    return empty;
  }

  const address = chainConfig.tokenContractAddress;
  if (!address || !chainConfig.rpcUrl) return empty;

  try {
    const expectedChainId = getExpectedChainId();
    const { JsonRpcProvider, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(
      chainConfig.rpcUrl,
      { chainId: Number(expectedChainId), name: chainConfig.networkName || "MST" },
      { staticNetwork: true },
    );
    const contract = new Contract(address, PROPERTY_TOKEN_ABI, provider);

    const [propData, totalSupply, remainingSupply] = await Promise.all([
      contract.getFunction("getProperty")(tokenId),
      contract.getFunction("totalSupply")(tokenId),
      contract.getFunction("remainingSupply")(tokenId),
    ]);

    return {
      tokenId,
      propertyRef: String(propData[0]),
      documentHash: String(propData[1]),
      maxSupply: BigInt(String(propData[2])),
      unitPriceReference: BigInt(String(propData[3])),
      metadataURI: String(propData[4]),
      registeredAt: BigInt(String(propData[5])),
      transfersEnabled: Boolean(propData[6]),
      totalSupply: BigInt(String(totalSupply)),
      remainingSupply: BigInt(String(remainingSupply)),
      exists: true,
    };
  } catch {
    return empty;
  }
}

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }
}
