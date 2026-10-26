/**
 * Blockchain service for MST Blockchain (EVM-compatible assumption — verify before going live).
 * All network values come from env vars; nothing is hard-coded. When any value is
 * missing the app runs in Demo Mode and never claims a real transaction.
 */
import type { Eip1193Provider } from "ethers";

const env = import.meta.env as unknown as Record<string, string | undefined>;

export const chainConfig = {
  rpcUrl: env["VITE_MST_RPC_URL"],
  chainId: env["VITE_MST_CHAIN_ID"],
  contractAddress: env["VITE_MST_CONTRACT_ADDRESS"],
  explorerUrl: env["VITE_MST_EXPLORER_URL"],
  networkName: env["VITE_MST_NETWORK_NAME"] ?? "MST Testnet",
};

export const isLiveConfigured = () =>
  Boolean(chainConfig.rpcUrl && chainConfig.chainId && chainConfig.contractAddress);

export const REGISTRY_ABI = [
  "function registerDocument(string propertyId, bytes32 docHash) external",
  "function getRecord(string propertyId, bytes32 docHash) external view returns (address submitter, uint256 timestamp)",
  "event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp)",
];

export type FingerprintComparison = "Match" | "Mismatch" | "No Registered Reference";

/** Interprets lookups from the existing propertyId + hash registry contract. */
export function compareOnChainFingerprint(
  candidateHash: string,
  referenceHash: string,
  candidateRegistered: boolean,
  referenceRegistered: boolean,
): FingerprintComparison {
  if (candidateRegistered || (referenceRegistered && candidateHash.toLowerCase() === referenceHash.toLowerCase())) return "Match";
  if (referenceRegistered) return "Mismatch";
  return "No Registered Reference";
}

type EthWindow = Window & { ethereum?: Eip1193Provider };

export function hasWallet() {
  return typeof window !== "undefined" && Boolean((window as EthWindow).ethereum);
}

export async function connectWallet(): Promise<{ address: string; chainId: string }> {
  const eth = (window as EthWindow).ethereum;
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or a compatible wallet.");
  const { BrowserProvider } = await import("ethers");
  const provider = new BrowserProvider(eth);
  const accounts: string[] = await provider.send("eth_requestAccounts", []);
  const net = await provider.getNetwork();
  return { address: accounts[0] ?? "", chainId: net.chainId.toString() };
}

export function explorerTxUrl(txHash: string) {
  return chainConfig.explorerUrl ? `${chainConfig.explorerUrl.replace(/\/$/, "")}/tx/${txHash}` : undefined;
}

function normalizeFingerprint(hexHash: string) {
  const normalized = hexHash.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error("Invalid SHA-256 fingerprint. Expected 64 hexadecimal characters.");
  return normalized;
}

/** Reads the exact propertyId + fingerprint record from the configured registry. */
export async function getRecordOnChain(propertyId: string, hexHash: string): Promise<{
  submitter: string;
  timestamp: string;
  exists: boolean;
}> {
  if (!isLiveConfigured()) throw new Error("MST network is not configured. Running in Demo Mode.");
  const fingerprint = normalizeFingerprint(hexHash);
  const { Contract, JsonRpcProvider } = await import("ethers");
  const provider = new JsonRpcProvider(chainConfig.rpcUrl!);
  const network = await provider.getNetwork();
  if (network.chainId.toString() !== chainConfig.chainId) {
    throw new Error(`Configured RPC has chain ID ${network.chainId.toString()}, expected ${chainConfig.chainId}.`);
  }
  const contract = new Contract(chainConfig.contractAddress!, REGISTRY_ABI, provider);
  const record = await contract.getFunction("getRecord")(propertyId, `0x${fingerprint}`);
  const submitter = String(record[0]);
  const timestamp = BigInt(String(record[1]));
  return { submitter, timestamp: timestamp.toString(), exists: timestamp > 0n };
}

/** Submits a fingerprint to the registry contract. Only callable when live config is present. */
export async function registerOnChain(
  propertyId: string,
  hexHash: string,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isLiveConfigured()) throw new Error("MST network is not configured. Running in Demo Mode.");
  const fingerprint = normalizeFingerprint(hexHash);
  const eth = (window as EthWindow).ethereum;
  if (!eth) throw new Error("No browser wallet found.");
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);
  const net = await provider.getNetwork();
  if (net.chainId.toString() !== chainConfig.chainId)
    throw new Error(`Wrong network. Switch your wallet to chain ID ${chainConfig.chainId}.`);
  const signer = await provider.getSigner();
  const contract = new Contract(chainConfig.contractAddress!, REGISTRY_ABI, signer);
  const tx = await contract.getFunction("registerDocument")(propertyId, `0x${fingerprint}`);
  onPending(tx.hash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Transaction failed on-chain.");
  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

export async function sha256Hex(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const MAX_BYTES = 10 * 1024 * 1024;
