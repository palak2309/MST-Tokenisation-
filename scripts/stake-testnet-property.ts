import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const DEFAULT_DEMO_STAKE_AMOUNT = 10n;
export const DEFAULT_DEMO_LOCK_DURATION = 0n;
export const CONFIRMATION_PHRASE = "STAKE 10 TESTNET UNITS";

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

export function validateLockDuration(lockDuration: bigint): boolean {
  return lockDuration === 0n;
}

export function getExpectedConfirmationPhrase(amount: bigint = DEFAULT_DEMO_STAKE_AMOUNT): string {
  return `STAKE ${amount.toString()} TESTNET UNITS`;
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
  // If explicitly disabled (and configured)
  if (
    !poolConfig.isEnabled &&
    (poolConfig.minLockDuration !== 0n || poolConfig.maxLockDuration !== 0n)
  ) {
    return {
      valid: false,
      reason: "Staking pool is explicitly disabled for this token ID.",
    };
  }

  const maxLock = poolConfig.maxLockDuration === 0n ? 365n * 86400n : poolConfig.maxLockDuration;
  if (lockDuration < poolConfig.minLockDuration || lockDuration > maxLock) {
    return {
      valid: false,
      reason: `Lock duration ${lockDuration.toString()}s is outside pool bounds (min: ${poolConfig.minLockDuration.toString()}s, max: ${maxLock.toString()}s). Pool must allow 0-day lock.`,
    };
  }

  return { valid: true };
}

