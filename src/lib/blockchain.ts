
import type { Eip1193Provider } from "ethers";
import {
  CHAIN_ID,
  CONTRACT_ABI,
  CONTRACT_ADDRESS,
  EXPLORER_URL,
  NETWORK_NAME,
} from "../contractConfig";

export const chainConfig = {
  chainId: CHAIN_ID,
  contractAddress: CONTRACT_ADDRESS,
  explorerUrl: EXPLORER_URL,
  networkName: NETWORK_NAME,
};

export const isLiveConfigured = () =>
  Boolean(
    chainConfig.chainId?.trim() &&
    chainConfig.contractAddress?.trim()
  );

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
        `(${chainConfig.networkName || "MST Testnet"}).`
    );
  }
}

export function compareOnChainFingerprint(
  candidateHash: string,
  referenceHash: string,
  candidateRegistered: boolean,
  referenceRegistered: boolean
): FingerprintComparison {
  if (
    candidateRegistered ||
    (referenceRegistered &&
      candidateHash.toLowerCase() === referenceHash.toLowerCase())
  ) {
    return "Match";
  }

  if (referenceRegistered) return "Mismatch";

  return "No Registered Reference";
}

export function hasWallet(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.ethereum)
  );
}

export async function connectWallet(): Promise<{
  address: string;
  chainId: string;
}> {
  const eth = window.ethereum;

  if (!eth) {
    throw new Error(
      "No browser wallet found. Install MetaMask or a compatible wallet."
    );
  }

  const { BrowserProvider } = await import("ethers");
  const provider = new BrowserProvider(eth);

  const accounts: string[] = await provider.send(
    "eth_requestAccounts",
    []
  );

  if (accounts.length === 0) {
    throw new Error("No wallet account was returned.");
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
    throw new Error(
      "MST network is not configured. Running in Demo Mode."
    );
  }

  const eth = window.ethereum;

  if (!eth) {
    throw new Error(
      "No browser wallet found. Install MetaMask or a compatible wallet."
    );
  }

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
    throw new Error(
      "MST network is not configured. Running in Demo Mode."
    );
  }

  const fingerprint = normalizeFingerprint(hexHash);
  const eth = window.ethereum;

  if (!eth) {
    throw new Error("No browser wallet found.");
  }

  const address = chainConfig.contractAddress;

  if (!address) {
    throw new Error(
      "The registry contract address is not configured."
    );
  }

  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);

  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  assertCorrectNetwork(network.chainId);

  const signer = await provider.getSigner();
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
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
