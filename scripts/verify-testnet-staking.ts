import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const RECOMMENDED_MIN_GAS_MST = 10000000000000000n; // 0.01 MST

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
  console.log("=== MST Testnet Staking Readiness & Safeguards Verification ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing verification on unexpected network "${networkName}". Expected "mstTestnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateTestnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Testnet chain ID ${TESTNET_CHAIN_ID.toString()}.`,
    );
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = signer ? await signer.getAddress() : undefined;

  console.log("Connected Network: MST Testnet (Chain ID 91562037)");
  console.log("Signer / Runner:   ", signerAddress || "(No signer configured)");

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

  const rawInvestor = process.env["MST_TESTNET_INVESTOR_ADDRESS"]?.trim() || signerAddress;
  if (!rawInvestor) {
    throw new Error(
      "Investor address is required. Set MST_TESTNET_INVESTOR_ADDRESS or configure a signer.",
    );
  }
  const investorAddress = normalizeAccountAddress(rawInvestor);

  const rawTokenId = process.env["MST_TESTNET_TOKEN_ID"]?.trim();
  const tokenId = rawTokenId ? BigInt(rawTokenId) : DEFAULT_DEMO_TOKEN_ID;

  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(`No bytecode found at PropertyToken address "${tokenAddress}".`);
  }

  const stakingCode = await ethers.provider.getCode(stakingAddress);
  if (stakingCode === "0x") {
    throw new Error(`No bytecode found at PropertyTokenStaking address "${stakingAddress}".`);
  }

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress);
  const stakingContract = await ethers.getContractAt("PropertyTokenStaking", stakingAddress);

  console.log("\n-------------------------------------------------------------");
  console.log("                    VERIFICATION REPORT                      ");
  console.log("-------------------------------------------------------------");

  // 1. Property Token & Registration
  let propertyFound = false;
  let transfersEnabled = true;
  try {
    const prop = await tokenContract.getFunction("getProperty")(tokenId);
    propertyFound = true;
    transfersEnabled = prop[6];
  } catch {
    propertyFound = false;
  }

  console.log(
    `1. Property #${tokenId.toString()} Registered:          `,
    propertyFound ? "YES [PASS]" : "NO [FAIL]",
  );
  console.log(
    `2. Ordinary Transfers Disabled:        `,
    !transfersEnabled ? "YES (transfersEnabled == false) [PASS]" : "NO [FAIL]",
  );

  // 2. Investor Eligibility & Balance
  const isInvestorEligible: boolean =
    await tokenContract.getFunction("isEligibleInvestor")(investorAddress);
  const investorUnits: bigint = await tokenContract.getFunction("balanceOf")(
    investorAddress,
    tokenId,
  );
  const investorGas: bigint = await ethers.provider.getBalance(investorAddress);
  const isApproved: boolean = await tokenContract.getFunction("isApprovedForAll")(
    investorAddress,
    stakingAddress,
  );

  console.log(
    `3. Investor Whitelisted (KYC):        `,
    isInvestorEligible ? "YES [PASS]" : "NO [FAIL]",
  );
  console.log(
    `4. Investor Demo Units Balance:        `,
    `${investorUnits.toString()} Units`,
    investorUnits >= 10n ? "[PASS]" : "[FAIL: Expected >= 10]",
  );
  console.log(
    `5. Investor Native MST Gas Balance:    `,
    `${formatEther(investorGas)} MST`,
    investorGas >= RECOMMENDED_MIN_GAS_MST
      ? "[PASS]"
      : investorGas > 0n
        ? "[WARN: Low Gas]"
        : "[FAIL: 0 MST]",
  );
  console.log(
    `6. Investor Staking Operator Approval: `,
    isApproved ? "APPROVED [READY TO STAKE]" : "NOT APPROVED (Requires setApprovalForAll)",
  );

  // 3. Staking Contract Whitelist & Exemption
  const isStakingEligible: boolean =
    await tokenContract.getFunction("isEligibleInvestor")(stakingAddress);
  const isStakingAuthorized: boolean = await tokenContract.getFunction(
    "isAuthorizedStakingContract",
  )(stakingAddress);

  console.log(
    `7. Staking Eligible Investor:          `,
    isStakingEligible ? "YES [PASS]" : "NO [FAIL]",
  );
  console.log(
    `8. Staking Exemption Authorized:       `,
    isStakingAuthorized ? "YES [PASS]" : "NO [FAIL]",
  );

  // 4. Staking Pool 0-Day Lock
  const poolConfig = await stakingContract.getFunction("poolConfigs")(tokenId);
  const minLock: bigint = poolConfig[0];
  const maxLock: bigint = poolConfig[1];
  const isEnabled: boolean = poolConfig[2];
  const isZeroLockReady = isEnabled && minLock === 0n;

  console.log(
    `9. Pool #${tokenId.toString()} 0-Day Lock Enabled:        `,
    isZeroLockReady
      ? `YES (minLock: ${minLock.toString()}s, maxLock: ${maxLock.toString()}s) [PASS]`
      : `NO (isEnabled: ${isEnabled}, minLock: ${minLock.toString()}s) [FAIL]`,
  );

  console.log("-------------------------------------------------------------");

  const allPassed =
    propertyFound &&
    !transfersEnabled &&
    isInvestorEligible &&
    investorUnits >= 10n &&
    investorGas > 0n &&
    isStakingEligible &&
    isStakingAuthorized &&
    isZeroLockReady;

  if (allPassed) {
    console.log("✓ ALL SAFEGUARDS & PREREQUISITES VERIFIED!");
    console.log(
      "The demo investor can now approve, stake 10 units with 0-day lock, and unstake immediately.",
    );
  } else {
    console.warn(
      "! SOME CHECKS DID NOT PASS. Review the failures above before attempting demo operations.",
    );
  }
  console.log("=============================================================\n");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected verification failure.";
    console.error("\nVerification halted:", message);
    process.exitCode = 1;
  });
}
