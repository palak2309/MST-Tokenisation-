import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, parseEther, formatEther } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const DEFAULT_INVESTOR_ACCOUNT = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const DEFAULT_FUND_AMOUNT_MST = "1.0";
export const CONFIRMATION_PHRASE = "FUND INVESTOR ACCOUNT 3";

export function normalizeAccountAddress(rawAddress: string | undefined): string {
  if (!rawAddress || typeof rawAddress !== "string") {
    throw new Error("Address must be a non-empty string.");
  }
  const trimmed = rawAddress.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error("Address cannot be empty or the zero address.");
  }
  try {
    return getAddress(trimmed);
  } catch {
    return getAddress(trimmed.toLowerCase());
  }
}

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
}

export function validateConfirmationPhrase(input: string): boolean {
  return input.trim() === CONFIRMATION_PHRASE;
}

export function normalizeScriptPath(filePath: string): string {
  try {
    return path.resolve(filePath).toLowerCase().replace(/\\/g, "/");
  } catch {
    return "";
  }
}

export function matchesScriptPath(arg: string, targetNormalized: string): boolean {
  if (!arg || typeof arg !== "string" || arg.startsWith("-")) {
    return false;
  }
  const normalizedArg = normalizeScriptPath(arg);
  if (!normalizedArg) return false;
  if (normalizedArg === targetNormalized) return true;
  if (`${normalizedArg}.ts` === targetNormalized || `${normalizedArg}.js` === targetNormalized) {
    return true;
  }
  return false;
}

export function isDirectExecution(
  importMetaUrl: string,
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env["VITEST"] === "true" || env["HARDHAT_TEST"] === "true" || env["NODE_ENV"] === "test") {
    return false;
  }

  if (!importMetaUrl || !Array.isArray(argv) || argv.length < 2) {
    return false;
  }

  let targetPath: string;
  try {
    targetPath = fileURLToPath(importMetaUrl);
  } catch {
    return false;
  }

  const targetNormalized = normalizeScriptPath(targetPath);
  if (!targetNormalized) {
    return false;
  }

  const directArg = argv[1];
  if (directArg && matchesScriptPath(directArg, targetNormalized)) {
    return true;
  }

  const isHardhatRunner = argv.some(
    (arg) => typeof arg === "string" && arg.toLowerCase().includes("hardhat"),
  );
  const isHardhatRunTask = argv.includes("run");

  if (isHardhatRunner) {
    return (
      isHardhatRunTask && argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized))
    );
  }

  return argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized));
}

async function main() {
  console.log("=== MST Mainnet Investor Gas Funding Operation ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing gas funding on unexpected network "${networkName}". Expected "mstMainnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }

  const signerAddress = await signer.getAddress();
  const rawRecipient =
    process.env["MST_MAINNET_INVESTOR_ADDRESS"]?.trim() || DEFAULT_INVESTOR_ACCOUNT;
  const recipientAddress = normalizeAccountAddress(rawRecipient);

  const fundAmountStr =
    process.env["MST_MAINNET_FUND_AMOUNT_MST"]?.trim() || DEFAULT_FUND_AMOUNT_MST;
  const fundAmountWei = parseEther(fundAmountStr);

  const [adminBalance, recipientBalanceBefore] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getBalance(recipientAddress),
  ]);

  console.log("Connected Network:       MST Mainnet (Chain ID 4646)");
  console.log("Funder (Admin Account 1):", signerAddress);
  console.log("Funder Current Balance:  ", formatEther(adminBalance), "MST");
  console.log("Recipient (Investor):    ", recipientAddress);
  console.log("Recipient Balance Before:", formatEther(recipientBalanceBefore), "MST");
  console.log("Transfer Amount:         ", fundAmountStr, "MST");

  const gasLimit = 21000n;
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1000000000n;
  const estimatedGasCost = gasLimit * gasPrice;
  const totalCost = fundAmountWei + estimatedGasCost;

  if (adminBalance < totalCost) {
    throw new Error(
      `Insufficient admin balance. Required: ${formatEther(totalCost)} MST, Available: ${formatEther(adminBalance)} MST`,
    );
  }

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast native MST gas transfer on MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation)) {
    throw new Error("Funding cancelled; confirmation phrase did not match.");
  }

  console.log("\nBroadcasting native transfer transaction to MST Mainnet...");
  const tx = await signer.sendTransaction({
    to: recipientAddress,
    value: fundAmountWei,
    gasLimit,
  });

  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Gas funding transaction failed on-chain.");
  }

  const recipientBalanceAfter = await ethers.provider.getBalance(recipientAddress);

  console.log("\n=== Gas Funding Confirmed & Verified ===");
  console.log("Transaction Hash:        ", receipt.hash);
  console.log("Block Number:            ", receipt.blockNumber);
  console.log("Gas Used:                ", receipt.gasUsed.toString());
  console.log("Recipient Balance After: ", formatEther(recipientBalanceAfter), "MST ✓");
  console.log(`Explorer Link:           https://mstscan.com/tx/${receipt.hash}`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected funding error.";
    console.error("\n[FUNDING FAILED]", message);
    process.exitCode = 1;
  });
}
