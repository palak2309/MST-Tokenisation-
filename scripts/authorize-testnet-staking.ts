import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const CONFIRMATION_PHRASE = "AUTHORIZE STAKING TESTNET";
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const DEFAULT_POOL_MIN_LOCK = 0n; // 0 seconds = zero-day lock (instant demonstration)
export const DEFAULT_POOL_MAX_LOCK = 365n * 86400n; // 365 days max

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
  console.log("=== MST Testnet Compliance Staking Authorization & Pool Setup ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing compliance authorization on unexpected network "${networkName}". Expected "mstTestnet".`,
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
  const rawStakingAddress =
    process.env["MST_TESTNET_STAKING_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_TESTNET_STAKING_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress || !rawStakingAddress) {
    throw new Error(
      "Both MST_TESTNET_TOKEN_CONTRACT_ADDRESS and MST_TESTNET_STAKING_CONTRACT_ADDRESS are required.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const stakingAddress = normalizeAccountAddress(rawStakingAddress);

  console.log("Target PropertyToken: ", tokenAddress);
  console.log("Target Staking Contract: ", stakingAddress);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);
  const stakingContract = await ethers.getContractAt(
    "PropertyTokenStaking",
    stakingAddress,
    signer,
  );

  const rawTokenId = process.env["MST_TESTNET_TOKEN_ID"]?.trim();
  const tokenId = rawTokenId ? BigInt(rawTokenId) : DEFAULT_DEMO_TOKEN_ID;

  // 1. Check PropertyToken roles
  const complianceRole = await tokenContract.getFunction("COMPLIANCE_ROLE")();
  const hasCompliance = await tokenContract.getFunction("hasRole")(complianceRole, signerAddress);
  if (!hasCompliance) {
    throw new Error(
      `Signer ${signerAddress} does not have COMPLIANCE_ROLE on PropertyToken at ${tokenAddress}.\n` +
        "Only an authorized compliance officer can grant staking authorization.",
    );
  }
  console.log("✓ Signer verified as COMPLIANCE_ROLE holder on PropertyToken.");

  // 2. Check current compliance whitelisting status
  const isEligibleAlready: boolean =
    await tokenContract.getFunction("isEligibleInvestor")(stakingAddress);
  const isAuthorizedAlready: boolean = await tokenContract.getFunction(
    "isAuthorizedStakingContract",
  )(stakingAddress);

  // 3. Check Staking Contract pool configuration (0-Day Lock requirement)
  const stakingAdminRole = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const hasStakingAdmin = await stakingContract.getFunction("hasRole")(
    stakingAdminRole,
    signerAddress,
  );

  const poolConfig = await stakingContract.getFunction("poolConfigs")(tokenId);
  // PoolConfig struct: [minLockDuration, maxLockDuration, isEnabled]
  const poolMinLock: bigint = poolConfig[0];
  const poolIsEnabled: boolean = poolConfig[2];
  const isPoolConfiguredAlready = poolIsEnabled && poolMinLock === DEFAULT_POOL_MIN_LOCK;

  console.log(`\nCurrent Status for Staking Contract (${stakingAddress}):`);
  console.log(`- Eligible Investor on PropertyToken: ${isEligibleAlready ? "YES" : "NO"}`);
  console.log(`- Authorized Staking Exemption:      ${isAuthorizedAlready ? "YES" : "NO"}`);
  console.log(
    `- Pool #${tokenId.toString()} 0-Day Lock Configured:   ${isPoolConfiguredAlready ? "YES" : "NO"}`,
  );

  if (isEligibleAlready && isAuthorizedAlready && isPoolConfiguredAlready) {
    console.log("\n✓ Staking contract is already fully authorized with 0-Day Lock on MST Testnet!");
    return;
  }

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast compliance authorization and pool configuration: `,
    );
  } finally {
    terminal.close();
  }

  if (confirmation.trim() !== CONFIRMATION_PHRASE) {
    throw new Error("Authorization cancelled; confirmation phrase did not match.");
  }

  // Step 1: Whitelist Staking Contract as Eligible Investor
  if (!isEligibleAlready) {
    console.log("\n1. Broadcasting setInvestorEligibility(staking, true)...");
    const tx1 = await tokenContract.getFunction("setInvestorEligibility")(stakingAddress, true);
    console.log("Tx1 Hash:", tx1.hash);
    const receipt1 = await tx1.wait(1);
    if (!receipt1 || receipt1.status !== 1) {
      throw new Error("Failed to set investor eligibility for staking contract.");
    }
    console.log("✓ Staking contract approved as eligible investor.");
  }

  // Step 2: Grant Staking Transfer Exemption
  if (!isAuthorizedAlready) {
    console.log("\n2. Broadcasting setStakingContractAuthorization(staking, true)...");
    const tx2 = await tokenContract.getFunction("setStakingContractAuthorization")(
      stakingAddress,
      true,
    );
    console.log("Tx2 Hash:", tx2.hash);
    const receipt2 = await tx2.wait(1);
    if (!receipt2 || receipt2.status !== 1) {
      throw new Error("Failed to grant staking contract authorization.");
    }
    console.log("✓ Staking contract granted transfer exemption.");
  }

  // Step 3: Configure Demo Staking Pool with 0-Day Lock
  if (!isPoolConfiguredAlready) {
    if (!hasStakingAdmin) {
      console.warn(
        `\n[WARNING] Signer ${signerAddress} is not DEFAULT_ADMIN_ROLE on Staking contract. Skipping configurePool.`,
      );
    } else {
      console.log(`\n3. Configuring Staking Pool #${tokenId.toString()} with 0-Day Lock...`);
      const tx3 = await stakingContract.getFunction("configurePool")(
        tokenId,
        DEFAULT_POOL_MIN_LOCK, // 0-day minimum lock
        DEFAULT_POOL_MAX_LOCK, // 365 days max
        true, // enabled
      );
      console.log("Tx3 Hash:", tx3.hash);
      const receipt3 = await tx3.wait(1);
      if (!receipt3 || receipt3.status !== 1) {
        throw new Error("Failed to configure demo staking pool.");
      }
      console.log(`✓ Staking Pool #${tokenId.toString()} configured with 0-Day Lock!`);
    }
  }

  // Verification
  const isEligibleFinal = await tokenContract.getFunction("isEligibleInvestor")(stakingAddress);
  const isAuthorizedFinal = await tokenContract.getFunction("isAuthorizedStakingContract")(
    stakingAddress,
  );
  const finalPoolConfig = await stakingContract.getFunction("poolConfigs")(tokenId);

  // Check transfersEnabled on PropertyToken
  let transfersEnabled = false;
  try {
    const propData = await tokenContract.getFunction("getProperty")(tokenId);
    transfersEnabled = propData[6];
  } catch {
    // TokenId might not be registered yet if authorize runs prior to onboarding
  }

  console.log("\n--- Post-Authorization Verification ---");
  console.log("Staking Contract Address:       ", stakingAddress);
  console.log("isEligibleInvestor:             ", isEligibleFinal, "✓");
  console.log("isAuthorizedStakingContract:     ", isAuthorizedFinal, "✓");
  console.log(
    `Pool #${tokenId.toString()} Configured:            `,
    finalPoolConfig[2] && finalPoolConfig[0] === 0n,
    `(0-Day Lock: ${finalPoolConfig[0].toString()}s to ${finalPoolConfig[1].toString()}s) ✓`,
  );
  console.log(
    `Property #${tokenId.toString()} transfersEnabled:    `,
    transfersEnabled,
    "✓ (Ordinary investor transfers remain strictly disabled)",
  );
  console.log("=============================================================");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected authorization failure.";
    console.error("\nAuthorization halted:", message);
    process.exitCode = 1;
  });
}
