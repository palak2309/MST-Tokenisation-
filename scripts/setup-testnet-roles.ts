import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const DEFAULT_FEE_BUFFER_PERCENT = 20n;

export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const ISSUER_ROLE_HASH =
  "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122";
export const COMPLIANCE_ROLE_HASH =
  "0x442a94f1a1fac79af32856af2a64f63648cfa2ef3b98610a5bb7cbec4cee6985";
export const PAUSER_ROLE_HASH =
  "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a";

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

export interface RoleGrantPlan {
  roleName: "COMPLIANCE_ROLE" | "PAUSER_ROLE" | "ISSUER_ROLE";
  roleHash: string;
  recipient: string;
  recipientLabel: string;
  confirmationPhrase: string;
  description: string;
}

export function createTestnetRoleGrantPlans(
  adminAddress: string,
  issuerAddress: string = adminAddress,
  complianceAddress: string = adminAddress,
): readonly RoleGrantPlan[] {
  const normAdmin = normalizeAccountAddress(adminAddress);
  const normIssuer = normalizeAccountAddress(issuerAddress);
  const normCompliance = normalizeAccountAddress(complianceAddress);

  return [
    {
      roleName: "COMPLIANCE_ROLE",
      roleHash: COMPLIANCE_ROLE_HASH,
      recipient: normCompliance,
      recipientLabel:
        normCompliance === normAdmin
          ? "Admin Account (Compliance Officer)"
          : "Compliance Officer Account",
      confirmationPhrase: "GRANT COMPLIANCE ROLE",
      description:
        "Enables investor KYC eligibility management, staking transfer exemptions, and secondary transfer controls.",
    },
    {
      roleName: "PAUSER_ROLE",
      roleHash: PAUSER_ROLE_HASH,
      recipient: normAdmin,
      recipientLabel: "Admin Account (Emergency Pauser)",
      confirmationPhrase: "GRANT PAUSER ROLE",
      description: "Enables emergency pause and unpause circuit breaker for token actions.",
    },
    {
      roleName: "ISSUER_ROLE",
      roleHash: ISSUER_ROLE_HASH,
      recipient: normIssuer,
      recipientLabel:
        normIssuer === normAdmin
          ? "Admin Account (Property Issuer)"
          : "Authorized Property Issuer Account",
      confirmationPhrase: "GRANT ISSUER ROLE",
      description: "Enables registering new property batches and issuing initial unit supplies.",
    },
  ];
}

export function validateTestnetChainId(chainId: bigint): boolean {
  return chainId === TESTNET_CHAIN_ID;
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
  console.log("=== MST Testnet PropertyToken Roles Setup ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing role setup on unexpected network "${networkName}". Expected "mstTestnet".`,
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
  console.log("Signer Address:   ", signerAddress);

  const rawTokenAddress =
    process.env["MST_TESTNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress) {
    throw new Error(
      "MST_TESTNET_TOKEN_CONTRACT_ADDRESS (or VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS) is required.\n" +
        "Set the address of the freshly deployed PropertyToken contract.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(`No bytecode found at PropertyToken address "${tokenAddress}" on MST Testnet.`);
  }
  console.log("Target PropertyToken: ", tokenAddress);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);

  // Check that signer holds DEFAULT_ADMIN_ROLE
  const hasAdmin = await tokenContract.getFunction("hasRole")(DEFAULT_ADMIN_ROLE, signerAddress);
  if (!hasAdmin) {
    throw new Error(
      `Signer ${signerAddress} does not hold DEFAULT_ADMIN_ROLE on PropertyToken at ${tokenAddress}.\n` +
        "Only the designated admin account can grant roles.",
    );
  }
  console.log("✓ Signer verified as DEFAULT_ADMIN_ROLE holder.");

  const issuerAddress = process.env["MST_TESTNET_ISSUER_ADDRESS"]?.trim() || signerAddress;
  const complianceAddress = process.env["MST_TESTNET_COMPLIANCE_ADDRESS"]?.trim() || signerAddress;

  const plans = createTestnetRoleGrantPlans(signerAddress, issuerAddress, complianceAddress);

  console.log("\n--- Role Grant Plans ---");
  for (const plan of plans) {
    const alreadyGranted = await tokenContract.getFunction("hasRole")(
      plan.roleHash,
      plan.recipient,
    );
    console.log(
      `- ${plan.roleName}: ${plan.recipient} (${plan.recipientLabel}) -> ${alreadyGranted ? "ALREADY GRANTED" : "PENDING"}`,
    );
  }

  for (const plan of plans) {
    const alreadyGranted = await tokenContract.getFunction("hasRole")(
      plan.roleHash,
      plan.recipient,
    );
    if (alreadyGranted) {
      console.log(`\n✓ ${plan.roleName} is already granted to ${plan.recipient}. Skipping.`);
      continue;
    }

    console.log(`\nReady to grant ${plan.roleName} to ${plan.recipient}:`);
    console.log(`  Description: ${plan.description}`);

    const terminal = createInterface({ input: stdin, output: stdout });
    let confirmation: string;
    try {
      confirmation = await terminal.question(
        `Type "${plan.confirmationPhrase}" to broadcast transaction: `,
      );
    } finally {
      terminal.close();
    }

    if (confirmation.trim() !== plan.confirmationPhrase) {
      console.log(`Cancelled granting ${plan.roleName}. Skipping.`);
      continue;
    }

    console.log(`Broadcasting grantRole(${plan.roleName}) transaction...`);
    const tx = await tokenContract.getFunction("grantRole")(plan.roleHash, plan.recipient);
    console.log("Tx Hash:", tx.hash);
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(`Failed to grant ${plan.roleName} on-chain.`);
    }

    const verified = await tokenContract.getFunction("hasRole")(plan.roleHash, plan.recipient);
    if (!verified) {
      throw new Error(
        `Post-transaction check failed: ${plan.roleName} still not held by ${plan.recipient}`,
      );
    }
    console.log(`✓ ${plan.roleName} successfully granted and verified on-chain!`);
  }

  console.log("\n=== Testnet Role Setup Completed Successfully ===");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected role setup failure.";
    console.error("\nRole setup halted:", message);
    process.exitCode = 1;
  });
}
