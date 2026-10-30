import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const CONFIRMATION_PHRASE = "DEPLOY MST MAINNET TOKEN";
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

export function validateDeploymentBalance(
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

export function validateAdminAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed === "" || trimmed.toLowerCase() === zeroAddress.toLowerCase()) return false;
  return isAddressFn(trimmed);
}

export function validateConfirmationPhrase(input: string): boolean {
  return input.trim() === CONFIRMATION_PHRASE;
}

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
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
  console.log("=== MST Mainnet PropertyToken Deployment Pre-Flight ===");

  if (process.env["MST_MAINNET_CHAIN_ID"]?.trim() !== MAINNET_CHAIN_ID.toString()) {
    throw new Error(
      `Set MST_MAINNET_CHAIN_ID to exactly ${MAINNET_CHAIN_ID.toString()} to enable MST Mainnet deployment.`,
    );
  }

  const rpcUrl = process.env["MST_MAINNET_RPC_URL"]?.trim();
  if (!rpcUrl) {
    throw new Error("MST_MAINNET_RPC_URL is required in the environment.");
  }

  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error(`MST_MAINNET_RPC_URL must be a valid URL: ${rpcUrl}`);
  }
  if (parsedRpcUrl.protocol !== "https:") {
    throw new Error("MST_MAINNET_RPC_URL must use HTTPS for Mainnet deployment.");
  }

  const privateKey = process.env["MST_MAINNET_PRIVATE_KEY"]?.trim();
  if (!privateKey) {
    throw new Error(
      "MST_MAINNET_PRIVATE_KEY is required in the local shell environment or Hardhat configuration variables.\n" +
        "Set it via `npx hardhat vars set MST_MAINNET_PRIVATE_KEY` or in your local terminal session.\n" +
        "Never commit private keys to Git or save them in repository files.",
    );
  }

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing deployment on unexpected Hardhat network "${networkName}". Expected "mstMainnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }

  // Admin address validation
  const rawAdminAddress =
    process.env["MST_MAINNET_ADMIN_ADDRESS"]?.trim() ||
    process.env["MST_MAINNET_TOKEN_ADMIN_ADDRESS"]?.trim();

  if (
    !validateAdminAddress(rawAdminAddress, (addr) => ethers.isAddress(addr), ethers.ZeroAddress)
  ) {
    throw new Error(
      "MST_MAINNET_ADMIN_ADDRESS must be set to a valid, non-zero EVM address.\n" +
        "This address will hold the DEFAULT_ADMIN_ROLE for PropertyToken on MST Mainnet.\n" +
        "Example: export MST_MAINNET_ADMIN_ADDRESS=0x...",
    );
  }
  const adminAddress = ethers.getAddress(rawAdminAddress!);

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }

  const signerAddress = await signer.getAddress();
  const balance = BigInt(await ethers.provider.getBalance(signerAddress));

  // Gas and cost pre-flight estimation
  const factory = await ethers.getContractFactory("PropertyToken", signer);
  const deployTx = await factory.getDeployTransaction(adminAddress);
  const estimatedGas = BigInt(await ethers.provider.estimateGas(deployTx));
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? 1_000_000_000n); // fallback to 1 gwei
  const estimatedCost: bigint = estimatedGas * gasPrice;

  const { feeBuffer, requiredBalance } = calculateRequiredBalance(
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  console.log("\n--- Network & Identity Verification ---");
  console.log("Network:                  MST Mainnet (Chain ID 4646)");
  console.log("Contract:                 PropertyToken (ERC-1155)");
  console.log("Deployer Address:        ", signerAddress);
  console.log("Constructor Admin Address:", adminAddress);

  console.log("\n--- Gas & Balance Pre-Flight Check ---");
  console.log("Estimated Gas Units:      ", estimatedGas.toString());
  console.log("Current Gas Price:        ", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Estimated Deployment Cost:", ethers.formatEther(estimatedCost), "MST");
  console.log(
    `Safety Fee Buffer (${DEFAULT_FEE_BUFFER_PERCENT.toString()}%):   ${ethers.formatEther(feeBuffer)} MST`,
  );
  console.log("Required Balance:         ", ethers.formatEther(requiredBalance), "MST");
  console.log("Current Deployer Balance: ", ethers.formatEther(balance), "MST");

  const balanceCheck = validateDeploymentBalance(
    balance,
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient funds for deployment on MST Mainnet.\n` +
        `  Deployer balance: ${ethers.formatEther(balance)} MST\n` +
        `  Estimated cost:   ${ethers.formatEther(estimatedCost)} MST\n` +
        `  Required balance: ${ethers.formatEther(requiredBalance)} MST (estimated cost + ${DEFAULT_FEE_BUFFER_PERCENT.toString()}% safety buffer)\n` +
        `  Deficit:          ${ethers.formatEther(balanceCheck.deficit)} MST\n` +
        `Please fund deployer account ${signerAddress} with at least ${ethers.formatEther(requiredBalance)} MST before attempting deployment.`,
    );
  }
  console.log("✓ Balance check passed: Deployer has sufficient funds including buffer.");

  console.log("\n--- Access Control Architecture ---");
  console.log(`- DEFAULT_ADMIN_ROLE will be granted to ${adminAddress} in constructor.`);
  console.log(
    "- ISSUER_ROLE is NOT granted automatically. (Must be granted separately to authorized property onboarding wallet).",
  );
  console.log(
    "- COMPLIANCE_ROLE is NOT granted automatically. (Must be granted separately to KYC/compliance officer).",
  );
  console.log(
    "- PAUSER_ROLE is NOT granted automatically. (Must be granted separately to emergency operational wallet).",
  );

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast the transaction to MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation)) {
    throw new Error("Deployment cancelled; confirmation phrase did not match.");
  }

  console.log("\nBroadcasting deployment transaction to MST Mainnet...");
  const tokenContract = await factory.deploy(adminAddress);
  const deploymentTx = tokenContract.deploymentTransaction();
  if (!deploymentTx) {
    throw new Error("Hardhat did not return a deployment transaction.");
  }

  console.log("Transaction Hash:", deploymentTx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await deploymentTx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment transaction failed or was reverted on MST Mainnet.");
  }

  const contractAddress = await tokenContract.getAddress();
  const bytecode = await ethers.provider.getCode(contractAddress);
  if (bytecode === "0x") {
    throw new Error(
      "Deployment receipt succeeded, but no contract bytecode was found at the resulting address on MST Mainnet.",
    );
  }

  console.log("\n=== Deployment Successful & Verified ===");
  console.log("Contract:                 PropertyToken");
  console.log("MST Mainnet Address:     ", contractAddress);
  console.log("Deployment Block Number: ", receipt.blockNumber.toString());
  console.log("Transaction Hash:        ", receipt.hash);
  console.log("Gas Used:                ", receipt.gasUsed.toString());
  console.log("\nPost-Deployment Instructions:");
  console.log(`1. Verify the contract on explorer: https://mstscan.com/address/${contractAddress}`);
  console.log(
    `2. Update production environment variable: VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS=${contractAddress}`,
  );
  console.log(
    `3. Using the admin account (${adminAddress}), grant ISSUER_ROLE, COMPLIANCE_ROLE, and PAUSER_ROLE through separate reviewed transactions.`,
  );
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected deployment error.";
    console.error("\n[DEPLOYMENT FAILED]", message);
    process.exitCode = 1;
  });
}
