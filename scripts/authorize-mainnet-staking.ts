import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const CONFIRMATION_PHRASE = "AUTHORIZE STAKING MAINNET";
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const DEFAULT_POOL_MIN_LOCK = 0n; // 0 seconds = flexible / instant demonstration
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

async function main() {
  console.log("=== MST Mainnet Compliance Staking Authorization & Pool Setup ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing compliance authorization on unexpected network "${networkName}". Expected "mstMainnet".`,
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
  console.log("Signer Address:   ", signerAddress);

  const rawTokenAddress =
    process.env["MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim();
  const rawStakingAddress =
    process.env["MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress || !rawStakingAddress) {
    throw new Error(
      "Both MST_MAINNET_TOKEN_CONTRACT_ADDRESS and MST_MAINNET_STAKING_CONTRACT_ADDRESS are required.",
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

  const rawTokenId = process.env["MST_MAINNET_TOKEN_ID"]?.trim();
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

  // 3. Check Staking Contract pool configuration (0-Day Lock)
  const stakingAdminRole = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const hasStakingAdmin = await stakingContract.getFunction("hasRole")(
    stakingAdminRole,
    signerAddress,
  );

  const poolConfig = await stakingContract.getFunction("poolConfigs")(tokenId);
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
    console.log("\n✓ Staking contract is already fully authorized on MST Mainnet!");
    return;
  }

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast compliance authorization on MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (confirmation.trim() !== CONFIRMATION_PHRASE) {
    throw new Error("Authorization cancelled; confirmation phrase did not match.");
  }

  // 1. Whitelist staking contract as eligible investor
  if (!isEligibleAlready) {
    console.log(`\n1/3: Calling setInvestorEligibility("${stakingAddress}", true)...`);
    const tx1 = await tokenContract.getFunction("setInvestorEligibility")(stakingAddress, true);
    console.log("Tx Hash:", tx1.hash);
    const r1 = await tx1.wait(1);
    if (!r1 || r1.status !== 1) throw new Error("setInvestorEligibility failed.");
    console.log("✓ Staking contract approved as eligible investor.");
  }

  // 2. Authorize staking contract transfer exemption
  if (!isAuthorizedAlready) {
    console.log(`\n2/3: Calling setStakingContractAuthorization("${stakingAddress}", true)...`);
    const tx2 = await tokenContract.getFunction("setStakingContractAuthorization")(
      stakingAddress,
      true,
    );
    console.log("Tx Hash:", tx2.hash);
    const r2 = await tx2.wait(1);
    if (!r2 || r2.status !== 1) throw new Error("setStakingContractAuthorization failed.");
    console.log("✓ Staking contract granted custody transfer exemption.");
  }

  // 3. Configure staking pool (0-day flexible lock)
  if (!isPoolConfiguredAlready) {
    if (!hasStakingAdmin) {
      console.warn(
        `\n[WARNING] Signer ${signerAddress} does not have DEFAULT_ADMIN_ROLE on Staking contract. Skipping configurePool().`,
      );
    } else {
      console.log(
        `\n3/3: Configuring Pool #${tokenId.toString()} (minLock=0, maxLock=365 days, enabled=true)...`,
      );
      const tx3 = await stakingContract.getFunction("configurePool")(
        tokenId,
        DEFAULT_POOL_MIN_LOCK,
        DEFAULT_POOL_MAX_LOCK,
        true,
      );
      console.log("Tx Hash:", tx3.hash);
      const r3 = await tx3.wait(1);
      if (!r3 || r3.status !== 1) throw new Error("configurePool failed.");
      console.log(`✓ Pool #${tokenId.toString()} successfully configured with 0-Day lock.`);
    }
  }

  // Final verification
  const prop = await tokenContract.getFunction("getProperty")(tokenId);
  const finalEligible = await tokenContract.getFunction("isEligibleInvestor")(stakingAddress);
  const finalAuth = await tokenContract.getFunction("isAuthorizedStakingContract")(stakingAddress);
  const finalPool = await stakingContract.getFunction("poolConfigs")(tokenId);

  console.log("\n=== Mainnet Authorization Verified ===");
  console.log("Property Token ID:        #", tokenId.toString());
  console.log("Property transfersEnabled:", prop[6], "✓ (Ordinary transfers remain DISABLED)");
  console.log("Staking Whitelisted:     ", finalEligible, "✓");
  console.log("Staking Exemption Active: ", finalAuth, "✓");
  console.log("Pool Enabled:             ", finalPool[2], "✓");
  console.log("Pool Min Lock Duration:   ", finalPool[0].toString(), "seconds (0 Days) ✓");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected authorization error.";
    console.error("\n[AUTHORIZATION FAILED]", message);
    process.exitCode = 1;
  });
}
