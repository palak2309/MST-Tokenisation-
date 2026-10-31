import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const DEFAULT_DEMO_UNSTAKE_AMOUNT = 10n;
export const CONFIRMATION_PHRASE = "UNSTAKE 10 MAINNET UNITS";

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

export function getExpectedConfirmationPhrase(
  amount: bigint = DEFAULT_DEMO_UNSTAKE_AMOUNT,
): string {
  return `UNSTAKE ${amount.toString()} MAINNET UNITS`;
}

export function validateConfirmationPhrase(
  input: string,
  expectedPhrase: string = CONFIRMATION_PHRASE,
): boolean {
  return input.trim() === expectedPhrase;
}

export function parseTokenId(
  rawTokenId: string | undefined,
  defaultTokenId: bigint = DEFAULT_DEMO_TOKEN_ID,
): bigint {
  if (!rawTokenId || rawTokenId.trim() === "") {
    return defaultTokenId;
  }
  const trimmed = rawTokenId.trim();
  try {
    const val = BigInt(trimmed);
    if (val <= 0n) {
      throw new Error("Token ID must be a positive integer.");
    }
    return val;
  } catch (e) {
    if (e instanceof Error && e.message.includes("positive integer")) {
      throw e;
    }
    throw new Error(`Invalid token ID "${trimmed}". Must be a valid positive integer.`);
  }
}

export function parseUnstakeAmount(
  rawAmount: string | undefined,
  defaultAmount: bigint = DEFAULT_DEMO_UNSTAKE_AMOUNT,
): bigint {
  if (!rawAmount || rawAmount.trim() === "") {
    return defaultAmount;
  }
  const trimmed = rawAmount.trim();
  try {
    const val = BigInt(trimmed);
    if (val <= 0n) {
      throw new Error("Unstake amount must be a positive integer.");
    }
    return val;
  } catch (e) {
    if (e instanceof Error && e.message.includes("positive integer")) {
      throw e;
    }
    throw new Error(`Invalid unstake amount "${trimmed}". Must be a valid positive integer.`);
  }
}

export function validateUnstakeEligibility(
  stakedAmount: bigint,
  requestedAmount: bigint,
  lockEndTime: bigint,
  currentBlockTimestamp: bigint,
): { valid: boolean; reason?: string } {
  if (requestedAmount <= 0n) {
    return { valid: false, reason: "Unstake amount must be greater than zero." };
  }
  if (stakedAmount < requestedAmount) {
    return {
      valid: false,
      reason: `Insufficient staked balance. Position has ${stakedAmount.toString()} units; requested to unstake ${requestedAmount.toString()} units.`,
    };
  }
  if (currentBlockTimestamp < lockEndTime) {
    const remaining = lockEndTime - currentBlockTimestamp;
    return {
      valid: false,
      reason: `Lock period is still active. ${remaining.toString()} seconds remaining before lock expiry.`,
    };
  }
  return { valid: true };
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
  console.log("=== MST Mainnet Property Unstaking Operation ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing unstaking on unexpected network "${networkName}". Expected "mstMainnet".`,
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
  console.log("Connected Network: MST Mainnet (Chain ID 4646)");
  console.log("Signer (Investor): ", signerAddress);

  const rawTokenAddress =
    process.env["MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim();
  const rawStakingAddress =
    process.env["MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress || !rawStakingAddress) {
    throw new Error(
      "Both MST_MAINNET_TOKEN_CONTRACT_ADDRESS and MST_MAINNET_STAKING_CONTRACT_ADDRESS are required.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const stakingAddress = normalizeAccountAddress(rawStakingAddress);

  const tokenId = parseTokenId(process.env["MST_MAINNET_TOKEN_ID"]);
  const unstakeAmount = parseUnstakeAmount(process.env["MST_MAINNET_UNSTAKE_AMOUNT"]);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);
  const stakingContract = await ethers.getContractAt(
    "PropertyTokenStaking",
    stakingAddress,
    signer,
  );

  // 1. Pre-flight checks
  const [stakeInfo, latestBlock] = await Promise.all([
    stakingContract.getFunction("getStakeInfo")(tokenId, signerAddress),
    ethers.provider.getBlock("latest"),
  ]);

  if (!latestBlock) {
    throw new Error("Failed to fetch latest block from MST Mainnet provider.");
  }

  const eligibility = validateUnstakeEligibility(
    stakeInfo.amount,
    unstakeAmount,
    stakeInfo.lockEndTime,
    BigInt(latestBlock.timestamp),
  );

  if (!eligibility.valid) {
    throw new Error(`Unstaking eligibility check failed: ${eligibility.reason}`);
  }

  // 2. Gas Estimation
  const estimatedGas = await stakingContract
    .getFunction("unstake")
    .estimateGas(tokenId, unstakeAmount);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1000000000n;
  const estimatedCost = estimatedGas * gasPrice;

  console.log("\n--- Unstaking Pre-Flight & Cost Estimation ---");
  console.log("PropertyToken:            ", tokenAddress);
  console.log("Staking Vault:            ", stakingAddress);
  console.log("Property Token ID:        #", tokenId.toString());
  console.log("Units to Unstake:         ", unstakeAmount.toString(), "Units");
  console.log("Current Staked Position:  ", stakeInfo.amount.toString(), "Units");
  console.log("Lock Status:              Unlocked (Expired / 0-Day Lock) ✓");
  console.log("Estimated Gas Units:      ", estimatedGas.toString());
  console.log("Estimated Gas Fee:        ", formatEther(estimatedCost), "MST");

  // 3. Confirmation Guard
  const expectedPhrase = getExpectedConfirmationPhrase(unstakeAmount);
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${expectedPhrase}" to broadcast unstaking withdrawal on MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation, expectedPhrase)) {
    throw new Error("Unstaking cancelled; confirmation phrase did not match.");
  }

  // 4. Broadcast unstake transaction
  console.log("\nBroadcasting unstake transaction to MST Mainnet...");
  const tx = await stakingContract.getFunction("unstake")(tokenId, unstakeAmount);
  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Unstaking transaction failed on-chain.");
  }

  // 5. Verification
  const [newWalletBalance, updatedStakeInfo, contractCustodyBalance] = await Promise.all([
    tokenContract.getFunction("balanceOf")(signerAddress, tokenId),
    stakingContract.getFunction("getStakeInfo")(tokenId, signerAddress),
    tokenContract.getFunction("balanceOf")(stakingAddress, tokenId),
  ]);

  console.log("\n=== Unstaking Operation Confirmed & Verified ===");
  console.log("Transaction Hash:         ", receipt.hash);
  console.log("Block Number:             ", receipt.blockNumber);
  console.log("Gas Used:                 ", receipt.gasUsed.toString());
  console.log("Wallet Units Restored:    ", newWalletBalance.toString(), "Units ✓");
  console.log("Units Remaining in Vault: ", updatedStakeInfo.amount.toString(), "Units ✓");
  console.log("Contract Custody Total:   ", contractCustodyBalance.toString(), "Units ✓");
  console.log(`Explorer Link:            https://mstscan.com/tx/${receipt.hash}`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected unstaking error.";
    console.error("\n[UNSTAKING FAILED]", message);
    process.exitCode = 1;
  });
}
