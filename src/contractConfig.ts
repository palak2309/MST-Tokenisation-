import type { InterfaceAbi } from "ethers";

const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;

export const CONTRACT_ADDRESS = env["VITE_MST_CONTRACT_ADDRESS"];
export const CHAIN_ID = env["VITE_MST_CHAIN_ID"];
export const EXPLORER_URL = env["VITE_MST_EXPLORER_URL"];
export const NETWORK_NAME = env["VITE_MST_NETWORK_NAME"];

export const CONTRACT_ABI = [
  "function registerDocument(string propertyId, bytes32 docHash)",
  "function getRecord(string propertyId, bytes32 docHash) view returns (address submitter, uint256 timestamp)",
  "event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp)",
] as const satisfies InterfaceAbi;
