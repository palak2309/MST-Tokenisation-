
import type { Eip1193Provider } from "ethers";
import {
  ACTIVE_NETWORK,
  CHAIN_ID,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  isNetworkRegistryConfigured,
  NETWORK_NAME,
  RPC_URL,
} from "../contractConfig";

export const chainConfig = {
  network: ACTIVE_NETWORK,
  chainId: CHAIN_ID,
  rpcUrl: RPC_URL,
  contractAddress: CONTRACT_ADDRESS,
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
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => unknown;
};

export type BridgeKeyProviderEvents = {
  accountsChanged: (accounts: string[]) => void;
  chainChanged: (chainId: string) => void;
  disconnect: () => void;
};

let pendingProviderDiscovery: Promise<BridgeKeyProvider> | null = null;

export const isLiveConfigured = () => isNetworkRegistryConfigured(chainConfig);

export const isMainnetRegistryUnavailable = () =>
  chainConfig.network === "mainnet" && !isLiveConfigured();

export function getRegistryConfigurationMessage(): string {
  if (
    chainConfig.network === "mainnet" &&
    !chainConfig.contractAddress?.trim()
  ) {
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

export type FingerprintComparison =
  | "Match"
  | "Mismatch"
  | "No Registered Reference";

export function getExpectedChainId(): bigint {
  const value = chainConfig.chainId?.trim();

  if (!value || !/^\d+$/.test(value)) {
    throw new Error(
      `Invalid MST chain ID configuration: ${value || "missing"}`
    );
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
        `Select the expected network manually in BridgeKey; the app will not switch networks automatically.`
    );
  }
}

export function compareOnChainFingerprint(
  candidateHash: string,
  referenceHash: string,
  candidateRegistered: boolean,
  referenceRegistered: boolean
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
    return Promise.reject(
      new Error("BridgeKey wallet access is only available in a browser."),
    );
  }

  if (pendingProviderDiscovery) return pendingProviderDiscovery;

  const discovery = new Promise<BridgeKeyProvider>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handleAnnouncement,
      );
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

  let trackedDiscovery: Promise<BridgeKeyProvider>;
  trackedDiscovery = discovery.finally(() => {
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

  const accounts: string[] = await provider.send(
    "eth_requestAccounts",
    []
  );

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

export function explorerTxUrl(
  txHash: string
): string | undefined {
  return chainConfig.explorerUrl
    ? `${chainConfig.explorerUrl.replace(/\/$/, "")}/tx/${txHash}`
    : undefined;
}

function normalizeFingerprint(hexHash: string): string {
  const normalized = hexHash
    .replace(/^0x/i, "")
    .toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(
      "Invalid SHA-256 fingerprint. Expected 64 hexadecimal characters."
    );
  }

  return normalized;
}

export async function getRecordOnChain(
  propertyId: string,
  hexHash: string
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
    throw new Error(
      "The registry contract address is not configured."
    );
  }

  const fingerprint = normalizeFingerprint(hexHash);
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const contract = new Contract(
    address,
    CONTRACT_ABI,
    provider
  );

  const record = await contract.getFunction("getRecord")(
    propertyId.trim(),
    `0x${fingerprint}`
  );

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
  onPending: (txHash: string) => void
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isLiveConfigured()) {
    throw new Error(getRegistryConfigurationMessage());
  }

  const fingerprint = normalizeFingerprint(hexHash);
  const eth = await discoverBridgeKeyProvider();

  const address = chainConfig.contractAddress;

  if (!address) {
    throw new Error(
      "The registry contract address is not configured."
    );
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
  const contract = new Contract(
    address,
    CONTRACT_ABI,
    signer
  );

  const tx = await contract.getFunction("registerDocument")(
    propertyId.trim(),
    `0x${fingerprint}`
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

export async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const MAX_BYTES = 10 * 1024 * 1024;

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }
}
