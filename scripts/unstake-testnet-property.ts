import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const DEFAULT_DEMO_UNSTAKE_AMOUNT = 10n;
export const CONFIRMATION_PHRASE = "UNSTAKE 10 TESTNET UNITS";

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

export function validateTestnetChainId(chainId: bigint): boolean {
  return chainId === TESTNET_CHAIN_ID;
}

export function getExpectedConfirmationPhrase(
  amount: bigint = DEFAULT_DEMO_UNSTAKE_AMOUNT,
): string {
  return `UNSTAKE ${amount.toString()} TESTNET UNITS`;
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

export function validateStakePosition(
  stakeInfo: { amount: bigint; lockEndTime: bigint },
  requestedAmount: bigint,
  currentTimestamp: bigint = BigInt(Math.floor(Date.now() / 1000)),
): { valid: boolean; reason?: string } {
  if (stakeInfo.amount < requestedAmount) {
    return {
      valid: false,
      reason: `Insufficient staked balance: actively staked ${stakeInfo.amount.toString()} units in vault, but requested to unstake ${requestedAmount.toString()} units.`,
    };
  }

  if (currentTimestamp < stakeInfo.lockEndTime) {
    return {
      valid: false,
      reason: `Lock period has not expired yet: lock ends at timestamp ${stakeInfo.lockEndTime.toString()} (current: ${currentTimestamp.toString()}).`,
    };
  }

  return { valid: true };
}

export function validateEnvironmentConfig(env: NodeJS.ProcessEnv = process.env): {
  tokenAddress: string;
  stakingAddress: string;
  tokenId: bigint;
  unstakeAmount: bigint;
} {
  const rawTokenAddress =
    env["MST_TESTNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    env["VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress) {
    throw new Error(
      "MST_TESTNET_TOKEN_CONTRACT_ADDRESS is required. Set it to the deployed PropertyToken address.",
    );
  }

  const rawStakingAddress =
    env["MST_TESTNET_STAKING_CONTRACT_ADDRESS"]?.trim() ||
    env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"]?.trim();

  if (!rawStakingAddress) {
    throw new Error(
      "MST_TESTNET_STAKING_CONTRACT_ADDRESS is required. Set it to the deployed PropertyTokenStaking address.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const stakingAddress = normalizeAccountAddress(rawStakingAddress);

  if (tokenAddress.toLowerCase() === stakingAddress.toLowerCase()) {
    throw new Error("PropertyToken and PropertyTokenStaking cannot have the same address.");
  }

  const tokenId = parseTokenId(env["MST_TESTNET_TOKEN_ID"]?.trim());
  const unstakeAmount = parseUnstakeAmount(env["MST_TESTNET_UNSTAKE_AMOUNT"]?.trim());

  return { tokenAddress, stakingAddress, tokenId, unstakeAmount };
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

export interface IPropertyTokenUnstakeView {
  balanceOf(account: string, id: bigint): Promise<bigint>;
  isEligibleInvestor(account: string): Promise<boolean>;
  isAuthorizedStakingContract(account: string): Promise<boolean>;
}

export interface IStakingContractUnstake {
  unstake(
    tokenId: bigint,
    amount: bigint,
  ): Promise<{
    hash: string;
    wait(confirmations?: number): Promise<{ status?: number | null } | null>;
  }>;
  getStakeInfo(
    tokenId: bigint,
    investor: string,
  ): Promise<{
    amount: bigint;
    lockStartTime: bigint;
    lockEndTime: bigint;
    pendingRewards: bigint;
    isLocked: boolean;
  }>;
}

export interface UnstakeExecutionOptions {
  tokenContract: IPropertyTokenUnstakeView;
  stakingContract: IStakingContractUnstake;
  signerAddress: string;
  tokenAddress: string;
  stakingAddress: string;
  tokenId: bigint;
  unstakeAmount: bigint;
  currentTimestamp?: bigint | undefined;
  promptConfirmation?: ((promptText: string) => Promise<string>) | undefined;
  gasEstimateDisplay?: string | undefined;
}

export interface UnstakeExecutionResult {
  txHash: string;
  tokenId: bigint;
  unstakedAmount: bigint;
  remainingStakedInVault: bigint;
  walletBalance: bigint;
  lockEndTime: bigint;
}

export async function executeUnstakeFlow(
  options: UnstakeExecutionOptions,
): Promise<UnstakeExecutionResult> {
  const {
    tokenContract,
    stakingContract,
    signerAddress,
    tokenAddress,
    stakingAddress,
    tokenId,
    unstakeAmount,
    currentTimestamp,
    promptConfirmation,
    gasEstimateDisplay = "~250,000 gas",
  } = options;

  // 1. Verify existing stake position and lock expiration
  const stakeInfo = await stakingContract.getStakeInfo(tokenId, signerAddress);
  const posCheck = validateStakePosition(stakeInfo, unstakeAmount, currentTimestamp);
  if (!posCheck.valid) {
    throw new Error(posCheck.reason);
  }

  // 2. Verify KYC eligibility of investor
  const isInvestorEligible = await tokenContract.isEligibleInvestor(signerAddress);
  if (!isInvestorEligible) {
    throw new Error(
      `Signer ${signerAddress} is not whitelisted as an eligible investor on PropertyToken. Contact compliance to complete KYC approval.`,
    );
  }

  // 3. Verify KYC eligibility of staking contract
  const isStakingEligible = await tokenContract.isEligibleInvestor(stakingAddress);
  if (!isStakingEligible) {
    throw new Error(
      `Staking contract ${stakingAddress} is not whitelisted as an eligible investor on PropertyToken. Run "npm run authorize:testnet:staking" first.`,
    );
  }

  // 4. Verify staking contract transfer exemption authorization
  const isStakingAuthorized = await tokenContract.isAuthorizedStakingContract(stakingAddress);
  if (!isStakingAuthorized) {
    throw new Error(
      `Staking contract ${stakingAddress} is not authorized with staking transfer exemption on PropertyToken. Run "npm run authorize:testnet:staking" first.`,
    );
  }

  // 5. Prompt for exact confirmation phrase
  const expectedPhrase = getExpectedConfirmationPhrase(unstakeAmount);

  if (promptConfirmation) {
    const promptText =
      `\n=============================================================\n` +
      `            MST TESTNET UNSTAKING TRANSACTION SUMMARY         \n` +
      `=============================================================\n` +
      `Network:              MST Testnet (Chain ID 91562037)\n` +
      `Signer (Investor):    ${signerAddress}\n` +
      `PropertyToken:        ${tokenAddress}\n` +
      `Token ID:             #${tokenId.toString()}\n` +
      `Unstake Amount:       ${unstakeAmount.toString()} Units\n` +
      `Vault Active Staked:  ${stakeInfo.amount.toString()} Units\n` +
      `Lock Status:          EXPIRED / UNLOCKED (Eligible for immediate withdrawal) ✓\n` +
      `Staking Contract:     ${stakingAddress}\n` +
      `Estimated Gas:        ${gasEstimateDisplay}\n` +
      `KYC Status:           VERIFIED ELIGIBLE ✓\n` +
      `Contract Auth:        VERIFIED EXEMPTION ✓\n` +
      `=============================================================\n` +
      `Notice: Withdrawing property units from staking custody.\n` +
      `Units will be transferred back to your investor wallet.\n` +
      `=============================================================\n` +
      `Type "${expectedPhrase}" to broadcast on-chain: `;

    const confirmation = await promptConfirmation(promptText);
    if (!validateConfirmationPhrase(confirmation, expectedPhrase)) {
      throw new Error("Unstaking cancelled; confirmation phrase did not match.");
    }
  }

  // 6. Call the staking contract's actual unstake function (tokenId, amount)
  const tx = await stakingContract.unstake(tokenId, unstakeAmount);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Unstaking transaction failed on-chain.");
  }

  // 7. Wait for confirmation and verify stake position and remaining wallet balance
  const updatedStakeInfo = await stakingContract.getStakeInfo(tokenId, signerAddress);
  const updatedWalletBalance = await tokenContract.balanceOf(signerAddress, tokenId);

  return {
    txHash: tx.hash,
    tokenId,
    unstakedAmount: unstakeAmount,
    remainingStakedInVault: updatedStakeInfo.amount,
    walletBalance: updatedWalletBalance,
    lockEndTime: updatedStakeInfo.lockEndTime,
  };
}

async function main() {
  console.log("=== MST Testnet Property Unit Unstaking (Custody Exit) ===");

  const privateKey = process.env["MST_TESTNET_PRIVATE_KEY"]?.trim();
  if (!privateKey) {
    throw new Error(
      "MST_TESTNET_PRIVATE_KEY is required in the local shell environment or Hardhat configuration variables.\n" +
        "Set it via `npx hardhat vars set MST_TESTNET_PRIVATE_KEY` or in your local terminal session.\n" +
        "Never commit private keys to Git or save them in repository files.",
    );
  }

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing unstaking on unexpected network "${networkName}". Expected "mstTestnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateTestnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Testnet chain ID ${TESTNET_CHAIN_ID.toString()}.`,
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }

  const signerAddress = await signer.getAddress();
  const { tokenAddress, stakingAddress, tokenId, unstakeAmount } = validateEnvironmentConfig(
    process.env,
  );

  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(`No bytecode found at PropertyToken address "${tokenAddress}".`);
  }

  const stakingCode = await ethers.provider.getCode(stakingAddress);
  if (stakingCode === "0x") {
    throw new Error(`No bytecode found at PropertyTokenStaking address "${stakingAddress}".`);
  }

  const tokenContractRaw = await ethers.getContractAt("PropertyToken", tokenAddress, signer);
  const stakingContractRaw = await ethers.getContractAt(
    "PropertyTokenStaking",
    stakingAddress,
    signer,
  );

  const tokenContract: IPropertyTokenUnstakeView = {
    balanceOf: (acc, id) => tokenContractRaw.getFunction("balanceOf")(acc, id),
    isEligibleInvestor: (acc) => tokenContractRaw.getFunction("isEligibleInvestor")(acc),
    isAuthorizedStakingContract: (acc) =>
      tokenContractRaw.getFunction("isAuthorizedStakingContract")(acc),
  };

  const stakingContract: IStakingContractUnstake = {
    unstake: (id, amt) => stakingContractRaw.getFunction("unstake")(id, amt),
    getStakeInfo: async (id, inv) => {
      const res = await stakingContractRaw.getFunction("getStakeInfo")(id, inv);
      return {
        amount: res[0],
        lockStartTime: res[1],
        lockEndTime: res[2],
        pendingRewards: res[3],
        isLocked: res[4],
      };
    },
  };

  // Gas estimation
  let gasEstimateDisplay = "~250,000 gas";
  try {
    const gasUnits = await stakingContractRaw
      .getFunction("unstake")
      .estimateGas(tokenId, unstakeAmount);
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 1000000000n;
    const costWei = gasUnits * gasPrice;
    gasEstimateDisplay = `~${gasUnits.toString()} gas units (~${formatEther(costWei)} MST)`;
  } catch {
    gasEstimateDisplay = "~250,000 gas units (fallback estimate)";
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  const currentTimestamp = latestBlock ? BigInt(latestBlock.timestamp) : undefined;

  const promptConfirmation = async (promptText: string) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      return await terminal.question(promptText);
    } finally {
      terminal.close();
    }
  };

  const result = await executeUnstakeFlow({
    tokenContract,
    stakingContract,
    signerAddress,
    tokenAddress,
    stakingAddress,
    tokenId,
    unstakeAmount,
    currentTimestamp,
    promptConfirmation,
    gasEstimateDisplay,
  });

  console.log("\n--- Post-Unstaking Position Verification ---");
  console.log("Transaction Hash:       ", result.txHash);
  console.log("Unstaked Units Returned:", result.unstakedAmount.toString(), "Units ✓");
  console.log("Remaining in Vault:     ", result.remainingStakedInVault.toString(), "Units");
  console.log("Wallet Units Balance:   ", result.walletBalance.toString(), "Units ✓");
  console.log("=============================================================");
  console.log("✓ Unstaking operation successfully executed and verified on MST Testnet!");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected unstaking failure.";
    console.error("\nUnstaking halted:", message);
    process.exitCode = 1;
  });
}
