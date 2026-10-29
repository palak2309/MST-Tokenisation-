import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";

export const TESTNET_CHAIN_ID = 91562037n;

export function validateTestnetChainId(chainId: bigint): boolean {
  return chainId === TESTNET_CHAIN_ID;
}

export function validateAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed === "" || trimmed === zeroAddress) return false;
  return isAddressFn(trimmed);
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

export async function checkTestnetWallet() {
  console.log("=== MST Testnet Wallet & Configuration Check (Read-Only) ===");

  let connection;
  try {
    connection = await network.connect();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    if (
      message.includes("MST_TESTNET_PRIVATE_KEY") ||
      message.includes("HHE7") ||
      message.includes("HHE100") ||
      lowerMessage.includes("configuration variable")
    ) {
      throw new Error(
        "MST_TESTNET_PRIVATE_KEY is not configured.\n" +
          "Configure it securely via:\n" +
          "  npx hardhat vars set MST_TESTNET_PRIVATE_KEY\n" +
          "or export MST_TESTNET_PRIVATE_KEY in your local terminal session.\n" +
          "Never commit private keys to Git or share them.",
      );
    }
    throw error;
  }

  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }

  const { ethers, networkName } = connection;

  // 1. Enforce mstTestnet only
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing check on unexpected network "${networkName}". Expected "mstTestnet".`,
    );
  }

  // 2. Resolve configured signer (Wallet 1 - Admin) locally
  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error(
      "No signer available from configured private key. Please check MST_TESTNET_PRIVATE_KEY.",
    );
  }
  const signerAddress = await signer.getAddress();

  // 3. Query and verify actual RPC chain ID
  let actualNetwork;
  try {
    actualNetwork = await ethers.provider.getNetwork();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to reach MST Testnet RPC.\n` +
        `  Error: ${message}\n` +
        `  Please verify internet connectivity and that the RPC endpoint is accessible.`,
    );
  }

  if (!validateTestnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `Connected chain ID is ${actualNetwork.chainId.toString()}; expected MST Testnet chain ID ${TESTNET_CHAIN_ID.toString()}.`,
    );
  }

  // 4. Query native balances
  const signerBalance = await ethers.provider.getBalance(signerAddress);

  // 4. Resolve issuer address (Wallet 2) from MST_TESTNET_ISSUER_ADDRESS
  const rawIssuerAddress = process.env["MST_TESTNET_ISSUER_ADDRESS"]?.trim();
  const isIssuerConfigured = validateAddress(
    rawIssuerAddress,
    ethers.isAddress,
    ethers.ZeroAddress,
  );
  const issuerAddress = isIssuerConfigured ? (rawIssuerAddress as string) : undefined;

  // Query issuer balance if address is valid
  let issuerBalance: bigint | null = null;
  if (issuerAddress) {
    try {
      issuerBalance = await ethers.provider.getBalance(issuerAddress);
    } catch {
      issuerBalance = null;
    }
  }

  // Check if an explicit admin address override was set
  const rawAdminAddress = process.env["MST_TESTNET_ADMIN_ADDRESS"]?.trim();
  const hasExplicitAdmin =
    validateAddress(rawAdminAddress, ethers.isAddress, ethers.ZeroAddress) &&
    rawAdminAddress?.toLowerCase() !== signerAddress.toLowerCase();

  // 5. Print results clearly without exposing private keys
  console.log("\n--- Network Status ---");
  console.log("Hardhat Network:          ", networkName);
  console.log(
    "RPC Chain ID:             ",
    actualNetwork.chainId.toString(),
    "✓ (Verified MST Testnet)",
  );

  console.log("\n--- Expected Admin (Wallet 1 - Deployer & Signer) ---");
  console.log("Signer Address:           ", signerAddress);
  console.log("Signer Balance:           ", ethers.formatEther(signerBalance), "MST");
  if (hasExplicitAdmin) {
    console.log("Explicit Admin Override:  ", rawAdminAddress, "(MST_TESTNET_ADMIN_ADDRESS)");
  } else {
    console.log("Admin Role Allocation:     Signer is the designated DEFAULT_ADMIN_ROLE holder");
  }

  console.log("\n--- Property Issuer (Wallet 2) ---");
  if (issuerAddress) {
    console.log("Issuer Address:           ", issuerAddress);
    if (issuerBalance !== null) {
      console.log("Issuer Balance:           ", ethers.formatEther(issuerBalance), "MST");
    } else {
      console.log("Issuer Balance:            Unable to fetch balance");
    }
    console.log("Status:                    Configured (MST_TESTNET_ISSUER_ADDRESS)");
  } else {
    console.log("Issuer Address:            Not configured");
    console.log(
      "Notice:                    Set MST_TESTNET_ISSUER_ADDRESS to verify Wallet 2 (issuer)",
    );
  }

  console.log("\n--- Mode Summary ---");
  console.log("Execution Mode:            Strictly Read-Only (0 transactions, 0 state changes)");
  console.log("Security:                  No private key material printed or exposed");
  console.log("=============================================================");
}

if (isDirectExecution(import.meta.url)) {
  checkTestnetWallet().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected wallet check failure.";
    console.error("\nWallet check halted:", message);
    process.exitCode = 1;
  });
}
