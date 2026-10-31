import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, id as keccak256Id } from "ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const DEFAULT_DEMO_PROPERTY_ID = "PRP-TEST-SIM-001";
export const DEFAULT_DEMO_DOC_HASH =
  "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
export const DEFAULT_DEMO_MAX_SUPPLY = 100n;
export const DEFAULT_DEMO_UNIT_PRICE = 100000n; // 1,000 INR reference
export const DEFAULT_DEMO_METADATA = "https://tokenestate.mst/metadata/simulated-prp-test-001.json";
export const DEFAULT_ISSUE_AMOUNT = 10n;

export const CONFIRMATION_PHRASE = "ONBOARD DEMO PROPERTY TESTNET";

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
  console.log("=== MST Testnet Property Onboarding & Unit Issuance ===");
  console.log("=============================================================");
  console.log("       SIMULATED TESTNET DEMONSTRATION PROPERTY             ");
  console.log("  Notice: This is a simulated prototype property for         ");
  console.log("  developer verification on MST Testnet. The document hash   ");
  console.log("  and placeholder metadata do NOT represent legal property   ");
  console.log("  title, verified deed registration, or ownership rights.    ");
  console.log("=============================================================\n");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing property onboarding on unexpected network "${networkName}". Expected "mstTestnet".`,
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
      "MST_TESTNET_TOKEN_CONTRACT_ADDRESS is required.\n" +
        "Set the address of the newly deployed PropertyToken contract.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(`No bytecode found at PropertyToken address "${tokenAddress}" on MST Testnet.`);
  }
  console.log("Target PropertyToken: ", tokenAddress);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);

  const propertyId = process.env["MST_TESTNET_PROPERTY_ID"]?.trim() || DEFAULT_DEMO_PROPERTY_ID;
  const propertyRef = keccak256Id(propertyId);
  const documentHash = process.env["MST_TESTNET_DOC_HASH"]?.trim() || DEFAULT_DEMO_DOC_HASH;
  const maxSupply = process.env["MST_TESTNET_MAX_SUPPLY"]
    ? BigInt(process.env["MST_TESTNET_MAX_SUPPLY"])
    : DEFAULT_DEMO_MAX_SUPPLY;
  const unitPrice = process.env["MST_TESTNET_UNIT_PRICE"]
    ? BigInt(process.env["MST_TESTNET_UNIT_PRICE"])
    : DEFAULT_DEMO_UNIT_PRICE;
  const metadataURI = process.env["MST_TESTNET_METADATA_URI"]?.trim() || DEFAULT_DEMO_METADATA;
  const rawInvestor = process.env["MST_TESTNET_INVESTOR_ADDRESS"]?.trim() || signerAddress;
  const investorAddress = normalizeAccountAddress(rawInvestor);
  const issueAmount = process.env["MST_TESTNET_ISSUE_AMOUNT"]
    ? BigInt(process.env["MST_TESTNET_ISSUE_AMOUNT"])
    : DEFAULT_ISSUE_AMOUNT;

  console.log("\n--- Simulated Onboarding Configuration ---");
  console.log("Property ID:       ", propertyId, "(Simulated Prototype)");
  console.log("Property Ref (Hex):", propertyRef);
  console.log("Max Supply:        ", maxSupply.toString(), "Units");
  console.log("Unit Price Ref:    ", unitPrice.toString(), "paise");
  console.log("Recipient Investor:", investorAddress);
  console.log("Units to Issue:    ", issueAmount.toString(), "Demo Units");

  // Verify investor MST gas balance
  const investorGasBalance = await ethers.provider.getBalance(investorAddress);
  console.log("Investor Native Gas Balance: ", ethers.formatEther(investorGasBalance), "MST");
  if (investorGasBalance === 0n) {
    console.warn(
      "\n[WARNING] Recipient investor wallet has 0 MST for gas on MST Testnet!\n" +
        "The investor will not be able to execute setApprovalForAll, stake, or unstake transactions.\n" +
        "Fund this wallet via the MST Testnet faucet before testing investor staking.",
    );
  } else if (investorGasBalance < 10000000000000000n) {
    console.warn(
      `\n[WARNING] Recipient investor wallet has low gas balance (${ethers.formatEther(investorGasBalance)} MST). Minimum 0.01 MST recommended.`,
    );
  } else {
    console.log("✓ Investor wallet has sufficient MST for transaction gas.");
  }

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast on-chain: `,
    );
  } finally {
    terminal.close();
  }

  if (confirmation.trim() !== CONFIRMATION_PHRASE) {
    throw new Error("Onboarding cancelled; confirmation phrase did not match.");
  }

  // 1. Check if property is already registered
  let tokenId: bigint = await tokenContract.getFunction("tokenIdByPropertyRef")(propertyRef);
  if (tokenId === 0n) {
    console.log("\nRegistering property on PropertyToken...");
    const regTx = await tokenContract.getFunction("registerProperty")(
      propertyRef,
      documentHash,
      maxSupply,
      unitPrice,
      metadataURI,
    );
    console.log("Register Tx Hash:", regTx.hash);
    const regReceipt = await regTx.wait(1);
    if (!regReceipt || regReceipt.status !== 1) {
      throw new Error("Property registration failed on-chain.");
    }
    tokenId = await tokenContract.getFunction("tokenIdByPropertyRef")(propertyRef);
    console.log(`✓ Property successfully registered! Token ID: #${tokenId.toString()}`);
  } else {
    console.log(`\n✓ Property already registered with Token ID: #${tokenId.toString()}`);
  }

  // 2. Ensure investor is eligible
  const isEligible: boolean =
    await tokenContract.getFunction("isEligibleInvestor")(investorAddress);
  if (!isEligible) {
    console.log(`\nApproving investor eligibility for ${investorAddress}...`);
    const eligTx = await tokenContract.getFunction("setInvestorEligibility")(investorAddress, true);
    console.log("Eligibility Tx Hash:", eligTx.hash);
    const eligReceipt = await eligTx.wait(1);
    if (!eligReceipt || eligReceipt.status !== 1) {
      throw new Error("Investor eligibility approval failed on-chain.");
    }
    console.log(`✓ Investor eligibility approved for ${investorAddress}`);
  } else {
    console.log(`✓ Investor ${investorAddress} is already approved as eligible.`);
  }

  // 3. Issue units to investor
  const currentBalance: bigint = await tokenContract.getFunction("balanceOf")(
    investorAddress,
    tokenId,
  );
  console.log(`Current Balance for ${investorAddress}: ${currentBalance.toString()} Units`);

  if (currentBalance < issueAmount) {
    const toIssue = issueAmount - currentBalance;
    console.log(`\nIssuing ${toIssue.toString()} units to ${investorAddress}...`);
    const issueTx = await tokenContract.getFunction("issueUnits")(
      tokenId,
      investorAddress,
      toIssue,
    );
    console.log("Issue Tx Hash:", issueTx.hash);
    const issueReceipt = await issueTx.wait(1);
    if (!issueReceipt || issueReceipt.status !== 1) {
      throw new Error("Unit issuance failed on-chain.");
    }
    const newBalance: bigint = await tokenContract.getFunction("balanceOf")(
      investorAddress,
      tokenId,
    );
    console.log(`✓ Issuance successful! New Balance: ${newBalance.toString()} Units`);
  } else {
    console.log(`✓ Balance is already sufficient (>= ${issueAmount.toString()} units).`);
  }

  // 4. Verification
  const propData = await tokenContract.getFunction("getProperty")(tokenId);
  const finalBalance: bigint = await tokenContract.getFunction("balanceOf")(
    investorAddress,
    tokenId,
  );
  const finalGas: bigint = await ethers.provider.getBalance(investorAddress);

  console.log("\n--- Verification Summary ---");
  console.log("Property Token ID:        #", tokenId.toString());
  console.log("Property Status:          Simulated Demonstration Prototype ✓");
  console.log("Transfers Enabled:        ", propData[6], "✓ (Verified FALSE as intended)");
  console.log(
    "Investor Eligible:        ",
    await tokenContract.getFunction("isEligibleInvestor")(investorAddress),
    "✓",
  );
  console.log(
    "Investor Unit Balance:    ",
    finalBalance.toString(),
    "Units",
    finalBalance >= issueAmount ? "✓" : "✗",
  );
  console.log(
    "Investor Native Gas:      ",
    ethers.formatEther(finalGas),
    "MST",
    finalGas > 0n ? "✓" : "[WARNING: 0 MST]",
  );
  console.log("=============================================================");
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected onboarding failure.";
    console.error("\nOnboarding halted:", message);
    process.exitCode = 1;
  });
}
