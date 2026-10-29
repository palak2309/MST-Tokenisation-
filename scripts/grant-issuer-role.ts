import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const ISSUER_ROLE_HASH =
  "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122";
export const ISSUER_ROLE = ISSUER_ROLE_HASH;
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const GRANT_CONFIRMATION_PHRASE = "GRANT ISSUER ROLE";
export const DEFAULT_FEE_BUFFER_PERCENT = 20n; // 20% safety margin for gas price volatility

export interface BalanceValidationResult {
  sufficient: boolean;
  estimatedCost: bigint;
  feeBuffer: bigint;
  requiredBalance: bigint;
  deficit: bigint;
}

export function calculateRequiredBalance(
  estimatedCost: bigint,
  feeBufferPercent: bigint = DEFAULT_FEE_BUFFER_PERCENT,
): { feeBuffer: bigint; requiredBalance: bigint } {
  if (estimatedCost < 0n) {
    throw new Error("Estimated cost cannot be negative.");
  }
  if (feeBufferPercent < 0n) {
    throw new Error("Fee buffer percentage cannot be negative.");
  }
  const feeBuffer = (estimatedCost * feeBufferPercent) / 100n;
  const requiredBalance = estimatedCost + feeBuffer;
  return { feeBuffer, requiredBalance };
}

export function validateGrantBalance(
  balance: bigint,
  estimatedCost: bigint,
  feeBufferPercent: bigint = DEFAULT_FEE_BUFFER_PERCENT,
): BalanceValidationResult {
  const { feeBuffer, requiredBalance } = calculateRequiredBalance(estimatedCost, feeBufferPercent);

  if (balance < requiredBalance) {
    return {
      sufficient: false,
      estimatedCost,
      feeBuffer,
      requiredBalance,
      deficit: requiredBalance - balance,
    };
  }

  return {
    sufficient: true,
    estimatedCost,
    feeBuffer,
    requiredBalance,
    deficit: 0n,
  };
}

export function validateTestnetChainId(chainId: bigint): boolean {
  return chainId === TESTNET_CHAIN_ID;
}

export function validateIssuerAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed === "" || trimmed === zeroAddress) return false;
  return isAddressFn(trimmed);
}

export function validateTokenAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  return validateIssuerAddress(address, isAddressFn, zeroAddress);
}

export function validateGrantConfirmationPhrase(input: string): boolean {
  return input.trim() === GRANT_CONFIRMATION_PHRASE;
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
  // Never execute during test runs or test environments
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

  // 1. Direct Node.js execution: node <script> (argv[1] points directly to the script)
  const directArg = argv[1];
  if (directArg && matchesScriptPath(directArg, targetNormalized)) {
    return true;
  }

  // 2. Hardhat CLI runner: hardhat run [--no-compile] <script> [--network ...]
  const isHardhatRunner = argv.some(
    (arg) => typeof arg === "string" && arg.toLowerCase().includes("hardhat"),
  );
  const isHardhatRunTask = argv.includes("run");

  if (isHardhatRunner) {
    return (
      isHardhatRunTask && argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized))
    );
  }

  // 3. Fallback for custom or direct script runners where the script is passed in argv
  return argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized));
}

