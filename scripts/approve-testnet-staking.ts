import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const CONFIRMATION_PHRASE = "APPROVE TESTNET STAKING";
export const MIN_REQUIRED_UNITS = 10n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;

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

export function validateConfirmationPhrase(input: string): boolean {
  return input.trim() === CONFIRMATION_PHRASE;
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

export function validateUnitsBalance(
  balance: bigint,
  minRequired: bigint = MIN_REQUIRED_UNITS,
): { sufficient: boolean; balance: bigint; minRequired: bigint; deficit: bigint } {
  if (balance < 0n) {
    throw new Error("Balance cannot be negative.");
  }
  if (minRequired < 0n) {
    throw new Error("Minimum required units cannot be negative.");
  }
  if (balance < minRequired) {
    return {
      sufficient: false,
      balance,
      minRequired,
      deficit: minRequired - balance,
    };
  }
  return {
    sufficient: true,
    balance,
    minRequired,
    deficit: 0n,
  };
}

export function validateComplianceStatus(
  investorEligible: boolean,
  stakingEligible: boolean,
  stakingAuthorized: boolean,
): { valid: boolean; reason?: string } {
  if (!investorEligible) {
    return {
      valid: false,
      reason:
        "Signer is not whitelisted as an eligible investor on PropertyToken. Contact compliance to complete KYC approval.",
    };
  }
  if (!stakingEligible) {
    return {
      valid: false,
      reason:
        "Staking contract is not whitelisted as an eligible investor on PropertyToken. Run `npm run authorize:testnet:staking` first.",
    };
  }
  if (!stakingAuthorized) {
    return {
      valid: false,
      reason:
        "Staking contract is not authorized with transfer exemption on PropertyToken. Run `npm run authorize:testnet:staking` first.",
    };
  }
  return { valid: true };
}

export function validateEnvironmentConfig(env: NodeJS.ProcessEnv = process.env): {
  tokenAddress: string;
  stakingAddress: string;
  tokenId: bigint;
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

  return { tokenAddress, stakingAddress, tokenId };
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

export interface IPropertyTokenApproval {
  balanceOf(account: string, id: bigint): Promise<bigint>;
  isEligibleInvestor(account: string): Promise<boolean>;
  isAuthorizedStakingContract(account: string): Promise<boolean>;
  isApprovedForAll(account: string, operator: string): Promise<boolean>;
  setApprovalForAll(
    operator: string,
    approved: boolean,
  ): Promise<{
    hash: string;
    wait(confirmations?: number): Promise<{ status?: number | null } | null>;
  }>;
}

export interface ApprovalExecutionOptions {
  tokenContract: IPropertyTokenApproval;
  signerAddress: string;
  tokenAddress: string;
  stakingAddress: string;
  tokenId: bigint;
  promptConfirmation?: (promptText: string) => Promise<string>;
}

export interface ApprovalExecutionResult {
  alreadyApproved: boolean;
  approved: boolean;
  owner: string;
  operator: string;
  tokenId: bigint;
  unitsBalance: bigint;
  txHash?: string;
}

export async function executeApprovalFlow(
  options: ApprovalExecutionOptions,
): Promise<ApprovalExecutionResult> {
  const {
    tokenContract,
    signerAddress,
    tokenAddress,
    stakingAddress,
    tokenId,
    promptConfirmation,
  } = options;

  // 1. Verify token balance >= 10 units
  const balance = await tokenContract.balanceOf(signerAddress, tokenId);
  const balanceCheck = validateUnitsBalance(balance, MIN_REQUIRED_UNITS);
  if (!balanceCheck.sufficient) {
    throw new Error(
      `Signer ${signerAddress} owns ${balance.toString()} units of token #${tokenId.toString()}, but at least ${MIN_REQUIRED_UNITS.toString()} units are required (deficit: ${balanceCheck.deficit.toString()} units).`,
    );
  }

  // 2. Verify compliance status
  const investorEligible = await tokenContract.isEligibleInvestor(signerAddress);
  const stakingEligible = await tokenContract.isEligibleInvestor(stakingAddress);
  const stakingAuthorized = await tokenContract.isAuthorizedStakingContract(stakingAddress);

  const complianceCheck = validateComplianceStatus(
    investorEligible,
    stakingEligible,
    stakingAuthorized,
  );
  if (!complianceCheck.valid) {
    throw new Error(complianceCheck.reason);
  }

  // 3. Check current isApprovedForAll status
  const isApproved = await tokenContract.isApprovedForAll(signerAddress, stakingAddress);
  if (isApproved) {
    return {
      alreadyApproved: true,
      approved: true,
      owner: signerAddress,
      operator: stakingAddress,
      tokenId,
      unitsBalance: balance,
    };
  }

  // 4. Prompt for confirmation phrase with full scope details
  if (!promptConfirmation) {
    throw new Error("Confirmation callback required when operator is not yet approved.");
  }

  const promptText =
    `\n=============================================================\n` +
    `         MST TESTNET STAKING OPERATOR APPROVAL SCOPE          \n` +
    `=============================================================\n` +
    `Owner (Signer):     ${signerAddress}\n` +
    `Operator (Spender): ${stakingAddress}\n` +
    `Token Contract:     ${tokenAddress}\n` +
    `Scope:              All ERC-1155 property units on ${tokenAddress}\n` +
    `Demonstration ID:   #${tokenId.toString()}\n` +
    `Owner Balance:      ${balance.toString()} Units (>= ${MIN_REQUIRED_UNITS.toString()} Units Verified ✓)\n` +
    `Current Approval:   FALSE (Requires setApprovalForAll)\n` +
    `=============================================================\n` +
    `Notice: This authorization allows the PropertyTokenStaking\n` +
    `contract to custody your fractional property units when you\n` +
    `call stake(). You can revoke this permission anytime.\n` +
    `=============================================================\n` +
    `Type "${CONFIRMATION_PHRASE}" to broadcast on-chain: `;

  const confirmation = await promptConfirmation(promptText);
  if (!validateConfirmationPhrase(confirmation)) {
    throw new Error("Approval cancelled; confirmation phrase did not match.");
  }

  // 5. Call setApprovalForAll(stakingAddress, true)
  const tx = await tokenContract.setApprovalForAll(stakingAddress, true);
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Operator approval transaction failed on-chain.");
  }

  // 6. Verify approval on-chain
  const verifiedApproval = await tokenContract.isApprovedForAll(signerAddress, stakingAddress);
  if (!verifiedApproval) {
    throw new Error("Post-transaction verification failed: isApprovedForAll returned false.");
  }

  return {
    alreadyApproved: false,
    approved: true,
    owner: signerAddress,
    operator: stakingAddress,
    tokenId,
    unitsBalance: balance,
    txHash: tx.hash,
  };
}

async function main() {
  console.log("=== MST Testnet Staking Operator Approval (ERC-1155) ===");

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
      `Refusing approval on unexpected network "${networkName}". Expected "mstTestnet".`,
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
  console.log("Connected Network: MST Testnet (Chain ID 91562037)");
  console.log("Signer (Owner):   ", signerAddress);

  const { tokenAddress, stakingAddress, tokenId } = validateEnvironmentConfig(process.env);
  console.log("PropertyToken:    ", tokenAddress);
  console.log("Staking Contract: ", stakingAddress);
  console.log("Target Token ID:  #", tokenId.toString());

  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(`No bytecode found at PropertyToken address "${tokenAddress}".`);
  }

  const stakingCode = await ethers.provider.getCode(stakingAddress);
  if (stakingCode === "0x") {
    throw new Error(`No bytecode found at PropertyTokenStaking address "${stakingAddress}".`);
  }

  const tokenContractRaw = await ethers.getContractAt("PropertyToken", tokenAddress, signer);
  const tokenContract: IPropertyTokenApproval = {
    balanceOf: (acc, id) => tokenContractRaw.getFunction("balanceOf")(acc, id),
    isEligibleInvestor: (acc) => tokenContractRaw.getFunction("isEligibleInvestor")(acc),
    isAuthorizedStakingContract: (acc) =>
      tokenContractRaw.getFunction("isAuthorizedStakingContract")(acc),
    isApprovedForAll: (acc, op) => tokenContractRaw.getFunction("isApprovedForAll")(acc, op),
    setApprovalForAll: (op, app) => tokenContractRaw.getFunction("setApprovalForAll")(op, app),
  };

  const promptConfirmation = async (promptText: string) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    try {
      return await terminal.question(promptText);
    } finally {
      terminal.close();
    }
  };

  const result = await executeApprovalFlow({
    tokenContract,
    signerAddress,
    tokenAddress,
    stakingAddress,
    tokenId,
    promptConfirmation,
  });

  if (result.alreadyApproved) {
    console.log(
      `\n✓ Staking contract (${stakingAddress}) is ALREADY approved as operator for ${signerAddress} on PropertyToken.`,
    );
    console.log("No transaction required. You are ready to stake!");
  } else {
    console.log("\n--- Transaction Confirmation ---");
    console.log("Tx Hash:          ", result.txHash);
    console.log("Owner:            ", result.owner);
    console.log("Operator:         ", result.operator);
    console.log("Approval Status:   VERIFIED TRUE on-chain ✓");
    console.log("=============================================================");
    console.log("✓ Approval complete! You can now stake units in PropertyTokenStaking.");
  }
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected approval failure.";
    console.error("\nApproval halted:", message);
    process.exitCode = 1;
  });
}