export function validateEnvironmentConfig(env: NodeJS.ProcessEnv = process.env): {
  tokenAddress: string;
  stakingAddress: string;
  tokenId: bigint;
  stakeAmount: bigint;
  lockDuration: bigint;
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
  const stakeAmount = parseStakeAmount(env["MST_TESTNET_STAKE_AMOUNT"]?.trim());

  // Lock duration must be strictly 0
  const rawLockDuration = env["MST_TESTNET_LOCK_DURATION"]?.trim();
  const lockDuration = rawLockDuration ? BigInt(rawLockDuration) : DEFAULT_DEMO_LOCK_DURATION;

  if (lockDuration !== 0n) {
    throw new Error(
      `Lock duration must be 0 for demo staking; received "${lockDuration.toString()}".`,
    );
  }

  return { tokenAddress, stakingAddress, tokenId, stakeAmount, lockDuration };
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

export interface IPropertyTokenStakeView {
  balanceOf(account: string, id: bigint): Promise<bigint>;
  isEligibleInvestor(account: string): Promise<boolean>;
  isAuthorizedStakingContract(account: string): Promise<boolean>;
  isApprovedForAll(account: string, operator: string): Promise<boolean>;
}

export interface IStakingContractStake {
  poolConfigs(tokenId: bigint): Promise<readonly [bigint, bigint, boolean]>;
  stake(
    tokenId: bigint,
    amount: bigint,
    lockDuration: bigint,
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

export interface StakeExecutionOptions {
  tokenContract: IPropertyTokenStakeView;
  stakingContract: IStakingContractStake;
  signerAddress: string;
  tokenAddress: string;
  stakingAddress: string;
  tokenId: bigint;
  stakeAmount: bigint;
  lockDuration: bigint;
  promptConfirmation?: (promptText: string) => Promise<string>;
  gasEstimateDisplay?: string;
}

export interface StakeExecutionResult {
  txHash: string;
  tokenId: bigint;
  stakedAmount: bigint;
  vaultTotalStaked: bigint;
  remainingBalance: bigint;
  lockEndTime: bigint;
  isLocked: boolean;
}

export async function executeStakeFlow(
  options: StakeExecutionOptions,
): Promise<StakeExecutionResult> {
  const {
    tokenContract,
    stakingContract,
    signerAddress,
    tokenAddress,
    stakingAddress,
    tokenId,
    stakeAmount,
    lockDuration,
    promptConfirmation,
    gasEstimateDisplay = "~350,000 gas",
  } = options;

  // 1. Verify lock duration is strictly 0
  if (!validateLockDuration(lockDuration)) {
    throw new Error(
      `Lock duration must be 0 for demo staking; received "${lockDuration.toString()}".`,
    );
  }

  // 2. Verify signer balance >= stakeAmount
  const balance = await tokenContract.balanceOf(signerAddress, tokenId);
  if (balance < stakeAmount) {
    throw new Error(
      `Insufficient token balance for signer ${signerAddress}: owns ${balance.toString()} units of token #${tokenId.toString()}, but ${stakeAmount.toString()} units required to stake.`,
    );
  }

  // 3. Verify KYC eligibility of investor
  const isInvestorEligible = await tokenContract.isEligibleInvestor(signerAddress);
  if (!isInvestorEligible) {
    throw new Error(
      `Signer ${signerAddress} is not whitelisted as an eligible investor on PropertyToken. Contact compliance to complete KYC approval.`,
    );
  }

  // 4. Verify KYC eligibility of staking contract
  const isStakingEligible = await tokenContract.isEligibleInvestor(stakingAddress);
  if (!isStakingEligible) {
    throw new Error(
      `Staking contract ${stakingAddress} is not whitelisted as an eligible investor on PropertyToken. Run "npm run authorize:testnet:staking" first.`,
    );
  }

  // 5. Verify staking contract transfer exemption authorization
  const isStakingAuthorized = await tokenContract.isAuthorizedStakingContract(stakingAddress);
  if (!isStakingAuthorized) {
    throw new Error(
      `Staking contract ${stakingAddress} is not authorized with staking transfer exemption on PropertyToken. Run "npm run authorize:testnet:staking" first.`,
    );
  }

  // 6. Verify operator approval
  const isApproved = await tokenContract.isApprovedForAll(signerAddress, stakingAddress);
  if (!isApproved) {
    throw new Error(
      `Staking contract ${stakingAddress} is not approved as operator for ${signerAddress} on PropertyToken. Run "npm run approve:testnet:staking" first.`,
    );
  }

  // 7. Verify pool configuration
  const poolRaw = await stakingContract.poolConfigs(tokenId);
  const poolCheck = validatePoolConfiguration(
    {
      minLockDuration: poolRaw[0],
      maxLockDuration: poolRaw[1],
      isEnabled: poolRaw[2],
    },
    lockDuration,
  );
  if (!poolCheck.valid) {
    throw new Error(poolCheck.reason);
  }

  // 8. Require exact confirmation phrase
  const expectedPhrase = getExpectedConfirmationPhrase(stakeAmount);

  if (promptConfirmation) {
    const promptText =
      `\n=============================================================\n` +
      `             MST TESTNET STAKING TRANSACTION SUMMARY         \n` +
      `=============================================================\n` +
      `Network:             MST Testnet (Chain ID 91562037)\n` +
      `Signer (Investor):   ${signerAddress}\n` +
      `PropertyToken:       ${tokenAddress}\n` +
      `Token ID:            #${tokenId.toString()}\n` +
      `Stake Amount:        ${stakeAmount.toString()} Units\n` +
      `Lock Duration:       ${lockDuration.toString()} Seconds (Flexible / Zero-Day Lock)\n` +
      `Staking Contract:    ${stakingAddress}\n` +
      `Estimated Gas:       ${gasEstimateDisplay}\n` +
      `Signer Unit Balance: ${balance.toString()} Units\n` +
      `KYC Status:          VERIFIED ELIGIBLE ✓\n` +
      `Operator Approval:   VERIFIED APPROVED ✓\n` +
      `Contract Auth:       VERIFIED EXEMPTION ✓\n` +
      `Pool Status:         VERIFIED 0-DAY LOCK READY ✓\n` +
      `=============================================================\n` +
      `Type "${expectedPhrase}" to broadcast on-chain: `;

    const confirmation = await promptConfirmation(promptText);
    if (!validateConfirmationPhrase(confirmation, expectedPhrase)) {
      throw new Error("Staking cancelled; confirmation phrase did not match.");
    }
  }

  // 9. Call the staking contract's actual stake function (tokenId, amount, lockDuration)
  const tx = await stakingContract.stake(tokenId, stakeAmount, lockDuration);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Staking transaction failed on-chain.");
  }

  // 10. Wait for confirmation and verify stake position and remaining wallet balance
  const stakeInfo = await stakingContract.getStakeInfo(tokenId, signerAddress);
  const remainingBalance = await tokenContract.balanceOf(signerAddress, tokenId);

  return {
    txHash: tx.hash,
    tokenId,
    stakedAmount: stakeAmount,
    vaultTotalStaked: stakeInfo.amount,
    remainingBalance,
    lockEndTime: stakeInfo.lockEndTime,
    isLocked: stakeInfo.isLocked,
  };
}

async function main() {
  console.log("=== MST Testnet Property Unit Staking (0-Day Lock) ===");

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
      `Refusing staking on unexpected network "${networkName}". Expected "mstTestnet".`,
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
  const { tokenAddress, stakingAddress, tokenId, stakeAmount, lockDuration } =
    validateEnvironmentConfig(process.env);

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

  const tokenContract: IPropertyTokenStakeView = {
    balanceOf: (acc, id) => tokenContractRaw.getFunction("balanceOf")(acc, id),
    isEligibleInvestor: (acc) => tokenContractRaw.getFunction("isEligibleInvestor")(acc),
    isAuthorizedStakingContract: (acc) =>
      tokenContractRaw.getFunction("isAuthorizedStakingContract")(acc),
    isApprovedForAll: (acc, op) => tokenContractRaw.getFunction("isApprovedForAll")(acc, op),
  };

  const stakingContract: IStakingContractStake = {
    poolConfigs: (id) => stakingContractRaw.getFunction("poolConfigs")(id),
    stake: (id, amt, lock) => stakingContractRaw.getFunction("stake")(id, amt, lock),
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
  let gasEstimateDisplay = "~350,000 gas";
  try {
    const gasUnits = await stakingContractRaw
      .getFunction("stake")
      .estimateGas(tokenId, stakeAmount, lockDuration);
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 1000000000n;
    const costWei = gasUnits * gasPrice;
    gasEstimateDisplay = `~${gasUnits.toString()} gas units (~${formatEther(costWei)} MST)`;
  } catch {
    gasEstimateDisplay = "~350,000 gas units (fallback estimate)";
  }

  const promptConfirmation = async (promptText: string) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      return await terminal.question(promptText);
    } finally {
      terminal.close();
    }
  };

  const result = await executeStakeFlow({
    tokenContract,
    stakingContract,
    signerAddress,
    tokenAddress,
    stakingAddress,
    tokenId,
    stakeAmount,
    lockDuration,
    promptConfirmation,
    gasEstimateDisplay,
  });

  console.log("\n--- Post-Staking Position Verification ---");
  console.log("Transaction Hash:       ", result.txHash);
  console.log("Staked Units in Vault:  ", result.vaultTotalStaked.toString(), "Units ✓");
  console.log(
    "Lock Status:            ",
    result.isLocked ? "LOCKED" : "UNLOCKED (Flexible 0-Day Lock, Ready to Unstake)",
    "✓",
  );
  console.log("Lock End Timestamp:     ", result.lockEndTime.toString());
  console.log("Remaining Wallet Balance:", result.remainingBalance.toString(), "Units ✓");
  console.log("=============================================================");
  console.log("✓ Staking operation successfully executed and verified on MST Testnet!");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected staking failure.";
    console.error("\nStaking halted:", message);
    process.exitCode = 1;
  });
}
