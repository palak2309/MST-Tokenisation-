/**
 * Blockchain service for MST Blockchain (EVM-compatible assumption — verify before going live).
 * All network values come from env vars; nothing is hard-coded. When any value is
 * missing the app runs in Demo Mode and never claims a real transaction.
 */
import type { Eip1193Provider } from "ethers";

export const chainConfig = {
  rpcUrl: import.meta.env.VITE_MST_RPC_URL as string | undefined,
  chainId: import.meta.env.VITE_MST_CHAIN_ID as string | undefined,
  contractAddress: import.meta.env.VITE_MST_CONTRACT_ADDRESS as string | undefined,
  explorerUrl: import.meta.env.VITE_MST_EXPLORER_URL as string | undefined,
  networkName: (import.meta.env.VITE_MST_NETWORK_NAME as string | undefined) ?? "MST Testnet",
};

export const isLiveConfigured = () =>
  Boolean(chainConfig.rpcUrl && chainConfig.chainId && chainConfig.contractAddress);

export const REGISTRY_ABI = [
  "function registerDocument(string propertyId, bytes32 docHash) external",
  "function getRecord(string propertyId, bytes32 docHash) external view returns (address submitter, uint256 timestamp)",
  "event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp)",
];

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
  return { address: accounts[0], chainId: net.chainId.toString() };
}

export function explorerTxUrl(txHash: string) {
  return chainConfig.explorerUrl ? `${chainConfig.explorerUrl.replace(/\/$/, "")}/tx/${txHash}` : undefined;
}

/** Submits a fingerprint to the registry contract. Only callable when live config is present. */
export async function registerOnChain(
  propertyId: string,
  hexHash: string,
  onPending: (txHash: string) => void,
): Promise<{ txHash: string; blockNumber: number }> {
  if (!isLiveConfigured()) throw new Error("MST network is not configured. Running in Demo Mode.");
  const eth = (window as EthWindow).ethereum;
  if (!eth) throw new Error("No browser wallet found.");
  const { BrowserProvider, Contract } = await import("ethers");
  const provider = new BrowserProvider(eth);
  const net = await provider.getNetwork();
  if (net.chainId.toString() !== chainConfig.chainId)
    throw new Error(`Wrong network. Switch your wallet to chain ID ${chainConfig.chainId}.`);
  const signer = await provider.getSigner();
  const contract = new Contract(chainConfig.contractAddress!, REGISTRY_ABI, signer);
  const tx = await contract.registerDocument(propertyId, "0x" + hexHash);
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
