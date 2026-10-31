import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const CONFIRMATION_PHRASE = "APPROVE MAINNET STAKING";
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

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
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
        "Staking contract is not whitelisted as an eligible investor on PropertyToken. Run `npm run authorize:mainnet:staking` first.",
    };
  }
  if (!stakingAuthorized) {
    return {
      valid: false,
      reason:
        "Staking contract is not granted the transfer authorization exemption on PropertyToken. Run `npm run authorize:mainnet:staking` first.",
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
  console.log("=== MST Mainnet Staking Operator Approval (ERC-1155) ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing approval on unexpected network "${networkName}". Expected "mstMainnet".`,
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
  console.log("Signer (Owner):    ", signerAddress);

  const rawTokenAddress =
    process.env["MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim();
  const rawStakingAddress =
    process.env["MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress || !rawStakingAddress) {
    throw new Error(
      "Both MST_MAINNET_TOKEN_CONTRACT_ADDRESS and MST_MAINNET_STAKING_CONTRACT_ADDRESS are required in environment.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const stakingAddress = normalizeAccountAddress(rawStakingAddress);

  const tokenId = parseTokenId(process.env["MST_MAINNET_TOKEN_ID"]);

  console.log("PropertyToken Address: ", tokenAddress);
  console.log("Staking Contract (Op): ", stakingAddress);
  console.log("Target Token ID:       #", tokenId.toString());

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);

  // 1. Verify Signer Units Balance >= 10
  const balance: bigint = await tokenContract.getFunction("balanceOf")(signerAddress, tokenId);
  console.log(`Current Balance for Token #${tokenId.toString()}: ${balance.toString()} Units`);

  const balanceValidation = validateUnitsBalance(balance, MIN_REQUIRED_UNITS);
  if (!balanceValidation.sufficient) {
    throw new Error(
      `Insufficient token balance for demo staking flow.\n` +
        `  Current balance: ${balance.toString()} Units\n` +
        `  Required balance: ${MIN_REQUIRED_UNITS.toString()} Units\n` +
        `  Deficit:          ${balanceValidation.deficit.toString()} Units\n` +
        `Please issue at least ${MIN_REQUIRED_UNITS.toString()} units to ${signerAddress} before approving staking.`,
    );
  }
  console.log(`✓ Balance check passed: Owner holds ${balance.toString()} demo units.`);

  // 2. Verify Compliance Status
  const [investorEligible, stakingEligible, stakingAuthorized] = await Promise.all([
    tokenContract.getFunction("isEligibleInvestor")(signerAddress),
    tokenContract.getFunction("isEligibleInvestor")(stakingAddress),
    tokenContract.getFunction("isAuthorizedStakingContract")(stakingAddress),
  ]);

  const complianceValidation = validateComplianceStatus(
    investorEligible,
    stakingEligible,
    stakingAuthorized,
  );
  if (!complianceValidation.valid) {
    throw new Error(`Compliance pre-flight check failed: ${complianceValidation.reason}`);
  }
  console.log("✓ Compliance check passed: Investor and Staking Contract are fully eligible.");

  // 3. Check current operator approval status
  const isApproved: boolean = await tokenContract.getFunction("isApprovedForAll")(
    signerAddress,
    stakingAddress,
  );

  if (isApproved) {
    console.log(
      `\n✓ Staking contract (${stakingAddress}) is ALREADY approved as operator for ${signerAddress} on PropertyToken.`,
    );
    console.log("No further approval transaction is required. Proceed to staking.");
    return;
  }

  // 4. Display approval parameters and prompt confirmation
  console.log("\n--- Transaction Summary ---");
  console.log("Operation:      ERC-1155 setApprovalForAll");
  console.log("Owner:          ", signerAddress);
  console.log("Operator:       ", stakingAddress, "(PropertyTokenStaking Contract)");
  console.log("Approved Scope: All fractional property tokens owned by signer on PropertyToken");
  console.log("Approval State: true");

  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast approval on MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation)) {
    throw new Error("Approval cancelled; confirmation phrase did not match.");
  }

  console.log("\nBroadcasting setApprovalForAll transaction to MST Mainnet...");
  const tx = await tokenContract.getFunction("setApprovalForAll")(stakingAddress, true);
  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("setApprovalForAll transaction failed on-chain.");
  }

  // 5. Verify approval status on-chain
  const finalApproved: boolean = await tokenContract.getFunction("isApprovedForAll")(
    signerAddress,
    stakingAddress,
  );

  if (!finalApproved) {
    throw new Error(
      "On-chain verification failed: isApprovedForAll returned false after transaction.",
    );
  }

  console.log("\n=== Approval Confirmed & Verified ===");
  console.log("Owner:          ", signerAddress);
  console.log("Operator:       ", stakingAddress);
  console.log("Approval Status: VERIFIED TRUE ✓");
  console.log("Transaction:    ", receipt.hash);
  console.log("Block Number:   ", receipt.blockNumber);
  console.log(`Explorer Link:   https://mstscan.com/tx/${receipt.hash}`);
  console.log("\nNext Step: Run `npm run stake:mainnet` to deposit demo units into custody.");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected approval error.";
    console.error("\n[APPROVAL FAILED]", message);
    process.exitCode = 1;
  });
}
