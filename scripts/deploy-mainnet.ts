import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { network } from "hardhat";

const MAINNET_CHAIN_ID = 4646n;
const CONFIRMATION_PHRASE = "DEPLOY MST MAINNET";

async function main() {
  if (process.env.MST_MAINNET_CHAIN_ID?.trim() !== MAINNET_CHAIN_ID.toString()) {
    throw new Error(
      "Set MST_MAINNET_CHAIN_ID to exactly 4646 to enable the Mainnet deployment.",
    );
  }

  const rpcUrl = process.env.MST_MAINNET_RPC_URL?.trim();
  if (!rpcUrl) {
    throw new Error("MST_MAINNET_RPC_URL is required.");
  }

  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error("MST_MAINNET_RPC_URL must be a valid HTTPS URL.");
  }
  if (parsedRpcUrl.protocol !== "https:") {
    throw new Error("MST_MAINNET_RPC_URL must use HTTPS.");
  }

  if (!process.env.MST_MAINNET_PRIVATE_KEY?.trim()) {
    throw new Error(
      "MST_MAINNET_PRIVATE_KEY is required in the local process environment.",
    );
  }

  const { ethers, networkName } = await network.create();
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing deployment on unexpected Hardhat network "${networkName}".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (actualNetwork.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId}; expected MST Mainnet chain ID 4646.`,
    );
  }

  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `Connected to chain ${MAINNET_CHAIN_ID}. Type "${CONFIRMATION_PHRASE}" to send the deployment transaction: `,
    );
  } finally {
    terminal.close();
  }
  if (confirmation !== CONFIRMATION_PHRASE) {
    throw new Error("Deployment cancelled; confirmation phrase did not match.");
  }

  const registry = await ethers.deployContract("PropertyDocumentRegistry");
  const deploymentTransaction = registry.deploymentTransaction();
  if (!deploymentTransaction) {
    throw new Error("Hardhat did not return a deployment transaction.");
  }

  const receipt = await deploymentTransaction.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment transaction did not succeed.");
  }

  const contractAddress = await registry.getAddress();
  const bytecode = await ethers.provider.getCode(contractAddress);
  if (bytecode === "0x") {
    throw new Error(
      "Deployment receipt succeeded, but no contract bytecode was found at the resulting address.",
    );
  }

  console.log("Deployment confirmed and bytecode verified.");
  console.log("Transaction hash:", receipt.hash);
  console.log("Contract address:", contractAddress);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unexpected deployment failure.";
  console.error("Mainnet deployment halted:", message);
  process.exitCode = 1;
});