async function main() {
  console.log("=== MST Testnet PropertyToken: Grant ISSUER_ROLE ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing role grant on unexpected Hardhat network "${networkName}". Expected "mstTestnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateTestnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Testnet chain ID ${TESTNET_CHAIN_ID.toString()}.`,
    );
  }

  // 1. Identify deployed PropertyToken contract
  const tokenAddress = (
    process.env["MST_TESTNET_TOKEN_CONTRACT_ADDRESS"] ||
    process.env["VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS"] ||
    process.env["VITE_MST_TOKEN_CONTRACT_ADDRESS"] ||
    ""
  ).trim();

  if (!validateTokenAddress(tokenAddress, ethers.isAddress, ethers.ZeroAddress)) {
    throw new Error(
      "Valid PropertyToken contract address is required.\n" +
        "Set MST_TESTNET_TOKEN_CONTRACT_ADDRESS (or VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS) in your environment.",
    );
  }

  const bytecode = await ethers.provider.getCode(tokenAddress);
  if (bytecode === "0x") {
    throw new Error(
      `No contract bytecode found at ${tokenAddress} on MST Testnet.\n` +
        "Ensure PropertyToken has been deployed first via `npm run deploy:testnet`.",
    );
  }

  // 2. Identify target issuer address (Wallet 2)
  const issuerAddress = (
    process.env["MST_TESTNET_ISSUER_ADDRESS"] ||
    process.env["VITE_MST_TESTNET_ISSUER_ADDRESS"] ||
    ""
  ).trim();

  if (!validateIssuerAddress(issuerAddress, ethers.isAddress, ethers.ZeroAddress)) {
    throw new Error(
      "Valid issuer address (Wallet 2) is required.\n" +
        "Set MST_TESTNET_ISSUER_ADDRESS in your environment.\n" +
        'Example (PowerShell): $env:MST_TESTNET_ISSUER_ADDRESS="0xYourWallet2Address"\n' +
        'Example (Bash):       export MST_TESTNET_ISSUER_ADDRESS="0xYourWallet2Address"',
    );
  }

  // 3. Connect Admin signer (Wallet 1)
  const [adminSigner] = await ethers.getSigners();
  if (!adminSigner) {
    throw new Error("No signer available from configured MST_TESTNET_PRIVATE_KEY.");
  }

  const adminAddress = await adminSigner.getAddress();
  const adminBalance = await ethers.provider.getBalance(adminAddress);

  console.log("Connected Network:       MST Testnet (Chain ID 91562037)");
  console.log("PropertyToken Address:   ", tokenAddress);
  console.log("Admin Signer (Wallet 1): ", adminAddress);
  console.log("Signer Balance:         ", ethers.formatEther(adminBalance), "MST");
  console.log("Target Issuer (Wallet 2):", issuerAddress);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, adminSigner);

  // Read ISSUER_ROLE dynamically from the deployed PropertyToken contract
  const issuerRoleFn = tokenContract.getFunction("ISSUER_ROLE");
  const onChainIssuerRole: string = await issuerRoleFn();
  console.log("Verified On-Chain ISSUER_ROLE:", onChainIssuerRole);

  const hasRoleFn = tokenContract.getFunction("hasRole");
  const grantRoleFn = tokenContract.getFunction("grantRole");

  // 4. Verify admin authorization on-chain
  const hasAdminRole = await hasRoleFn(DEFAULT_ADMIN_ROLE, adminAddress);
  if (!hasAdminRole) {
    throw new Error(
      `Admin account ${adminAddress} does not hold DEFAULT_ADMIN_ROLE on PropertyToken at ${tokenAddress}.\n` +
        "Only the contract admin can grant ISSUER_ROLE.",
    );
  }

  // 5. Check if Wallet 2 already has ISSUER_ROLE
  const alreadyIssuer = await hasRoleFn(onChainIssuerRole, issuerAddress);
  if (alreadyIssuer) {
    console.log(
      `\n✓ Wallet 2 (${issuerAddress}) already holds ISSUER_ROLE on PropertyToken. No action required!`,
    );
    return;
  }

  // 6. Gas estimation and balance pre-flight check with safety buffer
  const estimatedGas = await grantRoleFn.estimateGas(onChainIssuerRole, issuerAddress);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1000000000n;
  const estimatedCost = BigInt(estimatedGas) * BigInt(gasPrice);

  const { feeBuffer, requiredBalance } = calculateRequiredBalance(
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  console.log("\n--- Transaction Estimate & Balance Pre-Flight ---");
  console.log("Role to Grant:            ISSUER_ROLE");
  console.log("Role Hash:                ", onChainIssuerRole);
  console.log("Estimated Gas Units:      ", estimatedGas.toString());
  console.log("Current Gas Price:        ", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Estimated Cost:           ", ethers.formatEther(estimatedCost), "MST");
  console.log(
    `Safety Fee Buffer (${DEFAULT_FEE_BUFFER_PERCENT.toString()}%):   ${ethers.formatEther(feeBuffer)} MST`,
  );
  console.log("Required Balance:         ", ethers.formatEther(requiredBalance), "MST");
  console.log("Current Signer Balance:   ", ethers.formatEther(adminBalance), "MST");

  const balanceCheck = validateGrantBalance(
    adminBalance,
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient funds for grantRole transaction on MST Testnet.\n` +
        `  Signer balance:   ${ethers.formatEther(adminBalance)} MST\n` +
        `  Estimated cost:   ${ethers.formatEther(estimatedCost)} MST\n` +
        `  Required balance: ${ethers.formatEther(requiredBalance)} MST (estimated cost + ${DEFAULT_FEE_BUFFER_PERCENT.toString()}% safety buffer)\n` +
        `  Deficit:          ${ethers.formatEther(balanceCheck.deficit)} MST\n` +
        `Please fund admin account ${adminAddress} with at least ${ethers.formatEther(requiredBalance)} MST via the MST Testnet faucet before attempting role grant.`,
    );
  }
  console.log("✓ Balance check passed: Admin signer has sufficient funds including buffer.");

  // 7. Interactive confirmation guard
  console.log("\n--- Role Grant Execution Plan ---");
  console.log("Network:                  MST Testnet (Chain ID 91562037)");
  console.log("Contract Address:        ", tokenAddress);
  console.log("Admin Signer (Wallet 1): ", adminAddress);
  console.log("Target Issuer (Wallet 2):", issuerAddress);
  console.log("Role Hash:               ", onChainIssuerRole);

  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${GRANT_CONFIRMATION_PHRASE}" to grant ISSUER_ROLE to ${issuerAddress}: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateGrantConfirmationPhrase(confirmation)) {
    throw new Error("Role grant cancelled; confirmation phrase did not match.");
  }

  console.log("\nBroadcasting grantRole transaction...");
  const tx = await grantRoleFn(onChainIssuerRole, issuerAddress);
  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation on MST Testnet...");

  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("grantRole transaction failed on-chain.");
  }

  // 8. Confirm state post-transaction
  const isNowIssuer = await hasRoleFn(onChainIssuerRole, issuerAddress);
  if (!isNowIssuer) {
    throw new Error("Transaction succeeded but on-chain hasRole check returned false.");
  }

  console.log("\n=== ISSUER_ROLE Successfully Granted! ===");
  console.log("Target Issuer (Wallet 2):", issuerAddress);
  console.log("Contract Address:       ", tokenAddress);
  console.log("Transaction Hash:       ", receipt.hash);
  console.log("Block Number:           ", receipt.blockNumber);
  console.log(`Explorer Link:          https://testnet.mstscan.com/tx/${receipt.hash}`);
  console.log("\n--- Next Steps ---");
  console.log("1. Open the MST TokenEstate frontend.");
  console.log("2. Sign in as PROPERTY_ISSUER or ADMIN.");
  console.log(`3. Connect BridgeKey wallet using Wallet 2 (${issuerAddress}).`);
  console.log(
    "4. You can now onboard properties and issue fractional token units directly on MST Testnet!",
  );
}

// Only execute automatically when run directly as a script or via Hardhat's run task
if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected role grant failure.";
    console.error("\nRole grant halted:", message);
    process.exitCode = 1;
  });
}
