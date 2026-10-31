import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_DEPLOYER_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";

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

export async function checkMainnetWallet() {
  console.log("=== MST Mainnet Deployer & Configuration Verification (Read-Only) ===");

  const rpcUrl =
    process.env["MST_MAINNET_RPC_URL"]?.trim() ||
    process.env["VITE_MST_MAINNET_RPC_URL"]?.trim() ||
    "https://mariorpc.mstblockchain.com/";

  let connection;
  try {
    connection = await network.connect();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    if (
      message.includes("MST_MAINNET_PRIVATE_KEY") ||
      message.includes("HHE7") ||
      message.includes("HHE100") ||
      lowerMessage.includes("configuration variable")
    ) {
      throw new Error(
        "MST_MAINNET_PRIVATE_KEY is not configured in the current session.\n" +
          "Supply it securely via your terminal session:\n" +
          "  $secureKey = Read-Host -Prompt 'Enter MST Mainnet Private Key' -AsSecureString\n" +
          "  $env:MST_MAINNET_PRIVATE_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password\n" +
          "Never write private keys into files or commit them to Git.",
      );
    }
    throw error;
  }

  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  // 1. Enforce mstMainnet network
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing check on unexpected network "${networkName}". Expected "mstMainnet".`,
    );
  }

  // 2. Query and verify actual RPC chain ID
  let actualNetwork;
  try {
    actualNetwork = await ethers.provider.getNetwork();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("MST_MAINNET_PRIVATE_KEY") ||
      message.includes("HHE7") ||
      message.includes("HHE100") ||
      message.toLowerCase().includes("configuration variable")
    ) {
      throw new Error(
        "MST_MAINNET_PRIVATE_KEY is not configured in the current session or .env.\n" +
          "Supply it securely by adding it to .env or setting in your terminal session:\n" +
          "  MST_MAINNET_PRIVATE_KEY=0x...\n" +
          "Never commit private keys to Git.",
      );
    }
    throw new Error(
      `Unable to reach MST Mainnet RPC (${rpcUrl}).\n` +
        `  Error: ${message}\n` +
        `  Please verify internet connectivity and that the RPC endpoint is accessible.`,
    );
  }

  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `Connected chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }

  // 3. Resolve configured signer locally
  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }
  const signerAddress = await signer.getAddress();

  // 4. Verify address matches target deployer account
  const isMatch = signerAddress.toLowerCase() === EXPECTED_DEPLOYER_ACCOUNT.toLowerCase();

  // 5. Query native balance
  const signerBalance = BigInt(await ethers.provider.getBalance(signerAddress));

  // 6. Admin Address for PropertyToken constructor
  const rawAdminAddress =
    process.env["MST_MAINNET_ADMIN_ADDRESS"]?.trim() ||
    process.env["MST_MAINNET_TOKEN_ADMIN_ADDRESS"]?.trim();
  const adminAddress =
    rawAdminAddress && ethers.isAddress(rawAdminAddress)
      ? ethers.getAddress(rawAdminAddress)
      : undefined;

  console.log("\n--- Network Status ---");
  console.log("Hardhat Network:          ", networkName);
  console.log("RPC Endpoint:             ", rpcUrl);
  console.log(
    "RPC Chain ID:             ",
    actualNetwork.chainId.toString(),
    "✓ (Verified MST Mainnet)",
  );

  console.log("\n--- Deployer Account Verification ---");
  console.log("Expected Account:         ", EXPECTED_DEPLOYER_ACCOUNT);
  console.log("Derived Signer Address:   ", signerAddress);

  if (isMatch) {
    console.log("Identity Verification:     ✓ MATCH: Signer address matches target account.");
  } else {
    console.error(
      "Identity Verification:     ✗ MISMATCH: Signer address does NOT match target account!",
    );
    throw new Error(
      `Signer address ${signerAddress} does not match expected target deployer account ${EXPECTED_DEPLOYER_ACCOUNT}.`,
    );
  }

  console.log("Deployer Native Balance:  ", ethers.formatEther(signerBalance), "MST");

  console.log("\n--- Token Constructor Admin Configuration ---");
  if (adminAddress) {
    console.log("Constructor Admin Address:", adminAddress);
    if (adminAddress.toLowerCase() === EXPECTED_DEPLOYER_ACCOUNT.toLowerCase()) {
      console.log("Admin Match:               ✓ Configured admin matches deployer account.");
    }
  } else {
    console.log(
      "Notice:                    MST_MAINNET_ADMIN_ADDRESS is not set. Set it before running deploy-mainnet-token.ts.",
    );
  }

  console.log("\n--- Pre-Flight Security Summary ---");
  console.log("Execution Mode:            Strictly Read-Only (0 transactions broadcast)");
  console.log("Key Security:              No private key material printed or exposed");
  console.log("=====================================================================");
}

if (isDirectExecution(import.meta.url)) {
  checkMainnetWallet().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected wallet check failure.";
    console.error("\nWallet check halted:", message);
    process.exitCode = 1;
  });
}
