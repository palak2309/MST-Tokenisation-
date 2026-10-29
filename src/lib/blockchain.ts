import type { Eip1193Provider } from "ethers";
import {
  ACTIVE_NETWORK,
  CHAIN_ID,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  isNetworkRegistryConfigured,
  isNetworkTokenConfigured,
  NETWORK_NAME,
  PROPERTY_TOKEN_ABI,
  RPC_URL,
  TOKEN_CONTRACT_ADDRESS,
} from "../contractConfig";

export const chainConfig = {
  network: ACTIVE_NETWORK,
  chainId: CHAIN_ID,
  rpcUrl: RPC_URL,
  contractAddress: CONTRACT_ADDRESS,
  tokenContractAddress: TOKEN_CONTRACT_ADDRESS,
  explorerUrl: EXPLORER_URL,
  networkName: NETWORK_NAME,
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

type BridgeKeyProvider = Eip1193Provider & {
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
    if (errStr.includes("SupplyCapExceeded")) {
      return "Issuance rejected: the requested amount exceeds the remaining maximum supply cap.";
    }
    if (errStr.includes("InvalidRecipient")) {
      return "Invalid recipient address (cannot be zero address or token contract address).";
    }
    if (errStr.includes("ZeroAmount")) {
      return "Issuance amount must be greater than zero.";
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

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }
}
