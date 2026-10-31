import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const DEFAULT_DEMO_STAKE_AMOUNT = 10n;
export const DEFAULT_DEMO_LOCK_DURATION = 0n;
export const CONFIRMATION_PHRASE = "STAKE 10 MAINNET UNITS";

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

export function validateLockDuration(lockDuration: bigint): boolean {
  return lockDuration === 0n;
}

export function getExpectedConfirmationPhrase(amount: bigint = DEFAULT_DEMO_STAKE_AMOUNT): string {
  return `STAKE ${amount.toString()} MAINNET UNITS`;
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

export function parseStakeAmount(
  rawAmount: string | undefined,
  defaultAmount: bigint = DEFAULT_DEMO_STAKE_AMOUNT,
): bigint {
  if (!rawAmount || rawAmount.trim() === "") {
    return defaultAmount;
  }
  const trimmed = rawAmount.trim();
  try {
    const val = BigInt(trimmed);
    if (val <= 0n) {
      throw new Error("Stake amount must be a positive integer.");
    }
    return val;
  } catch (e) {
    if (e instanceof Error && e.message.includes("positive integer")) {
      throw e;
    }
    throw new Error(`Invalid stake amount "${trimmed}". Must be a valid positive integer.`);
  }
}

export function validatePoolConfiguration(
  poolConfig: { minLockDuration: bigint; maxLockDuration: bigint; isEnabled: boolean },
  lockDuration: bigint = DEFAULT_DEMO_LOCK_DURATION,
): { valid: boolean; reason?: string } {
  if (
    !poolConfig.isEnabled &&
    (poolConfig.minLockDuration !== 0n || poolConfig.maxLockDuration !== 0n)
  ) {
    return {
      valid: false,
      reason: "Staking pool is explicitly disabled for this property token ID.",
    };
  }

  const minLock = poolConfig.minLockDuration;
  const maxLock = poolConfig.maxLockDuration === 0n ? 365n * 86400n : poolConfig.maxLockDuration;

  if (lockDuration < minLock || lockDuration > maxLock) {
    return {
      valid: false,
      reason: `Requested lock duration (${lockDuration.toString()}s) is outside pool limits [${minLock.toString()}s, ${maxLock.toString()}s].`,
    };
  }

  return { valid: true };
}

export function validateStakingEligibility(
  investorBalance: bigint,
  stakeAmount: bigint,
  investorKyc: boolean,
  isOperatorApproved: boolean,
  stakingAuthorized: boolean,
): { valid: boolean; reason?: string } {
  if (investorBalance < stakeAmount) {
    return {
      valid: false,
      reason: `Insufficient wallet balance. Staker owns ${investorBalance.toString()} units; requested to stake ${stakeAmount.toString()} units.`,
    };
  }
  if (!investorKyc) {
    return {
      valid: false,
      reason: "Signer is not approved as an eligible investor (KYC) on PropertyToken.",
    };
  }
  if (!isOperatorApproved) {
    return {
      valid: false,
      reason:
        "Staking contract is not approved as an operator. Run `npm run approve:mainnet:staking` first.",
    };
  }
  if (!stakingAuthorized) {
    return {
      valid: false,
      reason:
        "Staking contract is not authorized as an exempt staking contract on PropertyToken. Run `npm run authorize:mainnet:staking` first.",
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
  console.log("=== MST Mainnet Property Staking Operation ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing staking on unexpected network "${networkName}". Expected "mstMainnet".`,
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
  const stakeAmount = parseStakeAmount(process.env["MST_MAINNET_STAKE_AMOUNT"]);
  const lockDuration = DEFAULT_DEMO_LOCK_DURATION;

  if (!validateLockDuration(lockDuration)) {
    throw new Error("Demo lock duration must be exactly 0 seconds.");
  }

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);
  const stakingContract = await ethers.getContractAt(
    "PropertyTokenStaking",
    stakingAddress,
    signer,
  );

  // 1. Pre-flight checks
  const [balance, investorKyc, isOperatorApproved, stakingAuthorized, rawPoolConfig] =
    await Promise.all([
      tokenContract.getFunction("balanceOf")(signerAddress, tokenId),
      tokenContract.getFunction("isEligibleInvestor")(signerAddress),
      tokenContract.getFunction("isApprovedForAll")(signerAddress, stakingAddress),
      tokenContract.getFunction("isAuthorizedStakingContract")(stakingAddress),
      stakingContract.getFunction("poolConfigs")(tokenId),
    ]);

  const poolConfig = {
    minLockDuration: rawPoolConfig[0],
    maxLockDuration: rawPoolConfig[1],
    isEnabled: rawPoolConfig[2],
  };

  const poolValidation = validatePoolConfiguration(poolConfig, lockDuration);
  if (!poolValidation.valid) {
    throw new Error(`Pool configuration check failed: ${poolValidation.reason}`);
  }

  const eligibilityValidation = validateStakingEligibility(
    balance,
    stakeAmount,
    investorKyc,
    isOperatorApproved,
    stakingAuthorized,
  );
  if (!eligibilityValidation.valid) {
    throw new Error(`Staking eligibility check failed: ${eligibilityValidation.reason}`);
  }

  // 2. Gas Estimation
  const estimatedGas = await stakingContract
    .getFunction("stake")
    .estimateGas(tokenId, stakeAmount, lockDuration);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1000000000n;
  const estimatedCost = estimatedGas * gasPrice;

  console.log("\n--- Staking Pre-Flight & Cost Estimation ---");
  console.log("PropertyToken:            ", tokenAddress);
  console.log("Staking Vault:            ", stakingAddress);
  console.log("Property Token ID:        #", tokenId.toString());
  console.log("Units to Stake:           ", stakeAmount.toString(), "Units");
  console.log("Lock Period:              0 Days (Flexible Demonstration Lock)");
  console.log("Wallet Balance Before:    ", balance.toString(), "Units");
  console.log("Estimated Gas Units:      ", estimatedGas.toString());
  console.log("Estimated Gas Fee:        ", formatEther(estimatedCost), "MST");

  // 3. Confirmation Guard
  const expectedPhrase = getExpectedConfirmationPhrase(stakeAmount);
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${expectedPhrase}" to broadcast staking deposit on MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation, expectedPhrase)) {
    throw new Error("Staking cancelled; confirmation phrase did not match.");
  }

  // 4. Broadcast stake transaction
  console.log("\nBroadcasting stake transaction to MST Mainnet...");
  const tx = await stakingContract.getFunction("stake")(tokenId, stakeAmount, lockDuration);
  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Staking transaction failed on-chain.");
  }

  // 5. Verification
  const [newWalletBalance, stakeInfo, contractCustodyBalance] = await Promise.all([
    tokenContract.getFunction("balanceOf")(signerAddress, tokenId),
    stakingContract.getFunction("getStakeInfo")(tokenId, signerAddress),
    tokenContract.getFunction("balanceOf")(stakingAddress, tokenId),
  ]);

  console.log("\n=== Staking Operation Confirmed & Verified ===");
  console.log("Transaction Hash:         ", receipt.hash);
  console.log("Block Number:             ", receipt.blockNumber);
  console.log("Gas Used:                 ", receipt.gasUsed.toString());
  console.log("Wallet Units Remaining:   ", newWalletBalance.toString(), "Units");
  console.log("Units in Staking Vault:   ", stakeInfo.amount.toString(), "Units ✓");
  console.log("Contract Custody Total:   ", contractCustodyBalance.toString(), "Units ✓");
  console.log(`Explorer Link:            https://mstscan.com/tx/${receipt.hash}`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected staking error.";
    console.error("\n[STAKING FAILED]", message);
    process.exitCode = 1;
  });
}
